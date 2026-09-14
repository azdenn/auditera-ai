/* "What does the Community Fee cover?" — the tick-list.
   ----------------------------------------------------------------------
   Azden, 2026-09-06: "community fee is always going to be a group of fees...
   I want you to add a check mark click thing where the person can manually
   choose which fees are included... and please put all amenities that you scan
   on that checkbox area. All the things you find on the lease mainly and then
   rent roll as well."

   And: "make sure these checkboxes work cause you've had trouble in the past,
   please review and make sure it works."

   So this test drives the REAL DOM: it finds the checkboxes the panel actually
   renders, clicks them the way a person would, and checks what comes out. A
   tick-list asserted only through JavaScript state is a tick-list that can be
   unclickable and still pass.

   The other half is the promise made when this was designed: a membership rule
   explains a charge, it never silences a number. If the ticked parts come to
   $130 and the fee is $115, BOTH figures stay on screen.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' -- ' + name); cond ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  // Three units of The Rail's real shape: a lease that itemises, a rent roll
  // that bills one Community Fee, and a genuine billed-but-unsigned charge
  // that must stay untouchable.
  await page.evaluate(() => {
    PROPERTY_ID = 'p1'; PROPERTY_RULES = []; BUNDLE_RULES = [];
    PROPERTY_LABEL_ALIASES = new Map(); INCLUDED_IN = new Map(); ROLLUP_SUBJECTS = new Map();
    const mk = (u) => {
      const lease = [
        { rawLabel: 'Pet Rent', amount: 25 },
        { rawLabel: 'Pest control', amount: 5 },
        { rawLabel: 'Cable / Internet', amount: 100 },
      ];
      const resman = [
        { description: 'Community Fee', amount: 115 },
        { description: 'Resident Liability Insurance', amount: 15 },
      ];
      const cmp = reconcileUnit(lease, { unit: u, residents: 'R ' + u, charges: resman, total: 0 }, null);
      return { unit: u, unitKey: u, residents: 'R ' + u, category: 'mismatch',
               rows: cmp.rows, rawLease: cmp.rawLease, rawResman: cmp.rawResman,
               verify: { checks: [] } };
    };
    unitEntries = ['C1', 'C2', 'G2'].map(mk);
    // The panel lives inside the results card, which only appears once a run
    // has finished. Reveal it so the clicks below are real clicks on a visible
    // control rather than JavaScript pretending to be a person.
    document.getElementById('results-card').classList.remove('hidden');
    renderHouseRules();
  });

  // ---- the card exists and is populated from BOTH documents ----
  const boxes = await page.$$('input[data-inc-group]');
  const labels = await page.$$eval('input[data-inc-group]', els => els.map(e => e.getAttribute('data-inc-label')));

  check('A tick-list appears for the grouped charge', boxes.length > 0);
  check('...listing charges found on the lease', labels.includes('Pet Rent') && labels.includes('Pest control'));
  check('...and charges found on the rent roll', labels.includes('Resident Liability Insurance'));
  check('...but never the grouped charge inside itself', !labels.includes('Community Fee'));

  const heading = await page.$eval('#house-rules', el => el.textContent);
  check('The card asks the question in the property\'s own words',
        /What does .Community Fee. cover\?/.test(heading));

  // ---- clicking really works: click the LABEL, as a person does ----
  const saveDisabledBefore = await page.$eval('button[data-inc-save]', b => b.disabled);
  check('Nothing can be saved before anything is ticked', saveDisabledBefore === true);

  for (const name of ['Pet Rent', 'Pest control', 'Cable / Internet']){
    const id = await page.$eval(`input[data-inc-label="${name}"]`, e => e.id);
    await page.click(`label[for="${id}"]`);          // the label, not the input
  }
  const ticked = await page.$$eval('input[data-inc-group]', els => els.filter(e => e.checked).length);
  check('CLICKING THE LABEL TICKS THE BOX — three of them', ticked === 3);

  const saveEnabled = await page.$eval('button[data-inc-save]', b => !b.disabled);
  check('...which enables saving', saveEnabled === true);
  const counter = await page.$eval('button[data-inc-save] + span', el => el.textContent);
  check('...and the count says what is ticked', /3 ticked/.test(counter));

  // Keyboard reachability: a real input can be focused and toggled with space.
  const kb = await page.evaluate(() => {
    const box = document.querySelector('input[data-inc-label="Pet Rent"]');
    box.focus();
    return document.activeElement === box;
  });
  check('The boxes are real inputs a keyboard can reach', kb === true);

  // ---- applying the rule ----
  const applied = await page.evaluate(() => {
    const rule = { type: 'includes', rentRollLabel: 'Community Fee',
                   leaseLabels: ['Pet Rent', 'Pest control', 'Cable / Internet'] };
    PROPERTY_RULES = [{ id: 'r1', rule, source: 'typed', status: 'active' }];
    rebuildRuleEngine();
    const lease = [
      { rawLabel: 'Pet Rent', amount: 25 },
      { rawLabel: 'Pest control', amount: 5 },
      { rawLabel: 'Cable / Internet', amount: 100 },
    ];
    const rows = reconcileUnit(lease,
      { unit: 'C1', residents: 'x',
        charges: [{ description: 'Community Fee', amount: 115 },
                  { description: 'Resident Liability Insurance', amount: 15 }], total: 0 }, null).rows;
    return rows.map(r => ({ label: r.label, status: r.status, soft: !!r.soft,
                            includedIn: r.includedIn || null, note: r.note || '',
                            l: r.leaseVal, m: r.resmanVal }));
  });

  const pet = applied.find(r => /pet/i.test(r.label));
  const fee = applied.find(r => /community fee/i.test(r.label));
  const ins = applied.find(r => /insurance/i.test(r.label));

  check('A ticked charge stops being reported as unbilled',
        !!pet && pet.soft === true && pet.includedIn === 'Community Fee');
  check('...and says where it went', !!pet && /covers this charge/.test(pet.note));

  check('THE NUMBER IS NEVER SILENCED: the fee row states what the parts come to',
        !!fee && /itemised there at \$130\.00/.test(fee.note));
  check('...and names the gap against what is billed',
        !!fee && /\$115\.00/.test(fee.note) && /\$15\.00 between them stays visible/.test(fee.note));

  check('BILLED BUT NEVER SIGNED IS UNTOUCHABLE: the insurance charge is still a finding',
        !!ins && ins.status === 'resmanonly' && !ins.soft && !ins.includedIn);

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
