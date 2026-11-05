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
  function dismiss() {
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; }
  }
  api.closeDashboard = () => { ++dashboardVersion; dismiss(); host?.remove(); host = null; };
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
      passive(html)+'<style>body{padding:clamp(12px,3vw,32px);overflow-wrap:anywhere}details{padding:9px 0}summary{cursor:pointer;font-weight:600}table{max-width:100%}</style>';
  }
  api.dashboard = async function(client, session, properties) {
    if (!client || !session) return;
    const version = ++dashboardVersion;
    const identity = await session.check().catch(() => null);
    if (version !== dashboardVersion || !identity || !isSignedIn) return;
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
    const rows = list.filter(r=>ids.has(r.propertyId)).sort((a,b)=>b.when-a.when);
    message(note,rows.length ? 'Saved in this browser. Open a report to view it.' : 'After an audit, choose Save report. You’ll find it here in this browser.');
    for (const row of rows) {
      const line = el('div','',panel); line.className = 'saved-row';
      const label = el('div','',line); el('strong',row.name,label);
      el('small',[row.property,row.tool,date(row.when)].join(' · '),label);
      const open = action('Open report',line,async () => {
        open.disabled = true;
        try {
          const user = await session.check();
          if (!stillHere() || user?.user.id !== row.owner) return;
          const {data,error} = await client.from('properties').select('id,status,trial_ends_at').eq('id',row.propertyId);
          if (error || !data?.some(p => p.id === row.propertyId && active(p))) throw Error('Access to this property could not be confirmed. Reload and try again.');
          const report = await transaction('readonly',(_,reports)=>reports.get(row.id));
          if (!stillHere()) return;
          if (!report || report.owner !== row.owner || report.propertyId !== row.propertyId) throw Error('This report is unavailable. Reload and try again.');
          dismiss(); dialog = el('dialog','',document.body); dialog.className='saved-reader'; dialog.dataset.propertyId=row.propertyId;
          const bar=el('header','',dialog); el('strong',row.name,bar);
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
  api.authorized = (property,token) => {
    binding=property?.id && token ? {property,sid:AuditSession.sessionId(token)} : null;
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
    const save=action('Save report',panel,async()=>{
      const run=binding;
      if (!run || !entries()?.length || card.classList.contains('hidden') || (typeof paPending==='function' && paPending())) return message(note,'Finish this audit before saving.');
      save.disabled=true;
      try {
        const identity=await policy.check();
        if (!identity || !run.sid || run.sid!==launchId || AuditSession.sessionId(identity.accessToken)!==launchId || binding!==run) throw Error('Reopen this tool from your dashboard to save.');
        const report=makeReport(); if (!report) throw Error('Finish this audit before saving.');
        const section=el('section'); el('h2','Unit details',section);
        for(const entry of entries()){
          const group=el('details','',section); el('summary',[entry.unit,entry.residents].filter(Boolean).join(' · '),group);
          const part=detail(entry);
          if(typeof part==='string') group.insertAdjacentHTML('beforeend',passive(part)); else if(part) group.append(part);
        }
        const when=Date.now(), id=crypto.randomUUID(), owner=identity.user.id, propertyId=run.property.id;
        const title=name.value.trim() || defaultName();
        const meta={id,owner,propertyId,property:run.property.name||'Property',name:title,tool,when};
        const html=passive(report+section.outerHTML);
        await transaction('readwrite',(titles,reports)=>{titles.add(meta);reports.add({owner,propertyId,html},id);});
        if(binding!==run)return;
        save.textContent='Saved'; message(note,'Saved. Find it under Saved reports on your dashboard.'); link.hidden=false;
      } catch(error) { message(note,error.name==='QuotaExceededError'?'Browser storage is full. Free space and try again.':error.message); save.disabled=false; }
    });
    const note=el('span','',panel); note.setAttribute('role','status');
    const link=el('a','View saved reports',panel);link.href=location.origin+'/app#saved-reports';link.hidden=true;
    function defaultName(){return tool+' · '+new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
    saveState={reset(){name.value=defaultName();save.disabled=false;save.textContent='Save report';link.hidden=true;message(note,'Use this browser to reopen your report.');}};
    saveState.reset();
    document.getElementById('process-btn').addEventListener('click',()=>{binding=null;saveState.reset();},{capture:true});
  };
})();
