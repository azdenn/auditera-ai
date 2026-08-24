const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const result = await page.evaluate(() => {
    const out = {};

    // 1. classify() sanity checks against the user's exact alias examples
    out.classify = {
      'Waste Management': classify('Waste Management', ALIAS_MAP).category,
      'Valet Trash': classify('Valet Trash', ALIAS_MAP).category,
      'Trash Fee': classify('Trash Fee', ALIAS_MAP).category,
      'Exterminator': classify('Exterminator', ALIAS_MAP).category,
      'Space Rent': classify('Space Rent', ALIAS_MAP).category,
      'Lease Lock': classify('Lease Lock', ALIAS_MAP).category,
      'Dog Rent': classify('Dog Rent', ALIAS_MAP).category,
      'Pet Fees & Charges - Dog - Rex': classify('Pet Fees & Charges - Dog - Rex', ALIAS_MAP).category,
      'Contract Rent': classify('Contract Rent', ALIAS_MAP).category,
      'Rent': classify('Rent', ALIAS_MAP).category,
      'Carport / Reserved Parking Rental': classify('Carport / Reserved Parking Rental', ALIAS_MAP).category,
      'Random Unrelated Charge': classify('Random Unrelated Charge', ALIAS_MAP).category,
    };

    // 2. Full reconcileUnit test: A108-style scenario -- trash named differently on each side,
    //    leaselock named differently on both sides but should now MATCH, and a totally
    //    unmapped pair sharing the same dollar amount (Pass 2 fallback).
    const leaseRawItems = [
      {rawLabel:'Monthly Base Rent', amount: 1200},
      {rawLabel:'Valet Trash', amount: 20},          // lease's own wording, different from ResMan's
      {rawLabel:'Lease Lock', amount: 30},            // should match ResMan's "Deposit Waiver Fee (LeaseLock)"
      {rawLabel:'Move-in Convenience Fee', amount: 12.34}, // totally unmapped, should Pass-2-match by amount
    ];
    const block = {
      unit:'TEST1', residents:'Test Tenant', total: 1200+20+30+12.34,
      charges: [
        {description:'Rent', amount: 1200},
        {description:'Waste Management', amount: 20},               // different wording than lease's "Valet Trash"
        {description:'Deposit Waiver Fee (LeaseLock)', amount: 30},  // different wording than lease's "Lease Lock"
        {description:'Misc Admin Charge', amount: 12.34},            // unmapped, same amount as lease's unmapped item
      ],
    };
    const cmp = reconcileUnit(leaseRawItems, block);
    out.reconcile = cmp.rows.map(r => ({label:r.label, lease:r.leaseVal, resman:r.resmanVal, status:r.status, soft: !!r.soft}));

    // 3. Case where trash truly is missing from lease (real ResMan-only case) - should NOT get swept into probable-match
    const leaseRawItems2 = [{rawLabel:'Monthly Base Rent', amount: 1000}];
    const block2 = { unit:'TEST2', residents:'X', total: 1017, charges: [
      {description:'Rent', amount: 1000}, {description:'Trash Service Fee', amount: 17},
    ]};
    const cmp2 = reconcileUnit(leaseRawItems2, block2);
    out.reconcile2 = cmp2.rows.map(r => ({label:r.label, lease:r.leaseVal, resman:r.resmanVal, status:r.status}));

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
