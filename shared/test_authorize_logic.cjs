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

/* ---------------------------------------------------------------------------
   The refusal wording, tested on the same principle: lifted out of the real
   source rather than restated here.

   These are not cosmetics. The first production report of "the licence gate is
   broken" was a correct block delivered to someone signed in as the wrong one
   of their two logins, and the message gave them nothing to work that out
   with. What a refusal SAYS is part of whether the gate works.
   ------------------------------------------------------------------------- */
const mStart = src.indexOf('function messageFor');
const mEnd = src.indexOf('Deno.serve');
if (mStart === -1 || mEnd === -1 || mEnd <= mStart) {
  console.error('FATAL: could not locate the message block in authorize-audit.ts.');
  process.exit(1);
}
let mBlock = src.slice(mStart, mEnd)
  .replace(/: string\[\]/g, '')      // must precede the bare ": string" strip
  .replace(/: string \| null/g, '')
  .replace(/: Prop\[\]/g, '')
  .replace(/: string/g, '');
for (const must of ['function messageFor', 'function listNames']) {
  if (!mBlock.includes(must)) {
    console.error('FATAL: extracted message block is missing ' + must + '.');
    process.exit(1);
  }
}
let messageFor;
try {
  messageFor = new Function(mBlock + '; return messageFor;')();
} catch (e) {
  console.error('FATAL: extracted message logic did not evaluate: ' + e.message);
  process.exit(1);
}

const JANINE = 'janine.luz@texcelproperties.com';
const FOUR = [
  {name:'Garden Trails'}, {name:'Lamar Place Apartments'},
  {name:'The Berkley'}, {name:'The Rail at Georgetown'},
];

// The exact real-world case: right gate, right verdict, wrong login.
const blocked = messageFor('blocked', FOUR, 'Garden Creek Apartments', '', JANINE);
check('A refusal names the property that was refused',
  blocked.includes('“Garden Creek Apartments”'));
check('A refusal names the ACCOUNT that refused it -- the whole point',
  blocked.includes(JANINE));
check('...and tells you a different login may be the answer',
  /sign(ed)? out and sign back in/i.test(blocked));
check('...and lists what this account IS licensed for',
  blocked.includes('Garden Trails') && blocked.includes('The Rail at Georgetown'));
check('...as readable English, not "A and B and C and D"',
  blocked.includes('“The Berkley” and “The Rail at Georgetown”')
  && !/”\s+and\s+“Lamar/.test(blocked));
check('...and still explains per-property licensing for the genuine new-property case',
  /licensed separately/i.test(blocked));

check('One licensed property reads as a bare name, with no list punctuation',
  messageFor('blocked', [{name:'Blanco Oaks Apartments'}], 'Other Place', '', JANINE)
    .includes('licensed for “Blanco Oaks Apartments” — not this property'));
check('Two licensed properties are joined with "and", not a comma',
  messageFor('blocked', [{name:'A'},{name:'B'}], 'X', '', JANINE).includes('“A” and “B”'));

// An address-only refusal (no readable property name) must still be specific.
check('A refusal with no name falls back to the address it read',
  messageFor('blocked', FOUR, '', '110 Bluebonnet Cir', JANINE).includes('110 Bluebonnet Cir'));

// The unlicensed case has the same wrong-login trap.
const unlic = messageFor('unlicensed', [], 'Anything', '', JANINE);
check('An unlicensed account is named too', unlic.includes(JANINE));
check('...and is told to check which login it is on',
  /more than one login/i.test(unlic));

// Degrading gracefully matters: the email is not guaranteed to be present.
const noEmail = messageFor('blocked', FOUR, 'Garden Creek Apartments', '', null);
check('With no email known, the wording still reads correctly',
  noEmail.includes('This account is licensed for') && !noEmail.includes('undefined')
  && !noEmail.includes('null'));

// An unidentifiable document is a document problem, not an account problem --
// naming the account there would send someone chasing the wrong fix.
const unknown = messageFor('unknown', FOUR, '', '', JANINE);
check('An unreadable document does NOT blame the account', !unknown.includes(JANINE));
check('...and points at re-exporting the rent roll instead', /re-export/i.test(unknown));

check('No refusal ever leaks another account\'s properties',
  !messageFor('blocked', [], 'Garden Creek Apartments', '', JANINE).includes('Garden Trails'));

console.log('=== PASS/FAIL ===');
for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
const passed = results.filter(r => r[1]).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
