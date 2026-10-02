// Text cells may contain formulas from untrusted documents. Quoting CSV alone
// does not stop a spreadsheet from evaluating them. Preserve real numbers,
// prefix dangerous text with an apostrophe, and quote/escape every cell.
// CSV has no cell types: use XLSX when exact typed interchange is required;
// spreadsheet re-saving can strip these protections.
(function (root) {
  'use strict';
  function escapeCell(value) {
    let text = value == null ? '' : String(value);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      if (/^[\s\u0000-\u001f]*[=+\-@\uff1d\uff0b\uff0d\uff20]/u.test(text)
          || /^[\t\r\n]/.test(text)) text = "'" + text;
    }
    return '"' + text.replace(/"/g, '""') + '"';
  }
  const api = Object.freeze({escapeCell});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuditCSV = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
