/* Results-table polish, mirrored on the LeaseVerify results section:
   sortable column headers (asc -> desc -> back to default, blanks sink,
   aria-sort kept in step), an expandable per-unit detail panel whose colspan
   is DERIVED from the header count rather than hard-coded, a single
   Item / Expected / Actual / Status table inside it, and the project-wide
   status vocabulary (Match / Mismatch / Review -- see STATUS_VOCABULARY.md).

   Runs against the real Blanco Oaks archive so the table has real rows in it.

   CHANGED BY SPEC
   -------------------------------------------------------------------------
   * The "Rent" column is gone (the lease-vs-rent-roll rent check was removed
     from this tool). Six columns now, not seven, and no "charges" sort key.
   * Option Filters are gone entirely, so "Hidden by Filter" is no longer part
     of this tool's vocabulary and there is nothing left to hide. The four
     checks that exercised hiding are re-pointed at the contract they were
     really protecting -- that the badge words are exactly the project
     vocabulary, that the Status cell is the plain category word and never
     "N problems", and that no finding is ever suppressed from the row or the
     detail panel.
   * The detail panel was restructured: the three INPUTS (rent, the week it
     implies, the lease term) are FACT TILES above the table rather than rows
     inside it, and "Free rent spread over the lease" was renamed "Free rent
     prorated over the lease". */
const { chromium } = require('playwright');
const path = require('path');

