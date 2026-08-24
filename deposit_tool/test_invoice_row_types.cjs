// Closes the second gap I flagged: the one real invoice available had only
// "Current" activity rows, so credit rows were never exercised. LeaseLock's
// own summary page lists Terminated, Nullified, New and Adjustment
// categories, so those detail rows do occur.
//
// The original pattern only accepted a sign written as "$-12.00". Real
// accounting formats also use "-$12.00" and "($12.00)", and neither matched
// -- meaning a terminated-policy credit would be silently dropped and the
// invoice total overstated. All three forms now parse, sign preserved.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./deposit_reconciler.html') + GATE_HASH);

  const r = await page.evaluate(() => {
    const parse = l => {
      const m = LL_ROW_RE.exec(l);
      if (!m) return null;
      const money = parseInvoiceMoneyTokens(m[5]);
      return { unit: m[1], activity: m[4].trim(), total: money[money.length-1], parts: money.slice(0,-1) };
    };
    return {
      current:    parse('106 a 2-203 8/1/26-8/31/26 Current $24.00 $7.00 $31.00'),
      newLease:   parse('107 b 2-208 7/1/26-7/31/26 New $24.00 $7.00 $31.00'),
      terminated: parse('108 c 3-301 7/1/26-7/15/26 Terminated -$12.00 -$3.50 -$15.50'),
      nullified:  parse('109 d 3-302 6/1/26-6/30/26 Nullified $-24.00 $-7.00 $-31.00'),
      parens:     parse('110 e 3-305 6/1/26-6/30/26 Adjustment ($24.00) ($7.00) ($31.00)'),
      trueUp:     parse('111 f 4-401 8/1/26-9/14/26 TrueUp $36.00 $10.50 $46.50'),
      commas:     parse('112 g 4-402 8/1/26-8/31/26 Current $1,024.00 $7.00 $1,031.00'),
      tokens: {
        minusBefore: parseInvoiceMoneyTokens('-$15.50'),
        minusAfter:  parseInvoiceMoneyTokens('$-15.50'),
        parens:      parseInvoiceMoneyTokens('($15.50)'),
        positive:    parseInvoiceMoneyTokens('$15.50'),
        mixed:       parseInvoiceMoneyTokens('$24.00 -$3.50 ($7.00)'),
      },
    };
  });
  console.log(JSON.stringify(r, null, 1));

  const checks = [
    ['"Current" rows still parse (the real invoice case)', !!r.current && r.current.total === 31],
    ['"New" lease rows parse', !!r.newLease && r.newLease.total === 31],
    ['"Terminated" credit written as -$15.50 parses as NEGATIVE', !!r.terminated && r.terminated.total === -15.5],
    ['"Nullified" credit written as $-31.00 parses as NEGATIVE', !!r.nullified && r.nullified.total === -31],
    ['Parenthesised credit ($31.00) parses as NEGATIVE', !!r.parens && r.parens.total === -31],
    ['True-up / adjustment rows with a longer period parse', !!r.trueUp && r.trueUp.total === 46.5],
    ['Thousands separators parse', !!r.commas && r.commas.total === 1031],
    ['Component columns are kept alongside the total', !!r.current && r.current.parts.length === 2 && r.current.parts[0] === 24],
    ['Token parser: -$15.50 is negative', r.tokens.minusBefore[0] === -15.5],
    ['Token parser: $-15.50 is negative', r.tokens.minusAfter[0] === -15.5],
    ['Token parser: ($15.50) is negative', r.tokens.parens[0] === -15.5],
    ['Token parser: $15.50 stays positive', r.tokens.positive[0] === 15.5],
    ['Token parser handles a mixed run in order', JSON.stringify(r.tokens.mixed) === JSON.stringify([24, -3.5, -7])],
    ['No script errors', errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
