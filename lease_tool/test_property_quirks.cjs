/* Three fixes, all from one real property's export.
   ------------------------------------------------
   1. BUNDLE PRECEDENCE. The rent roll billed a single "Community Fee". The
      lease listed "Community Fee 1" and "Community Fee 2" -- and separately
      Washer/Dryer and Animal Rent, which happened to add to the same number.
      Both pairs summed exactly; both had two members; the tie was broken by
      array order. It picked washer/dryer + animal rent and reported the
      community fee unexplained, while a line called Community Fee sat on both
      documents. Arithmetic coincidence must never beat a shared name.

   2. THE MISFILED-LEASE FALLBACK, SPENT ON THE WRONG FILES. 54 of 103 units
      had no "Signed Lease Documents" folder; their lease sat loose in the unit
      folder. The fallback found them and then spent its six-file budget on
      monthly invoices, applications, IDs and notices to vacate -- every one of
      which had to be decompressed and PDF-parsed first. And 20 PDFs in that
      archive were ZERO BYTES, most named exactly like a lease, so they sorted
      first, consumed the budget and then failed to parse.

   3. SIGNATURE FINDINGS THAT SAID WHERE. "Missing Signature" alone made you
      open the row to learn which signature and which page.
*/
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fflate = require('/home/claude/lease_tool/node_modules/fflate');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

/* A faithful reproduction of the real archive's SHAPES with invented names --
   the real export carries 700+ residents' names and is not going in the repo.
   Every path pattern below appeared verbatim (modulo the name) in it. */
const ROOT = 'Resident_Documents_08-20-2026';
const REAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const ARCHIVE = {
  // A unit filed correctly -- must be untouched by any of this.
  [ROOT + '/A1 - Correct Filing/Signed Lease Documents/Lease Pkg.pdf']: REAL_PDF,
  [ROOT + '/A1 - Correct Filing/Email Attachments/Invoice - 03-26-2026.pdf']: REAL_PDF,

  // The real problem unit: no signed-lease folder, lease loose in the folder,
  // surrounded by a year of invoices and the usual application paperwork.
  [ROOT + '/B2 - Loose Lease/B2 Tenant Lease only.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Lease Documents/Lease Document.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/NTN Tenant.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/POI Tenant.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Tenant ID.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Application/Tenant Application.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Email Attachments/Invoice - 01-25-2026.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Email Attachments/Invoice - 02-26-2026.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Email Attachments/Invoice - 03-26-2026.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Email Attachments/Invoice - 04-25-2026.pdf']: REAL_PDF,
  [ROOT + '/B2 - Loose Lease/Email Attachments/Invoice - 05-27-2026.pdf']: REAL_PDF,

  // The scanned-paper case: a resident who could not do it electronically, so
  // the office scanned the signed paper and dropped it in a different folder.
  [ROOT + '/C3 - Scanned Paper/Document_2024-12-27_100433.pdf']: REAL_PDF,
  [ROOT + '/C3 - Scanned Paper/C3 Renewal.pdf']: REAL_PDF,
  [ROOT + '/C3 - Scanned Paper/C3 Renters Insurance.pdf']: REAL_PDF,

  // Empty decoys: lease-named, zero bytes, next to the real one.
  [ROOT + '/D4 - Empty Decoy/D4 Tenant Lease.pdf']: Buffer.alloc(0),
  [ROOT + '/D4 - Empty Decoy/Tenant Lease D4.pdf']: Buffer.alloc(0),
  [ROOT + '/D4 - Empty Decoy/Lease Documents/Lease Document.pdf']: REAL_PDF,
};

