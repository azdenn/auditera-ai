// Synthetic lease PDF for Blanco Oaks unit 406, matching the REAL uploaded
// BOA_2026.14_Rent_Roll.xlsx: John Lane, Rent $1499, Lease Start 07/22/2025,
// Lease End 07/20/2026 (already ended relative to today), with a real
// "Month to Month Fee" ($250) charge on the Rent Roll that has no possible
// counterpart on this fixed-term lease -- this is the exact real-world case
// the user pointed at ("there's an incredibly [unit] set of rent is month
// to month" -- BOA 2026 rent roll).
const { chromium } = require('playwright');
const path = require('path');

function scribbleSvg(x, w){
  return `<svg width="${w}" height="26" style="position:absolute; left:${x}px; top:0;">
    <path d="M2,18 C10,2 18,24 26,10 C34,-2 42,22 50,8 C58,-4 70,20 ${w-4},12"
      stroke="black" stroke-width="2" fill="none" />
  </svg>`;
}

function leaseHtml({unit, rent, termStart, termEnd, signed}) {
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ ${unit} Boerne TX 78006</div>
  <div>B. Initial Lease Term. Begins:____ Ends at 11:59 p.m. on:____ ${termStart} ${termEnd}</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ${rent}</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ Cable/satellite $ Internet $</div>
  <div>Package service $ Pest control $ 0.00 Stormwater/drainage $</div>
  <div>Trash service $ 0.00 Washer/Dryer $</div>
  <div>Other: $</div>
  <div>Other: $</div>
  <div>Other: $</div>
  <div>Other: $</div>
  <div style="page-break-before: always;"></div>
  <div style="font-weight:bold;">GENERAL PROVISIONS AND SIGNATURES</div>
  <div style="position:relative; height:26px; margin-top:40px;">
    ${signed ? scribbleSvg(60, 220) : ''}
  </div>
  <div>(Name of Resident) Date signed</div>
  <div style="position:relative; height:26px; margin-top:20px;">
    ${signed ? scribbleSvg(60, 220) : ''}
  </div>
  <div>Owner or Owner's Representative (signing on behalf of owner)</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.setContent(leaseHtml({unit:'406', rent:'1499.00', termStart:'07/22/2025', termEnd:'07/20/2026', signed:true}));
  await page.pdf({path: path.resolve('./boa_test/406_expired_lease.pdf')});
  await page.close();
  await browser.close();
  console.log('Wrote boa_test/406_expired_lease.pdf');
})();
