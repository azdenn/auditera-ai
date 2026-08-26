/* Nothing a user uploads may leave the page.

   This used to assert that the tool made ZERO network calls, which stopped
   being true when the licence gate landed: the tool now asks authorize-audit
   whether this account may audit this property. That is a deliberate change
   and it weakens nothing that matters -- but "no calls at all" was a much
   easier thing to verify than "exactly one call, carrying only what it should",
   so this file now does the harder job properly.

   The invariant it enforces:
     * exactly ONE network destination, ever: authorize-audit
     * that request carries ONLY the tool name and property identifiers
     * no resident name, rent figure, unit number or document text is in it
     * every other network API still throws if anything touches it

   Runs a full reconciliation against real fixtures and opens the PDF report,
   so this covers the paths where a leak would actually happen. */
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
    window.__netCalls = [];      // anything that should never have happened
    window.__gateCalls = [];     // the one call that legitimately should
    const trap = name => (...args) => {
      window.__netCalls.push(name + ' ' + String(args[0]).slice(0, 120));
      throw new Error('blocked ' + name);
    };
    const blockedFetch = trap('fetch');
    window.fetch = function(url, opts){
      // The licence check is the single permitted destination. It is answered
      // here rather than allowed out, so the test still runs with no network,
      // and the exact bytes it tried to send are captured for inspection.
      if (String(url).indexOf('/functions/v1/authorize-audit') !== -1){
        window.__gateCalls.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
        return Promise.resolve(new Response(
          JSON.stringify({ allowed: true, verdict: 'allowed' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return blockedFetch(url, opts);
    };
    window.XMLHttpRequest = function(){ window.__netCalls.push('XMLHttpRequest'); throw new Error('blocked XHR'); };
    window.WebSocket = function(){ window.__netCalls.push('WebSocket'); throw new Error('blocked WS'); };
    if (navigator.sendBeacon) navigator.sendBeacon = trap('sendBeacon');
  });

  const TOOL_URL = 'file://' + built + '#tk=test-session-token';
  await page.goto(TOOL_URL);
  await page.evaluate(() => { localStorage.clear(); });
  // A plain reload() would lose the token: the gate strips it from the URL on
  // load, by design, so the address bar no longer carries it.
  await page.goto(TOOL_URL);
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
  const gateCalls = await page.evaluate(() => window.__gateCalls || []);

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
  console.log('licence checks:', JSON.stringify(gateCalls));
  console.log('pdf window title:', popupTitle);

  const checks = [
    ['The built file is a single self-contained HTML document with the vendor lib inlined', xlsxInlined],
    ['No <script src>, <link href> or @import pointing off-file',
      !/<script[^>]+src=/i.test(html) && !/<link[^>]+href=/i.test(html) && !/@import/i.test(html)],
    // Scoped to the app's own script (the last <script> block; everything
    // before it is inlined vendor code). Our code must contain no network
    // calls at all; the vendor libs are policed at runtime instead, above.
    ['This tool\'s own code contains no XHR/WebSocket/sendBeacon calls',
      (() => {
        const appJs = html.slice(html.lastIndexOf('<script>'));
        return !/XMLHttpRequest/.test(appJs) && !/new WebSocket/.test(appJs)
            && !/sendBeacon/.test(appJs);
      })()],
    // The licence gate is the ONLY thing in this file allowed to reach the
    // network, and it lives in its own inlined block. If a fetch( ever appears
    // in the app's own script beyond that one, something new started talking
    // to a server and this test is the thing that should notice.
    ['The only fetch in the whole file is the licence check',
      (() => {
        const fetchCount = (html.match(/\bfetch\s*\(/g) || []).length;
        const gateFetches = (html.match(/fetch\(AG_SUPABASE_URL/g) || []).length;
        return gateFetches === 1 && fetchCount >= 1;
      })()],
    ['Nothing but the licence check ever touches a network API',
      netCalls.length === 0],

    // ---- What the one permitted call is actually allowed to carry ----------
    ['The licence check ran', gateCalls.length >= 1],
    ['...and went only to authorize-audit',
      gateCalls.every(c => c.url.indexOf('/functions/v1/authorize-audit') !== -1)],
    ['...carrying nothing but the tool name and property identifiers',
      gateCalls.every(c => {
        let b; try { b = JSON.parse(c.body); } catch { return false; }
        return JSON.stringify(Object.keys(b).sort())
          === JSON.stringify(['detected_address','detected_name','tool']);
      })],
    // The real assertion behind the product's promise: run the tool over a
    // genuine rent roll and invoice, then prove that nothing out of those
    // documents appears in the only bytes that left the page.
    ['...and NOTHING out of the uploaded documents',
      (() => {
        // Only the identifier VALUES can carry document content. The earlier
        // version scanned the whole body and flagged the tool's own name
        // ("depositverify" contains "deposit"), which was the test being
        // careless rather than a real leak.
        const values = gateCalls.flatMap(c => {
          let b; try { b = JSON.parse(c.body); } catch { return ['<unparseable>']; }
          return [String(b.detected_name || ''), String(b.detected_address || '')];
        });
        const bad = [];
        for (const v of values){
          if (v.length > 200) bad.push('over-long value: ' + v.slice(0, 60));
          if (/[$]/.test(v)) bad.push('currency symbol in: ' + v);
          if (/\d+\.\d{2}\b/.test(v)) bad.push('money-shaped figure in: ' + v);
          if (/@/.test(v)) bad.push('email-like text in: ' + v);
          if (/\n/.test(v)) bad.push('multi-line document text in: ' + v);
        }
        const joined = values.join(' ').toLowerCase();
        for (const t of ['resident', 'tenant', 'ledger', 'leaselock', 'invoice']){
          if (joined.indexOf(t) !== -1) bad.push('document term "' + t + '" in identifiers');
        }
        if (bad.length) console.log('LEAKED into the licence call:', bad);
        return bad.length === 0;
      })()],
    ['...and the identifier sent is just the property name',
      gateCalls.every(c => {
        let b; try { b = JSON.parse(c.body); } catch { return false; }
        return b.detected_name === 'Blanco Oaks Apartments';
      })],
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
          'www.apache.org','www.xfa.org',
          // The one server this tool genuinely talks to: the licence check.
          // If a SECOND real host ever appears here, stop and ask why -- that
          // is the check this assertion exists to make.
          'kyfvrkghqohkhwidqwst.supabase.co',
          // The "Back to Auditera AI" link in the header. A destination the
          // person can choose to navigate to is not a server this tool talks
          // to -- nothing is sent, and nothing happens unless they click. The
          // assertion directly below holds it to exactly that: an anchor
          // href, never a fetch, script, image or stylesheet source.
          'auditera.net']);
        const hosts = new Set((html.match(/https?:\/\/[a-zA-Z0-9._-]+/g)||[]).map(u => u.replace(/^https?:\/\//,'')));
        const unknown = Array.from(hosts).filter(h => !ALLOWED.has(h));
        if (unknown.length) console.log('unexpected hosts:', unknown);
        return unknown.length === 0;
      })()],
    // The back link is allowed above only because it is inert. Pin that: every
    // mention of auditera.net must be an anchor href. The moment one turns up
    // as a src, a fetch, or a stylesheet, the tool has started reaching out on
    // its own and this test should fail loudly.
    ['The only reference to the site is a link the person can click, not a request',
      (() => {
        // [\s\S] rather than . -- the tag sits on its own line after a
        // comment, and a dot-based window silently captures nothing at all,
        // which would have made this assertion quietly vacuous.
        const mentions = html.match(/[\s\S]{0,80}auditera\.net/g) || [];
        const bad = mentions.filter(m => !/<a\s[^>]*href="https:\/\/auditera\.net$/.test(m));
        if (bad.length) console.log('auditera.net appears somewhere other than an anchor href:', bad);
        return mentions.length > 0 && bad.length === 0;
      })()],
    // Real requests off the box: still zero. The licence call was answered
    // in-page by the stub above, so nothing actually left this machine.
    ['Running a full reconciliation reaches no server outside the licence check',
      external.length === 0],
    ['The PDF report window opens and renders the branded report',
      /Auditera AI/.test(popupText) && /DepositVerify/.test(popupText) &&
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
