// ConcessionVerify PDF report ("add pdf download to all tools please").
// Same print-styled-document approach as the other two tools, so the output
// is real vector text with the Auditera AI branding, and light-on-white
// because it gets printed and emailed rather than read on screen.
//
// CHANGED BY SPEC: this ran on the two-ledger fixture set (A109 + A110), which
// produces exactly one flagged unit and no Review units at all. That was
// enough while the coverage question was "does the Option Filter suppress this
// finding from the body"; it is not enough now that filters are gone and the
// question is "does the body account for EVERY flagged unit". A one-unit
// report cannot tell a whole category being dropped from a report that is
// complete. It runs against the real Blanco Oaks archive instead — 2 Mismatch
// (104, 405) and 2 Review (203, 308) — so the completeness checks have
// something to lose.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');
const HERE = __dirname;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', path.join(HERE, 'real/BOA Resident Ledgers 08-14-2026.zip'));
  await page.setInputFiles('#rentroll-file', path.join(HERE, 'real/BOA 2026.14- Rent Roll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout:300000});
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => ({
    hasBtn: !!document.getElementById('export-pdf-btn'),
    btnText: document.getElementById('export-pdf-btn').textContent,
    html: buildConcessionPdfHtml(),
  }));

  // CHANGED BY SPEC: this used to hide the 'concession' issue type via
  // HIDDEN_ISSUE_TYPES and assert that the finding left the report BODY while
  // the count of what had been hidden was still disclosed in the summary --
  // i.e. "the report never understates what was found". Option Filters were
  // removed from this tool entirely (with one check there is nothing to switch
  // off), so nothing can be hidden and the subject of those two assertions is
  // gone. The contract underneath them survives and is what is asserted now:
  // the report body must account for EVERY flagged unit and EVERY finding on
  // them, with the stat tiles agreeing with the table the user is looking at.
  const coverage = await page.evaluate(() => {
    const active = unitEntries.filter(e => e.category !== 'vacant');
    const flagged = active.filter(e => e.category === 'issue' || e.category === 'review');
    return {
      html: buildConcessionPdfHtml(),
      flaggedUnits: flagged.map(e => e.unit),
      // Every finding text the tool holds on a flagged unit -- all of it has
      // to be reachable in the report, not just the headline.
      findingTexts: flagged.flatMap(e => (e.concession && e.concession.issues || []).map(i => i.text)),
      issueCount: active.filter(e => e.category === 'issue').length,
      reviewCount: active.filter(e => e.category === 'review').length,
      cleanCount: active.filter(e => e.category === 'clean').length,
      // No filter machinery may survive to start suppressing things again.
      filtersGone: typeof HIDDEN_ISSUE_TYPES === 'undefined' &&
                   typeof FILTERABLE_ISSUE_TYPES === 'undefined' &&
                   typeof saveHiddenIssueTypes === 'undefined' &&
                   typeof isIssueTypeHidden === 'undefined',
    };
  });

  const rp = await browser.newPage();
  const rerr = [];
  rp.on('pageerror', e => rerr.push(e.message));
  await rp.setContent(info.html, {waitUntil:'load'});
  const out = path.join(HERE, 'concession_report.pdf');
  await rp.pdf({path: out, format:'Letter', printBackground:true});
  const size = fs.statSync(out).size;
  const v = await rp.evaluate(() => ({
    brand: (document.querySelector('.bname')||{}).textContent,
    tool: (document.querySelector('.btag')||{}).textContent,
    h1: (document.querySelector('h1')||{}).textContent,
    stats: document.querySelectorAll('.stat').length,
    units: document.querySelectorAll('section.unit').length,
    items: document.querySelectorAll('section.unit li').length,
    text: document.body.innerText,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  // Rendered so the coverage checks read the same DOM the reader would see,
  // rather than grepping a raw HTML string (which would match text buried in
  // an attribute or a style block).
  const reportText = await rp.evaluate(() => document.body.innerText);
  const reportUnits = await rp.evaluate(() =>
    Array.from(document.querySelectorAll('section.unit .unum')).map(e => e.textContent.trim()));
  const reportItems = await rp.evaluate(() =>
    Array.from(document.querySelectorAll('section.unit li')).map(e => e.textContent.trim()));
  const reportStats = await rp.evaluate(() =>
    Array.from(document.querySelectorAll('.stat')).map(e => e.textContent.trim()));
  console.log(JSON.stringify({btn:info.btnText, ...v, text:undefined,
    flaggedUnits: coverage.flaggedUnits, reportUnits, findingCount: coverage.findingTexts.length,
    itemCount: reportItems.length, size}, null, 1));

  const checks = [
    ['A PDF export button exists', info.hasBtn && /pdf/i.test(info.btnText)],
    ['Report is branded Auditera AI', v.brand === 'Auditera AI'],
    ['Report names the ConcessionVerify tool', /ConcessionVerify/.test(v.tool||'')],
    ['Report has a clear title', /Concession/.test(v.h1||'')],
    ['Report shows summary stats', v.stats >= 3],
    ['Report lists the affected units', v.units > 0],
    ['Report lists the individual findings', v.items > 0],
    // Was /Late Fee|Deposit Waiver/ -- those came from the recurring-charge
    // audit, which no longer exists.
    // CHANGED BY SPEC: was A110's $1,528.58 concession mismatch, the only
    // finding the old two-ledger fixture produced. On the real archive the
    // equivalent named-and-priced findings are unit 104's prorate shortfall
    // ($90.92/mo owed against $40.73 credited) and unit 405's up-front
    // shortfall (6 wks = $2,332.50 owed, $1,555.00 credited, $777.50 short),
    // both asserted down to the dollar so a regression in the concession
    // engine still fails this test.
    ['Report carries the real unit 104 prorate finding, priced',
      /\$90\.92 a month/.test(v.text) && /\$40\.73 a month/.test(v.text) && /13-month lease/.test(v.text)],
    ['Report carries the real unit 405 up-front finding, priced',
      /\$2,332\.50 at \$388\.75\/week/.test(v.text) && /\$777\.50 short/.test(v.text)],
    // Read from the .unum elements: in the rendered text the unit number runs
    // straight into the resident name ("104Elysee Maykelson"), so a \b-anchored
    // regex on the body text would not match it.
    ['Report names the affected units',
      reportUnits.indexOf('104') !== -1 && reportUnits.indexOf('405') !== -1 &&
      reportUnits.indexOf('203') !== -1 && reportUnits.indexOf('308') !== -1],
    ['Report is light-on-white for printing', v.bg === 'rgb(255, 255, 255)' || v.bg === 'rgba(0, 0, 0, 0)'],
    // CHANGED BY SPEC: these two used to be "filtered findings are excluded
    // from the body" and "...but the report discloses that findings were
    // hidden". Nothing can be filtered any more, so the same underlying
    // promise -- the report never understates what was found -- is asserted
    // directly: every flagged unit gets a section, every finding held on those
    // units appears as a bullet, and the summary stats agree with the counts.
    ['Every flagged unit gets a section in the report body -- none is dropped',
      coverage.flaggedUnits.length > 0 &&
      coverage.flaggedUnits.every(u => reportUnits.some(r => r.indexOf(u) !== -1)) &&
      reportUnits.length === coverage.flaggedUnits.length],
    ['Every finding the tool holds on those units is printed, not just the headline',
      coverage.findingTexts.length > 0 &&
      coverage.findingTexts.every(t => reportItems.some(li => li.indexOf(t) !== -1))],
    // The three stat tiles carry the Mismatch / Review / Match counts. They
    // have to agree with the entries the tool holds AND with the number of
    // unit sections printed below them -- that pairing is what makes it
    // impossible for the report to quietly list fewer units than it counted.
    // (The BOA archive: 2 Mismatch, 2 Review, 21 Match, 4 sections.)
    ['The summary stats agree with what the body lists',
      reportStats.length === 3 &&
      reportStats[0].indexOf(String(coverage.issueCount)) === 0 &&
      reportStats[1].indexOf(String(coverage.reviewCount)) === 0 &&
      reportStats[2].indexOf(String(coverage.cleanCount)) === 0 &&
      coverage.issueCount === 2 && coverage.reviewCount === 2 && coverage.cleanCount === 21 &&
      coverage.issueCount + coverage.reviewCount === reportUnits.length],
    ['No Option Filter machinery survives to suppress anything from the report again',
      coverage.filtersGone === true && !/Hidden by filters/i.test(coverage.html)],
    ['Renders to a real PDF', size > 5000],
    ['No script errors', errors.length === 0 && rerr.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  if (!allPass){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
