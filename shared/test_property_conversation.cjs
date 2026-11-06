// Actual synthetic PDF/XLSX uploads exercise follow-ups, approval and a second
// run through the normal entry point. No production data or network access.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const XLSX=require('../lease_tool/node_modules/xlsx');
const {sessionToken,installBrowserSession,installGateStub,installRulesStub}=require('./test_gate_stub.cjs');
const origin='https://testing.auditera.net';
(async()=>{
  const browser=await chromium.launch();
  try {
    const context=await browser.newContext({viewport:{width:1100,height:850},reducedMotion:'reduce'});
    const page=await context.newPage(), errors=[], outbound=[];
    page.on('pageerror',e=>errors.push(e.message));
    context.on('request',r=>{if(r.method()!=='GET')outbound.push(r.postData()||'');});
    const leases=[],rows=[['Synthetic Court'],['Rent Roll'],['Unit','Description','Amount','Residents','Status']];
    for(let i=0;i<12;i++){
      const unit='C'+(101+i);
      await page.setContent('<main style="font:16px Arial;line-height:1.5"><h1>Apartment Lease Contract</h1>'+
        '<p>Apartment No. ____ City: ____ State: ____ Zip: ____ '+unit+' Arcadia TX 00000</p>'+
        '<p>C. Monthly Base Rent (Par. 3)</p><p>$ 1200.00</p>'+
        '<p>L. Additional Rent - Monthly Recurring Fixed Charges.</p>'+
        '<p>Animal rent $ 23.00 Cable/satellite $ Internet $</p>'+
        '<p>Package service $ Pest control $ Stormwater/drainage $</p>'+
        '<p>Trash service $ Washer/Dryer $ 31.00</p>'+
        '<p>Other: Community Fee $ 100.00</p></main>');
      leases.push({name:unit+' - Lease.pdf',mimeType:'application/pdf',buffer:await page.pdf()});
      rows.push([unit,'Rent',1200,'Invented Resident','Current']);
      if(i!==11)rows.push(['','Community Fee',i<9?145:100]);
      if(i>=9&&i<11)rows.push(['','Washer/Dryer',36]);
    }
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Rent Roll');
    const rentRoll={name:'Synthetic Court - Rent Roll.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})};
    await page.route(origin+'/conversation',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../dist/tools/leaseverify.html'))}));
    await installGateStub(page,{allowed:true,verdict:'allowed',property:{id:'conversation-property',name:'Synthetic Court'}});
    await installRulesStub(page);
    const token=sessionToken('conversation-user');
    await installBrowserSession(page,token);
    async function run(){
      await page.goto(origin+'/conversation#tk='+token);
      await page.setInputFiles('#lease-files',leases);
      await page.setInputFiles('#rentroll-file',rentRoll);
      await page.locator('#process-btn').click();
      await page.locator('#property-assistant').waitFor();
    }
    await run();
    assert.equal(await page.evaluate(()=>unitEntries.length),12);
    console.log('Questions',await page.evaluate(()=>PA.questions.map(q=>({label:q.label,members:q.members}))));
    const before=await page.evaluate(()=>unitEntries.map(e=>({unit:e.unit,rows:e.rows})));
    await page.locator('#pa-answer').fill('washer/dryer is included');
    await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    assert.match(await page.locator('#pa-chat-log').innerText(),/Which billed package/);
    await page.locator('#pa-chat-choices').getByRole('button',{name:'Community Fee',exact:true}).click();
    assert.match(await page.locator('#pa-chat-log').innerText(),/How is Washer\/Dryer billed/);
    assert.equal(await page.evaluate(()=>PROPERTY_RULES.length),0);
    assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0);
    for(const vague of ['yes','included']){
      await page.locator('#pa-answer').fill(vague);
      await page.getByRole('button',{name:'Review my answer',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0,'Vague answer must not imply blanket inclusion');
    }
    await page.locator('#pa-answer').fill('unless separately billed');
    await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).waitFor();
    assert.match(await page.locator('#pa-preview').innerText(),/9 eligible unit\(s\); 2 grouped unit\(s\) excluded/);
    assert.deepEqual(await page.evaluate(()=>unitEntries.map(e=>({unit:e.unit,rows:e.rows}))),before);
    // Editing must invalidate the approval, even after a successful dialogue.
    await page.locator('#pa-answer').fill('I need to check');
    assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0);
    await page.getByRole('button',{name:'Start a new explanation',exact:true}).click();
    await page.locator('#pa-answer').fill('Washer/Dryer is included in Community Fee');
    await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    await page.locator('#pa-chat-choices').getByRole('button',{name:'Included only when not separately billed',exact:true}).click();
    await page.locator('#pa-remember').check();
    if(process.env.AUDITERA_CONVERSATION_SCREENSHOT)await page.locator('#property-assistant').screenshot({path:process.env.AUDITERA_CONVERSATION_SCREENSHOT});
    await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).click();
    const after=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem(PA.storageKey)),rows:unitEntries.map(e=>({unit:e.unit,rows:e.rows})),pending:PA.questions}));
    assert.equal(after.saved.rows.length,1);
    assert.equal(after.saved.rows[0].rule.scope,'unitemised');
    assert.doesNotMatch(JSON.stringify(after.saved),/C101|Invented|unless separately|speaker|conversation/);
    for(const entry of after.rows){
      const index=Number(entry.unit.slice(1))-101;
      const washer=entry.rows.filter(r=>/washer/i.test(r.label));
      if(index<9)assert(washer.some(r=>r.includedIn==='Community Fee'));
      else assert(washer.every(r=>!r.includedIn&&!r.soft));
      assert(entry.rows.filter(r=>/pet|animal/i.test(r.label)).every(r=>!r.includedIn&&!r.soft));
    }
    assert(after.pending.some(q=>(q.members||[]).some(m=>/pet|animal/i.test(m))), 'One approval must leave the remaining amenities available');
    await run();
    assert.equal(await page.evaluate(()=>PROPERTY_RULES.filter(r=>r.source==='local-pilot'&&r.status==='active').length),1);
    await page.locator('#pa-answer').fill('Pet fees are always separate from Community Fee');
    await page.getByRole('button',{name:'Review my answer',exact:true}).click();
    await page.locator('#pa-chat-choices').getByRole('button',{name:'I’m not sure',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).count(),0);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Keep original findings',exact:true}).click();
    await page.locator('#results-card').waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(PA.storageKey)).rows.length),1);
    assert(outbound.every(body=>!body.includes('unless separately billed')&&!body.includes('Invented Resident')));
    assert.deepEqual(errors,[]);
    console.log('PASS uploaded files, missing package/scope follow-ups, preview invalidation, conditional approval, retained price/other-charge findings, remembered second run, uncertainty and mobile');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
