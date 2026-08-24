// Regression for: "Make an option where you can click the item tab and you
// can sort between them, like by lease end dates or starts, or the security
// deposit, etc"
//
// Lease Start, Lease End and Deposit are now real columns (read off the Rent
// Roll, the system of record) and every column header sorts. Third click on
// a column returns to the default priority order so a user can always get
// back. Rows with no value sink to the bottom in BOTH directions, so an
// ascending sort never opens with a wall of blanks.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);
  await page.setInputFiles('#lease-files', [
    path.resolve('./boa_test/303_old_expired_lease.pdf'),
    path.resolve('./boa_test/406_expired_lease.pdf'),
  ]);
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:90000});
  await page.waitForTimeout(300);

  const colIdx = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#unit-view-shell thead th'));
    const m = {};
    ths.forEach((t,i) => { const k=t.getAttribute('data-sort'); if(k) m[k]=i; });
    return { map:m, headers: ths.map(t=>t.textContent.trim()) };
  });
  const colText = key => page.evaluate(i => Array.from(document.querySelectorAll('#results-body tr.unit-row'))
      .map(r => r.children[i] ? r.children[i].textContent.trim() : null), colIdx.map[key]);

  const defaultUnits = await colText('unit');
  const clickHdr = k => page.click(`#unit-view-shell th[data-sort="${k}"]`);

  await clickHdr('unit');  const unitAsc = await colText('unit');
  await clickHdr('unit');  const unitDesc = await colText('unit');
  await clickHdr('unit');  const backToDefault = await colText('unit');

  await clickHdr('leaseEnd'); const endAsc = await colText('leaseEnd');
  await clickHdr('leaseEnd'); const endDesc = await colText('leaseEnd');
  await clickHdr('leaseEnd');

  await clickHdr('deposit'); const depAsc = await colText('deposit');
  const depState = await page.evaluate(() => ({
    key: sortKey, dir: sortDir,
    ariaSorted: document.querySelector('#unit-view-shell th[data-sort="deposit"]').getAttribute('aria-sort'),
    hasClass: document.querySelector('#unit-view-shell th[data-sort="deposit"]').classList.contains('sorted-asc'),
  }));
  await clickHdr('deposit'); await clickHdr('deposit');

  await clickHdr('leaseStart'); const startAsc = await colText('leaseStart');

  // Expanding a unit must span EVERY column. Adding the three new columns
  // without updating the detail row's colspan left roughly a third of the
  // results area blank -- the "it doesn't extend fully" report.
  await page.evaluate(() => { const r = document.querySelector('#results-body tr.unit-row'); if (r) r.click(); });
  await page.waitForTimeout(300);
  const spanInfo = await page.evaluate(() => ({
    headerCols: document.querySelectorAll('#unit-view-shell > table.results > thead > tr > th').length,
    detailSpan: (document.querySelector('.detail-row td') || {}).colSpan || 0,
    // The detail panel should occupy essentially the full table width.
    ratio: (() => {
      const t = document.querySelector('#unit-view-shell > table.results');
      const d = document.querySelector('.detail-row td');
      return (t && d) ? d.getBoundingClientRect().width / t.getBoundingClientRect().width : 0;
    })(),
  }));
  console.log('detail span:', JSON.stringify(spanInfo));

  const parseD = s => s === '—' ? null : new Date(s).getTime();
  const nonEmptyMonotonic = (arr, dir) => {
    const v = arr.map(parseD).filter(x => x !== null);
    for (let i=1;i<v.length;i++) if (dir>0 ? v[i] < v[i-1] : v[i] > v[i-1]) return false;
    return true;
  };
  const blanksLast = arr => { let seen=false; for (const x of arr){ if (x==='—') seen=true; else if (seen) return false; } return true; };
  const money = s => s === '—' ? null : parseFloat(s.replace(/[$,]/g,''));

  console.log('headers:', JSON.stringify(colIdx.headers));
  console.log('default units:', JSON.stringify(defaultUnits));
  console.log('unit asc:', JSON.stringify(unitAsc), 'desc:', JSON.stringify(unitDesc));
  console.log('leaseEnd asc:', JSON.stringify(endAsc), 'desc:', JSON.stringify(endDesc));
  console.log('deposit asc:', JSON.stringify(depAsc), 'startAsc:', JSON.stringify(startAsc));

  const depVals = depAsc.map(money).filter(x=>x!==null);
  const checks = [
    ['Lease Start is a real column', colIdx.headers.includes('Lease Start')],
    ['Lease End is a real column', colIdx.headers.includes('Lease End')],
    ['Deposit is a real column', colIdx.headers.includes('Deposit')],
    ['Unit sorts ascending on first click', JSON.stringify(unitAsc) === JSON.stringify([...unitAsc].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})))],
    ['Second click reverses the sort', JSON.stringify(unitDesc) === JSON.stringify([...unitAsc].reverse())],
    ['Third click returns to the default order', JSON.stringify(backToDefault) === JSON.stringify(defaultUnits)],
    ['Lease End sorts ascending', nonEmptyMonotonic(endAsc, 1)],
    ['Lease End reverses', nonEmptyMonotonic(endDesc, -1)],
    ['Lease Start sorts ascending', nonEmptyMonotonic(startAsc, 1)],
    ['Deposit sorts numerically, not as text', depVals.every((v,i,a)=> i===0 || a[i-1] <= v)],
    ['Blank values sink to the bottom rather than leading an ascending sort', blanksLast(endAsc) && blanksLast(depAsc)],
    ['Active sort column is visually marked', depState.hasClass === true],
    ['Active sort column exposes aria-sort for screen readers', depState.ariaSorted === 'ascending'],
    ['Sort state tracked correctly', depState.key === 'deposit' && depState.dir === 1],
    ['Expanded detail spans every column (no dead space to the right)', spanInfo.detailSpan === spanInfo.headerCols && spanInfo.headerCols === 8],
    ['Expanded detail actually fills the table width', spanInfo.ratio > 0.97],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
