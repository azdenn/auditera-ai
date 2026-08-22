const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  const buf = fs.readFileSync(path.resolve(__dirname, 'debug_units', 'lease_base.pdf'));
  const b64 = buf.toString('base64');

  const out = await page.evaluate(async (b64) => {
    function b64ToBuf(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
    const doc = await pdfjsLib.getDocument({data: new Uint8Array(b64ToBuf(b64))}).promise;
    const results = {};
    for (const pnum of [1, 15]){
      const pg = await doc.getPage(pnum);
      const scale = 2;
      const viewport = pg.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await pg.render({canvasContext: ctx, viewport}).promise;
      results[pnum] = canvas.toDataURL('image/png');
    }
    return results;
  }, b64);

  for (const pnum of [1, 15]){
    const dataUrl = out[pnum];
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.resolve(__dirname, 'debug_units', 'page' + pnum + '_full.png'), Buffer.from(base64Data, 'base64'));
  }

  console.log('done');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
