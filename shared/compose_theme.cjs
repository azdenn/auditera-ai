// Embed the brand so locally opened audit tools never fetch a logo or favicon.
function composeTheme(read) {
  const svg = read('shared/auditera-mark.svg');
  const mark = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  return read('shared/interface_theme.html').replaceAll('__AUDITERA_MARK__', mark);
}
module.exports = { composeTheme };
