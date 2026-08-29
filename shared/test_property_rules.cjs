/* The door every property rule has to come through.
   ------------------------------------------------
   The question this answers: if someone types a correction in their own words
   and something turns it into a rule, what stops a confident sentence becoming
   a bad rule that quietly suppresses real findings for a year?

   Three things, all tested here:
     1. Only four shapes exist. Anything else does not compile.
     2. Every label must appear in the documents just uploaded. An invented
        charge name is rejected before it can be saved and match nothing.
     3. A rule that validates is still only a claim, so it is checked against
        the reconciled units and reports where the documents disagree.

   And one thing that no phrasing gets past: rent, signatures, and charges
   billed without being disclosed.
*/
const { prValidateRule, prCheckRuleAgainstData, prDescribeRule, RULE_TYPES,
        prParseSentence, prFindLabels } = require('./property_rules.js');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

// The real charge vocabulary from The Rail at Georgetown, both sides.
const VOCAB = [
  'Rent', 'Community Fee', 'Community Fee 1', 'Community Fee 2',
  'Resident Liability Insurance', 'Liability Insurance',
  'Cable / Internet Fee', 'Cable/satellite', 'Internet',
  'Washer/Dryer', 'WD Rent', 'Washer / Dryer RG',
  'Deposit Waiver Fee (LeaseLock)', 'Reserved Parking Fee', 'Pest control',
];

/* ---- 1. only four shapes exist ------------------------------------------ */
check('There are exactly four things a rule can do',
  RULE_TYPES.length === 4);
for (const bogus of ['recalculate', 'markAsMatched', 'setAmount', 'ignoreEverything', '', null]){
  const v = prValidateRule({type: bogus, subject: 'Community Fee 2'}, VOCAB);
  check('“' + bogus + '” is not something a rule can do', v.ok === false);
}
check('...and the refusal says what a rule CAN do',
  /A rule can only be/.test(prValidateRule({type:'nope'}, VOCAB).errors[0]));

/* ---- 2. every label must exist in the documents -------------------------- */
const invented = prValidateRule(
  {type:'bundle', rentRollLabel:'Resort Fee', leaseLabels:['Amenity A','Amenity B']}, VOCAB);
check('A charge that is not in these documents is rejected', invented.ok === false);
check('...and the reason says why it would be useless',
  /never match anything/.test(invented.errors.join(' ')));

