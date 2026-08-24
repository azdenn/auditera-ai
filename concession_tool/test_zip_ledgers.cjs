// ZIP upload mode, ledgers half: the ledgers ZIP is uploaded as-is and the
// tool has to work out which spreadsheet inside belongs to which rent roll
// unit -- from the folder it's in, its filename, or the "Unit:" field on the
// ledger itself -- without ever inventing a unit that isn't in the rent roll.
// Also covers the junk in a real archive (a stray rent roll copy, macOS
// resource forks, a .txt), a file that looks like a ledger but won't parse
// (must be surfaced, not swallowed), and a ledger for a unit that isn't in
// this property's rent roll (must come out as "Unit not found").
const { chromium } = require('playwright');
const path = require('path');
const { buildLedgerZip, writeZip, read, ledgerWithUnit } = require('./zip_fixtures.cjs');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const HERE = __dirname;
const LEDGER_ZIP = '/tmp/fixture_ledgers.zip';
const EMPTY_ZIP = '/tmp/fixture_empty.zip';

(async () => {
  buildLedgerZip(LEDGER_ZIP);
  // An archive with nothing usable in it at all.
  writeZip(EMPTY_ZIP, {'readme.txt': new Uint8Array(Buffer.from('no spreadsheets here')), 'photos/front.jpg': new Uint8Array([1,2,3])});

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => localStorage.removeItem('leaseproof_concession_hidden_issue_types'));
  await page.reload();

  // --- Run 1: the real-shaped ledgers ZIP ---
  await page.evaluate(() => setUploadMode('zip'));  // chips are hidden now; the prompt is the user path (test_concession_zip_ui.cjs)
  await page.setInputFiles('#ledger-zip-file', LEDGER_ZIP);
  await page.setInputFiles('#rentroll-file', path.resolve(HERE, 'RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 180000});
  await page.waitForTimeout(300);

  const run = await page.evaluate(() => {
    const byKey = {};
    for (const [k, group] of cachedLedgerByUnit.entries()) byKey[k] = group.map(g => g.filename);
    return {
      status: document.getElementById('parse-status').textContent,
      zipSummary: document.getElementById('zip-summary').textContent,
      zipSummaryBad: document.getElementById('zip-summary').classList.contains('bad'),
      ledgerKeys: byKey,
      failed: (cachedLedgerFailed||[]).map(f => f.filename),
      entries: unitEntries.filter(e => ['A109','A105','B106','A110','Z999'].includes(e.unit) || e.category === 'error')
        .map(e => ({unit: e.unit, key: e.unitKey, cat: e.category, files: e.filenames})),
      // Every ledger that landed on a real unit must be a real rent roll unit.
      inventedUnits: Object.keys(byKey).filter(k => !cachedAllUnitBlocks.has(k)),
    };
  });
  console.log(JSON.stringify(run, null, 1));

  const keys = run.ledgerKeys;
  const at = u => keys[u] || [];

  // --- Run 2: a ZIP with nothing usable inside ---
  await page.setInputFiles('#ledger-zip-file', EMPTY_ZIP);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 60000});
  await page.waitForTimeout(200);
  const empty = await page.evaluate(() => ({
    summary: document.getElementById('zip-summary').textContent,
    bad: document.getElementById('zip-summary').classList.contains('bad'),
    ledgerCount: cachedLedgerByUnit.size,
  }));
  console.log('=== empty zip ===', JSON.stringify(empty));

  const checks = [
    ['Prefixed filename in a folder (Ledgers/Ledger_A109_badcharges.xlsx) -> unit A109',
      at('A109').some(f => /Ledger_A109_badcharges/.test(f))],
    ['Unit folder with a generic filename (A105/ledger.xlsx) -> unit A105, even though the ledger\'s own "Unit: 105" is ambiguous between A105 and B105',
      at('A105').some(f => f === 'A105/ledger.xlsx')],
    ['Filename that is just the unit (B106.xlsx) -> unit B106, again with an ambiguous internal unit',
      at('B106').some(f => f === 'B106.xlsx')],
    ['"Unit A110" folder with an unrelated filename -> unit A110',
      at('A110').some(f => f === 'Batch 2/Unit A110/export.xlsx')],
    ['No ledger was filed under a unit that is not in the rent roll (except the deliberate Z999)',
      run.inventedUnits.length === 1 && run.inventedUnits[0] === 'Z999'],
    ['Stray rent roll copy inside the ZIP is skipped quietly (no error entry for it)',
      !run.failed.some(f => /RentRoll/i.test(f)) && !/RentRoll/i.test(run.zipSummary.replace(/Ledgers ZIP/g,''))],
    ['Non-spreadsheet junk (.txt, __MACOSX fork, .DS_Store) never reaches the parser',
      !run.failed.some(f => /notes\.txt|__MACOSX|DS_Store/.test(f))],
    ['A file that looks like a ledger but will not parse IS surfaced (Bad_Ledger.xlsx)',
      run.failed.some(f => /Bad_Ledger/.test(f)) && run.entries.some(e => e.cat === 'error' && e.files.some(f => /Bad_Ledger/.test(f)))],
    ['A ledger whose unit is not in this rent roll comes out as "Unit not found"',
      run.entries.some(e => e.unit === 'Z999' && e.cat === 'unmatched')],
    ['Summary reports what the archive contained', /spreadsheets found/.test(run.zipSummary) && /matched to a rent roll unit/.test(run.zipSummary)],
    ['Summary reports the unmatched ledger and the skipped junk', /matched no unit in the rent roll/.test(run.zipSummary) && /skipped \(not a ledger\)/.test(run.zipSummary)],
    ['Status line still ends at the normal "Done."', run.status === 'Done.'],
    ['A ZIP with nothing usable says so, loudly', empty.bad === true && /no spreadsheets were found/i.test(empty.summary) && empty.ledgerCount === 0],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks){
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
