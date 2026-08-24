const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  for (const f of ['synthetic_T003_noisy_no_trash.pdf', 'synthetic_T004_addendum2.pdf', 'synthetic_T001_addendum.pdf', 'synthetic_T002_checkbox.pdf']) {
    await page.setInputFiles('#lease-files', [path.resolve('./' + f)]);
    const result = await page.evaluate(async () => {
      const file = document.getElementById('lease-files').files[0];
      return await parseLeasePdf(file);
    });
    const trashItems = result.rawItems.filter(r => /trash/i.test(r.rawLabel));
    console.log('===', f, '=== unit:', result.unit, ' trash raw items:', JSON.stringify(trashItems));
  }

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
