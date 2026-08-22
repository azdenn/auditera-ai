// The one that matters most: uploading a ledgers ZIP + a leases ZIP + the
// rent roll must produce exactly the same findings as picking those same
// ledgers and leases individually. The ZIP path is only allowed to change
// HOW the files get in -- not what the tool concludes about them.
//
// Same documents both ways:
//   ledgers: Ledger_A109_badcharges.xlsx (real; its recurring-charge findings
//            went away when that audit was removed from the tool, but its
//            A109 lease still disagrees with the rent roll on the rent)
//            Ledger_A110_6wk.xlsx (real, has a concession)
//   leases:  two generated A109 leases (one expired, one currently in
//            effect) whose "Apartment No." field reads A109 exactly, so the
//            individual path -- which keys leases off that field alone --
//            files them under the same unit the ZIP path resolves them to.
// Everything is compared except the filenames themselves, which necessarily
// differ (a ZIP entry carries its path).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { writeZip, read, makeLeasePdfs } = require('./zip_fixtures.cjs');

const HERE = __dirname;
const LEASE_A = '/tmp/eq_A109_expired.pdf';
const LEASE_B = '/tmp/eq_A109_current.pdf';
const LEDGER_ZIP = '/tmp/eq_ledgers.zip';
const LEASE_ZIP = '/tmp/eq_leases.zip';

// The folder prefixes a ZIP entry carries and the document names common to
// both runs -- stripped before comparing, since "which file did this come
// from" is the one thing that legitimately differs between the two paths.
const SCRUB = {
  prefixes: ['Ledgers/', 'A110/', 'A109/Signed Lease Documents/'],
  names: ['Ledger_A109_badcharges.xlsx', 'Ledger_A110_6wk.xlsx', 'eq_A109_expired.pdf', 'eq_A109_current.pdf'],
};

const PROJECT = (opts) => {
  // Serialized in the page: everything the user actually sees about a unit,
  // minus the filenames (which are zip paths in one run and plain names in
  // the other).
  const scrub = s => {
    let out = String(s == null ? '' : s);
    for (const p of opts.prefixes) out = out.split(p).join('');
    for (const n of opts.names) out = out.split(n).join('FILE');
    return out;
  };
  return unitEntries.map(e => ({
    unit: e.unit, key: e.unitKey, cat: e.category,
    // CHANGED BY SPEC: entry.hiddenProblemCount is gone with Option Filters.
    problemCount: e.problemCount || 0,
    rent: e.monthlyBaseRent == null ? null : e.monthlyBaseRent,
    leaseMissing: !!e.leaseMissing, residents: e.residents || null,
    fileCount: (e.filenames || []).length, leaseCount: (e.leaseFilenames || []).length,
    concession: e.concession ? {
      has: !!e.concession.hasConcession,
      issues: (e.concession.issues || []).map(i => i.severity + '|' + i.text),
      label: e.concession.details && e.concession.details.label ? e.concession.details.label : null,
    } : null,
    // CHANGED BY SPEC: was chargeCell (chargeCellState) + rentMismatch. The
    // lease-vs-rent-roll rent CHECK was removed from this tool along with the
    // "Rent" column it drove, so chargeCellState() and entry.rentMismatch no
    // longer exist. What survives is entry.rentDisagrees -- a note on the
    // "Monthly rent used for the math" fact tile saying the two documents
    // disagree and which one won. That is projected here instead, plus the
    // Move-in discount column's rendered state, so both upload paths still
    // have to agree about the rent AND about every column on screen.
    concessionCell: concessionCellState(e),
    rentDisagrees: e.rentDisagrees ? {
      leaseRent: e.rentDisagrees.leaseRent == null ? null : e.rentDisagrees.leaseRent,
      rentRollRent: e.rentDisagrees.rentRollRent == null ? null : e.rentDisagrees.rentRollRent,
    } : null,
    summary: scrub(summaryFor(e)),
    detail: scrub(buildDetail(e)),
    note: scrub(e.note),
    pickReason: scrub(e.leasePickReason),
  })).sort((a, b) => String(a.key).localeCompare(String(b.key)));
};

