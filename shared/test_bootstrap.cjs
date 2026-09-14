// Test-process setup only. Never included in a customer tool or build.
// Use NODE_PATH for an installed Playwright package, then node -r this-file test.cjs.
const fs = require('node:fs');
let pw;
try { pw = require('playwright'); } catch (_) { return; }
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (options = {}) => {
  const opts = { ...options };
  if (opts.executablePath && !fs.existsSync(opts.executablePath)) delete opts.executablePath;
  if (!opts.executablePath) {
    if (process.env.AUDITERA_BROWSER_PATH) opts.executablePath = process.env.AUDITERA_BROWSER_PATH;
    else if (process.env.AUDITERA_BROWSER_CHANNEL) opts.channel = process.env.AUDITERA_BROWSER_CHANNEL;
    else if (process.platform === 'win32') opts.channel = 'msedge';
  }
  const browser = await launch(opts);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    // Individual test routes override this default. No test may accidentally
    // send uploaded fixtures or sessions to a real server.
    await context.route(/^https?:\/\//, route => route.abort());
    return context;
  };
  return browser;
};
