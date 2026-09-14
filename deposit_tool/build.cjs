// All tools use the same locked, self-contained build pipeline.
const result = require('../shared/build_tool.cjs').write('deposit');
console.log('Built deposit_reconciler.html:', result.sha256);
