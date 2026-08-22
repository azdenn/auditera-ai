/* The markup setting, the LeaseLock charge aliases, the "invoice has no
   usable dates" path, and the Rent Roll Summary guard.

   The markup is the whole reason this reconciliation isn't a plain equality
   check: the property deliberately charges the resident $2 more than
   LeaseLock bills it. If the setting is wrong or isn't applied, every single
   LeaseLock unit on the property flips to "mismatch", so it has to be
   configurable, persisted, and re-applied to already-parsed data without a
   re-upload -- exactly like MTM_FEE_EXPECTED in LeaseVerify.
*/
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = 'file://' + path.resolve(__dirname, 'deposit_reconciler.html');
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();

  // ---- Pure-function checks: the LeaseLock charge aliases ----
  const alias = await page.evaluate(() => ({
    exact: isLeaseLockCharge('Deposit Waiver Fee (LeaseLock)'),
    leaselock: isLeaseLockCharge('LeaseLock'),
    twoWords: isLeaseLockCharge('Lease Lock Monthly'),
    waiverFee: isLeaseLockCharge('Deposit Waiver Fee'),
    waiver: isLeaseLockCharge('Deposit Waiver'),
    caseInsensitive: isLeaseLockCharge('DEPOSIT WAIVER FEE (LEASELOCK)'),
    notRent: isLeaseLockCharge('Rent'),
    notDeposit: isLeaseLockCharge('Security Deposit'),
    notPet: isLeaseLockCharge('Pet Fees & Charges'),
  }));

  // ---- Markup drives the expected charge ----
  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice.csv'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:60000});

  const snap = () => page.evaluate(() => ({
    markup: LEASELOCK_MARKUP,
    inputValue: document.getElementById('markup-input').value,
    expected203: (unitEntries.find(e=>e.unit==='203')||{}).expected,
    flags203: (unitEntries.find(e=>e.unit==='203')||{findings:[]}).findings.filter(f=>f.severity==='flag').map(f=>f.key),
    note203: (unitEntries.find(e=>e.unit==='203')||{findings:[]}).findings.map(f=>f.note).join(' '),
    discrepancies: unitEntries.filter(e=>e.category==='discrepancy').length,
    kpiSub: document.getElementById('kpi-sub').textContent,
  }));

  const atDefault = await snap();

  // The setting lives inside the collapsed Option Filters panel in Step 1.
  await page.click('#discrepancy-filter-panel > summary');
  await page.waitForSelector('#markup-input', {state:'visible'});

  // Change the markup to $0 without re-uploading anything.
  await page.fill('#markup-input', '0');
  await page.dispatchEvent('#markup-input', 'change');
  const atZero = await snap();

  // A markup of $5 makes the expected charge $36 while the rent roll says $33.
  await page.fill('#markup-input', '5');
  await page.dispatchEvent('#markup-input', 'change');
  const atFive = await snap();

  // Persistence: reload the page entirely, the setting must survive.
  await page.reload();
  const afterReload = await page.evaluate(() => ({
    markup: LEASELOCK_MARKUP,
    inputValue: document.getElementById('markup-input').value,
    stored: localStorage.getItem('auditly_leaselock_markup'),
  }));

  // Restore the default and re-run for the no-dates fixture.
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice_nodates.csv'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:60000});
  const noDates = await page.evaluate(() => {
    const g = u => { const e = unitEntries.find(x=>x.unit===u); return {
      flags: e.findings.filter(f=>f.severity==='flag').map(f=>f.key),
      softs: e.findings.filter(f=>f.severity==='soft').map(f=>f.key),
      notes: e.findings.map(f=>f.note).join(' '),
      coverageDays: e.invLine ? e.invLine.coverageDays : undefined,
    };};
    return { hasDateColumns: invoiceData.hasDateColumns, u302: g('302'), u402: g('402'), u203: g('203') };
  });

  // ---- Rent Roll Summary guard ----
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice.csv'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll_SUMMARY.xlsx'));
  await page.click('#process-btn');
  await page.waitForTimeout(700);
  const summaryGuard = await page.evaluate(() => ({
    text: document.getElementById('parse-status').textContent,
    isErr: document.getElementById('parse-status').classList.contains('err'),
    resultsHidden: document.getElementById('results-card').classList.contains('hidden'),
  }));

  console.log('aliases:', JSON.stringify(alias));
  console.log('default:', JSON.stringify(atDefault));
  console.log('markup 0:', JSON.stringify(atZero));
  console.log('markup 5:', JSON.stringify(atFive));
  console.log('after reload:', JSON.stringify(afterReload));
  console.log('no-dates invoice:', JSON.stringify(noDates));
  console.log('summary guard:', JSON.stringify(summaryGuard));

  const checks = [
    ['Alias: "Deposit Waiver Fee (LeaseLock)" (the real rent roll wording)', alias.exact],
    ['Alias: "LeaseLock"', alias.leaselock],
    ['Alias: "Lease Lock" (two words)', alias.twoWords],
    ['Alias: "Deposit Waiver Fee"', alias.waiverFee],
    ['Alias: "Deposit Waiver"', alias.waiver],
    ['Alias matching is case-insensitive', alias.caseInsensitive],
    ['Alias does not swallow unrelated charges', !alias.notRent && !alias.notDeposit && !alias.notPet],
    ['"Security Deposit" is not mistaken for a LeaseLock waiver', !alias.notDeposit],

    ['Default markup gives expected charge = $31 + $2 = $33', atDefault.expected203 === 33 && atDefault.flags203.length === 0],
    ['The markup in force is stated above the results', /\$2\.00/.test(atDefault.kpiSub)],

    ['Markup $0 makes the expected charge $31, so the $33 rent-roll charge is flagged',
      atZero.markup === 0 && atZero.expected203 === 31 && atZero.flags203.length === 1 && atZero.flags203[0] === 'llAmountMismatch'],
    ['Charging the resident MORE than invoice + markup is described as over, not under',
      /\$2\.00 over/.test(atZero.note203)],
    ['Changing the markup re-reconciles already-uploaded data with no re-upload',
      atZero.discrepancies > atDefault.discrepancies],
    ['Markup $5 makes the expected charge $36 and flags the $33 charge',
      atFive.expected203 === 36 && atFive.flags203.length === 1],
    ['The setting input reflects the value in force', atFive.inputValue === '5.00'],

    ['The markup persists in localStorage across a full page reload',
      afterReload.markup === 5 && afterReload.stored === '5' && afterReload.inputValue === '5.00'],

    ['An invoice with no coverage-date columns is detected as such', noDates.hasDateColumns === false],
    ['With no dates, a higher invoice is still flagged rather than guessed at (302)',
      noDates.u302.flags.length === 1 && noDates.u302.flags[0] === 'llAmountMismatch'],
    ['With no dates, the previously-explained longer-period case (402) is now flagged too',
      noDates.u402.flags.length === 1 && noDates.u402.softs.length === 0],
    ['Both say explicitly that the coverage period could not be checked',
      /no coverage start\/end columns at all/.test(noDates.u302.notes) &&
      /no coverage start\/end columns at all/.test(noDates.u402.notes) &&
      /could not be ruled out/.test(noDates.u402.notes)],
    ['Units whose amounts agree are still clean without dates (203)', noDates.u203.flags.length === 0],

    ['Uploading the Rent Roll SUMMARY export is refused with a specific message',
      summaryGuard.isErr && /Rent Roll Summary/.test(summaryGuard.text) && summaryGuard.resultsHidden],

    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await browser.close();
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
