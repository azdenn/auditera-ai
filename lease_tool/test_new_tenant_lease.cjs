// Regression for a real property (unit A109): a new resident moved in a
// couple of days ago and is already on the Rent Roll, but her own signed
// lease hasn't been uploaded yet. The unit's document folder still has the
// PREVIOUS tenant's lease sitting in it (completely normal -- ResMan/manual
// exports don't delete old files), and by unit number alone that's the only
// candidate lease found. Before this fix, the tool picked it anyway and
// reconciled the new resident's Rent Roll charges against a total stranger's
// lease -- producing a wall of meaningless "mismatches" (wrong rent, wrong
// dates, wrong deposit -- all wrong purely because it's the wrong person)
// that buried the one true fact: nobody has uploaded this resident's lease.
//
// Fix: before reconciling, confirm the Rent Roll's current resident actually
// appears somewhere on the lease found for that unit. If NONE of the current
// resident(s) are found on it at all (both sides confidently read), treat it
// like no lease is on file -- but as its own distinct category ("new-tenant")
// rather than silently reusing "Missing lease", since a real PDF genuinely
// exists here, just for the wrong person.
//
// This must NOT fire for a routine resident-name mismatch on a lease that
// really does belong to the current resident (typo, a co-resident added
// later, etc.) -- that stays exactly as it was, a normal "Resident Name
// Mismatch" fail inside the ordinary comparison. Only a FULL mismatch (zero
// overlap) reroutes to the new category.
const { chromium } = require('playwright');
const path = require('path');
const XLSX = require('/home/claude/lease_tool/node_modules/xlsx');
const fs = require('fs');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  // ---- Part 1: the gating condition itself, directly ----------------------
  // This is the exact test the fix runs before reconciling: do ANY of the
  // Rent Roll's current resident(s) appear anywhere on the lease?
  const direct = await page.evaluate(() => {
    const fullMismatch = (() => {
      const rr = splitResidentNames('Brand New Tenant');
      const lease = splitResidentNames('Joshua Maldonado');
      const cmp = compareResidentNameLists(lease, rr);
      return cmp.status === 'mismatch' && cmp.unmatchedRentRoll.length === rr.length;
    })();
    const coResidentAddedLater = (() => {
      // Rent Roll only lists one of them -- lease also lists a spouse. This
      // is a real match (see compareResidentNameLists's own doc comment),
      // must NOT be treated as a full mismatch.
      const rr = splitResidentNames('Jeremy Gervais');
      const lease = splitResidentNames('Jeremy Gervais, Angela Gervais');
      const cmp = compareResidentNameLists(lease, rr);
      return cmp.status === 'match';
    })();
    const partialOverlapTwoResidents = (() => {
      // Two Rent Roll residents, only one found on the lease -- a real,
      // ordinary Resident Name Mismatch (something to fix on a lease that
      // IS this unit's), not "nobody uploaded a lease".
      const rr = splitResidentNames('John Smith, Jane Doe');
      const lease = splitResidentNames('John Smith');
      const cmp = compareResidentNameLists(lease, rr);
      return cmp.status === 'mismatch' && cmp.unmatchedRentRoll.length === 1 && rr.length === 2;
    })();
    const minorSpellingStillMatches = (() => {
      // Sanity check this isn't triggered by ordinary formatting noise the
      // existing matcher already tolerates (reversed "Last, First" order).
      const rr = splitResidentNames('Doe, John');
      const lease = splitResidentNames('John Doe');
      const cmp = compareResidentNameLists(lease, rr);
      return cmp.status === 'match';
    })();
    return { fullMismatch, coResidentAddedLater, partialOverlapTwoResidents, minorSpellingStillMatches };
  });
  console.log(JSON.stringify(direct, null, 2));

  // ---- Part 2: real documents, full pipeline -------------------------------
  // Real A105 rent roll + the real, currently-in-effect A105 lease -- but the
  // Rent Roll's resident field for A105 is swapped to an unrelated name, the
  // same way a brand-new move-in would show up before her own lease is
  // uploaded. Everything else (charges, dates) is untouched real data.
  const wb = XLSX.readFile(path.resolve('./a105_test/A105_rentroll.xlsx'));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const colUnit = 0, colResidents = 5;
  let unitRowIdx = -1;
  for (let r = 0; r < rows.length; r++){
    const u = rows[r][colUnit];
    if (u != null && String(u).trim() === '105'){ unitRowIdx = r; break; }
  }
  if (unitRowIdx === -1) throw new Error('Could not locate unit 105 row in the real rent roll -- column layout may have changed.');
  const realResidentName = String(rows[unitRowIdx][colResidents] || '').trim();
  if (!realResidentName) throw new Error('Real A105 rent roll had no resident name to compare against -- fixture may have changed.');

  const newRows = rows.slice();
  const newUnitRow = rows[unitRowIdx].slice();
  newUnitRow[colResidents] = 'Brand New Tenant';
  newRows[unitRowIdx] = newUnitRow;
  const newWs = XLSX.utils.aoa_to_sheet(newRows);
  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newWs, wb.SheetNames[0]);
  const outPath = path.resolve('./a105_test/rentroll_105_newtenant.xlsx');
  XLSX.writeFile(newWb, outPath);

  const leaseFiles = [
    'A105_2022-2023.pdf', 'A105_2023-2024.pdf', 'A105_2024-2025.pdf',
    'A105_2025-2026_current.pdf', 'A105_2026-2027_signed_renewal.pdf',
  ].map(f => path.resolve('./a105_test/' + f));

  await page.setInputFiles('#lease-files', leaseFiles);
  await page.setInputFiles('#rentroll-file', outPath);
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const e2e = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '105');
    return e ? {
      category: e.category, issueCount: e.issueCount, rowCount: e.rows.length,
      note: e.note, residents: e.residents,
      hasRawLease: !!(e.rawLease && e.rawLease.length),
      hasRawResman: !!(e.rawResman && e.rawResman.length),
    } : null;
  });
  console.log(JSON.stringify(e2e, null, 2));

  // Negative control: put the REAL resident name back and confirm this unit
  // reconciles completely normally (this is the already-established real
  // A105 result from test_a105_e2e.cjs -- a genuine deposit mismatch, not
  // this new category). Proves the new check only fires on a full mismatch,
  // never on a lease that actually is the current resident's.
  await page.setInputFiles('#rentroll-file', path.resolve('./a105_test/A105_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);
  const negControl = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '105');
    return e ? { category: e.category, issueCount: e.issueCount } : null;
  });
  console.log(JSON.stringify(negControl, null, 2));

  fs.unlinkSync(outPath);

  const checks = [
    ['Direct: totally different resident (zero overlap) is a full mismatch', direct.fullMismatch],
    ['Direct: a co-resident added later on the lease is still a real match, not full-mismatch', direct.coResidentAddedLater],
    ['Direct: partial overlap on a 2-resident unit is a normal mismatch, not full-mismatch', direct.partialOverlapTwoResidents],
    ['Direct: "Last, First" formatting still matches normally', direct.minorSpellingStillMatches],
    ['E2E: unit 105 found in the results', !!e2e],
    ['E2E: category is the new "new-tenant" bucket, not "mismatch"', e2e && e2e.category === 'new-tenant'],
    ['E2E: no charge-by-charge rows were generated against the wrong lease', e2e && e2e.rowCount === 0],
    ['E2E: still counted as an issue (issueCount 1)', e2e && e2e.issueCount === 1],
    ['E2E: note names the Rent Roll\'s resident ("Brand New Tenant")', e2e && e2e.note && e2e.note.includes('Brand New Tenant')],
    ['E2E: note names the real former resident found on the stale lease', e2e && e2e.note && e2e.note.includes(realResidentName)],
    ['E2E: note explains this looks like an un-uploaded new move-in', e2e && e2e.note && /new move-in/i.test(e2e.note)],
    ['E2E: the stale lease\'s own charges are still shown in the raw detail view', e2e && e2e.hasRawLease],
    ['E2E: the Rent Roll\'s real charges are still shown in the raw detail view', e2e && e2e.hasRawResman],
    ['Negative control: with the REAL resident restored, unit 105 goes back to a normal mismatch', negControl && negControl.category === 'mismatch'],
    ['Negative control: same real issue count as the established real-A105 result (deposit only)', negControl && negControl.issueCount === 1],
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
