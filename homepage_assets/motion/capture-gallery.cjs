const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('../../lease_tool/node_modules/playwright');
const XLSX = require('../../lease_tool/node_modules/xlsx');
const {sessionToken,installBrowserSession,installGateStub,installRulesStub} = require('../../shared/test_gate_stub.cjs');
const root = path.resolve(__dirname,'../..');
const out = path.resolve(process.argv[2]);
const origin = 'https://testing.auditera.net';
const property = {id:'demo',account_id:'demo',name:'Lumen Court',status:'active'};
function workbook(name,rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Report');
  return {name:name+'.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})};
}
const roll = workbook('Lumen Court - Rent Roll',[[property.name],['Rent Roll'],['Unit','Description','Amount','Residents','Status','Deposits','Surety Bonds'],['301','Rent',1600,'Demo Resident','Current',500,0],['302','Rent',1400,'Sample Resident','Current',0,0]]);
const ledger = workbook('301 - Resident Ledger',[['Demo Resident'],['Unit:','301'],['Lease Start Date','10/01/2025'],['Lease End Date','09/30/2026'],['Date','Description','Charge','Credit'],['10/01/2025','Rent',1600,0],['10/01/2025','Move-in Special',0,800],['11/01/2025','Move-in Special',0,800]]);
const invoice = workbook('Lumen Court - Coverage Invoice',[[property.name],['Invoice Date','Unit','Resident','Coverage Start','Coverage End','Amount'],['10/01/2025','302','Sample Resident','10/01/2025','10/31/2025',35]]);
async function run() {
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({viewport:{width:900,height:450},deviceScaleFactor:1.25,reducedMotion:'reduce',colorScheme:'dark'});
    await ctx.route('**/*',r=>r.abort());
    await ctx.addInitScript(() => localStorage.setItem('auditera.appearance.v1','dark'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(7000);
    const token = sessionToken('demo',{email:'demo@example.invalid'});
    await installBrowserSession(page,token);
    await installGateStub(page,{allowed:true,verdict:'allowed',property});
    await installRulesStub(page);
    const local = file=>({contentType:'text/html',body:fs.readFileSync(path.join(root,file))});
    async function shot(name,locator) {
      await locator.first().evaluate(el=>window.scrollTo(0,Math.max(0,el.getBoundingClientRect().top+scrollY-18)));
      await page.screenshot({path:path.join(out,name+'.png'),clip:{x:0,y:0,width:900,height:450}});
    }
    for (const [tool,input,file,unit] of [['concession','#ledger-files',ledger,'301'],['deposit','#invoice-file',invoice,'302']]) {
      const url=origin+'/'+tool;
      await page.route(url,r=>r.fulfill(local('dist/tools/'+tool+'verify.html')));
      await page.goto(url+'#tk='+token);
      await page.setInputFiles(input,file);
      await page.setInputFiles('#rentroll-file',roll);
      await shot(tool+'-upload',page.locator(input).locator('..'));
      await page.locator('#process-btn').click();
      const results=page.locator('#results-card');
      try {await results.waitFor();}catch(e){throw Error(tool+': '+await page.locator('#parse-status').textContent()+' / '+e.message);}
      const row=page.locator('#results-body tr').filter({hasText:unit}).first();
      await shot(tool+'-rows',row);
      await row.click();
      const detail=page.locator('#results-body .detail-row');
      const evidence=await detail.innerText();
      console.log(tool,evidence.slice(0,900));
      assert.match(evidence,tool==='deposit'?/no recurring charge/i:/1,600|1600/);
      await shot(tool+'-detail',detail);
    }
    await page.getByLabel('Report name').fill('Lumen Court - Coverage review');
    await page.getByLabel('What to save').selectOption('mismatch');
    await page.getByRole('button',{name:'Save report',exact:true}).click();
    await page.getByRole('button',{name:'Saved',exact:true}).waitFor();
    await shot('reports-save',page.locator('.save-report-bar'));
    await page.route(origin+'/app',r=>r.fulfill(local('dist/app.html')));
    await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'lease_tool/node_modules/@supabase/supabase-js/dist/umd/supabase.js'))}));
    await page.route('**/auth/v1/user',r=>r.fulfill({json:{id:'demo',email:'demo@example.invalid'}}));
    await page.route('**/rest/v1/subscriptions*',r=>r.fulfill({json:{account_id:'demo',user_id:'demo',role:'admin'}}));
    await page.route('**/rest/v1/properties*',r=>r.fulfill({json:[property]}));
    await page.getByRole('link',{name:'View saved reports'}).click();
    const open=page.getByRole('button',{name:'Open report: Lumen Court - Coverage review'});
    await shot('reports-library',page.locator('#saved-reports'));
    await open.click();
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download copy'}).click();
    const html=fs.readFileSync(await (await download).path(),'utf8');
    assert.match(html,/no recurring charge/i);
    await page.setContent(html);
    const summary=page.locator('summary').first();
    if(await summary.count())await summary.click();
    await shot('reports-copy',page.locator('body'));
  } finally {await browser.close();}
}
run().catch(err=>{console.error(err);process.exitCode=1;});




