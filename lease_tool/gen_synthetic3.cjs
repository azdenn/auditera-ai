const { chromium } = require('playwright');
const path = require('path');

// Case 1: Section L trash field is completely blank (never filled in / left blank
// checkbox), but the real trash fee is disclosed on a separate addendum page later
// in the packet -- mirrors the real "LEASE ADDENDUM FOR TRASH REMOVAL AND RECYCLING
// COSTS -- FLAT FEE" page pattern the user's actual document has.
function addendumHtml(){
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ T001 Boerne TX 78006</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ____________ 1000.00</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ __________ Cable/satellite $ __________ Internet $ __________</div>
  <div>Package service $ __________ Pest control $ __________ 8.00 Stormwater/drainage $ __________</div>
  <div>Trash service $ __________ Washer/Dryer $ __________</div>
  <div>Other: ________________________________ Reserved Parking $ ______________ 25.00</div>
  <div>Other: ________________________________ $ ______________</div>
  <div style="page-break-before: always;"></div>
  <div>LEASE ADDENDUM FOR TRASH REMOVAL AND RECYCLING COSTS -- FLAT FEE</div>
  <div>This Addendum is part of the Lease Agreement referenced above.</div>
  <div>Resident agrees and understands that Owner has contracted with a valet trash and</div>
  <div>recycling removal service provider. Resident agrees to pay a monthly flat fee of</div>
  <div>$ 22.00 for trash removal and recycling services, which shall be considered</div>
  <div>additional rent under the Lease.</div>
  </body></html>`;
}

// Case 2: Trash label and its filled-in value are split across separate lines/rows
// with a checkbox glyph in between, rather than sitting immediately next to each
// other on the same line the way extractImmediate's original tight window expected.
function checkboxHtml(){
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ T002 Boerne TX 78006</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ____________ 1100.00</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ __________ Cable/satellite $ __________ Internet $ __________</div>
  <div>Package service $ __________ Pest control $ __________ 9.00 Stormwater/drainage $ __________</div>
  <div>Trash service &#9744;</div>
  <div>$ 18.00</div>
  <div>Washer/Dryer $ __________</div>
  <div>Other: ________________________________ Reserved Parking $ ______________ 27.00</div>
  <div>Other: ________________________________ $ ______________</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const specs = [
    {name:'synthetic_T001_addendum.pdf', html: addendumHtml()},
    {name:'synthetic_T002_checkbox.pdf', html: checkboxHtml()},
  ];
  for (const s of specs){
    const page = await browser.newPage();
    await page.setContent(s.html);
    await page.pdf({path: path.resolve('./'+s.name)});
    await page.close();
  }
  await browser.close();
  console.log('done');
})();
