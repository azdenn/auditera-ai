const fs = require('fs');

const template = fs.readFileSync('./template.html', 'utf8');
const pdfLib = fs.readFileSync('./node_modules/pdfjs-dist/build/pdf.min.js', 'utf8');
const pdfWorker = fs.readFileSync('./node_modules/pdfjs-dist/build/pdf.worker.min.js', 'utf8');
const xlsxLib = fs.readFileSync('./node_modules/xlsx/dist/xlsx.full.min.js', 'utf8');
const fflateLib = fs.readFileSync('./node_modules/fflate/umd/index.js', 'utf8');

let out = template;
// Use function replacers -- string replacers treat "$&", "$1", "$$" etc. in the
// replacement as special patterns, which corrupts minified JS that happens to contain them.
out = out.replace('<!--PDFJS_LIB-->', () => '<script>\n' + pdfLib + '\n</script>');
out = out.replace('<!--PDF_WORKER_SRC-->', () => '<script>\n' + pdfWorker + '\n</script>');
out = out.replace('<!--XLSX_LIB-->', () => '<script>\n' + xlsxLib + '\n</script>');
out = out.replace('<!--FFLATE_LIB-->', () => '<script>\n' + fflateLib + '\n</script>');

// The licence gate is shared verbatim with the other two tools. Inlined rather
// than imported because these files have to keep working as a single
// self-contained .html served from behind the Worker.
const auditGate = fs.readFileSync('../shared/audit_gate.js', 'utf8');
out = out.replace('<!--AUDIT_GATE-->', () => '<script>\n' + auditGate + '\n</script>');
if (out.includes('<!--AUDIT_GATE-->')) throw new Error('Audit gate placeholder not replaced');
if (!out.includes('agAuthorizeAudit')) throw new Error('Audit gate missing from build output');

fs.writeFileSync('./lease_reconciler.html', out);
fs.writeFileSync('./lease-resman-reconciler.html', out);
console.log('Built lease_reconciler.html, size:', (fs.statSync('./lease_reconciler.html').size/1024/1024).toFixed(2), 'MB');
