/* A lease sitting in another unit's folder.
   ----------------------------------------------------------------------
   Reported by Rajeev from a real Rail export, 2026-08-31:

     "there are 2 folders labeled '7'. however the lease for Morgan is
      actually unit Y1 on the lease itself. so LeaseVerify partially got it
      correct, but it needs to always check the lease itself for the 'truth'
      and then highlight any issues it finds like this one."

   The Rent Roll has BOTH a unit 7 and a unit Y1, and lists Morgan under Y1.
   resolveUnitKey takes the first EXACT Rent Roll match and offers the folder
   name first, so the folder won and a Y1 lease was reconciled against unit
   7's charges -- a page of confident findings about a resident who does not
   live there.

   What must NOT change: the folder still beats the lease's typed unit field
   in every ordinary case. A typed "Apartment No." is filled in by whoever
   completed the form and is wrong far more often than a ResMan folder name.
   The new rule fires only when BOTH identifiers hit a real Rent Roll unit
   EXACTLY and they disagree -- which a typo cannot produce.

   Cases below:
     1. the real bug        folder 7, lease Y1, Morgan on Y1  -> Y1 wins, flagged
     2. residents override  folder 7, lease Y1, resident on 7  -> 7 wins, still flagged
     3. ordinary typo       folder A101, lease "A10l"          -> folder wins, silent
     4. agreement           folder A101, lease A101            -> silent
     5. no folder           single-file upload                 -> silent
*/
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

  const out = await page.evaluate(() => {
    const blocks = new Map([
      ['7',    { unit: '7',    residents: 'Steven Powers' }],
      ['Y1',   { unit: 'Y1',   residents: 'Morgan Example' }],
      ['A101', { unit: 'A101', residents: 'Nancy Flagle' }],
    ]);
    const r = (folder, leaseUnit, leaseResidents) =>
      resolveLeaseUnitKey(folder == null ? [] : [folder], leaseUnit, blocks, leaseResidents);

    const realBug   = r('7', 'Y1', 'Morgan Example');
    const flipped   = r('7', 'Y1', 'Steven Powers');
    const noNames   = r('7', 'Y1', null);
    const typo      = r('A101', 'A10l', 'Nancy Flagle');
    const agree     = r('A101', 'A101', 'Nancy Flagle');
    const singleFile= r(null, 'A101', 'Nancy Flagle');

    // and the check the UI actually renders
    const verify = { checks: [], failCount: 0 };
    appendLeaseFilingCheck(verify, realBug.unitConflict);
    const c = verify.checks[0];
    return { realBug, flipped, noNames, typo, agree, singleFile,
             checkKey: c && c.key, checkStatus: c && c.status, failCount: verify.failCount,
             checkNote: c && c.note, title: c && verifyCheckTitle(c),
             row: c && verifyRowValues(c) };
  });

  check('THE REAL BUG: a Y1 lease in folder 7 is paired with Y1, not 7',
        out.realBug.key === 'Y1');
  check('...and it is not silent -- a conflict is reported',
        !!out.realBug.unitConflict && out.realBug.unitConflict.folderUnit === '7' && out.realBug.unitConflict.leaseUnit === 'Y1');
  check('...decided by the Rent Roll listing that resident under Y1',
        out.realBug.unitConflict.why === 'lease-residents');

  check('RESIDENTS OUTRANK BOTH: when the Rent Roll puts this resident on 7, 7 wins',
        out.flipped.key === '7' && out.flipped.unitConflict.why === 'folder-residents');
  check('...and that case is still flagged, because the lease is still misfiled',
        !!out.flipped.unitConflict);

  check('With no names to decide, the unit printed on the lease is believed',
        out.noNames.key === 'Y1' && out.noNames.unitConflict.why === 'lease');

  check('AN ORDINARY TYPO DOES NOT FIRE: "A10l" matches nothing exactly, folder still wins',
        out.typo.key === 'A101' && out.typo.unitConflict === null);
  check('Folder and lease agreeing is silent',
        out.agree.key === 'A101' && out.agree.unitConflict === null);
  check('A single-file upload with no folder is silent',
        out.singleFile.key === 'A101' && out.singleFile.unitConflict === null);

  check('It surfaces as a real failing check, not a buried note',
        out.checkKey === 'leaseFiling' && out.checkStatus === 'fail' && out.failCount === 1);
  check('The title names both units so the row is readable at a glance',
        /Unit 7/.test(out.title) && /Y1/.test(out.title));
  check('The note tells the reader what to actually do about it',
        /moved into the right folder/.test(out.checkNote));
  check('The note is shown even though the check is a fail, not "unable"',
        !!(out.row && out.row.note));
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
