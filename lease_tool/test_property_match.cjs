const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  console.log('=== normalizePropertyName / propertyNamesLikelyMatch unit checks ===');
  const cases = await page.evaluate(() => {
    return [
      ['Garden Creek Apartments', 'garden creek', propertyNamesLikelyMatch('Garden Creek Apartments', 'garden creek')],
      ['Blanco Oaks Apartments', 'Blanco Oaks', propertyNamesLikelyMatch('Blanco Oaks Apartments', 'Blanco Oaks')],
      ['Blanco Oaks Apartments', 'Garden Creek Apartments', propertyNamesLikelyMatch('Blanco Oaks Apartments', 'Garden Creek Apartments')],
      ['Blanco Oaks Apartments', 'The Blanco Oaks Apartment Community', propertyNamesLikelyMatch('Blanco Oaks Apartments', 'The Blanco Oaks Apartment Community')],
      ['Willow Park', 'Willowpark Apts', propertyNamesLikelyMatch('Willow Park', 'Willowpark Apts')],
    ];
  });
  cases.forEach(([a,b,r]) => console.log(`  "${a}" vs "${b}" => ${r}`));

  console.log('=== extractPropertyNameFromRentRoll against real sample_rentroll.xlsx ===');
  const fs = require('fs');
  const buf = fs.readFileSync(path.resolve(__dirname, 'sample_rentroll.xlsx'));
  const b64 = buf.toString('base64');
  const detected = await page.evaluate(async (b64) => {
    function b64ToBuf(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
    const blob = new Blob([b64ToBuf(b64)]);
    const file = new File([blob], 'sample_rentroll.xlsx');
    const rr = await parseRentRoll(file);
    return rr.propertyName;
  }, b64);
  console.log('  detected property name:', JSON.stringify(detected));
  console.log('  matches expected "Garden Creek Apartments"?', detected === 'Garden Creek Apartments');

  console.log('=== errors ===', errors);
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
