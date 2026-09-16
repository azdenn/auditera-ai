const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {installGateStub}=require('./test_gate_stub.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://testing.auditera.net/review-page',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../dist/tools/leaseverify.html'),'utf8')}));
  await installGateStub(page,{allowed:true,verdict:'allowed',property:{id:'synthetic-review'}});
  await page.route('**/rest/v1/property_rules*',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  const token='x.'+Buffer.from(JSON.stringify({sub:'review-user'})).toString('base64url')+'.x';
  await page.goto('https://testing.auditera.net/review-page#tk='+token);
  const before=await page.evaluate(async()=>{
   await agAuthorizeAudit('leaseverify','Synthetic Property','');PROPERTY_ID=AG_PROPERTY.id;
   PROPERTY_RULES=[];AG_RULES_LOAD_ERROR=false;allUnitBlocks=new Map();rawSuccessByUnit=new Map();rawFailedFiles=[];
   for(let i=0;i<18;i++){
    const unit='SYN-'+i,anchor=i<9?'Community Fee':'Amenity Package',member=i<9?'Cable / Internet':'Washer/Dryer';
    allUnitBlocks.set(unit,{unit,residents:'Invented Resident',charges:[{description:'Rent',amount:1200},{description:anchor,amount:145}],total:1345});
    rawSuccessByUnit.set(unit,[{unit,filename:'synthetic.pdf',rawItems:[{rawLabel:'Monthly Base Rent',amount:1200},{rawLabel:anchor,amount:100},{rawLabel:member,amount:50}]}]);
   }
   paReset();paBegin();reconcileAll();return unitEntries.map(e=>e.rows);
  });
  assert.ok(await page.locator('.pa-question').count()>=2,'all real questions render together');
  assert.equal(await page.getByRole('button',{name:'Review choices',exact:true}).count(),1);
  assert.equal(await page.locator('#pa-answer').isVisible(),false,'prose is optional, not a required second submit');
  for(const input of await page.locator('.pa-member').all())await input.selectOption('conditional');
  assert.ok((await page.locator('.pa-member[data-selected="true"]').count())>=2);
  await page.getByRole('button',{name:'Review choices',exact:true}).click();
  assert.equal(await page.evaluate(()=>PROPERTY_RULES.length),0,'review is not approval');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.AUDITERA_REVIEW_SCREENSHOT)await page.locator('#property-assistant').screenshot({path:process.env.AUDITERA_REVIEW_SCREENSHOT});
  await page.getByRole('button',{name:'Approve and rerun checks',exact:true}).click();
  assert.equal(await page.evaluate(()=>paPending()),false);
  assert.equal(await page.locator('#results-card').isVisible(),true);
  assert.equal(await page.evaluate(()=>PROPERTY_RULES.length),2,'both groups approved in one action');
  // Separate fresh run: valid answers must not turn a failed validator into a trap.
  await page.evaluate(()=>{PROPERTY_RULES=[];paReset();paBegin();reconcileAll();});
  for(const input of await page.locator('.pa-member').all())await input.selectOption('conditional');
  await page.evaluate(()=>{PA.baseline=[];}); // Deliberate validator unit-boundary fault, not question seeding.
  await page.getByRole('button',{name:'Review choices',exact:true}).click();
  assert.match(await page.locator('#pa-preview').innerText(),/selection was received/i);
  assert.equal(await page.evaluate(()=>PROPERTY_RULES.length),0);
  await page.getByRole('button',{name:'Continue without changes',exact:true}).click();
  assert.equal(await page.evaluate(()=>paPending()),false);
  assert.deepEqual(await page.evaluate(()=>unitEntries.map(e=>e.rows)),before);
  assert.deepEqual(errors,[]);
  console.log('PASS single-page questions, highlight, batch approval, mobile layout and explicit unchanged-result fallback');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1;});
