/* Read-only report snapshots. IndexedDB is private to this browser origin. */
(function () {
  'use strict';
  const api = window.SavedReports = {};
  let database, host, dialog, dashboardVersion = 0, binding, saveState;
  function el(tag, text, parent) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    parent?.append(node);
    return node;
  }
  function action(label, parent, fn) {
    const button = el('button', label, parent);
    button.type = 'button';
    button.addEventListener('click', fn);
    return button;
  }
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('auditera.saved-reports.v1', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('titles', {keyPath:'id'}).createIndex('owner','owner');
        request.result.createObjectStore('reports');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { database = null; throw error; });
    return database;
  }
  async function transaction(mode, work) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['reports','titles'], mode);
      const result = work(tx.objectStore('titles'),tx.objectStore('reports'));
      tx.oncomplete = () => resolve(result?.result);
      tx.onabort = tx.onerror = () => reject(tx.error || Error('Browser storage is unavailable.'));
    });
  }
  function active(p) {
    return p.status === 'active' || (p.status === 'trialing' && Date.parse(p.trial_ends_at) > Date.now());
  }
  // A local index for filing already-authorized snapshots. Only the server
  // grants audit access, and opening a report still checks its property live.
  const filingIndex='auditera.report-filing.v1';
  const nameKey=value=>String(value || '').trim().replace(/\s+/g,' ').toLowerCase();
  function belongs(row,p) {
    return active(p) && p.id===row.propertyId && (!row.filingName || nameKey(p.name)===row.filingName);
  }
  function dismiss() {
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; }
  }
  api.closeDashboard = () => { ++dashboardVersion; try {localStorage.removeItem(filingIndex);} catch {} dismiss(); host?.remove(); host = null; };
  function message(node, text) { node.textContent = text; }
  function date(ms) {
    return new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  // Use the tool's own printable summary and its per-unit detail renderer.
  // Keep only passive markup. Never retain original files, scripts or URLs.
  function passive(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const allowed = new Set('STYLE MAIN SECTION HEADER FOOTER ARTICLE H1 H2 H3 H4 DIV P SPAN B STRONG EM SMALL TABLE THEAD TBODY TFOOT TR TH TD BR HR UL OL LI DETAILS SUMMARY PRE'.split(' '));
    for (const node of template.content.querySelectorAll('*')) {
      if (!allowed.has(node.tagName)) {
        if (['SCRIPT','IFRAME','OBJECT','TEMPLATE','LINK','META','IMG','SVG','BUTTON','TITLE'].includes(node.tagName.toUpperCase())) node.remove();
        else node.replaceWith(...node.childNodes);
      } else for (const attr of [...node.attributes]) {
        if (!['class','colspan','rowspan','open','style'].includes(attr.name)) node.removeAttribute(attr.name);
      }
    }
    return template.innerHTML;
  }
  function viewer(html) {
    // Sandbox, deny network access, and sanitize again at the storage boundary.
    return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      passive(html)+'<style>body{padding:clamp(12px,3vw,32px);overflow-wrap:anywhere}details{padding:9px 0}summary{cursor:pointer;font-weight:600}table{max-width:100%;border-collapse:collapse}th,td{padding:6px 9px;text-align:left;border-bottom:1px solid #ddd}body{font:15px/1.5 system-ui;color:#202334}h2{margin-top:1.4em}.details-btn{display:none}</style>';
  }
  const scopes = {all:'Whole report', view:'Current table view', match:'Matches only', mismatch:'Mismatches only', review:'Needs review only'};
  const unresolved = new Set(['missing','missing_ledger','new-tenant','unmatched','error','needs-review']);
  function detailNode(entry, detail) {
    const node = detail(entry, true);
    if (typeof node !== 'string') return node;
    const template = document.createElement('template');
    template.innerHTML = node;
    return template.content;
  }
  function focusedDetail(entry, detail, scope) {
    const section = el('section');
    if (entry.category === 'vacant') return section;
    if (unresolved.has(entry.category)) {
      if (scope === 'review') el('p',entry.note || 'This unit needs a manual review.',section);
      return section;
    }
    const root = detailNode(entry,detail);
    const statuses = {Match:'match',Mismatch:'mismatch',Review:'review','Unable to verify':'review'};
    // Reuse the audit's displayed decisions and the evidence on the same row.
    // Supporting tables (raw charges, candidates, etc.) have no result status.
    for (const table of root.querySelectorAll('.verify-card table.results')) {
      const selected = Array.from(table.tBodies[0]?.rows || []).filter(row =>
        statuses[row.cells[row.cells.length-1]?.querySelector('.badge')?.textContent.trim()] === scope);
      if (!selected.length) continue;
      const copy = el('table','',section);
      if (table.tHead) copy.append(table.tHead.cloneNode(true));
      copy.createTBody().append(...selected);
    }
    for (const item of root.querySelectorAll('.verify-item,.finding')) {
      const status = item.dataset.snapshotStatus || statuses[item.querySelector('.badge')?.textContent.trim()];
      if (status === scope) section.append(item);
    }
    for (const issue of entry.concession?.issues || []) {
      if ((issue.severity === 'bad' ? 'mismatch' : issue.severity === 'warn' ? 'review' : '') === scope &&
          issue.text && !section.textContent.includes(issue.text)) el('p',issue.text,section);
    }
    return section;
  }
  function snapshot(scope,tool,property,card,entries,detail,makeReport) {
    const section=el('section');
    if (scope === 'all') {
      el('h2','Unit details',section);
      for (const entry of entries) {
        const group=el('details','',section);
        el('summary',[entry.unit,entry.residents].filter(Boolean).join(' · '),group);
        group.append(detailNode(entry,detail));
      }
      return passive(makeReport()+section.outerHTML);
    }
    el('h1',scopes[scope],section);
    el('p',[property,tool,date(Date.now())].join(' · '),section);
    if (scope === 'view') {
      const shell=card.querySelector('.results-shell:not(.hidden)');
      if (!shell) throw Error('Open the results table before saving this view.');
      const activeFilter=card.querySelector('#filter-tabs .active')?.firstChild?.textContent.trim();
      if (shell.id === 'flat-view-shell') el('p','Mismatching lines across units',section);
      else if (activeFilter) el('p','Filter: '+activeFilter,section);
      const copy=shell.cloneNode(true);
      for (const control of copy.querySelectorAll('.hidden,[hidden],.details-btn,.help-tip,button')) control.remove();
      section.append(copy);
    } else {
      let count=0;
      for (const entry of entries) {
        const part=focusedDetail(entry,detail,scope);
        if (!part.childElementCount) continue;
        el('h2',[entry.unit,entry.residents].filter(Boolean).join(' · '),section);
        section.append(part); count++;
      }
      if (!count) el('p','No results in this category.',section);
    }
    return passive(section.outerHTML);
  }
  api.dashboard = async function(client, session, properties) {
    if (!client || !session) return;
    const version = ++dashboardVersion;
    const identity = await session.check().catch(() => null);
    if (version !== dashboardVersion || !identity || !isSignedIn) return;
    try {
      localStorage.setItem(filingIndex,JSON.stringify({
        owner:identity.user.id,sid:AuditSession.sessionId(identity.accessToken),
        properties:properties.filter(active).map(p=>({id:p.id,name:p.name}))
      }));
    } catch {} // A restricted browser can still save a server-bound report.
    if (!host) {
      host = el('section'); host.className = 'saved-reports'; host.id = 'saved-reports';
      document.querySelector('#signedin-panel .signedin-top').after(host);
    }
    const panel = host;
    const stillHere = () => version === dashboardVersion && panel === host && isSignedIn && !session.state().locked && session.state().userId === identity.user.id;
    const list = await transaction('readonly', titles => titles.index('owner').getAll(identity.user.id)).catch(() => null);
    if (!stillHere()) return;
    panel.replaceChildren();
    el('h3','Saved reports',panel);
    const note = el('p','',panel);
    note.setAttribute('role','status');
    if (!list) return message(note,'Your browser could not open saved reports. Reload this page to try again.');
    const ids = new Set(properties.filter(active).map(p=>p.id));
    if (dialog && !ids.has(dialog.dataset.propertyId)) dismiss();
    const rows = list.filter(r=>properties.some(p=>belongs(r,p))).sort((a,b)=>b.when-a.when);
    message(note,rows.length ? 'Saved in this browser. Open a report to view it.' : 'After an audit, choose Save report. You’ll find it here in this browser.');
    for (const row of rows) {
      const line = el('div','',panel); line.className = 'saved-row';
      const label = el('div','',line); el('strong',row.name,label);
      el('small',[row.property,row.tool,scopes[row.scope] || scopes.all,date(row.when)].join(' · '),label);
      const open = action('Open report',line,async () => {
        open.disabled = true;
        try {
          const user = await session.check();
          if (!stillHere() || user?.user.id !== row.owner) return;
          const {data,error} = await client.from('properties').select('id,name,status,trial_ends_at').eq('id',row.propertyId);
          if (error || !data?.some(p=>belongs(row,p))) throw Error('Access to this property could not be confirmed. Reload and try again.');
          const report = await transaction('readonly',(_,reports)=>reports.get(row.id));
          if (!stillHere()) return;
          if (!report || report.owner !== row.owner || report.propertyId !== row.propertyId) throw Error('This report is unavailable. Reload and try again.');
          dismiss(); dialog = el('dialog','',document.body); dialog.className='saved-reader'; dialog.dataset.propertyId=row.propertyId;
          const bar=el('header','',dialog); el('strong',row.name+' · '+(scopes[row.scope] || scopes.all),bar);
          action('Back to dashboard',bar,dismiss);
          const frame=el('iframe','',dialog); frame.title=row.name; frame.setAttribute('sandbox',''); frame.srcdoc=viewer(report.html);
          dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
          dialog.showModal();
        } catch(error) { if(stillHere()) message(note,error.message); }
        finally { open.disabled=false; }
      });
      open.setAttribute('aria-label','Open report: '+row.name);
    }
    if(location.hash==='#saved-reports') panel.scrollIntoView({block:'center'});
  };
  api.authorized = (property,token,detectedName) => {
    binding=token ? {property,detectedName,sid:AuditSession.sessionId(token)} : null;
    saveState?.reset();
  };
  api.tool = function(tool, makeReport, entries, detail) {
    if (!AuditSession.enabled(location.origin)) return;
    const back=document.querySelector('.tool-back'); if(back) back.href=location.origin+'/app';
    const launchId=AG_TOKEN && AuditSession.sessionId(AG_TOKEN);
    const client=window.supabase.createClient(AG_SUPABASE_URL,AG_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    function leave() { binding=null; location.replace(location.origin+'/app'); }
    const policy=AuditSession.create({client,onLock:leave,verifyIdentity:false});
    api.toolSession={async token(){
      const token=await policy.token();
      return token && launchId && AuditSession.sessionId(token)===launchId ? token : null;
    }};
    if (launchId) void policy.check().then(user=>{if(!user || AuditSession.sessionId(user.accessToken)!==launchId) leave();}).catch(()=>{});
    const card=document.getElementById('results-card');
    const panel=el('section'); panel.className='save-report-bar'; card.prepend(panel);
    const field=el('label','Report name',panel), name=el('input','',field);
    name.maxLength=120;
    const scopeField=el('label','What to save',panel), scope=el('select','',scopeField);
    for (const [key,label] of Object.entries(scopes)) el('option',label,scope).value=key;

    function propertyFor(run,owner) {
      if(run.property?.id) return run.property;
      const detected=nameKey(run.detectedName);
      if(!detected) return null;
      let cached;
      try {cached=JSON.parse(localStorage.getItem(filingIndex));} catch {return null;}
      if(cached?.owner!==owner || cached.sid!==run.sid || !Array.isArray(cached.properties)) return null;
      const matches=cached.properties.filter(p=>p.id && nameKey(p.name)===detected);
      return matches.length===1 ? matches[0] : null;
    }
    const save=action('Save report',panel,async()=>{
      const run=binding;
      if (card.classList.contains('hidden') || (typeof paPending==='function' && paPending())) return message(note,'Save is available when results are displayed.');
      if (!run) return message(note,'The sign-in for these results could not be verified. Open the tool from your dashboard and run the audit again.');
      save.disabled=true; scope.disabled=true; name.disabled=true;
      try {
        const identity=await policy.check();
        if (!identity || !run.sid || run.sid!==launchId || AuditSession.sessionId(identity.accessToken)!==launchId || binding!==run) throw Error('Reopen this tool from your dashboard to save.');
        const property=propertyFor(run,identity.user.id);
        if(binding!==run || policy.state().locked) return;
        if(!property){
          download.hidden=false;
          message(note,'Your report is ready. Its property could not be linked to one licence. Download a copy to reopen on this device.');
          save.disabled=false;
          return;
        }
        const html=snapshot(scope.value,tool,property.name,card,entries(),detail,makeReport);
        const when=Date.now(), id=crypto.randomUUID(), owner=identity.user.id, propertyId=property.id;
        const title=name.value.trim() || defaultName();
        const meta={id,owner,propertyId,property:property.name||'Property',name:title,tool,when,scope:scope.value,filingName:run.property?.id ? null : nameKey(run.detectedName)};
        await transaction('readwrite',(titles,reports)=>{titles.add(meta);reports.add({owner,propertyId,html},id);});
        if(binding!==run)return;
        save.textContent='Saved'; message(note,'Saved. Find it under Saved reports on your dashboard.'); link.hidden=false;
      } catch(error) { message(note,error.name==='QuotaExceededError'?'Browser storage is full. Free space and try again.':error.message); save.disabled=false; }
      finally { scope.disabled=false; name.disabled=false; }
    });
    const note=el('span','',panel); note.setAttribute('role','status');
    const link=el('a','View saved reports',panel);link.href=location.origin+'/app#saved-reports';link.hidden=true;
    const download=action('Download report copy',panel,async()=>{
      const run=binding;
      if(!run || card.classList.contains('hidden') || (typeof paPending==='function' && paPending())) return;
      download.disabled=true;
      try {
        const identity=await policy.check();
        if(binding!==run || !identity || !launchId || run.sid!==launchId || AuditSession.sessionId(identity.accessToken)!==launchId) throw Error('Reopen this tool from your dashboard.');
        const html=snapshot(scope.value,tool,run.detectedName||'Property',card,entries(),detail,makeReport);
        const url=URL.createObjectURL(new Blob([viewer(html)],{type:'text/html'}));
        const anchor=el('a'); anchor.href=url; anchor.download=(name.value.trim() || tool)+'.html'; anchor.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        message(note,'Open the downloaded HTML file to view your report.');
      } catch(error) { message(note,error.message); }
      finally {download.disabled=false;}
    });
    function defaultName(){return tool+' · '+new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
    function ready(){download.hidden=true;save.disabled=false;save.textContent='Save report';link.hidden=true;message(note,'Save now or keep reviewing and save later.');}
    scope.addEventListener('change',ready); name.addEventListener('input',ready);
    const changes=new MutationObserver(()=>{
      if(scope.value==='view' && link.hidden===false) ready();
    });
    for(const shell of card.querySelectorAll('.results-shell')) changes.observe(shell,{attributes:true,childList:true,subtree:true});
    saveState={reset(){scope.value='all';name.value=defaultName();ready();}};
    saveState.reset();
    document.getElementById('process-btn').addEventListener('click',()=>{binding=null;card.classList.add('hidden');saveState.reset();},{capture:true});
  };
})();
