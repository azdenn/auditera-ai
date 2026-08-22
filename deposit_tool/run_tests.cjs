/* Rebuilds the tool from template.html, regenerates the fixtures, and runs
   every Playwright suite in order. Exits non-zero if any check fails. */
const { execFileSync } = require('child_process');
const path = require('path');

const steps = [
  ['gen_fixtures.cjs', 'Fixtures'],
  ['build.cjs', 'Build'],
  ['test_deposit_rules.cjs', 'Core rules (real rent roll)'],
  ['test_edge_cases.cjs', 'Edge cases (missing coverage, invoice-only, format tolerance)'],
  ['test_markup_and_aliases.cjs', 'Markup setting, aliases, no-date invoices, summary guard'],
  ['test_ui.cjs', 'Results UI, Option Filters, exports'],
  ['test_real_invoice.cjs', 'Real LeaseLock invoice (PDF) vs real rent roll'],
  ['test_gca_invoice.cjs', 'Second real invoice (Garden Creek, letter-prefixed units + credit row)'],
  ['test_invoice_row_types.cjs', 'Invoice row types incl. credit/true-up rows'],
  ['test_coverage_overlap.cjs', 'Invoiced unit that also holds a deposit/bond'],
  ['test_selfcontained.cjs', 'Self-contained / offline'],
];

let failed = 0;
for (const [file, label] of steps){
  process.stdout.write('\n===== ' + label + ' (' + file + ') =====\n');
  try{
    const out = execFileSync(process.execPath, [path.join(__dirname, file)], {cwd: __dirname, encoding:'utf8'});
    const lines = out.split('\n').filter(l => /^(PASS|FAIL|Built|fixtures)/.test(l));
    console.log(lines.join('\n'));
  }catch(err){
    console.log(String(err.stdout||''));
    console.error(String(err.stderr||''));
    failed++;
  }
}
console.log('\n' + (failed ? failed + ' SUITE(S) FAILED' : 'ALL SUITES PASSED'));
process.exit(failed ? 1 : 0);
