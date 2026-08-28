/* Recognising a charge when the two documents call it different things.
   -------------------------------------------------------------------
   Every case here is taken from one real property's rent roll (112 units),
   where the tool reported a wall of mismatches that were not mismatches at
   all -- just the lease and the rent roll using different words for the same
   money.

   The three failures this pins down:

   1. RESIDENT LIABILITY INSURANCE had no category at all. 93 of 112 units
      carried it, so 93 units showed an unrecognised charge. The lease writes
      it on an Other: line as "Liability Insurance"; the rent roll bills it as
      "Resident Liability Insurance". Same charge, and they must reconcile
      against each other rather than each appearing as an unmatched line.

   2. CABLE AND INTERNET were two categories. The TAA lease has two rows
      because the form has two boxes; the property bills one combined line
      ("Cable / Internet Fee") because it buys one bundled service. Two
      categories against one line is wrong on every unit -- and "Cable /
      Internet Fee" holds a word from each alias list, so which category won
      was decided by iteration order rather than by any rule.

   3. PLURALS. The rent roll line "Fresh Spring Move In Specials!" missed the
      "Move In Special" alias by one letter, so every unit that got a move-in
      special showed an unrecognised charge.

   What must NOT happen: charges that are genuinely different quietly matching
   because their names look alike. The negative controls at the bottom are the
   real test of this change.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

// Verbatim from the real rent roll's Description column.
const REAL_RENT_ROLL_CHARGES = {
  'Rent':                            'RENT',
  'Community Fee':                   'UNMAPPED',   // a property-specific bundle; see below
  'Resident Liability Insurance':    'INSURANCE',
  'Cable / Internet Fee':            'CABLE_INTERNET',
  'Washer/Dryer':                    'WASHERDRYER',
  'WD Rent':                         'WASHERDRYER',
  'Washer / Dryer RG':               'WASHERDRYER',
  'Deposit Waiver Fee (LeaseLock)':  'DEPOSIT_WAIVER',
  'Reserved Parking Fee':            'PARKING',
  'Credit Builder - Liudys Alvares': 'CREDIT_BUILDER',
  'Pet Rent - Cat - Gibson':         'PET',
  'Pet Rent - Dog - Marvin':         'PET',
  'Fresh Spring Move In Specials!':  'CONCESSION',
  'Month To Month Premium':          'MONTH_TO_MONTH_FEE',
};

// And the matching lines as they appear on the TAA lease form.
const REAL_LEASE_LABELS = {
  'Cable/satellite':      'CABLE_INTERNET',
  'Internet':             'CABLE_INTERNET',
  'Liability Insurance':  'INSURANCE',
  'Monthly Base Rent':    'RENT',
  'Washer/Dryer':         'WASHERDRYER',
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  // ---- classification, against the real vocabulary ------------------------
  const classified = await page.evaluate((names) =>
    names.map(n => [n, classify(n, ALIAS_MAP).category]),
    Object.keys(REAL_RENT_ROLL_CHARGES).concat(Object.keys(REAL_LEASE_LABELS)));
  const got = Object.fromEntries(classified);

  for (const [label, expected] of Object.entries(REAL_RENT_ROLL_CHARGES)){
    check('Rent roll line "' + label + '" reads as ' + expected, got[label] === expected);
  }
  for (const [label, expected] of Object.entries(REAL_LEASE_LABELS)){
    check('Lease line "' + label + '" reads as ' + expected, got[label] === expected);
  }

  // "Community Fee" staying unmapped is deliberate, not an oversight: it is a
  // property's own bundle of smaller amenity charges, which is the bundle
  // mechanism's job, not an alias's. Aliasing it to something would be
  // guessing at what a particular office folded into it.
  check('A property-specific bundle line is NOT force-fitted into a category',
    got['Community Fee'] === 'UNMAPPED');

  // ---- the reconciliation those classifications produce --------------------
  const recon = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS.clear();
    BUNDLE_RULES = [];

    // The real shape: lease splits cable and internet, rent roll combines
    // them; lease writes insurance on an Other: line in short form, rent roll
    // bills it in long form.
    const LEASE = [
      {rawLabel:'Monthly Base Rent',   amount:1225},
      {rawLabel:'Cable/satellite',     amount:45},
      {rawLabel:'Internet',            amount:30},
      {rawLabel:'Liability Insurance', amount:10, fromOther:true},
    ];
    const BLOCK = {unit:'1', residents:'Terry Sanchez', total:1310, charges:[
      {description:'Rent',                         amount:1225},
      {description:'Cable / Internet Fee',         amount:75},
      {description:'Resident Liability Insurance', amount:10},
    ]};
    const cmp = reconcileUnit(LEASE, BLOCK);
    const row = lbl => cmp.rows.find(r => r.label === lbl) || null;
    const cable = row(CATEGORY_LABELS.CABLE_INTERNET);
    const ins   = row(CATEGORY_LABELS.INSURANCE);

    // Ticking the lease's own write-in wording must silence the row even
    // though the rent roll calls it something longer.
    HIDDEN_CHECK_KEYS.add(propFilterKey('Liability Insurance'));
    const insHiddenByWriteIn = ins ? isRowFiltered(ins) : null;
    HIDDEN_CHECK_KEYS.clear();
    HIDDEN_CHECK_KEYS.add('charge:INSURANCE');
    const insHiddenByCategory = ins ? isRowFiltered(ins) : null;
    HIDDEN_CHECK_KEYS.clear();

    return {
      cable: cable && {status: cable.status, lease: cable.leaseVal, resman: cable.resmanVal,
                       leaseRaw: cable.leaseRaw, resmanRaw: cable.resmanRaw},
      ins: ins && {status: ins.status, lease: ins.leaseVal, resman: ins.resmanVal},
      insHiddenByWriteIn, insHiddenByCategory,
      issues: cmp.rows.filter(r => isRealIssueRow(r)).map(r => r.label),
      rowLabels: cmp.rows.map(r => r.label),
    };
  });

  check('Cable and internet reconcile as ONE row, not two',
    recon.rowLabels.filter(l => /cable|internet/i.test(l)).length === 1);
  check('...summing the two lease lines against the one combined rent roll line',
    recon.cable && recon.cable.lease === 75 && recon.cable.resman === 75);
  check('...and that is a match, not a mismatch', recon.cable && recon.cable.status === 'match');
  check('...with both original lease wordings still shown',
    recon.cable && recon.cable.leaseRaw.join(',') === 'Cable/satellite,Internet');
  check('...and the rent roll\'s own wording still shown',
    recon.cable && recon.cable.resmanRaw.join(',') === 'Cable / Internet Fee');

  check('"Liability Insurance" and "Resident Liability Insurance" are the same charge',
    recon.ins && recon.ins.status === 'match');
  check('...at the same amount', recon.ins && recon.ins.lease === 10 && recon.ins.resman === 10);
  check('...and it is switched off by the lease\'s own wording on the toggle',
    recon.insHiddenByWriteIn === true);
  check('...or by the category, whichever the user reaches for first',
    recon.insHiddenByCategory === true);

  check('THE POINT: a unit like this now raises no discrepancies at all',
    recon.issues.length === 0);

  // ---- negative controls --------------------------------------------------
  // The failure mode of loosening name matching is charges that are genuinely
  // different quietly reconciling against each other. These must all stay
  // distinct, and a real difference in money must still be caught.
  const neg = await page.evaluate(() => {
    const cat = s => classify(s, ALIAS_MAP).category;
    const distinct = [
      ['Pest Control', 'Package service'], ['Trash', 'Parking'],
      ['Pet Rent', 'Rent'], ['Credit Builder', 'Deposit Waiver Fee'],
      ['Cable / Internet Fee', 'Trash Service Fee'],
      ['Resident Liability Insurance', 'Renters Legal Liability'], // same -> must NOT be distinct
    ].map(([a,b]) => [a, b, cat(a), cat(b)]);

    HIDDEN_CHECK_KEYS.clear(); BUNDLE_RULES = [];
    // Same names as the happy path, but the money is wrong: the combined
    // rent roll line is $10 more than the lease's two lines add up to.
    const cmp = reconcileUnit(
      [{rawLabel:'Cable/satellite', amount:45}, {rawLabel:'Internet', amount:30}],
      {unit:'2', residents:'R', total:85, charges:[{description:'Cable / Internet Fee', amount:85}]});
    const row = cmp.rows.find(r => r.label === CATEGORY_LABELS.CABLE_INTERNET);
    return {
      distinct,
      overbilledStatus: row ? row.status : null,
      overbilledIsIssue: row ? isRealIssueRow(row) : null,
      // plural folding must not reach across genuinely different words
      gasStillGas: cat('Gas') === cat('Gas'),
      accessNotAcces: (function(){ const w = toWords('Access Fees'); return w.indexOf('access') !== -1; })(),
    };
  });

  for (const [a, b, ca, cb] of neg.distinct){
    if (a === 'Resident Liability Insurance'){
      check('"' + a + '" and "' + b + '" ARE the same charge', ca === cb && ca === 'INSURANCE');
    } else {
      check('"' + a + '" and "' + b + '" stay different charges', ca !== cb);
    }
  }
  check('A real overcharge on the combined line is still caught',
    neg.overbilledStatus === 'mismatch' && neg.overbilledIsIssue === true);
  check('Plural folding leaves "access" intact rather than chopping the ss',
    neg.accessNotAcces === true);

  check('No page or console errors', errors.length === 0);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  if (errors.length) console.log('ERRORS:', errors);
  const passed = results.filter(x => x[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
