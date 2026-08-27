/* Reading the property name off a rent roll.
 *
 * THE BUG THIS EXISTS FOR
 * A licensed customer uploaded her own property's rent roll and was refused a
 * licence for it. The gate was right to refuse what it was asked about: the
 * tool had told it the property was called "Current".
 *
 * Her export centres the masthead over column K. The reader only looked at
 * column A, whose first text on that layout is "Current" -- the status-group
 * heading ResMan prints above each block of units. Every rent roll the tool
 * had ever been tested against came from one management company and put the
 * masthead in column A, so nothing caught it.
 *
 * Three near-identical copies of this reader existed, one per tool, and they
 * had diverged: ConcessionVerify's already scanned every column and would have
 * read her file correctly. That divergence is the deeper bug, so the copies
 * are gone and this suite tests the single shared implementation -- including
 * asserting that each built tool ships exactly one of it.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('/home/claude/lease_tool/node_modules/xlsx');
const { extractPropertyNameFromRentRoll } = require('./rentroll_property_name.js');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

/* --- the two real masthead layouts, as arrays-of-arrays -------------------
   Both are transcribed from real exports. The only difference between them is
   which column the masthead sits in -- which is precisely the thing that was
   assumed fixed. */
function at(col, ...values){
  // one row per value, each placed in `col`
  return values.map((v) => { const row = []; row[col] = v; return row; });
}
const COLUMN_A_MASTHEAD = [
  ...at(0, 'Garden Creek Apartments', 'Texoplex LLC', 'Rent Roll', '7/15/2026'),
  (() => { const r = []; r[0] = 'Printed 8/4/2026 4:06:56 PM'; r[37] = 'Page 1 of 1'; return r; })(),
  [],
  (() => { const r = []; r[0] = 'Current'; return r; })(),
];
const CENTRED_MASTHEAD = [
  ...at(10, 'The Rail at Georgetown', 'TEXcel Properties', 'Rent Roll', '8/20/2026'),
  [],
  (() => { const r = []; r[0] = 'Printed 8/20/2026 9:37:05 AM'; r[39] = 'Page 1 of 1'; return r; })(),
  [],
  (() => { const r = []; r[0] = 'Current'; return r; })(),
];

check('The layout that always worked still works',
  extractPropertyNameFromRentRoll(COLUMN_A_MASTHEAD, 7) === 'Garden Creek Apartments');

check('THE REGRESSION: a masthead centred over column K is read correctly',
  extractPropertyNameFromRentRoll(CENTRED_MASTHEAD, 8) === 'The Rail at Georgetown');
check('...and is NOT read as "Current", the status-group heading in column A',
  extractPropertyNameFromRentRoll(CENTRED_MASTHEAD, 8) !== 'Current');

check('The management company on the line below is not mistaken for the property',
  extractPropertyNameFromRentRoll(CENTRED_MASTHEAD, 8) !== 'TEXcel Properties');

// A blank leading row happens on the summary export.
check('A leading blank row does not stop the scan',
  extractPropertyNameFromRentRoll([[], ...COLUMN_A_MASTHEAD], 8) === 'Garden Creek Apartments');

/* --- boilerplate that must never be returned ---------------------------- */
const NOISE = [
  'Rent Roll', 'rent roll', 'Rent Roll Summary', 'RENTROLL',
  'Printed 8/20/2026 9:37:05 AM', 'Page 1 of 1', 'Page 12 of 40',
  '8/20/2026', '12/1/26', '8/20/2026 9:37:05 AM', 'As of 8/20/2026',
  'Current', 'current', 'CURRENT', 'Future', 'Notice', 'Vacant', 'Evicted',
  'Past', 'Pending', 'Applicant', 'Occupied', 'Leased', 'All', 'Total',
  'Totals', 'Summary',
  '1,234.56', '$1,200', '---', '   ', '', '42',
];
for (const n of NOISE){
  const rows = [[n], ['Real Property Name']];
  check('Boilerplate "' + n + '" is skipped, not returned',
    extractPropertyNameFromRentRoll(rows, 2) === 'Real Property Name');
}

