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

fs.writeFileSync('./lease_reconciler.html', out);
fs.writeFileSync('./lease-resman-reconciler.html', out);
console.log('Built lease_reconciler.html, size:', (fs.statSync('./lease_reconciler.html').size/1024/1024).toFixed(2), 'MB');
