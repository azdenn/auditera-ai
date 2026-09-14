// All tools use the same locked, self-contained build pipeline.
const result = require('../shared/build_tool.cjs').write('concession');
console.log('Built concession_reconciler.html:', result.sha256);
