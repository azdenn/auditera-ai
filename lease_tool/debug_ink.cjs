const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  const buf = fs.readFileSync(path.resolve(__dirname, 'debug_units', 'lease_base.pdf'));
  const b64 = buf.toString('base64');

  const out = await page.evaluate(async (b64) => {
    function b64ToBuf(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
    const doc = await pdfjsLib.getDocument({data: new Uint8Array(b64ToBuf(b64))}).promise;
    const pageRecords = [];
    for (let p = 1; p <= doc.numPages; p++){
      const pg = await doc.getPage(p);
      const tc = await pg.getTextContent();
      let viewport = null;
      try { viewport = pg.getViewport({scale:1}); } catch(err) { viewport = null; }
      pageRecords.push({ pageNum: p, width: viewport?viewport.width:612, height: viewport?viewport.height:792, lines: groupLinesPositioned(tc.items) });
    }
    const findings = extractSignatureFindings(pageRecords, ['Elysee Maykelson']);
    // Grab page1 and page15 anchor-resident findings, dump box + text lines nearby.
    const targets = findings.filter(f => (f.page===1 || f.page===15));
    const dump = targets.map(f => ({ page:f.page, kind:f.kind, signer:f.signer, present:f.present, box:f.box }));

    // Now manually replicate the ink pixel counting for these targets to see actual numbers.
    const prByPage = new Map(pageRecords.map(pr => [pr.pageNum, pr]));
    const results = [];
    for (const f of targets.filter(t=>!t.present && t.box)){
      const pr = prByPage.get(f.box.page);
      const pg = await doc.getPage(f.box.page);
      const scale = 2;
      const viewport = pg.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      await pg.render({canvasContext: ctx, viewport}).promise;
      const glyphRects = pageGlyphRects(pr).map(r => {
        const p0 = viewport.convertToViewportPoint(r.x0, r.y0);
        const p1 = viewport.convertToViewportPoint(r.x1, r.y1);
        return { x0: Math.min(p0[0],p1[0]), x1: Math.max(p0[0],p1[0]), y0: Math.min(p0[1],p1[1]), y1: Math.max(p0[1],p1[1]) };
      });
      const b0 = viewport.convertToViewportPoint(f.box.x0, f.box.y0);
      const b1 = viewport.convertToViewportPoint(f.box.x1, f.box.y1);
      const vx0 = Math.max(0, Math.floor(Math.min(b0[0],b1[0])));
      const vx1 = Math.min(canvas.width, Math.ceil(Math.max(b0[0],b1[0])));
      const vy0 = Math.max(0, Math.floor(Math.min(b0[1],b1[1])));
      const vy1 = Math.min(canvas.height, Math.ceil(Math.max(b0[1],b1[1])));
      const imgData = ctx.getImageData(vx0, vy0, Math.max(1,vx1-vx0), Math.max(1,vy1-vy0));
      const d = imgData.data;
      let dark=0, total=0;
      for (let y=vy0;y<vy1;y++){
        for (let x=vx0;x<vx1;x++){
          const masked = glyphRects.some(r => x>=r.x0 && x<r.x1 && y>=r.y0 && y<r.y1);
          if (masked) continue;
          const idx = ((y-vy0)*(vx1-vx0) + (x-vx0)) * 4;
          const lum = 0.299*d[idx] + 0.587*d[idx+1] + 0.114*d[idx+2];
          total++;
          if (lum < 210) dark++;
        }
      }
      results.push({ page: f.box.page, signer: f.signer, kind: f.kind, box: f.box, viewportBox:{vx0,vy0,vx1,vy1}, dark, total, fraction: total? dark/total : 0 });
    }
    return { dump, results };
  }, b64);

  console.log(JSON.stringify(out, null, 2));
  console.log('=== errors ===', errors);
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
