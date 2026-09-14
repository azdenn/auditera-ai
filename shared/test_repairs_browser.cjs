// Synthetic regression cases against the exact deployable files. No backend calls.
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const {installGateStub, installRulesStub, GATE_HASH} = require('./test_gate_stub.cjs');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await installGateStub(page);
    await page.goto(pathToFileURL(path.join(__dirname,'../dist/tools/leaseverify.html')).href + GATE_HASH);
    const results = await page.evaluate(() => {
      const block = {unit:'SYNTHETIC-1', residents:'Example Resident', total:1225,
        charges:[{description:'Rent',amount:1200},{description:'Amenity Fee',amount:25}]};
      const lease = [{rawLabel:'Monthly Base Rent',amount:1200}];
      const fee = () => unitEntries[0].rows.find(r => r.resmanVal === 25);
      const snapshot = () => ({status:PROPERTY_RULES[0] && PROPERTY_RULES[0].status,
        blocked:!!(PROPERTY_RULES[0] && PROPERTY_RULES[0].evidence.blocked),
        issue:isRealIssueRow(fee()), filtered:isRowFiltered(fee()), soft:!!fee().soft});
      HIDDEN_CHECK_KEYS.clear(); PROPERTY_ID = 'synthetic-property';
      rawFailedFiles = [];
      allUnitBlocks = new Map([[block.unit,block]]);
      rawSuccessByUnit = new Map([[block.unit,[{unit:block.unit,filename:'synthetic.pdf',rawItems:lease}]]]);
      PROPERTY_RULES = [];
      reconcileAll();
      const baseline = snapshot();
      const saved = {};
      for (const type of ['rollup','hide']) {
        PROPERTY_RULES = [{id:'unsafe-'+type,status:'active',rule:{type,subject:'Amenity Fee'}}];
        rebuildRuleEngine(); // stale state left over from the preceding run
        reconcileAll();
        saved[type] = snapshot();
      }
      // Valid rule in one run, contradicted next run, then removed entirely.
      rawSuccessByUnit.get(block.unit)[0].rawItems.push({rawLabel:'Amenity Fee',amount:25});
      PROPERTY_RULES = [{id:'hide',status:'active',rule:{type:'hide',subject:'Amenity Fee'}}];
      reconcileAll();
      const active = PROPERTY_RULES[0].status;
      rawSuccessByUnit.get(block.unit)[0].rawItems.pop();
      reconcileAll();
      const nextRun = snapshot();
      PROPERTY_RULES = []; rebuildRuleEngine(); reconcileAll();
      const removed = snapshot();
      PROPERTY_RULES = [{id:'malformed',status:'active',rule:{type:'alias',spellings:'not-an-array'}}];
      reconcileAll();
      const malformed = snapshot();
      return {baseline,saved,active,nextRun,removed,malformed};
    });
    check('Baseline includes the undisclosed fee', () => assert.equal(results.baseline.issue,true));
    for (const type of ['rollup','hide']) check(type + ' cannot erase a billed-but-unsigned fee in a full rerun', () => {
      assert.deepEqual(results.saved[type],{status:'suspended',blocked:true,issue:true,filtered:false,soft:false});
    });
    check('Valid saved rule is not disabled unconditionally', () => assert.equal(results.active,'active'));
    check('Next run rechecks untouched evidence and suspends stale hiding', () => {
      assert.equal(results.nextRun.status,'suspended'); assert.equal(results.nextRun.issue,true); assert.equal(results.nextRun.filtered,false);
    });
    check('Removing saved rules restores the finding', () => assert.equal(results.removed.filtered,false));
    check('Malformed stored rule is suspended without crashing the audit', () => assert.equal(results.malformed.status,'suspended'));
    for (const statement of ["No, don't ignore Amenity Fee", "Don't stop flagging Amenity Fee", 'Amenity Fee is not an old template', 'Keep original findings for Amenity Fee']) {
      check('No proposal for: '+statement, () => assert.equal(require('./property_rules.js').prParseSentence(statement,['Amenity Fee']).rule,null));
    }
    await page.route('**/rest/v1/property_rules*', r => r.fulfill({status:503,body:'unavailable'}));
    const failed = await page.evaluate(async () => {
      const rows = await agLoadRules(PROPERTY_ID); PROPERTY_RULES = rows; renderHouseRules();
      return {rows,warning:document.querySelector('#house-rules [role="alert"]').textContent};
    });
    check('Failed rule load is visible, not reported as no saved conventions', () => {assert.deepEqual(failed.rows,[]); assert.match(failed.warning,/could not be loaded/);});
    await page.unroute('**/rest/v1/property_rules*');
    await installRulesStub(page,[{id:'existing',rule:{type:'rollup',subject:'Amenity Fee'}}]);
    const persisted = await page.evaluate(async () => ({
      rows:(await agLoadRules(PROPERTY_ID)).length, error:AG_RULES_LOAD_ERROR,
      deleted:await agDeleteRule('existing'), zeroRow:await agDeleteRule('existing')
    }));
    check('Successful reload clears the failure indicator', () => {assert.equal(persisted.rows,1); assert.equal(persisted.error,false);});
    check('Delete confirms an affected row, not HTTP success alone', () => {assert.equal(persisted.deleted,true); assert.equal(persisted.zeroRow,false);});
    await page.goto(pathToFileURL(path.join(__dirname,'../dist/tools/depositverify.html')).href + GATE_HASH);
    const deposit = await page.evaluate(() => {
      LEASELOCK_MARKUP=2;
      const block={charges:[{description:'Deposit Waiver Fee (LeaseLock)',amount:33}],deposits:0,surety:0};
      return [31,32,45,null].map(days => ({days,findings:reconcileUnitCoverage(block,{amount:10000,coverageDays:days,
        coverageStart:new Date(2026,0,1),coverageEnd:new Date(2026,1,1)}).findings,
        exact:reconcileUnitCoverage(block,{amount:31,coverageDays:days}).findings}));
    });
    for (const row of deposit) check('Invoice arithmetic remains authoritative with '+row.days+' coverage days', () => {
      assert.equal(row.findings.find(f=>f.key==='llAmountMismatch').severity,'flag'); assert.equal(row.exact.length,0);
    });
    check('No application script errors', () => assert.deepEqual(errors,[]));
    console.log(count+'/'+count+' passed');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
