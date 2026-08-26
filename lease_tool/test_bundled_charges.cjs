/* Bundled charges.
   ----------------
   Reported from a real property: the lease itemises WiFi $50, Trash $10,
   Pet Rent $10 and Pest Control $30, while the rent roll bills a single
   "Amenities $100". Nothing is wrong -- the parts are exactly the whole --
   but compared line by line it produced FIVE mismatches on that unit, and
   about a thousand across a 200-unit property, which made the tool unusable
   for them.

   THIS BEHAVIOUR IS NOW AUTOMATIC (changed 2026-08-25).
   It used to be offered in a banner above the results and, once accepted,
   saved to localStorage and listed in a settings panel. Both are gone.
   Recognising that four lease lines sum to one rent roll line is reading the
   documents correctly, not a preference worth interrupting someone for, and
   a *saved* rule outlives the documents that justified it -- it keeps
   matching by name into next month's export and can quietly suppress a real
   mismatch. Rules are therefore derived fresh on every run and never stored.

   What this pins down:
     - the false mismatches are real without a rule (the "before" case)
     - the tool applies the bundle ITSELF, with no click and no banner
     - a bundle that does NOT add up is still a Mismatch, so this can never
       become a way of talking the tool out of a finding
     - a genuine mismatch on the same unit survives the bundling
     - nothing is persisted: clearing the in-memory rules restores the
       original reading, and no bundle rule is written to localStorage
     - a property that itemises normally is completely unaffected
     - the rule is written in the DOCUMENT'S OWN WORDS ("WiFi") rather than
       the friendly category name ("Internet"), or it would match nothing
     - each bundled row still explains its own arithmetic, so removing the
       banner removed the interruption and not the explanation
*/
const { chromium } = require('playwright');
const path = require('path');

const LEASE = [
  {rawLabel:'Monthly Base Rent', amount:1200},
  {rawLabel:'WiFi', amount:50},
  {rawLabel:'Trash Service Fee', amount:10},
  {rawLabel:'Pet Rent', amount:10},
  {rawLabel:'Pest Control Fees', amount:30},
];


/* ---------------------------------------------------------------------------
   End-to-end: a real lease PDF against a rent roll that bundles that unit's
   amenity charges, driven entirely through the UI.
   A101's lease itemises Pest control $12 + Trash service $17 + Reserved
   Parking $25 = $54; the rent roll bills a single "Amenities $54".

   The whole point of this section is that NOTHING is clicked between
   processing and reading the result.
   --------------------------------------------------------------------------- */
