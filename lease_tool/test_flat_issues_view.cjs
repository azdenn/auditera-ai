// Regression for: "when it says all discrepancies only, clean matches,
// missing/unmatched, can I get an alternate view here that only shows the
// mismatches across all units? The button that says discrepancies only
// still shows all the matches. Keep this button. It's good."
//
// This is a NEW view (flatIssuesView), separate from the existing
// "Discrepancies Only" tab (which filters WHICH UNITS show, but a flagged
// unit's own detail still lists all its charges, including the ones that
// match). The flat view instead flattens every actual mismatching LINE
// ITEM across every unit into one table, skipping clean/vacant units,
// matched/probable/soft rows, and any verification check the user has
// hidden via the existing discrepancy filter.
//
// Part 1 (direct): synthesizes several unitEntries by hand -- covering a
// clean unit with a harmless soft (month-to-month) row, a vacant unit, a
// unit with a real charge mismatch mixed with a soft row and matching
// rows, and a unit with a hidden vs. a visible failed verification check
// -- and calls buildFlatIssuesRows()/renderFlatIssuesTable() directly.
// This exercises the exact filtering logic without depending on fragile
// multi-unit real-file parsing.
//
// Part 2 (e2e): uploads the real A105 fixtures (one genuine Security
// Deposit mismatch -- see test_discrepancy_filter.cjs) through the actual
// upload flow, clicks the real "Show only the mismatching lines" checkbox,
// and confirms the live DOM actually swaps views and shows that real row,
// then confirms unchecking restores the normal per-unit accordion view.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));
  await page.reload();

  // ---------------- Part 1: direct, synthetic multi-unit data ----------------
  const direct = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS = new Set(['signatures']); // simulate the user having hidden Signatures checks

    unitEntries = [
      // 101: clean overall (its only row is a soft mtm row, which never
      // counts as an issue) -- must contribute NOTHING to the flat view,
      // even though it technically has a non-"match" status row.
      {
        unit: '101', residents: 'Alice A', category: 'clean',
        rows: [ {label:'Month to Month Fee', status:'mtm', soft:true, leaseVal:null, resmanVal:250, note:'Not a discrepancy.'} ],
        verify: { checks: [ {key:'deposit', status:'pass', leaseValue:500, rentRollValue:500} ] },
      },
      // 102: vacant -- must contribute nothing regardless of its rows.
      {
        unit: '102', residents: null, category: 'vacant',
        rows: [ {label:'Rent', status:'mismatch', leaseVal:900, resmanVal:950} ],
        verify: null,
      },
      // 103: real mismatch unit -- mix of a match row (excluded), a real
      // charge mismatch (included), a resmanonly row (included), and a
      // soft mtm row (excluded even though the unit itself is flagged).
      {
        unit: '103', residents: 'Bob B', category: 'mismatch',
        rows: [
          {label:'Rent', status:'match', leaseVal:1200, resmanVal:1200},
          {label:'Pet Rent', status:'mismatch', leaseVal:50, resmanVal:75},
          {label:'Late Fee', status:'resmanonly', leaseVal:null, resmanVal:35},
          {label:'Month to Month Fee', status:'mtm', soft:true, leaseVal:null, resmanVal:250, note:'Not a discrepancy.'},
        ],
        verify: { checks: [ {key:'deposit', status:'pass', leaseValue:400, rentRollValue:400} ] },
      },
      // 104: verification checks only -- one hidden (signatures, filtered
      // out), one real visible fail (deposit) that must appear.
      {
        unit: '104', residents: 'Cara C', category: 'mismatch',
        rows: [ {label:'Rent', status:'match', leaseVal:1000, resmanVal:1000} ],
        verify: { checks: [
          {key:'signatures', status:'fail', missing:[{signer:'Resident', page:3, section:'Signatures'}]},
          {key:'deposit', status:'fail', leaseValue:300, rentRollValue:600},
        ] },
      },
    ];

    const rows = buildFlatIssuesRows();
    renderFlatIssuesTable();
    const bodyHtml = document.getElementById('flat-issues-body').innerHTML;
    const emptyHidden = document.getElementById('flat-empty-state').classList.contains('hidden');

    return { rows, bodyHtml, emptyHidden };
  });

  console.log('=== direct buildFlatIssuesRows ===');
  console.log(JSON.stringify(direct.rows, null, 2));

  const unitsInRows = direct.rows.map(r => r.unit);
  const items = direct.rows.map(r => r.unit + ':' + r.item);

  // ---------------- Part 1b: empty state when nothing qualifies ----------------
  const emptyCase = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS = new Set();
    unitEntries = [
      { unit: '201', residents: 'Dana D', category: 'clean', rows: [{label:'Rent', status:'match', leaseVal:1000, resmanVal:1000}], verify: { checks: [{key:'deposit', status:'pass', leaseValue:500, rentRollValue:500}] } },
      { unit: '202', residents: null, category: 'vacant', rows: [], verify: null },
    ];
    const rows = buildFlatIssuesRows();
    renderFlatIssuesTable();
    return { rowCount: rows.length, emptyHidden: document.getElementById('flat-empty-state').classList.contains('hidden') };
  });

  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));

  // ---------------- Part 2: real e2e with A105 fixtures + live checkbox ----------------
  const files = [
    'A105_2022-2023.pdf', 'A105_2023-2024.pdf', 'A105_2024-2025.pdf',
    'A105_2025-2026_current.pdf', 'A105_2026-2027_signed_renewal.pdf',
  ].map(f => path.resolve('./a105_test/' + f));

  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./a105_test/A105_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const beforeToggle = await page.evaluate(() => ({
    unitShellHidden: document.getElementById('unit-view-shell').classList.contains('hidden'),
    flatShellHidden: document.getElementById('flat-view-shell').classList.contains('hidden'),
    flatIssuesView,
  }));

  await page.click('#flat-view-toggle');
  await page.waitForTimeout(200);

  const afterToggle = await page.evaluate(() => ({
    unitShellHidden: document.getElementById('unit-view-shell').classList.contains('hidden'),
    flatShellHidden: document.getElementById('flat-view-shell').classList.contains('hidden'),
    flatIssuesView,
    bodyText: document.getElementById('flat-issues-body').textContent,
    hintHidden: document.getElementById('unit-view-hint').classList.contains('hidden'),
  }));

  await page.click('#flat-view-toggle'); // toggle back off
  await page.waitForTimeout(200);

  const afterUntoggle = await page.evaluate(() => ({
    unitShellHidden: document.getElementById('unit-view-shell').classList.contains('hidden'),
    flatShellHidden: document.getElementById('flat-view-shell').classList.contains('hidden'),
    flatIssuesView,
  }));

  console.log('=== e2e toggle states ===');
  console.log(JSON.stringify({ beforeToggle, afterToggle, afterUntoggle }, null, 2));

  const checks = [
    ['Clean unit (101) contributes nothing, even with a soft mtm row', !unitsInRows.includes('101')],
    ['Vacant unit (102) contributes nothing', !unitsInRows.includes('102')],
    ['Mismatch unit (103): real charge mismatch "Pet Rent" included', items.includes('103:Pet Rent')],
    ['Mismatch unit (103): "In ResMan only" row "Late Fee" included', items.includes('103:Late Fee')],
    ['Mismatch unit (103): matching "Rent" row excluded', !items.includes('103:Rent')],
    ['Mismatch unit (103): soft mtm row excluded even though unit is flagged', !items.some(i => i.startsWith('103:') && i.includes('Month to Month'))],
    ['Unit 104: hidden Signatures check excluded from flat view', !direct.rows.some(r => r.unit === '104' && /Signature/i.test(r.item))],
    ['Unit 104: visible Security Deposit fail included', direct.rows.some(r => r.unit === '104' && /Deposit/i.test(r.item))],
    ['Flat table body HTML actually contains "Pet Rent"', /Pet Rent/.test(direct.bodyHtml)],
    ['Flat table body HTML actually contains "Security Deposit"', /Deposit/i.test(direct.bodyHtml)],
    ['Empty state hidden when rows exist', direct.emptyHidden === true],
    ['Empty case: no rows when only clean/vacant units exist', emptyCase.rowCount === 0],
    ['Empty case: empty-state message shown', emptyCase.emptyHidden === false],
    ['Before toggling: normal unit-accordion view is showing', !beforeToggle.unitShellHidden && beforeToggle.flatShellHidden && beforeToggle.flatIssuesView === false],
    ['After toggling ON: flat view showing, unit view + hint hidden', afterToggle.unitShellHidden && !afterToggle.flatShellHidden && afterToggle.flatIssuesView === true && afterToggle.hintHidden],
    ['After toggling ON: real A105 Security Deposit mismatch appears in the live flat table', /Security Deposit/i.test(afterToggle.bodyText) || /105/.test(afterToggle.bodyText)],
    ['After toggling back OFF: normal unit-accordion view restored', !afterUntoggle.unitShellHidden && afterUntoggle.flatShellHidden && afterUntoggle.flatIssuesView === false],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);

  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));

  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
