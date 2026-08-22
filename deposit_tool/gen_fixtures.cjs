/* Builds every test fixture from the REAL rent roll at
   fixtures/BOA_rentroll.xlsx (a genuine ResMan export for Blanco Oaks
   Apartments: 30 units, 5 vacant, 11 "Deposit Waiver Fee (LeaseLock)" charges
   at $33, 7 non-zero Surety Bonds, 9 non-zero Deposits).

   Nothing about the real rent roll is invented; the edge-case variant is a
   copy of it with two specific cells zeroed, and the invoices are synthetic
   because LeaseLock's own invoice isn't in the repo. */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, 'fixtures');
const REAL = path.join(FIX, 'BOA_rentroll.xlsx');

// Column layout of the real export (0-based), confirmed by inspection.
const HDR_ROW = 8, C_UNIT = 0, C_SURETY = 35, C_DEPOSITS = 38;

function readAoa(file){
  const wb = XLSX.read(fs.readFileSync(file), {type:'buffer'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
}
function writeAoa(rows, file){
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet');
  XLSX.writeFile(wb, file);
}

/* ---- The edge-case rent roll -------------------------------------------
   Two surgical edits to the real export, because the real property happens to
   have full coverage everywhere (every occupied unit already has LeaseLock, a
   bond, or a deposit) and so contains no "nobody is covering this" case:
     • 105 — security deposit of $1,000 zeroed. No LeaseLock charge and no
             bond either, so this becomes the "none of the three" unit.
     • 205 — surety bond of $1,178 zeroed, and put on the invoice instead, so
             it becomes "LeaseLock bills us but we never charged the resident".
*/
function buildEdgeRentRoll(){
  const rows = readAoa(REAL);
  let edits = 0;
  for (let r = HDR_ROW+1; r < rows.length; r++){
    const u = rows[r] && rows[r][C_UNIT];
    if (u === null || u === undefined) continue;
    const unit = String(u).trim();
    if (unit === '105'){ rows[r][C_DEPOSITS] = 0; edits++; }
    if (unit === '205'){ rows[r][C_SURETY] = 0; edits++; }
  }
  if (edits !== 2) throw new Error('expected to edit exactly 2 unit rows, edited ' + edits);
  writeAoa(rows, path.join(FIX, 'BOA_rentroll_edge.xlsx'));
}

/* ---- Invoices ----------------------------------------------------------
   ASSUMPTION: LeaseLock's real invoice format isn't available here, so these
   model the shape it takes in practice — one row per covered unit with the
   premium the property is billed, plus the coverage period. Column headers
   are deliberately different between the three files to exercise the tool's
   loose header matching.
*/
const D = (y,m,d) => new Date(Date.UTC(y,m-1,d));
const iso = d => d.toISOString().slice(0,10);
const mdy = d => (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'/'+d.getUTCFullYear();

// Base: the 11 units the real rent roll charges $33 of LeaseLock to.
const LL_UNITS = ['203','208','301','302','305','306','401','402','404','405','408'];
const NAMES = {
  '203':'Stephen Castaneda','208':'Emily Nations','301':'Timothy Cheatham','302':'Jackelynn Pina',
  '305':'Christina Kersten','306':'Joseph Owen','401':'Jaclyn VanWyngarden','402':'Richard Rhoades',
  '404':'Gavin Miles','405':'Nathan Shea','408':'Tameka Cuellar','205':'Angela Gervais',
};

/* Invoice A — the main fixture, against the UNMODIFIED real rent roll.
     • normal months at $31 for most units (rent roll charges $33 = 31 + $2)
     • 302: $45 over a normal 30-day month  -> UNEXPLAINED overcharge, flag
     • 402: $46.50 over a 45-day period     -> longer coverage, must NOT flag
     • 408: omitted entirely                -> charged but not invoiced, flag
*/
function buildInvoiceA(){
  const header = ['Invoice Date','Unit','Resident','Coverage Start','Coverage End','Amount'];
  const rows = [
    ['LeaseLock, Inc. — Monthly Deposit Waiver Invoice'],
    ['Property: Blanco Oaks Apartments'],
    [],
    header,
  ];
  for (const u of LL_UNITS){
    if (u === '408') continue;                       // deliberately not invoiced
    let amount = 31.00, start = D(2026,9,1), end = D(2026,9,30);
    if (u === '302') amount = 45.00;                 // unexplained overcharge
    if (u === '402'){ amount = 46.50; end = D(2026,10,15); } // 45 days of coverage
    rows.push(['9/1/2026', u, NAMES[u], mdy(start), mdy(end), amount]);
  }
  rows.push([]);
  rows.push(['', 'Total', '', '', '', rows.filter(r=>typeof r[5]==='number').reduce((s,r)=>s+r[5],0)]);
  const csv = rows.map(r => r.map(v => {
    const s = v===undefined||v===null ? '' : String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  fs.writeFileSync(path.join(FIX, 'leaselock_invoice.csv'), csv);
}

/* Invoice B — .xlsx, against BOA_rentroll_edge.xlsx. Everything at $31 with
   clean 30-day periods, so the only findings come from the rent-roll side:
     • 205 invoiced but not charged (bond zeroed) -> flag
     • 999 invoiced, not in the rent roll at all  -> flag
     • 105 has none of the three                  -> flag
   Header names and unit formatting are deliberately unlike Invoice A. */
function buildInvoiceB(){
  const rows = [
    ['LeaseLock Statement'],
    [],
    ['Apt #','Resident Name','Policy Effective Date','Policy Expiration Date','Premium Billed'],
  ];
  const units = LL_UNITS.concat(['205','999']);
  for (const u of units){
    const label = (u === '203') ? 'Unit 203' : (u === '208') ? '#208' : u;
    rows.push([label, NAMES[u]||'', iso(D(2026,9,1)), iso(D(2026,9,30)), 31.00]);
  }
  writeAoa(rows, path.join(FIX, 'leaselock_invoice_edge.xlsx'));
}

/* Invoice C — same amounts as A but with NO coverage-date columns at all, so
   the higher-invoice cases can't be explained away. Both 302 and 402 must be
   flagged, each saying explicitly that the dates weren't available. */
function buildInvoiceNoDates(){
  const rows = [['Unit','Resident','Amount Due']];
  for (const u of LL_UNITS){
    if (u === '408') continue;
    let amount = 31.00;
    if (u === '302') amount = 45.00;
    if (u === '402') amount = 46.50;
    rows.push([u, NAMES[u], amount]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  fs.writeFileSync(path.join(FIX, 'leaselock_invoice_nodates.csv'), csv);
}

buildEdgeRentRoll();
buildInvoiceA();
buildInvoiceB();
buildInvoiceNoDates();
console.log('fixtures written to', FIX);
for (const f of fs.readdirSync(FIX)) console.log('  ', f, fs.statSync(path.join(FIX,f)).size);
