// Synthetic expired lease PDF for Blanco Oaks unit 303 (Milton Saltmarsh),
// reproducing the exact real-world case the user flagged: the resident has an
// OLD lease on file whose term has already ended, while the REAL rent roll
// shows a live term (01/13/2026 - 01/12/2027) and rent of $1373 with NO
// Month to Month Fee. The old lease says $1353, so ResMan is $20 higher.
// Before the fix, the expired PDF alone made the tool call this
// "month-to-month" and wave the $20 away. It must be a real mismatch.
const { chromium } = require('playwright');
const path = require('path');
function scribbleSvg(x, w){
  return `<svg width="${w}" height="26" style="position:absolute; left:${x}px; top:0;">
    <path d="M2,18 C10,2 18,24 26,10 C34,-2 42,22 50,8 C58,-4 70,20 ${w-4},12" stroke="black" stroke-width="2" fill="none" /></svg>`;
}
function leaseHtml({unit, rent, termStart, termEnd}) {
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ ${unit} Boerne TX 78006</div>
  <div>B. Initial Lease Term. Begins:____ Ends at 11:59 p.m. on:____ ${termStart} ${termEnd}</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ${rent}</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ Cable/satellite $ Internet $</div>
  <div>Package service $ Pest control $ 0.00 Stormwater/drainage $</div>
  <div>Trash service $ 0.00 Washer/Dryer $</div>
  <div>Other: $</div><div>Other: $</div><div>Other: $</div><div>Other: $</div>
  <div style="page-break-before: always;"></div>
  <div style="font-weight:bold;">GENERAL PROVISIONS AND SIGNATURES</div>
  <div style="position:relative; height:26px; margin-top:40px;">${scribbleSvg(60,220)}</div>
  <div>(Name of Resident) Date signed</div>
  <div style="position:relative; height:26px; margin-top:20px;">${scribbleSvg(60,220)}</div>
  <div>Owner or Owner's Representative (signing on behalf of owner)</div>
  </body></html>`;
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.setContent(leaseHtml({unit:'303', rent:'1353.00', termStart:'01/09/2025', termEnd:'01/12/2026'}));
  await page.pdf({path: path.resolve('./boa_test/303_old_expired_lease.pdf')});
  await browser.close();
  console.log('Wrote boa_test/303_old_expired_lease.pdf');
})();
