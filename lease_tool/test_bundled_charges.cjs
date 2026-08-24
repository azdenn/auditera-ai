/* Bundled charges.
   ----------------
   Reported from a real property: the lease itemises WiFi $50, Trash $10,
   Pet Rent $10 and Pest Control $30, while the rent roll bills a single
   "Amenities $100". Nothing is wrong -- the parts are exactly the whole --
   but compared line by line it produced FIVE mismatches on that unit, and
   about a thousand across a 200-unit property, which made the tool unusable
   for them.

   What this pins down:
     - the false mismatches are real without a rule (the "before" case)
     - a bundle rule collapses them to one row and zero issues
     - a bundle that does NOT add up is still a Mismatch, so this can never
       become a way of talking the tool out of a finding
     - a property that itemises normally is completely unaffected
     - the tool detects the bundle on its own, and writes the rule in the
       DOCUMENT'S OWN WORDS ("WiFi") rather than the friendly category name
       ("Internet"), or the rule would never match again next month
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
  await page.evaluate(() => { try{ localStorage.removeItem('leaseproof_bundle_rules'); }catch(e){} });
  await page.reload();
  await page.setInputFiles('#lease-files', path.resolve(__dirname, 'synthetic_A101.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll_bundled.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout: 90000});
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === 'A101');
    const el = document.getElementById('bundle-suggest-banner');
    return {rows: e.rows.map(r => r.label + '|' + r.status),
            chargeIssues: e.rows.filter(r => isRealIssueRow(r)).length,
            bannerShown: !el.classList.contains('hidden'),
            bannerText: el.innerText.replace(/\s+/g,' ').trim(),
            hasButton: !!document.querySelector('[data-apply-bundle]')};
  });
  await page.click('[data-apply-bundle]');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === 'A101');
    // innerText of a collapsed <details> is empty, so open it before reading.
    document.getElementById('bundle-panel').open = true;
    return {rows: e.rows.map(r => r.label + '|' + r.status),
            chargeIssues: e.rows.filter(r => isRealIssueRow(r)).length,
            bannerGone: document.getElementById('bundle-suggest-banner').classList.contains('hidden'),
            rules: BUNDLE_RULES.length,
            ruleShown: document.getElementById('bundle-rule-list').innerText.replace(/\s+/g,' ').trim(),
            yardStillThere: e.rows.some(r => /Yard/i.test(r.label))};
  });
  await browser.close();

  const checks = [
    // Five to start: the four false ones caused by the bundling (Pest, Trash,
    // Parking on the lease + the single Amenities line on the rent roll), plus
    // Yard Premium, which is a GENUINE finding -- billed on the rent roll and
    // absent from the lease.
    ['E2E: the bundled rent roll produces 5 charge mismatches to start with', before.chargeIssues === 5],
    ['E2E: four of those are the bundling artefact', before.rows.filter(r =>
      /^(Pest control|Trash|Parking)\|leaseonly$/.test(r) || /^Amenities\|resmanonly$/.test(r)).length === 4],
    ['E2E: the suggestion banner appears on its own after processing', before.bannerShown === true && before.hasButton],
    ['E2E: it states the arithmetic that justifies the bundle',
      /\$54\.00/.test(before.bannerText) && /Amenities/.test(before.bannerText)],
    ['E2E: one click clears all four false mismatches', after.chargeIssues === 1 &&
      !after.rows.some(r => /^(Pest control|Trash|Parking)\|leaseonly$/.test(r))],
    // The important half of that check: bundling must not become a way of
    // clearing findings wholesale. The one real mismatch is still standing.
    ['E2E: the GENUINE mismatch on the same unit is still reported',
      after.rows.some(r => /^Yard Premium\|resmanonly$/.test(r))],
    ['E2E: the four lines collapse into a single matching bundled row',
      after.rows.filter(r => /bundled/.test(r)).length === 1 &&
      after.rows.some(r => /^Amenities \(bundled\)\|match$/.test(r))],
    ['E2E: unrelated charges on the same unit are untouched', after.yardStillThere === true],
    ['E2E: the banner stops offering a rule that is now saved', after.bannerGone === true],
    ['E2E: the saved rule is listed where it can be read and removed',
      after.rules === 1 && /Amenities/.test(after.ruleShown) && /Remove/.test(after.ruleShown)],
    ['E2E: no page errors', errors.length === 0],
  ];
  return {checks, errors, before, after};
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);
  await page.evaluate(() => { try{ localStorage.removeItem('leaseproof_bundle_rules'); }catch(e){} });
  await page.reload();

  const r = await page.evaluate((LEASE) => {
    const mk = (unit, amenities) => ({unit, residents:'R', total:1200+amenities,
      charges:[{description:'Rent', amount:1200},{description:'Amenities', amount:amenities}]});
    const sum = c => ({
      issues: c.rows.filter(x => isRealIssueRow(x)).length,
      rows: c.rows.map(x => x.label + '|' + x.status + '|' + x.leaseVal + '|' + x.resmanVal),
      bundleRow: (c.rows.find(x => x.bundle) || null),
    });

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

    const afterSaved = detectBundleCandidates(entries);          // must not re-offer
    const savedRule = JSON.parse(JSON.stringify(BUNDLE_RULES[0]));
    removeBundleRule(savedRule.id);
    const afterRemoval = sum(reconcileUnit(LEASE, mk('B1',100)));

    return {before, cands, after, wrong, missingLine, plain, afterSaved, savedRule, afterRemoval,
            noSum, onlyOne, rulesLeft: BUNDLE_RULES.length};
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
    ['Nothing is suggested when the parts do not add up exactly', r.noSum.length === 0],
    ['A four-line bundle rule does not fire on a unit with only one of those lines',
      !r.onlyOne.bundleRow && r.onlyOne.issues === 2],
    ['A saved rule is not offered again as a suggestion', r.afterSaved.length === 0],
    ['The rule is stored in a readable, editable form', !!r.savedRule.rentRollLabel &&
      Array.isArray(r.savedRule.leaseLabels) && r.savedRule.leaseLabels.length === 4],
    ['Removing the rule restores the original behaviour, so nothing is one-way',
      r.rulesLeft === 0 && r.afterRemoval.issues === 5],
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
