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

(async () => {
  const data = new Uint8Array(fs.readFileSync('./sample_lease.pdf'));
  const doc = await getDocument({data, useSystemFonts: true}).promise;
  console.log('numPages', doc.numPages);

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = groupLines(tc.items);
    const fullText = lines.join(' | ');
    if (/Monthly Recurring Fixed Charges/i.test(fullText)) {
      console.log('=== FOUND target page', p, '===');
      lines.forEach((l,i)=>console.log(i, JSON.stringify(l)));
      break;
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