/* --- names that merely CONTAIN a status word must survive ----------------
   The old ConcessionVerify filter matched these as prefixes, which would have
   silently dropped a real property called "Current Place". Exact-match only. */
for (const name of ['Current Place Apartments', 'Vacant Ridge', 'Total Living Lofts',
                    'Summary Street Flats', 'Notice Park Homes', 'All Seasons Apartments']){
  check('A real property named "' + name + '" is not mistaken for boilerplate',
    extractPropertyNameFromRentRoll([[name]], 1) === name);
}

/* --- no name at all ------------------------------------------------------
   Returning null is the honest answer and it matters: it makes the licence
   gate say "these documents do not identify which property they belong to"
   rather than inventing a name and accusing the customer of uploading
   somebody else's documents. */
check('A masthead of pure boilerplate yields null, not a wrong guess',
  extractPropertyNameFromRentRoll([['Rent Roll'], ['8/20/2026'], ['Current']], 3) === null);
check('An empty sheet yields null', extractPropertyNameFromRentRoll([], 0) === null);
check('A sheet of empty rows yields null',
  extractPropertyNameFromRentRoll([[], [null, null], []], 3) === null);
check('A real Date object in the masthead is not returned as a name',
  extractPropertyNameFromRentRoll([[new Date('2026-08-20')], ['Garden Creek Apartments']], 2)
    === 'Garden Creek Apartments');
check('The scan stops above the column-header row',
  extractPropertyNameFromRentRoll([['Rent Roll'], ['Unit', 'Type', 'Residents']], 1) === null);

/* --- every real fixture in the repo -------------------------------------
   Unit tests on transcribed rows prove the rule; these prove the rule against
   the actual bytes ResMan produces. */
const FIXTURES = [
  ['lease_tool/sample_rentroll.xlsx',            'Garden Creek Apartments'],
  ['lease_tool/sample_rentroll_bundled.xlsx',    'Garden Creek Apartments'],
  ['lease_tool/a105_test/A105_rentroll.xlsx',    'Blanco Oaks Apartments'],
  ['lease_tool/gca_test/GCA_rentroll.xlsx',      'Garden Creek Apartments'],
  ['lease_tool/boa_test/BOA_rentroll.xlsx',      'Blanco Oaks Apartments'],
  ['lease_tool/boa_test/BOA_rentroll_SUMMARY.xlsx', 'Blanco Oaks Apartments'],
];
function findHeaderRow(rows){
  for (let r = 0; r < Math.min(rows.length, 30); r++){
    const joined = (rows[r] || []).map((c) => String(c == null ? '' : c).toLowerCase());
    if (joined.indexOf('unit') !== -1 || joined.indexOf('unit type') !== -1) return r;
  }
  return 10;
}
for (const [rel, expected] of FIXTURES){
  const abs = path.resolve('/home/claude', rel);
  if (!fs.existsSync(abs)){ check('Fixture present: ' + rel, false); continue; }
  const wb = XLSX.readFile(abs);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:null});
  const got = extractPropertyNameFromRentRoll(rows, findHeaderRow(rows));
  check('Real export ' + path.basename(rel) + ' reads as "' + expected + '"', got === expected);
}

/* --- the drift that caused this ------------------------------------------
   Three copies of one rule is what let two of them fall behind the third.
   Assert each shipped tool carries exactly one. */
for (const tool of ['leaseverify', 'concessionverify', 'depositverify']){
  const f = '/home/claude/dist/tools/' + tool + '.html';
  if (!fs.existsSync(f)){ check(tool + ': built file present', false); continue; }
  const src = fs.readFileSync(f, 'utf8');
  const n = (src.match(/function extractPropertyNameFromRentRoll/g) || []).length;
  check(tool + ': ships exactly one copy of the reader (found ' + n + ')', n === 1);
  check(tool + ': ships the all-column scan, not the column-A-only one',
    /for \(var c = 0; c < row\.length; c\+\+\)/.test(src));
}

console.log('=== PASS/FAIL ===');
for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
const passed = results.filter((r) => r[1]).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
