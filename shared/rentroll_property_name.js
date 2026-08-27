/* =========================================================================
   Reading the property name off a ResMan rent roll  —  shared by all three
   tools, inlined at build time.

   WHY THIS FILE EXISTS AT ALL
   This logic used to live in three separate copies, one per tool. Two of them
   read only column A; the third scanned every column. That divergence was not
   noticed until it produced a false licence refusal on a real customer's
   property (see below), which is exactly the kind of bug three copies of one
   idea are guaranteed to produce eventually. One copy, inlined three times.

   THE MASTHEAD, AND WHY THE COLUMN IS NOT FIXED
   Every ResMan rent roll opens with the same five or six lines:

       row 0   The Rail at Georgetown        <- the property
       row 1   TEXcel Properties             <- the management company
       row 2   Rent Roll                     <- the report
       row 3   8/20/2026                     <- the as-of date
       row 5   Printed 8/20/2026 9:37:05 AM        Page 1 of 1
       row 7   Current                       <- the STATUS GROUP heading
       row 8   Unit  Type  Sq. Feet  Residents ...  <- the real column headers

   What is NOT fixed is which column that masthead sits in. Every export this
   was originally built against came from one management company and put the
   masthead in column A. The first rent roll from a different company centred
   the whole masthead over column K instead — and the first text in column A
   on that sheet is "Current", the status-group heading.

   So the tool read the property name as "Current", sent "Current" to the
   licence gate, and the gate correctly refused, because no account is
   licensed for a property called Current. A property the customer genuinely
   owned was blocked, and the log said "blocked" rather than anything that
   pointed at the parser. Scanning every column is the fix; rejecting the
   boilerplate by exact shape rather than by position is what keeps it fixed.

   ORDER MATTERS: topmost row first, then leftmost column within that row.
   The property is always the first non-boilerplate text in the masthead. The
   management company is the line below it, which is why "first" — not "last",
   not "longest" — is the rule.
   ========================================================================= */

/* Boilerplate that appears in the masthead of a rent roll and is never the
   name of a building. Anchored deliberately: a property really can be called
   "Current Place Apartments" or "Trail Total Homes", so only an EXACT match on
   a bare status word is rejected, never a name that merely contains one. */
var RR_MASTHEAD_NOISE = [
  /^printed\b/i,                       // "Printed 8/20/2026 9:37:05 AM"
  /^page\s+\d+\s+of\s+\d+$/i,          // "Page 1 of 1"
  /^rent\s*roll(\s+summary)?$/i,       // the report title, and its summary variant
  /^as\s+of\b/i,                       // "As of 8/20/2026"
  /^\d{1,2}\/\d{1,2}\/\d{2,4}([\s,].*)?$/,  // a date, bare or with a time after it
  /^[\s\d.,$%()+-]+$/,                 // numbers, money, rules -- never a name
  // The status-group headings ResMan prints above each block of units. These
  // are the ones that actually caused the incident: on a centred masthead they
  // are the first thing in column A.
  /^(current|future|notice|vacant|evicted|past|pending|applicant|applicants|occupied|leased|all|total|totals|summary)$/i,
];

function rrLooksLikePropertyName(text){
  if (text === null || text === undefined) return false;
  var t = String(text).trim();
  if (t.length < 3) return false;
  // A name has letters in it. This alone discards row numbers, totals, money
  // columns and the stray formatting cells some exports leave behind.
  if (!/[a-zA-Z]/.test(t)) return false;
  for (var i = 0; i < RR_MASTHEAD_NOISE.length; i++){
    if (RR_MASTHEAD_NOISE[i].test(t)) return false;
  }
  return true;
}

/* Returns the property name, or null if the masthead holds nothing that could
   be one.

   Returning null is a real answer and callers must keep it. It makes the
   licence gate report "these documents do not identify which property they
   belong to" — which is true, and tells the customer to re-export — instead of
   inventing a name and having the gate accuse them of using somebody else's
   documents. A wrong name is far worse than no name. */
function extractPropertyNameFromRentRoll(rows, headerRowIdx){
  if (!rows || !rows.length) return null;
  // The masthead is always immediately above the column headers. Ten rows is
  // generous; anything further down is data, not a title.
  var limit = Math.min(headerRowIdx === null || headerRowIdx === undefined ? 10 : headerRowIdx, 10);
  for (var r = 0; r < limit; r++){
    var row = rows[r];
    if (!row || !row.length) continue;
    for (var c = 0; c < row.length; c++){
      var cell = row[c];
      if (cell === null || cell === undefined) continue;
      // A real Date object stringifies to something that would sail past the
      // date regex below, so it is discarded on its own terms first.
      if (typeof Date !== 'undefined' && cell instanceof Date) continue;
      if (!rrLooksLikePropertyName(cell)) continue;
      return String(cell).trim();
    }
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { extractPropertyNameFromRentRoll, rrLooksLikePropertyName, RR_MASTHEAD_NOISE };
}
