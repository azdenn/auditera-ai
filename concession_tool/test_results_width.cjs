// "so this cut off and doesnt look good ... It need to be on a full screen"
//
// Two faults. The results card sat inside the page's 1180px reading column
// even though its table carries 7 columns, and `.results-shell` used
// `overflow:hidden`, so anything past the edge was CUT OFF with no scrollbar
// and no way to reach it -- the Status and "What we found" columns simply
// vanished. The card now breaks out to use the screen, and the shell scrolls
// instead of clipping when the window really is too narrow.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');
const ZIP = path.resolve('./real/BOA Resident Ledgers 08-14-2026.zip');
const RR  = path.resolve('./real/BOA 2026.14- Rent Roll.xlsx');

async function measure(browser, width){
  const page = await browser.newPage({viewport:{width, height:900}});
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => { localStorage.clear(); setUploadMode('zip'); });
  await page.setInputFiles('#ledger-zip-file', ZIP);
  await page.setInputFiles('#rentroll-file', RR);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout:180000});
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const table = document.querySelector('#results-body').closest('table');
    const shell = table.parentElement;
    const lastTh = [...document.querySelectorAll('#unit-view-shell thead th')].pop();
    const before = shell.scrollLeft; shell.scrollLeft = 9999;
    const canScroll = shell.scrollLeft > before; shell.scrollLeft = before;
    return {
      card: Math.round(document.getElementById('results-card').getBoundingClientRect().width),
      shell: Math.round(shell.clientWidth),
      tableScroll: table.scrollWidth,
      needsScroll: table.scrollWidth > shell.clientWidth + 1,
      canScroll,
      lastColVisible: lastTh.getBoundingClientRect().right <= innerWidth + 1,
      pageHScroll: document.documentElement.scrollWidth > innerWidth + 1,
      overflowX: getComputedStyle(shell).overflowX,
    };
  });
  await page.close();
  return m;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const w1100 = await measure(browser, 1100);
  const w1440 = await measure(browser, 1440);
  const w1920 = await measure(browser, 1920);
  console.log(JSON.stringify({w1100, w1440, w1920}, null, 1));

  const checks = [
    ['The shell scrolls rather than clipping (was overflow:hidden)', w1440.overflowX === 'auto' || w1440.overflowX === 'scroll'],
    ['At 1440 the results use well beyond the old 1180px column', w1440.card > 1300],
    ['At 1920 they use more still', w1920.card > w1440.card],
    ['At 1440 nothing needs scrolling — every column fits', w1440.needsScroll === false],
    ['At 1920 nothing needs scrolling', w1920.needsScroll === false],
    ['At 1440 the last column is on screen', w1440.lastColVisible === true],
    ['At 1920 the last column is on screen', w1920.lastColVisible === true],
    ['On a narrow window the table is reachable by scrolling, not cut off', w1100.needsScroll === false || w1100.canScroll === true],
    ['Widening never causes horizontal scrolling of the whole page', !w1100.pageHScroll && !w1440.pageHScroll && !w1920.pageHScroll],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  if (!allPass){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