const { chromium: chromium2 } = require('playwright');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');
async function endToEnd(){
  const browser = await chromium2.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);
  // Deliberately seed the OLD storage key with a rule. A previous build wrote
  // these; this one must ignore them entirely rather than silently inheriting
  // suppression rules nobody can see or remove any more.
  await page.evaluate(() => {
    try{
      localStorage.setItem('leaseproof_bundle_rules', JSON.stringify([
        {id:'stale', rentRollLabel:'Yard Premium', leaseLabels:['Nothing','At All'], enabled:true},
      ]));
    }catch(e){}
  });
  await page.reload();
  await page.setInputFiles('#lease-files', path.resolve(__dirname, 'synthetic_A101.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll_bundled.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout: 90000});
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === 'A101');
    const bundleRow = e.rows.find(r => r.bundle) || null;
    return {
      rows: e.rows.map(r => r.label + '|' + r.status),
      chargeIssues: e.rows.filter(r => isRealIssueRow(r)).length,
      rules: BUNDLE_RULES.length,
      note: bundleRow ? bundleRow.note : '',
      // The removed UI must be gone from the DOM, not merely hidden -- a
      // hidden panel is a panel someone re-enables by accident.
      bannerEl: !!document.getElementById('bundle-suggest-banner'),
      panelEl: !!document.getElementById('bundle-panel'),
      ruleListEl: !!document.getElementById('bundle-rule-list'),
      applyBtn: !!document.querySelector('[data-apply-bundle]'),
      // Charge Mappings stays -- it was explicitly kept.
      aliasPanelEl: !!document.getElementById('alias-panel'),
      stored: (() => { try{ return localStorage.getItem('leaseproof_bundle_rules'); }catch(e){ return 'ERR'; } })(),
    };
  });

  // Re-running the reconcile must not accumulate rules: they are re-derived,
  // not appended to. Without the reset this climbs every time anything on the
  // page triggers a reconcile (an alias edit, a filter tick).
  const rerun = await page.evaluate(() => { reconcileAll(); reconcileAll(); return BUNDLE_RULES.length; });

  await browser.close();

  const checks = [
    ['E2E: the bundle is applied with no click and no banner', after.chargeIssues === 1 &&
      !after.rows.some(r => /^(Pest control|Trash|Parking)\|leaseonly$/.test(r))],
    ['E2E: the four lines collapse into a single matching bundled row',
      after.rows.filter(r => /bundled/.test(r)).length === 1 &&
      after.rows.some(r => /^Amenities \(bundled\)\|match$/.test(r))],
    // The important half: bundling must not become a way of clearing findings
    // wholesale. The one real mismatch is still standing.
    ['E2E: the GENUINE mismatch on the same unit is still reported',
      after.rows.some(r => /^Yard Premium\|resmanonly$/.test(r))],
    ['E2E: the bundled row still explains its own arithmetic',
      /\$54\.00/.test(after.note) && /Amenities/.test(after.note)],
    ['E2E: the suggestion banner is gone from the page entirely', after.bannerEl === false],
    ['E2E: the Bundled Charges settings panel is gone too', after.panelEl === false && after.ruleListEl === false],
    ['E2E: there is no "bundle these" button left to click', after.applyBtn === false],
    ['E2E: Charge Mappings was kept', after.aliasPanelEl === true],
    ['E2E: a rule left behind by an older build is ignored, not inherited',
      !BUNDLE_LABELS_INCLUDE(after, 'Nothing')],
    ['E2E: nothing new is written to the old bundle-rules storage key',
      after.stored === JSON.stringify([{id:'stale', rentRollLabel:'Yard Premium', leaseLabels:['Nothing','At All'], enabled:true}])],
    ['E2E: exactly one rule was derived, and re-reconciling does not accumulate',
      after.rules === 1 && rerun === 1],
    ['E2E: no page errors', errors.length === 0],
  ];
  return {checks, errors, after};
}

