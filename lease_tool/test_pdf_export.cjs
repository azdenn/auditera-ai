// Regression for: "Make a pdf export of all the mismatches that matches the
// website and is polished"
//
// The report is generated as a print-styled HTML document handed to the
// browser's print-to-PDF, so the output is real vector text and carries the
// Auditly AI branding. This test renders that document, asserts its content
// is correct and complete, and then actually produces a PDF from it via
// Playwright to prove it lays out as pages rather than only looking right
// on screen.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));
  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));
  await page.reload();
  await page.setInputFiles('#lease-files', [
    path.resolve('./boa_test/303_old_expired_lease.pdf'),
    path.resolve('./boa_test/406_expired_lease.pdf'),
  ]);
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:90000});
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    const html = buildPdfReportHtml();
    const rows = buildPdfReportRows();
    const clean = unitEntries.filter(e => e.category === 'clean').length;
    return {
      html,
      unitCount: rows.filter(u=>u.lines.length).length,
      noCompare: rows.filter(u=>!u.lines.length).length,
      findings: rows.reduce((n,u)=>n+u.lines.length,0),
      cleanCount: clean,
      units: rows.filter(u=>u.lines.length).map(u=>u.unit),
      hasButton: !!document.getElementById('export-pdf-btn'),
      btnText: document.getElementById('export-pdf-btn').textContent,
    };
  });

  // Hidden-by-filter findings must be excluded from the report body but
  // still disclosed in the summary, so the report never understates.
  const hiddenInfo = await page.evaluate(() => {
    document.getElementById('discrepancy-filter-panel').open = true;
    HIDDEN_CHECK_KEYS.add('charge:RENT'); saveHiddenCheckKeys(); reconcileAll();
    const rows = buildPdfReportRows();
    const html = buildPdfReportHtml();
    HIDDEN_CHECK_KEYS.delete('charge:RENT'); saveHiddenCheckKeys(); reconcileAll();
    // "Hidden by filters" -> "Hidden by Filter": the project-wide status
    // vocabulary standard, which the report now uses everywhere.
    return { anyRentLine: rows.some(u=>u.lines.some(l=>l.item==='Rent')), mentionsHidden: /Hidden by Filter/.test(html) };
  });

  // Render the generated document and print it to a real PDF.
  const rp = await browser.newPage();
  const rerrors = [];
  rp.on('pageerror', e => rerrors.push(e.message));
  await rp.setContent(info.html, {waitUntil:'load'});
  const out = path.resolve('./boa_test/report_render.pdf');
  await rp.pdf({path: out, format:'Letter', printBackground:true});
  const size = fs.statSync(out).size;
  const visible = await rp.evaluate(() => ({
    brand: (document.querySelector('.bname')||{}).textContent,
    tool: (document.querySelector('.btag')||{}).textContent,
    h1: (document.querySelector('h1')||{}).textContent,
    statCount: document.querySelectorAll('.stat').length,
    unitBlocks: document.querySelectorAll('section.unit').length,
    tables: document.querySelectorAll('section.unit table').length,
    bodyText: document.body.innerText,
    // A printed report on a dark background would be unreadable/wasteful.
    bg: getComputedStyle(document.body).backgroundColor,
    rollupRows: document.querySelectorAll('section.rollup tbody tr').length,
  }));

  console.log(JSON.stringify({unitCount:info.unitCount, findings:info.findings, units:info.units,
    visible:{brand:visible.brand, tool:visible.tool, h1:visible.h1, statCount:visible.statCount,
             unitBlocks:visible.unitBlocks, tables:visible.tables, bg:visible.bg, rollupRows:visible.rollupRows},
    hiddenInfo, pdfBytes:size}, null, 2));

  const checks = [
    ['A PDF export button exists', info.hasButton && /pdf/i.test(info.btnText)],
    ['Report is branded Auditly AI', visible.brand === 'Auditly AI'],
    ['Report names the LeaseVerify tool', /LeaseVerify/i.test(visible.tool||'')],
    // Title is now "Mismatch Report" -- "Discrepancy" is banned by the
    // project-wide status vocabulary standard.
    ['Report has a clear title', /Mismatch Report/i.test(visible.h1||'')],
    ['Report names the property from the rent roll', /Blanco Oaks/i.test(visible.bodyText)],
    ['Report shows summary stat tiles', visible.statCount >= 3],
    ['"Units affected" counts only units with real findings, not un-checkable ones', /2\s*UNITS AFFECTED/i.test(visible.bodyText.replace(/\n/g,' '))],
    ['Units with nothing to compare are rolled up compactly, not one card each', visible.rollupRows === info.noCompare && info.noCompare > 0],
    ['The roll-up explains why those units were not checked', /no lease PDF was uploaded/i.test(visible.bodyText)],
    ['Every affected unit gets its own block', visible.unitBlocks === info.unitCount && info.unitCount > 0],
    ['Unit blocks contain mismatch tables', visible.tables > 0],
    ['Real unit 303 appears in the report', info.units.includes('303')],
    ['Report body carries the actual findings', /Rent/.test(visible.bodyText) && /In ResMan/i.test(visible.bodyText)],
    ['Report is light-on-white for printing, not the app dark theme', visible.bg === 'rgb(255, 255, 255)' || visible.bg === 'rgba(0, 0, 0, 0)'],
    ['Filtered-out findings are excluded from the report body', hiddenInfo.anyRentLine === false],
    ['...but the report still discloses that findings were hidden', hiddenInfo.mentionsHidden === true],
    ['Renders to a real multi-byte PDF', size > 8000],
    ['No script errors in the tool', errors.length === 0],
    ['No script errors in the report document', rerrors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  if (!allPass){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
