// Focused local acceptance suite. Requires a current build and Playwright.
// No real account, payment, deployment or customer document upload is performed.
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = __dirname;
const tests = [
  'shared/test_build.cjs', 'shared/test_review_repairs.cjs',
  'shared/test_property_assistant.cjs', 'shared/test_assistant_browser.cjs',
  'shared/test_assistant_memory.cjs',
  'shared/test_property_rules.cjs', 'shared/test_property_guard.cjs',
  'shared/test_authorize_logic.cjs', 'homepage_assets/test_worker_gate.mjs',
  'shared/test_audit_gate.mjs', 'homepage_assets/test_gate_integration.mjs',
  'shared/test_repairs_browser.cjs', 'deposit_tool/test_invoice_row_types.cjs',
  ...['bundle_price','bundle_tiers','same_charge_different_name','bundle_coincidence',
    'includes_picker','tier_siblings','filter_counts','signature_summary','charge_structures',
    'usage_stats','signature_names','deposit_waiver_agreement','signature_ink','lease_filed_wrong_unit']
    .map(name => 'lease_tool/test_'+name+'.cjs'),
];
let failures=0;
for (const test of tests) {
  const result=spawnSync(process.execPath, ['-r',path.join(root,'shared/test_bootstrap.cjs'),path.basename(test)], {
    cwd:path.dirname(path.join(root,test)),encoding:'utf8',timeout:60000,
    maxBuffer:4*1024*1024,windowsHide:true,
  });
  const ok=result.status===0 && !result.error;
  console.log((ok?'PASS ':'FAIL ')+test);
  if (!ok) {failures++;console.log(result.stdout||'');console.error(result.stderr||result.error||'Timed out');}
  else {
    const summary=(result.stdout||'').match(/^\d+\/\d+ passed$/gm);
    if (summary) console.log('  '+summary.at(-1));
    for (const skip of (result.stdout||'').match(/^SKIP.*$/gm)||[]) console.log('  '+skip);
  }
}
console.log((tests.length-failures)+'/'+tests.length+' suites passed; private-fixture suites are NOT included.');
process.exitCode=failures?1:0;
