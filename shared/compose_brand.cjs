function brandHead(read) {
  const svg = read('shared/auditera-mark.svg');
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  return read('shared/brand_head.html').replaceAll('__AUDITERA_MARK__', url);
}
module.exports = { brandHead };
