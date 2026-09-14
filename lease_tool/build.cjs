// All tools use the same locked, self-contained build pipeline.
const result = require('../shared/build_tool.cjs').write('lease');
console.log('Built lease_reconciler.html:', result.sha256);
