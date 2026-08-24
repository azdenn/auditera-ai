// Regression for: "for the concession tool, its not reading the zip files
// correctly".
//
// The ZIP reader itself parses every archive shape correctly (see
// test_zip_ledgers.cjs). What broke the experience was reaching it: the ZIP
// drop zones are hidden until the mode is switched, so a ZIP selected or
// dragged into the individual-files box was handed to the .xlsx parser and
// failed. This covers the whole user path through the real UI, plus that
// self-correcting route.
const { chromium } = require('playwright');
const path = require('path');
const fflate = require('fflate');
const fs = require('fs');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

// Build the ledger ZIP the same way a real export would arrive.
const led = fs.readFileSync(path.resolve('./Ledger_A109_badcharges.xlsx'));
const led2 = fs.readFileSync(path.resolve('./Ledger_A110_6wk.xlsx'));
const zipPath = '/tmp/ledgers_ui.zip';
fs.writeFileSync(zipPath, Buffer.from(fflate.zipSync({
  'Resident Ledgers/A109 - Joshua Maldonado.xlsx': new Uint8Array(led),
  'Resident Ledgers/A110 - Cherie Moon.xlsx': new Uint8Array(led2),
  '__MACOSX/._junk.xlsx': new Uint8Array(Buffer.from('junk')),
})));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];

  // ---- Path A: the real UI flow (click the drop zone -> prompt -> ZIP) ----
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const noButton = (await page.$('#choose-files-btn')) === null;
  let earlyPicker = false;
  page.on('filechooser', () => { earlyPicker = true; });
  await page.click('#drop-ledger');
  await page.waitForTimeout(250);
  const promptOpen = await page.isVisible('#upload-choice-modal');
  const pickerHeldBack = earlyPicker === false;

  await page.click('#upload-choice-modal .choice-opt[data-choice="zip"]');
  await page.waitForTimeout(300);
  const zipZoneShown = await page.evaluate(() => ({
    mode: uploadMode,
    zipVisible: !document.getElementById('drop-ledger-zip').classList.contains('hidden'),
    individualHidden: document.getElementById('drop-ledger').classList.contains('hidden'),
  }));

  await page.setInputFiles('#ledger-zip-file', zipPath);
  await page.setInputFiles('#rentroll-file', path.resolve('./RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout:90000});
  await page.waitForTimeout(300);
  const viaUi = await page.evaluate(() => ({
    a109: !!unitEntries.find(e => e.unit === 'A109' && e.category !== 'missing_ledger'),
    a110: !!unitEntries.find(e => e.unit === 'A110' && e.category !== 'missing_ledger'),
    summary: (document.getElementById('zip-summary')||{}).innerText || '',
  }));
  await page.close();

  // ---- Path B: the ZIP dropped into the INDIVIDUAL files box ----
  const p2 = await browser.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  // Routes are per-page, so this second tab needs its own gate stub and its
  // own session token -- it is a fresh tool instance, not a continuation.
  await installGateStub(p2);
  const P2_URL = 'file://' + path.resolve('./concession_reconciler.html') + GATE_HASH;
  await p2.goto(P2_URL);
  await p2.evaluate(() => localStorage.clear());
  await p2.goto(P2_URL);
  await p2.setInputFiles('#ledger-files', zipPath);   // wrong box, on purpose
  await p2.waitForTimeout(300);
  const rerouted = await p2.evaluate(() => ({
    mode: uploadMode,
    zipInputHasFile: !!(document.getElementById('ledger-zip-file').files || []).length,
    individualCleared: (document.getElementById('ledger-files').files || []).length === 0,
  }));
  await p2.setInputFiles('#rentroll-file', path.resolve('./RentRoll.xlsx'));
  await p2.click('#process-btn');
  await p2.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout:90000});
  await p2.waitForTimeout(300);
  const viaStray = await p2.evaluate(() => ({
    a109: !!unitEntries.find(e => e.unit === 'A109' && e.category !== 'missing_ledger'),
    a110: !!unitEntries.find(e => e.unit === 'A110' && e.category !== 'missing_ledger'),
  }));

  console.log(JSON.stringify({noButton, promptOpen, pickerHeldBack, zipZoneShown, viaUi, rerouted, viaStray}, null, 1));

  const checks = [
    ['The separate "choose files" button is gone', noButton === true],
    ['Clicking the ledger box opens the individual-vs-ZIP prompt', promptOpen === true],
    ['The file browser does not open before the prompt is answered', pickerHeldBack === true],
    ['Choosing ZIP reveals the ZIP drop zones', zipZoneShown.mode === 'zip' && zipZoneShown.zipVisible && zipZoneShown.individualHidden],
    ['ZIP upload through the real UI reads A109', viaUi.a109 === true],
    ['ZIP upload through the real UI reads A110', viaUi.a110 === true],
    ['It reports what the ZIP contained', /matched to a rent roll unit/i.test(viaUi.summary)],
    ['A ZIP put in the individual-files box switches to ZIP mode automatically', rerouted.mode === 'zip'],
    ['...and is handed to the ZIP input instead of the .xlsx parser', rerouted.zipInputHasFile === true && rerouted.individualCleared === true],
    ['...and still reads both ledgers correctly', viaStray.a109 === true && viaStray.a110 === true],
    ['No script errors', errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
