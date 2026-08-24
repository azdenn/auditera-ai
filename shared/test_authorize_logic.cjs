/* The decision half of authorize-audit, tested on its own.
 *
 * The function's source is TypeScript for Deno, so the logic block is lifted
 * out and evaluated here rather than imported. That is a real risk of drift,
 * so the extraction is checked: if the markers move or the block stops
 * containing what it should, this fails loudly rather than testing a stale
 * copy of the rules.
 */
const fs = require('fs');

const src = fs.readFileSync('/home/claude/edge/authorize-audit.ts', 'utf8');
const start = src.indexOf('function pgNormalizeName');
const end = src.indexOf('function messageFor');
if (start === -1 || end === -1 || end <= start) {
  console.error('FATAL: could not locate the matching block in authorize-audit.ts.');
  process.exit(1);
}
let block = src.slice(start, end);
// Strip the TypeScript so plain Node can run the identical logic.
block = block
  .replace(/: Record<string, string>/g, '')
  .replace(/: unknown/g, '')
  .replace(/: string \| null/g, '')
  .replace(/: string/g, '')
  .replace(/: Prop\[\]/g, '')
  .replace(/type Prop = \{[^}]*\};/g, '')
  .replace(/ as const/g, '')
  .replace(/\(w\)/g, '(w)');

for (const must of ['pgNormalizeName', 'pgNormalizeAddress', 'pgAddressKey', 'function decide']) {
  if (!block.includes(must)) {
    console.error('FATAL: extracted block is missing ' + must + ' -- the extraction is wrong.');
    process.exit(1);
  }
}

let decide;
try {
  decide = new Function(block + '; return decide;')();
} catch (e) {
  console.error('FATAL: extracted logic did not evaluate: ' + e.message);
  process.exit(1);
}

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

// The two real properties on the first live account.
const BLANCO = {id:'p1', name:'Blanco Oaks Apartments', address:'525 Jones Ave, Blanco, TX 78606', status:'active'};
const GARDEN = {id:'p2', name:'Garden Creek Apartments', address:'110 Bluebonnet Cir, Boerne, TX 78006', status:'active'};
const BOTH = [BLANCO, GARDEN];

// --- the everyday case ----------------------------------------------------
check('A licensed property, named exactly as ResMan writes it, is allowed',
  decide('Blanco Oaks Apartments', '', BOTH).verdict === 'allowed');
check('...matched by name', decide('Blanco Oaks Apartments', '', BOTH).via === 'name');
check('The second licensed property is allowed too',
  decide('Garden Creek Apartments', '', BOTH).verdict === 'allowed');

// --- the spellings that actually occur in real exports ---------------------
check('Case and punctuation differences still match',
  decide('BLANCO OAKS APARTMENTS.', '', BOTH).verdict === 'allowed');
check('"Apts" instead of "Apartments" still matches',
  decide('Blanco Oaks Apts', '', BOTH).verdict === 'allowed');
check('Bare name with no suffix still matches',
  decide('Blanco Oaks', '', BOTH).verdict === 'allowed');
check('Extra whitespace still matches',
  decide('  Blanco   Oaks  Apartments ', '', BOTH).verdict === 'allowed');

// --- addresses, which is all a lease gives you ----------------------------
check('A lease address matches even with no name',
  decide('', '525 Jones Ave, Blanco, TX 78606', BOTH).verdict === 'allowed');
check('...matched by address', decide('', '525 Jones Ave', BOTH).via === 'address');
check('"Avenue" spelled out matches "Ave" in the database',
  decide('', '525 Jones Avenue, Blanco TX', BOTH).verdict === 'allowed');
check('"Circle" spelled out matches "Cir"',
  decide('', '110 Bluebonnet Circle, Boerne, TX', BOTH).verdict === 'allowed');

// --- the whole point: somebody else's property ----------------------------
const onlyBlanco = [BLANCO];
check('An unlicensed property is BLOCKED, not warned about',
  decide('Garden Creek Apartments', '', onlyBlanco).verdict === 'blocked');
check('An unlicensed property by address alone is blocked',
  decide('', '110 Bluebonnet Cir, Boerne, TX 78006', onlyBlanco).verdict === 'blocked');
check('A property nobody on this account owns is blocked',
  decide('Sunset Ridge Townhomes', '2200 Loop 410', BOTH).verdict === 'blocked');

// --- near-miss names must NOT sneak through -------------------------------
// This is the case a substring rule would get wrong: a genuinely different
// building whose name starts with a licensed one.
check('"Blanco Oaks Estates" does NOT pass as "Blanco Oaks"',
  decide('Blanco Oaks Estates', '', onlyBlanco).verdict === 'blocked');
check('"Blanco Oaks II" does NOT pass as "Blanco Oaks"',
  decide('Blanco Oaks II', '', onlyBlanco).verdict === 'blocked');
check('A bare shared word does not pass',
  decide('Oaks', '', onlyBlanco).verdict === 'blocked');

// --- addresses that differ only in the number ------------------------------
check('Same street, different building number is blocked',
  decide('', '527 Jones Ave, Blanco, TX 78606', onlyBlanco).verdict === 'blocked');
// A bare ZIP with no house number yields no address key at all, so this lands
// as 'unknown' rather than 'blocked'. Both refuse; the wording differs because
// the fix differs. What matters is that a shared ZIP never authorises -- many
// properties sit in one ZIP.
check('A shared ZIP alone never authorises',
  decide('', 'Somewhere else, Blanco, TX 78606', onlyBlanco).verdict !== 'allowed');

// --- no licences at all ----------------------------------------------------
check('An account with no licences is refused as unlicensed',
  decide('Blanco Oaks Apartments', '', []).verdict === 'unlicensed');
check('...and that reads as unlicensed, not blocked',
  decide('Anything', '', []).verdict !== 'blocked');

// --- nothing identifiable --------------------------------------------------
check('A document with no identifiers is "unknown", not a pass',
  decide('', '', BOTH).verdict === 'unknown');
check('...and unknown is not allowed', decide('', '', BOTH).verdict !== 'allowed');
check('Whitespace-only identifiers are unknown, not allowed',
  decide('   ', '   ', BOTH).verdict === 'unknown');

// --- junk input must never open the gate ----------------------------------
for (const junk of [null, undefined, 0, false, {}, [], 'null', '{}']) {
  const v = decide(junk, junk, BOTH).verdict;
  check('Junk input (' + JSON.stringify(junk) + ') is never allowed', v !== 'allowed');
}

console.log('=== PASS/FAIL ===');
for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
const passed = results.filter(r => r[1]).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
