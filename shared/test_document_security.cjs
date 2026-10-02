// Synthetic, offline regressions for the September 27 review findings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {escapeCell} = require('./csv_export.js');
const {installGateStub, GATE_HASH} = require('./test_gate_stub.cjs');
const root = path.resolve(__dirname, '..');
let checks = 0;
function check(name, fn) {fn(); checks++; console.log('PASS ' + name);}

async function main() {
  for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(1)', '  =1', '\t=1', '\r=1', '\n=1', '\u0000=1', '＝1', '＋1', '－1', '＠SUM(1)']) {
    check('formula-like text is neutralized ' + JSON.stringify(value), () =>
      assert.equal(escapeCell(value), '"\'' + value + '"'));
  }
  check('numeric amount stays numeric-looking', () => assert.equal(escapeCell(-123.45), '"-123.45"'));
  check('null stays empty', () => assert.equal(escapeCell(null), '""'));
  check('embedded delimiters, quotes and carriage returns are quoted', () =>
    assert.equal(escapeCell('Unit,"A"\rB'), '"Unit,""A""\rB"'));
  const lock = JSON.parse(fs.readFileSync(path.join(root,'lease_tool/package-lock.json')));
  check('SheetJS official fixed distribution is locked with integrity', () => {
    const dep = lock.packages['node_modules/xlsx'];
    assert.equal(dep.version, '0.20.3');
    assert.equal(dep.resolved, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
    assert.match(dep.integrity, /^sha512-/);
  });
  check('checkout success does not falsely claim a trial already paid', () => {
    const app=fs.readFileSync(path.join(root,'dist/app.html'),'utf8');
    assert.ok(app.includes('Checkout completed. Your billing status is being confirmed'));
    assert.ok(!app.includes("note.textContent = 'Payment received."));
  });
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext();
    await context.route(/^https?:\/\//, route => route.abort());
    await context.route('https://testing.auditera.net/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (!['app.html','resman-setup.js','tools/leaseverify.html','tools/concessionverify.html','tools/depositverify.html'].includes(name)) return route.abort();
      return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(root,'dist',name))});
    });
    for (const tool of ['lease','concession','deposit']) {
      const page = await context.newPage();
      await installGateStub(page);
      await page.goto('https://testing.auditera.net/tools/' + tool + 'verify.html' + GATE_HASH);
      const result = await page.evaluate(async tool => {
        const xlsxVersion = XLSX.version;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Unit','Amount'],['=1+1',-12.5]]), 'Synthetic');
        const roundtrip = XLSX.read(XLSX.write(wb,{type:'array',bookType:'xlsx'}),{type:'array'}).Sheets.Synthetic;
        let blob;
        URL.createObjectURL = value => {blob=value; return 'blob:synthetic';};
        HTMLAnchorElement.prototype.click = function() {};
        buildExportRows = () => [{Unit:'SYN-1',Resident:'=1+1',Status:'review',Problem:'\r=1+1',Amount:-12.5}];
        document.getElementById('export-csv-btn').click();
        const csv = await blob.text();
        const pdfCalls = [];
        window.pdfjsLib = {getDocument(options) {
          pdfCalls.push({isEvalSupported:options.isEvalSupported,bytes:options.data.byteLength});
          return {promise:Promise.reject(new Error('synthetic boundary stop'))};
        }};
        const invoke = async fn => {try {await fn();} catch(e) {if(e.message!=='synthetic boundary stop') throw e;}};
        const bytes = new Uint8Array([37,80,68,70]);
        if (tool === 'deposit') await invoke(() => parseLeaseLockInvoicePdf(new File([bytes],'synthetic.pdf')));
        else await invoke(() => parseLeasePdfFromBuffer(bytes));
        if (tool === 'concession') await invoke(() => ledgerPdfLines(bytes));
        return {xlsxVersion,csv,pdfCalls,cell:{type:roundtrip.A2.t,value:roundtrip.A2.v,formula:roundtrip.A2.f},amount:roundtrip.B2.v};
      }, tool);
      check(tool + ' generated SheetJS reads/writes typed cells', () => {
        assert.equal(result.xlsxVersion,'0.20.3');
        assert.deepEqual(result.cell,{type:'s',value:'=1+1',formula:undefined});
        assert.equal(result.amount,-12.5);
      });
      check(tool + ' actual CSV button uses shared guard', () => {
        assert.ok(result.csv.includes('"\'=1+1"'));
        assert.ok(result.csv.includes('"\'\r=1+1"'));
        assert.ok(!result.csv.includes('"=1+1"'));
      });
      check(tool + ' every PDF intake disables eval', () => {
        assert.equal(result.pdfCalls.length, tool==='concession'?2:1);
        for(const call of result.pdfCalls) assert.deepEqual(call,{isEvalSupported:false,bytes:4});
        const source=fs.readFileSync(path.join(root,tool+'_tool/template.html'),'utf8');
        assert.equal((source.match(/getDocument\(/g)||[]).length,result.pdfCalls.length);
      });
      await page.close();
    }
    const page = await context.newPage();
    await page.route('**/supabase-js@2/**', route => route.fulfill({contentType:'text/javascript',body:
      'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({})}})};'}));
    await page.goto('https://testing.auditera.net/app.html');
    const result = await page.evaluate(async () => {
      isSignedIn=true;
      const hidden = id => document.getElementById(id).classList.contains('hidden');
      const active = {data:[{name:'Synthetic property',address:'123 Example',status:'active'}]};
      sb.from = () => ({select:async()=>active});
      await refreshAccountState();
      const initial = !hidden('signedin-panel');
      for(const failure of ['returned','thrown','malformed']) {
        sb.from = () => ({select:async()=>{
          if(failure==='thrown') throw new Error('synthetic');
          return failure==='returned'?{error:{message:'synthetic'}}:{data:null};
        }});
        await refreshAccountState();
        if (!hidden('onboarding-card') || !hidden('signedin-panel') || hidden('account-load-retry') || licensedProperties.length) throw new Error('Failed lookup exposed incorrect state');
      }
      sb.from = () => ({select:async()=>active});
      document.getElementById('account-load-retry').click();
      await new Promise(resolve=>setTimeout(resolve,0));
      const retried = !hidden('signedin-panel') && hidden('account-load-state');
      sb.from = () => ({select:async()=>({data:[]})});
      await refreshAccountState();
      const empty = !hidden('onboarding-card') && hidden('account-load-state');
      let release;
      sb.from = () => ({select:()=>new Promise(resolve=>release=resolve)});
      const old = refreshAccountState();
      sb.from = () => ({select:async()=>active});
      await refreshAccountState();
      release({data:[]}); await old;
      const stale = hidden('onboarding-card') && !hidden('signedin-panel');
      sb.from = () => ({select:()=>new Promise(resolve=>release=resolve)});
      const signingOut = refreshAccountState();
      showSignedOut(); release(active); await signingOut;
      const signedOut = hidden('account-load-state') && hidden('signedin-panel') && !isSignedIn;
      return {initial,retried,empty,stale,signedOut};
    });
    for(const [name, ok] of Object.entries(result)) check('property lookup ' + name, () => assert.equal(ok,true));
  } finally {await browser.close();}
  console.log(checks+'/'+checks+' passed');
}
main().catch(error => {console.error(error);process.exitCode=1;});
