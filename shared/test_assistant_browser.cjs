const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
const {installGateStub}=require('./test_gate_stub.cjs');
let n=0;const check=(name,fn)=>{fn();n++;console.log('PASS '+name);};
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();const errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://testing.auditera.net/pilot-test',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../dist/tools/leaseverify.html'),'utf8')}));
    await installGateStub(page,{allowed:true,verdict:'allowed',property:{id:'synthetic-property'}});
    await page.route('**/rest/v1/property_rules*',r=>{if(r.request().method()!=='GET')writes.push(r.request().method());return r.fulfill({contentType:'application/json',body:'[]'});});
    const token='x.'+Buffer.from(JSON.stringify({sub:'synthetic-user'})).toString('base64url')+'.x';
    await page.goto('https://testing.auditera.net/pilot-test#tk='+token);
    async function seed(kind='mismatch'){
      return page.evaluate(async kind=>{
        await agAuthorizeAudit('leaseverify','Synthetic Property','');
        PROPERTY_ID=AG_PROPERTY.id;PROPERTY_RULES=[];AG_RULES_LOAD_ERROR=false;
        rawFailedFiles=[];allUnitBlocks=new Map();rawSuccessByUnit=new Map();HIDDEN_CHECK_KEYS.clear();CHARGE_STRUCTURES=[];
        for(let i=0;i<9;i++){
          const unit='SYN-'+i;const alias=kind==='alias';
          const billed=alias?(i===8?55:50):145;
          const block={unit,residents:'Invented Resident',total:1200+billed,charges:[{description:'Rent',amount:1200},{description:'Community Fee',amount:billed}]};
          const rawItems=[{rawLabel:'Monthly Base Rent',amount:1200},{rawLabel:alias?'Service Package':'Community Fee',amount:alias?50:100}];
          if(!alias)rawItems.push({rawLabel:'Cable / Internet',amount:50});
          allUnitBlocks.set(unit,block);rawSuccessByUnit.set(unit,[{unit,filename:'synthetic.pdf',rawItems}]);
        }
        paReset();paBegin();reconcileAll();
        return {pending:paPending(),rows:unitEntries.map(e=>e.rows),key:PA.storageKey};
      },kind);
    }
    const initial=await seed();
    check('Actual reconciliation generates its own membership question',()=>assert.equal(initial.pending,true));
    check('Final results and all export builders stay gated',()=>{});
    assert.equal(await page.locator('#results-card').isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>({csv:buildExportRows(),pdf:buildPdfReportHtml(),print:exportPdfReport()})),{csv:[],pdf:'',print:false});
    if(!await page.locator('#pa-answer').isVisible())await page.locator('summary').filter({hasText:'Need to explain'}).click();
    await page.locator('#pa-answer').fill('No');await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    const declined=await page.evaluate(()=>({pending:paPending(),rows:unitEntries.map(e=>e.rows),rules:PROPERTY_RULES.length,saved:localStorage.getItem(PA.storageKey)}));
    check('No releases results and retains original comparisons without creating a convention',()=>{assert.equal(declined.pending,false);assert.deepEqual(declined.rows,initial.rows);assert.equal(declined.rules,0);assert.equal(declined.saved,null);});
    assert.equal(await page.locator('#results-card').isVisible(),true);
    assert.ok((await page.evaluate(()=>buildExportRows())).length>0);
    await seed();
    await page.locator('.pa-member').selectOption('separate');
    await page.getByRole('button',{name:'Review choices',exact:true}).click();
    await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).click();
    check('Separate is a useful answer and never removes findings',()=>{});
    assert.equal(await page.evaluate(()=>paPending()),false);
    assert.deepEqual(await page.evaluate(()=>unitEntries.map(e=>e.rows)),initial.rows);
    await seed();
    check('Amenity decisions default to uncertainty, not inclusion',()=>{});
    assert.equal(await page.locator('.pa-member').inputValue(),'unknown');
    await page.locator('.pa-member').selectOption('included');
    await page.getByRole('button',{name:'Review choices',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),1);
    await page.locator('.pa-member').selectOption('unknown');
    check('Changing a guided answer invalidates its approval',()=>{});
    assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0);
    if(!await page.locator('#pa-answer').isVisible())await page.locator('summary').filter({hasText:'Need to explain'}).click();
    await page.locator('#pa-answer').fill('washer/dryer fees are included when there is a community fee on the rent roll');
    await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    check('Unsupported prose asks for a guided clarification instead of blaming the manager',()=>{});
    assert.match(await page.locator('#pa-preview').innerText(),/confirm each relationship/i);
    assert.equal(await page.evaluate(()=>PROPERTY_RULES.length),0);
    await seed('alias');
    await page.evaluate(()=>paPreview({type:'alias',target:'Community Fee',spellings:['Service Package']}));
    check('Preview does not apply a rule',()=>{});assert.equal(await page.evaluate(()=>PROPERTY_RULES.length),0);
    if(!await page.locator('#pa-answer').isVisible())await page.locator('summary').filter({hasText:'Need to explain'}).click();
    await page.locator('#pa-answer').fill('Actually, no');
    const stale=await page.evaluate(()=>PA.preview);
    check('Editing an answer invalidates the old approval',()=>assert.equal(stale,null));
    await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    check('Negative explanation cannot produce an approval button',()=>{});assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0);
    await page.evaluate(()=>paPreview({type:'alias',target:'Community Fee',spellings:['Service Package']}));
    await page.locator('#pa-remember').check();await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).click();
    const approved=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem(PA.storageKey)),rules:PROPERTY_RULES.map(r=>r.status),priceIssue:unitEntries.flatMap(e=>e.rows).some(r=>r.resmanVal===55&&isRealIssueRow(r)&&!isRowFiltered(r))}));
    check('Approval persists only the compact local convention',()=>{assert.equal(approved.saved.rows.length,1);assert.deepEqual(Object.keys(approved.saved.rows[0]).sort(),['id','rule']);assert.deepEqual(approved.rules,['active']);});
    check('Naming approval preserves the genuinely differing amount',()=>assert.equal(approved.priceIssue,true));
    await seed('alias');
    check('Next audit loads and revalidates browser convention',()=>{});assert.equal(await page.evaluate(()=>PROPERTY_RULES[0].status),'active');
    const collision=await page.evaluate(()=>{
      PROPERTY_RULES=[{id:'shared',rule:{type:'alias',target:'Community Fee',spellings:['Other Package']},source:'shared',status:'active'}];
      paReset();paBegin();
      return {skipped:PA.skippedDrafts,localApplied:PROPERTY_RULES.filter(r=>r.source==='local-pilot').length,shared:PROPERTY_RULES[0].id};
    });
    check('Shared convention wins over an overlapping browser draft',()=>assert.deepEqual(collision,{skipped:1,localApplied:0,shared:'shared'}));
    await seed('alias');
    await page.evaluate(()=>{rawSuccessByUnit.forEach(v=>v[0].rawItems=v[0].rawItems.filter(r=>r.rawLabel!=='Service Package'));paReset();PROPERTY_RULES=[];paBegin();reconcileAll();});
    check('Missing new evidence never treats remembered rule as active',()=>{});assert.notEqual(await page.evaluate(()=>PROPERTY_RULES[0].status),'active');
    const blocked=await page.evaluate(async()=>({save:await agSaveRule(PROPERTY_ID,{type:'hide',subject:'Fee'},'typed'),remove:await agDeleteRule('shared')}));
    check('Testing cannot mutate shared live conventions',()=>{assert.deepEqual(blocked,{save:null,remove:false});assert.deepEqual(writes,[]);});
    await page.evaluate(()=>{while(paPending())paKeep();});
    await page.getByRole('button',{name:'Forget this browser’s pilot conventions',exact:true}).click();
    check('Forgetting removes local memory and reruns without local conventions',()=>{});assert.deepEqual(await page.evaluate(()=>({stored:localStorage.getItem(PA.storageKey),local:PROPERTY_RULES.filter(r=>r.source==='local-pilot').length})),{stored:null,local:0});
    await seed();await page.setViewportSize({width:390,height:844});
    check('Mobile pilot does not overflow viewport',()=>{});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const shot=process.env.AUDITERA_ASSISTANT_SCREENSHOT;if(shot)await page.screenshot({path:shot,fullPage:true});
    const boundaries=await page.evaluate(()=>{
      const rule={type:'includes',rentRollLabel:'Community Fee',leaseLabels:['Cable / Internet']};
      PROPERTY_RULES=[{id:'synthetic-inclusion',rule,status:'active'}];rebuildRuleEngine();
      const lease=[{rawLabel:'Cable / Internet',amount:50}];
      const run=charges=>reconcileUnit(lease,{unit:'GUARD',residents:'Invented Resident',charges,total:0},null).rows;
      const noGroup=run([]);
      const leaseOnlyGroup=reconcileUnit([...lease,{rawLabel:'Community Fee',amount:145}],{unit:'GUARD',charges:[],total:0},null).rows;
      const separate=run([{description:'Community Fee',amount:145},{description:'Cable / Internet',amount:55}]);
      const grouped=run([{description:'Community Fee',amount:145}]);
      PROPERTY_RULES=[];rebuildRuleEngine();
      const tiers=[{rawLabel:'Community Fee - 1 Bedroom',amount:115},{rawLabel:'Community Fee - 2 Bedroom',amount:145}];
      const tierRows=reconcileUnit(tiers,{unit:'TIER',charges:[{description:'Community Fee',amount:145}],total:145},null).rows;
      const ambiguous=reconcileUnit(tiers.map(r=>({...r,amount:145})),{unit:'TIER',charges:[{description:'Community Fee',amount:145}],total:145},null).rows;
      const unmatched=reconcileUnit(tiers,{unit:'TIER',charges:[{description:'Community Fee',amount:260}],total:260},null).rows;
      const falseBundle=detectBundlesForUnit(unmatched);
      return {noGroup,leaseOnlyGroup,separate,grouped,tierRows,ambiguous,unmatched,falseBundle};
    });
    check('Membership cannot cover units without a billed group, including a lease-only group',()=>{
      for(const rows of [boundaries.noGroup,boundaries.leaseOnlyGroup])assert.equal(rows.some(r=>r.includedIn),false);
    });
    check('Separately billed amount differences cannot be covered by membership',()=>{
      assert.equal(boundaries.separate.some(r=>r.includedIn),false);
      assert.ok(boundaries.separate.some(r=>r.status!=='match'&&!r.soft));
    });
    check('A genuine lease-only member with a grouped bill still applies',()=>assert.ok(boundaries.grouped.some(r=>r.includedIn==='Community Fee')));
    check('Full engine selects the unique matching bedroom tier without summing defaults',()=>{
      assert.ok(boundaries.tierRows.some(r=>r.leaseVal===145&&r.resmanVal===145));
      assert.ok(boundaries.tierRows.some(r=>r.leaseVal===115&&r.tierOption));
    });
    check('Equal-price default tiers retain an unresolved duplicate',()=>assert.ok(boundaries.ambiguous.some(r=>r.status==='leaseonly'&&!r.soft),JSON.stringify(boundaries.ambiguous)));
    check('No matching tier cannot become a bundle summing both bedroom defaults',()=>assert.deepEqual(boundaries.falseBundle,[]));
    await page.route('https://testing.auditera.net/blob-host',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Blob host</title>'}));
    await page.goto('https://testing.auditera.net/blob-host');
    const popupReady=page.context().waitForEvent('page');
    await page.evaluate(({html,token})=>{
      const url=URL.createObjectURL(new Blob([html],{type:'text/html'}))+'#tk='+encodeURIComponent(token);
      window.open(url,'_blank');
    },{html:fs.readFileSync(path.join(__dirname,'../dist/tools/leaseverify.html'),'utf8'),token});
    const blobPage=await popupReady;await blobPage.waitForLoadState('domcontentloaded');
    const blobResult=await blobPage.evaluate(()=>{
      const k='auditera-blob-storage-check';localStorage.setItem(k,'yes');const stored=localStorage.getItem(k);localStorage.removeItem(k);
      return {origin:location.origin,pilot:PropertyAssistant.canPilot(location.origin),testing:agTestingRulesReadOnly(),stored,
        hash:location.hash,tokenInAddress:location.href.includes('tk=')};
    });
    check('Real dashboard blob supports memory, read-only rules, and removes the token from its address',()=>assert.deepEqual(blobResult,
      {origin:'https://testing.auditera.net',pilot:true,testing:true,stored:'yes',hash:'',tokenInAddress:false}));
    await blobPage.close();
    check('No application script errors',()=>assert.deepEqual(errors,[]));
    console.log(n+'/'+n+' passed');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
