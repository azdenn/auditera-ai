/* The results UI: filter tabs, sortable columns, expandable detail, the
   Option Filters panel, and both exports.

   The load-bearing convention here is the hidden-by-filter rule: switching a
   finding type off must NEVER delete it. The row stays on screen, muted and
   labelled "Hidden by Filter", the finding is still in that unit's detail,
   and the property-wide hidden total is still shown above the results and in
   the exported report. Silently dropping findings is how an audit tool starts
   lying to the person relying on it.
*/
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'deposit_reconciler.html'));
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();

  const title = await page.title();
  const headerText = await page.textContent('header.page h1');

  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice_edge.xlsx'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll_edge.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:60000});

  // ---- Tabs ----
  const tabInfo = await page.evaluate(() => Array.from(document.querySelectorAll('.tab')).map(t => t.textContent.trim()));
  const rowCount = () => page.evaluate(() => document.querySelectorAll('#results-body tr.unit-row').length);
  const allCount = await rowCount();
  await page.click('.tab[data-filter="discrepancies"]');
  const discCount = await rowCount();
  const discUnits = await page.evaluate(() => Array.from(document.querySelectorAll('#results-body tr.unit-row')).map(r=>r.children[1].textContent.trim()));
  await page.click('.tab[data-filter="clean"]');
  const cleanCount = await rowCount();
  await page.click('.tab[data-filter="all"]');

  // ---- Expandable detail ----
  await page.click('#results-body tr.unit-row[data-unit="105"]');
  const detail105 = await page.evaluate(() => {
    const d = document.querySelector('#results-body tr.detail-row');
    return d ? d.textContent : null;
  });
  await page.click('#results-body tr.unit-row[data-unit="105"]');
  const detailClosed = await page.evaluate(() => !document.querySelector('#results-body tr.detail-row'));

  // ---- Sorting ----
  const colIdx = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#unit-view-shell thead th'));
    const m = {}; ths.forEach((t,i)=>{ const k=t.getAttribute('data-sort'); if(k) m[k]=i; });
    return { map:m, headers: ths.map(t=>t.textContent.trim()) };
  });
  const colText = key => page.evaluate(i => Array.from(document.querySelectorAll('#results-body tr.unit-row'))
      .map(r => r.children[i] ? r.children[i].textContent.trim() : null), colIdx.map[key]);
  const clickHdr = k => page.click(`#unit-view-shell th[data-sort="${k}"]`);

  const defaultUnits = await colText('unit');
  await clickHdr('unit'); const unitAsc = await colText('unit');
  await clickHdr('unit'); const unitDesc = await colText('unit');
  await clickHdr('unit'); const backToDefault = await colText('unit');
  await clickHdr('charged'); const chargedAsc = await colText('charged');
  const sortState = await page.evaluate(() => ({
    key: sortKey, dir: sortDir,
    aria: document.querySelector('#unit-view-shell th[data-sort="charged"]').getAttribute('aria-sort'),
    marked: document.querySelector('#unit-view-shell th[data-sort="charged"]').classList.contains('sorted-asc'),
  }));
  await clickHdr('charged'); await clickHdr('charged');   // back to default

  // ---- Option Filters: switch off "no coverage at all" ----
  const before = await page.evaluate(() => ({
    discrepancies: unitEntries.filter(e=>e.category==='discrepancy').length,
    hidden: unitEntries.reduce((n,e)=>n+e.hiddenCount,0),
    kpi: document.getElementById('kpi-row').textContent,
  }));
  await page.click('#discrepancy-filter-panel > summary');
  await page.click('input[data-check-key="noCoverage"]');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const e105 = unitEntries.find(e=>e.unit==='105');
    const row = document.querySelector('#results-body tr.unit-row[data-unit="105"]');
    return {
      discrepancies: unitEntries.filter(e=>e.category==='discrepancy').length,
      hidden: unitEntries.reduce((n,e)=>n+e.hiddenCount,0),
      kpi: document.getElementById('kpi-row').textContent,
      stillHasFinding: e105.findings.length === 1 && e105.findings[0].key === 'noCoverage',
      findingMarkedHidden: e105.findings[0].hiddenByFilter === true,
      rowPresent: !!row,
      rowText: row ? row.textContent : '',
      persisted: localStorage.getItem('auditly_deposit_hidden_checks'),
    };
  });
  // The hidden finding must still be readable in that unit's own detail.
  await page.click('#results-body tr.unit-row[data-unit="105"]');
  const hiddenDetail = await page.evaluate(() => {
    const d = document.querySelector('#results-body tr.detail-row');
    return { text: d ? d.textContent : '', muted: !!d && !!d.querySelector('.finding.muted') };
  });
  await page.click('#results-body tr.unit-row[data-unit="105"]');

  // ---- Exports, while a finding is hidden ----
  const csvRows = await page.evaluate(() => buildExportRows());
  const pdfHtml = await page.evaluate(() => buildPdfReportHtml());

  const downloadPromise = page.waitForEvent('download');
  await page.click('#export-csv-btn');
  const download = await downloadPromise;
  const csvPath = path.join(os.tmpdir(), 'depositverify-test.csv');
  await download.saveAs(csvPath);
  const csvText = fs.readFileSync(csvPath, 'utf8');

  // Restore the filter so the tool is left in its default state.
  await page.click('input[data-check-key="noCoverage"]');

  console.log('title:', title, '| header:', headerText);
  console.log('tabs:', JSON.stringify(tabInfo));
  console.log('rows all/disc/clean:', allCount, discCount, cleanCount, '| disc units:', JSON.stringify(discUnits));
  console.log('headers:', JSON.stringify(colIdx.headers));
  console.log('unit asc:', JSON.stringify(unitAsc.slice(0,5)), '... desc:', JSON.stringify(unitDesc.slice(0,5)));
  console.log('charged asc:', JSON.stringify(chargedAsc));
  console.log('filter before:', JSON.stringify(before.discrepancies), 'after:', JSON.stringify(after.discrepancies), 'hidden:', after.hidden);
  console.log('105 row text after hiding:', after.rowText.replace(/\s+/g,' ').trim());
  console.log('csv download name:', download.suggestedFilename());

  const chargedVals = chargedAsc.filter(v=>v!=='—').map(v=>parseFloat(v.replace(/[$,]/g,'')));
  const blanksLast = arr => { let seen=false; for (const x of arr){ if (x==='—') seen=true; else if (seen) return false; } return true; };

  const checks = [
    ['Page title is "DepositVerify — Auditly AI"', title === 'DepositVerify — Auditly AI'],
    ['Header reads "DepositVerify — Auditly AI"', /DepositVerify\s+—\s+Auditly AI/.test(headerText)],
    // Tab label changed from "Discrepancies Only" to "Mismatch" for the project-wide status vocabulary standard.
    ['Three filter tabs: All / Mismatch / Match',
      tabInfo.length === 3 && /^All/.test(tabInfo[0]) && /^Mismatch/.test(tabInfo[1]) && /^Match/.test(tabInfo[2])],
    ['"All" shows every reconciled resident', allCount === 26],
    // Renamed tab: "Discrepancies Only" -> "Mismatch" (project-wide status vocabulary standard).
    ['"Mismatch" shows just the flagged units', discCount === 3 && JSON.stringify(discUnits.slice().sort()) === JSON.stringify(['105','205','999'])],
    ['"Match" shows the rest', cleanCount === 23 && cleanCount + discCount === allCount],

    ['Clicking a row expands a per-unit detail panel',
      !!detail105 && /No deposit coverage of any kind/.test(detail105) && /Surety Bonds/.test(detail105)],
    ['Clicking again collapses it', detailClosed],

    ['Every results column has a sort handle',
      ['unit','residents','coverage','charged','invoiced','expected','status','issues'].every(k => colIdx.map[k] !== undefined)],
    ['Unit sorts ascending on first click',
      JSON.stringify(unitAsc) === JSON.stringify([...unitAsc].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})))],
    ['Second click reverses it', JSON.stringify(unitDesc) === JSON.stringify([...unitAsc].reverse())],
    ['Third click returns to the default order', JSON.stringify(backToDefault) === JSON.stringify(defaultUnits)],
    ['Money columns sort numerically, not as text', chargedVals.every((v,i,a)=> i===0 || a[i-1] <= v)],
    ['Blank values sink to the bottom of an ascending sort', blanksLast(chargedAsc)],
    ['The active sort column is marked visually and via aria-sort',
      sortState.marked === true && sortState.aria === 'ascending' && sortState.key === 'charged' && sortState.dir === 1],

    ['Switching a finding type off drops it from the discrepancy count',
      before.discrepancies === 3 && after.discrepancies === 2],
    ['HIDDEN, NOT DELETED: the finding is still on the unit, marked hidden',
      after.stillHasFinding && after.findingMarkedHidden],
    ['HIDDEN, NOT DELETED: the unit still has a row in the table', after.rowPresent],
    ['That row is labelled "Hidden by Filter" and says how many findings are hidden',
      /Hidden by Filter/.test(after.rowText) && /1 finding hidden by filter/.test(after.rowText)],
    ['The finding is still readable, muted, in that unit\'s own detail',
      hiddenDetail.muted && /Hidden by Filter/.test(hiddenDetail.text) && /No deposit coverage of any kind/.test(hiddenDetail.text)],
    ['A property-wide hidden total is shown above the results',
      after.hidden === 1 && /Hidden by your filters/.test(after.kpi) && !/Hidden by your filters/.test(before.kpi)],
    ['The filter choice is persisted to localStorage', after.persisted === '["noCoverage"]'],

    ['CSV export includes hidden findings, flagged as hidden',
      // CSV Severity value changed from 'discrepancy' to 'Mismatch' (project-wide status vocabulary standard).
      csvRows.some(r => r.Unit === '105' && r.HiddenByFilter === 'yes' && r.Severity === 'Mismatch')],
    ['CSV export includes the visible findings too',
      csvRows.some(r => r.Unit === '205' && r.HiddenByFilter === 'no') && csvRows.some(r => r.Unit === '999')],
    ['CSV export carries the coverage columns',
      Object.keys(csvRows[0]).includes('SuretyBond') && Object.keys(csvRows[0]).includes('SecurityDeposit') && Object.keys(csvRows[0]).includes('Coverage')],
    ['CSV file actually downloads with the right name and content',
      download.suggestedFilename() === 'depositverify-findings.csv' &&
      /^Unit,Residents,Coverage,Finding,Severity/.test(csvText) && /\n105,/.test(csvText)],

    ['PDF report is branded "Auditly AI" / "DepositVerify"',
      /<div class="bname">Auditly AI<\/div>/.test(pdfHtml) && /<div class="btag">DepositVerify<\/div>/.test(pdfHtml)],
    ['PDF report is light-on-white, not the app\'s dark theme',
      /color:#171a24/.test(pdfHtml) && !/#0d0f16/.test(pdfHtml)],
    ['PDF report names the property from the rent roll', /Blanco Oaks Apartments/.test(pdfHtml)],
    // PDF stat label changed from "On a deposit" to "On a Traditional Security Deposit" (coverage-type rename).
    ['PDF report carries summary stats including the coverage split',
      /<span>Findings<\/span>/.test(pdfHtml) && /<span>On LeaseLock<\/span>/.test(pdfHtml) &&
      /<span>On a bond<\/span>/.test(pdfHtml) && /<span>On a Traditional Security Deposit<\/span>/.test(pdfHtml)],
    ['PDF report lists per-unit findings', /<span class="unum">205<\/span>/.test(pdfHtml) && /<span class="unum">999<\/span>/.test(pdfHtml)],
    ['PDF report excludes filtered-out findings but states how many were hidden',
      !/<span class="unum">105<\/span>/.test(pdfHtml) && /1 finding hidden by your Option Filters/.test(pdfHtml) && /<span>Hidden by filters<\/span>/.test(pdfHtml)],
    ['PDF report states the markup in force', /Markup \$2\.00/.test(pdfHtml)],

    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await browser.close();
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