const HERE = __dirname;
const ZIP = path.join(HERE, 'real/BOA Resident Ledgers 08-14-2026.zip');
const RENTROLL = path.join(HERE, 'real/BOA 2026.14- Rent Roll.xlsx');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', ZIP);
  await page.setInputFiles('#rentroll-file', RENTROLL);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 300000});
  await page.waitForTimeout(400);

  const headerInfo = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#unit-view-shell > table.results > thead > tr > th'));
    return {
      count: ths.length,
      labels: ths.map(th => th.textContent.trim().replace(/\s*\?$/,'')),
      sortable: ths.filter(th => th.classList.contains('sortable')).map(th => th.getAttribute('data-sort')),
      ariaInitial: ths.filter(th => th.classList.contains('sortable')).map(th => th.getAttribute('aria-sort')),
      roles: ths.filter(th => th.classList.contains('sortable')).every(th => th.getAttribute('role') === 'button' && th.getAttribute('tabindex') === '0'),
    };
  });
  console.log('=== header ===', JSON.stringify(headerInfo));

  // The unit cell also carries a "N ledgers" sub-line, so read the <b> that
  // holds the unit number itself rather than the whole cell's text.
  const unitsInOrder = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#results-body tr.unit-row td:nth-child(2) b')).map(b => b.textContent.trim()));

  const defaultOrder = await unitsInOrder();

  // ---- Sorting: click 1 = asc, click 2 = desc, click 3 = back to default ----
  const unitTh = '#unit-view-shell th[data-sort="unit"]';
  await page.click(unitTh); await page.waitForTimeout(60);
  const asc = await unitsInOrder();
  const ariaAsc = await page.$eval(unitTh, th => th.getAttribute('aria-sort'));
  const classAsc = await page.$eval(unitTh, th => th.className);
  await page.click(unitTh); await page.waitForTimeout(60);
  const desc = await unitsInOrder();
  const ariaDesc = await page.$eval(unitTh, th => th.getAttribute('aria-sort'));
  await page.click(unitTh); await page.waitForTimeout(60);
  const back = await unitsInOrder();
  const ariaBack = await page.$eval(unitTh, th => th.getAttribute('aria-sort'));

  // Sorting a column where many rows are blank: "Free rent" reads "None" on
  // every unit with no concession, and those must sink either way.
  await page.click('#unit-view-shell th[data-sort="concession"]'); await page.waitForTimeout(60);
  const concAsc = await page.evaluate(() => Array.from(document.querySelectorAll('#results-body tr.unit-row'))
    .map(tr => tr.children[3].textContent.trim()));
  await page.click('#unit-view-shell th[data-sort="concession"]'); await page.waitForTimeout(60);
  const concDesc = await page.evaluate(() => Array.from(document.querySelectorAll('#results-body tr.unit-row'))
    .map(tr => tr.children[3].textContent.trim()));
  await page.click('#unit-view-shell th[data-sort="concession"]'); await page.waitForTimeout(60);

  // Keyboard activation (the headers are exposed as buttons).
  await page.focus('#unit-view-shell th[data-sort="residents"]');
  await page.keyboard.press('Enter'); await page.waitForTimeout(60);
  const ariaKeyboard = await page.$eval('#unit-view-shell th[data-sort="residents"]', th => th.getAttribute('aria-sort'));
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.waitForTimeout(60);

  // ---- Expand / collapse ----
  const rowIndex104 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#results-body tr.unit-row')).findIndex(tr => tr.children[1].textContent.trim().indexOf('104') === 0));
  const expand = async () => {
    await page.evaluate(i => document.querySelectorAll('#results-body tr.unit-row')[i].click(), rowIndex104);
    await page.waitForTimeout(80);
  };
  await expand();
  const opened = await page.evaluate(() => {
    const dr = document.querySelector('#results-body tr.detail-row');
    const td = dr ? dr.querySelector('td') : null;
    const headerCount = document.querySelectorAll('#unit-view-shell > table.results > thead > tr > th').length;
    const table = td ? td.querySelector('table.results') : null;
    return {
      detailRows: document.querySelectorAll('#results-body tr.detail-row').length,
      colSpan: td ? td.colSpan : null,
      headerCount,
      // The detail cell must really span the whole table, not just look like it.
      spansFullWidth: (() => {
        if (!td) return false;
        const shell = document.querySelector('#unit-view-shell > table.results');
        return Math.abs(td.getBoundingClientRect().width - shell.getBoundingClientRect().width) < 2;
      })(),
      detailHeaders: table ? Array.from(table.querySelectorAll(':scope > thead > tr > th')).map(th => th.textContent.trim()) : null,
      // CHANGED BY SPEC: the three inputs the math runs on are fact tiles now,
      // not table rows. Read structurally rather than by grepping the panel's
      // text -- the words "lease term" also occur inside a rent roll line
      // quoted in a row note, so a text match would still pass with the tile
      // deleted.
      factTiles: td ? Array.from(td.querySelectorAll('.fact-grid > .fact-tile')).map(t => ({
        label: t.querySelector('.fact-label').textContent.trim(),
        val: t.querySelector('.fact-val').textContent.trim().replace(/\s+/g, ' '),
      })) : null,
      detailRowCount: table ? table.querySelectorAll(':scope > tbody > tr').length : 0,
      firstItems: table ? Array.from(table.querySelectorAll(':scope > tbody > tr > td:first-child b')).map(b => b.textContent.trim()) : [],
      badges: table ? Array.from(table.querySelectorAll(':scope > tbody .badge')).map(b => b.textContent.trim()) : [],
      everyRowHasFourCells: table ? Array.from(table.querySelectorAll(':scope > tbody > tr')).every(tr => tr.children.length === 4) : false,
      everyRowHasABadge: table ? Array.from(table.querySelectorAll(':scope > tbody > tr')).every(tr => !!tr.querySelector('.badge')) : false,
    };
  });
  console.log('=== detail ===', JSON.stringify(opened, null, 1));

  const detailText = await page.evaluate(() => document.querySelector('#results-body tr.detail-row').innerText);
  await expand();  // collapse again
  const closed = await page.evaluate(() => document.querySelectorAll('#results-body tr.detail-row').length);

  // ---- Badge vocabulary across the whole table ----
  const vocab = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('#results-body tr.unit-row td:nth-child(4) .badge, #results-body tr.unit-row td:nth-child(5) .badge')
      .forEach(b => set.add(b.textContent.trim()));
    return Array.from(set).sort();
  });
  console.log('=== row badge vocabulary ===', JSON.stringify(vocab));

  // ---- CHANGED BY SPEC: nothing is hidden any more, so what is checked is
  // that nothing is hidden. Option Filters were removed from this tool
  // (there is one check, so switching it off would switch the tool off), and
  // with them "Hidden by Filter" left this tool's vocabulary. The four
  // assertions that used to exercise hiding now assert the contract they were
  // protecting: every finding a unit has is on its row AND in its detail, the
  // Status cell is the plain category word, and none of the banned synonyms
  // for "wrong" appear anywhere in the results card.
  const surfaced = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#results-body tr.unit-row'));
    const cellsFor = u => {
      const tr = rows.find(r => r.children[1].textContent.trim().indexOf(u) === 0);
      return tr ? {concession: tr.children[3].textContent.trim(), status: tr.children[4].textContent.trim(),
                   found: tr.children[5].textContent.trim()} : null;
    };
    const ent = u => {
      const e = unitEntries.find(x => x.unit === u);
      return {cat: e.category, problems: e.problemCount,
              bad: e.concession.issues.filter(i=>i.severity==='bad').map(i=>i.text),
              warn: e.concession.issues.filter(i=>i.severity==='warn').map(i=>i.text),
              detail: buildDetail(e)};
    };
    return {
      // 104 is the archive's prorate mismatch; 405 its up-front shortfall;
      // 203 a Review; 202 a clean Match.
      cells: {u104: cellsFor('104'), u405: cellsFor('405'), u203: cellsFor('203'), u202: cellsFor('202')},
      e104: ent('104'), e405: ent('405'), e203: ent('203'),
      // The whole results card, for the banned-vocabulary sweep.
      // CHANGED BY SPEC: a unit with no concession at all now gets a single
      // detail row badged Match, not Info. Having no concession is not a
      // problem and not a thing the tool was unable to check -- it was
      // checked, and there is nothing there. 102 (fee waiver only) and 406
      // (nothing at all) are the archive's two flavours of it.
      noConcession: ['102','406'].map(u => {
        const e = unitEntries.find(x => x.unit === u);
        if (!e) return {unit: u, missing: true};
        const html = buildDetail(e);
        const doc = new DOMParser().parseFromString('<table>' + (html.match(/<tbody>[\s\S]*<\/tbody>/) || [''])[0] + '</table>', 'text/html');
        return {unit: u, cell: concessionCellState(e), cat: e.category,
                rows: Array.from(doc.querySelectorAll('tbody > tr')).map(tr =>
                  tr.children[0].querySelector('b').textContent.trim() + '|' + tr.children[3].textContent.trim())};
      }),
      cardText: document.getElementById('unit-view-shell').innerText +
                ' ' + document.getElementById('kpi-row').innerText +
                ' ' + document.getElementById('filter-tabs').innerText,
      // None of the filter machinery may survive.
      filterMachinery: {
        panel: !!document.getElementById('issue-filter-panel'),
        checkboxes: document.querySelectorAll('input[data-issue-key]').length,
        kpiTile: !!document.querySelector('.kpi-tile.hidden-filter'),
        symbols: typeof FILTERABLE_ISSUE_TYPES !== 'undefined' || typeof HIDDEN_ISSUE_TYPES !== 'undefined' ||
                 typeof isIssueTypeHidden !== 'undefined' || typeof renderIssueFilterPanel !== 'undefined',
        entryFields: unitEntries.some(e => e.concessionHiddenByFilter !== undefined || e.hiddenProblemCount !== undefined),
        cellStateHidden: unitEntries.some(e => concessionCellState(e) === 'hidden') || 'hidden' in CONCESSION_RANK,
      },
    };
  });
  console.log('=== surfaced ===', JSON.stringify({cells: surfaced.cells, machinery: surfaced.filterMachinery,
    e104: {cat: surfaced.e104.cat, bad: surfaced.e104.bad.length}, e203: {cat: surfaced.e203.cat, warn: surfaced.e203.warn.length}}, null, 1));

  // Every one of the seven allowed words, and every banned synonym for them.
  const ALLOWED_BADGES = ['Match','Mismatch','Review','Unable to verify','Info','—'];
  const BANNED = [/Needs attention/i, /Discrepanc/i, /\d+\s+problems?\b/i, /\bFlagged\b/,
                  /All good/i, /\bClean\b/i, /Double-check/i, /Hidden by Filter/i, /Hidden by your filters/i];

  // ---- The rest of the results card is untouched ----
  const shell = await page.evaluate(() => ({
    kpis: document.querySelectorAll('#kpi-row .kpi-tile').length,
    kpiLabels: Array.from(document.querySelectorAll('#kpi-row .kpi-tile span')).map(s => s.textContent.trim()),
    tabs: Array.from(document.querySelectorAll('#filter-tabs .tab')).map(t => t.dataset.filter),
    tabLabels: Array.from(document.querySelectorAll('#filter-tabs .tab')).map(t => t.textContent.replace(/\d+$/, '').trim()),
    exports: ['export-csv-btn','export-xlsx-btn','export-pdf-btn'].map(id => !!document.getElementById(id)),
    exportLabels: ['export-csv-btn','export-xlsx-btn'].map(id => document.getElementById(id).textContent.trim()),
  }));
  console.log('=== shell ===', JSON.stringify(shell));

  // Filter tabs still narrow the table.
  await page.click('#filter-tabs .tab[data-filter="clean"]');
  await page.waitForTimeout(120);
  // CHANGED BY SPEC: the Status cell moved from the 6th column to the 5th
  // when the "Rent" column was dropped, and its word changed from
  // "✓ All good" to "Match".
  const cleanOnly = await page.evaluate(() => ({
    rows: document.querySelectorAll('#results-body tr.unit-row').length,
    allClean: Array.from(document.querySelectorAll('#results-body tr.unit-row td:nth-child(5)')).every(td => td.textContent.trim() === 'Match'),
  }));
  await page.click('#filter-tabs .tab[data-filter="all"]');
  await page.waitForTimeout(120);

  const sortedAsc = defaultOrder.slice().sort((a,b)=>String(a).localeCompare(String(b), undefined, {numeric:true}));

  const checks = [
    // CHANGED BY SPEC: the "Rent" column is gone. It carried the
    // lease-vs-rent-roll base-rent check, which was removed from this tool --
    // a rent disagreement is now a NOTE on the "Monthly rent used for the
    // math" fact tile in the detail panel (entry.rentDisagrees), not a column
    // and not a finding. Seven columns became six, and the "charges" sort key
    // went with it.
    ['The results table is Details / Unit / Resident / Free rent / Status / What we found',
      headerInfo.count === 6 &&
      headerInfo.labels.join(' | ') === 'Details | Unit | Resident | Free rent | Status | What we found'],
    ['Five of the six headers are sortable, with data-sort keys',
      headerInfo.sortable.join(',') === 'unit,residents,concession,status,issues'],
    ['Sortable headers are exposed as keyboard-operable buttons with aria-sort',
      headerInfo.roles === true && headerInfo.ariaInitial.every(v => v === 'none')],
    ['First click sorts ascending by unit number', asc.join(',') === sortedAsc.join(',') && asc.join(',') !== defaultOrder.join(',')],
    ['...and says so via aria-sort + a sorted-asc class', ariaAsc === 'ascending' && /sorted-asc/.test(classAsc)],
    ['Second click reverses it', desc.join(',') === sortedAsc.slice().reverse().join(',') && ariaDesc === 'descending'],
    ['Third click restores the default (problems-first) order', back.join(',') === defaultOrder.join(',') && ariaBack === 'none'],
    ['Enter on a focused header sorts it too', ariaKeyboard === 'ascending'],
    ['Blank cells sink to the bottom in BOTH directions rather than filling the top',
      concAsc.length > 0 && concDesc.length > 0 &&
      concAsc[concAsc.length-1] === 'None' && concDesc[concDesc.length-1] === 'None' &&
      concAsc[0] !== 'None' && concDesc[0] !== 'None'],

    ['Clicking a row opens exactly one detail panel', opened.detailRows === 1],
    ['The detail cell\'s colspan is derived from the real header count, not hard-coded',
      opened.colSpan === opened.headerCount && opened.colSpan === headerInfo.count],
    ['...and it genuinely spans the full table width', opened.spansFullWidth === true],
    ['Clicking again collapses it', closed === 0],

    ['Inside the detail is one Item / Expected / Actual / Status table',
      (opened.detailHeaders||[]).join(' / ') === 'Item / Expected / Actual / Status'],
    // CHANGED BY SPEC: was detailRowCount > 4. Unit 104's panel is now exactly
    // four rows (the three core ones plus its reversal), because the term and
    // rent rows became fact tiles. Asserted as an exact count so a row
    // quietly appearing or vanishing fails here.
    ['Every row in it has all four cells and a status badge',
      opened.detailRowCount === 4 && opened.everyRowHasFourCells === true && opened.everyRowHasABadge === true],
    // CHANGED BY SPEC: two changes since the last revision.
    //   * "Free rent spread over the lease" was renamed "Free rent prorated
    //     over the lease" -- the ledgers and rent roll say "prorated", so the
    //     panel says it too.
    //   * "Lease term used" and "Monthly rent used" are no longer rows. They
    //     are INPUTS to the math, not pass/fail checks, so they moved into the
    //     fact tiles above the table (asserted separately below).
    ['It states what was checked, line by line, in the order the math is done',
      opened.firstItems.join(' | ') ===
        'Free rent taken up front | Free rent prorated over the lease | Total concession | Reversals netted out'],
    // CHANGED BY SPEC: "Hidden by Filter" left this tool's vocabulary with
    // Option Filters. The allowed set is now exactly the words in
    // STATUS_VOCABULARY.md that a detail row can carry.
    ['The detail uses the project status vocabulary',
      opened.badges.length > 0 && opened.badges.every(b => ['Match','Mismatch','Review','Info','Unable to verify'].indexOf(b) !== -1) &&
      opened.badges.indexOf('Mismatch') !== -1 && opened.badges.indexOf('Match') !== -1],
    // Unit 104's numbers, all readable off the fixtures: rent roll rent
    // $1,182.00 -> $1,182 / 4 = $295.50 a week; the 11/04/2025 credit of
    // $1,182.00 is 4 weeks; the lease term is 13 months; the ledger states
    // "8 weeks free", which names the WHOLE deal, so 8 - 4 = 4 weeks
    // ($1,182.00) is the prorated half -> $1,182.00 / 13 = $90.92 a month
    // against the $40.73 the rent roll actually credits.
    // CHANGED BY SPEC: three of the six probes moved.
    //   * "$1,182.00 = 4 weeks" is now written "$1,182.00 — 4 weeks" (an em
    //     dash, because the cell reads as a value with its unit, not an
    //     equation).
    //   * The two probes that recited the rejected run-outs ("$40.73/month ×
    //     12 months or 13 months", "1.65 wks over 12 mo / 1.79 wks over 13
    //     mo") are gone: the panel no longer shows its working, it shows what
    //     the deal SHOULD cost per month against what is being credited.
    //   * $1,711.49 was a banned value and is now a correct one -- it is
    //     5.79 weeks x $295.50, i.e. what this unit has ACTUALLY been given,
    //     printed opposite the $2,364.00 it is owed. It is asserted present.
    // $2,182.15 stays banned: it is 8 weeks at the retired calendar rate. So
    // does $272.77, which is that rate itself for this unit ($1,182 x 12/52).
    ['The detail reads as a table of values, not prose paragraphs',
      /\$295\.50 \(rent ÷ 4\)/.test(detailText) &&
      /\$1,182\.00 — 4 weeks/.test(detailText) &&
      /\$90\.92\/month — 4 weeks \(\$1,182\.00\) over 13 months/.test(detailText) &&
      /\$40\.73\/month/.test(detailText) &&
      /13 months/.test(detailText) &&
      /8 weeks free/.test(detailText) &&
      /8 weeks \(\$2,364\.00\)/.test(detailText) && /5\.79 weeks \(\$1,711\.49\)/.test(detailText) &&
      !/\$2,182\.15/.test(detailText) && !/\$272\.77/.test(detailText)],
    // CHANGED BY SPEC: the three INPUTS the math runs on used to be table rows
    // ("Lease term used", "Monthly rent used"). They are fact tiles now,
    // above the Expected/Actual table, because none of them is a pass/fail
    // check. They must still be stated -- moving them must not lose them.
    // Read off the .fact-tile elements themselves, not the panel's text: the
    // phrase "lease term" also appears inside the rent roll line this unit
    // quotes in a row note ("...one month prorated over lease term"), so a
    // text match would still pass with the tile deleted.
    ['The three inputs (rent, the week it implies, the lease term) are stated as fact tiles above the table',
      (opened.factTiles||[]).map(t => t.label).join(' | ') ===
        'Monthly rent used for the math | One week of rent | Lease term' &&
      /^\$1,182\.00\b/.test(opened.factTiles[0].val) &&
      /^\$295\.50 \(rent ÷ 4\)$/.test(opened.factTiles[1].val) &&
      /^13 months \(Sep 30, 2025 – Nov 2, 2026, per the rent roll\)$/.test(opened.factTiles[2].val) &&
      // ...and are no longer duplicated as rows in the table below them.
      opened.firstItems.indexOf('Lease term used') === -1 &&
      opened.firstItems.indexOf('Monthly rent used') === -1 &&
      opened.firstItems.indexOf('Base rent (lease vs. rent roll)') === -1],

    // CHANGED BY SPEC: a unit with no concession used to get an 'info' row
    // ("Info" badge, styled as unable-to-verify). It is a Match now: the tool
    // looked, and there is nothing owed. 102 has only a fee waiver on its
    // ledger; 406 has nothing at all. Both get exactly one row.
    ['A unit with no concession at all gets a single row badged Match, not Info',
      surfaced.noConcession.length === 2 &&
      surfaced.noConcession.every(n => !n.missing && n.cat === 'clean' && n.cell === 'none' &&
        n.rows.length === 1 && n.rows[0] === 'Move-in concession|Match')],

    // CHANGED BY SPEC: "Hidden by Filter" is gone from this tool's vocabulary.
    ['Row badges use the Match / Mismatch / Review vocabulary',
      vocab.every(v => ['Match','Mismatch','Review','No concession','—'].indexOf(v) !== -1) &&
      vocab.indexOf('Match') !== -1 && vocab.indexOf('Mismatch') !== -1 && vocab.indexOf('Review') !== -1],
    // CHANGED BY SPEC: these four checks used to hide the concession issue
    // type and assert that the row said "Hidden by Filter", leaked no detail,
    // and stayed counted in a hidden total. Option Filters are gone, so the
    // subject is gone -- but the contract underneath them is not: a finding
    // must be fully surfaced, never suppressed, and always described with the
    // exact project vocabulary. That is what these four now assert.
    ['Every finding a unit has is on its row AND in its detail panel -- nothing is suppressed anywhere',
      surfaced.e104.bad.length === 1 && surfaced.e405.bad.length === 1 && surfaced.e203.warn.length === 1 &&
      surfaced.cells.u104.found === surfaced.e104.bad[0] &&
      surfaced.cells.u405.found === surfaced.e405.bad[0] &&
      surfaced.cells.u203.found === surfaced.e203.warn[0] &&
      /\$40\.73\/month/.test(surfaced.e104.detail) && /\$90\.92\/month/.test(surfaced.e104.detail)],
    ['The Status cell is the plain category word -- never "⚠ N problems" and never a count',
      surfaced.cells.u104.status === 'Mismatch' && surfaced.cells.u405.status === 'Mismatch' &&
      surfaced.cells.u203.status === 'Review' && surfaced.cells.u202.status === 'Match' &&
      [surfaced.cells.u104, surfaced.cells.u405, surfaced.cells.u203, surfaced.cells.u202]
        .every(c => !/\d/.test(c.status) && !/⚠/.test(c.status))],
    ['No banned synonym for a status appears anywhere in the results card',
      BANNED.every(re => !re.test(surfaced.cardText)) &&
      vocab.every(v => ALLOWED_BADGES.indexOf(v) !== -1 || v === 'No concession')],
    ['None of the Option Filter machinery survives -- no panel, no checkboxes, no KPI tile, no hidden state',
      surfaced.filterMachinery.panel === false && surfaced.filterMachinery.checkboxes === 0 &&
      surfaced.filterMachinery.kpiTile === false && surfaced.filterMachinery.symbols === false &&
      surfaced.filterMachinery.entryFields === false && surfaced.filterMachinery.cellStateHidden === false],

    // CHANGED BY SPEC: was "KPI tiles, filter tabs, Option Filters and all
    // three export buttons still work", with optionFilters === 'concession,rent'.
    // The Option Filter half of that has no subject left, so it is replaced by
    // the vocabulary the surviving chrome must use: KPI tiles read Match and
    // Mismatch, tabs read Mismatch / Review / Match, and the export buttons
    // say "Download mismatch list".
    ['KPI tiles, filter tabs and all three export buttons still work, in the project vocabulary',
      shell.kpis >= 3 && shell.tabs.indexOf('all') !== -1 && shell.exports.every(Boolean) &&
      shell.kpiLabels.indexOf('Match') !== -1 && shell.kpiLabels.indexOf('Mismatch') !== -1 &&
      shell.tabLabels.indexOf('Mismatch') !== -1 && shell.tabLabels.indexOf('Review') !== -1 &&
      shell.tabLabels.indexOf('Match') !== -1 &&
      shell.exportLabels.join(' | ') === 'Download mismatch list (.csv) | Download mismatch list (.xlsx)'],
    ['Filter tabs still narrow the table', cleanOnly.rows > 0 && cleanOnly.allClean === true && cleanOnly.rows < defaultOrder.length],

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
