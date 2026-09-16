/* LeaseVerify's local-only clarification pilot. Not a hosted language model.
   Never sends explanations/evidence, and never writes shared property rules. */
var PA = null;
function paReset(){
  PA = {enabled:false,pending:PropertyAssistant.canPilot(location.origin),answered:new Set(),baseline:[],drafts:[],storageKey:null,
    storageError:false,skippedDrafts:0,current:null,preview:null,kept:0,applied:0,finished:false,clarifications:[],separations:[]};
  document.getElementById('property-assistant').classList.add('hidden');
}
function paPending(){ return !!(PA && PA.pending); }
// Negative conventions may prevent automatic grouping, never hide findings.
// They are local pilot state, not a new shared/backend rule verb.
function paSeparatePair(anchor,labels){
  return !!(PA&&PA.enabled&&PA.separations.some(s=>
    PropertyAssistant.key(s.rule.rentRollLabel)===PropertyAssistant.key(anchor)&&
    s.rule.leaseLabels.some(member=>labels.some(l=>PropertyAssistant.key(l)===PropertyAssistant.key(member)))));
}
function paInterpretMembership(text,vocab){
  // Deliberately bounded language support, not a claim of general understanding.
  // Longer explanations, uncertainty and multiple subjects need guided choices.
  const raw=String(text||'').replace(/[’]/g,"'");
  if(raw.length>600||/\?|\b(?:maybe|perhaps|uncertain|unsure|sometimes|unless)\b|\bnot sure\b|\bdon't know\b/i.test(raw))return null;
  const labels=prFindLabels(raw.replace(/\brent[ -]roll\b/gi,'billing export'),vocab);
  // Only resolve a colloquial name to a known, unique displayed category.
  for(const [re,label] of [[/\bpet fees?\b/i,'Pet / Animal rent'],[/\brenters? insurance\b/i,'Resident liability insurance']]){
    const found=vocab.filter(l=>PropertyAssistant.key(l)===PropertyAssistant.key(label));
    if(re.test(raw)&&found.length===1&&!labels.some(l=>PropertyAssistant.key(l)===PropertyAssistant.key(found[0])))labels.push(found[0]);
  }
  const anchors=labels.filter(l=>/community\s*fee|amenit|package|bundle/i.test(l)&&!hasTierWord(l));
  if(anchors.length!==1)return null;
  const anchor=anchors[0],members=labels.filter(l=>l!==anchor&&!PropertyAssistant.sameFamily(l,anchor));
  if(members.length!==1)return null;
  const conditional=/\bonly (?:when|where) (?:it is |they are )?not separately billed\b/i.test(raw);
  const separate=!conditional&&/\b(?:always separate|are separate|is separate|not included|never included)\b/i.test(raw);
  if(/\bnot (?:always )?separate\b/i.test(raw))return null;
  const positive=raw.replace(/\b(?:not|never) included\b/gi,'');
  if(separate&&/\bincluded\b|\bcovers\b/i.test(positive))return null;
  let intent=positive;
  if(conditional)intent=intent.replace(/\bonly (?:when|where) (?:it is |they are )?not separately billed\b/gi,'');
  if(/\b(?:no|not|never|except|unless|some|but)\b|\b(?:isn|aren|don|doesn|can|shouldn|wouldn|won)'?t\b/i.test(intent))return null;
  if(!separate){
    const normal=PropertyAssistant.key(raw),a=normal.indexOf(PropertyAssistant.key(anchor));
    let m=normal.indexOf(PropertyAssistant.key(members[0]));
    if(m<0&&/pet/i.test(members[0]))m=normal.indexOf('pet fee');
    if(m<0&&/insurance/i.test(members[0]))m=normal.search(/renters? insurance/);
    const passive=normal.indexOf(' included '),active=normal.search(/\b(?:includes|covers)\b/);
    if(m<0||!(m<passive&&passive<a || a<active&&active<m))return null;
  }
  return {type:separate?'separate':'includes',rentRollLabel:anchor,leaseLabels:members,...(conditional?{scope:'unitemised'}:{})};
}
function paBegin(){
  if (!PA) paReset();
  PA.enabled = PropertyAssistant.canPilot(location.origin);
  if (!PA.enabled) return;
  // sub is a local namespace only, NOT authorization. The real server gate has
  // already resolved AG_PROPERTY before this function is called by processing.
  try {
    const part = String(AG_TOKEN).split('.')[1];
    const user = JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))).sub;
    if (typeof user==='string' && AG_PROPERTY && AG_PROPERTY.id===PROPERTY_ID)
      PA.storageKey = PropertyAssistant.storageKey(location.origin,user,PROPERTY_ID);
    const loaded = PropertyAssistant.readDrafts(localStorage,PA.storageKey);
    PA.drafts = loaded.rows; PA.storageError = loaded.error;
    // Shared rules win. A stale local convention must never overwrite an alias
    // or membership that was later saved for the real property. Local drafts
    // also cannot overlap one another: rule maps are order-sensitive.
    const occupied=new Set(PROPERTY_RULES.flatMap(r=>PropertyAssistant.ruleLabels(r.rule).map(PropertyAssistant.key)));
    const accepted=[];
    for(const row of loaded.rows){
      const labels=PropertyAssistant.ruleLabels(row.rule).map(PropertyAssistant.key);
      if(labels.some(l=>occupied.has(l))||accepted.some(other=>PropertyAssistant.conflicts(row.rule,other.rule))){PA.skippedDrafts++;continue;}
      if(row.rule.type==='separate' && !prValidateRule({...row.rule,type:'includes'},labels).ok){PA.storageError=true;continue;}
      accepted.push(row);
    }
    PA.separations=accepted.filter(row=>row.rule.type==='separate');
    PROPERTY_RULES.push(...accepted.filter(row=>row.rule.type!=='separate'));
  } catch (_) { PA.storageError = true; }
}
function paSetBaseline(entries){ if(PA && PA.enabled) PA.baseline=entries; }
function paOnReconcile(){
  if(!PA || !PA.enabled || PA.finished)return false;
  const qs=PropertyAssistant.questions({entries:unitEntries,proposals:RULE_PROPOSALS,
    structures:CHARGE_STRUCTURES,rules:[...PROPERTY_RULES,...PA.separations],loadError:AG_RULES_LOAD_ERROR||PA.storageError,
    protectedTest:label=>Object.values(PROTECTED_SUBJECTS).some(re=>{re.lastIndex=0;return re.test(String(label||''));})});
  PA.questions=qs.filter(q=>!PA.answered.has(q.key));
  PA.current=PA.questions[0]||null;
  PA.preview=null;
  PA.pending=!!PA.current;
  paRender(qs.filter(q=>!PA.answered.has(q.key)).length);
  return PA.pending;
}
function paElement(tag,text,parent){
  const el=document.createElement(tag);if(text!=null)el.textContent=text;
  if(parent)parent.appendChild(el);return el;
}
function paButton(text,fn,parent){
  const b=paElement('button',text,parent);b.type='button';b.className='ghost pa-button';
  b.style.margin='6px 8px 6px 0';b.addEventListener('click',fn);return b;
}
function paRender(remaining){
  const box=document.getElementById('property-assistant');box.replaceChildren();
  box.classList.remove('hidden');
  paElement('h2','Property assistant · local preview',box);
  const intro=paElement('p','Testing pilot: guided questions and a limited local interpreter—not a hosted AI chatbot. Documents and explanations stay in this browser. Only approved conventions can be remembered here.',box);
  intro.style.lineHeight='1.6';
  if(!PA.pending){
    PA.finished=true;
    paElement('p',PA.applied+' convention(s) approved; '+PA.kept+' question(s) retained without changes. Results below include any previously approved conventions that remain valid.',box);
    for(const note of PA.clarifications)paElement('p',note,box);
    return;
  }
  document.getElementById('results-card').classList.add('hidden');
  paElement('p','1. Choose below. 2. Review choices. 3. Confirm and view results. All '+remaining+' question(s) are on this page. Not sure keeps the original findings; agreement is never required.',box);
  const heading=paElement('h3','Review your property’s billing conventions',box);heading.tabIndex=-1;
  paElement('p','“Always included” means every unit billed the named package. “Only when not separately billed” leaves separate bills checked. Leave uncertain amenities as “Not sure”. These answers do not verify a package price or replace signed terms.',box).style.lineHeight='1.6';
  if(PA.storageError)paElement('p','Browser conventions could not be read. Nothing missing was treated as verified; remembering is disabled for this run.',box);
  const questions=PA.questions||[PA.current];
  const choices=[];
  for(const q of questions){
    const group=paElement('fieldset',null,box);group.className='pa-question';
    group.style.cssText='margin:16px 0;padding:16px;border:1px solid #424760;border-radius:10px;min-width:0';
    paElement('legend',q.label,group);
    paElement('p',q.kind==='includes'?'This package is billed on '+q.units.length+' units with unresolved individual charges. Which amenities does it include?':q.message,group).style.lineHeight='1.6';
    const members=q.members||(q.part?[q.part]:[]);
    const addChoice=(name,options,member)=>{
      const label=paElement('label',null,group);label.style.display='block';label.style.padding='6px';
      label.appendChild(document.createTextNode(name+' '));
      const input=paElement('select',null,label);input.className='pa-member';
      input.style.cssText='display:block;width:100%;max-width:100%;padding:8px;margin-top:6px;font:inherit;background:#1c2030;color:inherit;border:1px solid #424760;border-radius:6px';
      for(const [value,text] of options){
        const option=paElement('option',text,input);option.value=value;
      }
      const state=paElement('small','Not sure — findings will stay unchanged.',label);state.style.display='block';
      input.addEventListener('change',()=>{
        PA.preview=null;document.getElementById('pa-preview').replaceChildren();
        const selected=input.value!=='unknown';input.dataset.selected=String(selected);
        input.style.borderColor=selected?'#b1a2ff':'#424760';input.style.background=selected?'#332b56':'#1c2030';
        state.textContent=selected?'Selected: '+input.selectedOptions[0].textContent+' — not applied yet.':'Not sure — findings will stay unchanged.';
      });
      choices.push({q,member,input});
    };
    for(const name of members)addChoice(name,[['unknown','Not sure — keep findings'],['included','Always included when '+q.label+' is billed'],['conditional','Included only when not separately billed'],['separate','Separate — keep checking']],name);
    if(q.rule&&!members.length)addChoice('Does this suggested convention describe your property?', [['unknown','Not sure / no — keep findings'],['suggested','Yes — review this suggestion']],null);
  }
  paButton('Review choices',()=>{
    const rules=[];
    for(const {q,member,input} of choices){
      if(input.value==='unknown')continue;
      if(input.value==='suggested'){rules.push(q.rule);continue;}
      const type=input.value==='separate'?'separate':'includes',scope=input.value==='conditional'?'unitemised':undefined;
      let rule=rules.find(r=>r.type===type&&r.rentRollLabel===q.label&&r.scope===scope);
      if(!rule){rule={type,rentRollLabel:q.label,leaseLabels:[]};if(scope)rule.scope=scope;rules.push(rule);}
      if(!rule.leaseLabels.includes(member))rule.leaseLabels.push(member);
    }
    if(!rules.length){
      PA.preview=null;paNotice('No changes selected. Confirm to view results with the original findings; nothing will be remembered.');
      paButton('Confirm and keep original findings',()=>paKeepAll(),document.getElementById('pa-preview'));return;
    }
    paPreview(rules,questions.map(q=>q.key));
  },box);
  paButton('Keep original findings',()=>paKeepAll(),box);
  const details=paElement('details',null,box);details.style.marginTop='18px';
  paElement('summary','Need to explain something different? (optional written answer)',details);
  const label=paElement('label','Written explanation — reviewed separately from the choices above',details);label.htmlFor='pa-answer';
  label.style.display='block';label.style.marginTop='14px';
  const input=paElement('textarea',null,details);input.id='pa-answer';input.rows=3;input.maxLength=2000;
  input.style.cssText='width:100%;box-sizing:border-box;margin:8px 0;padding:10px;font:inherit';
  input.placeholder='Optional: add detail, or use the guided choices above. Say “no” to keep the findings.';
  input.addEventListener('input',()=>{
    PA.preview=null;document.getElementById('pa-preview').replaceChildren();
  });
  paButton('Review my answer',()=>{
    PA.preview=null;document.getElementById('pa-preview').replaceChildren();
    const intent=PropertyAssistant.response(input.value);
    if(intent==='keep'){paKeepAll();return;}
    if(intent==='empty'){paNotice('Please explain the convention, or choose Keep original findings.');return;}
    const vocab=observedChargeVocabulary();
    const membership=paInterpretMembership(input.value,vocab);
    if(membership){paPreview(membership);return;}
    const parsed=prParseSentence(input.value.replace(/\brent[ -]roll\b/gi,'billing export'),vocab);
    if(!parsed.rule){
      paNotice('I cannot reliably turn this explanation into a rule yet. Nothing has changed. '+
        ((PA.current.members||PA.current.part)?'Please confirm each relationship using the choices above. “Separate” keeps the charge checked; “Not sure” does not approve inclusion.':'Keep the original findings if the suggested convention does not describe your property.'));
      return;
    }
    paPreview(parsed.rule);
  },details);
  const preview=paElement('div',null,box);preview.id='pa-preview';preview.setAttribute('aria-live','polite');
  heading.focus();
}
function paNotice(message){
  const box=document.getElementById('pa-preview');box.replaceChildren();
  paElement('p',message,box).setAttribute('role','status');
  box.scrollIntoView({block:'nearest'});
}
function paValidate(rule){
  const compact=PropertyAssistant.compactRule(rule);
  if(!compact)return {error:'This pilot supports charge naming and grouped-charge membership only. Price exceptions, hide/ignore rules and unsupported explanations retain the original findings.'};
  const valid=prValidateRule(compact.type==='separate'?{...compact,type:'includes'}:compact,observedChargeVocabulary());
  if(!valid.ok)return {error:valid.errors.join(' ')};
  if(['includes','separate'].includes(compact.type)&&compact.leaseLabels.some(m=>PropertyAssistant.sameFamily(m,compact.rentRollLabel)))
    return {error:'Choose an amenity, not the grouped charge itself or its bedroom defaults.'};
  let membership=null;
  if(compact.type==='includes'){
    membership=PropertyAssistant.membershipEvidence(compact,PA.baseline);
    if(!membership.ok)return {error:membership.error};
  }
  const labels=PropertyAssistant.ruleLabels(compact).map(PropertyAssistant.key);
  const overlap=[...PROPERTY_RULES,...PA.separations,...(PA.drafts||[])].find(s=>s.source!=='local-pilot'
    ? PropertyAssistant.ruleLabels(s.rule).some(l=>labels.includes(PropertyAssistant.key(l)))
    : PropertyAssistant.conflicts(compact,s.rule));
  if(overlap)return {error:'An existing convention already refers to these charges. This pilot will not stack potentially conflicting conventions. Keep the findings and review the existing convention.'};
  const evidence=compact.type==='separate'?{holdsOn:0,amountDiffers:[]}:
    (membership?{holdsOn:membership.units,amountDiffers:[],counts:membership.counts}:prCheckRuleAgainstData(compact,PA.baseline));
  if(compact.type==='separate')return {rule:compact,evidence};
  if(evidence.blocked || evidence.contradictedOn || !evidence.holdsOn)
    return {error:'The untouched document comparisons do not support applying this interpretation consistently. No convention has been applied or saved.'};
  return {rule:compact,evidence};
}
function paValidateBatch(rules){
  const items=[];
  for(const rule of rules){
    const checked=paValidate(rule);if(checked.error)return checked;
    if(items.some(i=>PropertyAssistant.conflicts(i.rule,checked.rule)))return {error:'These choices conflict. Each amenity needs one relationship to this grouped charge.'};
    items.push(checked);
  }
  return {items};
}
function paDescribe(rule){
  if(rule.type==='separate')return rule.leaseLabels.join(', ')+' must stay separate from '+rule.rentRollLabel+'. Do not automatically bundle these charges together. Missing bills, missing lease terms and price mismatches remain checked.';
  return prDescribeRule(rule)+(rule.scope==='unitemised'?' Applies only on units with this grouped bill, a lease-side member, and no separate bill for that member. All other units retain their original findings.':'');
}
function paPreview(rule,questionKeys){
  if(!paPending())return;
  PA.preview=null;
  const checked=paValidateBatch(Array.isArray(rule)?rule:[rule]);
  if(checked.error){
    paNotice(checked.error+' Your selection was received, but nothing was applied or saved. Adjust the choices above, or continue without changes.');
    paButton('Continue without changes',()=>paKeepAll(),document.getElementById('pa-preview'));return;
  }
  PA.preview={...checked,question:PA.current.key,questions:questionKeys||[PA.current.key]};
  const panel=document.getElementById('pa-preview');panel.replaceChildren();
  paElement('h3','Interpretation preview — not yet applied',panel);
  paElement('p','Unselected or “Not sure” answers keep their original findings. Only the conventions listed below will be applied.',panel);
  for(const item of checked.items){
    paElement('p',paDescribe(item.rule),panel);
    if(item.rule.type==='separate')paElement('p','This records your instruction to keep checking these charges. It is not proof that the current bills are correct.',panel);
    else paElement('p','Applies to '+item.evidence.holdsOn+' unit comparison(s). Naming does not verify an amount; membership does not establish a package price. Remaining discrepancies and missing signed terms stay visible.',panel);
    for(const count of item.evidence.counts||[])paElement('p',count.member+': '+count.eligible+' eligible unit(s); '+count.excluded+' grouped unit(s) excluded from this interpretation.',panel);
  }
  const label=paElement('label',null,panel);label.style.display='block';
  const remember=paElement('input',null,label);remember.type='checkbox';remember.id='pa-remember';
  remember.disabled=!PA.storageKey||PA.storageError;
  label.appendChild(document.createTextNode(' Remember for this property and signed-in user, on this browser only (testing).'));
  if(remember.disabled)paElement('p','Browser memory is unavailable for this session. You may apply the convention for this run only.',panel);
  paButton('Approve and rerun checks',()=>paApprove(),panel);
  panel.scrollIntoView({block:'nearest'});
}
function paApprove(){
  if(!paPending() || !PA.preview || PA.preview.question!==PA.current.key)return;
  const checked=paValidateBatch(PA.preview.items.map(i=>i.rule));
  if(checked.error){PA.preview=null;paNotice(checked.error);return;}
  const remember=document.getElementById('pa-remember');
  const rows=checked.items.map(item=>({id:'local-pilot-'+crypto.randomUUID(),rule:item.rule,source:'local-pilot',status:'active'}));
  if(remember && remember.checked){
    let saved=false;
    try{saved=PropertyAssistant.writeDrafts(localStorage,PA.storageKey,[...PA.drafts,...rows]);}catch(_){}
    if(!saved){PA.preview=null;paNotice('Could not remember this convention. Nothing was applied. Preview again and leave Remember unchecked to use it for this run only.');return;}
    PA.drafts.push(...rows);
  }
  for(const key of PA.preview.questions||[PA.current.key])PA.answered.add(key);
  PA.applied+=checked.items.length;PA.preview=null;
  PA.separations.push(...rows.filter(r=>r.rule.type==='separate'));
  PROPERTY_RULES.push(...rows.filter(r=>r.rule.type!=='separate'));
  reconcileAll();
  if(!paPending())reportRunOutcome('completed');
}
function paKeep(){
  if(!paPending())return;
  PA.answered.add(PA.current.key);PA.kept++;PA.preview=null;
  if(!paOnReconcile()){
    renderHouseRules();syncMtmFeeFromLeases();renderDashboard();reportRunOutcome('completed');
  }
}
function paKeepAll(){
  if(!paPending())return;
  for(const q of PA.questions||[PA.current]){PA.answered.add(q.key);PA.kept++;}
  PA.preview=null;
  if(!paOnReconcile()){
    renderHouseRules();syncMtmFeeFromLeases();renderDashboard();reportRunOutcome('completed');
  }
}
function paForgetRule(id){
  const remembered=PA.drafts.some(r=>r.id===id);
  const next=PA.drafts.filter(r=>r.id!==id);
  let saved=!remembered;
  if(remembered){try{saved=PropertyAssistant.writeDrafts(localStorage,PA.storageKey,next);}catch(_){}}
  if(!saved){
    alert('Could not update browser memory. Nothing changed.');return;
  }
  PA.drafts=next;PA.separations=PA.separations.filter(r=>r.id!==id);
  PROPERTY_RULES=PROPERTY_RULES.filter(r=>r.source!=='local-pilot'||r.id!==id);
  PA.finished=true;PA.preview=null;reconcileAll();
}
function paRenderReadOnlyRules(wrap){
  if(!PropertyAssistant.isTesting(location.origin))return false;
  wrap.classList.remove('hidden');
  paElement('h3','Property conventions · testing',wrap);
  paElement('p','Shared live conventions are read-only here. Local pilot conventions never change production or another user’s settings.',wrap);
  if(AG_RULES_LOAD_ERROR)paElement('p','Shared saved conventions could not be loaded; unavailable conventions were not applied.',wrap).setAttribute('role','alert');
  if(PA && PA.skippedDrafts)paElement('p',PA.skippedDrafts+' browser convention(s) were not applied because another saved convention already uses the same charge labels. Forget the local pilot conventions before replacing them.',wrap).setAttribute('role','alert');
  for(const row of PROPERTY_RULES){
    const valid=prValidateRule(row.rule,PropertyAssistant.ruleLabels(row.rule));
    const description=valid.ok?(row.source==='local-pilot'?paDescribe(row.rule):prDescribeRule(row.rule)):'Invalid saved convention (not applied)';
    const item=paElement('p',description+' — '+row.status+(row.source==='local-pilot'?' (local pilot)':' (shared, read-only)'),wrap);
    if(row.explain)paElement('small',row.explain,item);
    if(row.source==='local-pilot')paButton('Forget this convention',()=>paForgetRule(row.id),item);
  }
  for(const row of (PA&&PA.separations)||[]){
    const item=paElement('p',paDescribe(row.rule)+' (local pilot)',wrap);
    paButton('Forget this separate rule',()=>paForgetRule(row.id),item);
  }
  if(PA && PA.storageKey){
    paButton('Forget this browser’s pilot conventions',()=>{
      try{localStorage.removeItem(PA.storageKey);}catch(_){alert('Could not clear browser memory. Nothing changed.');return;}
      PA.drafts=[];PA.separations=[];PA.storageError=false;
      PROPERTY_RULES=PROPERTY_RULES.filter(r=>r.source!=='local-pilot');
      // Explicit removal restores findings; does not immediately ask to save again.
      PA.finished=true;reconcileAll();
      const box=document.getElementById('property-assistant');box.replaceChildren();
      paElement('p','Local pilot conventions forgotten. Results recalculated without them. Shared live conventions were not changed.',box);
    },wrap);
  }
  return true;
}
