/* Builds the ZIP fixtures the ZIP-upload tests run against, entirely from
   real material already in this repo:
   - Ledger_A109_badcharges.xlsx / Ledger_A110_6wk.xlsx / Bad_Ledger.xlsx /
     RentRoll.xlsx (this directory)
   - the five real A105 lease PDFs in ../lease_tool/a105_test
   Copies with a rewritten "Unit:" cell are generated here rather than
   committed, so the ledger content stays real while the unit identifier can
   be made deliberately ambiguous (to prove folder/filename resolution is
   doing the work) or deliberately absent from the rent roll.

   Real ledger ZIPs from a property weren't available, so the folder/filename
   shapes exercised here are the ones the feature claims to support:
     Ledger_A109.xlsx | A109.xlsx | A109/ledger.xlsx | Unit A109/anything.xlsx
*/
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const fflate = require('fflate');

const HERE = __dirname;
const A105 = path.resolve(HERE, '../lease_tool/a105_test');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function read(p){ return new Uint8Array(fs.readFileSync(p)); }

// Same real ledger, with the "Unit:" cell rewritten. Everything else
// (transactions, dates, resident) is untouched.
function ledgerWithUnit(srcName, newUnit){
  const wb = XLSX.readFile(path.join(HERE, srcName), {cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  let done = false;
  for (let r=0; r<rows.length && !done; r++){
    for (let c=0; c<(rows[r]||[]).length; c++){
      const v = rows[r][c];
      if (typeof v === 'string' && v.trim().toLowerCase().replace(/:$/,'') === 'unit'){
        const addr = XLSX.utils.encode_cell({r, c: c+1});
        ws[addr] = {t:'s', v:newUnit};
        done = true;
        break;
      }
    }
  }
  if (!done) throw new Error('no Unit: cell found in ' + srcName);
  return new Uint8Array(XLSX.write(wb, {type:'buffer', bookType:'xlsx'}));
}

// A TAA-style lease PDF with the phrasing the tool's extraction regexes were
// written against (mirrors ../lease_tool/gen_synthetic_lease.cjs). Used where
// a test needs a lease whose own "Apartment No." field carries the full unit
// id (the real A105 PDFs parse as "105", with no building letter).
function leaseHtml({unit, rent, startRaw, endRaw, resident}){
  return `<!DOCTYPE html><html><body style="margin:0;">
  <div style="padding:60px; font-family:Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5;">
    <h2 style="text-align:center;">Apartment Lease Contract</h2>
    <h3>LEASE DETAILS</h3>
    <p>Residents ____________________________________________ ${resident} Owner _____________________________________________ Garden Creek Apartments LLC</p>
    <p>A. Apartment (Par. 2)</p>
    <p>Apartment No. _________________________ City: ______________________________________ State: ___ Zip: ____________________ ${unit} Boerne TX 78006</p>
    <p>B. Initial Lease Term. Begins:_____________________________________ Ends at 11:59 p.m. on:_________________________________ ${startRaw} ${endRaw}</p>
    <p>C. Monthly Base Rent (Par. 3) E. Security Deposit (Par. 5) F. Notice of Termination or Intent to Move Out (Par. 4)</p>
    <p>$ ___________________________ ${rent.toFixed(2)} $ ____________________________ 500.00</p>
    <p>L. Additional Rent - Monthly Recurring Fixed Charges. You will pay separately for these items as outlined below and/or in separate addenda,
    Special Provisions or an amendment to this Lease.</p>
    <p>Animal rent $ __________________________ Cable/satellite $ _______________________ Internet $ __________________</p>
    <p>Package service $ __________________________ Pest control $ _______________________ 8.00 Stormwater/drainage $ _____________</p>
    <p>Trash service $ __________________________ 17.00 Washer/Dryer $ _______________________</p>
  </div></body></html>`;
}

async function makeLeasePdfs(specs){
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: CHROME });
  const out = [];
  try{
    const page = await browser.newPage();
    for (const spec of specs){
      await page.setContent(leaseHtml(spec), {waitUntil:'load'});
      const buf = await page.pdf({format:'Letter', printBackground:true});
      out.push(new Uint8Array(buf));
    }
  } finally {
    await browser.close();
  }
  return out;
}

function writeZip(outPath, files){
  const zipped = fflate.zipSync(files, {level:0});
  fs.writeFileSync(outPath, Buffer.from(zipped));
  return outPath;
}

/* The main ledgers ZIP: four different real-world-ish shapes plus junk. */
function buildLedgerZip(outPath){
  return writeZip(outPath, {
    // 1. Prefixed filename, flat in a folder -- unit from the filename.
    'Ledgers/Ledger_A109_badcharges.xlsx': read(path.join(HERE, 'Ledger_A109_badcharges.xlsx')),
    // 2. Unit folder, generic filename, and a deliberately ambiguous "Unit:"
    //    field inside ("105" matches both A105 and B105) -- only the folder
    //    name can resolve this one.
    'A105/ledger.xlsx': ledgerWithUnit('Ledger_A110_6wk.xlsx', '105'),
    // 3. Filename IS the unit, and again an ambiguous internal unit ("106"
    //    matches A106 and B106) -- only the filename can resolve it.
    'B106.xlsx': ledgerWithUnit('Ledger_A110_6wk.xlsx', '106'),
    // 4. "Unit A110" folder with an unrelated filename.
    'Batch 2/Unit A110/export.xlsx': read(path.join(HERE, 'Ledger_A110_6wk.xlsx')),
    // Junk that must be skipped quietly.
    'Ledgers/RentRoll.xlsx': read(path.join(HERE, 'RentRoll.xlsx')),
    'Ledgers/notes.txt': new Uint8Array(Buffer.from('not a spreadsheet')),
    '__MACOSX/._Ledger_A109_badcharges.xlsx': new Uint8Array(Buffer.from('mac resource fork')),
    'Ledgers/.DS_Store': new Uint8Array(Buffer.from('junk')),
    // Looks like a ledger by name but won't parse -- must be surfaced.
    'Ledgers/Bad_Ledger.xlsx': read(path.join(HERE, 'Bad_Ledger.xlsx')),
    // A real ledger for a unit that isn't in this rent roll at all.
    'Ledgers/Ledger_Z999.xlsx': ledgerWithUnit('Ledger_A110_6wk.xlsx', 'Z999'),
  });
}

/* Leases ZIP in the ResMan shape: one unit folder with five real lease PDFs
   in its "Signed Lease Documents" folder, plus a document outside that
   folder which must never be parsed. */
function buildLeaseZip(outPath){
  const f = {};
  for (const n of ['A105_2022-2023.pdf','A105_2023-2024.pdf','A105_2024-2025.pdf','A105_2025-2026_current.pdf','A105_2026-2027_signed_renewal.pdf']){
    f['A105/Signed Lease Documents/' + n] = read(path.join(A105, n));
  }
  f['A105/Other Documents/insurance.pdf'] = read(path.join(A105, 'A105_2022-2023.pdf'));
  return writeZip(outPath, f);
}

module.exports = { read, ledgerWithUnit, makeLeasePdfs, writeZip, buildLedgerZip, buildLeaseZip, HERE, A105, CHROME };

if (require.main === module){
  buildLedgerZip('/tmp/fixture_ledgers.zip');
  buildLeaseZip('/tmp/fixture_leases.zip');
  console.log('wrote /tmp/fixture_ledgers.zip and /tmp/fixture_leases.zip');
}
