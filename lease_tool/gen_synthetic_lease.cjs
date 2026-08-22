// Generates a synthetic TAA-style lease PDF for testing the verification
// checks against units that only exist in the rent roll (no real lease PDF
// on disk). Mirrors the real A109 lease's key phrasing so the production
// extraction regexes (validated against the real document) apply unchanged.
const { chromium } = require('playwright');
const path = require('path');

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildHtml(opts){
  const {
    unit, city='Boerne', state='TX', zip='78006',
    residentsRaw, owner='Garden Creek Apartments LLC',
    leaseStartRaw, leaseEndRaw,
    rent, deposit,
    pest=8, trash=17,
    residentSignerNames, // array, one per resident, null entry = blank/unsigned
    ownerSignerName, // string, or null = blank/unsigned
    signatureStyle = 'pattern-a', // 'pattern-a' | 'pattern-b' | 'both'
  } = opts;

  const residentSigCells = (residentSignerNames||[]).map(n => n ? esc(n) : '').join('<br>');
  const ownerSigCell = ownerSignerName ? esc(ownerSignerName) : '';

  const patternARow = `
    <div style="display:flex; justify-content:space-between; margin-top:40px; font-size:11px;">
      <div style="width:45%;">
        <div style="height:18px;">${residentSigCells}</div>
        <div style="border-top:1px solid #000; margin-top:4px;">Signatures of All Residents</div>
      </div>
      <div style="width:45%;">
        <div style="height:18px;">${ownerSigCell}</div>
        <div style="border-top:1px solid #000; margin-top:4px;">Signature of Owner or Owner's Representative</div>
      </div>
    </div>`;

  const patternBRows = (residentSignerNames||[]).map((n,i) => `
      <div style="margin-top:22px; font-size:11px;">
        <div style="height:14px; margin-left:280px;">${n ? esc(n) : ''}</div>
        <div style="border-top:1px solid #000; width:260px; margin-left:280px;"></div>
        <div style="margin-left:280px;">(Name of Resident)</div>
      </div>`).join('');

  const patternBOwner = `
      <div style="margin-top:30px; font-size:11px;">
        <div style="margin-left:280px;">Owner or Owner's Representative (signing on behalf of owner)</div>
        <div style="height:14px; margin-left:280px;">${ownerSigCell}</div>
      </div>`;

  const page1 = `
    <div style="page-break-after:always; padding:60px; font-family: Helvetica, Arial, sans-serif; font-size:12px; line-height:1.5;">
      <h2 style="text-align:center;">Apartment Lease Contract</h2>
      <p>This is a binding contract. Read carefully before signing.</p>
      <p>This Lease Contract ("Lease") is between you, the resident(s) as listed below and us. The terms "you" and "your" refer to all residents.
      The terms "we," "us," and "our" refer to the owner listed below.</p>
      <h3>PARTIES</h3>
      <p>Residents ____________________________________________ ${esc(residentsRaw)} Owner _____________________________________________ ${esc(owner)}</p>
      <h3>LEASE DETAILS</h3>
      <p>A. Apartment (Par. 2)</p>
      <p>Apartment No. _________________________ City: ______________________________________ State: ___ Zip: ____________________ ${esc(unit)} ${esc(city)} ${esc(state)} ${esc(zip)}</p>
      <p>${opts.leaseTermLineOverride !== undefined ? opts.leaseTermLineOverride : `B. Initial Lease Term. Begins:_____________________________________ Ends at 11:59 p.m. on:_________________________________ ${esc(leaseStartRaw)} ${esc(leaseEndRaw)}`}</p>
      <p>C. Monthly Base Rent (Par. 3) E. Security Deposit (Par. 5) F. Notice of Termination or Intent to Move Out (Par. 4)</p>
      <p>${opts.depositLineOverride !== undefined ? opts.depositLineOverride : `$ ___________________________ ${esc(rent.toFixed(2))} $ ____________________________ ${esc(deposit.toFixed(2))}`}</p>
      <p>L. Additional Rent - Monthly Recurring Fixed Charges. You will pay separately for these items as outlined below and/or in separate addenda,
      Special Provisions or an amendment to this Lease.</p>
      <p>Animal rent $ __________________________ Cable/satellite $ _______________________ Internet $ __________________</p>
      <p>Package service $ __________________________ Pest control $ _______________________ ${esc(pest.toFixed(2))} Stormwater/drainage $ _____________</p>
      <p>Trash service $ __________________________ ${esc(trash.toFixed(2))} Washer/Dryer $ _______________________</p>
    </div>`;

  const sigPage = `
    <div style="page-break-after:always; padding:60px; font-family: Helvetica, Arial, sans-serif; font-size:12px; line-height:1.5;">
      <h2>FLOOD DISCLOSURE NOTICE</h2>
      <p>In accordance with Texas law, we are providing the following flood disclosure.</p>
      ${(signatureStyle === 'pattern-a' || signatureStyle === 'both') ? patternARow : ''}
    </div>`;

  const mainSigPage = `
    <div style="padding:60px; font-family: Helvetica, Arial, sans-serif; font-size:12px; line-height:1.5;">
      <h2>GENERAL PROVISIONS AND SIGNATURES</h2>
      <p>Before submitting a rental application or signing this Lease, you should review the documents and may consult an attorney.</p>
      <p style="margin-left:280px; margin-top:20px;">Resident or Residents ( all sign below )</p>
      ${(signatureStyle === 'pattern-b' || signatureStyle === 'both') ? patternBRows + patternBOwner : ''}
    </div>`;

  return `<!DOCTYPE html><html><body style="margin:0;">${page1}${sigPage}${mainSigPage}</body></html>`;
}

async function generate(opts, outPath){
  const html = buildHtml(opts);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: outPath, format: 'Letter', printBackground: true });
  await browser.close();
  console.log('wrote', outPath);
}

module.exports = { generate };
