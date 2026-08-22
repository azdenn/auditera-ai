/* The built file has to work from a file:// URL on a machine with no network,
   and nothing a user uploads may leave the page. This loads the real built
   artifact, runs a full reconciliation, opens the PDF report window, and
   asserts that the only request the browser ever made was for the HTML file
   itself. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const built = path.resolve(__dirname, 'deposit_reconciler.html');
  const html = fs.readFileSync(built, 'utf8');

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  const requests = [];
  ctx.on('request', r => requests.push(r.url()));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Source-scanning for the string "fetch(" stopped being meaningful once
  // pdf.js was inlined: pdf.js *contains* fetch/XHR code paths for loading a
  // PDF from a URL, even though this tool always hands it an ArrayBuffer and
  // those paths are never taken. Rather than trusting a substring, poison
  // every network API before any script runs, so an actual call from
  // anywhere -- our code or a vendor lib -- is caught red-handed.
  await page.addInitScript(() => {
    window.__netCalls = [];
    const trap = name => (...args) => {
      window.__netCalls.push(name + ' ' + String(args[0]).slice(0, 120));
      throw new Error('blocked ' + name);
    };
    window.fetch = trap('fetch');
    window.XMLHttpRequest = function(){ window.__netCalls.push('XMLHttpRequest'); throw new Error('blocked XHR'); };
    window.WebSocket = function(){ window.__netCalls.push('WebSocket'); throw new Error('blocked WS'); };
    if (navigator.sendBeacon) navigator.sendBeacon = trap('sendBeacon');
  });

  await page.goto('file://' + built);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice.csv'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:60000});

  // Re-run with the REAL PDF invoice, since that is what exercises pdf.js --
  // the library whose presence made the old substring scan fail.
  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'real/BOA_LeaseLock_Invoice.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'real/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.?$/.test(document.getElementById('parse-status').textContent.trim()), {timeout:90000});
  const netCalls = await page.evaluate(() => window.__netCalls || []);

  // Exercise the PDF report end-to-end (it opens a real second window).
  const popupPromise = page.waitForEvent('popup');
  await page.click('#export-pdf-btn');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const popupText = await popup.evaluate(() => document.body.innerText);
  const popupTitle = await popup.title();
  await popup.close();

  const external = requests.filter(u => !u.startsWith('file://') && !u.startsWith('about:') && !u.startsWith('blob:') && !u.startsWith('data:'));
  const xlsxInlined = /XLSX/.test(html) && !/<!--XLSX_LIB-->/.test(html);

  console.log('built size:', (fs.statSync(built).size/1024/1024).toFixed(2), 'MB');
  console.log('requests:', JSON.stringify(requests));
  console.log('trapped network calls:', JSON.stringify(netCalls));
  console.log('pdf window title:', popupTitle);

  const checks = [
    ['The built file is a single self-contained HTML document with the vendor lib inlined', xlsxInlined],
    ['No <script src>, <link href> or @import pointing off-file',
      !/<script[^>]+src=/i.test(html) && !/<link[^>]+href=/i.test(html) && !/@import/i.test(html)],
    // Scoped to the app's own script (the last <script> block; everything
    // before it is inlined vendor code). Our code must contain no network
    // calls at all; the vendor libs are policed at runtime instead, above.
    ['This tool\'s own code contains no fetch/XHR/WebSocket/sendBeacon calls',
      (() => {
        const appJs = html.slice(html.lastIndexOf('<script>'));
        return !/\bfetch\s*\(/.test(appJs) && !/XMLHttpRequest/.test(appJs)
            && !/new WebSocket/.test(appJs) && !/sendBeacon/.test(appJs);
      })()],
    ['No network API is ever actually called, even from inside pdf.js/SheetJS', netCalls.length === 0],
    // SheetJS carries OOXML/ODF namespace URIs as string literals. Those are
    // XML identifiers, never fetched -- so rather than banning the substring
    // "http", assert that every host appearing anywhere in the file is one of
    // those known schema namespaces, and that nothing is ever POSTed.
    ['No form posts or upload endpoints', !/<form/i.test(html) && !/\baction\s*=\s*["']https?:/i.test(html)],
    ['Every URL in the file is an XML schema namespace, not a server it talks to',
      (() => {
        const ALLOWED = new Set(['docs.oasis-open.org','macVmlSchemaUri','openoffice.org','purl.oclc.org',
          'purl.org','schemas.microsoft.com','schemas.openxmlformats.org','sheetjs.com',
          'sheetjs.openxmlformats.org','www.w3.org',
          // pdf.js carries PDF/XMP spec namespace URIs as string literals,
          // same category as SheetJS's OOXML ones -- identifiers, not servers.
          'ns.adobe.com','www.adobe.com','www.npmjs.com','mozilla.github.io','github.com',
          'creativecommons.org','iptc.org','purl.oclc.org.','www.aiim.org','danbri.org',
          'web.resource.org','xmlns.com','www.iptc.org','ns.useplus.org','developer.mozilla.org',
          // Apache licence header text, and the XFA forms XML namespace.
          'www.apache.org','www.xfa.org']);
        const hosts = new Set((html.match(/https?:\/\/[a-zA-Z0-9._-]+/g)||[]).map(u => u.replace(/^https?:\/\//,'')));
        const unknown = Array.from(hosts).filter(h => !ALLOWED.has(h));
        if (unknown.length) console.log('unexpected hosts:', unknown);
        return unknown.length === 0;
      })()],
    ['Running a full reconciliation makes zero network requests', external.length === 0],
    ['The PDF report window opens and renders the branded report',
      /Auditly AI/.test(popupText) && /DepositVerify/.test(popupText) &&
      /Deposit Coverage/.test(popupTitle) && /Blanco Oaks Apartments/.test(popupText)],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await browser.close();
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
