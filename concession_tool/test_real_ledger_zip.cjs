/* Resident ledgers as PDFs, run against the REAL property export.
   ---------------------------------------------------------------
   ResMan exports resident ledgers as PDFs: the real archive in ./real
   ("BOA Resident Ledgers 08-14-2026.zip") contains 58 PDFs and not one
   spreadsheet, which is why a tool that only accepted .xlsx found zero
   ledgers in it. This exercises the whole path on that archive and on the
   real rent roll that goes with it -- no fixtures, no synthetic ledgers.

   What the numbers below were checked against (independently, with
   pdftotext, before being asserted here):
     - the archive holds 58 PDFs: 57 per-resident ledgers plus one 184-page
       combined "every resident" ledger
     - the rent roll lists 30 units (101-106, 201-208, 301-308, 401-408), of
       which 5 are vacant (101, 103, 304, 307, 403) and 25 are occupied
     - every occupied unit has exactly one ledger whose Lease Status is not
       "Former", and that resident is the one the rent roll names
     - unit 406 (John Lane) is a 4-page ledger with 128 rows in its "Charges
       and Payments" table (25 of them Rent) and 1 row in its "Deposits"
       table (Security Deposit, 1,000.00)
*/
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fflate = require('fflate');

const HERE = __dirname;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LEDGER_ZIP = path.resolve(HERE, 'real/BOA Resident Ledgers 08-14-2026.zip');
const RENT_ROLL = path.resolve(HERE, 'real/BOA 2026.14- Rent Roll.xlsx');
const ONE_LEDGER = '/tmp/real_406_john_lane.pdf';
const COMBINED_ZIP = '/tmp/real_combined_only.zip';

// The rent roll's own unit list, and the 5 it shows as vacant.
const RENT_ROLL_UNITS = ['101','102','103','104','105','106','201','202','203','204','205','206','207','208',
  '301','302','303','304','305','306','307','308','401','402','403','404','405','406','407','408'];
const VACANT_UNITS = ['101','103','304','307','403'];
const OCCUPIED_UNITS = RENT_ROLL_UNITS.filter(u => VACANT_UNITS.indexOf(u) === -1); // 25
// unit -> the ledger PDF for the resident living there today, i.e. the only
// one of that unit's ledgers whose own "Lease Status" is not "Former"
// (checked against all 57 ledgers with pdftotext -- every occupied unit has
// exactly one). Note 207: the current resident has two ledgers of her own
// (an earlier lease and the current one), so the file name alone isn't
// enough there -- the ledger's own dates/status have to decide it.
const CURRENT_LEDGER_FILE = {
  '102':'102 - Kenton Brake.pdf','104':'104 - Elysee Maykelson.pdf','105':'105 - Nancy Flagle.pdf',
  '106':'106 - Hunter Haynes.pdf','201':'201 - John Maass.pdf','202':'202 - Jeremy Gervais.pdf',
  '203':'203 - Stephen Castaneda.pdf','204':'204 - Rosemary Adame.pdf','205':'205 - Darren Skelly.pdf',
  '206':'206 - Bradley Spillar.pdf','207':'207 - Cathy Brown 1.pdf','208':'208 - Emily Nations.pdf',
  '301':'301 - Timothy Cheatham.pdf','302':'302 - Jackelynn Pina.pdf','303':'303 - Milton Saltmarsh.pdf',
  '305':'305 - Christina Kersten.pdf','306':'306 - Joseph Owen.pdf','308':'308 - Jack Jacquez.pdf',
  '401':'401 - Jaclyn VanWyngarden.pdf','402':'402 - Richard Rhoades.pdf','404':'404 - Gavin Miles.pdf',
  '405':'405 - Nathan Shea.pdf','406':'406 - John Lane.pdf','407':'407 - Hayden Goff.pdf',
  '408':'408 - Tameka Cuellar.pdf',
};
// unit -> the resident the rent roll says lives there today. (Two ledgers
// spell their resident's name differently from the rent roll -- "Tina
// Kersten" for Christina Kersten, "Joe Owen" for Joseph Owen -- which is
// exactly why the ledger's own status/dates have to back the name up.)
const CURRENT_RESIDENT = {
  '102':'Kenton Brake','104':'Elysee Maykelson','105':'Nancy Flagle','106':'Hunter Haynes',
  '201':'John Maass','202':'Jeremy Gervais','203':'Stephen Castaneda','204':'Rosemary Adame',
  '205':'Darren Skelly','206':'Bradley Spillar','207':'Cathy Brown','208':'Emily Nations',
  '301':'Timothy Cheatham','302':'Jackelynn Pina','303':'Milton Saltmarsh','305':'Christina Kersten',
  '306':'Joseph Owen','308':'Jack Jacquez','401':'Jaclyn VanWyngarden','402':'Richard Rhoades',
  '404':'Gavin Miles','405':'Nathan Shea','406':'John Lane','407':'Hayden Goff','408':'Tameka Cuellar',
};

