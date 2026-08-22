// Regression for: "Name it option filters - choose what doesn't get analyzed
// : want literally everything on there, if it gets scanned put it in there,
// add move in specials for sure"
//
// The filter previously covered only 6 verification checks, so entire
// families of findings -- every charge category, and move-in specials --
// had no switch at all. Now every check AND every charge category the
// reconciler can emit is listed and independently suppressible, with the
// same guarantees the check filter already had: a switched-off item never
// flags a unit, never counts as an issue, is still shown (muted) in that
// unit's own detail, and is still counted in the property-wide hidden total.
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

  // ---- Coverage: is literally everything scannable represented? ----
  const coverage = await page.evaluate(() => {
    const keys = new Set(ALL_OPTION_FILTER_TYPES.map(t => t.key));
    const missingCats = Object.keys(CATEGORY_LABELS).filter(c => !keys.has('charge:' + c));
    const checkKeys = Object.keys(VERIFY_CHECK_TITLES).concat(['signatures','newerLease']);
    const missingChecks = checkKeys.filter(k => !keys.has(k));
    return {
      total: ALL_OPTION_FILTER_TYPES.length,
      missingCats, missingChecks,
      hasConcession: keys.has('charge:CONCESSION'),
      hasUnmapped: keys.has('charge:UNMAPPED'),
      concessionLabel: (ALL_OPTION_FILTER_TYPES.find(t => t.key==='charge:CONCESSION')||{}).label,
      groups: Array.from(new Set(ALL_OPTION_FILTER_TYPES.map(t => t.group))),
      renderedBoxes: document.querySelectorAll('#discrepancy-filter-checks input[type=checkbox]').length,
      panelTitle: document.querySelector('#discrepancy-filter-panel summary').textContent,
    };
  });
  console.log('=== coverage ===', JSON.stringify(coverage, null, 2));

  // A move-in special / concession line must classify into CONCESSION rather
  // than falling through as an unrecognized ResMan-only charge.
  const classification = await page.evaluate(() => ({
    monthFree: classify('1 month free prorated over 12 months', ALIAS_MAP).category,
    concessionRent: classify('Concession - Rent', ALIAS_MAP).category,
    moveInSpecial: classify('Move-In Special', ALIAS_MAP).category,
    // Guard: ordinary rent must not be swallowed by the loose concession aliases.
    plainRent: classify('Rent', ALIAS_MAP).category,
  }));
  console.log('=== concession classification ===', JSON.stringify(classification));

  // ---- Behaviour: hiding a charge category ----
  await page.setInputFiles('#lease-files', path.resolve('./boa_test/303_old_expired_lease.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const get303 = () => page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '303');
    if (!e) return null;
    const rent = (e.rows||[]).find(r => r.category === 'RENT');
    return {
      category: e.category, issueCount: e.issueCount, hiddenChargeCount: e.hiddenChargeCount || 0,
      rentStatus: rent ? rent.status : null, rentHidden: rent ? !!r0(rent) : null,
    };
    function r0(r){ return r.hiddenByFilter; }
  });

  const baseline = await get303();

  await page.evaluate(() => { document.getElementById('discrepancy-filter-panel').open = true; });
  await page.click('input[data-check-key="charge:RENT"]');
  await page.waitForTimeout(300);
  const afterHideRent = await get303();

  const kpi = await page.evaluate(() => {
    const t = document.querySelector('.kpi-tile.hidden-filter');
    return t ? t.textContent : null;
  });
  const detail = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '303');
    const n = typeof buildVerifySection === 'function' ? buildVerifySection(e) : null;
    return n ? n.outerHTML : null;
  });
  const flatRows = await page.evaluate(() => buildFlatIssuesRows().filter(r => r.unit === '303').map(r => r.item));

  // Group "toggle all" must switch a whole family at once.
  await page.evaluate(() => { document.getElementById('discrepancy-filter-panel').open = true; });
  await page.click('.filter-group-all[data-group="Charges & fees"]');
  await page.waitForTimeout(300);
  const afterToggleAll = await page.evaluate(() => {
    const charges = ALL_OPTION_FILTER_TYPES.filter(t => t.group === 'Charges & fees');
    return { allHidden: charges.every(t => isCheckHidden(t.key)), count: charges.length };
  });

  // Toggle the group back off, then untick rent, and confirm full restore.
  await page.click('.filter-group-all[data-group="Charges & fees"]');
  await page.waitForTimeout(300);
  const afterRestore = await get303();

  console.log('=== 303 states ===', JSON.stringify({baseline, afterHideRent, afterToggleAll, afterRestore}, null, 2));
  console.log('=== kpi ===', kpi);
  console.log('=== flat rows for 303 while rent hidden ===', JSON.stringify(flatRows));

  const checks = [
    ['Panel is titled "Option Filters — choose what doesn\'t get analyzed"', /Option Filters/.test(coverage.panelTitle) && /doesn't get analyzed/.test(coverage.panelTitle)],
    ['Every charge category has a filter row (none missing)', coverage.missingCats.length === 0],
    ['Every verification check has a filter row (none missing)', coverage.missingChecks.length === 0],
    ['Move-in specials & concessions is present', coverage.hasConcession && /Move-in specials/i.test(coverage.concessionLabel||'')],
    ['Unrecognized/other charges has a switch too (no coverage gap)', coverage.hasUnmapped],
    ['Filters are grouped for scannability', coverage.groups.length >= 2],
    ['Every filter type actually renders a checkbox', coverage.renderedBoxes === coverage.total],
    ['"1 month free prorated..." classifies as CONCESSION, not unmapped noise', classification.monthFree === 'CONCESSION'],
    ['"Concession - Rent" classifies as CONCESSION', classification.concessionRent === 'CONCESSION'],
    ['"Move-In Special" classifies as CONCESSION', classification.moveInSpecial === 'CONCESSION'],
    ['Plain "Rent" is NOT swallowed by concession aliases', classification.plainRent === 'RENT'],
    ['Baseline: 303 flagged with a real rent issue', baseline.category === 'mismatch' && baseline.issueCount > 0],
    ['Hiding the Rent charge category drops 303\'s issue count', afterHideRent.issueCount < baseline.issueCount],
    ['Hiding Rent moves it into hiddenChargeCount instead of deleting it', afterHideRent.hiddenChargeCount > 0],
    ['The underlying rent row still exists and is still a real mismatch underneath', afterHideRent.rentStatus === 'mismatch'],
    ['The rent row is marked hidden-by-filter for rendering', afterHideRent.rentHidden === true],
    ['KPI tile counts the hidden charge', !!kpi && /hidden/i.test(kpi)],
    ['Unit detail still shows the row, muted as "Hidden by Filter"', !!detail && /Hidden by Filter/.test(detail)],
    ['Detail explains it was excluded by choice', !!detail && /chosen not to analyze/i.test(detail)],
    ['Flat mismatches view excludes the hidden charge', !flatRows.includes('Rent')],
    ['"Toggle all" switches the whole charges family at once', afterToggleAll.allHidden === true && afterToggleAll.count > 5],
    ['Toggling the group back restores 303 exactly', afterRestore.issueCount === baseline.issueCount && afterRestore.category === baseline.category && afterRestore.hiddenChargeCount === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
