// Regression for: "it still looks like your pulling vacant units... if it
// says its vacant on the rent roll, any rent roll then please dont pull up
// those leases." Root cause: isVacant() itself was correct, but it was only
// ever checked for units with NO lease uploaded. A unit that IS vacant on
// the rent roll but still had a lease file uploaded (e.g. a prior
// resident's lease still sitting in a ResMan export -- completely normal
// and expected) skipped the vacancy check entirely and got shown as a
// normal clean/mismatch row.
const { chromium } = require('playwright');
const path = require('path');
const XLSX = require('/home/claude/lease_tool/node_modules/xlsx');
const fs = require('fs');

(async () => {
  // Build a rent roll that's a copy of the real Blanco Oaks export, except
  // unit 105 is switched to vacant (no resident, no charges) even though we
  // still upload a real lease file for 105.
  const wb = XLSX.readFile(path.resolve('./a105_test/A105_rentroll.xlsx'));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

  // This export's header row text is offset from the actual data columns
  // (merged header cells) -- e.g. the "Unit" header label sits at column
  // index 1, but the unit VALUES themselves ("101", "105", ...) are actually
  // in column index 0 on data rows. So detect the unit/residents columns
  // directly from a known data row instead of trusting the header row.
  // Column 0 = unit number, column 5 = residents (empirically confirmed:
  // row containing "105" has "105" at [0] and "Nancy Flagle" at [5], and
  // known-vacant rows like "101" have "Vacant Unit" at [5]).
  const colUnit = 0;
  const colResidents = 5;

  let unitRowIdx = -1;
  for (let r = 0; r < rows.length; r++){
    const u = rows[r][colUnit];
    if (u != null && String(u).trim() === '105'){ unitRowIdx = r; break; }
  }
  if (unitRowIdx === -1) throw new Error('Could not locate unit 105 row in the real rent roll -- column layout may have changed.');

  // Just flip the residents field to "Vacant Unit" -- isVacant() only looks
  // at block.residents (or empty residents+no charges+no total), so the
  // charge sub-rows underneath don't need to be touched for this test.
  const newRows = rows.slice();
  const newUnitRow = rows[unitRowIdx].slice();
  newUnitRow[colResidents] = 'Vacant Unit';
  newRows[unitRowIdx] = newUnitRow;
  const newWs = XLSX.utils.aoa_to_sheet(newRows);
  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newWs, wb.SheetNames[0]);
  const outPath = path.resolve('./a105_test/rentroll_105_vacant.xlsx');
  XLSX.writeFile(newWb, outPath);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  const leaseFiles = [
    'A105_2022-2023.pdf', 'A105_2023-2024.pdf', 'A105_2024-2025.pdf',
    'A105_2025-2026_current.pdf', 'A105_2026-2027_signed_renewal.pdf',
  ].map(f => path.resolve('./a105_test/' + f));

  await page.setInputFiles('#lease-files', leaseFiles);
  await page.setInputFiles('#rentroll-file', outPath);
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    return {
      entryFor105: unitEntries.find(e => e.unit === '105') || null,
      totalEntries: unitEntries.length,
      vacantUnitCount,
      allUnits: unitEntries.map(e => e.unit),
    };
  });
  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['Unit 105 (vacant, but had 5 lease files uploaded) does NOT appear in the results at all', result.entryFor105 === null],
    ['vacantUnitCount includes 105 (5 real vacant units + this synthetic one = 6)', result.vacantUnitCount === 6],
    ['105 is not in the rendered unit list', !result.allUnits.includes('105')],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  fs.unlinkSync(outPath);
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
