/* Core rules, end-to-end, against the REAL ResMan export
   fixtures/BOA_rentroll.xlsx (Blanco Oaks Apartments — 30 units, 5 vacant,
   11 "Deposit Waiver Fee (LeaseLock)" charges at $33, 7 non-zero Surety
   Bonds, 9 non-zero Deposits) and the synthetic $31/unit LeaseLock invoice
   built from it.

   What must hold:
     • Every resident is classified into LeaseLock / surety bond / security
       deposit, and the KPI counters match the real spreadsheet.
     • Vacant units are excluded entirely.
     • A unit with a deposit or a bond is NEVER reported as a LeaseLock
       problem -- these are the negative controls that matter most, because a
       false "missing LeaseLock" on a resident who paid a real deposit is the
       most damaging thing this tool could do.
     • $45 invoice over a normal 30-day month  -> flagged (unexplained).
     • $46.50 invoice over a 45-day period     -> NOT flagged (explained).
     • Charged $33 on the rent roll but absent from the invoice -> flagged.
*/
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'deposit_reconciler.html'));
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();

  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice.csv'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:60000});

  const d = await page.evaluate(() => {
    const flagged = e => e.findings.filter(f => f.severity==='flag' && !f.hiddenByFilter).map(f => f.key);
    const byUnit = {};
    for (const e of unitEntries) byUnit[e.unit] = {
      coverage: e.coverageLabel, charged: e.charged, invoiced: e.invoiced, expected: e.expected,
      flags: flagged(e), softs: e.findings.filter(f=>f.severity==='soft').map(f=>f.key),
      notes: e.findings.map(f=>f.note), category: e.category,
      onLeaseLock: e.cov.onLeaseLock, onSurety: e.cov.onSurety, onDeposit: e.cov.onDeposit,
    };
    return {
      markup: LEASELOCK_MARKUP,
      property: detectedPropertyName,
      entries: unitEntries.length,
      vacant: vacantUnitCount,
      onLeaseLock: unitEntries.filter(e=>e.cov.onLeaseLock).length,
      onSurety: unitEntries.filter(e=>e.cov.onSurety).length,
      onDeposit: unitEntries.filter(e=>e.cov.onDeposit).length,
      discrepancyUnits: unitEntries.filter(e=>e.category==='discrepancy').map(e=>e.unit),
      totalFlags: unitEntries.reduce((n,e)=>n+e.issueCount,0),
      byUnit,
      kpiText: document.getElementById('kpi-row').textContent,
      rowUnits: Array.from(document.querySelectorAll('#results-body tr.unit-row')).map(r=>r.children[1].textContent.trim()),
    };
  });

  // Units that carry a real security deposit or surety bond in the actual
  // spreadsheet, and no LeaseLock charge. None may be flagged.
  const DEPOSIT_UNITS = ['102','105','106','201','202','204','207','308','406'];
  const SURETY_ONLY_UNITS = ['104','205','206','303','407'];
  const VACANT_UNITS = ['101','103','304','307','403'];
  const LEASELOCK_AND_SURETY = ['301','306'];   // real units carrying both

  const depositClean = DEPOSIT_UNITS.every(u => d.byUnit[u] && d.byUnit[u].flags.length === 0);
  const suretyClean = SURETY_ONLY_UNITS.every(u => d.byUnit[u] && d.byUnit[u].flags.length === 0);
  const bothClean = LEASELOCK_AND_SURETY.every(u => d.byUnit[u] && d.byUnit[u].flags.length === 0);
  const vacantAbsent = VACANT_UNITS.every(u => !d.byUnit[u]);

  console.log('property:', d.property, '| entries:', d.entries, '| vacant:', d.vacant);
  console.log('coverage counts — leaselock:', d.onLeaseLock, 'surety:', d.onSurety, 'deposit:', d.onDeposit);
  console.log('discrepancy units:', JSON.stringify(d.discrepancyUnits));
  console.log('302:', JSON.stringify(d.byUnit['302']));
  console.log('402:', JSON.stringify(d.byUnit['402']));
  console.log('408:', JSON.stringify(d.byUnit['408']));
  console.log('203 (control):', JSON.stringify(d.byUnit['203']));
  console.log('105 (deposit control):', JSON.stringify(d.byUnit['105']));
  console.log('303 (surety control):', JSON.stringify(d.byUnit['303']));

  const checks = [
    ['Rent roll property name is read from the export', d.property === 'Blanco Oaks Apartments'],
    ['Default markup is $2.00', Math.abs(d.markup - 2) < 1e-9],
    ['All 5 vacant units are excluded from the results', d.vacant === 5 && vacantAbsent],
    ['25 occupied residents are reconciled', d.entries === 25],
    ['11 residents counted on LeaseLock (matches the real rent roll)', d.onLeaseLock === 11],
    ['7 residents counted on a surety bond (matches the real rent roll)', d.onSurety === 7],
    ['9 residents counted on a security deposit (matches the real rent roll)', d.onDeposit === 9],
    ['KPI tiles show the LeaseLock / bond / deposit counters',
      // KPI tile label changed from "On a security deposit" to "On a Traditional Security Deposit"
      // (the cash-deposit coverage type was renamed to distinguish it from LeaseLock and surety bonds).
      /On LeaseLock/.test(d.kpiText) && /On a surety bond/.test(d.kpiText) && /On a Traditional Security Deposit/.test(d.kpiText)],

    ['NEGATIVE CONTROL: no security-deposit unit is flagged as a LeaseLock problem', depositClean],
    ['NEGATIVE CONTROL: no surety-bond unit is flagged as a LeaseLock problem', suretyClean],
    ['NEGATIVE CONTROL: units carrying BOTH LeaseLock and a bond stay clean when the invoice matches', bothClean],
    ['NEGATIVE CONTROL: nothing is reported as "no coverage" on this property (every resident is covered)',
      Object.values(d.byUnit).every(u => !u.flags.includes('noCoverage'))],

    ['Matching unit 203: $31 invoice + $2 markup = the $33 charged, so it is clean',
      d.byUnit['203'].charged === 33 && d.byUnit['203'].invoiced === 31 && d.byUnit['203'].expected === 33 && d.byUnit['203'].flags.length === 0],

    ['Unexplained overcharge (302: $45 invoice, normal 30-day month) IS flagged',
      d.byUnit['302'].flags.length === 1 && d.byUnit['302'].flags[0] === 'llAmountMismatch'],
    ['That overcharge finding says the coverage period does not explain it',
      /does not explain/.test(d.byUnit['302'].notes.join(' '))],

    ['NEGATIVE CONTROL: higher invoice over a LONGER coverage period (402: $46.50, 45 days) is NOT flagged',
      d.byUnit['402'].flags.length === 0],
    ['That longer-period case is still recorded as an explained, non-discrepancy finding',
      d.byUnit['402'].softs.length === 1 && d.byUnit['402'].softs[0] === 'llAmountMismatch'],
    ['Its note explains the extra days beyond a normal month',
      /45 days/.test(d.byUnit['402'].notes.join(' ')) && /14 days more than a normal month/.test(d.byUnit['402'].notes.join(' '))],
    ['A unit whose only finding is explained is not counted as a discrepancy',
      d.byUnit['402'].category === 'clean'],

    ['Charged LeaseLock on the rent roll but absent from the invoice (408) IS flagged',
      d.byUnit['408'].flags.length === 1 && d.byUnit['408'].flags[0] === 'llNotOnInvoice'],
    ['That finding records the $33 charge and no invoice amount',
      d.byUnit['408'].charged === 33 && d.byUnit['408'].invoiced === null],

    ['Exactly two units are flagged on this fixture (302 and 408)',
      JSON.stringify(d.discrepancyUnits.slice().sort()) === JSON.stringify(['302','408'])],
    ['Two findings in total', d.totalFlags === 2],
    ['The results table renders one row per reconciled resident', d.rowUnits.length === 25],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await browser.close();
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
