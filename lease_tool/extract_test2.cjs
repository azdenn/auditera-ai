const { getDocument } = require('./node_modules/pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

(async () => {
  const data = new Uint8Array(fs.readFileSync('./sample_lease.pdf'));
  const doc = await getDocument({data, useSystemFonts: true}).promise;
  const page = await doc.getPage(2);
  const tc = await page.getTextContent();
  // print items with str containing A109 or Bluebonnet or Apartment No or Street Address, with coords
  tc.items.forEach((it,i) => {
    if (/A109|Bluebonnet|Apartment No|Street Address|Boerne|Zip|City/i.test(it.str)) {
      console.log(i, JSON.stringify(it.str), 'x=', it.transform[4].toFixed(1), 'y=', it.transform[5].toFixed(1));
    }
  });
})().catch(e=>{console.error(e);process.exit(1)});
