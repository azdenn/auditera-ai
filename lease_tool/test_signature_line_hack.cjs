// Regression for: "for C101, C301, and A309, the signatures are saying that
// they didnt sign them when they did." Root cause #1 (this file): the PDF
// draws the blank underline beneath EVERY "Signatures of All Residents"
// slot (signed or not) by tiling a single glyph across the line's width,
// using a font whose ToUnicode mapping doesn't resolve back to a real
// character -- on the real Garden Creek Apartments leases this decodes as
// 47 repeated backspace (\x08) characters. Because the ink-detection mask
// treated every text glyph as "real printed content to protect", including
// this one, it was masking out a ~15pt-tall band around the line -- tall
// enough to fully cover a genuine hand-drawn signature written just above
// it. Confirmed directly against A309's real lease: a clearly visible
// signature produced 0 counted dark pixels because the whole scan box fell
// inside that mask.
//
// The fix narrows the mask for this specific kind of glyph run down to a
// thin hairline (just enough to hide the printed line itself) instead of
// the generous padding used for real text, so genuine ink drawn around it
// is no longer erased before the scan ever sees it. This test verifies the
// underlying classifier and masking geometry directly, deterministically --
// no PDF rendering involved -- so it can't be broken by unrelated changes
// to how pages are parsed or rendered.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const result = await page.evaluate(() => {
    const out = {};

    // 1. The classifier itself: must recognize a repeated-control-character
    // run (the real-world pattern) but must NOT misfire on ordinary text,
    // including text that happens to repeat a character several times
    // (e.g. "AAAAA" or a run of real underscores/dashes some other PDF
    // generator might use instead of control characters).
    out.detectsBackspaceRun = isLineDrawingGlyphRun('\b'.repeat(47));
    out.detectsShortBackspaceRun = isLineDrawingGlyphRun('\b\b\b\b\b'); // exactly the length-5 floor
    out.ignoresTooShortRun = !isLineDrawingGlyphRun('\b\b\b\b'); // one under the floor
    out.ignoresRealCaption = !isLineDrawingGlyphRun('Signatures of All Residents');
    out.ignoresRepeatedRealChar = !isLineDrawingGlyphRun('AAAAAAAAAA'); // repeated but printable
    out.ignoresRepeatedUnderscore = !isLineDrawingGlyphRun('__________'); // repeated but printable
    out.ignoresEmpty = !isLineDrawingGlyphRun('');
    out.ignoresNull = !isLineDrawingGlyphRun(null);

    // 2. The masking geometry: a line-drawing glyph run must get a much
    // thinner vertical mask than real text, at the same line.y -- this is
    // the actual mechanism that stops it from swallowing genuine ink.
    const lineY = 656.9998;
    const prSynthetic = {
      pageNum: 17,
      width: 612,
      lines: [
        // The real A309 case: a 47-char backspace run masquerading as the
        // blank signature line.
        { y: lineY, items: [ { str: '\b'.repeat(47), x: 32.56, width: 261.32 } ] },
        // A normal caption line right below it, for contrast -- must keep
        // getting the full, generous mask (this is real printed text that
        // genuinely needs the wide protection).
        { y: 646.9998, items: [ { str: 'Signatures of All Residents', x: 27, width: 119.5 } ] },
      ],
    };
    const rects = pageGlyphRects(prSynthetic);
    const lineDrawRect = rects.find(r => Math.abs(r.y0 - (lineY - 1.5)) < 0.001);
    const captionRect = rects.find(r => Math.abs(r.y0 - (646.9998 - 3)) < 0.001);
    out.lineDrawMaskHeight = lineDrawRect ? (lineDrawRect.y1 - lineDrawRect.y0) : null;
    out.captionMaskHeight = captionRect ? (captionRect.y1 - captionRect.y0) : null;
    // The thin mask must still fully cover the printed line's own vertical
    // position (i.e. still centered on line.y, not just made thin AND
    // shifted away from where the line actually is).
    out.lineDrawMaskCoversLineY = lineDrawRect ? (lineDrawRect.y0 <= lineY && lineDrawRect.y1 >= lineY) : false;

    return out;
  });

  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['Classifier detects the real 47x-backspace run', result.detectsBackspaceRun === true],
    ['Classifier detects a 5-char run (the floor)', result.detectsShortBackspaceRun === true],
    ['Classifier ignores a 4-char run (under the floor -- avoids misfiring on short real text)', result.ignoresTooShortRun === true],
    ['Classifier does NOT flag a real printed caption as a line-drawing hack', result.ignoresRealCaption === true],
    ['Classifier does NOT flag repeated printable characters ("AAAA...")', result.ignoresRepeatedRealChar === true],
    ['Classifier does NOT flag a repeated literal underscore run', result.ignoresRepeatedUnderscore === true],
    ['Classifier handles empty string safely', result.ignoresEmpty === true],
    ['Classifier handles null safely', result.ignoresNull === true],
    ['Line-drawing glyph gets a thin 3pt mask (not the normal 15pt)', result.lineDrawMaskHeight === 3],
    ['Real text (the caption) still gets the normal generous 15pt mask', result.captionMaskHeight === 15],
    ['The thin mask still actually covers the printed line\'s own position', result.lineDrawMaskCoversLineY === true],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
