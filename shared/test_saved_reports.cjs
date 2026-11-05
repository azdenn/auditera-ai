// Real dashboard, blob tools and IndexedDB. All accounts, records and HTTP are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../lease_tool/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'), ORIGIN='https://testing.auditera.net', BACKEND='https://kyfvrkghqohkhwidqwst.supabase.co';
const uid='10000000-0000-0000-0000-000000000001',account='20000000-0000-0000-0000-000000000001',property='30000000-0000-0000-0000-000000000001',propertyB='30000000-0000-0000-0000-000000000002';
const activeSid='40000000-0000-0000-0000-000000000001',requests=[];
const sdk=fs.readFileSync(path.join(ROOT,'lease_tool/node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
let privateAccess=true,revoked=false, auditDecision={allowed:true,verdict:'allowed',property:{id:property,name:'Example Apartments'}};
function session(userId=uid){const now=Math.floor(Date.now()/1000),user={id:userId,email:'invented@example.invalid',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};return {access_token:'e30.'+Buffer.from(JSON.stringify({sub:userId,session_id:activeSid,exp:now+3600,iat:now,role:'authenticated'})).toString('base64url')+'.synthetic',refresh_token:'synthetic-refresh-token',expires_at:now+3600,expires_in:3600,token_type:'bearer',user};}
async function routes(context){
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());requests.push({url:u.href,body:req.postData()||''});
  if(u.origin===ORIGIN && u.pathname==='/api/private-report-access'){
    assert(req.headers().authorization?.startsWith('Bearer '));
    return route.fulfill({status:privateAccess?204:403});
  }
  if(u.origin===ORIGIN){const rel=u.pathname==='/app'?'app.html':u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^(?:app\.html|index\.html|resman-setup\.js|tools\/(?:lease|concession|deposit)verify\.html)$/.test(rel))return route.abort();const file=path.join(ROOT,'dist',rel);if(!fs.existsSync(file))return route.fulfill({status:404,body:'missing synthetic asset'});return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(file)});}
  if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('/@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:sdk});
  if(u.origin!==BACKEND)return route.abort();
  const answer=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname==='/auth/v1/user')return answer(revoked?{message:'Synthetic revoked session',code:'bad_jwt'}:session().user,revoked?401:200);
  if(u.pathname==='/auth/v1/token')return answer(session());
  if(u.pathname==='/auth/v1/logout')return answer({});
  if(u.pathname==='/rest/v1/subscriptions')return answer({user_id:uid,account_id:account,username:'invented',property_name:'Example Apartments',role:'admin'});
  if(u.pathname==='/rest/v1/properties')return answer([{id:property,account_id:account,name:'Example Apartments',address:'123 Invented Road',status:'active',trial_ends_at:null},{id:propertyB,account_id:account,name:'Example Annex',status:'active',trial_ends_at:null}]);
  if(u.pathname==='/rest/v1/rpc/has_active_licence')return answer(true);
  if(u.pathname==='/rest/v1/login_events')return answer({});
  if(u.pathname==='/rest/v1/property_rules')return answer([]);
  if(u.pathname==='/functions/v1/authorize-audit')return answer(auditDecision);
  if(u.pathname==='/functions/v1/record-run-outcome')return answer({ok:true});
  throw new Error('Unexpected synthetic network endpoint '+u.pathname);
 });
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1180,height:850}});await routes(context);
  const dashboard=await context.newPage(),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));dashboard.on('pageerror',e=>errors.push(e.message));
  await dashboard.goto(ORIGIN+'/app');
  await dashboard.locator('#login-username').fill('invented@example.invalid');await dashboard.locator('#login-password').fill('synthetic-example');
  await dashboard.locator('#login-form button[type=submit]').click();await dashboard.locator('#saved-reports').waitFor();
  const preview=process.env.AUDITERA_PREVIEW_DIR;
  for(const [key,name] of Object.entries({reconciler:'LeaseVerify',concession:'ConcessionVerify',deposit:'DepositVerify'})){
    const [page]=await Promise.all([context.waitForEvent('page'),dashboard.locator('button[onclick="launchTool(\''+key+'\')"]').click()]);
    await page.waitForURL('blob:**');await page.locator('.save-report-bar').waitFor({state:'attached'});
    const granted=await page.evaluate(async name=>await agAuthorizeAudit(name.toLowerCase(),'Example Apartments','123 Invented Road'),name);assert.equal(granted,true);
    await page.evaluate(name=>{
      const entry={unit:'101',unitKey:'101',category:'needs-review',residents:'Sample resident',filenames:[],rows:[],rawLease:[],rawResman:[],issueCount:0,note:'Review the monthly charge for this unit.',findings:[],concession:{hasConcession:false,issues:[]},coverageLabel:'Traditional Security Deposit',hiddenCount:0,cov:{onDeposit:true,depositAmount:500}};
      unitEntries=[entry];
      if(name==='ConcessionVerify')PROPERTY_NAME='Example Apartments';else detectedPropertyName='Example Apartments';
      document.getElementById('results-card').classList.remove('hidden');
    },name);
    if(preview&&key==='reconciler')await page.locator('.save-report-bar').screenshot({path:path.join(preview,'1-save.png')});
    await page.getByRole('button',{name:'Save report',exact:true}).click();
    try{await page.getByRole('button',{name:'Saved',exact:true}).waitFor({timeout:5000});}catch(e){throw Error(name+': '+await page.locator('.save-report-bar [role=status]').textContent()+' '+errors.join(' '));}
    // One unit can contain a match, a discrepancy and an unresolved comparison.
    await page.evaluate(name=>{
      const entry=unitEntries[0];
      entry.category=name==='LeaseVerify'?'mismatch':name==='DepositVerify'?'discrepancy':'issue';
      if(name==='LeaseVerify') entry.rows=['match','mismatch','probable'].map((status,i)=>({status,label:'Scope sample '+i,leaseVal:10,resmanVal:10+i}));
      if(name==='ConcessionVerify') entry.concession={hasConcession:true,issues:[],rows:['match','mismatch','review'].map((status,i)=>({status,item:'Scope sample '+i,expected:'10',actual:'12'}))};
      if(name==='DepositVerify') entry.findings=['soft','flag','flag'].map((severity,i)=>({severity,label:'Scope sample '+i,note:'',facts:{},hiddenByFilter:i===2}));
      document.querySelector('#results-body').innerHTML='<tr><td>Visible table result</td></tr>';
    },name);
    for(const [index,scope] of ['match','mismatch','review','view'].entries()){
      await page.getByLabel('What to save').selectOption(scope);
      await page.getByLabel('Report name').fill(key+' '+scope);
      await page.getByRole('button',{name:'Save report',exact:true}).click();
      await page.getByRole('button',{name:'Saved',exact:true}).waitFor();
      await dashboard.reload();
      await dashboard.getByRole('button',{name:'Open report: '+key+' '+scope,exact:true}).click();
      const body=dashboard.frameLocator('.saved-reader iframe').locator('body');
      if(scope==='view') await body.getByText('Visible table result',{exact:true}).waitFor();
      else if(key==='deposit' && scope==='review') await body.getByText('No results in this category.').waitFor();
      else await body.getByText('Scope sample '+index,{exact:false}).last().waitFor();
      const output=await body.innerText();
      for(let i=0;i<3;i++) if(i!==index) assert(!output.includes('Scope sample '+i),name+' leaked a different status into '+scope);
      assert(!output.includes('Review the monthly charge'));
      await dashboard.getByRole('button',{name:'Back to dashboard'}).click();
    }
    await page.getByRole('link',{name:'View saved reports'}).click();await page.locator('#saved-reports .saved-row').first().waitFor();
    const open=page.getByRole('button',{name:'Open report: '+name,exact:false});
    if(preview&&key==='reconciler')await page.locator('#saved-reports').screenshot({path:path.join(preview,'2-history.png')});
    await open.click();const frame=page.frameLocator('.saved-reader iframe');
    await frame.getByRole('heading',{name:'Unit details'}).waitFor();await frame.getByText('101 · Sample resident',{exact:true}).click();
    if(key==='deposit') await frame.locator('details[open]').getByText('Deposits:',{exact:false}).waitFor();
    else await frame.getByText('Review the monthly charge for this unit.',{exact:false}).last().waitFor();
    if(preview&&key==='reconciler')await page.locator('.saved-reader').screenshot({path:path.join(preview,'3-view.png')});
    await page.getByRole('button',{name:'Back to dashboard'}).click();await page.reload();await open.waitFor();
    console.log('PASS '+name+' live dashboard launch, save, open, unit details and reload (mocked provider).');
    await page.close();
  }
  // Exercise the normal upload and Process path. The gate can legitimately
  // allow a developer audit without returning a property id.
  const XLSX=require('../lease_tool/node_modules/xlsx');
  const [run]=await Promise.all([context.waitForEvent('page'),dashboard.locator('button[onclick="launchTool(\'deposit\')"]').click()]);
  await run.waitForURL('blob:**');
  function roll(building,occupied){
    const rows=[[building],['Rent Roll'],['Unit','Description','Amount','Residents','Status','Deposits'],
      ['101','Rent',900,occupied?'Synthetic Tester':'Vacant',occupied?'Current':'Vacant',500]];
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Rent Roll');
    return {name:'rent.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})};
  }
  await run.setInputFiles('#invoice-file',{name:'invoice.csv',mimeType:'text/csv',buffer:Buffer.from('Unit,Amount\n101,20\n')});
  auditDecision={allowed:true,verdict:'dev',property:null};
  await run.setInputFiles('#rentroll-file',roll('Example Apartments',true));
  await run.locator('#process-btn').click();await run.locator('#results-card').waitFor();
  await run.getByLabel('Report name').fill('Completed upload');await run.getByRole('button',{name:'Save report',exact:true}).click();
  await run.getByRole('button',{name:'Saved',exact:true}).waitFor({timeout:3000}).catch(async()=>{throw Error('Completed upload: '+await run.locator('.save-report-bar [role=status]').innerText())});
  // The original dashboard stays open while a different tab processes and saves.
  await dashboard.getByRole('button',{name:'Open report: Completed upload',exact:true}).click({timeout:2500});
  await dashboard.frameLocator('.saved-reader iframe').getByText('101 · Synthetic Tester',{exact:true}).waitFor();
  await dashboard.getByRole('button',{name:'Back to dashboard'}).click();
  // A completed, vacant-only rent roll is a valid zero-unit snapshot.
  auditDecision={allowed:true,verdict:'allowed',property:{id:property,name:'Example Apartments'}};
  await run.setInputFiles('#invoice-file',{name:'empty.csv',mimeType:'text/csv',buffer:Buffer.from('Unit,Amount\n')});
  await run.setInputFiles('#rentroll-file',roll('Example Apartments',false));
  await run.locator('#process-btn').click();await run.locator('#results-card').waitFor();
  assert.equal(await run.evaluate(()=>unitEntries.length),0);
  await run.getByLabel('Report name').fill('Empty completed audit');await run.getByRole('button',{name:'Save report',exact:true}).click();
  await run.getByRole('button',{name:'Saved',exact:true}).waitFor();

  // An unrelated building must never be filed under an existing licence.
  auditDecision={allowed:true,verdict:'dev',property:null};
  await run.setInputFiles('#rentroll-file',roll('Other Synthetic Building',true));
  await run.locator('#process-btn').click();await run.locator('#results-card').waitFor();
  await run.getByRole('button',{name:'Save report',exact:true}).click();
  await run.getByRole('button',{name:'Saved',exact:true}).waitFor();
  const row=dashboard.locator('#saved-reports .saved-row').filter({hasText:'Other Synthetic Building'});
  await row.waitFor({timeout:3000});
  await run.close();
  await dashboard.reload();await row.getByRole('button').click();
  const reader=dashboard.locator('.saved-reader');
  await dashboard.frameLocator('.saved-reader iframe').getByText('101 · Synthetic Tester',{exact:true}).waitFor();
  const pending=dashboard.waitForEvent('download');
  await reader.getByRole('button',{name:'Download copy'}).click();
  const downloaded=await pending;
  const downloadBody=fs.readFileSync(await downloaded.path(),'utf8');
  assert(downloadBody.includes('Synthetic Tester'));assert(downloadBody.includes('Content-Security-Policy'));
  assert(!/<script\b/i.test(downloadBody));
  await reader.getByRole('button',{name:'Back to dashboard'}).click();
  privateAccess=false;
  await row.getByRole('button').click();
  await dashboard.locator('#saved-reports [role=status]').filter({hasText:'could not be confirmed'}).waitFor();
  assert.equal(await dashboard.locator('.saved-reader').count(),0);
  privateAccess=true;
  const documentPage=await context.newPage();
  await documentPage.setContent('<h1>Example Apartments</h1><p>Unit: 101</p><p>Resident: Synthetic Tester</p><p>Monthly rent $900.00</p>');
  const documentBytes=await documentPage.pdf();await documentPage.close();
  for(const [key,input] of [['reconciler','#lease-files'],['concession','#ledger-files']]){
    const [toolPage]=await Promise.all([context.waitForEvent('page'),dashboard.locator('button[onclick="launchTool(\''+key+'\')"]').click()]);
    await toolPage.waitForURL('blob:**');
    await toolPage.setInputFiles(input,{name:'101 Synthetic.pdf',mimeType:'application/pdf',buffer:documentBytes});
    await toolPage.setInputFiles('#rentroll-file',roll('Example Apartments',true));
    await toolPage.locator('#process-btn').click();
    await toolPage.locator('#results-card').waitFor({timeout:10000}).catch(async()=>{throw Error(key+': '+await toolPage.locator('#parse-status').textContent())});
    await toolPage.getByLabel('Report name').fill(key+' processed');
    await toolPage.getByRole('button',{name:'Save report',exact:true}).click();
    await toolPage.getByRole('button',{name:'Saved',exact:true}).waitFor({timeout:3000});
    await dashboard.reload();await dashboard.getByRole('button',{name:'Open report: '+key+' processed',exact:true}).click();
    await dashboard.frameLocator('.saved-reader iframe').getByRole('heading',{name:'Unit details'}).waitFor();
    await dashboard.getByRole('button',{name:'Back to dashboard'}).click();await toolPage.close();
  }
  await dashboard.goto(ORIGIN+'/');await dashboard.goBack();await dashboard.locator('#saved-reports .saved-row').first().waitFor();
  assert.equal(await dashboard.locator('#saved-reports .saved-row').count(),20);
  await dashboard.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('auditera.activity.v1:'))localStorage.setItem(k,JSON.stringify({last:Date.now()-21600001}));});
  await dashboard.reload();await dashboard.locator('#login-form').waitFor();assert.equal(await dashboard.locator('#saved-reports').count(),0);
  assert.deepEqual(errors,[]);assert(!requests.some(r=>r.body.includes('Sample resident')||r.body.includes('Review the monthly charge')));
  console.log('PASS Back, twenty saved snapshots, including private save/reopen/download, idle lock, local-only report contents and no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
