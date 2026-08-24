/* The confirmed concession spec, checked end-to-end against the REAL export.
   ------------------------------------------------------------------------
   Every number below was read out of the actual documents with pdftotext /
   openpyxl BEFORE it was written here, and the arithmetic is shown inline so
   a future reader can re-derive it rather than trust it.

   The four rules this locks down:
     1. One week of free rent = monthly rent / 4.  Unit 202 is the proof:
        rent $1,124, stated "six weeks free", credited $1,124.00 + $562.00 =
        $1,686.00 exactly.  $1,686 / ($1,124/4 = $281) = 6.000 weeks.
     2. The up-front special is the SUM of every non-instalment credit; a
        six-week special is routinely split across two months (202, 208, 305).
     3. The prorated half comes off the RENT ROLL and must run out to a whole
        number of weeks over 12 months or over the lease term.
     4. Only ONE ledger is used per unit -- the one whose resident the rent
        roll names AND which still has charges in the current month.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');
const HERE = __dirname;

/* CHANGED BY SPEC
   -------------------------------------------------------------------------
   The engine now reports EXPECTED vs ACTUAL instead of a single "stated
   length" axis. details.stated / statedWeeks / statedSource / totalWeeks /
   impliedTotalWeeks / reconciles / softenedProrate are all gone. Every
   assertion below that keyed off one of them is re-pointed at its
   replacement:
     d.stated / d.statedWeeks   -> d.upfrontStated + d.expectedUpfrontWeeks
                                   (+ d.upfrontWordingDescribes, which says
                                   whether that wording names the up-front
                                   half or the whole deal)
     d.totalWeeks               -> d.actualTotalWeeks / d.expectedTotalWeeks
     d.reconciles               -> d.upfrontOk and d.proratedVerdict
   Two verdicts changed with it, and both changes are correct:
     302 was "review" and is now Match  (the 11.87-month lease was being
          floored to 11 by monthsBetween; leaseTermMonths rounds it to 12,
          and $113.00 against an expected $113.25 is rounding)
     308 was "issue"  and is now Review (nothing states how long its $455/mo
          runs, so the tool derives the length -- it must not call a unit
          wrong on a number it invented itself)
   Option Filters were removed from this tool entirely, so the
   FILTERABLE_ISSUE_TYPES assertion becomes "none of it survives".
*/

