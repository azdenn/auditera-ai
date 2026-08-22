const { chromium } = require('playwright');
const path = require('path');

// Mirrors the real "paired inline" pattern seen on page 1 of the actual
// Garden Creek lease: "Signatures of All Residents   Signature of Owner or
// Owner's Representative" split across the page's horizontal midpoint, with
// dense surrounding paragraph text (like a real Flood Disclosure Notice) --
// this is the exact layout the user reported a false "missing" on.
function scribbleSvg(x, y, w){
  return `<svg width="${w}" height="26" style="position:absolute; left:${x}px; top:${y}px;">
    <path d="M2,18 C10,2 18,24 26,10 C34,-2 42,22 50,8 C58,-4 70,20 ${w-4},12"
      stroke="black" stroke-width="1.2" fill="none" opacity="0.55" />
  </svg>`;
}

function leaseHtml({unit, rent, signed}) {
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:1.7;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ ${unit} Boerne TX 78006</div>
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
  <div style="font-weight:bold;">FLOOD DISCLOSURE NOTICE</div>
  <div>This community is or is not located in a 100-year floodplain as shown on the current Federal Emergency Management Agency</div>
  <div>(FEMA) maps for this area. If you have questions concerning this matter or need additional information about protecting your</div>
  <div>property against flooding, you should contact your insurance agent or the FEMA Regional Office for the area.</div>
  <div>The owner has no knowledge that the dwelling is in a designated flood-prone area. Your renter's insurance policy may or may</div>
  <div>not cover damage caused by flood. Contact your insurance company for further information.</div>
  <div style="position:relative; height:18px;"></div>
  <div style="position:relative; height:26px;">
    ${signed ? scribbleSvg(60, -34, 190) : ''}
  </div>
  <div style="display:flex; justify-content:space-between; width:520px;">
    <div>Signatures of All Residents</div>
    <div>Signature of Owner or Owner's Representative</div>
  </div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A104_FLOOD_SIGNED', rent:'1200.00', signed:true}));
    await page.pdf({path: path.resolve('./synthetic_flood_signed.pdf')});
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A104_FLOOD_BLANK', rent:'1200.00', signed:false}));
    await page.pdf({path: path.resolve('./synthetic_flood_blank.pdf')});
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
