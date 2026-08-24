// Regression using the user's real Garden Creek Apartments (GCA) lease
// files for units A309, C101, and C301 -- reported as: "the signatures are
// saying that they didnt sign them when they did." Two distinct real bugs
// were found and fixed:
//
// 1. A309 and C101 (single-resident leases): the printed blank underline
//    beneath "Signatures of All Residents" decodes, on this document, as a
//    repeated control character (not real text) -- see
//    test_signature_line_hack.cjs for the isolated mechanism test. The
//    ink-detection mask was treating that decorative line the same as real
//    printed text, using generous padding that fully covered a genuine
//    hand-drawn signature written just above it.
// 2. C301 (a business/company resident, "Gage Construction, LLC"): the
//    resident-name splitter was breaking the entity name apart at its own
//    comma ("Gage Construction" / "LLC") as if they were two co-residents,
//    so the tool went looking for a second person's signature that could
//    never exist.
//
// This test uses the actual PDFs (renamed, contents unchanged) pulled from
// the user's real GCA export, run through the full parse pipeline -- not a
// synthetic reconstruction -- so it can't drift from what real signed
// leases actually look like.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  // Direct unit-level checks on splitResidentNames covering the general
  // "business entity" fix (not just the exact real Gage Construction case),
  // plus confirming existing non-business behavior (real co-residents,
  // "Last, First" formatting) still works unchanged.
  const splitCases = await page.evaluate(() => {
    return {
      simpleCompanyLLC: splitResidentNames('Gage Construction, LLC'),
      companyIncWithPeriod: splitResidentNames('Smith Properties, Inc.'),
      companyCorp: splitResidentNames('Riverside Holdings, Corp'),
      companyWithInternalComma: splitResidentNames('Smith, Jones & Associates, LLC'),
      noCommaCompany: splitResidentNames('Acme Rentals LLC'),
      lastFirstPerson: splitResidentNames('Doe, John'),
      twoRealCoResidents: splitResidentNames('John Smith, Jane Doe'),
      andJoinedCoResidents: splitResidentNames('Joshua Maldonado and Angela Sanchez'),
    };
  });
  console.log('=== splitResidentNames checks ===');
  console.log(JSON.stringify(splitCases, null, 2));
  const splitChecks = [
    ['"Gage Construction, LLC" stays one entity', JSON.stringify(splitCases.simpleCompanyLLC) === JSON.stringify(['Gage Construction, LLC'])],
    ['"Smith Properties, Inc." stays one entity', JSON.stringify(splitCases.companyIncWithPeriod) === JSON.stringify(['Smith Properties, Inc.'])],
    ['"Riverside Holdings, Corp" stays one entity', JSON.stringify(splitCases.companyCorp) === JSON.stringify(['Riverside Holdings, Corp'])],
    ['"Smith, Jones & Associates, LLC" (3 comma parts) stays one entity', JSON.stringify(splitCases.companyWithInternalComma) === JSON.stringify(['Smith, Jones & Associates, LLC'])],
    ['"Acme Rentals LLC" (no comma) was already one entity, still is', JSON.stringify(splitCases.noCommaCompany) === JSON.stringify(['Acme Rentals LLC'])],
    ['"Doe, John" (Last, First) still reverses to "John Doe" -- unaffected by the entity fix', JSON.stringify(splitCases.lastFirstPerson) === JSON.stringify(['John Doe'])],
    ['"John Smith, Jane Doe" still splits into two real co-residents', JSON.stringify(splitCases.twoRealCoResidents) === JSON.stringify(['John Smith','Jane Doe'])],
    ['"X and Y" still splits on "and" into two co-residents', JSON.stringify(splitCases.andJoinedCoResidents) === JSON.stringify(['Joshua Maldonado','Angela Sanchez'])],
  ];

  const files = ['A309_v1.pdf', 'A309_v2.pdf', 'C101.pdf', 'C301.pdf'];
  const results = {};
  for (const f of files){
    await page.setInputFiles('#lease-files', [path.resolve('./gca_test/' + f)]);
    const r = await page.evaluate(async () => {
      const file = document.getElementById('lease-files').files[0];
      const res = await parseLeasePdf(file);
      const v = res.verification;
      return {
        unit: res.unit,
        residentsRaw: v.residentsRaw,
        complete: computeSignaturesComplete(v),
        rowResidentCount: v.signatureFindings.filter(x => x.kind === 'row-resident' && x.page === 7).length,
        missing: v.signatureFindings.filter(x => !x.present).map(x => ({ page: x.page, kind: x.kind, signer: x.signer })),
      };
    });
    results[f] = r;
  }

  console.log(JSON.stringify(results, null, 2));

  const checks = [
    ['A309 (v1, the "not signed" copy the user actually uploaded) unit detected correctly', results['A309_v1.pdf'].unit === 'A309'],
    ['A309 v1: all signatures now detected as present', results['A309_v1.pdf'].complete === true],
    ['A309 v1: nothing left in the missing list', results['A309_v1.pdf'].missing.length === 0],
    ['A309 v2 (the alternate copy): also fully signed', results['A309_v2.pdf'].complete === true],
    ['C101: unit detected correctly', results['C101.pdf'].unit === 'C101'],
    ['C101: all signatures now detected as present', results['C101.pdf'].complete === true],
    ['C301: unit detected correctly', results['C301.pdf'].unit === 'C301'],
    ['C301: resident name kept as one entity ("Gage Construction, LLC"), not split at its own comma', results['C301.pdf'].residentsRaw === 'Gage Construction, LLC'],
    ['C301: only ONE row-resident signature line expected (the entity, not "Gage Construction" + "LLC" as two people)', results['C301.pdf'].rowResidentCount === 1],
    ['C301: all signatures now detected as present', results['C301.pdf'].complete === true],
    ['C301: nothing left in the missing list', results['C301.pdf'].missing.length === 0],
    ...splitChecks,
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
