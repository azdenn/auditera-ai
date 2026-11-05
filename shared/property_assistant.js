/* Browser-local pilot. No network, no model, no document/chat persistence.
   The assistant identifies questions; the existing audit engine judges rules. */
var PropertyAssistant = (function(){
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const copy = o => JSON.parse(JSON.stringify(o));
  const family = s => key(s).replace(/\b(?:studio|[0-9]+|one|two|three|four)\s*(?:bedroom|bed|br)s?\b/g,' ').replace(/\s+/g,' ').trim();
  const sameFamily = (a,b) => {
    const x=family(a),y=family(b);return !!x&&!!y&&(x===y||x.startsWith(y+' ')||y.startsWith(x+' '));
  };
  const hosts = new Set(['https://testing.auditera.net','https://auditera-testing.azden-kumar.workers.dev']);
  function isTesting(origin){ return hosts.has(origin); }
  function canPilot(origin){ return isTesting(origin) || origin === 'null' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); }
  function ruleLabels(r){
    return r ? [r.target,r.subject,r.rentRollLabel,...(Array.isArray(r.spellings)?r.spellings:[]),
      ...(Array.isArray(r.leaseLabels)?r.leaseLabels:[])].filter(x=>typeof x==='string') : [];
  }
  function compactRule(rule){
    if (!rule || typeof rule !== 'object') return null;
    const out={type:rule.type};
    if (rule.type==='alias') {out.target=rule.target;out.spellings=rule.spellings;}
    else if (rule.type==='includes' || rule.type==='separate') {
      out.rentRollLabel=rule.rentRollLabel;out.leaseLabels=rule.leaseLabels;
      if(rule.scope!=null){
        if(rule.type!=='includes'||rule.scope!=='unitemised')return null;
        out.scope='unitemised';
      }
    }
    else return null; // No permanent hide/ignore action in this pilot.
    const label = x => typeof x==='string' && x.trim().length>0 && x.length<=200;
    const list = x => Array.isArray(x) && x.length>0 && x.length<=40 && x.every(label);
    if(out.type==='alias' ? !label(out.target)||!list(out.spellings) : !label(out.rentRollLabel)||!list(out.leaseLabels))return null;
    if(out.type!=='alias'&&(out.leaseLabels.some(m=>sameFamily(m,out.rentRollLabel))||new Set(out.leaseLabels.map(key)).size!==out.leaseLabels.length))return null;
    return copy(out);
  }
  // Disjoint membership decisions may share an anchor. Aliases and overlapping
  // members cannot: their order would otherwise decide the property's meaning.
  function conflicts(a,b){
    const membership=r=>r&&['includes','separate'].includes(r.type);
    if(membership(a)&&membership(b)&&key(a.rentRollLabel)===key(b.rentRollLabel))
      return a.leaseLabels.some(m=>b.leaseLabels.some(n=>key(m)===key(n)));
    const labels=new Set(ruleLabels(a).map(key));
    return ruleLabels(b).some(l=>labels.has(key(l)));
  }
  function decided(rules,anchor,member){
    return rules.some(s=>s.status==='active'&&s.rule&&['includes','separate'].includes(s.rule.type)&&
      key(s.rule.rentRollLabel)===key(anchor)&&s.rule.leaseLabels.some(l=>key(l)===key(member)));
  }
  function sideHas(row,label,side){
    const value=side==='lease'?row.leaseVal:row.resmanVal;
    const raw=side==='lease'?row.leaseRaw:row.resmanRaw;
    return value!=null && ([row.label,...(raw||[])].some(x=>key(x)===key(label)));
  }
  // A structure uses the rent roll's raw spelling, while comparisons may use
  // a recognized category label. Bridge only an exact observed spelling to a
  // unique displayed label; never guess equivalence from equal dollar amounts.
  function comparisonLabel(label,entries){
    const labels=new Set();
    for(const e of entries||[])for(const r of e.rows||[]){
      if([...(r.resmanRaw||[]),...(r.leaseRaw||[])].some(s=>key(s)===key(label)))labels.add(r.label);
    }
    return labels.size===1?[...labels][0]:label;
  }
  function membershipEvidence(rule,entries){
    const compact=compactRule(rule);
    if(!compact || compact.type!=='includes')return {ok:false,error:'Unsupported grouped-charge rule.'};
    if(compact.leaseLabels.some(m=>sameFamily(m,compact.rentRollLabel)))
      return {ok:false,error:'A grouped charge cannot include itself or one of its own tiers.'};
    const anchored=(entries||[]).filter(e=>(e.rows||[]).filter(r=>sideHas(r,compact.rentRollLabel,'resman')).length===1);
    if(anchored.length<3)return {ok:false,error:'Fewer than three grouped units support this convention.'};
    const eligible=new Set(), counts=[];
    for(const member of compact.leaseLabels){
      const supported=anchored.filter(e=>{
        const rows=e.rows||[];
        return rows.some(r=>r.status==='leaseonly'&&!r.soft&&sideHas(r,member,'lease')) && !rows.some(r=>sideHas(r,member,'resman'));
      });
      counts.push({member,eligible:supported.length,excluded:anchored.length-supported.length});
      if(compact.scope!=='unitemised'&&supported.length!==anchored.length)
        return {ok:false,error:'“'+member+'” has different evidence across grouped units. If this property uses both bundled and separately billed plans, choose “Included only when not separately billed” and review the limited scope. Otherwise keep the findings.'};
      if(supported.length<3)return {ok:false,error:'Fewer than three units have both the grouped bill and a lease-only “'+member+'”. No inclusion was approved.'};
      supported.forEach(e=>eligible.add(e.unit));
    }
    return {ok:true,units:eligible.size,counts};
  }
  function questions({entries=[],proposals=[],structures=[],rules=[],loadError=false,protectedTest=()=>false}={}){
    const grouped = new Map(), out=[], occupied=new Set(entries.map(e=>e.unit));
    // A pre-results interruption must earn its place. Small clusters belong in
    // the audit results; a useful question needs both a meaningful absolute
    // count and enough of the property to suggest a real convention.
    const questionThreshold=Math.max(8,Math.ceil(occupied.size*0.10));
    const add=(q)=>{if(!out.some(x=>x.key===q.key))out.push(q);};
    if(loadError) add({key:'rules-unavailable',kind:'load',label:'Saved conventions',units:[],
      message:'Saved property conventions could not be loaded. Continue with the available checks, or reconnect and process again. Nothing missing has been treated as verified.'});
    for(const e of entries) for(const r of e.rows||[]) {
      if(r.soft || r.hiddenByFilter || !['resmanonly','leaseonly','mismatch','probable'].includes(r.status))continue;
      const label=r.label;
      // The engine may split a same-name price difference into two unmatched
      // rows. That is not missing disclosure and must not become two questions.
      const names=[label,...(r.resmanRaw||[])].map(key);
      const hasLease=(e.rows||[]).some(x=>x.leaseVal!=null && [x.label,...(x.leaseRaw||[])].some(l=>names.includes(key(l))));
      const status=r.status==='resmanonly'&&hasLease?'mismatch':r.status;
      const k=status+'::'+key(label);
      if(!grouped.has(k))grouped.set(k,{key:k,label,status,units:new Set(),examples:[]});
      const g=grouped.get(k);g.units.add(e.unit);
      if(g.examples.length<4)g.examples.push({unit:e.unit,lease:r.leaseVal,billed:r.resmanVal});
    }
    // A missing disclosure has no safe local interpretation. Asking about one
    // here only forces the manager through a question this pilot cannot act on;
    // keep it visible as a normal finding unless a separately supported
    // convention below has evidence to validate.
    const anchors=new Set();
    for(const p of proposals){
      const rule=compactRule(p.rule);if(!rule || (p.units||[]).length<questionThreshold)continue;
      if(ruleLabels(rule).some(protectedTest))continue;
      const label=rule.rentRollLabel||rule.target||rule.subject, anchor=key(label);
      if(anchors.has(anchor))continue;
      anchors.add(anchor);
      add({key:'convention::'+anchor,kind:'proposal',label,units:[...p.units],rule,
        message:'A repeated pattern affects '+p.units.length+' units. '+p.describe+' Is this your property’s convention? Repetition is a reason to ask, not proof that the billing is correct.'});
    }
    // Group membership is asked only where that unit has both the grouped bill
    // and a lease-only line; do not borrow unrelated charges from other units.
    const packages=new Map();
    for(const e of entries){
      const leftovers=(e.rows||[]).filter(r=>r.status==='leaseonly'&&!r.soft);
      if(!leftovers.length)continue;
      for(const r of e.rows||[]) {
        const label=(r.resmanRaw||[]).find(n=>/community\s*fee|amenit|package|bundle/i.test(n))||r.label;
        if(r.resmanVal==null || !/community\s*fee|amenit|package|bundle/i.test(label))continue;
        const anchor=key(label);
        if(protectedTest(label))continue;
        if(anchors.has(anchor) || rules.some(s=>s.status==='active'&&s.rule&&s.rule.type==='bundle'&&key(s.rule.rentRollLabel)===anchor))continue;
        if(!packages.has(anchor))packages.set(anchor,{label,units:new Set(),members:new Map()});
        const g=packages.get(anchor);g.units.add(e.unit);
        for(const member of leftovers){
          if(sameFamily(member.label,label)||protectedTest(member.label)||decided(rules,label,member.label))continue;
          const mk=key(member.label);
          if(!g.members.has(mk))g.members.set(mk,{label:member.label,units:new Set()});
          g.members.get(mk).units.add(e.unit);
        }
      }
    }
    for(const [anchor,g] of packages){
      // These are QUESTIONS, not pre-approved members. Each candidate needs its
      // own repeated evidence; preview separately validates the chosen scope.
      const members=[...g.members.values()].filter(m=>m.units.size>=questionThreshold).map(m=>m.label).sort();
      if(g.units.size<questionThreshold || !members.length)continue;
      anchors.add(anchor);add({key:'convention::'+anchor,kind:'includes',label:g.label,units:[...g.units],members,
        message:'On '+g.units.size+' units, '+g.label+' is billed alongside unresolved lease charges. These may differ by unit. Confirm each amenity and its scope; no choice is assumed. Membership does not prove the total or resolve a price difference.'});
    }
    for(const s of structures){
      const anchor=key(s.inside),part=comparisonLabel(s.part,entries);
      if(!s.unexplained || (s.bundledUnits||[]).length<questionThreshold || protectedTest(s.inside)||protectedTest(part) || decided(rules,s.inside,part))continue;
      const existing=out.find(q=>key(q.label)===anchor);
      if(existing&&existing.members){
        if(!sameFamily(part,s.inside)&&!existing.members.some(m=>key(m)===key(part)))existing.members.push(part);
        continue;
      }
      if(anchors.has(anchor))continue;
      anchors.add(anchor);add({key:'structure::'+anchor,kind:'structure',label:s.inside,units:s.bundledUnits||[],
        part,message:'The rent-roll pattern suggests '+part+' may be included in '+s.inside+' for some units at a different package price. Confirm the relationship below. A billing pattern is not signed lease evidence.'});
    }
    // Do not make a manager explain a generic repeated finding. Until a model
    // can ask and validate a specific follow-up, that is a dead-end prompt.
    // Keep the finding visible and reserve pre-results interruption for a
    // supported proposal, grouped membership, or guided structure question.
    return out;
  }
  function response(text){
    const s=String(text||'').trim().toLowerCase().replace(/[’]/g,"'").replace(/[.!]+$/,'');
    if(/^(no|no thanks|keep (the )?original( findings| results)?|do not change( anything)?|don't change( anything)?|i don't know|unsure)$/.test(s))return 'keep';
    return s ? 'explain' : 'empty';
  }
  function storageKey(origin,user,property){
    if(!user || !property || !canPilot(origin))return null;
    return 'auditera.assistant.drafts.v1:'+JSON.stringify([origin,user,property]);
  }
  function readDrafts(storage,k){
    if(!k)return {rows:[],error:false};
    try{const raw=storage.getItem(k);if(!raw)return {rows:[],error:false};const obj=JSON.parse(raw);
      if(obj.version!==1 || !Array.isArray(obj.rows) || obj.rows.some(r=>!r||typeof r.id!=='string'||!compactRule(r.rule)))throw Error('Invalid drafts');
      return {rows:obj.rows.map(r=>({id:r.id,rule:compactRule(r.rule),source:'local-pilot',status:'active'})),error:false};
    }catch(_){return {rows:[],error:true};}
  }
  function writeDrafts(storage,k,rows){
    if(!k)return false;
    try{const compact=rows.map(r=>({id:r.id,rule:compactRule(r.rule)}));
      if(compact.some(r=>!r.rule))return false;
      storage.setItem(k,JSON.stringify({version:1,rows:compact}));return true;
    }catch(_){return false;}
  }
  return {key,copy,family,sameFamily,isTesting,canPilot,ruleLabels,compactRule,conflicts,decided,membershipEvidence,questions,response,storageKey,readDrafts,writeDrafts};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PropertyAssistant;
