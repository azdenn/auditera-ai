const { getDocument } = require('./node_modules/pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

function groupLines(items) {
  let list = items.map(it => ({str: it.str, x: it.transform[4], y: it.transform[5]}));
  list.sort((a,b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let currentLine = [];
  let currentY = null;
  const Y_TOL = 3;
  for (const it of list) {
    if (currentY === null || Math.abs(it.y - currentY) <= Y_TOL) {
      currentLine.push(it);
      if (currentY === null) currentY = it.y;
    } else {
      lines.push(currentLine);
      currentLine = [it];
      currentY = it.y;
    }
  }
  if (currentLine.length) lines.push(currentLine);
  return lines.map(line => {
    line.sort((a,b) => a.x - b.x);
    return line.map(i => i.str).join(' ').replace(/\s+/g,' ').trim();
  }).filter(l => l.length>0);
}

// "immediate" extraction: label must be followed (within a short gap of only $, underscores, whitespace, colons)
// directly by $ and optional digits. Returns {found:true/false, value:number|null}
function extractImmediate(text, label) {
  const idx = text.toLowerCase().indexOf(label.toLowerCase());
  if (idx === -1) return {found:false, value:null};
  const after = text.slice(idx + label.length, idx + label.length + 80);
  const m = after.match(/^[\s_:]*\$[\s_]*([\d,]*\.?\d*)/);
  if (!m) return {found:false, value:null};
  const digits = m[1].replace(/,/g,'');
  if (!digits || digits === '.' ) return {found:true, value:0};
  return {found:true, value:parseFloat(digits)};
}

// "nearest" extraction: first $ followed by digits within a wide window after label
function extractNearest(text, label, window=500) {
  const idx = text.toLowerCase().indexOf(label.toLowerCase());
  if (idx === -1) return {found:false, value:null};
  const after = text.slice(idx + label.length, idx + label.length + window);
  const m = after.match(/\$\s*[_\s]*([\d,]+\.?\d{0,2})/);
  if (!m) return {found:false, value:null};
  return {found:true, value: parseFloat(m[1].replace(/,/g,''))};
}

function extractOtherLines(text) {
  const results = [];
  const re = /Other:\s*[_\s]*([^$_\n]*?)\s*\$\s*[_\s]*([\d,]*\.?\d*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = m[1].trim();
    const digits = m[2].replace(/,/g,'');
    if (label && digits) {
      results.push({label, value: parseFloat(digits)});
    }
  }
  return results;
}

(async () => {
  const data = new Uint8Array(fs.readFileSync('./sample_lease.pdf'));
  const doc = await getDocument({data, useSystemFonts: true}).promise;

  let targetPage = null, aptSectionText = null;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = groupLines(tc.items);
    const fullText = lines.join('\n');
    if (/Monthly Recurring Fixed Charges/i.test(fullText)) {
      targetPage = p;
      aptSectionText = fullText;
      break;
    }
  }
  console.log('target page:', targetPage);

  // unit number
  const unitMatch = /Apartment No\.\s*[_\s]*City:\s*[_\s]*State:\s*[_\s]*Zip:\s*[_\s]*(.+)/i.exec(aptSectionText);
  let unit = null;
  if (unitMatch) {
    const tokens = unitMatch[1].trim().split(/\s+/);
    unit = tokens[0];
  }
  console.log('Unit:', unit);

  const rent = extractNearest(aptSectionText, 'Monthly Base Rent', 500);
  console.log('Monthly Base Rent:', rent);

  const labels = ['Animal rent','Cable/satellite','Internet','Package service','Pest control','Stormwater/drainage','Trash service','Washer/Dryer'];
  for (const l of labels) {
    console.log(l, '=>', extractImmediate(aptSectionText, l));
  }

  console.log('Other lines:', extractOtherLines(aptSectionText));
})().catch(e=>{console.error(e);process.exit(1)});
