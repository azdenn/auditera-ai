// Regression for Azden's 2026-08-31 request:
//
//   "the mismatches on signature check is really hard to read. can we
//    simplify it to the following:
//      Signatures
//      Missing Owner or Owner's Representative (5 total): pages 14, 18, 20, 22, 29
//      Missing Resident Signatures (0 total)"
//
// The flat mismatch list used to print every missing signature slot end to
// end -- signer, page, and the addendum's full title -- joined with
// semicolons. On a real Rail lease with five missing owner signatures that
// filled the cell with repeated boilerplate and buried the only two facts a
// reader wants: how many, and which pages.
//
// Both lines are ALWAYS emitted, including the zero one. "Missing Resident
// Signatures (0 total)" is the difference between "the residents signed
// everywhere" and "nobody looked", and the reader cannot tell those apart
// from an absent line.
//
// The count is the number of missing signature SLOTS and the pages are the
// DISTINCT pages they fall on, which is why the two can disagree -- two
// unsigned owner blocks on one page is "2 total: page 14". Asserted below
// so nobody later "fixes" it into counting pages.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' -- ' + name); cond ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);
  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));
  await page.reload();

  const out = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS = new Set();
    const missing = [
      { page: 14, kind: 'anchor-owner', signer: "Owner or Owner's Representative", section: 'LEASE ADDENDUM FOR SATELLITE DISH OR ANTENNA' },
      { page: 18, kind: 'anchor-owner', signer: "Owner or Owner's Representative", section: 'LEASE ADDENDUM FOR WASHING MACHINE AND DRYER' },
      { page: 20, kind: 'anchor-owner', signer: "Owner or Owner's Representative", section: '9. Your responsibility for conduct of occupants' },
      { page: 22, kind: 'anchor-owner', signer: "Owner or Owner's Representative", section: 'Mold Information and Prevention' },
      { page: 29, kind: 'anchor-owner', signer: "Owner or Owner's Representative", section: 'Community Policies' },
    ];
    unitEntries = [{
      unit: '26', unitKey: '26', residents: 'Jordan Finch', category: 'mismatch', rows: [],
      verify: { checks: [ { key:'signatures', label:'Signatures', status:'fail', missing, findings: missing } ] },
    },
    // A unit where the RESIDENT slots are the missing ones, to prove the
    // split is by kind and not by whichever list happens to be first.
    {
      unit: 'J2', unitKey: 'J2', residents: 'Shirley Maya, Joe Maya', category: 'mismatch', rows: [],
      verify: { checks: [ { key:'signatures', label:'Signatures', status:'fail', findings: [], missing: [
        { page: 7, kind: 'row-resident', signer: 'Joe Maya', section: 'AFTER MOVING IN OR SIGNING THIS ADDENDUM' },
        { page: 7, kind: 'anchor-resident', signer: 'All Residents', section: 'Mold Information and Prevention' },
      ] } ] },
    }];
    const rows = buildFlatIssuesRows();
    renderFlatIssuesTable();
    return { rows, bodyText: document.getElementById('flat-issues-body').innerText };
  });

  const owner = out.rows.find(r => r.unit === '26');
  const resident = out.rows.find(r => r.unit === 'J2');

  check('The signature row carries two summary lines, not one run-on string',
        !!owner && Array.isArray(owner.noteLines) && owner.noteLines.length === 2);
  check('Line 1 counts the owner signatures and lists their pages',
        !!owner && owner.noteLines[0] === "Missing Owner or Owner's Representative (5 total): pages 14, 18, 20, 22, 29");
  check('Line 2 is present even at zero, so the reader knows it was checked',
        !!owner && owner.noteLines[1] === 'Missing Resident Signatures (0 total)');
  check('The addendum titles are gone from the summary',
        !!owner && !owner.noteLines.join(' ').includes('SATELLITE DISH'));
  check('Both resident kinds (per-signer rows and generic anchors) count as resident',
        !!resident && resident.noteLines[1] === 'Missing Resident Signatures (2 total): page 7');
  check('...and the owner line still reports zero for that unit',
        !!resident && resident.noteLines[0] === "Missing Owner or Owner's Representative (0 total)");
  check('Two slots on ONE page reads as 2 total, one page -- slots and pages are different counts',
        !!resident && /\(2 total\): page 7$/.test(resident.noteLines[1]));
  check('The rendered table actually shows the summary',
        out.bodyText.includes("Missing Owner or Owner's Representative (5 total)") &&
        out.bodyText.includes('Missing Resident Signatures (0 total)'));
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
