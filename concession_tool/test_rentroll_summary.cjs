// Same Rent Roll Summary guard as LeaseVerify -- this tool reads the same
// ResMan export, so grabbing the summary by mistake is just as likely here.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./concession_reconciler.html'));
  const direct = await page.evaluate(() => ({
    summary: looksLikeRentRollSummary([[null],['Blanco Oaks'],['Rent Roll Summary']]),
    plain: looksLikeRentRollSummary([[null],['Blanco Oaks'],['Rent Roll']]),
  }));
  await page.setInputFiles('#rentroll-file', path.resolve('./BOA_rentroll_SUMMARY.xlsx'));
  await page.setInputFiles('#ledger-files', path.resolve('./Ledger_A109_badcharges.xlsx'));
  await page.click('#process-btn');
  await page.waitForTimeout(2500);
  const ui = await page.evaluate(() => document.body.innerText);
  await page.reload();
  await page.setInputFiles('#rentroll-file', path.resolve('./RentRoll.xlsx'));
  await page.setInputFiles('#ledger-files', path.resolve('./Ledger_A109_badcharges.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:90000});
  const realWorks = await page.evaluate(() => unitEntries.length > 0);
  console.log((ui.match(/[^\n]*[Ss]ummary[^\n]*/g)||['(none)']).slice(0,3).join('\n'));
  const checks = [
    ['Detector flags the summary export', direct.summary === true],
    ['Detector passes a normal rent roll', direct.plain === false],
    ['Uploading the summary shows the guidance message', /Rent Roll Summary/i.test(ui) && /Rent Roll" report instead/i.test(ui)],
    ['No cryptic header-row error shown', !/Could not find a header row/i.test(ui)],
    ['Real rent roll still parses', realWorks === true],
  ];
  let allPass = true;
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
