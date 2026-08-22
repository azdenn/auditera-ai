// "I only want it to pick up the ledger that matches the name of the person
// in whatever unit they're in on the rent roll ... the code should only ever
// pick up one ledger to match it against the rent roll."
//
// Selection is now decided SOLELY by whether the ledger's resident is the
// person the rent roll shows in that unit. Lease dates and move-out status
// are no longer tiebreakers: the rent roll says who lives there, so a ledger
// for anyone else is the wrong document however recent it looks. If nothing
// matches, the unit reports "no matching ledger" instead of being audited
// against a stranger's transactions.
//
// The real BOA archive makes this non-trivial: 58 ledgers for 30 units,
// several units carry former residents' ledgers too, and two units disagree
// on the given name between the two documents (rent roll "Christina Kersten"
// vs ledger "Tina Kersten"; "Joseph Owen" vs "Joe Owen").
const { chromium } = require('playwright');
const path = require('path');
const ZIP = path.resolve('./real/BOA Resident Ledgers 08-14-2026.zip');
const RR  = path.resolve('./real/BOA 2026.14- Rent Roll.xlsx');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./concession_reconciler.html'));

  const unit = await page.evaluate(() => ({
    nickTina:   residentNamesMatch('Christina Kersten', 'Tina Kersten'),
    nickJoe:    residentNamesMatch('Joseph Owen', 'Joe Owen'),
    exact:      residentNamesMatch('John Lane', 'John Lane'),
    couple:     residentNamesMatch('Ashley Hominick, John Hominick', 'John Hominick'),
    coupleRev:  residentNamesMatch('John Hominick', 'Ashley Hominick, John Hominick'),
    andWord:    residentNamesMatch('Sheryl Plantenga and Stephen Plantenga', 'Stephen Plantenga'),
    initial:    residentNamesMatch('J Lane', 'John Lane'),
    // Negative controls -- these decide the whole audit, so a wrong match is
    // worse than no match.
    diffSurname:      residentNamesMatch('John Lane', 'John Smith'),
    sameSurnameOther: residentNamesMatch('John Lane', 'Mary Lane'),
    unrelatedCouple:  residentNamesMatch('Ashley Hominick, John Hominick', 'Mary Smith'),
    blank:            residentNamesMatch('', 'John Lane'),
  }));
  console.log('name matching:', JSON.stringify(unit));

  // Synthetic: a unit whose only ledgers belong to other people must NOT be
  // silently audited against one of them.
  const noMatch = await page.evaluate(() => {
    const mk = (name, n) => ({filename: name + '.pdf', data: {residents: name, transactions: new Array(n).fill(0).map(()=>({description:'Rent',charge:1,credit:0,date:null,notes:''}))}});
    const block = {unit:'999', residents:'Real Resident'};
    const r = pickCurrentLedger([mk('Former Tenant',5), mk('Older Tenant',9)], block);
    const ok = pickCurrentLedger([mk('Former Tenant',5), mk('Real Resident',3)], block);
    const dup = pickCurrentLedger([mk('Real Resident',3), mk('Real Resident',40)], block);
    return {
      noneMatched: {picked: !!r.data, unmatched: r.unmatched, reason: r.reason},
      oneMatched: {who: ok.data ? ok.data.residents : null, unmatched: ok.unmatched},
      sameResidentTwice: {picked: dup.data ? dup.data.transactions.length : null, unmatched: dup.unmatched},
    };
  });
  console.log('selection:', JSON.stringify(noMatch, null, 1));

  // Real archive end to end.
  await page.evaluate(() => { localStorage.clear(); setUploadMode('zip'); });
  await page.setInputFiles('#ledger-zip-file', ZIP);
  await page.setInputFiles('#rentroll-file', RR);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout:180000});
  await page.waitForTimeout(600);
  const real = await page.evaluate(() => {
    const act = unitEntries.filter(e => e.category !== 'vacant');
    return {
      checked: act.length,
      mismatched: act.filter(e => e.ledger && !residentNamesMatch(e.block && e.block.residents, e.ledger.residents)).length,
      u305: (() => { const e = act.find(x=>x.unit==='305'); return e && e.ledger ? e.ledger.residents : null; })(),
      u306: (() => { const e = act.find(x=>x.unit==='306'); return e && e.ledger ? e.ledger.residents : null; })(),
      u208: (() => { const e = act.find(x=>x.unit==='208'); return e && e.ledger ? e.ledger.residents : null; })(),
      everyUnitOneLedger: act.every(e => !e.ledger || typeof e.ledger.residents !== 'undefined'),
    };
  });
  console.log('real archive:', JSON.stringify(real));

  const checks = [
    ['Nickname on the rent roll vs ledger matches (Christina / Tina)', unit.nickTina === true],
    ['Nickname matches (Joseph / Joe)', unit.nickJoe === true],
    ['Identical names match', unit.exact === true],
    ['A couple on the rent roll matches one partner\'s ledger', unit.couple === true && unit.coupleRev === true],
    ['"X and Y" is split the same way as "X, Y"', unit.andWord === true],
    ['An initial matches the full given name', unit.initial === true],
    ['Different surname does NOT match', unit.diffSurname === false],
    ['Same surname, different person does NOT match', unit.sameSurnameOther === false],
    ['An unrelated name does not match a couple', unit.unrelatedCouple === false],
    ['A blank name never matches', unit.blank === false],
    ['When no ledger matches, NONE is picked', noMatch.noneMatched.picked === false && noMatch.noneMatched.unmatched === true],
    ['...and it says why, naming the rent roll resident', /Real Resident/.test(noMatch.noneMatched.reason || '')],
    ['When one matches, that one is used even though another is longer', noMatch.oneMatched.who === 'Real Resident'],
    ['Two ledgers for the SAME resident resolve to the fuller one', noMatch.sameResidentTwice.picked === 40],
    ['Real archive: all 25 occupied units checked', real.checked === 25],
    ['Real archive: ZERO units use a ledger whose name differs from the rent roll', real.mismatched === 0],
    ['Real archive: unit 305 uses Tina Kersten\'s ledger (rent roll says Christina)', /Kersten/.test(real.u305 || '')],
    ['Real archive: unit 306 uses Joe Owen\'s ledger (rent roll says Joseph)', /Owen/.test(real.u306 || '')],
    ['Real archive: unit 208 (four ledgers) resolves to Emily Nations', /Emily Nations/.test(real.u208 || '')],
    ['No page errors', errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
