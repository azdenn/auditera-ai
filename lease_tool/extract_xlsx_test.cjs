const XLSX = require('xlsx');
const wb = XLSX.readFile('./sample_rentroll.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

// find header row: contains 'Unit' and 'Description' and 'Amount'
let headerRowIdx = -1, colUnit=-1, colDesc=-1, colAmount=-1, colResidents=-1, colStatus=-1;
for (let r=0; r<rows.length; r++) {
  const row = rows[r];
  let iUnit=-1, iDesc=-1, iAmt=-1, iRes=-1, iStat=-1;
  row.forEach((cell,c) => {
    if (typeof cell === 'string') {
      const v = cell.trim().toLowerCase();
      if (v === 'unit') iUnit = c;
      if (v === 'description') iDesc = c;
      if (v === 'amount') iAmt = c;
      if (v === 'residents') iRes = c;
      if (v === 'status') iStat = c;
    }
  });
  if (iUnit !== -1 && iDesc !== -1 && iAmt !== -1) {
    headerRowIdx = r; colUnit = iUnit; colDesc = iDesc; colAmount = iAmt; colResidents = iRes; colStatus = iStat;
    break;
  }
}
console.log('header row', headerRowIdx, {colUnit, colDesc, colAmount, colResidents, colStatus});

function findUnitBlock(targetUnit) {
  let inBlock = false;
  let block = null;
  for (let r = headerRowIdx+1; r < rows.length; r++) {
    const row = rows[r];
    const unitVal = row[colUnit];
    if (unitVal !== null && unitVal !== undefined && String(unitVal).trim() !== '') {
      if (String(unitVal).trim().toUpperCase() === targetUnit.toUpperCase()) {
        inBlock = true;
        block = {unit: unitVal, residents: row[colResidents], status: row[colStatus], charges: []};
        continue;
      } else if (inBlock) {
        break; // moved to next unit's block, stop
      } else {
        continue;
      }
    }
    if (inBlock) {
      const desc = row[colDesc];
      const amt = row[colAmount];
      if (desc === null || desc === undefined) {
        // blank separator row signals end of block possibly
        if ((desc===null) && (amt===null)) {
          // could be blank separator - check if next non-empty unit row follows; just break on first fully blank row after having some charges
          if (block.charges.length>0) break;
          continue;
        }
        continue;
      }
      if (String(desc).trim().toLowerCase() === 'total') {
        block.total = amt;
        continue;
      }
      block.charges.push({description: String(desc).trim(), amount: amt});
    }
  }
  return block;
}

const block = findUnitBlock('A109');
console.log(JSON.stringify(block, null, 2));
