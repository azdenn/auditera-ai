/* Reporting how a run ended — and the line it must never cross.
   ----------------------------------------------------------------------
   Asked for on 2026-09-03: track how often each user presses Process on each
   tool, plus enough about the run to tell whether the tool actually WORKED
   for them rather than merely that they opened it.

   The half nobody asks for is the half that matters. Usage statistics are the
   classic place where "documents never leave your browser" gets quietly broken
   one useful-looking field at a time — a charge label here to see what people
   audit, an amount there to size the finding. So the payload is asserted
   directly below, key by key: four numbers and a word, and a test that FAILS
   if anything resembling document content is ever added to it.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' -- ' + name); cond ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const out = await page.evaluate(async () => {
    // Capture what the reporter would actually send, without a network.
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      if (String(url).includes('record-run-outcome')){
        sent.push({ url: String(url), body: JSON.parse((opts && opts.body) || '{}') });
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      }
      return realFetch.apply(this, arguments);
    };

    AG_TOKEN = 'test-token';
    AG_OPEN_RUN = 'leaseverify';

    // A property with charges and findings, so any leak would have something
    // real to leak.
    unitEntries = [
      { unit: 'C1', issueCount: 3, residents: 'Shuyun Li',
        rows: [{ label: 'Community Fee', leaseVal: 70, resmanVal: 115, status: 'mismatch' }] },
      { unit: 'A2', issueCount: 0, residents: 'Jasmine Franklin', rows: [] },
      { unit: 'B4', issueCount: 2, residents: 'Candelario Olivo', rows: [] },
    ];

    const okFirst  = await agRecordRunOutcome('completed', { durationMs: 42000, unitCount: 3, findingCount: 5 });
    // A second report for the same run must not send anything at all.
    const okSecond = await agRecordRunOutcome('completed', { durationMs: 1, unitCount: 1, findingCount: 1 });

    // The tool's own reporter, reading the real numbers off unitEntries.
    AG_OPEN_RUN = 'leaseverify';
    lastRunStartedAt = Date.now() - 5000;
    reportRunOutcome('completed');
    await new Promise(r => setTimeout(r, 30));

    // Nothing in flight -> the global error handler must stay silent.
    AG_OPEN_RUN = null;
    const before = sent.length;
    reportRunFailure();
    await new Promise(r => setTimeout(r, 30));

    window.fetch = realFetch;
    return { sent, okFirst, okSecond, silentWhenIdle: sent.length === before };
  });

  const first = out.sent[0];
  const fromTool = out.sent[1];

  check('It reports the run', out.sent.length === 2 && !!first);
  check('...to record-run-outcome', !!first && /record-run-outcome$/.test(first.url));
  check('...with the tool, the outcome and the three numbers',
        !!first && first.body.tool === 'leaseverify' && first.body.outcome === 'completed'
        && first.body.duration_ms === 42000 && first.body.unit_count === 3 && first.body.finding_count === 5);

  check('A RUN IS COUNTED ONCE: the second report sends nothing',
        out.okFirst === true && out.okSecond === false);
  check('With no run in flight, the error handler stays quiet', out.silentWhenIdle === true);

  check('The tool counts the units it audited and the findings a person sees',
        !!fromTool && fromTool.body.unit_count === 3 && fromTool.body.finding_count === 5);
  check('...and times the wait from the button press',
        !!fromTool && fromTool.body.duration_ms >= 4000 && fromTool.body.duration_ms < 60000);

  /* THE IMPORTANT ONE.
     The payload is a closed set. Any new key fails this, which is the point:
     the next person to add "just the property name" or "just the biggest
     finding" has to come here and argue with it. */
  const allowed = ['tool','outcome','duration_ms','unit_count','finding_count'];
  const keys = Object.keys(first.body).sort();
  check('THE PAYLOAD IS EXACTLY five fields, and no more',
        keys.length === 5 && allowed.slice().sort().every((k, i) => keys[i] === k));

  const asText = JSON.stringify(out.sent);
  check('No resident name reaches the wire',
        !/Shuyun|Jasmine|Candelario/.test(asText));
  check('No charge label reaches the wire',
        !/Community Fee|Cable|Washer/i.test(asText));
  check('No amount and no unit number reaches the wire',
        !/\b(70|115|C1|A2|B4)\b/.test(asText.replace(/"(duration_ms|unit_count|finding_count)":\d+/g, '')));

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
