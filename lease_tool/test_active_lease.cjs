const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  async function parseFixture(filePath){
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString('base64');
    const parsed = await page.evaluate(async (b64) => {
      function b64ToBuf(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
      const parsed = await parseLeasePdfFromBuffer(b64ToBuf(b64));
      return { unit: parsed.unit, rawItems: parsed.rawItems, verification: parsed.verification };
    }, b64);
    parsed.filename = path.basename(filePath);
    return parsed;
  }

  const expiredEarlier = await parseFixture(path.resolve(__dirname, 'synthetic_a105_expired_earlier.pdf'));
  const activeFuture = await parseFixture(path.resolve(__dirname, 'synthetic_a105_active_future.pdf'));
  expiredEarlier.filename = 'synthetic_a105_expired_earlier.pdf';
  activeFuture.filename = 'synthetic_a105_active_future.pdf';

  console.log('=== A105: expired-but-earlier-start vs active-future-end ===');
  console.log('Expired term:', expiredEarlier.verification.leaseTermStartRaw, '-', expiredEarlier.verification.leaseTermEndRaw);
  console.log('Active term:', activeFuture.verification.leaseTermStartRaw, '-', activeFuture.verification.leaseTermEndRaw);

  const pickA105 = await page.evaluate(([expiredEarlier, activeFuture]) => {
    // Reconstruct Date objects (lost over the JSON boundary).
    function reviveDates(v){
      if (v.leaseTermStartRaw) v.leaseTermStart = parseSlashDate(v.leaseTermStartRaw);
      if (v.leaseTermEndRaw) v.leaseTermEnd = parseSlashDate(v.leaseTermEndRaw);
      return v;
    }
    const group = [
      { filename: expiredEarlier.filename, rawItems: expiredEarlier.rawItems, verification: reviveDates(expiredEarlier.verification) },
      { filename: activeFuture.filename, rawItems: activeFuture.rawItems, verification: reviveDates(activeFuture.verification) },
    ];
    const pick = pickBestLeaseCandidate(group, null);
    return { chosenFilename: pick.chosen.filename, ambiguous: pick.ambiguous, reason: pick.reason };
  }, [expiredEarlier, activeFuture]);

  console.log('Pick result:', pickA105);
  console.log('CORRECT (chose active/future-end lease, not earlier-started expired one)?', pickA105.chosenFilename === 'synthetic_a105_active_future.pdf' && !pickA105.ambiguous);

  console.log('\n=== A106: both expired (month-to-month rollover) -- should NOT force ambiguous ===');
  const expiredOld = await parseFixture(path.resolve(__dirname, 'synthetic_a106_expired_old.pdf'));
  const expiredRecent = await parseFixture(path.resolve(__dirname, 'synthetic_a106_expired_recent.pdf'));
  expiredOld.filename = 'synthetic_a106_expired_old.pdf';
  expiredRecent.filename = 'synthetic_a106_expired_recent.pdf';

  const pickA106 = await page.evaluate(([expiredOld, expiredRecent]) => {
    function reviveDates(v){
      if (v.leaseTermStartRaw) v.leaseTermStart = parseSlashDate(v.leaseTermStartRaw);
      if (v.leaseTermEndRaw) v.leaseTermEnd = parseSlashDate(v.leaseTermEndRaw);
      return v;
    }
    const group = [
      { filename: expiredOld.filename, rawItems: expiredOld.rawItems, verification: reviveDates(expiredOld.verification) },
      { filename: expiredRecent.filename, rawItems: expiredRecent.rawItems, verification: reviveDates(expiredRecent.verification) },
    ];
    const pick = pickBestLeaseCandidate(group, null);
    return { chosenFilename: pick.chosen ? pick.chosen.filename : null, ambiguous: pick.ambiguous, reason: pick.reason };
  }, [expiredOld, expiredRecent]);

  console.log('Pick result:', pickA106);
  console.log('CORRECT (picked the more-recently-started expired lease, not ambiguous)?', pickA106.chosenFilename === 'synthetic_a106_expired_recent.pdf' && !pickA106.ambiguous);

  console.log('\n=== errors ===', errors);
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
