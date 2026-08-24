// Regression for: "for the month to month actual number, its different for
// everyone, and some people have it on their lease, so for example in our
// case, i want you to check special provisions 32 on the lease and it says
// 250, then prepopulate the month to month fee to whatever number that is
// without them having to type it in. If there isnt then just keep as 0"
//
// The real TAA leases state it in Special Provisions (Par. 32) as e.g.
// "A $250 month-to-month premium will be charged upon end of term". Two
// things make that hard to read: the phrase soft-wraps mid-word
// ("month-to-" / "month premium") and the lease is two-column, so unrelated
// paragraphs interleave between the halves in the extracted text.
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
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const unit = await page.evaluate(() => ({
    plain:      extractMonthToMonthPremium('A $250 month-to-month premium will be charged upon end of term.'),
    softWrap:   extractMonthToMonthPremium('(refer to chart of charges). A $250 month-to-\nmonth premium will be charged upon end'),
    spaced:     extractMonthToMonthPremium('A $175 month to month fee applies.'),
    reversed:   extractMonthToMonthPremium('A month-to-month premium of $300 will be charged.'),
    withCommas: extractMonthToMonthPremium('A $1,200 month-to-month premium applies.'),
    // Must NOT pick up unrelated figures from the neighbouring column.
    unrelated:  extractMonthToMonthPremium('a rent/ancillary billing fee of $5.00. Certified funds required.'),
    liability:  extractMonthToMonthPremium('Required Insurance Liability Limit (per occurrence): $ 100000.00'),
    absent:     extractMonthToMonthPremium('Certified funds required for rent payments after second NSF.'),
    empty:      extractMonthToMonthPremium(''),
    nul:        extractMonthToMonthPremium(null),
  }));
  console.log('unit-level:', JSON.stringify(unit));

  const defaultBefore = await page.evaluate(() => ({ expected: MTM_FEE_EXPECTED, box: document.getElementById('mtm-fee-input').value }));

  // Real leases: A105 (Blanco Oaks) states $250 in Par. 32.
  const files = ['A105_2022-2023.pdf','A105_2023-2024.pdf','A105_2024-2025.pdf',
                 'A105_2025-2026_current.pdf','A105_2026-2027_signed_renewal.pdf']
                 .map(f => path.resolve('./a105_test/' + f));
  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./a105_test/A105_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:90000});
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const prem = [];
    for (const g of rawSuccessByUnit.values()) for (const it of g)
      if (it.verification) prem.push(it.verification.mtmPremium);
    return {
      premiums: prem,
      expected: MTM_FEE_EXPECTED,
      box: document.getElementById('mtm-fee-input').value,
      source: document.getElementById('mtm-fee-source').textContent,
      boxColor: getComputedStyle(document.querySelector('#mtm-fee-input')).color,
    };
  });
  console.log('after real leases:', JSON.stringify(after, null, 1));

  // A manual edit must not be clobbered by a later re-parse.
  await page.evaluate(() => {
    const i = document.getElementById('mtm-fee-input');
    i.value = '99'; i.dispatchEvent(new Event('change'));
  });
  await page.evaluate(() => { syncMtmFeeFromLeases(); });
  const afterManual = await page.evaluate(() => ({ expected: MTM_FEE_EXPECTED, box: document.getElementById('mtm-fee-input').value }));

  const rgb = after.boxColor.match(/\d+/g).map(Number);
  const isDarkText = rgb[0] < 120 && rgb[1] < 120 && rgb[2] < 120;

  const checks = [
    ['Reads a plain "$250 month-to-month premium"', unit.plain === 250],
    ['Reads it even when the phrase soft-wraps mid-word', unit.softWrap === 250],
    ['Reads "month to month fee" spelled without hyphens', unit.spaced === 175],
    ['Reads "month-to-month premium of $300" (amount after the phrase)', unit.reversed === 300],
    ['Handles thousands separators', unit.withCommas === 1200],
    ['Ignores an unrelated $5.00 billing fee nearby', unit.unrelated === null],
    ['Ignores a six-figure liability limit in the next column', unit.liability === null],
    ['Returns null when the lease states no premium', unit.absent === null],
    ['Handles empty/null input safely', unit.empty === null && unit.nul === null],
    ['Default is 0 before any lease is read (per "if there isnt then just keep as 0")', defaultBefore.expected === 0 && defaultBefore.box === '0'],
    ['Real A105 leases yield a $250 premium', after.premiums.filter(p => p === 250).length > 0],
    ['The fee box is prepopulated to 250 with no typing', after.box === '250' && after.expected === 250],
    ['The UI says where the number came from', /Special Provisions/i.test(after.source) && /250/.test(after.source)],
    ['The fee box text is dark enough to actually read', isDarkText],
    ['A manually typed value is not overwritten by auto-fill', afterManual.expected === 99 && afterManual.box === '99'],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await page.evaluate(() => localStorage.clear());
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
