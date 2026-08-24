// Closes a gap I flagged as untested: an invoice line for a unit that ALSO
// holds a security deposit or surety bond.
//
// The standing rule is "don't flag units that don't pay LeaseLock -- a
// deposit means they already paid". But being ON the invoice means LeaseLock
// IS billing the property for that unit, so the money is going out either
// way. Suppressing it would hide a real cost; reporting it as "the resident
// was never billed" would be wrong advice, because billing someone who
// already has a deposit on file is not the fix. The policy is redundant and
// should be cancelled, and the finding has to say that.
//
// Fixture: the real rent roll with unit 403 (which IS on the real invoice)
// turned into an occupied unit holding a $900 security deposit.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

async function run(browser, rentroll){
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./deposit_reconciler.html') + GATE_HASH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles('#invoice-file', path.resolve('./real/BOA_LeaseLock_Invoice.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve(rentroll));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout:90000});
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const e = unitEntries.find(x => String(x.unit) === '403');
    return e ? {
      category: e.category, coverage: e.coverageLabel, charged: e.charged, invoiced: e.invoiced,
      notes: (e.findings||[]).map(f => f.note).join(' | '),
      onDeposit: !!e.cov.onDeposit,
      depositChipCount: null,
    } : null;
  });
  // The coverage chips must still count this resident under their real cover.
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.cov-chip')).map(c => c.textContent.replace(/\s+/g,' ').trim()));
  await page.close();
  return { r, chips, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const overlap = await run(browser, './fixtures/BOA_rentroll_overlap.xlsx');
  const vacant  = await run(browser, './real/BOA_rentroll.xlsx');

  console.log('OVERLAP:', JSON.stringify(overlap.r, null, 1));
  console.log('chips  :', overlap.chips.join(' | '));
  console.log('VACANT :', JSON.stringify(vacant.r, null, 1));

  const o = overlap.r, v = vacant.r;
  const checks = [
    ['An invoiced unit that already holds a deposit is still reported (real money leaving)', !!o && o.category === 'discrepancy'],
    ['It is recognised as covered by the deposit, not as uncovered', !!o && o.onDeposit === true && /deposit/i.test(o.coverage)],
    ['The finding names the actual deposit amount on file', !!o && /\$900\.00/.test(o.notes)],
    ['The finding says the LeaseLock policy is redundant', !!o && /redundant/i.test(o.notes)],
    ['The finding recommends cancelling, not billing the resident', !!o && /cancelled with LeaseLock|should probably be cancelled/i.test(o.notes)],
    ['It does NOT tell the user to bill a resident who already has a deposit', !!o && !/never billed/i.test(o.notes)],
    ['It states the ongoing monthly cost', !!o && /\$31\.00 a month/.test(o.notes)],
    // Coverage chip renamed "Security deposits" -> "Traditional Security Deposits" (coverage-type rename).
    ['The deposit chip still counts this resident', overlap.chips.some(c => /Traditional Security Deposits\s+10/.test(c))],
    ['Control: the genuinely-vacant case still leads with the empty-unit framing', !!v && /vacant on the Rent Roll/i.test(v.notes)],
    ['Control: the vacant case does not claim a redundant policy', !!v && !/redundant/i.test(v.notes)],
    ['No script errors', overlap.errors.length === 0 && vacant.errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  if (!allPass){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
