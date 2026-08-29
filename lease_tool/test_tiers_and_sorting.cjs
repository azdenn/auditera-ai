/* Tiered lease lines, and sorting the flat mismatch list.
   ------------------------------------------------------
   TIERS. Real leases are printed as a package listing every tier of a charge,
   and only the line matching the unit applies. Verbatim from a real signed
   lease (unit B4):

       Community Fee - 1 Bedroom    $70      <- this unit
       Community Fee - 2 Bedroom    $100     <- printed, never owed

   The rent roll bills one "Community Fee $70". The 1-Bedroom line pairs with
   it and the 2-Bedroom line was left over, reported as "on the lease, never
   billed" — a finding on a line nobody was ever going to charge, on every
   unit of that floorplan.

   The dangerous over-correction would be to swallow any leftover line that
   looks like a tier. The second half of this suite is the real test: on unit
   C1 the lease says $70 and the rent roll bills $115, and there is no sibling
   tier that explains it. That is a $45/month overcharge and it must survive.

   SORTING. The flat list gathers every unit's findings into one table.
   Sorting by Item is the point — it puts every unit's copy of the same
   finding together, so "show me the deposit problem across the property" is
   one click instead of ninety.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

// Transcribed from the real leases and rent roll for these units.
const UNITS = {
  // Lease lists both tiers; the rent roll bills the 1-Bedroom one.
  B4: { lease: [['Monthly Base Rent',1079], ['Community Fee - 1 Bedroom',70],
                ['Community Fee - 2 Bedroom',100], ['Cable / Internet',50]],
        rr:    [['Rent',1079], ['Community Fee',70], ['Cable / Internet Fee',50]] },
  // Lease lists ONE tier and the rent roll bills something else entirely.
  C1: { lease: [['Monthly Base Rent',749], ['Community Fee - 1 Bedroom',70],
                ['Cable / Internet',50]],
        rr:    [['Rent',749], ['Community Fee',115]] },
};

function toLease(rows){ return rows.map(([rawLabel, amount]) => ({rawLabel, amount, fromOther:true})); }
function toBlock(u, rows){ return {unit:u, residents:'R', total:rows.reduce((s,r)=>s+r[1],0),
  charges: rows.map(([description, amount]) => ({description, amount}))}; }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  /* ---- tiers -------------------------------------------------------------- */
  const r = await page.evaluate(([units, leaseFn, blockFn]) => {
    const mkLease = new Function('rows', leaseFn);
    const mkBlock = new Function('u', 'rows', blockFn);
    const out = {};
    for (const u of Object.keys(units)){
      HIDDEN_CHECK_KEYS.clear(); BUNDLE_RULES = [];
      PROPERTY_LABEL_ALIASES = new Map(); ROLLUP_SUBJECTS = new Map();
      const cmp = reconcileUnit(mkLease(units[u].lease), mkBlock(u, units[u].rr));
      out[u] = cmp.rows.filter(x => /community/i.test(x.label) ||
          (x.leaseRaw||[]).some(y=>/community/i.test(y)) || (x.resmanRaw||[]).some(y=>/community/i.test(y)))
        .map(x => ({label:x.label, status:x.status, lease:x.leaseVal, rr:x.resmanVal,
                    issue:isRealIssueRow(x), tier:!!x.tierOption, note:x.note||''}));
      out[u + '_issues'] = cmp.rows.filter(x => isRealIssueRow(x)).map(x => x.label);
    }
    return out;
  }, [UNITS,
      "return rows.map(function(r){return {rawLabel:r[0], amount:r[1], fromOther:true};});",
      "return {unit:u, residents:'R', total:rows.reduce(function(s,r){return s+r[1];},0), charges: rows.map(function(r){return {description:r[0], amount:r[1]};})};"]);

  const b4Tier = r.B4.find(x => /2 Bedroom/.test(x.label));
  check('The tier that does not apply is recognised as a tier, not a finding',
    b4Tier && b4Tier.tier === true && b4Tier.issue === false);
  check('...its note names the tier that WAS billed',
    b4Tier && /Community Fee - 1 Bedroom/.test(b4Tier.note));
  check('...and says plainly it is not owed on this unit',
    b4Tier && /not owed on this unit/.test(b4Tier.note));
  check('...while the applicable tier still reconciles against the billed amount',
    r.B4.some(x => x.lease === 70 && x.rr === 70 && x.issue === false));
  check('B4 raises no community-fee finding at all',
    r.B4_issues.filter(l => /community/i.test(l)).length === 0);

  // The over-correction guard. This one is real money.
  check('A LEASE THAT SIMPLY DOES NOT MATCH THE BILL IS STILL A FINDING',
    r.C1_issues.filter(l => /community/i.test(l)).length > 0);
  check('...and nothing about it is marked as a tier option',
    r.C1.every(x => x.tier !== true));
  check('...with both sides visible: $70 on the lease, $115 billed',
    r.C1.some(x => x.lease === 70) && r.C1.some(x => x.rr === 115));

  /* ---- sorting the flat list ---------------------------------------------- */
  const sorted = await page.evaluate(() => {
    unitEntries = [
      {unit:'C4', residents:'Zoe', category:'mismatch', rows:[
        {label:'Security Deposit', status:'mismatch', leaseVal:500, resmanVal:400, leaseRaw:[], resmanRaw:[]}]},
      {unit:'A2', residents:'Al', category:'mismatch', rows:[
        {label:'Washer/Dryer', status:'mismatch', leaseVal:50, resmanVal:9, leaseRaw:[], resmanRaw:[]}]},
      {unit:'B10', residents:'Bo', category:'mismatch', rows:[
        {label:'Security Deposit', status:'mismatch', leaseVal:80, resmanVal:60, leaseRaw:[], resmanRaw:[]}]},
    ];
    const pick = () => Array.from(document.querySelectorAll('#flat-issues-body tr'))
      .map(tr => tr.children[0].textContent + '|' + tr.children[2].textContent.split('\n')[0]);

    flatSortKey = null; flatSortDir = 1;
    renderFlatIssuesTable();
    const def = pick();

    flatSortKey = 'item'; flatSortDir = 1;
    renderFlatIssuesTable();
    const byItem = pick();

    flatSortKey = 'onLease'; flatSortDir = 1;
    renderFlatIssuesTable();
    const byMoney = pick();

    flatSortKey = 'unit'; flatSortDir = 1;
    renderFlatIssuesTable();
    const byUnit = pick();

    const headers = Array.from(document.querySelectorAll('#flat-view-shell th.flat-sortable'))
      .map(th => th.getAttribute('data-flat-sort'));
    flatSortKey = 'item'; flatSortDir = 1; renderFlatIssuesTable();
    const marked = document.querySelector('#flat-view-shell th[data-flat-sort="item"]').className;

    flatSortKey = null; flatSortDir = 1; renderFlatIssuesTable();
    return { def, byItem, byMoney, byUnit, headers, marked };
  });

  check('Every column that can be sorted offers it',
    JSON.stringify(sorted.headers) === JSON.stringify(['unit','residents','item','onLease','inResman']));
  check('SORTING BY ITEM gathers the same finding from every unit together',
    sorted.byItem[0].endsWith('Security Deposit') && sorted.byItem[1].endsWith('Security Deposit')
    && sorted.byItem[2].endsWith('Washer/Dryer'));
  check('...with unit as the tiebreaker inside a group',
    sorted.byItem[0].startsWith('A2') === false && sorted.byItem[0].startsWith('B10'));
  check('Money sorts as money, not as text ($9 below $50 below $80)',
    sorted.byMoney[0].startsWith('A2') && sorted.byMoney[1].startsWith('B10')
    && sorted.byMoney[2].startsWith('C4'));
  check('Unit numbers sort naturally, so B10 comes after B-single-digits',
    sorted.byUnit[0].startsWith('A2'));
  check('The sorted column is marked for the reader', /sorted-asc/.test(sorted.marked));
  check('Unsorted, the list keeps the order the audit produced',
    sorted.def[0].startsWith('C4'));

  /* ---- one offer per charge, not one per tier ----------------------------
     Reported from real use: the tool offered "treat 1 Bedroom as Community
     Fee" and "treat 2 Bedroom as Community Fee" as two separate choices,
     reading as an either/or. They are not alternatives -- they are tiers of
     one charge, and which applies is decided by the unit. */
  const merged = await page.evaluate(() => {
    const mk = (u, tier, leaseAmt, billed) => ({unit:u, rows:[
      {label: tier + ' / Community Fee', status:'probable',
       leaseRaw:[tier], resmanRaw:['Community Fee'], leaseVal:leaseAmt, resmanVal:billed}]});
    PROPERTY_RULES = []; DECLINED_RULE_KEYS = new Set(); BUNDLE_RULES = [];
    const entries = [
      mk('A2','Community Fee - 1 Bedroom',70,70),
      mk('B2','Community Fee - 1 Bedroom',70,70),
      mk('C4','Community Fee - 1 Bedroom',70,70),
      mk('22','Community Fee - 2 Bedroom',145,145),
      mk('26','Community Fee - 2 Bedroom',100,100),
    ];
    const props = detectRuleProposals(entries);
    const alias = props.filter(x => x.rule.type === 'alias');
    return { count: alias.length, kind: alias[0] && alias[0].kind,
             spellings: alias[0] ? alias[0].rule.spellings.slice().sort() : [],
             units: alias[0] ? alias[0].units.length : 0,
             headline: alias[0] ? alias[0].headline : '' };
  });
  check('The tiers are offered as ONE rule, not one choice per tier', merged.count === 1);
  check('...covering every tier the lease prints',
    JSON.stringify(merged.spellings) === JSON.stringify(['Community Fee - 1 Bedroom','Community Fee - 2 Bedroom']));
  check('...across every unit either tier appeared on', merged.units === 5);
  check('...and labelled as tiers rather than as a naming choice', merged.kind === 'Tiers');
  check('...saying the billed tier is the one that applies',
    /the tier billed on each unit is the one that applies/.test(merged.headline));

  // The rule applied: tiers are picked, never summed.
  const tierApplied = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS.clear(); BUNDLE_RULES = []; ROLLUP_SUBJECTS = new Map();
    PROPERTY_RULES = [{id:'t1', status:'active', rule:{type:'alias', target:'Community Fee',
      spellings:['Community Fee - 1 Bedroom','Community Fee - 2 Bedroom']}}];
    rebuildRuleEngine();
    const cmp = reconcileUnit(
      [{rawLabel:'Community Fee - 1 Bedroom', amount:70, fromOther:true},
       {rawLabel:'Community Fee - 2 Bedroom', amount:100, fromOther:true}],
      {unit:'B4', residents:'R', total:70, charges:[{description:'Community Fee', amount:70}]});
    PROPERTY_RULES = []; rebuildRuleEngine();
    return cmp.rows.map(r => ({label:r.label, status:r.status, lease:r.leaseVal, rr:r.resmanVal,
                               issue:isRealIssueRow(r), tier:!!r.tierOption}));
  });
  check('WITH THE RULE ON: the billed tier matches, it is not summed to $170',
    tierApplied.some(r => r.lease === 70 && r.rr === 70 && r.status === 'match'));
  check('...the other tier is marked as a tier, not a finding',
    tierApplied.some(r => r.tier === true && r.issue === false && r.lease === 100));
  check('...and the unit raises nothing at all',
    tierApplied.every(r => r.issue === false));

  check('No page or console errors', errors.length === 0);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  if (errors.length) console.log('ERRORS:', errors);
  const passed = results.filter(x => x[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
