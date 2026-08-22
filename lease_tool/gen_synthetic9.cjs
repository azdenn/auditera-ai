const { chromium } = require('playwright');
const path = require('path');

// Regression fixture for the "active lease = end date in the future" rule.
// Unit A105 gets two signed candidate files:
//   - an OLDER-started lease (2025) whose term has ALREADY ENDED (past end
//     date) -- superseded, even though its own start date is earlier and
//     it's fully signed.
//   - a NEWER lease whose term END DATE IS STILL IN THE FUTURE -- this is
//     the one that should win, because it's the one actually in effect
//     today, regardless of how the other candidate's dates compare.
// Also includes A106: two candidates that are BOTH already expired (a
// realistic month-to-month rollover scenario -- no new signed lease on file
// yet) to confirm this does NOT get force-flagged as "needs review" just
// because neither is active; it should fall back to normal tiebreaking.
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

  // A105: expired-but-earlier-start (should LOSE) vs active-future-end (should WIN)
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A105', rent:'1150.00', termStart:'06/01/2025', termEnd:'05/31/2026', signed:true}));
    await page.pdf({path: path.resolve('./synthetic_a105_expired_earlier.pdf')});
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A105', rent:'1195.00', termStart:'06/01/2026', termEnd:'05/31/2027', signed:true}));
    await page.pdf({path: path.resolve('./synthetic_a105_active_future.pdf')});
    await page.close();
  }

  // A106: both expired (month-to-month rollover realistic case) -- later
  // start date among the two should still win via the startTime tiebreak,
  // not get force-flagged ambiguous.
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A106', rent:'1100.00', termStart:'01/01/2024', termEnd:'12/31/2024', signed:true}));
    await page.pdf({path: path.resolve('./synthetic_a106_expired_old.pdf')});
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.setContent(leaseHtml({unit:'A106', rent:'1120.00', termStart:'01/01/2025', termEnd:'12/31/2025', signed:true}));
    await page.pdf({path: path.resolve('./synthetic_a106_expired_recent.pdf')});
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
