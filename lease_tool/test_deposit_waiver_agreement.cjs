/* If they're being billed LeaseLock, did anyone actually sign for it?
   ----------------------------------------------------------------------
   Asked for by Azden, 2026-09-06: "if a unit has a leaselock payment or they
   are paying leaselock i want you to make sure that this part of the lease is
   correctly filled out, almost like a signature checkmark."

   Two real leases from The Rail, same property, same form, same generator:
     A1  -- property, resident, lease date, premises, $42.00 waiver amount,
             resident e-signature and date: all present.
     26  -- everything filled in EXCEPT the resident signature and its date.
   Unit 26 is billed a deposit waiver every month against an agreement nobody
   signed, and nothing else in the audit would have said so.

   The check also compares the amount the agreement states against the amount
   the Rent Roll bills: the agreement's figure is what the resident agreed to
   pay, so a difference is a real finding, not a rounding note. */
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
    const U = '_'.repeat(60);
    // Page records shaped exactly like the real ones: pdf.js merges the
    // typed value onto the same text line as the printed label and its rule.
    const line = (y, text) => ({ y, text, items: [{str: text, x: 36, y, width: 500}] });
    const agreementPages = (opts) => ([
      { pageNum: 24, width: 612, height: 792, lines: [
        line(748, 'Deposit Waiver Purchase Agreement'),
        line(726, 'This document is an agreement (this “Agreement”) between Rail ' + U + ' at Georgetown'),
        line(715, '(the “Property”) and ' + U + ' ' + opts.resident),
        line(672, 'Agreement, dated ' + (opts.leaseDate || '') + ' ' + U + ' between ' + U + ' Rail at Georgetown (the'),
        line(628, 'for the premises located at ' + U + ' ' + (opts.premises || '') + ' .'),
        line(404, 'billing statement, in the amount of $' + '_'.repeat(12) + '. The Waiver as outlined in this Agreement is valid exclusively for the lease ' + (opts.amount || '')),
      ]},
      { pageNum: 25, width: 612, height: 792, lines: [
        line(722, 'Resident Signature: ' + U + ' ' + (opts.signature || '') + ' Date:' + '_'.repeat(30) + ' ' + (opts.signatureDate || '')),
        line(698, 'Resident Name: ' + U + ' ' + (opts.printedName || '')),
        line(659, 'Resident Signature: ' + U + ' Date:' + '_'.repeat(30)),
        line(634, 'Resident Name: ' + U),
      ]},
      { pageNum: 26, width: 612, height: 792, lines: [ line(755, 'E-SIGNATURE CERTIFICATE') ]},
    ]);

    const A1 = agreementPages({ resident:"Taylor O'Brien", leaseDate:'04/27/2026',
      premises:'710 W 13th St. A1 #A1, Georgetown, TX 78626', amount:'42.00',
      signature:'Taylor OBrien', signatureDate:'04/27/2026', printedName:"Taylor O'Brien" });
    const U26 = agreementPages({ resident:'Jordan Finch', leaseDate:'03/05/2026',
      premises:'700 W. 14th St. 26 #26, Georgetown, TX 78626', amount:'42.00',
      signature:'', signatureDate:'', printedName:'Jordan Finch' });
    const NO_AMOUNT = agreementPages({ resident:'Jordan Finch', leaseDate:'03/05/2026',
      premises:'700 W. 14th St. 26 #26, Georgetown, TX 78626', amount:'',
      signature:'Jordan Finch', signatureDate:'03/05/2026', printedName:'Jordan Finch' });

    const plainLease = [{ pageNum: 1, width: 612, height: 792, lines: [ line(700, 'Apartment Lease Contract') ]}];

    const blockWithWaiver = { unit:'26', charges: [
      {description:'Rent', amount:1200}, {description:'Deposit Waiver', amount:42} ] };
    const blockWaiverDifferent = { unit:'26', charges: [ {description:'LeaseLock', amount:55} ] };
    const blockNoWaiver = { unit:'26', charges: [ {description:'Rent', amount:1200} ] };

    const a1 = extractDepositWaiverAgreement(A1);
    const u26 = extractDepositWaiverAgreement(U26);
    return {
      a1, u26,
      none: extractDepositWaiverAgreement(plainLease),
      a1Check: buildDepositWaiverAgreementCheck(a1, blockWithWaiver),
      u26Check: buildDepositWaiverAgreementCheck(u26, blockWithWaiver),
      amountCheck: buildDepositWaiverAgreementCheck(a1, blockWaiverDifferent),
      noWaiverCheck: buildDepositWaiverAgreementCheck(u26, blockNoWaiver),
      missingAgreementCheck: buildDepositWaiverAgreementCheck(null, blockWithWaiver),
      noAmountCheck: buildDepositWaiverAgreementCheck(extractDepositWaiverAgreement(NO_AMOUNT), blockWithWaiver),
    };
  });

  check('A lease with no waiver agreement returns nothing at all', out.none === null);
  check('The agreement is located, on its own page', out.a1 && out.a1.page === 24);
  check('The monthly waiver amount is read off the agreement', out.a1.statedAmount === 42);
  check('The premises are read', /710 W 13th St/.test(out.a1.premises || ''));
  check('The lease agreement date is read', out.a1.agreementDate === '04/27/2026');
  check('The resident signature is read', out.a1.signedBy === 'Taylor OBrien');
  check('...and its date', out.a1.signedDate === '04/27/2026');
  check('The printed resident name is read', /Taylor/.test(out.a1.printedName || ''));

  check('A fully completed, signed agreement passes', out.a1Check.status === 'pass');
  check('...and says who signed it', /Taylor/.test(out.a1Check.note));

  check('THE BUG: an unsigned agreement fails', out.u26Check.status === 'fail');
  check('...naming the signature as the blank', out.u26Check.blanks.some(b => b.key === 'signature'));
  check('...and the signature date too', out.u26Check.blanks.some(b => b.key === 'signatureDate'));
  check('...while the fields that WERE filled are not reported as blank',
        !out.u26Check.blanks.some(b => ['amount','premises','leaseDate','residentName'].includes(b.key)));
  check('...and the note names the page to look at', /page 24/.test(out.u26Check.note));

  check('An agreement stating a different amount than the Rent Roll bills fails',
        out.amountCheck.status === 'fail' && /\$42\.00/.test(out.amountCheck.note) && /\$55\.00/.test(out.amountCheck.note));

  check('A unit with no waiver charge is not checked at all', out.noWaiverCheck === null);
  check('Billing a waiver with no agreement in the lease fails',
        out.missingAgreementCheck.status === 'fail' && /no Deposit Waiver Purchase Agreement/.test(out.missingAgreementCheck.note));
  check('A blank waiver amount is itself a blank', out.noAmountCheck.blanks.some(b => b.key === 'amount'));
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass+fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
