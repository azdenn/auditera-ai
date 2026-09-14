const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {installGateStub}=require('./test_gate_stub.cjs');
let n=0;
const check=(name,fn)=>{fn();console.log('PASS '+name);n++;};
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://testing.auditera.net/memory-test',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../dist/tools/leaseverify.html'),'utf8')}));
    await installGateStub(page,{allowed:true,verdict:'allowed',property:{id:'synthetic-memory'}});
    await page.route('**/rest/v1/property_rules*',r=>{if(r.request().method()!=='GET')writes.push(r.request().method());return r.fulfill({contentType:'application/json',body:'[]'});});
    const token='x.'+Buffer.from(JSON.stringify({sub:'synthetic-user'})).toString('base64url')+'.x';
    await page.goto('https://testing.auditera.net/memory-test#tk='+token);
    async function seed(allSeparate=false){
      return page.evaluate(async allSeparate=>{
        await agAuthorizeAudit('leaseverify','Synthetic Memory Property','');
        PROPERTY_ID=AG_PROPERTY.id;PROPERTY_RULES=[];AG_RULES_LOAD_ERROR=false;
        rawFailedFiles=[];allUnitBlocks=new Map();rawSuccessByUnit=new Map();HIDDEN_CHECK_KEYS.clear();
        for(let i=0;i<13;i++){
          const unit='SYN-'+i,group=i!==12,ownBill=i>=9&&group;
          const charges=[{description:'Rent',amount:1200}];
          if(group)charges.push({description:'Community Fee',amount:ownBill?100:145});
          if(ownBill||allSeparate)charges.push({description:'Cable / Internet',amount:55});
          if(ownBill)charges.push({description:'Pet Rent',amount:23});
          const rawItems=[{rawLabel:'Monthly Base Rent',amount:1200},{rawLabel:'Cable / Internet',amount:50},{rawLabel:'Pet Rent',amount:23}];
          if(group)rawItems.push({rawLabel:'Community Fee',amount:100});
          if(i<9)rawItems.push({rawLabel:'Washer/Dryer',amount:31});
          allUnitBlocks.set(unit,{unit,residents:'Invented Resident',charges,total:charges.reduce((s,c)=>s+c.amount,0)});
          rawSuccessByUnit.set(unit,[{unit,filename:'invented.pdf',rawItems}]);
        }
        paReset();paBegin();reconcileAll();
        return {pending:paPending(),members:PA.current&&PA.current.members,rows:unitEntries.map(e=>({unit:e.unit,rows:e.rows}))};
      },allSeparate);
    }
    const original=await seed();
    check('Real mixed-plan inputs generate an amenity questionnaire',()=>{
      assert.equal(original.pending,true);assert.ok(original.members.some(l=>/cable/i.test(l)));assert.ok(original.members.some(l=>/pet/i.test(l)));assert.ok(original.members.some(l=>/washer/i.test(l)));
    });
    const choose=async(re,value)=>{
      const names=await page.evaluate(()=>PA.current.members);
      await page.locator('.pa-member').nth(names.findIndex(l=>re.test(l))).selectOption(value);
    };
    await choose(/cable/i,'included');
    await page.getByRole('button',{name:'Review amenity choices',exact:true}).click();
    check('A blanket inclusion is refused when unit evidence differs',()=>{});
    assert.match(await page.locator('#pa-preview').innerText(),/different evidence/);
    assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0);
    await choose(/cable/i,'conditional');await choose(/pet/i,'separate');
    await page.getByRole('button',{name:'Review amenity choices',exact:true}).click();
    assert.match(await page.locator('#pa-preview').innerText(),/9 eligible unit\(s\); 3 grouped unit\(s\) excluded/);
    check('Mixed-plan preview states exactly how many grouped units are excluded',()=>{});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.AUDITERA_MEMORY_SCREENSHOT)await page.locator('#property-assistant').screenshot({path:process.env.AUDITERA_MEMORY_SCREENSHOT});
    await page.locator('#pa-remember').check();
    await page.evaluate(()=>{window.originalStorageSetter=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('Synthetic quota failure');};});
    await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).click();
    assert.match(await page.locator('#pa-preview').innerText(),/Could not remember/);
    check('A failed memory write applies none of a multi-rule approval',()=>{});
    assert.deepEqual(await page.evaluate(()=>({rules:PROPERTY_RULES.length,separations:PA.separations.length,saved:localStorage.getItem(PA.storageKey)})),{rules:0,separations:0,saved:null});
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSetter;delete window.originalStorageSetter;});
    await page.getByRole('button',{name:'Review amenity choices',exact:true}).click();
    await page.locator('#pa-remember').check();
    await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).click();
    const result=await page.evaluate(()=>({pending:paPending(),rows:unitEntries.map(e=>({unit:e.unit,rows:e.rows})),saved:JSON.parse(localStorage.getItem(PA.storageKey)),separations:PA.separations.length}));
    check('Scoped inclusion and separate constraint persist atomically without chat or unit data',()=>{
      assert.equal(result.saved.rows.length,2);assert.equal(result.separations,1);
      assert.ok(result.saved.rows.some(r=>r.rule.type==='separate'));
      assert.ok(result.saved.rows.some(r=>r.rule.scope==='unitemised'));
      assert.doesNotMatch(JSON.stringify(result.saved),/SYN-|Invented|filename|residents|rawItems/);
    });
    check('Only qualifying units have cable included; separate bills and missing groups stay checked',()=>{
      for(const e of result.rows){
        const i=Number(e.unit.slice(4)),cable=e.rows.filter(r=>/cable/i.test(r.label));
        if(i<9)assert.ok(cable.some(r=>r.includedIn==='Community Fee'));
        else {assert.ok(cable.length);assert.ok(cable.every(r=>!r.includedIn&&!r.soft));}
        assert.ok(e.rows.filter(r=>/pet|washer/i.test(r.label)).every(r=>!r.includedIn&&!r.soft));
      }
      assert.equal(result.pending,false);
    });
    const next=await seed();
    check('Next run reuses both decisions and asks only about the still-unknown amenity',()=>{
      assert.equal(next.pending,true);assert.ok(next.members.every(l=>/washer/i.test(l)));
    });
    const safeguards=await page.evaluate(()=>{
      const synthetic=[{label:'Community Fee',leaseRaw:['Community Fee'],leaseVal:100,status:'leaseonly'},
        {label:'Pet / Animal rent',leaseRaw:['Pet Rent'],leaseVal:23,status:'leaseonly'},
        {label:'Community Fee',resmanRaw:['Community Fee'],resmanVal:123,status:'resmanonly'}];
      const held=PA.separations;PA.separations=[];const before=detectBundlesForUnit(synthetic);PA.separations=held;
      const after=detectBundlesForUnit(synthetic);
      const conflict=paValidate({type:'includes',scope:'unitemised',rentRollLabel:'Community Fee',leaseLabels:['Pet / Animal rent']});
      return {before:before.length,after:after.length,conflict:!!conflict.error};
    });
    check('Remembered separation blocks a real auto-bundle candidate and conflicting inclusion',()=>assert.deepEqual(safeguards,{before:1,after:0,conflict:true}));
    await seed(true);
    const suspended=await page.evaluate(()=>({status:PROPERTY_RULES[0].status,covered:unitEntries.flatMap(e=>e.rows).filter(r=>r.includedIn).length}));
    check('New documents with no qualifying units suspend the remembered inclusion',()=>assert.deepEqual(suspended,{status:'suspended',covered:0}));
    await seed();
    const interpretation=await page.evaluate(()=>{
      const v=observedChargeVocabulary();
      return {pet:paInterpretMembership('Pet fees are always separate and not included in the community fee',v),
        washer:paInterpretMembership('washer/dryer fees are included when there is a community fee on the rent roll',v),
        unknown:paInterpretMembership('Maybe washer/dryer is included in community fee?',v),
        contradiction:paInterpretMembership('Pet fees are not separate from community fee',v),
        contraction:paInterpretMembership("Washer/Dryer isn't included in Community Fee",v),
        reversed:paInterpretMembership('Community Fee is included in Washer/Dryer',v),
        active:paInterpretMembership('Community Fee includes Washer/Dryer',v)};
    });
    check('Bounded language handling understands the reported included/separate phrasing without treating rent roll as Rent',()=>{
      assert.equal(interpretation.pet.type,'separate');assert.equal(interpretation.washer.type,'includes');
      assert.equal(interpretation.unknown,null);assert.equal(interpretation.contradiction,null);
      assert.equal(interpretation.contraction,null);assert.equal(interpretation.reversed,null);
      assert.equal(interpretation.active.type,'includes');
    });
    await page.getByRole('button',{name:'Keep original findings',exact:true}).click();
    await page.getByRole('button',{name:'Forget this convention',exact:true}).click();
    check('One convention can be forgotten without losing the separate rule',()=>{});
    assert.deepEqual(await page.evaluate(()=>({types:JSON.parse(localStorage.getItem(PA.storageKey)).rows.map(r=>r.rule.type),separations:PA.separations.length,covered:unitEntries.flatMap(e=>e.rows).filter(r=>r.includedIn).length})),
      {types:['separate'],separations:1,covered:0});
    await page.getByRole('button',{name:'Forget this browser’s pilot conventions',exact:true}).click();
    check('Forgetting clears both rule types and recomputes the original baseline',()=>{});
    assert.deepEqual(await page.evaluate(()=>({separations:PA.separations.length,saved:localStorage.getItem(PA.storageKey),rows:unitEntries.map(e=>({unit:e.unit,rows:e.rows}))})),
      {separations:0,saved:null,rows:original.rows});
    check('No backend writes or browser errors',()=>{assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);});
    console.log(n+'/'+n+' passed');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
