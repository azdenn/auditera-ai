const assert=require('node:assert/strict');
const A=require('./property_assistant.js');
let n=0;const check=(name,fn)=>{fn();n++;console.log('PASS '+name);};
const entries=Array.from({length:80},(_,i)=>({unit:'Synthetic-'+i,rows:[{label:'Community Fee',status:'mismatch',leaseVal:100,resmanVal:145}]}));
check('80 supported structure discrepancies produce one guided question without changing rows',()=>{
  const before=JSON.stringify(entries);const qs=A.questions({entries,structures:[{inside:'Community Fee',part:'Cable',unexplained:true,bundledUnits:entries.map(e=>e.unit)}]});
  assert.equal(qs.length,1);assert.equal(qs[0].part,'Cable');assert.equal(JSON.stringify(entries),before);
});
check('Generic repeated findings do not create a dead-end question',()=>assert.deepEqual(A.questions({entries}),[]));
check('No interruption for clean comparisons',()=>assert.deepEqual(A.questions({entries:[{unit:'1',rows:[{status:'match',label:'Fee'}]}]}),[]));
check('Small split-price clusters go directly to findings',()=>{
  const qs=A.questions({entries:entries.slice(0,3).map(e=>({...e,rows:[{label:'Community Fee',status:'resmanonly',resmanVal:145},{label:'Community Fee',status:'leaseonly',leaseVal:100}]}))});
  assert.deepEqual(qs,[]);
});
check('No and uncertainty retain original findings',()=>{for(const text of ['No.','No thanks','Keep original findings',"I don't know","Don't change anything"]){assert.equal(A.response(text),'keep');}});
check('Production cannot enable pilot memory',()=>{assert.equal(A.canPilot('https://auditera.net'),false);assert.equal(A.storageKey('https://auditera.net','user','property'),null);});
check('Testing and blob dashboard origins supported',()=>assert.equal(A.canPilot(new URL('blob:https://testing.auditera.net/example').origin),true));
check('Storage separates users and properties',()=>{
  const keys=[['u1','p1'],['u2','p1'],['u1','p2']].map(([u,p])=>A.storageKey('https://testing.auditera.net',u,p));assert.equal(new Set(keys).size,3);
});
check('Missing identity cannot save property memory',()=>assert.equal(A.storageKey('null',null,'p'),null));
check('Unsupported price offsets and hiding cannot be persisted',()=>{for(const type of ['hide','rollup','bundle'])assert.equal(A.compactRule({type,subject:'Fee',rentRollLabel:'Fee',leaseLabels:['Cable']}),null);});
check('Malformed stored conventions rejected',()=>{assert.equal(A.compactRule({type:'alias',target:'Fee',spellings:'not-an-array'}),null);assert.equal(A.readDrafts({getItem:()=>'{broken'},'k').error,true);});
check('Persistence is an allowlist, not chat or resident evidence',()=>{
  let json;const store={setItem:(k,v)=>json=v,getItem:()=>json};
  assert.equal(A.writeDrafts(store,'k',[{id:'r',rule:{type:'alias',target:'Fee',spellings:['Package'],chat:'private'},evidence:{resident:'private'}}]),true);
  assert.equal(json.includes('private'),false);assert.equal(A.readDrafts(store,'k').rows.length,1);
});
check('Quota failures are explicit',()=>assert.equal(A.writeDrafts({setItem(){throw Error('quota');}},'k',[{id:'r',rule:{type:'alias',target:'Fee',spellings:['Package']}}]),false));
check('Missing disclosure remains a finding and never creates an unactionable gate',()=>{
  const qs=A.questions({entries:entries.map(e=>({...e,rows:[{status:'resmanonly',label:'Unlisted Fee',resmanVal:25}]}))});
  assert.deepEqual(qs,[]);
});
check('Grouped membership asks about repeated components, never a one-unit coincidence or its own tier',()=>{
  const rows=i=>[
    {label:'Community Fee',resmanRaw:['Community Fee'],resmanVal:115,status:'resmanonly'},
    {label:'Community Fee - 1 Bedroom',leaseRaw:['Community Fee - 1 Bedroom'],leaseVal:70,status:'leaseonly'},
    {label:'Cable / Internet',leaseRaw:['Cable / Internet'],leaseVal:50,status:'leaseonly'},
    ...(i===0?[{label:'Pest control',leaseRaw:['Pest control'],leaseVal:5,status:'leaseonly'}]:[]),
  ];
  const sample=Array.from({length:8},(_,i)=>({unit:'G'+i,rows:rows(i)}));
  const q=A.questions({entries:sample}).find(x=>x.kind==='includes');
  assert.deepEqual(q.members,['Cable / Internet']);
  assert.equal(A.membershipEvidence({type:'includes',rentRollLabel:'Community Fee',leaseLabels:['Cable / Internet']},sample).ok,true);
  assert.equal(A.membershipEvidence({type:'includes',rentRollLabel:'Community Fee',leaseLabels:['Pest control']},sample).ok,false);
  assert.equal(A.membershipEvidence({type:'includes',rentRollLabel:'Community Fee',leaseLabels:['Community Fee - 1 Bedroom']},sample).ok,false);
});
check('Protected rent findings go directly to results, never a mandatory question',()=>{
  const rent=Array.from({length:8},(_,i)=>({unit:'R'+i,rows:[{label:'Rent',status:'mismatch',leaseVal:1000,resmanVal:1050}]}));
  assert.deepEqual(A.questions({entries:rent,protectedTest:l=>/^rent$/i.test(l)}),[]);
});
check('Separate and scoped memberships round-trip through the compact allowlist',()=>{
  let json;const storage={setItem:(k,v)=>json=v,getItem:()=>json};
  const rows=[{id:'s',rule:{type:'separate',rentRollLabel:'Community Fee',leaseLabels:['Pet Rent'],chat:'private'}},
    {id:'i',rule:{type:'includes',scope:'unitemised',rentRollLabel:'Community Fee',leaseLabels:['Cable'],unitIds:['private']}}];
  assert.equal(A.writeDrafts(storage,'test',rows),true);
  assert.deepEqual(A.readDrafts(storage,'test').rows.map(r=>r.rule),rows.map(r=>A.compactRule(r.rule)));
  assert.equal(json.includes('private'),false);
  assert.equal(A.compactRule({...rows[1].rule,scope:'all-units-no-checks'}),null);
});
check('Only disjoint membership decisions may share an anchor',()=>{
  const included={type:'includes',rentRollLabel:'Community Fee',leaseLabels:['Cable']};
  assert.equal(A.conflicts(included,{type:'separate',rentRollLabel:'Community Fee',leaseLabels:['Pet']}),false);
  assert.equal(A.conflicts(included,{type:'separate',rentRollLabel:'Community Fee',leaseLabels:['Cable']}),true);
  assert.equal(A.conflicts(included,{type:'alias',target:'Other Fee',spellings:['Community Fee']}),true);
});
check('Mixed memberships require explicit scope and independent support for each member',()=>{
  const sample=Array.from({length:12},(_,i)=>({unit:'M'+i,rows:[
    {label:'Community Fee',resmanVal:145,status:'resmanonly'},
    {label:'Cable',leaseVal:50,status:'leaseonly'},
    ...(i>=9?[{label:'Cable',resmanVal:55,status:'resmanonly'}]:[]),
  ]}));
  const rule={type:'includes',rentRollLabel:'Community Fee',leaseLabels:['Cable']};
  assert.equal(A.membershipEvidence(rule,sample).ok,false);
  const limited=A.membershipEvidence({...rule,scope:'unitemised'},sample);
  assert.equal(limited.ok,true);assert.equal(limited.units,9);
  assert.deepEqual(limited.counts,[{member:'Cable',eligible:9,excluded:3}]);
  assert.equal(A.membershipEvidence({...rule,scope:'unitemised',leaseLabels:['Cable','Unseen']},sample).ok,false);
  const alreadyMatched=sample.map(e=>({...e,rows:e.rows.map(r=>r.leaseVal!=null?{...r,status:'match'}:r)}));
  assert.equal(A.membershipEvidence({...rule,scope:'unitemised'},alreadyMatched).ok,false);
});
console.log(n+'/'+n+' passed');