const real = prValidateRule(
  {type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1','Community Fee 2']}, VOCAB);
check('A bundle built from labels that DO appear is accepted', real.ok === true);

check('Spelling and punctuation drift still resolves to the same charge',
  prValidateRule({type:'alias', target:'washer dryer', spellings:['WD  Rent']}, VOCAB).ok === true);

check('A "bundle" of one lease line is refused as an alias instead',
  /is an alias, not a bundle/.test(prValidateRule(
    {type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1']}, VOCAB).errors.join(' ')));

/* ---- 3. the boundary, whatever the phrasing ------------------------------ */
const protectedAttempts = [
  ['hide',   {type:'hide',   subject:'Rent', reason:'they always adjust it later'}],
  ['rollup', {type:'rollup', subject:'Rent'}],
  ['alias',  {type:'alias',  target:'Rent', spellings:['Community Fee']}],
];
for (const [kind, rule] of protectedAttempts){
  const v = prValidateRule(rule, VOCAB.concat(['Rent']));
  check('Rent cannot be suppressed via a ' + kind + ' rule', v.ok === false);
  check('...and the refusal explains why, rather than just failing',
    /this audit exists to check/.test(v.errors.join(' ')));
}
check('Signatures cannot be ruled away either',
  prValidateRule({type:'hide', subject:'Missing signature'}, VOCAB.concat(['Missing signature'])).ok === false);

/* ---- 4. a valid rule is still only a claim ------------------------------- */
// Reconciled units in the shape reconcileUnit produces.
function unit(u, leaseParts, billed){
  const rows = leaseParts.map(([label, val]) => ({label, leaseRaw:[label], resmanRaw:[], leaseVal:val, resmanVal:null}));
  rows.push({label:'Community Fee', leaseRaw:[], resmanRaw:['Community Fee'], leaseVal:null, resmanVal:billed});
  return {unit:u, rows};
}
// 3 units where the two lease lines really do add to the billed amount, and
// one where they do not -- the office changed a tier and forgot a line.
const ENTRIES = [
  unit('B2', [['Community Fee 1', 45], ['Community Fee 2', 25]], 70),
  unit('G1', [['Community Fee 1', 90], ['Community Fee 2', 25]], 115),
  unit('Y1', [['Community Fee 1', 120], ['Community Fee 2', 25]], 145),
  unit('M4', [['Community Fee 1', 90], ['Community Fee 2', 25]], 70),
];
const ev = prCheckRuleAgainstData(
  {type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1','Community Fee 2']},
  ENTRIES);

check('The claim is measured against every unit it could apply to', ev.unitsExamined === 4);
check('...reporting where the documents agree', ev.holdsOn === 3);
check('...AND where they do not', ev.contradictedOn === 1);
check('...naming the unit that disagrees', ev.counterExamples[0].unit === 'M4');
check('...with the arithmetic that failed there',
  ev.counterExamples[0].sum === 115 && ev.counterExamples[0].billed === 70);
check('A rule the documents argue with is not marked confident', ev.confident === false);

const clean = prCheckRuleAgainstData(
  {type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1','Community Fee 2']},
  ENTRIES.slice(0, 3));
check('A rule that holds everywhere IS marked confident', clean.confident === true);
check('...with examples to show, not the whole property', clean.examples.length === 3);

// The case Azden described: only one of the two is billed, so a bundle is the
// WRONG reading and the evidence check is what reveals it.
const ONLY_ONE = [
  unit('A1', [['Community Fee 1', 70], ['Community Fee 2', 25]], 70),
  unit('A2', [['Community Fee 1', 70], ['Community Fee 2', 25]], 70),
];
const wrongRead = prCheckRuleAgainstData(
  {type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1','Community Fee 2']},
  ONLY_ONE);
check('Reading "only one is billed" as a bundle is contradicted by every unit',
  wrongRead.holdsOn === 0 && wrongRead.contradictedOn === 2);
check('...so the tool can push back instead of saving it', wrongRead.confident === false);

// The right rule for that property: roll the unbilled twin up.
const rightRead = prCheckRuleAgainstData({type:'rollup', subject:'Community Fee 2'}, ONLY_ONE);
check('The correct reading of the same property holds on every unit',
  rightRead.holdsOn === 2 && rightRead.contradictedOn === 0);

/* ---- 4b. the protection that a keyword list cannot provide --------------
   Found in real data: a property bills "Resident Liability Insurance" on
   nearly every unit, and on many of those leases there is no such line at
   all. Rolling that up would hide money leaving a resident's account with
   nothing on their lease to justify it — under a label no keyword list would
   ever flag, because the danger is the SITUATION, not the name. So the row's
   own status decides. */
const BILLED_NOT_DISCLOSED = [
  {unit:'22', rows:[{label:'Resident Liability Insurance', leaseRaw:[], resmanRaw:['Resident Liability Insurance'],
                     leaseVal:null, resmanVal:10, status:'resmanonly'}]},
  {unit:'K2', rows:[{label:'Resident Liability Insurance', leaseRaw:[], resmanRaw:['Resident Liability Insurance'],
                     leaseVal:null, resmanVal:15, status:'resmanonly'}]},
];
const blockedEv = prCheckRuleAgainstData({type:'rollup', subject:'Resident Liability Insurance'}, BILLED_NOT_DISCLOSED);
check('A charge billed with no lease line cannot be rolled up', blockedEv.blocked === true);
check('...naming every unit where the resident never signed for it',
  blockedEv.wouldHideUndisclosed.length === 2);
check('...and it is never treated as confident', blockedEv.confident === false);
check('...and it counts as holding on nothing', blockedEv.holdsOn === 0);

const hideEv = prCheckRuleAgainstData({type:'hide', subject:'Resident Liability Insurance'}, BILLED_NOT_DISCLOSED);
check('The same refusal applies to hiding it, not just rolling it up', hideEv.blocked === true);

// The same charge, disclosed on the lease, is an ordinary rollup candidate.
const DISCLOSED = [
  {unit:'B2', rows:[{label:'Liability Insurance', leaseRaw:['Liability Insurance'], resmanRaw:[],
                     leaseVal:15, resmanVal:null, status:'leaseonly'}]},
];
const okEv = prCheckRuleAgainstData({type:'rollup', subject:'Liability Insurance'}, DISCLOSED);
check('A charge on the lease but not billed CAN be rolled up — nobody is paying it',
  okEv.blocked === false && okEv.holdsOn === 1);

/* ---- 5. what the person approving it actually reads ---------------------- */
check('A bundle describes its effect in the documents\' own words',
  prDescribeRule({type:'bundle', rentRollLabel:'Community Fee', leaseLabels:['Community Fee 1','Community Fee 2']})
  === 'Treat “Community Fee 1” + “Community Fee 2” on the lease as the single “Community Fee” line on the rent roll.');
check('An alias does too',
  prDescribeRule({type:'alias', target:'Washer/Dryer', spellings:['WD Rent','Washer / Dryer RG']})
  === 'Treat “WD Rent” and “Washer / Dryer RG” as the same charge as “Washer/Dryer”.');
check('A rollup says it is still reported, just once',
  /once for the whole property/.test(prDescribeRule({type:'rollup', subject:'Community Fee 2'})));
check('A hide carries the reason it was hidden',
  /dropped in 2024/.test(prDescribeRule({type:'hide', subject:'Community Fee 2', reason:'dropped in 2024'})));
check('Hiding without a reason is allowed but warned about',
  prValidateRule({type:'hide', subject:'Community Fee 2'}, VOCAB).warnings.length === 1);

/* ---- 6. reading a typed sentence ---------------------------------------
   The point of this half is not that it understands English. It is that the
   only things it can produce are the four verbs, using charge names these
   documents contain -- and that when it cannot resolve a sentence it says so
   instead of guessing. Everything it does produce still goes through
   prValidateRule and prCheckRuleAgainstData before anyone can save it. */
const TYPED_VOCAB = ['Rent','Community Fee','Community Fee - 1 Bedroom','Community Fee - 2 Bedroom',
  'Resident Liability Insurance','Cable / Internet Fee','Internet','Washer/Dryer','WD Rent','Washer / Dryer RG'];
const parse = t => prParseSentence(t, TYPED_VOCAB);

const pAlias = parse('community fee 1 bedroom and community fee 2 bedroom are the same as community fee');
check('Tiers named against their base charge read as one alias rule',
  pAlias.rule && pAlias.rule.type === 'alias' && pAlias.rule.target === 'Community Fee');
check('...capturing BOTH tiers, not just the nearer one',
  pAlias.rule && pAlias.rule.spellings.length === 2);

// A shorter charge name sitting inside two longer ones must still be found --
// stopping at the first occurrence used to lose it entirely.
check('A charge whose name is contained in longer ones is still recognised',
  prFindLabels('community fee 1 bedroom and community fee 2 bedroom are the same as community fee',
    TYPED_VOCAB).indexOf('Community Fee') !== -1);

check('The canonical name is the last one mentioned, not the longest',
  parse('wd rent and washer / dryer rg are just our washer/dryer charge').rule.target === 'Washer/Dryer');

const pBundle = parse('we lump internet and washer/dryer into the community fee');
check('"lumped into" reads as a bundle', pBundle.rule && pBundle.rule.type === 'bundle');
check('...with the rent roll line as the total', pBundle.rule.rentRollLabel === 'Community Fee');
check('...and the lease lines as the parts', pBundle.rule.leaseLabels.length === 2);

check('"we don\'t charge it" reads as a roll-up',
  parse("we dont charge community fee - 2 bedroom, its left over from the old template").rule.type === 'rollup');

// It must refuse rather than invent.
const pJunk = parse('the blue widget thing');
check('A sentence naming no real charge produces NO rule', pJunk.rule === null);
check('...and offers the vocabulary it does know', pJunk.knownLabels.length > 0);

const pVague = parse('community fee');
check('A charge named with no instruction produces no rule', pVague.rule === null);
check('...and says what kinds of sentence do work', /same charge|add up/.test(pVague.reason));

check('Empty input is not a rule', parse('').rule === null);

// The boundary holds on typed input exactly as it does everywhere else.
const pRent = parse('stop flagging rent');
check('A typed attempt at rent still produces a rule object to be judged',
  pRent.rule && (pRent.rule.subject === 'Rent'));
check('...which the validator then refuses',
  prValidateRule(pRent.rule, TYPED_VOCAB).ok === false);

// Every reading is a sentence a person can check.
check('A parsed rule always comes with a plain-English reading',
  ['community fee 1 bedroom and community fee 2 bedroom are the same as community fee',
   'we lump internet and washer/dryer into the community fee',
   "we dont charge community fee - 2 bedroom"].every(t => {
     const r = parse(t); return r.rule && typeof r.reading === 'string' && r.reading.length > 20; }));

console.log('=== PASS/FAIL ===');
for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
const passed = results.filter(r => r[1]).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
