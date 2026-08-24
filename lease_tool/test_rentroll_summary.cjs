// Regression for: "in resman, they have two options of downloading the
// 'rent roll' and the 'rent roll summary' so need to make sure if the rent
// roll summary is uploaded then the tool will say something and ask the user
// to upload the rent roll"
//
// The summary export has no per-unit Description/Amount charge lines, so
// there is genuinely nothing to reconcile. Before this, it failed with a
// cryptic "could not find a header row" message that gave the user no idea
// they'd simply grabbed the wrong report. Now it names the problem and the
// fix. The real rent roll must of course still parse normally.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  // Direct: the detector itself, plus a guard that a normal rent roll whose
  // unit data merely mentions the words is not falsely rejected.
  const direct = await page.evaluate(() => ({
    summaryMasthead: looksLikeRentRollSummary([[null],['Blanco Oaks'],['Rent Roll Summary'],['8/14/2026']]),
    plainRentRoll: looksLikeRentRollSummary([[null],['Blanco Oaks'],['Rent Roll'],['8/14/2026']]),
    // A charge description containing the phrase must not trip it, and it
    // must only look at the masthead block, not deep into unit rows.
    deepInData: looksLikeRentRollSummary(Array.from({length:40}, (_,i) => i === 30 ? ['Rent Roll Summary'] : [null])),
    embeddedInCharge: looksLikeRentRollSummary([[null],['Rent Roll'],[null],['Rent Roll Summary Fee']]),
  }));

  // E2E: uploading the summary must surface the guidance message.
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll_SUMMARY.xlsx'));
  await page.setInputFiles('#lease-files', path.resolve('./boa_test/406_expired_lease.pdf'));
  await page.click('#process-btn');
  await page.waitForTimeout(2500);
  const summaryUi = await page.evaluate(() => document.body.innerText);

  // E2E: the real rent roll still works.
  await page.reload();
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll.xlsx'));
  await page.setInputFiles('#lease-files', path.resolve('./boa_test/406_expired_lease.pdf'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  const realWorks = await page.evaluate(() => unitEntries.length > 0 && !!unitEntries.find(e => e.unit === '406'));

  console.log('=== direct ===', JSON.stringify(direct, null, 2));
  console.log('=== summary upload UI (excerpt) ===');
  console.log((summaryUi.match(/[^\n]*[Ss]ummary[^\n]*/g) || ['(no summary text found)']).slice(0,4).join('\n'));

  const checks = [
    ['Detector: "Rent Roll Summary" masthead is detected', direct.summaryMasthead === true],
    ['Detector: a plain "Rent Roll" masthead is NOT detected', direct.plainRentRoll === false],
    ['Detector: only looks at the masthead, not deep into unit rows', direct.deepInData === false],
    ['Detector: a charge named "Rent Roll Summary Fee" does not trip it', direct.embeddedInCharge === false],
    ['E2E: uploading the summary tells the user it is the summary', /Rent Roll Summary/i.test(summaryUi)],
    ['E2E: the message tells them to run the "Rent Roll" report instead', /run the "Rent Roll" report|Rent Roll" report instead/i.test(summaryUi)],
    ['E2E: no cryptic "could not find a header row" wording is shown', !/Could not find a header row/i.test(summaryUi)],
    ['E2E: the real full rent roll still parses normally', realWorks === true],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) { console.log((pass?'PASS':'FAIL') + ' -- ' + label); if (!pass) allPass = false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
