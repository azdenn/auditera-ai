const { chromium } = require('playwright');
const path = require('path');

// Simulates a genuine hand-drawn/scanned signature: an SVG squiggle path
// drawn above the "(Name of Resident)" caption instead of typed text. When
// printed to PDF, this becomes real vector graphics -- pdf.js's text layer
// (getTextContent) sees nothing there at all, exactly like a scanned wet-ink
// signature or a "draw with your mouse" e-signature capture would.
function scribbleSvg(x, w){
  return `<svg width="${w}" height="26" style="position:absolute; left:${x}px; top:0;">
    <path d="M2,18 C10,2 18,24 26,10 C34,-2 42,22 50,8 C58,-4 70,20 ${w-4},12"
      stroke="black" stroke-width="2" fill="none" />
  </svg>`;
}

function leaseHtml({unit, rent, withScribble, secondScribble}) {
  // Mirrors the real per-signer row layout: "(Name of Resident) Date signed"
  // caption line, with the actual mark (if any) drawn just above it -- same
  // visual convention the real Garden Creek leases use.
  return `<html><body style="font-family:sans-serif;font-size:14px;line-height:2;">
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
  <div style="font-weight:bold;">GENERAL PROVISIONS AND SIGNATURES</div>
  <div style="position:relative; height:26px; margin-top:40px;">
    ${withScribble ? scribbleSvg(60, 220) : ''}
  </div>
  <div>(Name of Resident) Date signed</div>
  <div style="position:relative; height:26px; margin-top:20px;">
    ${secondScribble ? scribbleSvg(60, 220) : ''}
  </div>
  <div>Owner or Owner's Representative (signing on behalf of owner)</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // Unit 104-style: real signature present, but drawn (bad handwriting /
  // hand-drawn e-sign capture), not typed text -- text-based detection alone
  // would report "missing"; ink fallback should catch it.
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A104_INK', rent:'1200.00', withScribble:true, secondScribble:true}));
    await page.pdf({path: path.resolve('./synthetic_ink_signed.pdf')});
    await page.close();
  }

  // Genuinely blank/unsigned -- no text, no ink -- must NOT be flipped to
  // "present" by the ink fallback (that would defeat the whole check).
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A104_BLANK', rent:'1200.00', withScribble:false, secondScribble:false}));
    await page.pdf({path: path.resolve('./synthetic_blank_unsigned.pdf')});
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