// The stale seeded rule claims lease lines that do not exist. If it were being
// honoured, the reconciler would be carrying a rule mentioning them.
function BUNDLE_LABELS_INCLUDE(after, word){
  return after.rows.some(r => r.indexOf(word) !== -1);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  const r = await page.evaluate((LEASE) => {
    const mk = (unit, amenities) => ({unit, residents:'R', total:1200+amenities,
      charges:[{description:'Rent', amount:1200},{description:'Amenities', amount:amenities}]});
    const sum = c => ({
      issues: c.rows.filter(x => isRealIssueRow(x)).length,
      rows: c.rows.map(x => x.label + '|' + x.status + '|' + x.leaseVal + '|' + x.resmanVal),
      bundleRow: (c.rows.find(x => x.bundle) || null),
    });

    BUNDLE_RULES = [];
    const before = sum(reconcileUnit(LEASE, mk('B1',100)));
    const entries = [{unit:'B1', cmp:reconcileUnit(LEASE, mk('B1',100))},
                     {unit:'B2', cmp:reconcileUnit(LEASE, mk('B2',100))},
                     {unit:'B3', cmp:reconcileUnit(LEASE, mk('B3',100))}];
    const cands = detectBundleCandidates(entries);

    // Detection must require the parts to add up EXACTLY. A rent roll line of
    // $77 is explained by no combination of 50/10/10/30, so proposing any
    // bundle here would be inventing an explanation.
    const noSum = detectBundleCandidates([{unit:'N1', cmp:reconcileUnit(LEASE, {unit:'N1', residents:'R', total:1277,
      charges:[{description:'Rent', amount:1200},{description:'Amenities', amount:77}]})}]);

    addBundleRule(cands[0]);
    const after = sum(reconcileUnit(LEASE, mk('B1',100)));
    const wrong = sum(reconcileUnit(LEASE, mk('B9',120)));       // parts no longer add up
    const missingLine = sum(reconcileUnit(LEASE, {unit:'B8', residents:'R', total:1200,
      charges:[{description:'Rent', amount:1200}]}));            // no Amenities line at all
    const plain = sum(reconcileUnit(LEASE, {unit:'P1', residents:'R', total:1300, charges:[
      {description:'Rent', amount:1200},{description:'WiFi', amount:50},
      {description:'Trash Service Fee', amount:10},{description:'Pet Rent', amount:10},
      {description:'Pest Control Fees', amount:30}]}));
    // A rule describing a FOUR-line bundle must not fire when only one of
    // those lines is on the lease -- one line against one line is an alias,
    // and collapsing it here would hide a genuine one-to-one difference.
    const onlyOne = sum(reconcileUnit(
      [{rawLabel:'Monthly Base Rent', amount:1200}, {rawLabel:'WiFi', amount:100}],
      mk('B7', 100)));

    const afterSaved = detectBundleCandidates(entries);          // must not re-derive one it has
    const derivedRule = JSON.parse(JSON.stringify(BUNDLE_RULES[0]));

    // Rules live only in memory. Dropping them restores the original reading,
    // which is what makes "derived, never stored" true rather than a comment.
    BUNDLE_RULES = [];
    const afterClear = sum(reconcileUnit(LEASE, mk('B1',100)));

    return {before, cands, after, wrong, missingLine, plain, afterSaved, derivedRule, afterClear,
            noSum, onlyOne, rulesLeft: BUNDLE_RULES.length,
            hasLoader: typeof loadBundleRules, hasSaver: typeof saveBundleRules};
  }, LEASE);

  const c = r.cands[0] || {};
  const keys = (c.leaseLabels||[]).map(x=>x.toLowerCase()).sort().join(',');
  const checks = [
    ['Without a rule, the bundled property produces 5 false mismatches', r.before.issues === 5],
    ['The tool detects the bundle on its own', r.cands.length === 1],
    ['...naming the rent roll line it found', c.rentRollLabel === 'Amenities'],
    ['...and the four lease lines that sum to it', keys === 'pest control fees,pet rent,trash service fee,wifi'],
    ['...written in the document\'s own words, not the category label',
      (c.leaseLabels||[]).includes('WiFi') && !(c.leaseLabels||[]).includes('Internet')],
    ['...with the arithmetic that justifies it ($50+$10+$10+$30 = $100)', c.total === 100 && c.rentRollAmount === 100],
    ['...and how many units share the pattern', (c.units||[]).length === 3],
    ['With the rule applied, the unit is completely clean', r.after.issues === 0],
    ['The four lease lines and the rent roll line collapse into ONE row',
      r.after.rows.length === 2 && r.after.rows.some(x => /^Amenities \(bundled\)\|match\|100\|100$/.test(x))],
    ['The bundle row is marked as a bundle and carries the rule id',
      !!r.after.bundleRow && r.after.bundleRow.bundle === true && !!r.after.bundleRow.bundleRuleId],
    ['Its note shows the arithmetic, so the audit stays explainable',
      !!r.after.bundleRow && /WiFi \$50\.00/.test(r.after.bundleRow.note) && /\$100\.00/.test(r.after.bundleRow.note)],
    ['A bundle whose parts DO NOT add up is still a Mismatch', r.wrong.issues === 1 &&
      r.wrong.rows.some(x => /^Amenities \(bundled\)\|mismatch\|100\|120$/.test(x))],
    ['...and says which way it is out', !!r.wrong.bundleRow && /\$20\.00 LESS/.test(r.wrong.bundleRow.note)],
    ['A unit with no bundled line falls back to normal reporting, not a false match',
      r.missingLine.issues === 4 && !r.missingLine.bundleRow],
    ['A property that itemises normally is completely unaffected', r.plain.issues === 0],
    ['Nothing is derived when the parts do not add up exactly', r.noSum.length === 0],
    ['A four-line bundle rule does not fire on a unit with only one of those lines',
      !r.onlyOne.bundleRow && r.onlyOne.issues === 2],
    ['A rule already held is not derived a second time', r.afterSaved.length === 0],
    ['The derived rule is in a readable form', !!r.derivedRule.rentRollLabel &&
      Array.isArray(r.derivedRule.leaseLabels) && r.derivedRule.leaseLabels.length === 4],
    ['Rules are memory-only: clearing them restores the original reading',
      r.rulesLeft === 0 && r.afterClear.issues === 5],
    ['There is no code left that reads or writes saved bundle rules',
      r.hasLoader === 'undefined' && r.hasSaver === 'undefined'],
    ['No page or console errors', errors.length === 0],
  ];

  const e2e = await endToEnd();
  const allChecks = checks.concat(e2e.checks);
  errors.push(...e2e.errors);

  let ok = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of allChecks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) ok=false; }
  console.log('detected:', JSON.stringify(c.leaseLabels), '->', c.rentRollLabel, '=', c.total);
  console.log('=== errors ===', errors);
  if (!ok || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
