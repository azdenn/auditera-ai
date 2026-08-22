const { chromium } = require('playwright');
const path = require('path');

// Adversarial case: Section L trash field is blank (genuinely -- this document's
// trash IS included in base rent, no separate line item), but the packet is full of
// unrelated dollar figures near the word "trash" elsewhere -- move-out damage
// schedules, per-bag haul fees, community-policy blurbs -- exactly like the real
// user document that triggered the "shows 50 instead of 17" bug. None of these
// should be picked up; the correct behavior is NO trash raw item at all.
function noisyHtml(){
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ T003 Boerne TX 78006</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ____________ 1200.00</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ __________ Cable/satellite $ __________ Internet $ __________</div>
  <div>Package service $ __________ Pest control $ __________ 8.00 Stormwater/drainage $ __________</div>
  <div>Trash service $ __________ Washer/Dryer $ __________</div>
  <div>Other: ________________________________ Reserved Parking $ ______________ 25.00</div>
  <div>Other: ________________________________ $ ______________</div>
  <div style="page-break-before: always;"></div>
  <div>Utility Connection Charge or Transfer Fee: $ 50.00 (not to exceed $50) to be paid within 5 days.</div>
  <div style="page-break-before: always;"></div>
  <div>COMMUNITY POLICIES</div>
  <div>TRASH AND LITTERING: Please do not leave trash bags/containers on porches or walkways.</div>
  <div>Trash fees start at $25.</div>
  <div>Haul Trash $25 per bag for bulk item removal requested outside normal pickup.</div>
  <div style="page-break-before: always;"></div>
  <div>MOVE-OUT CHARGE SCHEDULE</div>
  <div>Trash Removal (left in unit) $50 per bag</div>
  <div>Drywall Repair $50</div>
  </body></html>`;
}

// Genuine case: addendum page for trash, same pattern as before, to confirm the
// tightened regex still finds it after the false-positive fix.
function addendumHtml(){
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
  <div>Apartment No. ____________ City: ______________ State: ___ Zip: ___________ T004 Boerne TX 78006</div>
  <div>C. Monthly Base Rent (Par. 3)</div>
  <div>$ ____________ 1050.00</div>
  <div>L. Additional Rent - Monthly Recurring Fixed Charges.</div>
  <div>Animal rent $ __________ Cable/satellite $ __________ Internet $ __________</div>
  <div>Package service $ __________ Pest control $ __________ 8.50 Stormwater/drainage $ __________</div>
  <div>Trash service $ __________ Washer/Dryer $ __________</div>
  <div>Other: ________________________________ Reserved Parking $ ______________ 26.00</div>
  <div>Other: ________________________________ $ ______________</div>
  <div style="page-break-before: always;"></div>
  <div>LEASE ADDENDUM FOR TRASH REMOVAL AND RECYCLING COSTS -- FLAT FEE</div>
  <div>This Addendum is part of the Lease Agreement referenced above.</div>
  <div>Resident agrees and understands that Owner has contracted with a valet trash and</div>
  <div>recycling removal service provider. Resident agrees to pay a monthly flat fee of</div>
  <div>$ 19.00 for trash removal and recycling services, which shall be considered</div>
  <div>additional rent under the Lease.</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const specs = [
    {name:'synthetic_T003_noisy_no_trash.pdf', html: noisyHtml()},
    {name:'synthetic_T004_addendum2.pdf', html: addendumHtml()},
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
