// Regression for: "Make it to where you click the choose file button and then
// you get promoted if your choose an individual file or zip file."
//
// A single "Choose lease files…" button now asks which kind of upload this
// is and opens the matching file browser in one action, instead of making
// the user set a mode and then find the right drop zone. The mode chips stay
// available for switching afterwards.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  const hiddenAtRest = await page.isHidden('#upload-choice-modal');
  // There is no separate button any more: clicking the file drop zone itself
  // must raise the prompt BEFORE any native file browser appears.
  const noExtraButton = (await page.$('#choose-lease-btn')) === null;
  let earlyPicker = false;
  page.on('filechooser', () => { earlyPicker = true; });
  await page.click('#drop-lease');
  await page.waitForTimeout(250);
  const openAfterClick = await page.isVisible('#upload-choice-modal');
  const pickerHeldBack = earlyPicker === false;
  const optCount = await page.$$eval('#upload-choice-modal .choice-opt', e => e.length);
  const optText = await page.$$eval('#upload-choice-modal .choice-opt', e => e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));

  // Escape dismisses.
  await page.keyboard.press('Escape');
  const closedByEsc = await page.isHidden('#upload-choice-modal');

  // Choosing ZIP must switch mode, close the modal, and open the ZIP picker.
  await page.click('#drop-lease');
  let pickerOpened = false;
  page.on('filechooser', async fc => { pickerOpened = true; await fc.setFiles([]); });
  await page.click('#upload-choice-modal .choice-opt[data-choice="zip"]');
  await page.waitForTimeout(400);
  const afterZip = await page.evaluate(() => ({
    mode: uploadMode,
    modalHidden: document.getElementById('upload-choice-modal').classList.contains('hidden'),
    zipShown: !document.getElementById('drop-zip').classList.contains('hidden'),
    leaseHidden: document.getElementById('drop-lease').classList.contains('hidden'),
    chipActive: document.querySelector('#upload-mode-toggle .mode-btn[data-mode="zip"]').classList.contains('active'),
  }));

  // Choosing individual switches back.
  await page.click('#drop-zip');
  await page.click('#upload-choice-modal .choice-opt[data-choice="individual"]');
  await page.waitForTimeout(400);
  const afterInd = await page.evaluate(() => ({
    mode: uploadMode,
    leaseShown: !document.getElementById('drop-lease').classList.contains('hidden'),
  }));

  // The legacy chips still work (and existing zip tests rely on them).
  const chipStillWorks = await page.evaluate(() => {
    setUploadMode('zip');
    const chip = document.querySelector('#upload-mode-toggle .mode-btn[data-mode="zip"]');
    return uploadMode === 'zip'
      && !document.getElementById('drop-zip').classList.contains('hidden')
      && chip.classList.contains('active')                                   // chips stay in sync
      && document.getElementById('upload-mode-toggle').classList.contains('hidden'); // but are no longer shown
  });

  console.log(JSON.stringify({hiddenAtRest, openAfterClick, optText, closedByEsc, afterZip, afterInd, chipStillWorks, pickerOpened}, null, 2));
  const checks = [
    ['Modal is hidden at rest', hiddenAtRest === true],
    ['The separate "choose files" button is gone', noExtraButton === true],
    ['Clicking the file drop zone opens the prompt', openAfterClick === true],
    ['The native file browser does NOT open before the prompt is answered', pickerHeldBack === true],
    ['Prompt offers exactly two options', optCount === 2],
    ['Prompt names the individual-PDF option', /individual lease pdfs/i.test(optText.join(' '))],
    ['Prompt names the ZIP option', /one zip file/i.test(optText.join(' '))],
    ['Escape dismisses the prompt', closedByEsc === true],
    ['Choosing ZIP switches mode to zip', afterZip.mode === 'zip'],
    ['Choosing ZIP closes the prompt', afterZip.modalHidden === true],
    ['Choosing ZIP reveals the ZIP drop zone and hides the PDF one', afterZip.zipShown && afterZip.leaseHidden],
    ['Choosing ZIP opens the file browser in the same action', pickerOpened === true],

    ['Mode chips stay in sync with the prompt', afterZip.chipActive === true],
    ['Choosing individual switches back', afterInd.mode === 'individual' && afterInd.leaseShown],
    ['Mode switching still works and the redundant chip row is hidden', chipStillWorks === true],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
