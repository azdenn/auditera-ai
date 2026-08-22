const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const files = ['lease_base.pdf','lease_1_a.pdf','lease_1_b.pdf','lease_12.pdf','lease_123.pdf','lease_1234.pdf'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  for (const f of files){
    const buf = fs.readFileSync(path.resolve(__dirname, 'debug_units', f));
    const b64 = buf.toString('base64');
    const result = await page.evaluate(async (b64) => {
      function b64ToBuf(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
      try{
        const parsed = await parseLeasePdfFromBuffer(b64ToBuf(b64));
        const v = parsed.verification;
        return {
          ok: true,
          unit: parsed.unit,
          leaseTermStartRaw: v.leaseTermStartRaw, leaseTermEndRaw: v.leaseTermEndRaw,
          residentsRaw: v.residentsRaw,
          rawItems: parsed.rawItems,
          signatureFindings: v.signatureFindings.map(x => ({page:x.page, section:x.section, signer:x.signer, present:x.present, kind:x.kind, detectedVia:x.detectedVia})),
        };
      }catch(err){
        return { ok:false, error: err.message };
      }
    }, b64);
    console.log('=== ' + f + ' ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
  }

  console.log('=== errors ===', errors);
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
