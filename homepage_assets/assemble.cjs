const fs = require('fs');
const path = require('path');

const dir = __dirname;
const template = fs.readFileSync(path.join(dir, 'homepage_template.html'), 'utf8');
const heroB64 = fs.readFileSync(path.join(dir, 'hero_image_b64.txt'), 'utf8').trim();

const sharedStyles = fs.readFileSync(path.join(dir, '_shared_styles.html'), 'utf8');
const sharedNav    = fs.readFileSync(path.join(dir, '_shared_nav.html'), 'utf8');
const sharedFooter = fs.readFileSync(path.join(dir, '_shared_footer.html'), 'utf8');

// The "Back" control belongs on every page EXCEPT the one it points at. The
// homepage gets the same shared nav with that one element removed, so the link
// still lives in a single file and cannot drift between pages.
const NAV_BACK_RE = /\s*<a class="nav-back"[\s\S]*?<\/a>/;
if (!NAV_BACK_RE.test(sharedNav)){
  throw new Error('Shared nav has no .nav-back element -- the homepage strip below is now a silent no-op');
}
const homeNav = sharedNav.replace(NAV_BACK_RE, '');

/* Mark the link to the page being built as the current one.

   This used to be baked into each page's own hand-written nav. Moving every
   page onto the shared partial dropped it silently -- the shipped pages had
   no current-page marker at all for weeks, and the test that should have
   caught it was reading a stale hand-assembled copy in this folder rather
   than the file that actually ships. Both are fixed; this is the half that
   puts the marker back, at build time so it works with JS disabled.

   Appends to an existing class rather than adding a second class attribute:
   two class attributes on one tag is invalid HTML and the browser keeps only
   the first, which would make this look applied while doing nothing. */
function navForPage(file){
  const re = new RegExp('<a\\b[^>]*href="' + file.replace(/\./g, '\\.') + '"[^>]*>');
  if (!re.test(sharedNav)) return sharedNav;   // page simply isn't in the nav
  return sharedNav.replace(re, (tag) => {
    const marked = /\bclass="/.test(tag)
      ? tag.replace(/\bclass="([^"]*)"/, (_m, c) => 'class="' + c + ' current"')
      : tag.replace(/^<a\b/, '<a class="current"');
    return marked.replace(/>$/, ' aria-current="page">');
  });
}

let out = template;
out = out.replace('__HERO_IMAGE_B64__', () => heroB64);
// The homepage used to carry its own copy of the nav and footer. Removing a
// link from the shared partial then changed every page except the front one,
// which is the single most visible page on the site.
out = out
  .split('__SHARED_NAV__').join(homeNav)
  .split('__SHARED_FOOTER__').join(sharedFooter);

// Sanity: make sure no placeholders remain
for (const ph of ['__HERO_IMAGE_B64__', '__SHARED_NAV__', '__SHARED_FOOTER__']) {
  if (out.includes(ph)) throw new Error('Placeholder not replaced: ' + ph);
}
// The tools used to be base64'd into this page, which meant loading the
// homepage handed you all three files. They are separate now and served only
// behind the Worker's licence check -- so the homepage must NOT contain them.
for (const leaked of ['__CONCESSION_B64__', '__RECONCILER_B64__', '__DEPOSIT_B64__']) {
  if (out.includes(leaked)) throw new Error('Tool still embedded in the homepage: ' + leaked);
}

const outPath = path.join(dir, 'homepage_final.html');
fs.writeFileSync(outPath, out);
console.log('Wrote', outPath, '-', (fs.statSync(outPath).size / 1024 / 1024).toFixed(2), 'MB');

// ---- Build the deployable site ----
// dist/ is exactly what gets uploaded: the homepage, the Worker that guards
// the tools, and the tool files themselves under /tools/.
const dist = path.join(dir, '..', 'dist');
fs.mkdirSync(path.join(dist, 'tools'), {recursive: true});
fs.writeFileSync(path.join(dist, 'index.html'), out);
const TOOLS = {
  'leaseverify.html':      '../lease_tool/lease_reconciler.html',
  'concessionverify.html': '../concession_tool/concession_reconciler.html',
  'depositverify.html':    '../deposit_tool/deposit_reconciler.html',
};
for (const [name, src] of Object.entries(TOOLS)){
  const p = path.join(dir, src);
  if (!fs.existsSync(p)) throw new Error('Missing built tool: ' + p);
  fs.copyFileSync(p, path.join(dist, 'tools', name));
  console.log('  tools/' + name, '-', (fs.statSync(p).size/1024/1024).toFixed(2), 'MB');
}
fs.copyFileSync(path.join(dir, 'worker.js'), path.join(dist, '_worker.js'));
console.log('Wrote', dist, '- homepage', (Buffer.byteLength(out)/1024).toFixed(0), 'KB (was ~9.6 MB with tools embedded)');

// ---- Standalone pages (pricing, sign in, app) ----
// These share the homepage's design tokens, nav and footer by injection rather
// than by copy-paste, so a palette or nav change lands everywhere at once
// instead of silently drifting on the pages nobody remembered to update.

for (const page of ['pricing', 'signin', 'app', 'contact', 'client_results']) {
  const tpl = path.join(dir, page + '_template.html');
  if (!fs.existsSync(tpl)) continue;
  let out = fs.readFileSync(tpl, 'utf8')
    .split('__SHARED_STYLES__').join(sharedStyles)
    .split('__SHARED_NAV__').join(navForPage(page + '.html'))
    .split('__SHARED_FOOTER__').join(sharedFooter);
  for (const ph of ['__SHARED_STYLES__','__SHARED_NAV__','__SHARED_FOOTER__']) {
    if (out.includes(ph)) throw new Error('Placeholder not replaced in ' + page + ': ' + ph);
  }
  fs.writeFileSync(path.join(dist, page + '.html'), out);
  console.log('  ' + page + '.html -', (Buffer.byteLength(out)/1024).toFixed(0), 'KB');
}

// Client Results is built by the shared-partial loop above, like every other
// page. It used to be assembled here into homepage_assets/ and never copied
// into dist/, so the nav linked to a page the deployed site did not have.

// ---- Guard: every internal nav link must resolve to a real file in dist ----
// A link to a page that was built into the wrong directory is exactly how
// Client Results shipped broken, and it is invisible until someone clicks it.
const navHrefs = [...sharedNav.matchAll(/href="([^"#:]+\.html)/g)].map(m => m[1]);
const footHrefs = [...sharedFooter.matchAll(/href="([^"#:]+\.html)/g)].map(m => m[1]);
const missing = [...new Set([...navHrefs, ...footHrefs])]
  .filter(h => !fs.existsSync(path.join(dist, h)));
if (missing.length) {
  throw new Error('Nav/footer link to a page missing from dist: ' + missing.join(', '));
}
console.log('Nav links checked -', new Set([...navHrefs, ...footHrefs]).size, 'internal pages all present');
