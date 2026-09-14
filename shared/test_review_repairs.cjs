const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const r = require('./property_rules.js');
let n = 0;
const check = (name, fn) => { fn(); console.log('PASS ' + name); n++; };
const vocab = ['Internet', 'Washer/Dryer', 'Amenity Fee'];
for (const text of ['Internet and Washer/Dryer are separate charges, not the same charge',
  'Internet and Washer/Dryer', 'Internet is not Washer/Dryer',
  "Internet isn't Washer/Dryer", 'Maybe Internet is the same as Washer/Dryer?',
  'No, do not combine Internet and Washer/Dryer', 'Amenity Fee is not normal for us']) {
  check(text, () => assert.equal(r.prParseSentence(text, vocab).rule, null));
}
check('Positive alias remains supported', () => assert.equal(
  r.prParseSentence('Internet is the same as Washer/Dryer', vocab).rule.type, 'alias'));
check('An explicit single-charge nonbilling statement remains a proposal', () => assert.equal(
  r.prParseSentence("we don't charge Amenity Fee", vocab).rule.type, 'rollup'));
check('Typed private explanation is not stored as a hide reason', () => assert.equal(
  r.prParseSentence('hide Amenity Fee because Example Resident asked', vocab).rule.reason,
  'Manager requested exclusion'));
for (const type of ['rollup', 'hide']) {
  const rule = { type, subject: 'Amenity Fee' };
  const ev = r.prCheckRuleAgainstData(rule, [{unit:'SYNTHETIC-1', rows:[{
    label:'Amenity Fee',resmanVal:25,leaseVal:null,status:'resmanonly'}]}]);
  check(type + ' undisclosed evidence suspends', () => {
    assert.equal(ev.blocked, true); assert.equal(r.prRuleStatus(rule, ev), 'suspended');
    assert.match(r.prExplainStatus(rule, ev, 'suspended'), /original findings/i);
  });
}
check('Blocked takes precedence over zero coverage', () => assert.equal(
  r.prRuleStatus({}, {blocked:true,unitsExamined:0}), 'suspended'));
check('No observations remains dormant', () => assert.equal(r.prRuleStatus({}, {unitsExamined:0}), 'dormant'));
check('Actual observations can activate', () => assert.equal(r.prRuleStatus({}, {unitsExamined:3,contradictedOn:0}), 'active'));
check('All routing configurations invoke the Worker first', () => {
  for (const file of ['wrangler.jsonc','dist/wrangler.jsonc','dist/wrangler.testing.jsonc'])
    assert.match(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), /"run_worker_first"\s*:\s*true/);
});
check('Concession upload copy agrees with optional lease behavior', () => {
  const html=fs.readFileSync(path.join(__dirname,'../concession_tool/template.html'),'utf8');
  assert.match(html, /optional, recommended/); assert.doesNotMatch(html, /All three are required|most people can skip|Checks two things/);
});
console.log(n + '/' + n + ' passed');
