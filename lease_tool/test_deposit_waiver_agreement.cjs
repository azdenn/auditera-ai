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

  const out = await page.evaluate(async () => {
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
    const variants=['Deposit Waiver Agreement','LeaseLock Agreement','Lease Lock Addendum','LeaseLock Deposit Waiver Purchase Agreement'].map(title=>{
      const pages=JSON.parse(JSON.stringify(A1));pages[0].lines[0].text=title;
      return buildDepositWaiverAgreementCheck(extractDepositWaiverAgreement(pages),blockWithWaiver);
    });
    const incidental=JSON.parse(JSON.stringify(A1));incidental[0].lines[0].text='Please ask about the Deposit Waiver Purchase Agreement before moving in.';
    const position=(y,parts)=>({y,items:parts.map(([str,x,width])=>({str,x,width,y})),text:parts.map(p=>p[0]).join(' ')});
    const alternate=(signed=true)=>[{pageNum:35,width:612,height:792,lines:[
      position(766,[['Deposit Waiver Addendum (LeaseLock)',220,170]]),
      position(700,[['Agreement, dated ______ between ______',36,530],['November 11, 2025',142,100]]),
      position(660,[['for the premises located at ______',36,530],['100 Example Road, Testville TX',142,180]]),
      position(423,[['billing statement, in the amount of $____. The Waiver Charge',81,304],['33',222,12],['as outlined in this Agreement is valid exclusively',387,188]]),
      position(166,[['________',72,290],...(signed?[['Taylor Example',79,85]]:[]),['________',396,180],['11/13/2025',457,53]]),
      position(154,[['Resident Signature',72,68],['Date',396,17]]),
      position(34,[['Morgan Owner',79,85],['11/13/2025',457,53]]),
      position(22,[['Owner/Rep Signature',72,100],['Date',396,17]]),
    ]}];
    const altBlock={charges:[{description:'Deposit Waiver Agreement',amount:33}]};
    const altSigned=extractDepositWaiverAgreement(alternate());
    const altBlank=alternate(false);
    altBlank.push({pageNum:36,width:612,height:792,lines:[line(700,'E-SIGNATURE CERTIFICATE'),line(600,'Taylor Example 11/13/2025')]});
    // Exercise the real canvas ink fallback, not a mocked detector result.
    const inkCase=async({mark=false,date=true,price=33,broken=false}={})=>{
      const pages=alternate(false);
      if(!date)pages[0].lines[4].items=pages[0].lines[4].items.filter(it=>it.x<396);
      const agreement=extractDepositWaiverAgreement(pages),rendered=[];
      const doc={getPage:async n=>{
        rendered.push(n);if(broken)throw Error('Deliberate renderer failure');
        return {getViewport:({scale})=>({width:612*scale,height:792*scale,convertToViewportPoint:(x,y)=>[x*scale,(792-y)*scale]}),
          render:({canvasContext:ctx,viewport:v})=>({promise:Promise.resolve().then(()=>{
            const s=v.width/612;ctx.fillStyle='white';ctx.fillRect(0,0,v.width,v.height);ctx.strokeStyle='black';ctx.lineWidth=1.2*s;
            const stroke=(x,y,w)=>{ctx.beginPath();for(let t=0;t<w;t++){const yy=y+Math.sin(t/7)*8+t*0.03;t?ctx.lineTo((x+t)*s,(792-yy)*s):ctx.moveTo(x*s,(792-yy)*s);}ctx.stroke();};
            // Blank printed resident rule plus owner and date-column marks.
            ctx.beginPath();ctx.moveTo(72*s,(792-166)*s);ctx.lineTo(362*s,(792-166)*s);ctx.stroke();
            stroke(79,34,100);stroke(430,170,100);
            if(mark)stroke(90,174,110);
          })})};
      }};
      await attachDepositWaiverInkFallback(doc,agreement,pages);
      return {agreement,rendered,check:buildDepositWaiverAgreementCheck(agreement,{charges:[{description:'LeaseLock',amount:price}]})};
    };
    const handwritten=await inkCase({mark:true}),inkBlank=await inkCase(),inkUndated=await inkCase({mark:true,date:false}),inkWrongPrice=await inkCase({mark:true,price:42}),inkBroken=await inkCase({broken:true});
    const otherLayout=alternate(false);otherLayout[0].lines=otherLayout[0].lines.filter(l=>!/^Resident Signature Date$/.test(l.text)&&!/^Agreement, dated/.test(l.text));
    const unsupported=extractDepositWaiverAgreement(otherLayout);
    await attachDepositWaiverInkFallback({getPage:()=>{throw Error('Unsupported form must not be rendered');}},unsupported,otherLayout);
    return {
      handwritten,inkBlank,inkUndated,inkWrongPrice,inkBroken,unsupportedCheck:buildDepositWaiverAgreementCheck(unsupported,altBlock),
      altSigned,altCheck:buildDepositWaiverAgreementCheck(altSigned,altBlock),
      altBlankCheck:buildDepositWaiverAgreementCheck(extractDepositWaiverAgreement(altBlank),altBlock),
      altPriceCheck:buildDepositWaiverAgreementCheck(altSigned,{charges:[{description:'LeaseLock',amount:42}]}),
      variants, incidental:extractDepositWaiverAgreement(incidental),
      aliasCategories:['Deposit Waiver Agreement','Lease Lock Agreement','LeaseLock Fee'].map(s=>classify(s,ALIAS_MAP).category),
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

  check('Handwritten waiver mark passes through existing ink detector',out.handwritten.check.status==='pass'&&out.handwritten.agreement.signatureDetectedVia==='ink');
  check('Ink evidence does not invent signer identity or render another page',out.handwritten.agreement.signedBy===null&&/identity not verified/.test(out.handwritten.check.note)&&JSON.stringify(out.handwritten.rendered)==='[35]');
  check('Printed rule and owner/date-column marks cannot fill blank resident slot',out.inkBlank.check.status==='fail'&&out.inkBlank.check.blanks.some(f=>f.key==='signature'));
  check('Handwritten signature does not supply a missing date',out.inkUndated.check.status==='fail'&&out.inkUndated.check.blanks.some(f=>f.key==='signatureDate'));
  check('Handwritten signature does not hide amount mismatch',out.inkWrongPrice.check.status==='fail');
  check('Renderer failure leaves signature unverified',out.inkBroken.check.status==='fail');
  check('Unrecognized form layout remains counted manual review, not invented blank fields',out.unsupportedCheck.status==='fail'&&out.unsupportedCheck.manualReview&&out.unsupportedCheck.blanks.length===0&&/Manual review required/.test(out.unsupportedCheck.note));
  check('Supported alternative titles still require the full completed agreement',out.variants.every(c=>c.status==='pass'));
  check('One-page LeaseLock addendum recognizes integer amount and written-out date',out.altSigned.statedAmount===33&&out.altSigned.agreementDate==='November 11, 2025');
  check('One-page signature and date above their captions pass',out.altCheck.status==='pass');
  check('Blank addendum signature is not filled by owner or next-page certificate',out.altBlankCheck.status==='fail'&&out.altBlankCheck.blanks.some(f=>f.key==='signature'));
  check('One-page agreement amount difference remains a failure',out.altPriceCheck.status==='fail');
  check('A prose mention of an agreement is not an agreement title',out.incidental===null);
  check('Waiver and LeaseLock charge spellings share the same category',out.aliasCategories.every(c=>c==='DEPOSIT_WAIVER'));
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
        out.missingAgreementCheck.status === 'fail' && /No supported Deposit Waiver \/ LeaseLock agreement/.test(out.missingAgreementCheck.note)
        && /fee match does not verify/i.test(out.missingAgreementCheck.note));
  check('A blank waiver amount is itself a blank', out.noAmountCheck.blanks.some(b => b.key === 'amount'));
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass+fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
