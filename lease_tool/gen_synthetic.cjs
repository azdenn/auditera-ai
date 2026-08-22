const { chromium } = require('playwright');
const path = require('path');

function leaseHtml({unit, city, state, zip, rent, pest, trash, other}) {
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ${unit} City: ${city} State: ${state} Zip: ${zip}</div>
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

  // Unit not in rent roll -> should be "Unmatched PDF"
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'Z999', city:'Nowhere', state:'TX', zip:'00000', rent:'950.00', pest:'6.00', trash:'15.00', other:{label:'Reserved Parking', value:'20.00'}}));
    await page.pdf({path: path.resolve('./synthetic_Z999.pdf')});
    await page.close();
  }

  // Unit A101 exists in rent roll (rent 1701, trash 17, pest 8, parking 25, per earlier dump) -- introduce a mismatch (pest 12 instead of 8)
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A101', city:'Boerne', state:'TX', zip:'78006', rent:'1701.00', pest:'12.00', trash:'17.00', other:{label:'Reserved Parking', value:'25.00'}}));
    await page.pdf({path: path.resolve('./synthetic_A101.pdf')});
    await page.close();
  }

  // Unit A110 exists (rent 1411 per earlier dump) -- make it match cleanly (need to know A110's actual resman charges first, will verify separately)
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A110', city:'Boerne', state:'TX', zip:'78006', rent:'1411.00', pest:'0.00', trash:'0.00', other:{label:'', value:''}}));
    await page.pdf({path: path.resolve('./synthetic_A110.pdf')});
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
