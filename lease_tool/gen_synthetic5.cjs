const { chromium } = require('playwright');
const path = require('path');

function leaseHtml({unit, city, state, zip, rent, pest, trash, other}) {
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ ${unit} ${city} ${state} ${zip}</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ${rent}</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ Cable/satellite $ Internet $</div>
  <div>Package service $ Pest control $ ${pest} Stormwater/drainage $</div>
  <div>Trash service $ ${trash} Washer/Dryer $</div>
  <div>Other: ${other.label} $ ${other.value}</div>
  <div>Other: $</div>
  <div>Other: $</div>
  <div>Other: $</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // Bare-digit unit "301" -- the lease's own Apartment No. field has no
  // building letter, but the Rent Roll's unit for the same apartment is
  // "A301". This is the letter-prefix-mismatch scenario reported by the
  // user ("some are 301 and then theres another thats a301").
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'301', city:'Boerne', state:'TX', zip:'78006', rent:'1254.00', pest:'0.00', trash:'0.00', other:{label:'', value:''}}));
    await page.pdf({path: path.resolve('./synthetic_301_bare.pdf')});
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
