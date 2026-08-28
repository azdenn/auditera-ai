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

/* An in-memory stand-in for the property_rules table, for the suites that
   exercise house rules.
 *
 * Same reasoning as the gate stub above: the tool runs its real save/load code
 * against a stubbed server rather than gaining a test-only path through it.
 * The returned handle records every request, so a test can assert not just
 * that a rule was saved but exactly what left the browser -- which is how the
 * "labels only, never amounts or residents" promise is kept honest.
 */
function installRulesStub(page, initialRows){
  const store = (initialRows || []).map((r, i) => ({
    id: r.id || ('stub-' + (i + 1)), rule: r.rule, source: r.source || 'proposed', enabled: true,
  }));
  const requests = [];
  let nextId = store.length + 1;

  const ready = page.route('**/rest/v1/property_rules*', route => {
    const req = route.request();
    const method = req.method();
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (_e){ body = req.postData(); }
    requests.push({ method, url: req.url(), body });

    if (method === 'GET'){
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(store.filter(r => r.enabled)) });
    }
    if (method === 'POST'){
      const row = { id: 'stub-' + (nextId++), rule: body.rule, source: body.source || 'proposed', enabled: true };
      store.push(row);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([row]) });
    }
    if (method === 'DELETE'){
      const m = /id=eq\.([^&]+)/.exec(req.url());
      if (m){ const id = decodeURIComponent(m[1]);
        const ix = store.findIndex(r => r.id === id);
        if (ix !== -1) store.splice(ix, 1); }
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 405, body: '' });
  });

  return ready.then(() => ({
    store, requests,
    saved: () => requests.filter(r => r.method === 'POST').map(r => r.body),
  }));
}

/* The gate answer a tool needs before it will load or save anything for a
   property: an id, resolved server-side from the documents. */
function gateAnswerWithProperty(id, name){
  return { allowed: true, verdict: 'allowed', property: { id: id, name: name || 'Test Property' } };
}

module.exports = { installGateStub, installRulesStub, gateAnswerWithProperty, GATE_HASH };