(async () => {
  // Two leases for A109: one that ended last year, one that covers today.
  const y = new Date().getFullYear();
  const [expired, current] = await makeLeasePdfs([
    {unit:'A109', rent:1100, startRaw:`1/1/${y-2}`, endRaw:`12/31/${y-1}`, resident:'Joshua Maldonado'},
    {unit:'A109', rent:1250, startRaw:`1/1/${y}`, endRaw:`12/31/${y+1}`, resident:'Joshua Maldonado'},
  ]);
  fs.writeFileSync(LEASE_A, Buffer.from(expired));
  fs.writeFileSync(LEASE_B, Buffer.from(current));

  writeZip(LEDGER_ZIP, {
    'Ledgers/Ledger_A109_badcharges.xlsx': read(path.join(HERE, 'Ledger_A109_badcharges.xlsx')),
    'A110/Ledger_A110_6wk.xlsx': read(path.join(HERE, 'Ledger_A110_6wk.xlsx')),
  });
  writeZip(LEASE_ZIP, {
    'A109/Signed Lease Documents/eq_A109_expired.pdf': read(LEASE_A),
    'A109/Signed Lease Documents/eq_A109_current.pdf': read(LEASE_B),
  });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ---------- Run 1: individual files (today's behaviour, untouched) ----------
  await page.setInputFiles('#ledger-files', [path.join(HERE, 'Ledger_A109_badcharges.xlsx'), path.join(HERE, 'Ledger_A110_6wk.xlsx')]);
  await page.setInputFiles('#lease-files', [LEASE_A, LEASE_B]);
  await page.setInputFiles('#rentroll-file', path.join(HERE, 'RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 180000});
  await page.waitForTimeout(200);
  const individual = await page.evaluate(PROJECT, SCRUB);
  const individualMeta = await page.evaluate(() => ({
    leaseKeys: [...cachedLeaseByUnit.keys()], ledgerKeys: [...cachedLedgerByUnit.keys()],
    failed: (cachedLedgerFailed||[]).length + (cachedLeaseFailed||[]).length,
    zipSummaryHidden: document.getElementById('zip-summary').classList.contains('hidden'),
  }));

  // ---------- Run 2: same documents, as two ZIPs ----------
  await page.reload();
  await page.evaluate(() => setUploadMode('zip'));  // chips are hidden now; the prompt is the user path (test_concession_zip_ui.cjs)
  await page.setInputFiles('#ledger-zip-file', LEDGER_ZIP);
  await page.setInputFiles('#lease-zip-file', LEASE_ZIP);
  await page.setInputFiles('#rentroll-file', path.join(HERE, 'RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 180000});
  await page.waitForTimeout(200);
  const zipped = await page.evaluate(PROJECT, SCRUB);
  const zipMeta = await page.evaluate(() => ({
    leaseKeys: [...cachedLeaseByUnit.keys()], ledgerKeys: [...cachedLedgerByUnit.keys()],
    failed: (cachedLedgerFailed||[]).length + (cachedLeaseFailed||[]).length,
    summary: document.getElementById('zip-summary').textContent,
  }));

  // ---------- Run 3: back to individual mode -- must still work ----------
  await page.evaluate(() => setUploadMode('individual'));
  await page.setInputFiles('#ledger-files', [path.join(HERE, 'Ledger_A109_badcharges.xlsx'), path.join(HERE, 'Ledger_A110_6wk.xlsx')]);
  await page.setInputFiles('#lease-files', [LEASE_A, LEASE_B]);
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 180000});
  await page.waitForTimeout(200);
  const backToIndividual = await page.evaluate(PROJECT, SCRUB);
  const backMeta = await page.evaluate(() => ({
    ledgerFiles: cachedLedgerByUnit.size,
    filenames: [...cachedLedgerByUnit.values()].flat().map(g => g.filename),
    zipSummaryHidden: document.getElementById('zip-summary').classList.contains('hidden'),
    individualDropVisible: !document.getElementById('drop-ledger').classList.contains('hidden'),
    zipDropHidden: document.getElementById('drop-ledger-zip').classList.contains('hidden'),
  }));

  const diffs = [];
  const maxLen = Math.max(individual.length, zipped.length);
  for (let i = 0; i < maxLen; i++){
    const a = JSON.stringify(individual[i] || null), b = JSON.stringify(zipped[i] || null);
    if (a !== b) diffs.push({i, individual: individual[i], zip: zipped[i]});
  }
  if (diffs.length) console.log('=== DIFFS ===', JSON.stringify(diffs, null, 1).slice(0, 4000));

  const a109 = individual.find(e => e.unit === 'A109');
  const a110 = individual.find(e => e.unit === 'A110');
  console.log('=== individual A109 ===', JSON.stringify(a109, null, 1).slice(0, 1200));
  console.log('=== meta ===', JSON.stringify({individualMeta, zipMeta, backMeta}, null, 1));

  const checks = [
    // CHANGED BY SPEC: the A109 leases these fixtures generate say $1,250
    // while the rent roll says $1,215. That used to make A109 a flagged unit
    // (cat 'issue', one problem, chargeCell 'mismatch') via the
    // lease-vs-rent-roll rent check. That check was removed from this tool:
    // the tool checks concessions only, and a rent disagreement is a fact
    // about the inputs, not a finding. So A109 is now clean, and the
    // disagreement surfaces as entry.rentDisagrees plus a note on the rent
    // fact tile in its detail panel. Both upload paths still have to agree
    // about it, which is the point of this test -- the assertion is re-pointed,
    // not weakened: it still pins both dollar figures and still requires the
    // note to be rendered.
    ['Individual run carries the A109 rent disagreement as a fact-tile note (lease $1,250 vs rent roll $1,215), not as a finding',
      !!a109 && a109.cat === 'clean' && a109.problemCount === 0
      && !!a109.rentDisagrees && a109.rentDisagrees.leaseRent === 1250 && a109.rentDisagrees.rentRollRent === 1215
      && /Monthly rent used for the math/.test(a109.detail)
      && /The rent roll shows \$1,215\.00 — the lease is the binding document, so its figure is used\./.test(a109.detail)],
    // A110's concession is the other real finding compared across both paths.
    ['Individual run also flags A110\'s concession', !!a110 && a110.cat === 'issue' && a110.concession.issues.some(i => i.startsWith('bad|'))],
    ['Individual run picked the currently-in-effect lease for A109 ($1250, not the expired $1100)', !!a109 && a109.rent === 1250],
    ['Individual run also has a unit with a concession to compare (A110)', !!a110 && a110.concession.has === true],
    ['Both runs produced the same number of unit entries', individual.length === zipped.length],
    ['Every unit entry is identical between individual upload and ZIP upload (category, amounts, every issue line, the rendered detail)', diffs.length === 0],
    ['Neither run had any unreadable files', individualMeta.failed === 0 && zipMeta.failed === 0],
    ['ZIP run resolved leases to the same unit keys as the individual run', JSON.stringify(individualMeta.leaseKeys.slice().sort()) === JSON.stringify(zipMeta.leaseKeys.slice().sort())],
    ['ZIP run resolved ledgers to the same unit keys as the individual run', JSON.stringify(individualMeta.ledgerKeys.slice().sort()) === JSON.stringify(zipMeta.ledgerKeys.slice().sort())],
    ['ZIP run reported what it read', /Ledgers ZIP:/.test(zipMeta.summary) && /Leases ZIP:/.test(zipMeta.summary)],
    ['Individual run shows no ZIP summary at all', individualMeta.zipSummaryHidden === true],
    ['Switching back to individual mode still works: same results as the first individual run', JSON.stringify(backToIndividual) === JSON.stringify(individual)],
    ['Switching back to individual mode uses the individually-picked files, not the still-loaded ZIPs', backMeta.filenames.every(f => !f.includes('/')) && backMeta.filenames.length === 2],
    ['Switching back to individual mode restores the individual drop zones and clears the ZIP summary', backMeta.individualDropVisible === true && backMeta.zipDropHidden === true && backMeta.zipSummaryHidden === true],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks){
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
