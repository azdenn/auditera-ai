const { chromium } = require('playwright');
const path = require('path');

function leaseHtml({unit, city, state, zip, rent, pest, trash, other}) {
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ ${unit} ${city} ${state} ${zip}</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ____________ ${rent}</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ __________ Cable/satellite $ __________ Internet $ __________</div>
  <div>Package service $ __________ Pest control $ __________ ${pest} Stormwater/drainage $ __________</div>
  <div>Trash service $ __________ ${trash} Washer/Dryer $ __________</div>
  <div>Other: ________________________________ ${other.label} $ ______________ ${other.value}</div>
  <div>Other: ________________________________ $ ______________</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const specs = [
    {name:'synthetic_Z999.pdf', unit:'Z999', city:'Nowhere', state:'TX', zip:'00000', rent:'950.00', pest:'6.00', trash:'15.00', other:{label:'Reserved Parking', value:'20.00'}},
    {name:'synthetic_A101.pdf', unit:'A101', city:'Boerne', state:'TX', zip:'78006', rent:'1701.00', pest:'12.00', trash:'17.00', other:{label:'Reserved Parking', value:'25.00'}},
    {name:'synthetic_A110.pdf', unit:'A110', city:'Boerne', state:'TX', zip:'78006', rent:'1411.00', pest:'8.00', trash:'17.00', other:{label:'Reserved Parking', value:'25.00'}},
  ];
  for (const s of specs){
    const page = await browser.newPage();
    await page.setContent(leaseHtml(s));
    await page.pdf({path: path.resolve('./'+s.name)});
    await page.close();
  }
  await browser.close();
  console.log('done');
})();
