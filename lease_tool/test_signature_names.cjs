/* A signature is a name, not a capitalised word from the page.
   ----------------------------------------------------------------------
   The other half of the 2026-09-06 signature rework. Alongside the pixel
   fallback, signatures are found by reading names near a caption -- and that
   reader had been loosened, one real-world false negative at a time, until
   it accepted ordinary printed contract text as a signer.

   Measured on a real, entirely UNSIGNED lease from The Rail (unit 26), it
   pulled all four of these out of printed body copy and counted each as a
   signature:
       "Revised October Page"        (the TAA form's own footer)
       "TAA Official Statewide"      (the copyright line)
       "Lease is" / "Miscellaneous. If"  (running paragraph text)

   Three guards fixed it, and this file holds them to it:
     1. document vocabulary (lease, form, page, TAA, October...) disqualifies
        a candidate outright -- that is the printed page talking;
     2. a line long enough to be running prose is not a signature line, no
        matter what words are in it;
     3. a name pulled OUT of a long line is only believed when it matches a
        resident the Rent Roll says should be on this lease.

   Guard 2 has to measure VISIBLE characters: on these forms the blank
   signature rule is drawn by tiling a control-character glyph, and on a
   signed lease that rule shares a text line with the signature, which made a
   13-character signature measure as a 79-character paragraph. */
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
    const RULE = '\b'.repeat(32); // how these forms draw a blank signature line
    // One line of a page record. x/width let the column filters work.
    const L = (y, parts) => {
      const items = parts.map(([str, x, w]) => ({ str, x, y, width: w == null ? str.length * 5 : w }));
      return { y, items, text: items.map(i => i.str).join(' ').replace(/\s+/g,' ').trim() };
    };
    const PR = (lines) => ({ pageNum: 1, width: 612, height: 792, lines });

    const res = {};

    // --- the four real false positives, as they appeared on the page ---
    res.footer = looksLikeNameText(cleanNameCandidate(
      'Apartment Lease Contract, TAA Official Statewide Form 25-A/B-1/B-2 Revised October 2025 Page 6 of 6'));
    res.runFromFooter = extractNameRunFromLine(cleanNameCandidate(
      'Apartment Lease Contract, TAA Official Statewide Form 25-A/B-1/B-2 Revised October 2025 Page 6 of 6'));
    res.leaseIs = looksLikeNameText(cleanNameCandidate('this Lease. If this Lease is'));
    res.property = looksLikeNameText(cleanNameCandidate('property;'));

    // --- invented names still read as names ---
    res.plainName = looksLikeNameText(cleanNameCandidate('Taylor OBrien'));
    res.kernedName = looksLikeNameText(cleanNameCandidate('Tabitha S ampl e'));
    res.kernedName2 = looksLikeNameText(cleanNameCandidate('Emm a Tes ting s'));
    res.surnameOnly = looksLikeNameText(cleanNameCandidate('OBrien'));

    // --- expected-name matching, incl. kerning-split and surname-only ---
    res.matchSplit = matchesExpectedName('Alexi a Sample s', ['Alexia Samples']);
    res.matchSurname = matchesExpectedName('OBrien', ["Taylor O'Brien"]);
    res.matchWrong = matchesExpectedName('Revised October Page', ["Taylor O'Brien"]);

    // --- collectNamesNear in context ---
    // An UNSIGNED block: caption, blank rule, and body copy nearby.
    const unsigned = PR([
      L(400, [['Signatures of All Residents', 54, 130]]),
      L(380, [[RULE, 54, 250]]),
      L(360, [['Apartment Lease Contract, TAA Official Statewide Form 25-A/B-1/B-2 Revised October 2025 Page 6 of 6', 54, 500]]),
    ]);
    res.unsignedNames = collectNamesNear(unsigned, 400, {windowUp:60, windowDown:60, expected:['Jordan Finch']});

    // A SIGNED block: the signature shares its text line with the rule.
    const signed = PR([
      L(400, [['Signatures of All Residents', 54, 130]]),
      L(380, [[RULE, 54, 250], ['Taylor', 60, 40], ['OBrien', 100, 40]]),
    ]);
    res.signedNames = collectNamesNear(signed, 400, {windowUp:60, windowDown:60, expected:["Taylor O'Brien"]});

    // A two-column page where pdf.js hands back the left column's paragraph
    // and the right column's signature as ONE line (a real layout, confirmed
    // on a signed lease). Bounded to the owner's own column, the signature
    // reads cleanly.
    const twoCol = PR([
      L(146, [['Owner or Owner’s Representative', 315, 125], ['(signing on behalf of owner)', 440, 128]]),
      L(129, [['31.', 36, 12], ['Waivers.', 52, 34], ['By signing this Lease, you agree to the following', 88, 220],
              [RULE, 315, 250], ['Emm', 320, 18], ['a', 340, 6], ['Tes', 348, 20], ['ting', 371, 14], ['s', 386, 5]]),
    ]);
    res.ownerColumn = collectNamesNear(twoCol, 146, {windowUp:60, windowDown:60, minX:255, expected:['Brian Moore']});
    res.ownerNoColumn = collectNamesNear(twoCol, 146, {windowUp:60, windowDown:60, expected:['Brian Moore']});

    const caption=L(458,[['(Name of Resident)',36,60],['Date signed',253,38],['Date signed',538,38]]);
    const row=(signed)=>PR([caption,L(470,[[RULE,36,254],...(signed?[['Tay',42,18],['lor',60,17],['Sample',80,40]]:[]),['08/27/2025',236,53],[RULE,314,254],['Morgan Example',319,100],['08/28/2025',519,53]])]);
    res.rowSigned=extractSignatureFindings([row(true)],['Taylor Sample']).find(f=>f.kind==='row-resident');
    res.rowBlank=extractSignatureFindings([row(false)],['Taylor Sample']).find(f=>f.kind==='row-resident');
    res.whitespaceMasks=pageGlyphRects(PR([L(470,[[' ',110,900],['',20,0]])])).length;
    res.underscoreMask=pageGlyphRects(PR([{y:470,items:[{str:'_'.repeat(54),x:36,y:467,width:254}],text:'_'.repeat(54)}]))[0];
    return res;
  });

  check('The TAA form footer is not a signer', out.footer === false);
  check('...and no name can be carved out of it either', !out.runFromFooter || out.runFromFooter.indexOf('Revised') === -1);
  check('A fragment of a lease sentence is not a signer', out.leaseIs === false);
  check('The single word "property" is not a signer', out.property === false);

  check('A plain e-signature still reads as a name', out.plainName === true);
  check('A kerning-split signature still reads as a name', out.kernedName === true);
  check('...including one split into five fragments', out.kernedName2 === true);
  check('A surname-only signature still reads as a name', out.surnameOnly === true);

  check('A kerning-split name matches the resident it belongs to', out.matchSplit === true);
  check('A surname-only signature matches its full resident name', out.matchSurname === true);
  check('Form boilerplate matches no resident', out.matchWrong === false);

  check('An unsigned block with body copy beside it yields NO names', out.unsignedNames.length === 0);
  check('A signature sharing its line with the blank rule IS read', out.signedNames.length > 0);
  check('...and it is the resident, not the rule', /OBrien/.test(out.signedNames.join(' ')));
  check('An owner signature merged with the other column\'s paragraph is read once the column is bounded',
        out.ownerColumn.length > 0 && /Tes/.test(out.ownerColumn.join(' ')));
  check('...and without the column bound, that same line reads as prose (which is why the bound exists)',
        out.ownerNoColumn.length === 0);
  check('Per-resident caption isolates a split signature from the owner and dates',out.rowSigned.present);
  check('Owner signature cannot fill a blank resident caption',!out.rowBlank.present);
  check('Layout whitespace does not mask hundreds of pixels of signature ink',out.whitespaceMasks===0);
  check('Ordinary underscores get a thin mask at their own baseline, not the grouped text baseline',out.underscoreMask.y0===465.5&&out.underscoreMask.y1===468.5);
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass+fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
