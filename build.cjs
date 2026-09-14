// Local build only. Never deploys, commits or pushes. Install locked dependencies:
// npm ci --prefix lease_tool --ignore-scripts --omit=optional
// node build.cjs        builds tools and copies them to dist/tools
// node build.cjs --check verifies source/artifact parity without writing
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, TOOLS, compose, write, hash } = require('./shared/build_tool.cjs');
const check = process.argv.includes('--check');
const manifest = { schemaVersion: 1, tools: {} };
for (const [tool, name] of Object.entries(TOOLS)) {
  const result = check ? compose(tool) : write(tool);
  const target = path.join(ROOT, 'dist/tools', name + '.html');
  if (check) {
    if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== result.sha256)
      throw new Error(name + ' source/dist mismatch; run node build.cjs before release');
  } else fs.writeFileSync(target, result.html);
  manifest.tools[name] = { inputs: result.inputs, sha256: result.sha256 };
  console.log((check ? 'Verified ' : 'Built ') + name);
}
const manifestPath = path.join(ROOT, 'dist/tools-build-manifest.json');
const serialized = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== serialized)
    throw new Error('Build manifest is stale');
} else fs.writeFileSync(manifestPath, serialized);
