const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  for (const f of ['synthetic_T001_addendum.pdf', 'synthetic_T002_checkbox.pdf']) {
    await page.setInputFiles('#lease-files', [path.resolve('./' + f)]);
    const result = await page.evaluate(async () => {
      const file = document.getElementById('lease-files').files[0];
      return await parseLeasePdf(file);
    });
    console.log('===', f, '===');
    console.log(JSON.stringify(result, null, 2));
  }

  // Bug #2: Credit Builder suffix stripping, and generalized suffix stripping for any
  // ResMan charge with a trailing " - Name"/":"/dash suffix.
  const aliasResult = await page.evaluate(() => {
    const out = {};
    out.creditBuilderWithName = classify('Credit Builder - John Doe', ALIAS_MAP).category;
    out.creditBuilderColon = classify('Credit Builder: Jane Smith', ALIAS_MAP).category;
    out.trashWithDate = classify('Valet Trash - 01/2026', ALIAS_MAP).category;

    const leaseRawItems = [
      {rawLabel:'Monthly Base Rent', amount: 1000},
      {rawLabel:'Credit Builder', amount: 5},
    ];
    const block = {
      unit:'CBTEST', residents:'Test', total: 1005, charges: [
        {description:'Rent', amount: 1000},
        {description:'Credit Builder - John Doe', amount: 5},
      ],
    };
    const cmp = reconcileUnit(leaseRawItems, block);
    out.creditBuilderRows = cmp.rows.map(r => ({label:r.label, lease:r.leaseVal, resman:r.resmanVal, status:r.status, soft: !!r.soft}));
    out.creditBuilderIssueCount = cmp.issueCount;

    // One-sided Credit Builder (only in ResMan, e.g. a resident on the program whose
    // lease predates it) should be soft/non-issue, same treatment as LeaseLock.
    const block2 = { unit:'CBTEST2', residents:'Test2', total: 1005, charges: [
      {description:'Rent', amount: 1000},
      {description:'Credit Builder - Jane Doe', amount: 5},
    ]};
    const cmp2 = reconcileUnit([{rawLabel:'Monthly Base Rent', amount: 1000}], block2);
    out.creditBuilderOneSidedRows = cmp2.rows.map(r => ({label:r.label, lease:r.leaseVal, resman:r.resmanVal, status:r.status, soft: !!r.soft}));
    out.creditBuilderOneSidedIssueCount = cmp2.issueCount;

    return out;
  });
  console.log('=== Credit Builder ===');
  console.log(JSON.stringify(aliasResult, null, 2));

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
