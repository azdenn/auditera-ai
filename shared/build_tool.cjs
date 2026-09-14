const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const TOOLS = { lease: 'leaseverify', concession: 'concessionverify', deposit: 'depositverify' };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function compose(tool) {
  if (!TOOLS[tool]) throw new Error('Unknown tool');
  const inputs = {};
  const read = relative => { const bytes = fs.readFileSync(path.join(ROOT, relative));
    inputs[relative] = hash(bytes); return bytes.toString('utf8'); };
  let html = read(tool + '_tool/template.html');
  read('shared/build_tool.cjs');
  read('build.cjs');
  read('lease_tool/package-lock.json');
  const sources = {
    PDFJS_LIB: 'lease_tool/node_modules/pdfjs-dist/build/pdf.min.js',
    PDF_WORKER_SRC: 'lease_tool/node_modules/pdfjs-dist/build/pdf.worker.min.js',
    XLSX_LIB: 'lease_tool/node_modules/xlsx/dist/xlsx.full.min.js',
    ...(tool === 'deposit' ? {} : { FFLATE_LIB: 'lease_tool/node_modules/fflate/umd/index.js' }),
    AUDIT_GATE: 'shared/audit_gate.js', RR_PROPERTY_NAME: 'shared/rentroll_property_name.js',
    ...(tool === 'lease' ? { PROPERTY_RULES: 'shared/property_rules.js',
      PROPERTY_ASSISTANT: 'shared/property_assistant.js', PROPERTY_ASSISTANT_UI: 'shared/property_assistant_ui.js' } : {}),
  };
  for (const [name, source] of Object.entries(sources)) {
    const marker = '<!--' + name + '-->';
    if (html.split(marker).length !== 2) throw new Error('Expected exactly one ' + marker);
    const code = read(source);
    html = html.replace(marker, () => '<script>\n' + code + '\n</script>');
  }
  return { html, inputs, sha256: hash(html) };
}
function write(tool) {
  const result = compose(tool);
  fs.writeFileSync(path.join(ROOT, tool + '_tool', tool + '_reconciler.html'), result.html);
  if (tool === 'lease') fs.writeFileSync(path.join(ROOT, 'lease_tool/lease-resman-reconciler.html'), result.html);
  return result;
}
module.exports = { ROOT, TOOLS, compose, write, hash };
