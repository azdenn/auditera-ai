const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Regression test for the real A109 lease: page 7 has two genuinely-signed
// locations (resident "Angela Sanchez" and the owner signature) whose
// printed names render on the SAME text line as trailing paragraph prose
// ("...local Angel a Sanche z"), which previously made the whole line fail
// looksLikeNameText's 6-word cutoff -- both the text check AND the ink
// fallback (which also failed on that page) reported "missing". Confirms
// the extractNameRunFromLine fallback fixes this without needing ink, and
// separately confirms the flood-disclosure blank fixture (dense prose
// including capitalized phrases like "Federal Emergency Management Agency")
// still correctly reports "missing" when truly unsigned -- i.e. this fix
// doesn't reopen the paragraph-contamination false-positive bug.
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  async function parseFixture(filePath){
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString('base64');
    return await page.evaluate(async (b64) => {
      function b64ToBuf(b64){
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
        return arr.buffer;
      }
      const parsed = await parseLeasePdfFromBuffer(b64ToBuf(b64));
      return {
        unit: parsed.unit,
        findings: (parsed.verification.signatureFindings || []).map(f => ({
          page: f.page, section: f.section, signer: f.signer, present: f.present, kind: f.kind, detectedVia: f.detectedVia,
        })),
      };
    }, b64);
  }

  console.log('=== Real A109 lease (sample_lease.pdf) ===');
  const a109 = await parseFixture(path.resolve(__dirname, 'sample_lease.pdf'));
  console.log('Unit:', a109.unit);
  console.log('Total findings:', a109.findings.length);
  const missing = a109.findings.filter(f => !f.present);
  console.log('Missing findings (should be EMPTY -- real lease is fully signed):', JSON.stringify(missing, null, 2));
  const page7 = a109.findings.filter(f => f.page === 7);
  console.log('Page 7 findings:', JSON.stringify(page7, null, 2));

  console.log('\n=== Synthetic flood-disclosure SIGNED (should be all present) ===');
  const floodSigned = await parseFixture(path.resolve(__dirname, 'synthetic_flood_signed.pdf'));
  console.log(JSON.stringify(floodSigned.findings, null, 2));

  console.log('\n=== Synthetic flood-disclosure BLANK (should be all MISSING -- dense prose incl. "Federal Emergency Management Agency" must not false-positive) ===');
  const floodBlank = await parseFixture(path.resolve(__dirname, 'synthetic_flood_blank.pdf'));
  console.log(JSON.stringify(floodBlank.findings, null, 2));

  console.log('\n=== Synthetic ink-signed (hand-drawn scribble, no typed text) ===');
  const inkSigned = await parseFixture(path.resolve(__dirname, 'synthetic_ink_signed.pdf'));
  console.log(JSON.stringify(inkSigned.findings, null, 2));

  console.log('\n=== Synthetic blank/unsigned (should be all MISSING) ===');
  const blankUnsigned = await parseFixture(path.resolve(__dirname, 'synthetic_blank_unsigned.pdf'));
  console.log(JSON.stringify(blankUnsigned.findings, null, 2));

  console.log('\n=== errors ===', errors);
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
