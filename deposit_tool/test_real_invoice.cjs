// Regression against the REAL LeaseLock invoice the property sent
// (LPS-260801204, Blanco Oaks, Aug 2026) reconciled against the REAL BOA
// rent roll. Everything here is ground truth read straight out of those two
// documents, verified independently with pdfplumber/openpyxl before this
// test was written:
//
//   - The invoice is a PDF, not a spreadsheet. The original build only
//     accepted .xlsx/.csv and could not open it at all.
//   - LeaseLock writes units building-first ("2-203", "4-408"); the rent
//     roll for the same property writes "203", "408". Naive normalisation
//     turned "2-203" into "2203", so every single line looked like a unit
//     that wasn't in the rent roll.
//   - The invoice's coverage window is one combined cell ("8/1/26-8/31/26"),
//     not two date columns.
//
// Ground truth: 12 detail lines at $31.00 each (=$24 premium + $7 tech),
// invoice total $386.08. Eleven of those units are charged $33.00 on the
// rent roll -- exactly $31 + the $2 markup -- so they must all come out
// CLEAN. The twelfth, invoice unit "4-403", is a VACANT unit on the rent
// roll with no LeaseLock charge: the property is paying $31/mo for an empty
// unit, and that must be flagged.
const { chromium } = require('playwright');
const path = require('path');

const INVOICE = path.resolve('./real/BOA_LeaseLock_Invoice.pdf');
const RENTROLL = path.resolve('./real/BOA_rentroll.xlsx');
const CHARGED_AND_INVOICED = ['203','208','301','302','305','306','401','402','404','405','408'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve('./deposit_reconciler.html'));
  await page.evaluate(() => localStorage.removeItem('auditly_leaselock_markup'));
  await page.reload();

  await page.setInputFiles('#invoice-file', INVOICE);
  await page.setInputFiles('#rentroll-file', RENTROLL);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.?$/.test(document.getElementById('parse-status').textContent.trim()), {timeout: 90000});
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const e403 = unitEntries.find(x => String(x.unit) === '403');
    return {
      meta: invoiceData.meta,
      lineCount: invoiceData.lines.length,
      amounts: Array.from(new Set(invoiceData.lines.map(l => l.amount))),
      days: Array.from(new Set(invoiceData.lines.map(l => l.coverageDays))),
      rawUnits: invoiceData.lines.map(l => l.unitRaw),
      resolved: invoiceData.lines.map(l => l.resolvedKey),
      entries: unitEntries.map(x => ({unit:String(x.unit), category:x.category, charged:x.charged, invoiced:x.invoiced,
        expected:x.expected, cov:x.coverageLabel, invoiceOnly:!!x.invoiceOnly,
        notes:(x.findings||[]).map(f=>f.note)})),
      kpi: document.getElementById('kpi-row').innerText.replace(/\n+/g,' | '),
      tabs: Array.from(document.querySelectorAll('.tab')).map(t=>t.textContent.replace(/\s+/g,' ').trim()),
      onLeaseLock: unitEntries.filter(x=>x.cov.onLeaseLock).length,
      onSurety: unitEntries.filter(x=>x.cov.onSurety).length,
      onDeposit: unitEntries.filter(x=>x.cov.onDeposit).length,
      e403: e403 ? {category:e403.category, invoiced:e403.invoiced, charged:e403.charged,
                    notes:(e403.findings||[]).map(f=>f.note)} : null,
    };
  });

  const byUnit = Object.fromEntries(r.entries.map(e => [e.unit, e]));
  const cleanPairs = CHARGED_AND_INVOICED.filter(u => byUnit[u] && byUnit[u].category === 'clean'
    && byUnit[u].charged === 33 && byUnit[u].invoiced === 31);
  const flagged = r.entries.filter(e => e.category === 'discrepancy');

  console.log('meta:', JSON.stringify(r.meta));
  console.log('lines:', r.lineCount, 'amounts:', r.amounts, 'coverage days:', r.days);
  console.log('raw units:', r.rawUnits.join(', '));
  console.log('resolved  :', r.resolved.join(', '));
  console.log('KPI:', r.kpi);
  console.log('flagged:', JSON.stringify(flagged, null, 1).slice(0, 1500));

  const checks = [
    ['The PDF invoice opens at all (was .xlsx/.csv only)', r.lineCount > 0],
    ['All 12 detail lines are read off the PDF', r.lineCount === 12],
    ['Every line reads $31.00 (the $24 premium + $7 tech total, not just the premium)', r.amounts.length === 1 && r.amounts[0] === 31],
    ['The combined "8/1/26-8/31/26" cell is parsed into a 31-day coverage window', r.days.length === 1 && r.days[0] === 31],
    ['Invoice number is read off the summary page', r.meta.invoiceNumber === 'LPS-260801204'],
    ['Invoice balance due is read off the summary page', r.meta.balanceDue === 386.08],
    ['Building-prefixed "2-203" resolves to rent roll unit "203"', r.resolved.includes('203')],
    ['Building-prefixed "4-408" resolves to rent roll unit "408"', r.resolved.includes('408')],
    ['Every invoice line resolves to a real rent roll unit', r.resolved.every(x => !!x)],
    ['All 11 charged-and-invoiced units come out clean at $33 vs $31', cleanPairs.length === 11],
    ['Exactly one discrepancy is found', flagged.length === 1],
    ['The discrepancy is unit 403', flagged.length === 1 && flagged[0].unit === '403'],
    ['403 is shown by its rent roll number, not the invoice\'s "4-403"', !r.entries.some(e => e.unit === '4-403')],
    ['403\'s finding says the unit is vacant', !!r.e403 && /vacant/i.test(r.e403.notes.join(' '))],
    ['403\'s finding says the property is paying for an empty unit', !!r.e403 && /out of pocket|empty unit/i.test(r.e403.notes.join(' '))],
    ['403\'s finding quotes the invoice\'s own label so it can be found on the invoice', !!r.e403 && /4-403/.test(r.e403.notes.join(' '))],
    ['403 carries the $31 invoiced amount', !!r.e403 && r.e403.invoiced === 31],
    ['Coverage counters match the rent roll: 11 LeaseLock', r.onLeaseLock === 11],
    ['Coverage counters match the rent roll: 7 surety bonds', r.onSurety === 7],
    ['Coverage counters match the rent roll: 9 security deposits', r.onDeposit === 9],
    ['Residents-checked counts the 25 occupied units, not the invoice-only row', /\b25\b/.test(r.kpi.split('Residents checked')[0])],
    ['No unit is wrongly reported as having no coverage at all', !r.entries.some(e => e.notes.join(' ').match(/no coverage at all|none of the three/i))],
    // Tab labels changed: "Discrepancies Only" -> "Mismatch", clean tab stays "Match" (project-wide status vocabulary standard).
    ['Tab counts add up (All = Mismatch + Match)', (() => {
      const n = l => { const m = /(\d+)\s*$/.exec(l); return m ? +m[1] : null; };
      const all = n(r.tabs.find(t=>/^All/.test(t))||''), d = n(r.tabs.find(t=>/^Mismatch/.test(t))||''), c = n(r.tabs.find(t=>/^Match/.test(t))||'');
      return all !== null && all === d + c;
    })()],
    ['No page or console errors', errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
