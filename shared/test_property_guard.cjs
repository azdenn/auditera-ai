const g = require('./property_guard.js');
let pass=0, fail=0;
function ok(cond, label){ if(cond){pass++; console.log('PASS -- '+label);} else {fail++; console.log('FAIL -- '+label);} }

const LICENSED = [
  {name:'Blanco Oaks Apartments', address:'525 Jones Ave, Blanco, TX 78606'},
  {name:'Garden Creek Apartments', address:'110 Bluebonnet Cir, Boerne, TX 78006'},
];

// --- real strings taken verbatim from the actual documents ---
const RR_BOA   = 'Blanco Oaks Apartments Texoplex LLC Rent Roll 8/14/2026';
const RR_GCA   = 'Garden Creek Apartments Texoplex LLC Rent Roll 8/12/2026';
const RR_OTHER = 'Sunset Ridge Townhomes Kingsley Management Rent Roll 8/14/2026';

const LEASE_BOA = 'Blanco Oaks Apartments, 525 Jones Ave 105 #105 Apartment name & unit number Blanco, TX 78606';
const LEASE_GCA = 'Owner Garden Creek Apartments 110 Bluebonnet Circle Boerne TX 78006 Lease Contract';
const LEASE_OTHER = 'Owner Sunset Ridge Townhomes 900 Nowhere Blvd Austin TX 78701 Lease Contract';
// HUD boilerplate that appears in EVERY lease -- must never authorise anything
const HUD = 'US Department of Housing and Urban Development 451 Seventh Street, SW, Room 8236 Washington, DC 20410-3000';

ok(g.pgCheckDocument(RR_BOA, LICENSED, 'Blanco Oaks Apartments').verdict === 'ok', 'BOA rent roll is allowed');
ok(g.pgCheckDocument(RR_GCA, LICENSED, 'Garden Creek Apartments').verdict === 'ok', 'GCA rent roll is allowed');

const other = g.pgCheckDocument(RR_OTHER, LICENSED, 'Sunset Ridge Townhomes');
ok(other.verdict === 'blocked', 'An unlicensed property rent roll is BLOCKED');
ok(other.detected === 'Sunset Ridge Townhomes', '...and names what it found');

ok(g.pgCheckDocument(LEASE_BOA, LICENSED).via === 'name', 'BOA lease matches by name');
ok(g.pgCheckDocument(LEASE_GCA, LICENSED).verdict === 'ok', 'GCA lease is allowed');
ok(g.pgCheckDocument(LEASE_OTHER, LICENSED, 'Sunset Ridge Townhomes').verdict === 'blocked', 'Unlicensed lease is BLOCKED');

// address-only: name stripped out, address intact
const ADDR_ONLY = 'Lease Contract for the dwelling located at 525 Jones Avenue, Blanco, Texas 78606';
ok(g.pgCheckDocument(ADDR_ONLY, LICENSED).via === 'address', 'Matches on address when the name is absent');
ok(g.pgNormalizeAddress('525 Jones Avenue') === g.pgNormalizeAddress('525 Jones Ave'), 'Avenue and Ave normalise the same');
ok(g.pgAddressKey('110 Bluebonnet Cir, Boerne, TX 78006') === '110 bluebonnet', 'Address key is house number + street');

ok(g.pgCheckDocument(HUD, LICENSED).verdict === 'unknown', 'HUD lead-paint boilerplate authorises nothing');
ok(g.pgMatchStrength(HUD, LICENSED[0]) === null, '...and matches no licensed property at all');

ok(g.pgCheckDocument(RR_BOA, [], 'Blanco Oaks Apartments').verdict === 'unlicensed', 'No licences at all = unlicensed');
ok(g.pgCheckDocument('', LICENSED).verdict === 'unknown', 'Empty document is unknown, not a pass');

// a ZIP alone must not authorise -- many properties share one
ok(g.pgCheckDocument('Some Other Place, Blanco TX 78606', LICENSED, 'Some Other Place').verdict === 'blocked',
   'A shared ZIP alone does not authorise a different named property');

// name variations ResMan/humans actually produce
ok(g.pgCheckDocument('BLANCO OAKS APTS rent roll', LICENSED).verdict === 'ok', 'Uppercase + "APTS" still matches');
ok(g.pgCheckDocument('Blanco  Oaks   Apartments', LICENSED).verdict === 'ok', 'Extra whitespace still matches');

// the message must actually say what is wrong
const msg = g.pgBlockMessage('Sunset Ridge Townhomes', LICENSED);
ok(/Sunset Ridge Townhomes/.test(msg) && /Blanco Oaks/.test(msg) && /Garden Creek/.test(msg),
   'Refusal names both the rejected and the licensed properties');

console.log('\n'+pass+'/'+(pass+fail)+' passed');
process.exit(fail ? 1 : 0);
