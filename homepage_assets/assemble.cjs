const fs = require('fs');
const path = require('path');

const dir = __dirname;
const template = fs.readFileSync(path.join(dir, 'homepage_template.html'), 'utf8');
const heroB64 = fs.readFileSync(path.join(dir, 'hero_image_b64.txt'), 'utf8').trim();

let out = template;
out = out.replace('__HERO_IMAGE_B64__', () => heroB64);

// Sanity: make sure no placeholders remain
for (const ph of ['__HERO_IMAGE_B64__']) {
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

// ---- Client Results page ----
// Single constant for the homepage's filename -- if you rename
// homepage_final.html when you deploy it (e.g. to index.html), update
// HOMEPAGE_FILENAME below and rerun this script; every homepage-pointing
// link on the Client Results page is generated from this one value.
const HOMEPAGE_FILENAME = 'homepage_final.html';
const crTemplate = fs.readFileSync(path.join(dir, 'client_results_template.html'), 'utf8');
let crOut = crTemplate.split('__HOMEPAGE_URL__').join(HOMEPAGE_FILENAME);
if (crOut.includes('__HOMEPAGE_URL__')) throw new Error('Placeholder not replaced: __HOMEPAGE_URL__');
const crOutPath = path.join(dir, 'client_results.html');
fs.writeFileSync(crOutPath, crOut);
console.log('Wrote', crOutPath, '-', (fs.statSync(crOutPath).size / 1024).toFixed(0), 'KB');
