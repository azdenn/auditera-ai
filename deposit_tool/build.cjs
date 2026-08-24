const fs = require('fs');
const path = require('path');

const dir = __dirname;
const template = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
// SheetJS is the only vendor dependency: it reads both the ResMan .xlsx rent
// roll and the LeaseLock invoice (.xlsx or .csv) entirely in-browser. It is
// inlined rather than linked so the built file works from a file:// URL with
// no network access at all.
const xlsxLib = fs.readFileSync(path.join(dir, 'node_modules/xlsx/dist/xlsx.full.min.js'), 'utf8');
// pdf.js reads the real LeaseLock invoice, which is issued as a PDF (not a
// spreadsheet). Inlined the same way LeaseVerify does it -- the worker is
// loaded as a plain executing script so pdf.js picks it up without ever
// fetching a separate worker file.
const pdfLib = fs.readFileSync(path.join(dir, 'node_modules/pdfjs-dist/build/pdf.min.js'), 'utf8');
const pdfWorker = fs.readFileSync(path.join(dir, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'), 'utf8');

let out = template;
// Function replacers -- string replacers treat "$&", "$1", "$$" etc. in the
// replacement as special patterns, which corrupts minified JS containing them.
out = out.replace('<!--PDFJS_LIB-->', () => '<script>\n' + pdfLib + '\n</script>');
out = out.replace('<!--PDF_WORKER_SRC-->', () => '<script>\n' + pdfWorker + '\n</script>');
out = out.replace('<!--XLSX_LIB-->', () => '<script>\n' + xlsxLib + '\n</script>');

for (const ph of ['<!--XLSX_LIB-->', '<!--PDFJS_LIB-->', '<!--PDF_WORKER_SRC-->']) {
  if (out.includes(ph)) throw new Error(ph + ' placeholder was not replaced');
}

const outPath = path.join(dir, 'deposit_reconciler.html');
// The licence gate is shared verbatim with the other two tools. Inlined rather
// than imported because these files have to keep working as a single
// self-contained .html served from behind the Worker.
const auditGate = fs.readFileSync('../shared/audit_gate.js', 'utf8');
out = out.replace('<!--AUDIT_GATE-->', () => '<script>\n' + auditGate + '\n</script>');
if (out.includes('<!--AUDIT_GATE-->')) throw new Error('Audit gate placeholder not replaced');
if (!out.includes('agAuthorizeAudit')) throw new Error('Audit gate missing from build output');

fs.writeFileSync(outPath, out);
console.log('Built deposit_reconciler.html, size:', (fs.statSync(outPath).size/1024/1024).toFixed(2), 'MB');