function unzipEntry(zipPath, entryName){
  const files = fflate.unzipSync(new Uint8Array(fs.readFileSync(zipPath)), {
    filter: f => f.name === entryName,
  });
  if (!files[entryName]) throw new Error('entry not found in archive: ' + entryName);
  return Buffer.from(files[entryName]);
}

(async () => {
  // Both extra fixtures come straight out of the real archive -- nothing is
  // synthesised for this test.
  fs.writeFileSync(ONE_LEDGER, unzipEntry(LEDGER_ZIP, '406 - John Lane.pdf'));
  fs.writeFileSync(COMBINED_ZIP, Buffer.from(fflate.zipSync(
    {'BOA Resident Ledgers.pdf': new Uint8Array(unzipEntry(LEDGER_ZIP, 'BOA Resident Ledgers.pdf'))}, {level:0})));

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html'));
  await page.evaluate(() => localStorage.removeItem('leaseproof_concession_hidden_issue_types'));
  await page.reload();

  const readRun = () => page.evaluate(() => {
    const groups = {};
    for (const [k, g] of cachedLedgerByUnit.entries()) groups[k] = g.map(x => x.filename);
    const iso = d => d ? new Date(d).toISOString().slice(0,10) : null;
    return {
      status: document.getElementById('parse-status').textContent,
      summary: document.getElementById('zip-summary').textContent,
      summaryBad: document.getElementById('zip-summary').classList.contains('bad'),
      rentRollUnits: [...cachedAllUnitBlocks.keys()],
      groups,
      failed: (cachedLedgerFailed || []).map(f => f.filename + ': ' + f.error),
      vacant: vacantUnitCount,
      entries: unitEntries.map(e => ({
        unit: e.unit, cat: e.category, residents: e.residents,
        files: e.filenames || [], pickReason: e.ledgerPickReason || '', pickedFile: e.ledgerFilename || null,
        ledger: e.ledger ? {
          unit: e.ledger.unit, residents: e.ledger.residents,
          moveInDate: iso(e.ledger.moveInDate), leaseStart: iso(e.ledger.leaseStart), leaseEnd: iso(e.ledger.leaseEnd),
          txCount: e.ledger.transactions.length,
          depositCount: (e.ledger.deposits || []).length,
          deposits: (e.ledger.deposits || []).map(d => [d.description, d.paidIn, d.paidOut]),
          tx: e.ledger.transactions.map(t => [iso(t.date), t.description, t.charge, t.credit]),
        } : null,
      })),
    };
  });

  // === Run 1: the real ledgers ZIP + the real rent roll ===
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', LEDGER_ZIP);
  await page.setInputFiles('#rentroll-file', RENT_ROLL);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 600000});
  await page.waitForTimeout(300);
  const zipRun = await readRun();

  const entryFor = (run, unit) => run.entries.find(e => e.unit === unit);
  const e406 = entryFor(zipRun, '406');
  const led406 = e406 && e406.ledger;
  const has406 = (desc, charge) => !!(led406 && led406.tx.some(t => t[1] === desc && Math.abs(t[2] - charge) < 0.005));

  // === Run 2: one ledger PDF picked individually (not via a ZIP) ===
  await page.evaluate(() => setUploadMode('individual'));
  await page.setInputFiles('#ledger-files', ONE_LEDGER);
  await page.setInputFiles('#rentroll-file', RENT_ROLL);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 120000});
  await page.waitForTimeout(200);
  const singleRun = await readRun();
  const single406 = entryFor(singleRun, '406');

  // === Run 3: a ZIP holding only ResMan's combined "all residents" PDF ===
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', COMBINED_ZIP);
  await page.setInputFiles('#rentroll-file', RENT_ROLL);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 600000});
  await page.waitForTimeout(300);
  const combinedRun = await readRun();

  console.log('=== ZIP run summary ===', zipRun.summary);
  console.log('rent roll units:', zipRun.rentRollUnits.length, '| entries:', zipRun.entries.length, '| vacant:', zipRun.vacant, '| failed:', zipRun.failed);
  console.log('406 ledger:', JSON.stringify({unit:led406&&led406.unit, residents:led406&&led406.residents,
    moveIn:led406&&led406.moveInDate, start:led406&&led406.leaseStart, end:led406&&led406.leaseEnd,
    tx:led406&&led406.txCount, deposits:led406&&led406.deposits}));
  console.log('208 pick:', JSON.stringify(entryFor(zipRun,'208') && {files: entryFor(zipRun,'208').files, res: entryFor(zipRun,'208').ledger.residents}));
  console.log('=== combined-only run summary ===', combinedRun.summary);

  const groupKeys = Object.keys(zipRun.groups);
  // The pick is right if it's the ledger of the resident who hasn't moved out
  // -- identified by file, which carries the unit and the rent roll's own
  // spelling of the resident's name.
  const wrongPicks = OCCUPIED_UNITS.filter(u => {
    const e = entryFor(zipRun, u);
    return !e || !e.ledger || e.pickedFile !== CURRENT_LEDGER_FILE[u];
  });
  const nameMatchedPicks = OCCUPIED_UNITS.filter(u => {
    const e = entryFor(zipRun, u);
    return e && e.ledger && e.ledger.residents === CURRENT_RESIDENT[u];
  });
  const dateOnly = s => s;

  const checks = [
    ['The real 58-PDF ledgers ZIP is read at all — every unit on the rent roll that has a ledger gets one (0 read failures)',
      zipRun.status === 'Done.' && zipRun.failed.length === 0 && groupKeys.length === RENT_ROLL_UNITS.length],
    ['Every ledger is filed under a unit that really is on the rent roll (30 units, no invented ones)',
      zipRun.rentRollUnits.length === 30 && groupKeys.every(k => zipRun.rentRollUnits.indexOf(k) !== -1) &&
      RENT_ROLL_UNITS.every(u => groupKeys.indexOf(u) !== -1)],
    ['The 25 occupied units are all checked, and the 5 vacant ones are skipped rather than reported',
      zipRun.entries.length === 25 && zipRun.vacant === 5 &&
      OCCUPIED_UNITS.every(u => !!entryFor(zipRun, u)) &&
      VACANT_UNITS.every(u => !entryFor(zipRun, u))],
    ['The ZIP summary says it found PDFs (not "no spreadsheets") and how many matched',
      /58 PDFs found/.test(zipRun.summary) && /matched to a rent roll unit/.test(zipRun.summary) && zipRun.summaryBad === false],
    ['Unit 406 parses its identity block: unit, resident and the three lease/move-in dates',
      !!led406 && led406.unit === '406' && led406.residents === 'John Lane' &&
      led406.moveInDate === '2024-07-20' && led406.leaseStart === '2025-07-22' && led406.leaseEnd === '2026-07-20'],
    ['Unit 406\'s transactions include the real Rent 1,499.00, Pest Control Fees 8.00 and Trash Service Fee 12.00 lines',
      has406('Rent', 1499) && has406('Pest Control Fees', 8) && has406('Trash Service Fee', 12)],
    ['Unit 406\'s row count matches the real ledger exactly (128 charge rows, 25 of them Rent)',
      !!led406 && led406.txCount === 128 && led406.tx.filter(t => t[1] === 'Rent').length === 25],
    ['The Deposits table\'s "Security Deposit 1,000.00" is NOT mixed into the charge/credit transactions',
      !!led406 && !led406.tx.some(t => /security deposit/i.test(t[1])) &&
      !led406.tx.some(t => Math.abs(t[2] - 1000) < 0.005 || Math.abs(t[3] - 1000) < 0.005)],
    ['...but it is still read, kept separately as a deposit (Paid In 1,000.00)',
      !!led406 && led406.depositCount === 1 && led406.deposits[0][0] === 'Security Deposit' && led406.deposits[0][1] === 1000],
    ['Multi-page ledgers keep the later pages: 406 is 4 pages and its rows run from 07/2024 through 08/2026',
      !!led406 && dateOnly(led406.tx[0][0]) === '2024-07-31' &&
      led406.tx[led406.tx.length-1][0].slice(0,7) === '2026-08' &&
      // "Month to Month Fee 250.00" only appears on the final page
      led406.tx.some(t => t[1] === 'Month to Month Fee' && Math.abs(t[2]-250) < 0.005 && t[0] === '2026-08-01')],
    ['A unit with four ledgers (208: two former residents, one moved out, one current) resolves to the CURRENT resident',
      (() => { const e = entryFor(zipRun, '208');
        return !!e && e.files.length === 4 && e.ledger.residents === 'Emily Nations' &&
          /Emily Nations/.test(e.pickReason) && e.files.some(f => /Jordan Johns/.test(f)); })()],
    ['Every one of the 25 occupied units resolves to the CURRENT resident\'s ledger, not an arbitrary one',
      wrongPicks.length === 0],
    ['...and on 23 of those the ledger\'s own resident name is the rent roll\'s name exactly (the other 2 use a nickname)',
      nameMatchedPicks.length === 23],
    ['When a unit has several ledgers, the reason for the choice is reported rather than silent',
      zipRun.entries.filter(e => e.files.length > 1).length >= 15 &&
      zipRun.entries.filter(e => e.files.length > 1).every(e => /ledgers were on file/.test(e.pickReason))],
    ['A single ledger PDF selected individually (no ZIP) is read the same way it is inside the ZIP',
      !!single406 && single406.ledger.unit === '406' && single406.ledger.residents === 'John Lane' &&
      single406.ledger.txCount === (led406 ? led406.txCount : -1) &&
      JSON.stringify(single406.ledger.tx) === JSON.stringify(led406 ? led406.tx : null) &&
      singleRun.status === 'Done.' &&
      // the other 24 occupied units simply have no ledger uploaded
      singleRun.entries.filter(e => e.cat === 'missing_ledger').length === 24],
    ['ResMan\'s combined one-PDF-for-every-resident export is read as 57 separate ledgers, not one — same answers as the per-resident PDFs',
      combinedRun.status === 'Done.' && combinedRun.entries.length === 25 &&
      Object.keys(combinedRun.groups).length === 30 &&
      /57 ledgers matched to a rent roll unit/.test(combinedRun.summary) &&
      OCCUPIED_UNITS.every(u => {
        const a = entryFor(combinedRun, u), b = entryFor(zipRun, u);
        return a && b && a.ledger.residents === b.ledger.residents && a.ledger.txCount === b.ledger.txCount;
      })],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks){
    console.log((pass ? 'PASS' : 'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  if (wrongPicks.length) console.log('units whose ledger pick was wrong:', wrongPicks);
  console.log('=== errors ===', errors);
  await browser.close();
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
