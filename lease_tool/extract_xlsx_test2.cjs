const XLSX = require('xlsx');
const wb = XLSX.readFile('./sample_rentroll.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

function findCol(rowsArr, headerRowIdx, label) {
  const row = rowsArr[headerRowIdx];
  for (let c=0;c<row.length;c++){
    if (typeof row[c]==='string' && row[c].trim().toLowerCase()===label.toLowerCase()) return c;
  }
  return -1;
}

// find header row containing Description & Amount (reliable columns)
let headerRowIdx=-1;
for (let r=0;r<rows.length;r++){
  const row=rows[r];
  const hasDesc = row.some(c=>typeof c==='string' && c.trim().toLowerCase()==='description');
  const hasAmt = row.some(c=>typeof c==='string' && c.trim().toLowerCase()==='amount');
  if (hasDesc && hasAmt){ headerRowIdx=r; break; }
}
const colDesc = findCol(rows, headerRowIdx, 'Description');
const colAmount = findCol(rows, headerRowIdx, 'Amount');
const colResidents = findCol(rows, headerRowIdx, 'Residents');
const colStatus = findCol(rows, headerRowIdx, 'Status');

// robustly find Unit column: first data row after header, first non-null col before colDesc
let colUnit = -1;
for (let r=headerRowIdx+1; r<rows.length; r++){
  const row = rows[r];
  const desc = row[colDesc];
  if (desc !== null && desc !== undefined && String(desc).trim()!=='') {
    for (let c=0;c<colDesc;c++){
      if (row[c]!==null && row[c]!==undefined && String(row[c]).trim()!==''){ colUnit=c; break; }
    }
    if (colUnit!==-1) break;
  }
}
console.log({headerRowIdx, colUnit, colDesc, colAmount, colResidents, colStatus});

function findUnitBlock(targetUnit) {
  let block = null;
  let collecting = false;
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const unitVal = row[colUnit];
    const isNewUnitRow = unitVal !== null && unitVal !== undefined && String(unitVal).trim() !== '';
    if (isNewUnitRow) {
      if (collecting) break;
      if (String(unitVal).trim().toUpperCase() === targetUnit.trim().toUpperCase()) {
        collecting = true;
        block = { unit: String(unitVal).trim(), residents: row[colResidents], status: row[colStatus], charges: [], total: null };
      } else {
        continue;
      }
    }
    if (collecting) {
      const desc = row[colDesc];
      const amt = row[colAmount];
      if (desc !== null && desc !== undefined && String(desc).trim() !== '') {
        const d = String(desc).trim();
        if (d.toLowerCase() === 'total') {
          block.total = amt;
        } else {
          block.charges.push({ description: d, amount: amt });
        }
      } else if (!isNewUnitRow) {
        if (block.charges.length > 0 || block.total !== null) break;
      }
    }
  }
  return block;
}

console.log(JSON.stringify(findUnitBlock('A109'), null, 2));
console.log(JSON.stringify(findUnitBlock('A102'), null, 2));
console.log('vacant:', JSON.stringify(findUnitBlock('A103'), null, 2));
