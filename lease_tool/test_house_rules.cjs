/* House rules — a property's own conventions, learned once and remembered.
   ----------------------------------------------------------------------
   Persisting rules was DELIBERATELY REMOVED on 2026-08-25, and the reason was
   right: a saved rule outlives the documents that justified it. Next month's
   export changes, the rule still matches by name, and it quietly suppresses a
   real mismatch — with no panel, nowhere to notice.

   Bringing persistence back is only defensible if that specific failure cannot
   happen quietly, so most of this suite is about the failure rather than the
   feature:

     - a saved rule the documents now contradict is SUSPENDED, not applied
     - the suspension is visible, and names the rule and the units
     - removing a rule restores the original behaviour exactly
     - a proposal is never offered when the data argues with it
     - one unit is never enough to propose anything

   And the promise the whole product rests on: what leaves the browser is
   charge labels. Never an amount, never a resident, never a unit number. The
   last section asserts that against the real bytes of the real request.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, installRulesStub, gateAnswerWithProperty, GATE_HASH }
  = require('../shared/test_gate_stub.cjs');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

const PROP = '11111111-2222-3333-4444-555555555555';

// Charges from a real property, as they appear on each document.
const LEASE = [
  {rawLabel:'Monthly Base Rent',   amount:1225},
  {rawLabel:'Community Fee 1',     amount:70,  fromOther:true},
  {rawLabel:'Community Fee 2',     amount:25,  fromOther:true},
];
const BLOCK = {unit:'B2', residents:'Terry Sanchez', total:1295, charges:[
  {description:'Rent',          amount:1225},
  {description:'Community Fee', amount:70},
]};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text()); });

  await installGateStub(page, gateAnswerWithProperty(PROP, 'The Rail at Georgetown'));
  const rules = await installRulesStub(page, []);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  /* ---- 1. what an accepted rule actually does ---------------------------- */
  const applied = await page.evaluate(([lease, block]) => {
    const run = () => { HIDDEN_CHECK_KEYS.clear(); return reconcileUnit(lease, block); };

    PROPERTY_LABEL_ALIASES = new Map(); ROLLUP_SUBJECTS = new Map(); BUNDLE_RULES = [];
    const before = run();

    // "Community Fee 1 is what the rent roll calls Community Fee."
    PROPERTY_RULES = [{id:'r1', rule:{type:'alias', target:'Community Fee', spellings:['Community Fee 1']}, status:'active'}];
    rebuildRuleEngine();
    const withAlias = run();

    // ...and the leftover twin is a known standing issue, reported once.
    PROPERTY_RULES.push({id:'r2', rule:{type:'rollup', subject:'Community Fee 2'}, status:'active'});
    rebuildRuleEngine();
    const withBoth = run();

    // An alias must never make two AMOUNTS equal. Same labels, wrong money.
    const wrongMoney = (() => {
      const b2 = JSON.parse(JSON.stringify(block));
      b2.charges[1].amount = 90;
      return run.call(null), reconcileUnit(lease, b2);
    })();

    const pick = (cmp, lbl) => cmp.rows.find(r => r.label === lbl) || null;
    const issues = cmp => cmp.rows.filter(r => isRealIssueRow(r)).map(r => r.label);
    return {
      beforeIssues: issues(before),
      beforeProbable: (() => { const r = before.rows.find(x => x.status === 'probable');
        return r && r.label; })(),
      aliasRow: (() => { const r = pick(withAlias, 'Community Fee');
        return r && {status:r.status, lease:r.leaseVal, rr:r.resmanVal, byRule:!!r.byHouseRule}; })(),
      aliasIssues: issues(withAlias),
      bothIssues: issues(withBoth),
      rolled: (() => { const r = pick(withBoth, 'Community Fee 2');
        return r && {rolledUp:!!r.rolledUp, issue:isRealIssueRow(r), amount:r.leaseVal}; })(),
      wrongMoneyRow: (() => { const r = pick(wrongMoney, 'Community Fee');
        return r && {status:r.status, issue:isRealIssueRow(r)}; })(),
    };
  }, [LEASE, BLOCK]);

  // Without a rule the tool already guesses this pair from the amount and the
  // shared wording -- but only as a "probable" match it tells you to check.
  // That is exactly what a rule upgrades: a guess becomes a stated fact about
  // this property, which is the whole value of remembering one.
  check('Before any rule, the pair is only a probable match',
    applied.beforeProbable === 'Community Fee 1 / Community Fee');
  check('...leaving the duplicated lease line as the one finding',
    applied.beforeIssues.length === 1 && applied.beforeIssues[0] === 'Community Fee 2');
  check('An alias turns that guess into one named charge',
    applied.aliasRow && applied.aliasRow.status === 'match');
  check('...comparing the money that was actually on each document',
    applied.aliasRow && applied.aliasRow.lease === 70 && applied.aliasRow.rr === 70);
  check('...and says it was the property\'s own rule that did it',
    applied.aliasRow && applied.aliasRow.byRule === true);
  check('...leaving only the genuine leftover behind',
    applied.aliasIssues.length === 1 && applied.aliasIssues[0] === 'Community Fee 2');

  check('A roll-up takes the last finding off the unit', applied.bothIssues.length === 0);
  check('...without deleting it — the row and its amount stay',
    applied.rolled && applied.rolled.rolledUp === true && applied.rolled.amount === 25);
  check('...and it is no longer counted as a per-unit issue', applied.rolled.issue === false);

  check('AN ALIAS NEVER MAKES TWO AMOUNTS EQUAL: wrong money is still a mismatch',
    applied.wrongMoneyRow && applied.wrongMoneyRow.status === 'mismatch'
    && applied.wrongMoneyRow.issue === true);

  /* ---- 2. the failure the 2026-08-25 removal was about -------------------- */
  const stale = await page.evaluate(() => {
    // Next month: the property split the fee differently, so the saved rule's
    // arithmetic no longer holds anywhere.
    const entries = [
      {unit:'B2', rows:[
        {label:'Community Fee 1', leaseRaw:['Community Fee 1'], resmanRaw:[], leaseVal:70, resmanVal:null},
        {label:'Community Fee 2', leaseRaw:['Community Fee 2'], resmanRaw:[], leaseVal:25, resmanVal:null},
        {label:'Community Fee', leaseRaw:[], resmanRaw:['Community Fee'], leaseVal:null, resmanVal:115},
      ]},
      {unit:'G1', rows:[
        {label:'Community Fee 1', leaseRaw:['Community Fee 1'], resmanRaw:[], leaseVal:70, resmanVal:null},
        {label:'Community Fee 2', leaseRaw:['Community Fee 2'], resmanRaw:[], leaseVal:25, resmanVal:null},
        {label:'Community Fee', leaseRaw:[], resmanRaw:['Community Fee'], leaseVal:null, resmanVal:115},
      ]},
    ];
    PROPERTY_RULES = [{id:'r9', status:'active',
      rule:{type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1','Community Fee 2']}}];
    const changed = evaluateSavedRules(entries);
    BUNDLE_RULES = []; rebuildRuleEngine();
    return { changed, status: PROPERTY_RULES[0].status, explain: PROPERTY_RULES[0].explain,
             bundlesLoaded: BUNDLE_RULES.length };
  });

  check('A saved rule the documents now contradict is caught', stale.status === 'suspended');
  check('...and that forces the run to be redone without it', stale.changed === true);
  check('...so it is NOT loaded into the engine at all', stale.bundlesLoaded === 0);
  check('...and the explanation names how many units disagree',
    /no longer agree with it on 2 units/.test(stale.explain));
  check('...and shows the arithmetic that failed', /95\.00 against 115\.00/.test(stale.explain));
  check('...and states plainly that nothing was suppressed',
    /Nothing was suppressed/.test(stale.explain));

  const dormant = await page.evaluate(() => {
    PROPERTY_RULES = [{id:'r8', status:'active',
      rule:{type:'rollup', subject:'A Charge Not In This Export'}}];
    evaluateSavedRules([{unit:'1', rows:[{label:'Rent', leaseRaw:['Rent'], resmanRaw:['Rent'], leaseVal:1, resmanVal:1}]}]);
    return {status: PROPERTY_RULES[0].status, explain: PROPERTY_RULES[0].explain};
  });
  check('A rule with nothing to act on is dormant, not alarming', dormant.status === 'dormant');
  check('...and says so without implying anything is wrong', /did nothing/.test(dormant.explain));

  /* ---- 3. what gets proposed, and what does not --------------------------- */
  const proposals = await page.evaluate(() => {
    const mk = (unit, extra) => ({unit, rows: [
      {label:'Liability Insurance / Resident Liability Insurance', status:'probable',
       leaseRaw:['Liability Insurance'], resmanRaw:['Resident Liability Insurance'],
       leaseVal:10, resmanVal:10},
      ...(extra || []),
    ]});
    const dup = {label:'Community Fee 2', status:'leaseonly', duplicateLeaseLine:true,
                 leaseRaw:['Community Fee 2'], resmanRaw:[], leaseVal:25, resmanVal:null};

    PROPERTY_RULES = []; DECLINED_RULE_KEYS = new Set(); BUNDLE_RULES = [];

    const three = [mk('1',[dup]), mk('2',[dup]), mk('3',[dup])];
    const many = detectRuleProposals(three);

    const one = detectRuleProposals([mk('1',[dup])]);

    // Already saved -> never offered again.
    PROPERTY_RULES = [{id:'x', status:'active',
      rule:{type:'alias', target:'Resident Liability Insurance', spellings:['Liability Insurance']}}];
    const afterSaved = detectRuleProposals(three);

    // Declined -> not offered again this session.
    PROPERTY_RULES = [];
    DECLINED_RULE_KEYS = new Set(many.map(p => p.key));
    const afterDeclined = detectRuleProposals(three);

    DECLINED_RULE_KEYS = new Set();
    return {
      kinds: many.map(p => p.rule.type).sort(),
      aliasUnits: (many.find(p => p.rule.type === 'alias') || {}).units,
      rollupDescribed: (many.find(p => p.rule.type === 'rollup') || {}).describe,
      oneUnit: one.length,
      afterSaved: afterSaved.map(p => p.rule.type),
      afterDeclined: afterDeclined.length,
    };
  });

  check('A name-only match repeated across units is offered as an alias',
    proposals.kinds.indexOf('alias') !== -1);
  check('A duplicated lease line repeated across units is offered as a roll-up',
    proposals.kinds.indexOf('rollup') !== -1);
  check('...described in plain English, not as a rule object',
    /once for the whole property/.test(proposals.rollupDescribed || ''));
  check('...naming every unit it holds on', (proposals.aliasUnits || []).length === 3);
  check('ONE UNIT IS NEVER ENOUGH — a coincidence is not a convention',
    proposals.oneUnit === 0);
  check('A rule already saved is never offered again',
    proposals.afterSaved.indexOf('alias') === -1);
  check('A rule declined is not offered again this session', proposals.afterDeclined === 0);

  /* ---- 4. what actually leaves the browser -------------------------------- */
  const sent = await page.evaluate(async () => {
    const r = await agSaveRule('11111111-2222-3333-4444-555555555555',
      {type:'rollup', subject:'Community Fee 2'}, 'proposed');
    return !!r;
  });
  check('A rule saves through the tool\'s own code path', sent === true);

  const posted = rules.saved();
  check('Exactly one rule was sent', posted.length === 1);
  const raw = JSON.stringify(posted[0]);
  check('...carrying the property, the verb and the label — and nothing else',
    JSON.stringify(Object.keys(posted[0]).sort()) === JSON.stringify(['property_id','rule','source']));
  check('NO money figure leaves the browser', !/\d+\.\d{2}/.test(raw) && !/\$/.test(raw));
  check('NO resident name leaves the browser', !/Terry|Sanchez/i.test(raw));
  check('NO unit number leaves the browser', !/"B2"|"G1"/.test(raw));
  check('The rule itself is only a verb and a label',
    JSON.stringify(Object.keys(posted[0].rule).sort()) === JSON.stringify(['subject','type']));

  /* ---- 5. the whole pipeline, on real documents --------------------------- */
  // A real rent roll and five real leases, with a saved rule in place, to
  // prove none of the above breaks an ordinary audit.
  const page2 = await browser.newPage();
  page2.on('pageerror', e => errors.push('PAGEERROR(e2e): ' + e.message));
  await installGateStub(page2, gateAnswerWithProperty(PROP, 'Blanco Oaks Apartments'));
  await installRulesStub(page2, [
    {id:'seed-1', rule:{type:'rollup', subject:'Resident Liability Insurance'}},
  ]);
  await page2.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);
  await page2.setInputFiles('#lease-files', [
    'A105_2022-2023.pdf','A105_2023-2024.pdf','A105_2024-2025.pdf',
    'A105_2025-2026_current.pdf','A105_2026-2027_signed_renewal.pdf',
  ].map(f => path.resolve(__dirname, 'a105_test', f)));
  await page2.setInputFiles('#rentroll-file', path.resolve(__dirname, 'a105_test', 'A105_rentroll.xlsx'));
  await page2.click('#process-btn');
  await page2.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page2.waitForTimeout(500);

  const e2e = await page2.evaluate(() => ({
    propertyId: PROPERTY_ID,
    savedLoaded: PROPERTY_RULES.length,
    savedStatus: PROPERTY_RULES.map(r => r.status),
    unit105: (() => { const e = unitEntries.find(x => x.unit === '105');
      return e ? {category: e.category, issueCount: e.issueCount} : null; })(),
    panelVisible: !document.getElementById('house-rules').classList.contains('hidden'),
    panelText: document.getElementById('house-rules').textContent,
  }));

  check('E2E: the property id reaches the tool from the gate', e2e.propertyId === PROP);
  check('E2E: this property\'s saved rules are loaded', e2e.savedLoaded === 1);
  check('E2E: a rule with nothing to act on here reads as dormant',
    e2e.savedStatus[0] === 'dormant');
  check('E2E: the panel is shown once a property has rules', e2e.panelVisible === true);
  check('E2E: ...listing the saved rule in plain English',
    /Report .Resident Liability Insurance. once for the whole property/.test(e2e.panelText));
  check('E2E: the ordinary audit is unaffected — unit 105 is its established result',
    e2e.unit105 && e2e.unit105.category === 'mismatch' && e2e.unit105.issueCount === 1);

  check('No page or console errors', errors.length === 0);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  if (errors.length) console.log('ERRORS:', errors);
  const passed = results.filter(x => x[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
