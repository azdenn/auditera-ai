// Second REAL LeaseLock invoice: LPS-260701233, Garden Creek, July 2026,
// reconciled against the real GCA rent roll for the same month.
//
// This one exposed a genuine bug the Blanco Oaks invoice could not: LeaseLock
// writes the building prefix differently per property. Blanco Oaks uses
// "2-203" (digits before the dash); Garden Creek uses "A-A104" -- letters
// before the dash AND a letter starting the part after it. The unit pattern
// only allowed digits in both positions, so EVERY Garden Creek line failed to
// match and the whole invoice came back "no per-unit lines could be read".
//
// It is also the first real invoice carrying non-"Current" rows, so it proves
// the credit-parsing fix against real data rather than a synthetic fixture.
//
// Ground truth read straight off the invoice's own summary page:
//   18 Current + 4 New + 1 Terminated = 23 detail lines
//   Terminated line: B-B302, -$16.00 / -$4.67 / -$20.67
//   Balance due $738.91
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve('./deposit_reconciler.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.setInputFiles('#invoice-file', path.resolve('./real/GCA_LeaseLock_Invoice_July.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve('./real/GCA_rentroll_july.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout: 90000});
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const byRaw = {};
    invoiceData.lines.forEach(l => { byRaw[l.unitRaw] = l; });
    return {
      meta: invoiceData.meta,
      lineCount: invoiceData.lines.length,
      unresolved: invoiceData.lines.filter(l => !l.resolvedKey).length,
      negatives: invoiceData.lines.filter(l => l.amount < 0).map(l => ({unit:l.unitRaw, key:l.resolvedKey, amt:l.amount})),
      a104: byRaw['A-A104'] ? {key: byRaw['A-A104'].resolvedKey, amt: byRaw['A-A104'].amount} : null,
      b302: byRaw['B-B302'] ? {key: byRaw['B-B302'].resolvedKey, amt: byRaw['B-B302'].amount, days: byRaw['B-B302'].coverageDays} : null,
      c101: byRaw['C-C101'] ? {key: byRaw['C-C101'].resolvedKey} : null,
      newLease: byRaw['A-A213'] ? {amt: byRaw['A-A213'].amount, days: byRaw['A-A213'].coverageDays} : null,
      kpi: document.getElementById('kpi-row').innerText.replace(/\n+/g,' | '),
      entries: unitEntries.length,
    };
  });
  console.log(JSON.stringify(r, null, 1));

  const checks = [
    ['The Garden Creek invoice parses at all (it previously produced ZERO lines)', r.lineCount > 0],
    ['All 23 detail lines are read (18 Current + 4 New + 1 Terminated)', r.lineCount === 23],
    ['Invoice number read from the summary page', r.meta.invoiceNumber === 'LPS-260701233'],
    ['Balance due read from the summary page', r.meta.balanceDue === 738.91],
    ['Letter-prefixed unit "A-A104" resolves to rent roll unit "A104"', !!r.a104 && r.a104.key === 'A104'],
    ['Letter-prefixed unit "C-C101" resolves to rent roll unit "C101"', !!r.c101 && r.c101.key === 'C101'],
    ['Every line resolves to a real rent roll unit (none left unmatched)', r.unresolved === 0],
    ['The real Terminated credit is read as NEGATIVE, not dropped or made positive', !!r.b302 && r.b302.amt === -20.67],
    ['Exactly one credit line on this invoice, matching the summary page', r.negatives.length === 1],
    ['The credit is filed against the right unit (B302)', !!r.b302 && r.b302.key === 'B302'],
    ['A part-month "New" lease keeps its own longer coverage window', !!r.newLease && r.newLease.amt === 50.63 && r.newLease.days > 31],
    ['The run produces real reconciled units', r.entries > 0],
    ['Coverage counters are populated', /On LeaseLock/.test(r.kpi)],
    ['No page or console errors', errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
