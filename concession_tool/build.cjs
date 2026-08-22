const fs = require('fs');

const template = fs.readFileSync('./template.html', 'utf8');
const pdfLib = fs.readFileSync('./node_modules/pdfjs-dist/build/pdf.min.js', 'utf8');
const pdfWorker = fs.readFileSync('./node_modules/pdfjs-dist/build/pdf.worker.min.js', 'utf8');
const xlsxLib = fs.readFileSync('./node_modules/xlsx/dist/xlsx.full.min.js', 'utf8');
// Streaming ZIP reader, same library/build the LeaseVerify tool inlines --
// used by the ZIP upload mode so a multi-GB archive is read as a stream
// instead of being loaded into memory in one piece.
const fflateLib = fs.readFileSync('./node_modules/fflate/umd/index.js', 'utf8');

let out = template;
// Use function replacers -- string replacers treat "$&", "$1", "$$" etc. in the
// replacement as special patterns, which corrupts minified JS that happens to contain them.
out = out.replace('<!--PDFJS_LIB-->', () => '<script>\n' + pdfLib + '\n</script>');
out = out.replace('<!--PDF_WORKER_SRC-->', () => '<script>\n' + pdfWorker + '\n</script>');
out = out.replace('<!--XLSX_LIB-->', () => '<script>\n' + xlsxLib + '\n</script>');
out = out.replace('<!--FFLATE_LIB-->', () => '<script>\n' + fflateLib + '\n</script>');

fs.writeFileSync('./concession_reconciler.html', out);
console.log('Built concession_reconciler.html, size:', (fs.statSync('./concession_reconciler.html').size/1024/1024).toFixed(2), 'MB');