(async () => {
  const zipPath = path.resolve(__dirname, 'tmp_archive_shape.zip');
  const files = {};
  for (const [k, v] of Object.entries(ARCHIVE)) files[k] = new Uint8Array(v);
  fs.writeFileSync(zipPath, Buffer.from(fflate.zipSync(files)));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text()); });
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  /* ---- 1. bundle precedence ---------------------------------------------- */
  const bundle = await page.evaluate(() => {
    // Exactly the ambiguity from the real unit: two different pairs of lease
    // lines each summing to the one rent roll amount.
    const rows = [
      {label:'Community Fee 1', leaseRaw:['Community Fee 1'], leaseVal: 90,  status:'leaseonly'},
      {label:'Community Fee 2', leaseRaw:['Community Fee 2'], leaseVal: 55,  status:'leaseonly'},
      {label:'Washer/Dryer',    leaseRaw:['Washer/Dryer'],    leaseVal: 50,  status:'leaseonly'},
      {label:'Animal Rent',     leaseRaw:['Animal Rent'],     leaseVal: 95,  status:'leaseonly'},
      {label:'Community Fee',   resmanRaw:['Community Fee'],  resmanVal:145, status:'resmanonly'},
    ];
    const found = detectBundlesForUnit(rows);
    const affinity = {
      shared:  bundleNameAffinity('Community Fee', ['Community Fee 1','Community Fee 2']),
      nothing: bundleNameAffinity('Community Fee', ['Washer/Dryer','Animal Rent']),
    };
    return { picked: found.length ? found[0].leaseLabels.slice().sort() : null, affinity };
  });

  check('Two different lease pairs sum to the same rent roll line -- the named one wins',
    bundle.picked && bundle.picked.join(' + ') === 'Community Fee 1 + Community Fee 2');
  check('...and the coincidental pair is NOT chosen',
    bundle.picked && bundle.picked.indexOf('Washer/Dryer') === -1);
  check('Name affinity is what separates them',
    bundle.affinity.shared === 2 && bundle.affinity.nothing === 0);

  // A bundle with no shared wording is still allowed -- some properties really
  // do bundle unlike charges. It just loses to one that shares a name.
  const looseBundle = await page.evaluate(() => detectBundlesForUnit([
    {label:'WiFi',        leaseRaw:['WiFi'],        leaseVal:50, status:'leaseonly'},
    {label:'Trash',       leaseRaw:['Trash'],       leaseVal:10, status:'leaseonly'},
    {label:'Pest',        leaseRaw:['Pest Control'],leaseVal:40, status:'leaseonly'},
    {label:'Amenities',   resmanRaw:['Amenities'],  resmanVal:100, status:'resmanonly'},
  ]));
  check('A genuine bundle of unlike charges is still detected',
    looseBundle.length === 1 && looseBundle[0].leaseLabels.length === 3);

  // The duplicated lease row: same name, only one is billed. Must stay a
  // flagged finding, but with a note that explains what it is.
  const dupe = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS.clear(); BUNDLE_RULES = [];
    const cmp = reconcileUnit(
      [{rawLabel:'Community Fee 1', amount:145}, {rawLabel:'Community Fee 2', amount:145}],
      {unit:'1', residents:'R', total:145, charges:[{description:'Community Fee', amount:145}]});
    const left = cmp.rows.filter(r => r.status === 'leaseonly');
    return { leftCount: left.length, note: left.length ? left[0].note : null,
             flagged: left.length ? isRealIssueRow(left[0]) : null,
             marked: left.length ? !!left[0].duplicateLeaseLine : null };
  });
  check('A lease that lists the same charge twice reconciles one and leaves one',
    dupe.leftCount === 1);
  check('...the leftover is still flagged, not silently hidden', dupe.flagged === true);
  check('...and its note names the line it duplicates',
    dupe.note && dupe.note.indexOf('Community Fee') !== -1 && dupe.marked === true);

  /* ---- 2. the fallback, on a real archive shape --------------------------- */
  await page.setInputFiles('#zip-file', zipPath);
  const scan = await page.evaluate(async () => {
    const f = document.getElementById('zip-file').files[0];
    const s = await scanZipForSignedLeases(f, {isAborted: () => false, onProgress: () => {}});
    const sel = Array.from(s.selectedPaths);
    const per = {};
    for (const n of sel){
      const d = unitDirPathAtDepth(n, s.unitDirDepth);
      (per[String(d).split('/').pop()] = per[String(d).split('/').pop()] || []).push(n.split('/').pop());
    }
    return { sel, per, empty: s.emptyPdfs, emptyLeaseNamed: s.emptyLeaseNamedPdfs,
             fallbackUnits: s.fallbackUnitsSearched };
  });

  check('A lease loose in the unit folder is found',
    (scan.per['B2 - Loose Lease'] || []).indexOf('B2 Tenant Lease only.pdf') !== -1);
  check('...as is one filed under "Lease Documents" instead',
    (scan.per['B2 - Loose Lease'] || []).indexOf('Lease Document.pdf') !== -1);
  check('THE SCANNED-PAPER CASE: a scan with no lease-ish name is still opened',
    (scan.per['C3 - Scanned Paper'] || []).indexOf('Document_2024-12-27_100433.pdf') !== -1);
  check('...alongside the renewal in the same folder',
    (scan.per['C3 - Scanned Paper'] || []).indexOf('C3 Renewal.pdf') !== -1);

  check('NO monthly invoices are decompressed', !scan.sel.some(n => /Invoice - /.test(n)));
  check('No applications are decompressed', !scan.sel.some(n => /Application\//.test(n)));
  check('No notices to vacate or proof-of-income are decompressed',
    !scan.sel.some(n => /NTN |POI /.test(n)));
  check('No ID scans are decompressed', !scan.sel.some(n => / ID\.pdf$/.test(n)));
  check('No renters-insurance certificates are decompressed',
    !scan.sel.some(n => /Renters Insurance/i.test(n)));

  check('Zero-byte PDFs are never selected',
    !scan.sel.some(n => /D4 Tenant Lease\.pdf|Tenant Lease D4\.pdf/.test(n)));
  check('...but they ARE reported, since an empty lease file is worth knowing about',
    scan.emptyLeaseNamed.length === 2);
  check('...and the unit\'s real lease is still found past the decoys',
    (scan.per['D4 - Empty Decoy'] || []).indexOf('Lease Document.pdf') !== -1);

  check('A correctly-filed unit is not dragged into the fallback at all',
    (scan.per['A1 - Correct Filing'] || []).join(',') === 'Lease Pkg.pdf');

  /* ---- 3. signature wording ---------------------------------------------- */
  const sig = await page.evaluate(() => {
    const one = {key:'signatures', status:'fail', findings:[], missing:[
      {signer:'Resident', page:7, section:'ANIMAL ADDENDUM'}]};
    const many = {key:'signatures', status:'fail', findings:[], missing:[
      {signer:'Resident', page:7, section:'ANIMAL ADDENDUM'},
      {signer:'Owner',    page:12, section:null}]};
    const pass = {key:'signatures', status:'pass', findings:[{page:1},{page:2}], missing:[]};
    const box = document.createElement('div');
    box.appendChild(buildVerifyItemDetail(one, false));
    return { oneTitle: verifyCheckTitle(one), manyTitle: verifyCheckTitle(many),
             passTitle: verifyCheckTitle(pass), detail: box.textContent };
  });

  check('One missing signature names the signer and the page in the title',
    sig.oneTitle === 'Missing Signature — Resident, page 7');
  check('Several are summarised with their pages',
    sig.manyTitle === '2 Missing Signatures — pages 7, 12');
  check('A fully-signed lease still reads as such', sig.passTitle === 'All Required Signatures Present');
  check('The detail leads with the section heading from the document',
    /ANIMAL ADDENDUM/.test(sig.detail));
  check('...names the signer and the page in a sentence',
    /No Resident signature found on page 7/.test(sig.detail));
  check('...and says what was actually looked for',
    /typed text and for a pen mark/.test(sig.detail));

  check('No page or console errors', errors.length === 0);

  fs.unlinkSync(zipPath);
  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  if (errors.length) console.log('ERRORS:', errors);
  const passed = results.filter(x => x[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
