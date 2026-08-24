/* Lets the tools' own test suites past the licence gate.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A BACK DOOR
 * The tools now refuse to produce results until authorize-audit says yes. That
 * is the point. It also means every existing tool test -- which opens the file
 * directly with no session and no server -- would hang forever at the upload
 * step.
 *
 * The obvious shortcut would be a "skip the check in test mode" flag inside
 * the tool. That must never be added: a bypass switch shipped inside the
 * product is a bypass switch shipped to whoever wants to find it. So instead
 * the tests do what the real dashboard does -- hand the tool a session token
 * and answer its authorization request -- and the tool runs its genuine,
 * unmodified gate code against a stubbed server.
 *
 * Usage, immediately before the page.goto that loads a tool:
 *     await installGateStub(page);
 *     await page.goto('file://...reconciler.html' + GATE_HASH);
 */

const GATE_HASH = '#tk=test-session-token';

async function installGateStub(page, answer){
  await page.route('**/functions/v1/authorize-audit', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(answer || { allowed: true, verdict: 'allowed' }),
    }));
  return page;
}

module.exports = { installGateStub, GATE_HASH };
