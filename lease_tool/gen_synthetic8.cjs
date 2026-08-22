const { chromium } = require('playwright');
const path = require('path');

// Regression fixture for the versioning fix: proves that "most recent lease"
// is now decided from the lease's own Initial Lease Term date, NOT from how
// many trailing version numbers ResMan happened to leave on the filename.
// Unit A101 gets two candidate files inside its "Signed Lease Documents"
// folder:
//   - "Blanco Oaks - Standard Lease 1 2 3.pdf" -- looks "newest" by the OLD
//     filename-counting rule (three trailing numbers), but its own Initial
//     Lease Term date is the OLDER one (2023) and it also renders unsigned.
//   - "Blanco Oaks - Standard Lease.pdf" -- looks "oldest" by the old rule
//     (no trailing numbers at all), but its Initial Lease Term date is the
//     NEWER one (2025) and it's fully signed.
// A correct content-based picker must choose the second file despite its
// "boring" filename -- picking the first one (old filename-heuristic
// behavior) would be exactly the bug the user reported.
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

  // "Newest-looking filename" (3 trailing numbers) but OLDER content date,
  // and unsigned -- must lose under content-based selection.
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A101', rent:'1150.00', termStart:'01/01/2023', termEnd:'12/31/2023', signed:false}));
    await page.pdf({path: path.resolve('./synthetic_v101_oldcontent_newfilename.pdf')});
    await page.close();
  }

  // "Oldest-looking filename" (no trailing numbers) but NEWER content date,
  // fully signed -- must win under content-based selection.
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A101', rent:'1150.00', termStart:'01/01/2025', termEnd:'12/31/2025', signed:true}));
    await page.pdf({path: path.resolve('./synthetic_v101_newcontent_oldfilename.pdf')});
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
