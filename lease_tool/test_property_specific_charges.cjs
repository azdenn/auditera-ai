/* Property specific charges -- the lease's write-in "Other:" lines.
   ----------------------------------------------------------------
   Section L of the TAA lease ("Additional Rent - Monthly Recurring Fixed
   Charges") has eight NAMED rows -- Animal rent, Cable/satellite, Internet,
   Package service, Pest control, Stormwater/drainage, Trash, Washer/Dryer --
   which are the same on every lease in Texas. Underneath them sit four blank
   lines:

       Other: ______________________________   $ ________

   Those are filled in by hand, per property. Valet trash, amenity fee,
   whatever that office decided to bill. They are real lease charges and they
   are different everywhere, which is why they were the biggest single source
   of false mismatches reported from the field: one property's write-ins made
   nearly every unit look wrong.

   TWO KINDS OF WRITE-IN, AND THE TEST USES BOTH.
   "Valet Trash" is already a known alias for the Trash category, so it gets
   filed under Charges & fees like any ordinary trash charge -- and must STILL
   appear in the property-specific list, or the only way to silence it would
   be to switch off Trash entirely and lose the standard charge with it.
   "Amenity Fee" matches nothing, so it lands in Unrecognized. Both are
   write-ins; both belong in the third group.

   What this pins down:
     - the write-ins are read off Section L, and blank / "N/A" / $0 lines are
       not invented into charges
     - a charge from an Other line is TAGGED, through to the results row,
       whether or not it matched a known category
     - those tags become a third Option Filters group, built from the
       documents rather than declared in code
     - the group is SHOWN by default -- these are charges a resident is being
       billed, and a filter that started ticked would hide a real overcharge
       behind a box nobody knew to look in
     - ticking one write-in hides only that one; ticking the category it
       landed in hides it too (union, so a ticked box always means "stop this
       flagging units")
     - nothing is deleted -- a filtered row is still there to show muted
     - standard Section L rows are NOT swept into this group
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

// A faithful copy of Section L as it comes off a real signed lease, including
// the blank rows and the "N/A" one an office wrote instead of leaving empty.
//
// The three write-in lines deliberately use the three different shapes real
// exports produce -- underscores after the label, before it, and absent
// altogether. All three have to read, because which one you get depends on
// the PDF, not on anything the property did differently.
const SECTION_L_TEXT = [
  'L. Additional Rent - Monthly Recurring Fixed Charges. You will pay separately for these items',
  'Animal rent $ 0        Cable/satellite $ ________     Internet $ ________',
  'Package service $ ________   Pest control $ 8.00      Stormwater/drainage $ ________',
  'Trash $ 12.00          Washer/Dryer $ ________',
  'Other: N/A __________________________________ $ 0',
  'Other: Valet Trash ___________________________ $ 25.00',
  'Other: ______________ Amenity Fee ____________ $ ______ 15.00',
  'Other: Reserved Parking $ 20.00',
  'Other: _______________________________________ $ ________',
].join('\n');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text()); });

  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);
  await page.evaluate(() => { try{ localStorage.removeItem('leaseproof_hidden_discrepancy_checks'); }catch(e){} });
  await page.reload();

  // ---- reading Section L -------------------------------------------------
  const parsed = await page.evaluate((text) => extractOtherLines(text), SECTION_L_TEXT);
  check('A write-in with underscores AFTER the label is read',
    parsed.some(o => o.label === 'Valet Trash' && o.value === 25));
  check('...and one with underscores BEFORE it, which used to be skipped silently',
    parsed.some(o => o.label === 'Amenity Fee' && o.value === 15));
  check('...and one with no underscores at all',
    parsed.some(o => o.label === 'Reserved Parking' && o.value === 20));
  check('The filler underscores never end up inside the label',
    !parsed.some(o => /_/.test(o.label)));
  check('A blank Other line is not invented into a charge',
    !parsed.some(o => o.value && !o.label));
  check('An "N/A" line carries no amount, so it is dropped downstream',
    parsed.some(o => o.label === 'N/A' && !o.value));
  check('The named Section L rows are not mistaken for write-ins',
    !parsed.some(o => /pest|washer|stormwater/i.test(o.label)));

  // ---- tagging, grouping and filtering ----------------------------------
  const r = await page.evaluate(() => {
    const LEASE = [
      {rawLabel:'Monthly Base Rent', amount:1200},
      {rawLabel:'Pest control',      amount:8},                   // standard Section L row
      {rawLabel:'Valet Trash',       amount:25, fromOther:true},  // write-in that DOES alias (Trash)
      {rawLabel:'Amenity Fee',       amount:15, fromOther:true},  // write-in that matches nothing
    ];
    // Rent roll bills the rent and pest control only. Neither write-in has a
    // counterpart, which is exactly the flood the customer reported.
    const BLOCK = {unit:'A1', residents:'R', total:1208,
      charges:[{description:'Rent', amount:1200},{description:'Pest Control Fees', amount:8}]};

    HIDDEN_CHECK_KEYS.clear();
    BUNDLE_RULES = [];
    const cmp = reconcileUnit(LEASE, BLOCK);

    const taggedWith = lbl => cmp.rows.find(x => (x.propLabels || []).indexOf(lbl) !== -1) || null;
    const valet   = taggedWith('Valet Trash');
    const amenity = taggedWith('Amenity Fee');
    const pest    = cmp.rows.find(x => /pest/i.test(x.label)) || null;

    // Which write-ins are still live findings, given whatever is ticked.
    const liveProps = () => {
      const out = [];
      for (const x of cmp.rows){
        if (!isRealIssueRow(x) || isRowFiltered(x)) continue;
        for (const l of (x.propLabels || [])) out.push(l);
      }
      return out.sort();
    };

    const entries = [{unit:'A1', rows: cmp.rows}];
    const changed = refreshPropertySpecificTypes(entries);
    const listed = PROPERTY_SPECIFIC_TYPES.map(t => t.label).sort();
    const groups = Array.from(new Set(allOptionFilterTypes().map(t => t.group)));

    const visibleByDefault = liveProps();

    HIDDEN_CHECK_KEYS.add(propFilterKey('Valet Trash'));
    const afterOneTicked = liveProps();
    const valetRowStillPresent = !!taggedWith('Valet Trash');
    const valetMarkedHidden = valet ? isRowFiltered(valet) : null;

    // Ticking the CATEGORY the write-in landed in must hide it too (union).
    HIDDEN_CHECK_KEYS.clear();
    HIDDEN_CHECK_KEYS.add('charge:' + (valet ? valet.category : 'UNMAPPED'));
    const afterCategoryTicked = liveProps();

    // A standard row must not be reachable from the property-specific list.
    HIDDEN_CHECK_KEYS.clear();
    HIDDEN_CHECK_KEYS.add(propFilterKey('Pest control'));
    const pestHidden = pest ? isRowFiltered(pest) : null;

    HIDDEN_CHECK_KEYS.clear();
    return {
      valetTagged:   valet   ? (valet.propLabels || []) : null,
      valetCategory: valet   ? valet.category : null,
      amenityTagged: amenity ? (amenity.propLabels || []) : null,
      amenityCategory: amenity ? amenity.category : null,
      pestTagged:    pest    ? (pest.propLabels || null) : null,
      listed, groups, changed, visibleByDefault, afterOneTicked, afterCategoryTicked,
      valetRowStillPresent, valetMarkedHidden, pestHidden,
      sameKey: propFilterKey('valet trash ') === propFilterKey('Valet-Trash'),
    };
  });

  check('A write-in that matches a known category is still tagged as a write-in',
    Array.isArray(r.valetTagged) && r.valetTagged.indexOf('Valet Trash') !== -1);
  check('...and is filed under that category, not dumped in Unrecognized',
    r.valetCategory && r.valetCategory !== 'UNMAPPED');
  check('A write-in that matches nothing is tagged too',
    Array.isArray(r.amenityTagged) && r.amenityTagged.indexOf('Amenity Fee') !== -1);
  check('...landing in Unrecognized, as before', r.amenityCategory === 'UNMAPPED');
  check('A standard Section L row is NOT tagged', !r.pestTagged);

  check('The write-ins become a third Option Filters group',
    r.groups.indexOf('Property specific charges') !== -1 && r.groups.length === 3);
  check('...alongside the two fixed groups, not replacing them',
    r.groups.indexOf('Lease verification') !== -1 && r.groups.indexOf('Charges & fees') !== -1);
  check('...listing the charges actually found in these leases',
    JSON.stringify(r.listed) === JSON.stringify(['Amenity Fee','Valet Trash']));
  check('...and reporting the list changed, so the panel re-renders once', r.changed === true);

  check('SHOWN BY DEFAULT: both write-ins are live findings until switched off',
    JSON.stringify(r.visibleByDefault) === JSON.stringify(['Amenity Fee','Valet Trash']));
  check('Ticking one write-in hides only that one',
    JSON.stringify(r.afterOneTicked) === JSON.stringify(['Amenity Fee']));
  check('...and never deletes it -- the row is still there to show muted',
    r.valetRowStillPresent === true && r.valetMarkedHidden === true);
  check('Spelling drift between leases lands on the same switch', r.sameKey === true);
  check('Ticking the category it landed in hides it too (union, not intersection)',
    r.afterCategoryTicked.indexOf('Valet Trash') === -1);
  check('A standard row cannot be switched off from the property-specific list',
    r.pestHidden === false);

  // ---- the panel ---------------------------------------------------------
  const panel = await page.evaluate(() => {
    // innerText of a collapsed <details> subtree is empty, so open it first.
    document.getElementById('discrepancy-filter-panel').open = true;
    HIDDEN_CHECK_KEYS.clear();
    PROPERTY_SPECIFIC_TYPES = [];
    renderDiscrepancyFilterPanel();
    const empty = document.getElementById('discrepancy-filter-checks').innerText;

    PROPERTY_SPECIFIC_TYPES = [
      {key: propFilterKey('Valet Trash'), label:'Valet Trash', group: PROPERTY_SPECIFIC_GROUP, prop:true},
    ];
    renderDiscrepancyFilterPanel();
    const wrap = document.getElementById('discrepancy-filter-checks');
    const titles = Array.from(wrap.querySelectorAll('.filter-group-title'))
      .map(t => t.textContent.replace('toggle all','').trim());
    const box = wrap.querySelector('input[data-check-key="' + propFilterKey('Valet Trash') + '"]');
    return {
      emptyMentionsOther: /Other:/.test(empty) && /once leases have been processed/i.test(empty),
      titles,
      hasBox: !!box,
      boxTicked: box ? box.checked : null,
      filled: wrap.innerText,
    };
  });

  check('The group is listed before anything is uploaded, explaining what goes in it',
    panel.emptyMentionsOther === true);
  check('The three group headings are shown in order',
    JSON.stringify(panel.titles) === JSON.stringify(['Lease verification','Charges & fees','Property specific charges']));
  check('A found write-in gets its own checkbox', panel.hasBox === true);
  check('...unticked, because these are shown by default', panel.boxTicked === false);
  check('...under a heading that says where these charges come from',
    /written onto the blank/i.test(panel.filled));

  check('No page or console errors', errors.length === 0);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  if (errors.length) console.log('ERRORS:', errors);
  const passed = results.filter(x => x[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