// unit -> [upfront$, upfrontWeeks, recurring$/mo or null, expected total weeks or null]
// Derived from the ledger PDFs and the rent roll:
//   202  $1,124.00 (02/01) + $562.00 (03/01) = $1,686.00; $1,124/4 = $281; 6.000 wks
//   208  $1,124.00 (05/04) + $562.00 (06/01) = $1,686.00; same rent; 6.000 wks
//   305  $998.00 (07/01) + $499.00 (08/03)  = $1,497.00; $998/4 = $249.50; 6.000 wks
//        (its $38.45 "Prorate move in special" is excluded -- it says "Prorate")
//   205  $1,125.00 + $1,125.00 = $2,250.00; $1,125/4 = $281.25; 8.000 wks
//   402  $1,261.00 + $630.50   = $1,891.50; $1,261/4 = $315.25; 6.000 wks
//   404  $1,153.00 + $576.50   = $1,729.50; $1,153/4 = $288.25; 6.000 wks
//   201  $1,178.00;              $1,178/4 = $294.50; 4.000 wks
//   203  $1,174.00 up front (4 wks) + rent roll -$106.73/mo
//   302  $1,359.00 up front (4 wks) + rent roll -$113.00/mo
//   104  $1,182.00 up front (4 wks) + rent roll -$40.73/mo
//   308  nothing up front + rent roll -$455.00/mo
//   405  $1,555.00 up front; $1,555/4 = $388.75; 4.000 wks; stated 6
// CHANGED BY SPEC: the 4th column was details.statedWeeks -- the single
// number the ledger wording produced. It is now details.expectedTotalWeeks:
// the whole deal the paperwork adds up to, up-front plus prorated. Two
// entries move as a result, and both were wrong before:
//   302 was 4 -> 8. Its ledger says "One month free" (the up-front half) and
//       its rent roll says "1 month free prorated over 12 months" (the other
//       half). The deal is 4 + 4, not 4; reading only the ledger wording made
//       a correct unit look like it had double what it was owed.
//   308 was null -> 17. Nothing states its length, so 17 is DERIVED
//       ($455/mo x 12 / $313.75, rounded) -- which is exactly why the unit is
//       Review rather than a mismatch. See the 308 block below.
const EXPECT = {
  '202': [1686.00, 6, null, 6],
  '208': [1686.00, 6, null, 6],
  '305': [1497.00, 6, null, 6],
  '205': [2250.00, 8, null, 8],
  '402': [1891.50, 6, null, 6],
  '404': [1729.50, 6, null, 6],
  '201': [1178.00, 4, null, 4],
  '203': [1174.00, 4, 106.73, 8],
  '302': [1359.00, 4, 113.00, 8],
  '104': [1182.00, 4, 40.73, 8],
  '308': [0,       0, 455.00, 17],
  '405': [1555.00, 4, null, 6],
};
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 0.005 : tol);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => { try { localStorage.clear(); } catch(e){} });
  await page.reload();
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', path.resolve(HERE, 'real/BOA Resident Ledgers 08-14-2026.zip'));
  await page.setInputFiles('#rentroll-file', path.resolve(HERE, 'real/BOA 2026.14- Rent Roll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout: 300000});
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => ({
    refMonth: referenceMonthLabel(),
    weeksPerMonth: WEEKS_PER_MONTH,
    // CHANGED BY SPEC: was FILTERABLE_ISSUE_TYPES.map(...).join(',').
    // Option Filters were removed from this tool, so what is checked is that
    // none of the machinery survives -- symbols, panel, checkboxes, KPI tile.
    filtersGone: typeof FILTERABLE_ISSUE_TYPES === 'undefined' &&
                 typeof HIDDEN_ISSUE_TYPES === 'undefined' &&
                 typeof isIssueTypeHidden === 'undefined' &&
                 typeof renderIssueFilterPanel === 'undefined' &&
                 !document.getElementById('issue-filter-panel') &&
                 !document.querySelector('input[data-issue-key]') &&
                 !document.querySelector('.kpi-tile.hidden-filter'),
    // CHANGED BY SPEC: the lease-vs-rent-roll rent check went with them. A
    // disagreement is now only a note on the rent fact tile (entry.rentDisagrees).
    rentCheckGone: typeof chargeCellState === 'undefined' &&
                   UNIT_SORT_ACCESSORS.charges === undefined &&
                   unitEntries.every(e => e.rentMismatch === undefined && e.rentHiddenByFilter === undefined),
    // CHANGED BY SPEC: the results table lost its second ("Rent") column.
    columns: Array.from(document.querySelectorAll('#unit-view-shell > table.results > thead > tr > th'))
      .map(th => th.getAttribute('data-sort')).join(','),
    chargeAuditGone: typeof generalChargeCheck === 'undefined' && typeof netChargeReversals === 'undefined',
    entries: unitEntries.map(e => {
      const d = e.concession && e.concession.details;
      return {
        unit: String(e.unit), cat: e.category, res: e.residents,
        ledgerFile: e.ledgerFilename, pick: e.ledgerPickReason || '',
        hasCharges: Object.prototype.hasOwnProperty.call(e, 'charges'),
        rent: e.monthlyBaseRent,
        d: d ? {
          weeklyRate: d.weeklyRate, upfrontTotal: d.upfrontTotal, upfrontWeeks: d.upfrontWeeks,
          upfrontLines: (d.upfrontItems || []).length, upfrontWhole: d.upfrontWhole,
          recurring: d.recurringMonthly, prorated: d.prorated ? d.prorated.months : null,
          proratedWeeks: d.proratedWeeks, implied: d.impliedMonths,
          // CHANGED BY SPEC: total/impliedTotal/stated are gone. Actual vs
          // expected replaces them, on both halves and on the sum.
          actualTotal: d.actualTotalWeeks, expectedTotal: d.expectedTotalWeeks,
          upfrontStated: d.upfrontStated ? d.upfrontStated.label : null,
          upfrontDescribes: d.upfrontWordingDescribes,
          expectedUpfrontWeeks: d.expectedUpfrontWeeks, upfrontOk: d.upfrontOk,
          proratedWeeksSource: d.proratedWeeksSource, proratedVerdict: d.proratedVerdict,
          expectedProratedWeeks: d.expectedProratedWeeks, expectedInstalment: d.expectedInstalment,
          term: d.termMonths, termSource: d.termSource, rentSource: d.rentSource, status: d.status,
          instalments: (d.ledgerProratedItems || []).length,
        } : null,
        rows: (e.concession && e.concession.rows || []).map(r => r.item + '|' + r.expected + '|' + r.actual + '|' + r.status),
        issues: (e.concession && e.concession.issues || []).map(i => i.severity + '|' + i.text),
      };
    }),
  }));
  const by = Object.fromEntries(r.entries.map(e => [e.unit, e]));
  const checks = [];
  const add = (label, pass) => checks.push([label, pass]);

  add('One week of free rent is the monthly rent / 4', r.weeksPerMonth === 4);
  add('The current month is taken from the documents (Aug 2026), not the wall clock', r.refMonth === 'August 2026');
  add('The recurring-charge audit is gone -- this tool is concessions only', r.chargeAuditGone);
  add('No entry still carries a charges field', r.entries.every(e => !e.hasCharges));
  // CHANGED BY SPEC: was "Option Filters offer exactly concessions and rent".
  // This tool checks one thing, so there is nothing to switch off and the
  // whole feature was removed.
  add('Option Filters are gone from this tool entirely', r.filtersGone === true);
  add('The lease-vs-rent-roll rent check is gone too', r.rentCheckGone === true);
  // CHANGED BY SPEC: the results table dropped its "Rent" column, so the
  // sortable keys are exactly these five (Details is not sortable).
  add('The results table columns are Details / Unit / Resident / Move-in discount / Status / What we found',
    r.columns === ',unit,residents,concession,status,issues');
  add('All 25 occupied units were reconciled', r.entries.length === 25);
  add('Every unit matched a ledger (none unresolved)', !r.entries.some(e => e.cat === 'unmatched'));

  // ---- Rule 4: exactly one ledger, and it is the live tenancy ----
  // Unit 207's Cathy Brown has TWO ledgers of her own: one that stops in
  // May 2026 and one running to August. The stale one is the LONGER file, so
  // "most complete" alone picked the wrong document.
  const e207 = by['207'];
  add('207 uses the ledger that is still being posted to, not the longer stale one',
    !!e207 && e207.ledgerFile === '207 - Cathy Brown 1.pdf');
  add('207 says out loud that the past tenancy was left out',
    !!e207 && /no charges in August 2026/.test(e207.pick) && /past tenancy/.test(e207.pick));
  add('Every unit reports exactly one ledger file, never a list',
    r.entries.every(e => e.ledgerFile == null || typeof e.ledgerFile === 'string'));

  // ---- Rules 1-3, unit by unit ----
  for (const [unit, [up, upW, rec, expTotal]] of Object.entries(EXPECT)){
    const e = by[unit], d = e && e.d;
    add(unit + ': has a concession and week math', !!d);
    if (!d) continue;
    add(unit + ': up-front total is ' + up.toFixed(2) + ' (summed, not one line)', near(d.upfrontTotal, up));
    add(unit + ': that is ' + upW + ' whole weeks at rent/4', near(d.upfrontWeeks, upW, 0.05));
    add(unit + ': weekly rate is rent / 4', near(d.weeklyRate, e.rent / 4));
    add(unit + ': rent roll recurring credit read as ' + (rec == null ? 'none' : rec),
      rec == null ? d.recurring == null : near(d.recurring, rec));
    // CHANGED BY SPEC: was "stated length read as N weeks" (d.stated). The
    // deal is no longer a single stated number -- it is the up-front half plus
    // the prorated half, so what is asserted is the total those two add up to.
    if (expTotal != null) add(unit + ': the deal on the paperwork totals ' + expTotal + ' weeks', near(d.expectedTotal, expTotal, 0.05));
    // Every unit must say where its prorated length came from, and never
    // silently leave the verdict undefined.
    add(unit + ': names where the prorated length came from and reaches a verdict',
      ['none','rent roll','ledger','derived'].indexOf(d.proratedWeeksSource) !== -1 &&
      ['none','match','schedule','unknown','mismatch'].indexOf(d.proratedVerdict) !== -1);
  }

  // Unit 202 is the calibration case for the whole rate convention.
  const d202 = by['202'] && by['202'].d;
  add('202: the six-week special is two ledger lines added together', !!d202 && d202.upfrontLines === 2);
  add('202: $1,686.00 / $281.00 = exactly 6.000 weeks', !!d202 && Math.abs(d202.upfrontWeeks - 6) < 1e-9);
  add('202: a calendar week (rent x 12 / 52) would NOT give 6 -- the old rate is really gone',
    !!d202 && Math.abs(1686 / (1124 * 12 / 52) - 6) > 0.4);
  add('202 comes out clean', by['202'].cat === 'clean');

  // Unit 305: the "Prorate move in special" line must stay out of the total.
  const d305 = by['305'] && by['305'].d;
  add('305: the $38.45 "Prorate move in special" is excluded from the up-front total',
    !!d305 && near(d305.upfrontTotal, 1497.00) && d305.instalments >= 1);
  add('305: "Tina Kersten" on the ledger still matches "Christina Kersten" on the rent roll',
    !!by['305'] && by['305'].cat === 'clean');

  // Unit 308: 14 monthly $455 credits must NOT be summed as one up-front special.
  const d308 = by['308'] && by['308'].d;
  add('308: the 14 monthly $455 credits are instalments, not a $6,370 up-front special',
    !!d308 && d308.upfrontTotal === 0 && d308.instalments >= 12);
  // CHANGED BY SPEC: was "-> mismatch" with cat === 'issue'. $455 x 12 =
  // $5,460 / $313.75 = 17.40 weeks is still rejected as not-whole, but NO
  // document on this unit states how long the concession runs -- not the
  // lease, not the ledger, not the rent roll. The 17 weeks it is being
  // measured against is therefore DERIVED by the tool itself, and calling a
  // unit wrong against a figure the tool invented is not a mismatch. The
  // verdict is 'unknown' and the unit is Review.
  add('308: $455 x 12 = $5,460 is 17.40 weeks, not whole', !!d308 && d308.prorated === null);
  add('308: nothing states how long it runs, so the length is derived and the verdict is "unknown" -> Review, not a mismatch',
    !!d308 && d308.proratedWeeksSource === 'derived' && d308.proratedVerdict === 'unknown' &&
    by['308'].cat === 'review' && !by['308'].issues.some(i => i.startsWith('bad|')));
  add('308: and the Expected column says so in words rather than printing a number the tool made up',
    !!by['308'] && by['308'].rows.some(r => r.indexOf('Free rent prorated over the lease|Not stated on any document|$455.00/month|review') === 0));

  // Unit 302: x12 wins on cent-level rounding ($113 x 12 = $1,356 vs $1,359).
  const d302 = by['302'] && by['302'].d;
  add('302: $113 x 12 = $1,356 is accepted as 4 whole weeks despite the $3 rounding',
    !!d302 && d302.prorated === 12 && d302.proratedWeeks === 4);
  // CHANGED BY SPEC: was near(d302.total, 8) -- totalWeeks is gone.
  add('302: total is 4 up front + 4 prorated = 8 weeks', !!d302 && near(d302.actualTotal, 8, 0.05));
  // CHANGED BY SPEC: this unit was "review". It was wrong. The ledger's
  // "One month free" names the UP-FRONT half only; the rent roll's "1 month
  // free prorated over 12 months" names the other. The deal is 4 + 4 = 8 and
  // 8 is exactly what was delivered, so there is nothing to review. Reading
  // the ledger wording as the whole deal made a correct unit look like it had
  // taken double. The 12-month divisor also depends on leaseTermMonths
  // rounding this 11.87-month lease UP; monthsBetween floored it to 11.
  add('302: the ledger wording names the up-front half, the rent roll names the prorated half, and 4 + 4 = 8 was delivered',
    !!d302 && d302.upfrontStated === '1 month free' && d302.upfrontDescribes === 'upfront' &&
    d302.expectedUpfrontWeeks === 4 && d302.expectedProratedWeeks === 4 &&
    near(d302.expectedTotal, 8, 0.05) && near(d302.actualTotal, 8, 0.05));
  add('302: so it is a clean Match, not a review -- and its term is the rounded 12, not the floored 11',
    !!d302 && d302.term === 12 && d302.proratedVerdict === 'match' &&
    by['302'].cat === 'clean' && by['302'].issues.length === 0);

  // Unit 203: neither 12 nor the 12-month term works; 11 months does, exactly.
  const d203 = by['203'] && by['203'].d;
  add('203: $106.73 x 12 = 4.36 weeks is rejected -- a missing month is not rounding',
    !!d203 && d203.prorated === null);
  add('203: the tool works out that 11 months WOULD give exactly 4 weeks',
    !!d203 && !!d203.implied && d203.implied.months === 11 && d203.implied.weeks === 4);
  // CHANGED BY SPEC: was near(d203.impliedTotal, 8) -- impliedTotalWeeks is
  // gone. The total is no longer conditional on a run-out succeeding: the
  // prorated portion is READ off the rent roll ("4 weeks free prorated over
  // lease term"), so 4 + 4 = 8 is both expected and actual.
  add('203: so the total is still reported (4 + 4 = 8 weeks), not "could not be totalled"',
    !!d203 && near(d203.expectedTotal, 8, 0.05) && near(d203.actualTotal, 8, 0.05));
  // CHANGED BY SPEC: the reason it is a review is now named. $97.83/month is
  // what 4 weeks over the 12-month term costs; $106.73 delivers the same money
  // in 11 months. Right total, wrong schedule -> proratedVerdict 'schedule'.
  add('203: reported as something to review rather than a hard mismatch, since it adds up to the stated 8 weeks',
    !!d203 && near(d203.expectedInstalment, 97.83) && d203.proratedVerdict === 'schedule' &&
    by['203'].cat === 'review' && !by['203'].issues.some(i => i.startsWith('bad|')));

  // Unit 104: genuinely broken -- no whole month count fits $40.73.
  const d104 = by['104'] && by['104'].d;
  add('104: $40.73/month fits no whole number of weeks over any plausible term',
    !!d104 && d104.prorated === null && d104.implied === null);
  add('104: reported as a real mismatch', by['104'].cat === 'issue' && d104.proratedVerdict === 'mismatch');
  add('104: the finding says what the monthly credit SHOULD be ($1,182 over 13 months = $90.92)',
    by['104'].issues.some(i => /\$90\.92/.test(i)));
  // CHANGED BY SPEC: the same $90.92 is now also carried as a number, so the
  // check does not rest on prose alone. 4 wks x $295.50 = $1,182.00 / 13 mo.
  add('104: ...and carries it as a number, not only as prose',
    !!d104 && d104.expectedProratedWeeks === 4 && near(d104.expectedInstalment, 90.92));
  add('104: the 13-month term is read from the rent roll (no lease PDF in this archive)',
    !!d104 && d104.term === 13 && d104.rentSource === 'rent roll');
  // CHANGED BY SPEC: the up-front half of 104 is CORRECT and must be reported
  // as such. Its ledger says "8 weeks free", which names the whole deal, so
  // the up-front expectation is 8 - 4 = 4 weeks -- exactly the $1,182.00
  // credited. Only the prorated half is wrong. Under the old single-axis
  // reading, an 8-vs-8 comparison would have called the whole unit fine.
  add('104: the up-front half is correct on its own -- the "8 weeks free" wording names the whole deal, so 8 - 4 = 4 is due up front',
    !!d104 && d104.upfrontStated === '8 weeks free' && d104.upfrontDescribes === 'total' &&
    d104.expectedUpfrontWeeks === 4 && d104.upfrontOk === true &&
    near(d104.expectedTotal, 8, 0.05) && near(d104.actualTotal, 5.79, 0.01));

  // Unit 405: stated 6 weeks, 4 credited, nothing prorated anywhere -> real money.
  const d405 = by['405'] && by['405'].d;
  // CHANGED BY SPEC: was near(d405.total, 4) && d405.stated === 6.
  add('405: 2 weeks of the stated 6 are missing and nothing prorated can account for them',
    !!d405 && near(d405.actualTotal, 4, 0.05) && near(d405.expectedTotal, 6, 0.05) &&
    d405.upfrontStated === '6 weeks free' && d405.recurring == null && d405.upfrontOk === false);
  add('405: that shortfall is priced ($388.75/wk x 2 = $777.50) and flagged as a mismatch',
    by['405'].cat === 'issue' && by['405'].issues.some(i => /^bad\|/.test(i) && /\$777\.50/.test(i)));

  // ---- The x-lease-term run-out, which the real archive never exercises ----
  // Every BOA unit with a recurring credit either works out over 12 months or
  // over no whole month count at all, so nothing in the export above would
  // notice if the "x the lease term" half of the rule were deleted. This
  // drives buildConcessionCheck directly on a 14-month lease where 12 months
  // is wrong and 14 is exactly right:
  //   rent $1,200 -> $300/week.  4 weeks free = $1,200.
  //   $1,200 / 14 months = $85.71/mo (as the rent roll would round it)
  //   x 12 = $1,028.52 = 3.428 weeks  (rejected)
  //   x 14 = $1,200.00 = 4.00 weeks  (accepted)
  const term = await page.evaluate(() => {
    const day = (y,m,d) => new Date(y, m-1, d);
    const lease = { monthlyBaseRent: 1200, leaseStart: day(2025,1,1), leaseEnd: day(2026,2,28) }; // 14 months
    const ledger = { transactions: [
      {date: day(2025,1,5), description: '4 weeks free move in special', credit: 0, charge: 1200},
    ], leaseStart: lease.leaseStart, leaseEnd: lease.leaseEnd };
    const block = { unit:'T1', residents:'Term Test', charges: [
      {description:'Rent', amount:1200},
      {description:'4 weeks free prorated over lease term', amount:-85.71},
    ]};
    const c = buildConcessionCheck(1200, ledger, lease, block, 'lease');
    const d = c.details;
    return d ? {term: d.termMonths, termSource: d.termSource, tried: d.proratedTried.map(p=>p.months+':'+p.weeks.toFixed(3)+':'+p.whole),
                chose: d.prorated ? d.prorated.months : null, weeks: d.proratedWeeks, status: d.status, rentSource: d.rentSource,
                // CHANGED BY SPEC: the same run-out now also has to price the
                // monthly instalment it expects and reach a verdict on the one
                // actually being credited.
                proratedStated: d.proratedStated ? d.proratedStated.label : null,
                proratedWeeksSource: d.proratedWeeksSource,
                expectedProratedWeeks: d.expectedProratedWeeks,
                expectedInstalment: d.expectedInstalment, proratedVerdict: d.proratedVerdict,
                rows: c.rows.map(r => r.item + '|' + r.expected + '|' + r.actual + '|' + r.status)} : null;
  });
  add('14-month lease term is read from the lease and rounded to a whole month',
    !!term && term.term === 14 && term.termSource === 'the lease' && term.rentSource === 'lease');
  add('Both run-outs are tried -- 12 months AND the lease term', !!term && term.tried.length === 2);
  add('x 12 months (3.43 weeks) is correctly rejected', !!term && term.tried.some(t => t.startsWith('12:3.428') && t.endsWith(':false')));
  add('x the 14-month lease term (4.00 weeks) is the one accepted',
    !!term && term.chose === 14 && term.weeks === 4);
  // CHANGED BY SPEC: the point of the run-out is no longer just "which month
  // count is whole" -- it is the monthly figure the rent roll SHOULD be
  // crediting. 4 weeks x $300.00 = $1,200.00 over 14 months = $85.71/month,
  // which is exactly what this fixture's rent roll bills, so the verdict is a
  // match and the detail row states both sides of it.
  add('...and the 14-month term is what prices the expected instalment: 4 wks x $300 = $1,200 / 14 = $85.71/mo',
    !!term && term.proratedStated === '4 weeks prorated' && term.proratedWeeksSource === 'rent roll' &&
    term.expectedProratedWeeks === 4 && near(term.expectedInstalment, 85.71) &&
    term.proratedVerdict === 'match' && term.status === 'match');
  add('...and the detail row shows expected against actual, not just a verdict',
    !!term && term.rows.some(r => r === 'Free rent prorated over the lease|$85.71/month — 4 weeks ($1,200.00) over 14 months|$85.71/month|match'));

  add('No page or console errors', errors.length === 0);

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l, p] of checks){ console.log((p ? 'PASS' : 'FAIL') + ' -- ' + l); if (!p) allPass = false; }
  console.log('=== ' + checks.filter(c=>c[1]).length + '/' + checks.length + ' checks passed ===');
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
