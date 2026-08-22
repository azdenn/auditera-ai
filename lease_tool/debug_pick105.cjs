const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  const files = ['lease_1_a.pdf','lease_12.pdf','lease_123.pdf','lease_1234.pdf'];
  const parsed = [];
  for (const f of files){
    const buf = fs.readFileSync(path.resolve(__dirname, 'debug_units', f));
    const b64 = buf.toString('base64');
    const r = await page.evaluate(async (b64) => {
      function b64ToBuf(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
      const p = await parseLeasePdfFromBuffer(b64ToBuf(b64));
      return { rawItems: p.rawItems, verification: p.verification };
    }, b64);
    r.filename = f;
    parsed.push(r);
  }

  const result = await page.evaluate((parsed) => {
    function reviveDates(v){
      if (v.leaseTermStartRaw) v.leaseTermStart = parseSlashDate(v.leaseTermStartRaw);
      if (v.leaseTermEndRaw) v.leaseTermEnd = parseSlashDate(v.leaseTermEndRaw);
      return v;
    }
    const group = parsed.map(p => ({ filename: p.filename, rawItems: p.rawItems, verification: reviveDates(p.verification) }));
    const pick = pickBestLeaseCandidate(group, null, new Date(2026, 7, 10)); // Aug 10 2026 (month is 0-indexed)
    return {
      chosen: pick.chosen ? pick.chosen.filename : null,
      ambiguous: pick.ambiguous,
      reason: pick.reason,
      candidates: pick.candidates.map(c => ({ filename: c.item.filename, tier: c.tier, signaturesComplete: c.signaturesComplete, rrMatch: c.rrMatch, startTime: c.startTime })),
    };
  }, parsed);

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
