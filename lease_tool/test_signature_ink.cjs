/* Is that a signature, or is it the line it would have been written on?
   ----------------------------------------------------------------------
   Asked for by Azden, 2026-09-06: "really dive deep into the code that is
   responsible for finding if something is signed or not... this has been a
   problem for a while so if there's a better way to do this then do it."

   What was actually wrong turned out to be the opposite of the report. The
   ink fallback counted dark pixels in a box after masking known printed
   text, and on the TAA forms the signature block is nothing BUT printed
   rules -- six ruled lines under "Signatures of All Residents". Their
   anti-aliased edges survive any hairline mask, so a genuinely blank
   signature block measured over 3,000 dark pixels. Run against a real,
   entirely unsigned lease from The Rail (unit 26), the old code reported
   9 of 12 signature slots as PRESENT. A tool that says an unsigned lease is
   signed is worse than one that says nothing.

   The fix is structural rather than another threshold. A printed rule is
   perfectly horizontal, so it puts one long unbroken dark run on a single
   scanline; handwriting is slanted and curved and never does. Rows that
   look like rules are dropped, and what is left has to look like a mark:
   tall, wide, and connected.

   These cases are synthetic on purpose -- they exercise the geometry
   directly, without needing a real resident's lease in the repo. */
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
    const W = 480, H = 200;
    const blank = () => new Uint8Array(W * H);
    const set = (b, x, y) => { if (x>=0 && x<W && y>=0 && y<H) b[y*W+x] = 1; };
    // A printed rule: one perfectly flat row, plus the fainter anti-aliased
    // row above and below that a real renderer produces.
    const rule = (b, y, x0, x1) => {
      for (let x = x0; x <= x1; x++){
        set(b, x, y);
        if (x % 2 === 0){ set(b, x, y-1); set(b, x, y+1); }
      }
    };
    // A signature: a slanted, looping stroke. Thin, so no single scanline
    // carries much of it.
    const signature = (b, x0, y0, len, amp) => {
      for (let t = 0; t < len; t++){
        const x = x0 + t;
        const y = Math.round(y0 + Math.sin(t / 7) * amp + t * 0.06);
        set(b, x, y); set(b, x, y+1); set(b, x+1, y);
      }
    };
    // A logo/stamp: a filled solid block.
    const blob = (b, x0, y0, w, h) => {
      for (let y = y0; y < y0+h; y++) for (let x = x0; x < x0+w; x++) set(b, x, y);
    };

    const cases = {};

    cases.empty = blank();

    const rulesOnly = blank();
    [40, 70, 100, 130, 160].forEach(y => rule(rulesOnly, y, 20, 300));
    cases.rulesOnly = rulesOnly;

    const rulesAndSpeckle = blank();
    [40, 70, 100, 130, 160].forEach(y => rule(rulesAndSpeckle, y, 20, 300));
    [[55,55],[120,58],[200,132],[260,90],[310,45]].forEach(([x,y]) => set(rulesAndSpeckle, x, y));
    cases.rulesAndSpeckle = rulesAndSpeckle;

    const signed = blank();
    [40, 70, 100, 130, 160].forEach(y => rule(signed, y, 20, 300));
    signature(signed, 40, 30, 150, 8);
    cases.signed = signed;

    const logoOnly = blank();
    rule(logoOnly, 100, 20, 300);
    blob(logoOnly, 380, 120, 44, 40);
    cases.logoOnly = logoOnly;

    const logoAndSignature = blank();
    rule(logoAndSignature, 100, 20, 300);
    blob(logoAndSignature, 380, 120, 44, 40);
    signature(logoAndSignature, 40, 80, 150, 8);
    cases.logoAndSignature = logoAndSignature;

    // A tiny stray mark -- a dust speck or a JPEG artifact, not a signature.
    const speck = blank();
    blob(speck, 200, 100, 5, 5);
    cases.speck = speck;

    // A vertical table border in the box, plus a real signature.
    const borderAndSignature = blank();
    for (let y = 0; y < H; y++) { set(borderAndSignature, 450, y); set(borderAndSignature, 451, y); }
    signature(borderAndSignature, 40, 80, 150, 8);
    cases.borderAndSignature = borderAndSignature;

    const res = {};
    for (const k of Object.keys(cases)){
      const m = analyzeInkBitmap(cases[k], W, H);
      res[k] = { m, signed: inkLooksLikeSignature(m) };
    }
    return res;
  });

  check('An empty box is not a signature', out.empty.signed === false);
  check('The blank ruled signature block -- the whole bug -- is not a signature',
        out.rulesOnly.signed === false);
  check('...and its rules really were seen as ink before suppression (the old code counted these)',
        out.rulesOnly.m.rawDark > 1000);
  check('...with essentially nothing left after the rules are dropped',
        out.rulesOnly.m.freeDark < 40);
  check('Ruled lines plus a few stray specks are still not a signature',
        out.rulesAndSpeckle.signed === false);
  check('A signature written across those same ruled lines IS detected',
        out.signed.signed === true);
  check('...and it survives as connected ink, not crumbs',
        out.signed.m.largestComponent >= 22 && out.signed.m.inkRows >= 6);
  check('A solid logo sitting in the box is not a signature',
        out.logoOnly.signed === false);
  check('...but a real signature next to that same logo still counts',
        out.logoAndSignature.signed === true);
  check('A 5x5 speck is not a signature', out.speck.signed === false);
  check('A vertical table border does not hide the signature beside it',
        out.borderAndSignature.signed === true);
  /* The real thing, both ways round, from one real page.

     gca_test/a309_p18_crop.png is a rendered crop of a genuinely SIGNED
     Garden Creek lease: a hand-drawn resident signature sitting just above
     its ruled line, with four more blank ruled lines beneath it. The same
     image therefore holds both cases the analysis has to separate, and it
     is the case the pixel fallback exists for at all -- pdf.js's text layer
     cannot see a wet-ink mark no matter how legible it is.

     Skipped rather than failed when the crop isn't present, so the suite
     still runs in a checkout without the real-document fixtures. */
  const fs = require('fs');
  const cropPath = path.resolve('./gca_test/a309_p18_crop.png');
  if (fs.existsSync(cropPath)){
    const real = await page.evaluate(async (dataUrl) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = dataUrl; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', {willReadFrequently:true});
      ctx.drawImage(img, 0, 0);
      const band = (y0, y1) => {
        const w = img.width, h = Math.min(y1, img.height) - y0;
        const d = ctx.getImageData(0, y0, w, h).data;
        const m = analyzeInkBitmap(inkDarkBitmap(d, w, h, 0, 0, []), w, h);
        return { m, signed: inkLooksLikeSignature(m) };
      };
      return { mark: band(80, 118), blank: band(140, 241) };
    }, 'data:image/png;base64,' + fs.readFileSync(cropPath).toString('base64'));

    check('REAL PAGE: the hand-drawn Garden Creek signature is detected', real.mark.signed === true);
    check('REAL PAGE: the four blank ruled lines under it are not', real.blank.signed === false);
    check('REAL PAGE: those blank rules really are thousands of dark pixels...', real.blank.m.rawDark > 2000);
    check('REAL PAGE: ...and every one of them is accounted for as a printed rule', real.blank.m.freeDark === 0);
  } else {
    console.log('SKIP -- gca_test/a309_p18_crop.png not present (real-document fixture)');
  }

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass+fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
