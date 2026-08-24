/* ConcessionVerify — the concession math, against the REAL Blanco Oaks archive
   (real/BOA Resident Ledgers 08-14-2026.zip + real/BOA 2026.14- Rent Roll.xlsx).

   ==========================================================================
   WHAT CHANGED SINCE THE PREVIOUS VERSION OF THIS FILE
   --------------------------------------------------------------------------
   1. ONE WEEK OF FREE RENT IS NOW rent / 4, not rent x 12 / 52.
      The property confirmed it: their software bills a "week" as a quarter of
      a month. Unit 202 proves it out of the raw data — rent $1,124.00, a
      stated six-week special, and exactly $1,686.00 credited across two
      ledger lines. $1,686 / ($1,124 / 4 = $281) = 6.000 weeks to the cent.
      The old calendar-week rate ($259.38/wk) called that same credit 6.5
      weeks and then had to excuse the extra half week with a second-chance
      "4-weeks-=-1-month convention" check. Both the calendar rate and the
      second-chance check are gone, and so are WEEKS_PER_YEAR and
      WEEKS_PER_MONTH_CONVENTION.
      OLD EXPECTATIONS NOW DELIBERATELY DEAD: $259.38/week, $1,556.31 for six
      weeks, a "+$129.69 variance", details.expectedDollars,
      details.expectedConventionDollars, details.matchesConvention,
      details.creditedToDate, details.contractedTotal, details.actualWeeksRaw.
   2. The up-front concession is a SUM of every non-instalment "move in
      special" credit (a single special is routinely split across two lines in
      two months). A credit is an instalment — and so excluded from the
      up-front total — when its description matches /prorat/i, OR its amount
      equals a recurring concession amount on the rent roll, OR the same
      amount is posted in 3+ distinct months.
   3. The prorated half is read off the RENT ROLL's negative recurring line
      and run out two ways, x 12 months and x the lease term rounded to the
      nearest whole month. Whichever gives a whole number of weeks wins;
      neither -> mismatch, plus an `impliedMonths` report of the month count
      that WOULD have made it whole.
   4. Total weeks = up-front weeks + prorated weeks.
   5. The lease is authoritative for the rent and the term when a lease PDF
      was uploaded; the rent roll is only the fallback (details.rentSource).
   6. The "recurring charges: rent roll vs ledger" audit was removed from this
      tool, so nothing here checks entry.charges any more.

   CHANGED BY SPEC (this revision)
   --------------------------------------------------------------------------
   A. THE ENGINE NOW REPORTS EXPECTED vs ACTUAL. "Expected" is what the deal
      works out to (derived); "Actual" is only ever a figure read straight off
      a document. The single `stated`/`totalWeeks`/`reconciles` axis is gone
      and is replaced by two independent verdicts, one per half of the deal:
        up front  -> details.upfrontOk, against expectedUpfrontWeeks/Dollars
        prorated  -> details.proratedVerdict, one of
                     'none' | 'match' | 'schedule' | 'unknown' | 'mismatch'
      plus actualTotalWeeks vs expectedTotalWeeks for the two added together.
      DEAD FIELDS, asserted absent below so they cannot creep back:
      stated, statedSource, statedWeeks, statedPhrase, totalWeeks,
      impliedTotalWeeks, reconciles, softenedProrate.
      DEAD ISSUE KEY: 'variance' (a shortfall is now keyed 'upfront' or
      'prorated' depending on which half of the deal is wrong).
   B. WORDING IS READ AS UP-FRONT OR AS THE WHOLE DEAL. A ledger that says
      "8 weeks free" on a unit that also has a prorated line is naming the
      WHOLE deal, not the up-front half (details.upfrontWordingDescribes ===
      'total'), so the up-front expectation is the stated total minus the
      prorated weeks. Units 104, 203 and 405 are the real cases.
   C. THE PRORATED LENGTH IS READ, NOT INFERRED. parseProratedPortionLength()
      takes the quantity written immediately BEFORE the word "prorated", so
      "2 Months free - one month prorated over lease term" is one month
      prorated out of a two-month deal. details.proratedWeeksSource says where
      that number came from ('none'|'rent roll'|'ledger'|'derived'); 'derived'
      means nothing stated it and the verdict is 'unknown', not a mismatch.
   D. leaseTermMonths() ROUNDS TO THE NEAREST WHOLE MONTH. monthsBetween()
      counts COMPLETED months, which floors — it called unit 302's 11.87-month
      lease 11 and 12-month arithmetic then failed on a correct unit.
   E. Option Filters were removed from this tool entirely (nothing is
      filterable when the tool checks exactly one thing), and so was the
      lease-vs-rent-roll RENT CHECK. A rent disagreement now surfaces only as
      a note on the "Monthly rent used for the math" fact tile, carried by
      entry.rentDisagrees.
   F. Detail rows are now: Free rent taken up front / Free rent prorated over
      the lease / Total concession, then optionally Reversals netted out and
      Fee waivers (not free rent). "Lease term used" and "Monthly rent used"
      are no longer rows — they are fact tiles above the table.

   Every expected number below is derived from the fixtures themselves —
   the ledger PDFs read with `pdftotext -layout` and the rent roll read with
   openpyxl — and the arithmetic is written out above each assertion.
   ========================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const HERE = __dirname;
const ZIP = path.join(HERE, 'real/BOA Resident Ledgers 08-14-2026.zip');
const RENTROLL = path.join(HERE, 'real/BOA 2026.14- Rent Roll.xlsx');

const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 0.005 : tol);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // =========================================================================
  // 1. Pure functions — no files needed
  // =========================================================================
  const text = await page.evaluate(() => {
    const stated = s => { const r = parseStatedConcessionLength(s); return r ? r.label : null; };
    const weeks  = s => { const r = parseStatedConcessionLength(s); return r ? r.weeks : null; };
    const cls = d => classifyLedgerCredit({description: d, credit: 100});
    const day = (y,m,d) => new Date(y, m-1, d);
    const prol = s => { const r = parseProratedPortionLength(s); return r ? {label: r.label, weeks: r.weeks, unit: r.unit, value: r.value} : null; };
    return {
      // ---- the week ----
      weeksPerMonth: typeof WEEKS_PER_MONTH !== 'undefined' ? WEEKS_PER_MONTH : null,
      tolerance: typeof WHOLE_WEEK_TOLERANCE !== 'undefined' ? WHOLE_WEEK_TOLERANCE : null,
      // The calendar-week constants must be GONE, not merely unused: if one
      // comes back, so does the 6.5-weeks-for-a-six-week-special bug.
      oldConstantsGone: (typeof WEEKS_PER_YEAR === 'undefined') &&
                        (typeof WEEKS_PER_MONTH_CONVENTION === 'undefined'),
      weekly1124: weeklyRateOf(1124),
      weekly1261: weeklyRateOf(1261),
      weeklyNoRent: [weeklyRateOf(null), weeklyRateOf(0), weeklyRateOf(-50)],
      whole6:      isWholeWeeks(6),
      whole399:    isWholeWeeks(3.9911699779249448),   // unit 302: $113 x 12 / $339.75
      whole1996:   isWholeWeeks(1.995995995995996),    // unit 401: $498.50 / $249.75
      whole436:    isWholeWeeks(4.363747870528109),    // unit 203: $106.73 x 12 / $293.50
      whole526:    isWholeWeeks(5.264636533958626),    // unit 202's $1,686 at a $1,281 rent
      whole0534:   isWholeWeeks(150/281),              // a $150 admin-fee waiver at unit 202's week
      whole04:     isWholeWeeks(0.4),

      // ---- stated length, read not guessed ----
      six:        stated('Move in special six weeks free Feb/Mar'),
      sixDigit:   stated('Move in special - 6 weeks free April/May'),
      eight:      stated('8 weeks free move in special'),
      twoMonths:  stated('Move In Special 2 Months free - one month prorated over lease term'),
      oneMonth:   stated('1 month free prorated over 12 months'),
      fourWeeks:  stated('4 weeks free prorated over lease term'),
      halfMonth:  stated('half month free'),
      freeFirst:  stated('Resident receives free rent for 2 months'),
      // A month is FOUR weeks now, everywhere -- the same convention the
      // dollars are billed on. (Under the old calendar week a month was
      // 4.33 weeks, so "2 months free" and "8 weeks free" were different
      // deals; unit 104 and unit 205 each state theirs both ways.)
      twoMonthsWeeks: weeks('2 Months free move in special'),
      oneMonthWeeks:  weeks('One month free move in special'),
      halfMonthWeeks: weeks('half month free'),
      eightWeeks:     weeks('8 weeks free move in special'),
      // Wording that states nothing must stay silent, not guess.
      noneA:      stated('Concession - Rent'),
      noneB:      stated('Move-in Special'),
      noneC:      stated('Look & Lease Special Waived Admin Fee'),
      noneD:      stated('prorated over 12 months'),
      junk:       (() => { try { return [parseStatedConcessionLength(null), parseStatedConcessionLength(''), parseStatedConcessionLength({})].every(x => x === null); } catch(e){ return 'THREW: ' + e.message; } })(),

      // ---- classification ----
      clsConcession: cls('Move in special six weeks free Feb/Mar'),
      clsWaiver:     cls('Look & Lease Special Waived Admin Fee'),
      clsWaiver2:    cls('Look & Lease Special - Admin Fee Waived'),
      clsPayment:    cls('Move in prorate payment'),
      clsPaymentTypo:cls('Prorate move in paymetn'),
      clsPaymentMI:  cls('MI Payment Sept prorate & Oct rent'),
      clsNothing:    cls('Rent'),
      clsNoteWins:   (() => classifyLedgerCredit({description:'Concession - Rent', notes:'Application fee waived', credit:55}))(),

      // ---- instalment vs up-front, by description ----
      proA: isProratedCreditLine({description:'4 weeks free prorated over lease term'}),
      proB: isProratedCreditLine({description:'Move in special prorated'}),
      proC: isProratedCreditLine({description:'Prorate move in special'}),
      proD: isProratedCreditLine({description:'Move in special - 6 weeks free'}),
      proE: isProratedCreditLine({description:'8 weeks free move in special'}),

      // ---- reversals ----
      revPrefix:  isLedgerReversal({description:'Reversed Move in special - 6 weeks free', credit:-630.5}),
      revNeg:     isLedgerReversal({description:'Some credit', credit:-10}),
      revPostErr: isLedgerReversal({description:'Concession - Rent', paymentType:'Posting Error', credit:0}),
      revPlain:   isLedgerReversal({description:'Move in special six weeks free', credit:630.5}),

      // ---- CHANGED BY SPEC (D): the lease term, rounded to the NEAREST
      // whole month. This replaces the old engine-level reliance on
      // monthsBetween(), which floors. Both are probed on the same two real
      // leases so the difference is on the record rather than assumed.
      term104:    leaseTermMonths(day(2025,9,30), day(2026,11,2)),   // 13.10 -> 13
      term302:    leaseTermMonths(day(2025,10,9), day(2026,10,5)),   // 11.87 -> 12
      floored302: monthsBetween(day(2025,10,9), day(2026,10,5)),     // completed months -> 11
      term14:     leaseTermMonths(day(2025,1,1), day(2026,2,28)),    // 13.96 -> 14
      termNull:   [leaseTermMonths(null, day(2026,1,1)), leaseTermMonths(day(2026,1,1), null)],

      // ---- CHANGED BY SPEC (C): the PRORATED portion length, read as the
      // quantity written immediately before the word "prorated". This
      // replaces the old details.statedWeeks single-number reading, which
      // could not tell "2 months free" (the whole deal) from "one month
      // prorated" (the half of it that is spread over the lease).
      proLen104:  prol('Move In Special 2 Months free - one month prorated over lease term'),
      proLen203:  prol('4 weeks free prorated over lease term'),
      proLen302:  prol('1 month free prorated over 12 months'),
      proLenNone: prol('Concession - Rent'),
      proLenNoQty:prol('prorated over lease term'),
      proLenJunk: (() => { try { return [parseProratedPortionLength(null), parseProratedPortionLength(''), parseProratedPortionLength({})].every(x => x === null); } catch(e){ return 'THREW: ' + e.message; } })(),
    };
  });
  console.log('=== pure functions ===');
  console.log(JSON.stringify(text, null, 1));

  // =========================================================================
  // 2. The real archive, end to end
  // =========================================================================
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', ZIP);
  await page.setInputFiles('#rentroll-file', RENTROLL);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 300000});
  await page.waitForTimeout(400);

  const run = await page.evaluate(() => {
    const lite = t => ({date: t.date ? t.date.toISOString().slice(0,10) : null, desc: t.description, credit: t.credit});
    const out = {units:{}, status: document.getElementById('parse-status').textContent};
    for (const e of unitEntries){
      const c = e.concession, d = c && c.details;
      out.units[e.unit] = {
        rent: e.monthlyBaseRent,
        leaseMissing: !!e.leaseMissing,
        has: !!(c && c.hasConcession),
        // A unit with fee waivers and no rent concession still reports the
        // waivers, on c.feeWaivers, with details left null.
        waiversOnly: (c && !c.hasConcession && c.feeWaivers) ? c.feeWaivers.total : null,
        detailsIsNull: !!(c && !c.hasConcession && !c.details),
        bad: c ? (c.issues||[]).filter(i=>i.severity==='bad').length : 0,
        warn: c ? (c.issues||[]).filter(i=>i.severity==='warn').length : 0,
        issueKeys: c ? (c.issues||[]).map(i=>i.key) : [],
        issueText: c ? (c.issues||[]).map(i=>i.text).join(' | ') : '',
        rowItems: (c && c.rows || []).map(r => r.item),
        // CHANGED BY SPEC (A): the old projection read d.stated / d.statedWeeks
        // / d.statedSource / d.totalWeeks / d.impliedTotalWeeks / d.reconciles
        // / d.softenedProrate. Those fields no longer exist; every one of them
        // is re-pointed at its Expected-vs-Actual replacement below, and their
        // absence is asserted separately (deadFieldsGone).
        d: d ? {
          label: d.label, status: d.status,
          // Up front: the wording read off the paperwork, what it implies is
          // owed, and whether what was credited matches it.
          upfrontStated: d.upfrontStated ? d.upfrontStated.label : null,
          upfrontStatedSource: d.upfrontStatedSource,
          upfrontWordingDescribes: d.upfrontWordingDescribes,
          expectedUpfrontWeeks: d.expectedUpfrontWeeks, expectedUpfrontDollars: d.expectedUpfrontDollars,
          upfrontOk: d.upfrontOk,
          rent: d.monthlyBaseRent, weekly: d.weeklyRate, rentSource: d.rentSource,
          upfrontTotal: d.upfrontTotal, upfrontWeeks: d.upfrontWeeks, upfrontWhole: d.upfrontWhole,
          upfrontItems: d.upfrontItems.map(lite),
          recurringMonthly: d.recurringMonthly,
          rrLines: d.rentRollConcessionLines.map(l => ({desc: l.description, amount: l.amount})),
          // Prorated: the stated portion length, where it was read, and the
          // verdict on the monthly instalment actually being credited.
          proratedStated: d.proratedStated ? d.proratedStated.label : null,
          proratedStatedSource: d.proratedStatedSource, proratedWeeksSource: d.proratedWeeksSource,
          expectedProratedWeeks: d.expectedProratedWeeks, expectedProratedDollars: d.expectedProratedDollars,
          expectedInstalment: d.expectedInstalment, proratedVerdict: d.proratedVerdict,
          proratedTried: d.proratedTried.map(p => ({months:p.months, total:p.total, weeks:p.weeks, whole:p.whole})),
          proratedMonths: d.prorated ? d.prorated.months : null,
          proratedTotal: d.prorated ? d.prorated.total : null,
          proratedWeeks: d.proratedWeeks,
          impliedMonths: d.impliedMonths,
          ledgerProratedItems: d.ledgerProratedItems.map(lite),
          ledgerProratedTotal: d.ledgerProratedTotal,
          // The two halves added together.
          actualTotalWeeks: d.actualTotalWeeks, expectedTotalWeeks: d.expectedTotalWeeks,
          termMonths: d.termMonths, termSource: d.termSource,
          reversalPairs: d.reversalPairs.length, orphanReversals: d.orphanReversals.length,
          feeWaiverTotal: d.feeWaiverTotal,
          feeWaiverRows: d.feeWaiverRows.map(lite),
          // CHANGED BY SPEC (A): the retired single-axis fields must be gone,
          // not merely unread -- if one comes back so does the "8 weeks stated
          // vs 8 weeks credited, therefore fine" reasoning that hid unit 104's
          // wrong monthly instalment behind a correct-looking total.
          deadFields: ['stated','statedSource','statedWeeks','statedPhrase','totalWeeks',
                       'impliedTotalWeeks','reconciles','softenedProrate'].filter(k => k in d),
        } : null,
      };
    }
    // The whole rent-roll-vs-ledger recurring-charge audit was removed from
    // this tool; nothing may quietly reintroduce it.
    out.chargesGone = unitEntries.every(e => e.charges === undefined && e.chargesHiddenByFilter === undefined) &&
                      typeof generalChargeCheck === 'undefined';
    // CHANGED BY SPEC (E): was out.filterableIssueTypes = FILTERABLE_ISSUE_TYPES...
    // Option Filters are gone from this tool, so the assertion flips from
    // "the filter list is exactly these keys" to "no filter machinery is left
    // anywhere" -- symbols, DOM node and per-entry bookkeeping alike.
    out.filtersGone = typeof FILTERABLE_ISSUE_TYPES === 'undefined' &&
                      typeof HIDDEN_ISSUE_TYPES === 'undefined' &&
                      typeof isIssueTypeHidden === 'undefined' &&
                      typeof renderIssueFilterPanel === 'undefined' &&
                      !document.getElementById('issue-filter-panel') &&
                      !document.querySelector('input[data-issue-key]') &&
                      !document.querySelector('.kpi-tile.hidden-filter') &&
                      unitEntries.every(e => e.concessionHiddenByFilter === undefined &&
                                             e.hiddenProblemCount === undefined &&
                                             e.rentHiddenByFilter === undefined);
    // CHANGED BY SPEC (E): the lease-vs-rent-roll rent CHECK is gone too. What
    // survives is entry.rentDisagrees, a note on the rent fact tile -- proved
    // out in the lease-authoritative section below, where a lease rent that
    // disagrees with the rent roll populates it.
    out.rentCheckGone = typeof chargeCellState === 'undefined' &&
                        UNIT_SORT_ACCESSORS.charges === undefined &&
                        unitEntries.every(e => e.rentMismatch === undefined);
    // Every unit on this archive is ledgers-only, so none of them may claim a
    // rent disagreement.
    out.rentDisagreesAllNull = unitEntries.every(e => e.rentDisagrees == null);
    return out;
  });
  const U = u => run.units[u] || {};
  const D = u => (run.units[u] && run.units[u].d) || {};
  console.log('=== per-unit ===');
  ['202','205','402','208','305','308','302','203','104','405','401','102','406'].forEach(u =>
    console.log(u, JSON.stringify(U(u))));

  const u202 = D('202'), u205 = D('205'), u402 = D('402'), u208 = D('208'), u305 = D('305'),
        u308 = D('308'), u302 = D('302'), u203 = D('203'), u104 = D('104'), u405 = D('405'),
        u401 = D('401'), u201 = D('201'), u404 = D('404');

  const descOf = arr => (arr||[]).map(t => t.desc);
  const allKeptDescriptions = Object.values(run.units).flatMap(v => v.d
    ? descOf(v.d.upfrontItems).concat(descOf(v.d.ledgerProratedItems)).concat(descOf(v.d.feeWaiverRows))
    : []);
  const PAYMENT_RE = /\bpay(?:ment|ments|mt|mts|metn|metns)\b|\bpmt\b/i;

  // =========================================================================
  // 3. The lease is authoritative — same ledger, different rent source.
  //     The real archive is ledgers only, so every unit above falls back to
  //     the rent roll. Here unit 202's parsed ledger and rent-roll block are
  //     re-reconciled with a lease injected into the cache buildEntries()
  //     reads from, which is exactly what a lease ZIP upload would produce.
  // =========================================================================
  const leaseRun = await page.evaluate(() => {
    const e202 = unitEntries.find(e => e.unit === '202');
    const key = e202.unitKey;
    const before = cachedLeaseByUnit.get(key) || null;
    const read = (rent) => {
      cachedLeaseByUnit.set(key, [{filename: 'synthetic-202-lease.pdf', data: {
        unit: '202', monthlyBaseRent: rent,
        leaseStart: new Date(2026, 0, 9), leaseEnd: new Date(2026, 11, 15),
      }}]);
      const e = buildEntries().find(x => x.unit === '202');
      const d = e.concession.details;
      return {
        entryRent: e.monthlyBaseRent, leaseMissing: !!e.leaseMissing,
        rentSource: d.rentSource, weekly: d.weeklyRate,
        upfrontTotal: d.upfrontTotal, upfrontWeeks: d.upfrontWeeks, upfrontWhole: d.upfrontWhole,
        // CHANGED BY SPEC (A): was totalWeeks / statedWeeks.
        actualTotalWeeks: d.actualTotalWeeks, expectedTotalWeeks: d.expectedTotalWeeks,
        expectedUpfrontWeeks: d.expectedUpfrontWeeks, expectedUpfrontDollars: d.expectedUpfrontDollars,
        upfrontOk: d.upfrontOk, status: d.status,
        termMonths: d.termMonths, termSource: d.termSource,
        // CHANGED BY SPEC (E): the surviving trace of the retired rent check.
        rentDisagrees: e.rentDisagrees,
        detail: buildDetail(e),
        bad: e.concession.issues.filter(i=>i.severity==='bad').map(i=>i.key),
        issueText: e.concession.issues.map(i=>i.text).join(' | '),
      };
    };
    const out = {whole: read(1348.80), notWhole: read(1281)};
    if (before) cachedLeaseByUnit.set(key, before); else cachedLeaseByUnit.delete(key);
    return out;
  });
  console.log('=== lease-authoritative ===', JSON.stringify(leaseRun, (k,v) => k === 'detail' ? undefined : v, 1));

  const checks = [
    // ======================= the week itself ==============================
    // CHANGED BY SPEC: was rent x 12 / 52 (a calendar week).
    ['One week of free rent is the monthly rent / 4', text.weeksPerMonth === 4],
    ['The calendar-week constants (WEEKS_PER_YEAR, WEEKS_PER_MONTH_CONVENTION) are gone', text.oldConstantsGone === true],
    // $1,124 / 4 = $281.00 exactly (the old calendar rate was $259.38).
    ['weeklyRateOf($1,124) = $281.00, not the old $259.38', near(text.weekly1124, 281) && !near(text.weekly1124, 1124*12/52, 0.01)],
    // $1,261 / 4 = $315.25 (old calendar rate $291.00).
    ['weeklyRateOf($1,261) = $315.25', near(text.weekly1261, 315.25)],
    ['No rent means no week — never a zero or a NaN', text.weeklyNoRent.every(v => v === null)],

    // ======================= the whole-week test ==========================
    ['The whole-week tolerance is 0.05 weeks', text.tolerance === 0.05],
    ['An exact 6 weeks is whole', text.whole6 === true],
    // 302: $113.00 x 12 = $1,356.00 against a $1,359.00 month -> 3.9912 wks.
    // 0.0088 weeks out: cent-rounding in the property's software, absorbed.
    ['$113/mo x 12 on a $1,359 rent (3.9912 wks) is still 4 whole weeks', text.whole399 === true],
    // 401: $498.50 / $249.75 = 1.996 wks -- $1.00 of rounding, absorbed.
    ['$498.50 on a $999 rent (1.996 wks) is still 2 whole weeks', text.whole1996 === true],
    // 203: $106.73 x 12 = $1,280.76 / $293.50 = 4.3637 wks. 0.36 weeks out is
    // a whole missing month, not rounding -- the tolerance must NOT swallow it.
    ['$106.73/mo x 12 on a $1,174 rent (4.3637 wks) is NOT whole', text.whole436 === false],
    ['5.26 weeks is not whole', text.whole526 === false],
    // The old 0.5-weeks bug: a $150 admin-fee waiver at unit 202/208's $281
    // week is 0.534 weeks, which must never read as a whole number of weeks.
    ['A $150 fee waiver (0.53 weeks) is not a whole number of weeks', text.whole0534 === false],
    ['Anything under half a week is never "whole"', text.whole04 === false],

    // ======================= stated length ================================
    ['"six weeks free" (word-number) reads as 6 weeks', text.six === '6 weeks free'],
    ['"6 weeks free" (digits) reads as 6 weeks', text.sixDigit === '6 weeks free'],
    ['"8 weeks free move in special" reads as 8 weeks', text.eight === '8 weeks free'],
    ['"2 Months free - one month prorated..." reads as 2 months, not "one month"', text.twoMonths === '2 months free'],
    ['"1 month free prorated over 12 months" reads as 1 month, not 12', text.oneMonth === '1 month free'],
    ['"4 weeks free prorated over lease term" reads as 4 weeks', text.fourWeeks === '4 weeks free'],
    ['"half month free" reads as half a month', text.halfMonth === '0.5 months free'],
    ['"free rent for 2 months" (length after the word free) reads as 2 months', text.freeFirst === '2 months free'],
    // CHANGED BY SPEC: a month is 4 weeks, so "2 months free" and "8 weeks
    // free" are now literally the same deal (they were 8.67 vs 8 before).
    ['A stated month converts at 4 weeks: 2 months = 8, 1 month = 4, half = 2, and 8 weeks stays 8',
      text.twoMonthsWeeks === 8 && text.oneMonthWeeks === 4 && text.halfMonthWeeks === 2 && text.eightWeeks === 8],
    ['Wording that states no length returns nothing rather than guessing',
      text.noneA === null && text.noneB === null && text.noneC === null && text.noneD === null],
    ['The stated-length parser never throws on null/empty/odd input', text.junk === true],

    // ======================= classification ===============================
    ['A "... weeks free" credit is classed as a rent concession', text.clsConcession === 'rent_concession'],
    ['"Look & Lease Special Waived Admin Fee" is classed as a fee waiver, not rent', text.clsWaiver === 'fee_waiver'],
    ['"Look & Lease Special - Admin Fee Waived" is classed as a fee waiver too', text.clsWaiver2 === 'fee_waiver'],
    ['Payments are never concessions -- including the real "paymetn" typo and "MI Payment ... prorate"',
      text.clsPayment === 'payment' && text.clsPaymentTypo === 'payment' && text.clsPaymentMI === 'payment'],
    ['An ordinary charge description is not a concession at all', text.clsNothing === null],
    ['A contradicting NOTE does not reclassify the line (unit 308 "Concession - Rent" / note "Application fee waived")',
      text.clsNoteWins === 'rent_concession'],
    ['Reversals are recognised by the "Reversed" prefix, a negative credit, or a Posting Error type',
      text.revPrefix === true && text.revNeg === true && text.revPostErr === true && text.revPlain === false],
    ['"prorated"/"prorate" marks an instalment; a plain move-in special is not one',
      text.proA === true && text.proB === true && text.proC === true && text.proD === false && text.proE === false],

    // =============== the lease term, rounded not floored =================
    // CHANGED BY SPEC (D). New helper leaseTermMonths(). These two real leases
    // are exactly why it exists:
    //   104: 30 Sep 2025 - 02 Nov 2026. 13 whole months + 3/30 of one = 13.10,
    //        which rounds to the 13 its $40.73 prorate has to divide by.
    //   302: 09 Oct 2025 - 05 Oct 2026, four days short of a year = 11.87,
    //        which rounds to 12. monthsBetween() counts COMPLETED months and
    //        so calls that same lease 11 -- and an 11-month divisor turned a
    //        correctly-set-up unit into a finding.
    ['A 13.10-month lease (unit 104: 30 Sep 2025 - 2 Nov 2026) reads as a 13-month term', text.term104 === 13],
    ['An 11.87-month lease (unit 302: 9 Oct 2025 - 5 Oct 2026) rounds UP to 12, not down to 11',
      text.term302 === 12 && text.floored302 === 11],
    ['A 13.96-month lease rounds to 14', text.term14 === 14],
    ['A missing date gives no term at all, never a 0 or a NaN', text.termNull.every(v => v === null)],

    // =============== the prorated portion, read not inferred =============
    // CHANGED BY SPEC (C). New helper parseProratedPortionLength(): the
    // quantity written immediately BEFORE the word "prorated". Unit 104's real
    // rent roll line is the whole reason for "immediately before" -- "2 Months
    // free - one month prorated over lease term" states a two-month deal of
    // which ONE month is prorated. Reading the first quantity in the string
    // would price the prorated half at 8 weeks instead of 4.
    ['"2 Months free - one month prorated over lease term" reads ONE month prorated, not two',
      !!text.proLen104 && text.proLen104.label === '1 month prorated' && text.proLen104.weeks === 4],
    ['"4 weeks free prorated over lease term" reads 4 weeks prorated',
      !!text.proLen203 && text.proLen203.label === '4 weeks prorated' && text.proLen203.weeks === 4],
    ['"1 month free prorated over 12 months" reads 1 month prorated, not 12 months',
      !!text.proLen302 && text.proLen302.label === '1 month prorated' && text.proLen302.value === 1 && text.proLen302.unit === 'month'],
    ['Wording with no "prorated" in it, or no quantity before it, returns nothing rather than guessing',
      text.proLenNone === null && text.proLenNoQty === null],
    ['The prorated-length parser never throws on null/empty/odd input', text.proLenJunk === true],

    // ======================= unit 202: the proof =========================
    // Rent roll rent $1,124.00 -> $1,124 / 4 = $281.00 a week.
    // Ledger: 02/01/2026 $1,124.00 + 03/01/2026 $562.00 = $1,686.00.
    // $1,686.00 / $281.00 = 6.000 weeks, exactly the stated six.
    // CHANGED BY SPEC: this used to be $259.38/wk, an "expected" $1,556.31,
    // a "+$129.69 variance" and a convention-match escape hatch.
    ['202: rent $1,124.00 from the rent roll, week $281.00', near(u202.rent, 1124) && near(u202.weekly, 281)],
    ['202: the six-week special is SUMMED from its two ledger lines ($1,124.00 + $562.00 = $1,686.00)',
      u202.upfrontItems.length === 2 &&
      near(u202.upfrontItems[0].credit, 1124) && near(u202.upfrontItems[1].credit, 562) &&
      near(u202.upfrontTotal, 1686)],
    ['202: $1,686.00 / $281.00 = exactly 6 whole weeks', near(u202.upfrontWeeks, 6, 0.0005) && u202.upfrontWhole === true],
    // CHANGED BY SPEC (A): was near(u202.totalWeeks, 6). totalWeeks is gone;
    // the same fact is now actualTotalWeeks, and the absence of a prorated
    // half is stated positively as proratedVerdict === 'none'.
    ['202: nothing prorated, so the total is the 6 up-front weeks',
      u202.recurringMonthly === null && u202.proratedWeeks === null &&
      u202.proratedVerdict === 'none' && u202.expectedProratedWeeks === 0 &&
      near(u202.actualTotalWeeks, 6, 0.0005)],
    // CHANGED BY SPEC (A): was statedWeeks === 6 && reconciles === true. The
    // wording "six weeks free" on a unit with no prorated line describes the
    // up-front half (upfrontWordingDescribes === 'upfront'), so it becomes the
    // EXPECTED up-front figure -- 6 wks x $281.00 = $1,686.00 -- and expected
    // meeting actual is what "reconciles" now means, on both halves at once.
    ['202: 6 credited against the 6 the ledger states, expected = actual, with no finding at all',
      u202.upfrontStated === '6 weeks free' && u202.upfrontStatedSource === 'ledger' &&
      u202.upfrontWordingDescribes === 'upfront' &&
      u202.expectedUpfrontWeeks === 6 && near(u202.expectedUpfrontDollars, 1686) &&
      u202.upfrontOk === true && near(u202.expectedTotalWeeks, 6, 0.0005) &&
      u202.status === 'match' && U('202').bad === 0 && U('202').warn === 0],
    ['202: no reversals on this ledger', u202.reversalPairs === 0 && u202.orphanReversals === 0],

    // ======================= unit 205: a split sum, two wordings ==========
    // Ledger 10/06/2025: "One month free move in special" $1,125.00 AND
    // "2 Months free move in special" $1,125.00 -> $2,250.00 up front.
    // Rent $1,125.00 -> $281.25/wk. $2,250.00 / $281.25 = 8.000 weeks.
    // The same ledger also carries a $50.00 "Posting error" credit, which is
    // not a concession at all and must not join the sum ($2,300 -> 8.18 wks).
    ['205: two DIFFERENT special lines on one day are added together, $1,125.00 + $1,125.00 = $2,250.00',
      u205.upfrontItems.length === 2 && near(u205.upfrontTotal, 2250) &&
      u205.upfrontItems.every(t => near(t.credit, 1125))],
    ['205: $2,250.00 / ($1,125 / 4 = $281.25) = exactly 8 whole weeks',
      near(u205.weekly, 281.25) && near(u205.upfrontWeeks, 8, 0.0005) && u205.upfrontWhole === true],
    ['205: the $50.00 "Posting error" credit is not swept into the special',
      !near(u205.upfrontTotal, 2300) && !descOf(u205.upfrontItems).some(d => /posting error/i.test(d))],
    // CHANGED BY SPEC (A): was statedWeeks/stated/totalWeeks/reconciles.
    // Same fact, on the surviving fields: of "One month free" and "2 Months
    // free" on the same day, the longer is taken as the deal, it describes the
    // up-front half (there is no prorated line), and 8 expected = 8 actual.
    ['205: of the two contradicting wordings the longer is taken as the deal, and expected = actual',
      u205.upfrontStated === '2 months free' && u205.upfrontWordingDescribes === 'upfront' &&
      u205.expectedUpfrontWeeks === 8 && near(u205.expectedUpfrontDollars, 2250) &&
      near(u205.expectedTotalWeeks, 8, 0.0005) && near(u205.actualTotalWeeks, 8, 0.0005) &&
      u205.upfrontOk === true && u205.status === 'match'],

    // ======================= unit 402: reversal netting ===================
    // Rent $1,261.00 -> $315.25/wk. 04/01 $1,261.00 kept; three $630.50
    // postings each cancel a "Reversed Move in special" line; the 05/01
    // $630.50 "Move in special six weeks free" ("Half of May") survives.
    // $1,261.00 + $630.50 = $1,891.50; $1,891.50 / $315.25 = 6.000 weeks.
    ['402: rent $1,261.00, week $315.25', near(u402.rent, 1261) && near(u402.weekly, 315.25)],
    ['402: the three repeated $630.50 postings each cancel their "Reversed ..." line -- 3 pairs dropped, none left over',
      u402.reversalPairs === 3 && u402.orphanReversals === 0],
    ['402: what survives netting sums to $1,261.00 + $630.50 = $1,891.50',
      near(u402.upfrontTotal, 1891.50) && u402.upfrontItems.length === 2],
    // CHANGED BY SPEC (A): was statedWeeks === 6 && totalWeeks === 6.
    ['402: $1,891.50 / $315.25 = exactly 6 whole weeks, matching the six the ledger states',
      near(u402.upfrontWeeks, 6, 0.0005) && u402.expectedUpfrontWeeks === 6 &&
      near(u402.expectedUpfrontDollars, 1891.50) && u402.upfrontOk === true &&
      near(u402.actualTotalWeeks, 6, 0.0005) && near(u402.expectedTotalWeeks, 6, 0.0005) &&
      u402.status === 'match' && U('402').bad === 0],
    // $1,891.50 + $150.00 = $2,041.50 would be 6.48 weeks -- not whole, and
    // it would flag a correctly-set-up unit.
    ['402: the $150.00 admin-fee waiver is reported separately and never joins the free-rent total',
      near(u402.feeWaiverTotal, 150) && u402.feeWaiverRows.length === 1 && !near(u402.upfrontTotal, 2041.50)],

    // ======================= unit 208: the 0.5-weeks bug ==================
    // Rent $1,124.00 -> $281.00/wk. 05/04 $1,124.00 + 06/01 $562.00 =
    // $1,686.00 = 6.000 weeks. A $150.00 "Look & Lease Special - Waived
    // Admin Fee" also sits on the ledger; reading THAT as the concession is
    // what used to make this unit "0.5 weeks" ($150 / $281 = 0.53).
    ['208: the $150.00 waived admin fee is reported as a fee waiver', near(u208.feeWaiverTotal, 150)],
    ['208: ...and is never converted into weeks of free rent',
      near(u208.upfrontTotal, 1686) && !descOf(u208.upfrontItems).some(d => /waiv/i.test(d))],
    // CHANGED BY SPEC (A): was statedWeeks === 6.
    ['208: the special itself is $1,124.00 + $562.00 = $1,686.00 = exactly 6 weeks, not 0.5',
      u208.upfrontItems.length === 2 && near(u208.upfrontWeeks, 6, 0.0005) &&
      u208.expectedUpfrontWeeks === 6 && u208.upfrontOk === true &&
      u208.status === 'match'],

    // ======================= unit 102: waiver only =======================
    // The only credit on 102's current ledger is a $150.00 "Look & Lease
    // Waived Admin Fee". That is not free rent, so there is no concession.
    ['102: a unit whose only credit is a $150 admin-fee waiver has NO concession at all',
      U('102').has === false && near(U('102').waiversOnly, 150) && U('102').detailsIsNull === true &&
      U('102').bad === 0 && U('102').warn === 0],

    // ======================= unit 305: prorate excluded ==================
    // Rent $998.00 -> $249.50/wk. Up front: 07/01 $998.00 + 08/03 $499.00 =
    // $1,497.00 = 6.000 weeks. The 06/09 $38.45 "Prorate move in special"
    // (the part-month credit) is excluded by /prorat/i -- including it would
    // make $1,535.45 = 6.154 weeks, which is not whole and would flag a unit
    // that is set up correctly.
    ['305: $998.00 + $499.00 = $1,497.00 up front = exactly 6 weeks at $249.50',
      near(u305.weekly, 249.50) && near(u305.upfrontTotal, 1497) && near(u305.upfrontWeeks, 6, 0.0005)],
    ['305: the $38.45 "Prorate move in special" is held out of the up-front sum',
      u305.ledgerProratedItems.length === 1 && near(u305.ledgerProratedTotal, 38.45) &&
      !near(u305.upfrontTotal, 1535.45) && u305.status === 'match'],
    ['305: its $150.00 admin-fee waiver is likewise separate', near(u305.feeWaiverTotal, 150)],

    // ======================= unit 308: instalment exclusion ==============
    // 14 x $455.00 "Concession - Rent" credits (one of them written
    // "Employee Discount"), and the rent roll bills "Concession - Rent"
    // -$455.00 a month. None of them says "prorated", so without the
    // amount-matches-the-rent-roll / posted-in-3+-months rules all fourteen
    // would have been added into a $6,370.00 "up-front special"
    // ($6,370 / $313.75 = 20.3 weeks).
    ['308: 14 identical $455.00 monthly credits are recognised as instalments, not an up-front special',
      near(u308.upfrontTotal, 0) && u308.upfrontItems.length === 0 &&
      u308.ledgerProratedItems.length === 14 && near(u308.ledgerProratedTotal, 6370)],
    ['308: the two $55.00 posting-error pairs cancel out cleanly',
      u308.reversalPairs === 2 && u308.orphanReversals === 0],
    // Rent $1,255.00 -> $313.75/wk. $455.00 x 12 = $5,460.00 / $313.75 =
    // 17.40 weeks; the lease term is also 12 months, so there is only one
    // run-out to try and it is not whole.
    // CHANGED BY SPEC (C): this used to be called a hard 'mismatch' with the
    // 'prorated' key. Nothing on the lease, the ledger OR the rent roll says
    // how long this $455/month runs -- proratedWeeksSource is 'derived', i.e.
    // the tool had to invent the 17 weeks it is comparing against. Calling a
    // unit wrong on a number the tool made up itself is not a mismatch; the
    // verdict is 'unknown' and the unit goes to Review with the softer
    // 'prorated-unstated' finding.
    ['308: $455/mo x 12 = $5,460.00 = 17.40 weeks, not whole',
      near(u308.weekly, 313.75) && u308.proratedTried.length === 1 &&
      near(u308.proratedTried[0].total, 5460) && near(u308.proratedTried[0].weeks, 17.4024, 0.001) &&
      u308.proratedTried[0].whole === false && u308.proratedMonths === null],
    ['308: no document states how long the $455/month runs, so the length is DERIVED and the verdict is "unknown", not a mismatch',
      u308.proratedStated === null && u308.proratedWeeksSource === 'derived' &&
      u308.proratedVerdict === 'unknown' && u308.status === 'review' &&
      U('308').bad === 0 && U('308').warn === 1 &&
      U('308').issueKeys.join(',') === 'prorated-unstated'],
    ['308: and the finding says plainly that nothing states the length, quoting the $455 and the 17.40 weeks it works out to',
      /nothing on the lease, the ledger or the rent roll says how long it runs/.test(U('308').issueText) &&
      /\$455\.00 a month/.test(U('308').issueText) && /17\.40 weeks/.test(U('308').issueText)],
    // 17 weeks would need $313.75 x 17 / $455 = 11.72 months -- not a whole
    // month count, so there is no implied schedule to report.
    // CHANGED BY SPEC (A): was totalWeeks === null && impliedTotalWeeks === null.
    // The total is no longer suppressed when the prorate can't be run out --
    // it is reported as what the ledger and rent roll ACTUALLY deliver
    // (17.40 weeks) against the derived expectation (17), which is exactly the
    // pair the Review verdict is asking a human to look at.
    ['308: no whole month count would make $455 come out right, so no impliedMonths is claimed',
      u308.impliedMonths === null],
    ['308: the total is still reported as actual-vs-expected rather than suppressed',
      near(u308.actualTotalWeeks, 17.4024, 0.001) && u308.expectedTotalWeeks === 17 &&
      near(u308.expectedProratedWeeks, 17) && near(u308.expectedInstalment, 444.48)],

    // ======================= unit 302: x12 beats x-term ==================
    // Rent $1,359.00 -> $339.75/wk. Rent roll: "1 month free prorated over
    // 12 months" -$113.00. Two run-outs are tried:
    //   x 12 months        = $1,356.00 / $339.75 = 3.9912 wks -> whole
    // CHANGED BY SPEC (D): the old expectation was termMonths === 11, and a
    // SECOND run-out at 11 months ($1,243.00 = 3.6586 wks) that had to be
    // rejected. That 11 was monthsBetween() flooring an 11.87-month lease
    // (9 Oct 2025 - 5 Oct 2026). leaseTermMonths() rounds it to 12, so the
    // 12-month run-out and the lease-term run-out are now the same one and
    // only one is tried. $113.00 x 12 = $1,356.00 / $339.75 = 3.9912 wks,
    // inside the 0.05-week tolerance, so the prorated half is 4 weeks.
    ['302: the lease term is 12 (not the floored 11), so there is one run-out and it lands whole',
      u302.termMonths === 12 && u302.proratedTried.length === 1 &&
      near(u302.proratedTried[0].total, 1356) && near(u302.proratedTried[0].weeks, 3.9912, 0.001) &&
      u302.proratedTried[0].whole === true &&
      u302.proratedMonths === 12 && u302.proratedWeeks === 4],
    // CHANGED BY SPEC (A): was near(u302.totalWeeks, 8).
    ['302: total = 4 up front + 4 prorated = 8 weeks',
      near(u302.upfrontTotal, 1359) && near(u302.upfrontWeeks, 4, 0.0005) &&
      near(u302.actualTotalWeeks, 8, 0.0005)],
    // CHANGED BY SPEC (A+C): this unit used to be pushed to "review" because
    // the ledger's "One month free" (4 weeks) was compared against the 8 weeks
    // actually set up, and 8-against-4 looked like a variance. It isn't one:
    // the ledger wording names the UP-FRONT half only (there is a separate
    // rent roll line, "1 month free prorated over 12 months", naming the
    // other), so the deal is 4 + 4 = 8 and 8 is what was delivered. Expected
    // $113.25/month against an actual $113.00 is 25 cents of the property
    // software's rounding, inside tolerance -> proratedVerdict 'match'.
    // The whole unit is now Match, with no finding at all.
    ['302: "One month free" names the up-front half and "1 month prorated" the other, so 4 + 4 = 8 expected AND actual',
      u302.upfrontStated === '1 month free' && u302.upfrontWordingDescribes === 'upfront' &&
      u302.expectedUpfrontWeeks === 4 &&
      u302.proratedStated === '1 month prorated' && u302.proratedStatedSource === 'rent roll' &&
      u302.proratedWeeksSource === 'rent roll' && u302.expectedProratedWeeks === 4 &&
      near(u302.expectedTotalWeeks, 8) && near(u302.actualTotalWeeks, 8, 0.0005)],
    ['302: $113.25/month expected against $113.00 credited is rounding, so the prorate matches and the unit is clean',
      near(u302.expectedInstalment, 113.25) && near(u302.recurringMonthly, 113) &&
      u302.proratedVerdict === 'match' && u302.status === 'match' &&
      U('302').bad === 0 && U('302').warn === 0],

    // ======================= unit 203: impliedMonths ======================
    // Rent $1,174.00 -> $293.50/wk. Rent roll: "4 weeks free prorated over
    // lease term" -$106.73. Lease term is 12 months, so both run-outs are the
    // same one: $106.73 x 12 = $1,280.76 / $293.50 = 4.3637 weeks -> not
    // whole. But 4 weeks costs $293.50 x 4 = $1,174.00, and $1,174.00 /
    // $106.73 = 11.0 months exactly -- so the credit is running 11 months.
    // CHANGED BY SPEC (A): was ... && u203.totalWeeks === null. The total is
    // no longer suppressed when a run-out fails.
    ['203: the only run-out available ($106.73 x 12 = $1,280.76) is 4.36 weeks and is rejected',
      u203.proratedTried.length === 1 && near(u203.proratedTried[0].total, 1280.76) &&
      near(u203.proratedTried[0].weeks, 4.3637, 0.001) && u203.proratedTried[0].whole === false &&
      u203.proratedMonths === null && u203.proratedWeeks === null],
    ['203: the month count that WOULD make it whole is reported: 11 months = 4 weeks',
      u203.impliedMonths != null && u203.impliedMonths.months === 11 && u203.impliedMonths.weeks === 4],
    // CHANGED BY SPEC (A): was /over 11 months \(4 weeks\)/. The finding is
    // rewritten around the schedule rather than the arithmetic: the same two
    // numbers (11 months, 4 weeks) are still named, next to the 12 of the term
    // they are supposed to run over, and the text now says outright that the
    // total is right and only the schedule is wrong.
    ['203: ...and it is named in the finding text, against the 12-month term it should have run over',
      /the full 4 prorated weeks over 11 months rather than the 12 months of the lease/.test(U('203').issueText) &&
      /The total comes out right; the schedule does not match the term\./.test(U('203').issueText)],
    // CHANGED BY SPEC (A+C): was statedWeeks === 8 / softenedProrate === true /
    // impliedTotalWeeks === 8. The rent roll line "4 weeks free prorated over
    // lease term" states the prorated portion outright, so the expectation is
    // read, not implied: 4 wks x $293.50 = $1,174.00 over 12 months =
    // $97.83/month. $106.73 is being credited instead -- the right money on an
    // 11-month schedule. That is proratedVerdict 'schedule', which is Review:
    // the totals agree (8 expected, 8 actual), only the timing is off.
    ['203: the prorated portion is READ off the rent roll (4 weeks), not implied',
      u203.proratedStated === '4 weeks prorated' && u203.proratedStatedSource === 'rent roll' &&
      u203.proratedWeeksSource === 'rent roll' && u203.expectedProratedWeeks === 4 &&
      near(u203.expectedProratedDollars, 1174) && near(u203.expectedInstalment, 97.83)],
    ['203: $106.73 delivers the right total on the wrong schedule, so the verdict is "schedule" -> review, not a mismatch',
      near(u203.upfrontWeeks, 4, 0.0005) && near(u203.recurringMonthly, 106.73) &&
      u203.proratedVerdict === 'schedule' &&
      near(u203.expectedTotalWeeks, 8, 0.0005) && near(u203.actualTotalWeeks, 8, 0.0005) &&
      u203.status === 'review' &&
      U('203').bad === 0 && U('203').warn === 1 && U('203').issueKeys.join(',') === 'prorated-schedule'],

    // ======================= unit 104: neither run-out works =============
    // Rent $1,182.00 -> $295.50/wk. Up front 11/04 $1,182.00 = 4 weeks.
    // Rent roll: "Move In Special 2 Months free - one month prorated over
    // lease term" -$40.73. Lease 09/30/2025-11/02/2026 = 13 months.
    //   x 12 months = $488.76 / $295.50 = 1.6540 wks -> not whole
    //   x 13 months = $529.49 / $295.50 = 1.7918 wks -> not whole
    // and 2 weeks would need $295.50 x 2 / $40.73 = 14.5 months, which is not
    // a whole month count either -> a real mismatch with no implied schedule.
    ['104: rent $1,182.00, week $295.50, 13-month term', near(u104.rent, 1182) && near(u104.weekly, 295.50) && u104.termMonths === 13],
    ['104: the $28.73 "Concession - Rent" posting-error reversal cancels exactly one posting, leaving no residual',
      u104.reversalPairs === 1 && u104.orphanReversals === 0 &&
      !descOf(u104.upfrontItems).some(d => /^Reversed/i.test(d))],
    ['104: $1,182.00 up front = exactly 4 whole weeks', near(u104.upfrontTotal, 1182) && near(u104.upfrontWeeks, 4, 0.0005) && u104.upfrontWhole === true],
    ['104: neither $40.73 x 12 = $488.76 nor $40.73 x 13 = $529.49 is a whole number of weeks',
      u104.proratedTried.length === 2 &&
      near(u104.proratedTried[0].total, 488.76) && near(u104.proratedTried[0].weeks, 1.6540, 0.001) && u104.proratedTried[0].whole === false &&
      near(u104.proratedTried[1].total, 529.49) && near(u104.proratedTried[1].weeks, 1.7918, 0.001) && u104.proratedTried[1].whole === false],
    // CHANGED BY SPEC (A): was softenedProrate === false && totalWeeks === null.
    // Both fields are gone. The unit is still a hard mismatch, keyed
    // 'prorated' -- and the total is now REPORTED rather than suppressed:
    // 4 up front + 1.79 delivered = 5.79 actual against 8 expected.
    ['104: no whole month count fits either, so it is a hard mismatch with no implied schedule',
      u104.proratedMonths === null && u104.impliedMonths === null &&
      u104.proratedVerdict === 'mismatch' && u104.status === 'mismatch' &&
      U('104').bad === 1 && U('104').issueKeys.join(',') === 'prorated'],
    ['104: the shortfall is stated as a total too: 8 weeks expected, 5.79 actually delivered',
      near(u104.expectedTotalWeeks, 8) && near(u104.actualTotalWeeks, 5.7918, 0.001)],
    ['104: the 9 monthly $40.73 credits actually posted ($366.57) are counted as instalments, not as an up-front special',
      u104.ledgerProratedItems.length === 9 && near(u104.ledgerProratedTotal, 366.57) &&
      near(u104.upfrontTotal, 1182)],
    // CHANGED BY SPEC (B+C): the ledger says "8 weeks free" and the rent roll
    // says "2 Months free - one month prorated over lease term". The 8 names
    // the WHOLE deal (upfrontWordingDescribes === 'total'), and the "one month
    // prorated" names the half of it that is spread -- 4 weeks. So the up-front
    // expectation is 8 - 4 = 4 weeks = $1,182.00 (which is exactly what was
    // credited: upfrontOk), and the prorated expectation is the other 4 weeks
    // = $1,182.00 over the 13-month term = $90.92 a month. $40.73 is posted.
    // CHANGED BY SPEC (A): expectedInstalment used to be an object
    // {weeks,total,months,perMonth}; it is now the per-month number itself,
    // with its three inputs carried as expectedProratedWeeks /
    // expectedProratedDollars / termMonths.
    ['104: "8 weeks free" names the whole deal, so the up-front half is 8 - 4 = 4 weeks and it is credited correctly',
      u104.upfrontStated === '8 weeks free' && u104.upfrontWordingDescribes === 'total' &&
      u104.expectedUpfrontWeeks === 4 && near(u104.expectedUpfrontDollars, 1182) && u104.upfrontOk === true],
    ['104: the instalment it SHOULD be crediting is worked out: 4 weeks = $1,182.00 over 13 months = $90.92/mo',
      u104.proratedStated === '1 month prorated' && u104.proratedStatedSource === 'rent roll' &&
      u104.expectedProratedWeeks === 4 && near(u104.expectedProratedDollars, 1182) &&
      u104.termMonths === 13 && near(u104.expectedInstalment, 90.92) &&
      near(u104.recurringMonthly, 40.73)],
    // CHANGED BY SPEC (A): the finding used to recite the two rejected
    // run-outs ($488.76 (1.65 weeks) / $529.49 (1.79 weeks)) and leave the
    // reader to work out the consequence. It now states the deal, the right
    // monthly figure, the wrong one being credited, and what the gap costs
    // over the term: ($90.92 - $40.73) x 13 = $652.47.
    ['104: and the finding says all of it in words -- the deal, the right instalment, the wrong one, and what the gap costs',
      /4 weeks \(\$1,182\.00\)/.test(U('104').issueText) &&
      /over the 13-month lease is \$90\.92 a month/.test(U('104').issueText) &&
      /crediting \$40\.73 a month/.test(U('104').issueText) &&
      /\$652\.47 less than the deal over the full term/.test(U('104').issueText)],

    // ======================= unit 405: a real shortfall ===================
    // Rent $1,555.00 -> $388.75/wk. One credit, $1,555.00 = 4 weeks, against
    // a stated six, and the rent roll carries no recurring concession for the
    // other two weeks to be coming through: 2 x $388.75 = $777.50 never
    // credited anywhere.
    ['405: $1,555.00 credited = 4 whole weeks at $388.75',
      near(u405.weekly, 388.75) && near(u405.upfrontTotal, 1555) && near(u405.upfrontWeeks, 4, 0.0005)],
    // CHANGED BY SPEC (A+B): was statedWeeks === 6 / totalWeeks === 4 / the
    // 'variance' issue key. "six weeks free" names the whole deal, and there
    // is no prorated line to carry any of it, so the whole 6 weeks is expected
    // UP FRONT: 6 x $388.75 = $2,332.50 against the $1,555.00 credited. The
    // failure is therefore attributed to the up-front half specifically
    // (upfrontOk === false, key 'upfront'), not to a generic "variance".
    ['405: 4 set up against the 6 stated, with nothing prorated to make up the difference, is a hard mismatch',
      u405.upfrontStated === '6 weeks free' && u405.upfrontWordingDescribes === 'total' &&
      u405.expectedUpfrontWeeks === 6 && near(u405.expectedUpfrontDollars, 2332.50) &&
      u405.upfrontOk === false &&
      near(u405.expectedTotalWeeks, 6, 0.0005) && near(u405.actualTotalWeeks, 4, 0.0005) &&
      u405.recurringMonthly === null && u405.proratedVerdict === 'none' &&
      u405.status === 'mismatch' && U('405').bad === 1 && U('405').issueKeys.join(',') === 'upfront'],
    // CHANGED BY SPEC (A): same money, reworded around expected-vs-actual --
    // $2,332.50 expected, $1,555.00 credited, $777.50 short.
    ['405: the finding puts a number on it -- 6 weeks x $388.75 = $2,332.50 expected, $1,555.00 credited, $777.50 short',
      /6 weeks of free rent up front \(\$2,332\.50 at \$388\.75\/week\)/.test(U('405').issueText) &&
      /\$1,555\.00 was credited — \$777\.50 short/.test(U('405').issueText) &&
      /no prorated concession on the rent roll for the rest to be coming through/.test(U('405').issueText)],

    // ======================= unit 401: rounding, not error ================
    // $498.50 credited against a $999.00 rent: $999 / 4 = $249.75, so 2 weeks
    // is $499.50 and the ledger is $1.00 light. 1.996 weeks is inside the
    // 0.05-week tolerance, so it counts as the 2 whole weeks stated and
    // raises no finding.
    // CHANGED BY SPEC (A): the note that used to sit here reported a tool bug
    // -- details.status read 'mismatch' on this perfectly clean unit because
    // the old status ladder compared totalWeeks < statedWeeks without the
    // tolerance the rest of the check used. The single-axis comparison is gone
    // and the status now comes from upfrontOk (which IS tolerance-aware), so
    // the bug is fixed and the correct status is asserted here rather than
    // excused in a comment.
    ['401: $498.50 on a $999.00 rent is 1.996 weeks, absorbed as the 2 whole weeks stated',
      near(u401.weekly, 249.75) && near(u401.upfrontTotal, 498.50) &&
      near(u401.upfrontWeeks, 1.996, 0.001) && u401.upfrontWhole === true &&
      u401.expectedUpfrontWeeks === 2 && near(u401.expectedUpfrontDollars, 499.50) &&
      u401.upfrontOk === true && u401.status === 'match'],
    ['401: nothing is flagged on it', U('401').bad === 0 && U('401').warn === 0],

    // ======================= payments are never free rent ================
    // Real payment lines that read like concessions: 401's "Prorate move in
    // paymetn" $500.00 and "Prorate move in payment" $152.91, 402's "Move in
    // prorate payment" $301.23, 104's "MI Payment Sept prorate & Oct rent"
    // $351.34, 203's "Prorate/admin fee move in payment" $885.60.
    ['No payment line anywhere is counted as a concession, an instalment or a waiver',
      allKeptDescriptions.length > 0 && !allKeptDescriptions.some(d => PAYMENT_RE.test(d))],
    ['401: the $500.00 "Prorate move in paymetn" stays out of the total ($498.50, not $998.50)',
      near(u401.upfrontTotal, 498.50) && u401.upfrontItems.length === 1],
    ['402: the $301.23 "Move in prorate payment" stays out too', near(u402.upfrontTotal, 1891.50)],

    // ======================= the lease is authoritative ===================
    // Unit 202's own ledger, re-reconciled with a lease on file. The rent
    // roll says $1,124.00 (-> $281.00/wk -> the $1,686.00 credited is 6
    // weeks). Give the lease a rent of $1,348.80 -> $1,348.80 / 4 = $337.20
    // a week, and the same $1,686.00 is $1,686.00 / $337.20 = 5.000 weeks --
    // a different answer, proving the lease drove the math.
    ['Lease present: its rent is used, not the rent roll\'s',
      near(leaseRun.whole.entryRent, 1348.80) && leaseRun.whole.leaseMissing === false &&
      leaseRun.whole.rentSource === 'lease' && near(leaseRun.whole.weekly, 337.20)],
    // CHANGED BY SPEC (A): was near(leaseRun.whole.totalWeeks, 5).
    ['Lease present: the same $1,686.00 credit is now 5 weeks, not 6',
      near(leaseRun.whole.upfrontTotal, 1686) && near(leaseRun.whole.upfrontWeeks, 5, 0.0005) &&
      leaseRun.whole.upfrontWhole === true && near(leaseRun.whole.actualTotalWeeks, 5, 0.0005)],
    // 5 whole weeks against the ledger's stated 6, with nothing prorated.
    // CHANGED BY SPEC (A): was statedWeeks === 6, the 'variance' key, and a
    // finding worded "$337.20 of the stated concession". The six weeks the
    // ledger states is now priced at the LEASE's week -- 6 x $337.20 =
    // $2,023.20 expected against the $1,686.00 credited, i.e. the same one
    // week ($337.20) short, attributed to the up-front half.
    ['Lease present: 5 against the stated 6 is reported as a shortfall of $337.20',
      leaseRun.whole.expectedUpfrontWeeks === 6 && near(leaseRun.whole.expectedUpfrontDollars, 2023.20) &&
      leaseRun.whole.upfrontOk === false && leaseRun.whole.status === 'mismatch' &&
      leaseRun.whole.bad.join(',') === 'upfront' &&
      /\$2,023\.20 at \$337\.20\/week/.test(leaseRun.whole.issueText) &&
      /\$1,686\.00 was credited — \$337\.20 short/.test(leaseRun.whole.issueText)],
    // The lease's own dates (09 Jan 2026 - 15 Dec 2026) are 11.2 months,
    // which leaseTermMonths() rounds to 11.
    ['Lease present: the lease term is used and named as the lease\'s',
      leaseRun.whole.termMonths === 11 && leaseRun.whole.termSource === 'the lease'],
    // CHANGED BY SPEC (E): the lease-vs-rent-roll RENT CHECK is gone -- there
    // is no entry.rentMismatch and no "Rent" column. The disagreement is not
    // swallowed, though: it is carried on entry.rentDisagrees and printed as a
    // note on the "Monthly rent used for the math" fact tile, saying which
    // figure won and why. This lease says $1,348.80; the rent roll says
    // $1,124.00. (Replaces the retired test_issue_filter/rent-check coverage.)
    ['Lease disagreeing with the rent roll is surfaced as a note on the rent fact tile, not as a separate check',
      !!leaseRun.whole.rentDisagrees &&
      near(leaseRun.whole.rentDisagrees.leaseRent, 1348.80) &&
      near(leaseRun.whole.rentDisagrees.rentRollRent, 1124) &&
      /Monthly rent used for the math/.test(leaseRun.whole.detail) &&
      /The rent roll shows \$1,124\.00 — the lease is the binding document, so its figure is used\./.test(leaseRun.whole.detail)],
    ['...and with no lease uploaded there is no disagreement to report on any unit',
      run.rentDisagreesAllNull === true],
    // A lease rent of $1,281.00 -> $320.25/wk, and $1,686.00 / $320.25 =
    // 5.2646 weeks, which is not a whole number of weeks at all.
    // CHANGED BY SPEC (A): the finding text changed with it. A stated deal
    // now always prices the expectation, so the message is the expected-vs-
    // credited one (6 x $320.25 = $1,921.50 vs $1,686.00 = $235.50 short)
    // rather than "5.26 weeks — not a whole number of weeks". The fractional
    // week itself is still asserted, on upfrontWhole.
    ['Lease rent that makes the credit a fraction of a week is flagged as such',
      near(leaseRun.notWhole.weekly, 320.25) && near(leaseRun.notWhole.upfrontWeeks, 5.2646, 0.001) &&
      leaseRun.notWhole.upfrontWhole === false && leaseRun.notWhole.status === 'mismatch' &&
      leaseRun.notWhole.upfrontOk === false &&
      leaseRun.notWhole.bad.indexOf('upfront') !== -1 &&
      near(leaseRun.notWhole.expectedUpfrontDollars, 1921.50) &&
      /\$1,686\.00 was credited — \$235\.50 short/.test(leaseRun.notWhole.issueText)],
    // The real archive has no leases in it, so every unit above must say so.
    ['With no lease uploaded, every unit falls back to the rent roll and says so',
      Object.values(run.units).every(v => v.leaseMissing === true) &&
      Object.values(run.units).filter(v => v.d).every(v => v.d.rentSource === 'rent roll')],

    // ======================= silence and scope ============================
    ['406: a unit with no concession line stays completely silent',
      U('406').has === false && U('406').bad === 0 && U('406').warn === 0 && U('406').waiversOnly === null],
    ['No unit without a concession credit was given one',
      Object.entries(run.units).filter(([u,v]) => v.has).map(([u])=>u).sort().join(',') ===
      ['104','201','202','203','205','208','302','305','308','401','402','404','405'].join(',')],
    // 201 $1,178.00 = 4 wks at $294.50; 404 $1,153.00 + $576.50 = $1,729.50
    // = 6 wks at $288.25. Both clean, both silent.
    ['The clean units stay clean: 201 is 4 whole weeks and 404 is 6, neither flagged',
      near(u201.upfrontWeeks, 4, 0.0005) && u201.status === 'match' && U('201').bad === 0 &&
      near(u404.upfrontTotal, 1729.50) && near(u404.upfrontWeeks, 6, 0.0005) && u404.status === 'match' && U('404').bad === 0],
    // CHANGED BY SPEC (A): every unit must now expose the EXPECTED side too,
    // and proratedVerdict must be one of the five words the spec names.
    ['Every unit with a concession exposes the up-front / prorated / total breakdown the spec calls for',
      Object.values(run.units).filter(v => v.has).every(v => v.d &&
        v.d.upfrontTotal != null && v.d.upfrontItems != null && v.d.weekly != null &&
        v.d.rentSource != null && Array.isArray(v.d.proratedTried) &&
        v.d.actualTotalWeeks != null &&
        ['none','match','schedule','unknown','mismatch'].indexOf(v.d.proratedVerdict) !== -1 &&
        ['none','rent roll','ledger','derived'].indexOf(v.d.proratedWeeksSource) !== -1 &&
        ['match','review','mismatch','unknown'].indexOf(v.d.status) !== -1)],
    ['The retired single-axis fields (stated / totalWeeks / reconciles / softenedProrate ...) are gone from every unit, not merely unread',
      Object.values(run.units).filter(v => v.d).length > 0 &&
      Object.values(run.units).filter(v => v.d).every(v => v.d.deadFields.length === 0)],
    // CHANGED BY SPEC (F): "Free rent spread over the lease" was renamed
    // "Free rent prorated over the lease", and "Lease term used" / "Monthly
    // rent used" stopped being table rows -- they are fact tiles above the
    // table now (asserted in test_concession_ui.cjs). Asserted as the WHOLE
    // list, in order, so a row silently reappearing fails this.
    ['The detail rows are up front / prorated over the lease / total, then reversals',
      (U('104').rowItems||[]).join(' | ') ===
        'Free rent taken up front | Free rent prorated over the lease | Total concession | Reversals netted out'],
    ['A unit with no reversals and no waivers gets exactly the three core rows and nothing else',
      (U('203').rowItems||[]).join(' | ') ===
        'Free rent taken up front | Free rent prorated over the lease | Total concession'],
    ['402 also gets an explicit "reversals netted out" and "fee waivers" row',
      (U('402').rowItems||[]).some(i=>/Reversals netted out/.test(i)) &&
      (U('402').rowItems||[]).some(i=>/Fee waivers/.test(i))],

    // The rent-roll-vs-ledger recurring charge audit is gone from this tool.
    ['No unit carries the removed recurring-charges audit any more', run.chargesGone === true],
    // CHANGED BY SPEC (E): was "Only concessions and rent are filterable issue
    // types now" (run.filterableIssueTypes === 'concession,rent'). Option
    // Filters were removed from this tool entirely -- with only one thing
    // checked there is nothing to switch off -- so the assertion becomes that
    // none of the machinery survives anywhere: symbols, the panel, the
    // checkboxes, the KPI tile, or the per-entry hidden bookkeeping.
    ['Option Filters are gone from this tool entirely -- no symbols, no panel, no checkboxes, no hidden counters',
      run.filtersGone === true],
    // CHANGED BY SPEC (E): the lease-vs-rent-roll rent check went with them.
    ['The rent check is gone too -- no entry.rentMismatch, no chargeCellState, no "charges" sort key',
      run.rentCheckGone === true],

    ['Run completed', run.status === 'Done.'],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks){
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  await page.evaluate(() => localStorage.clear());
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
