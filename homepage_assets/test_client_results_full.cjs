// Verifies the "fully populated" case-study layout (metrics, tools, issues,
// testimonial, reference CTA, featured badge) renders correctly when a
// client has all fields + permissions set -- exercises code paths Rajeev's
// current minimal entry doesn't reach -- plus a mobile-viewport pass.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ---- Desktop: synthetic fully-populated client ----
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./client_results.html'));

  const full = await page.evaluate(() => {
    const synthetic = {
      id: 'synthetic-full', visible: true, featured: true,
      name: 'Jordan Rivera', title: 'Regional Property Manager',
      company: 'Willow Creek Apartments', location: 'Austin, TX', units: 214,
      toolsUsed: ['reconciler', 'concession'],
      savings: { amount: 18420, type: 'potentialDiscrepancies' },
      timeSavedHours: 26,
      issuesFound: ['depositDiscrepancy', 'missingSignatures', 'leaseDateMismatch'],
      testimonial: { quote: 'LeaseProof caught things our manual review missed for months.', attribution: 'Jordan Rivera, Regional Property Manager' },
      referenceAvailable: true,
      permissions: { name: true, company: true, location: true, units: true, tools: true, savings: true, timeSaved: true, issuesFound: true, testimonial: true, reference: true },
    };
    const card = buildCaseCard(synthetic);
    document.getElementById('case-studies-stack').prepend(card);
    return {
      hasFeaturedBadge: !!card.querySelector('.featured-badge'),
      metaText: card.querySelector('.case-meta')?.textContent,
      metricCount: card.querySelectorAll('.metric-tile').length,
      moneyTileText: card.querySelector('.metric-tile.money .m-num')?.textContent,
      moneyLabelText: card.querySelector('.metric-tile.money .m-label')?.textContent,
      toolsCount: card.querySelectorAll('.tools-used-list li').length,
      issuesCount: card.querySelectorAll('.issues-list li').length,
      hasTestimonial: !!card.querySelector('.testimonial-block'),
      testimonialText: card.querySelector('.testimonial-block p')?.textContent,
      hasReferenceBox: !!card.querySelector('.reference-box'),
      referenceBoxText: card.querySelector('.reference-box p')?.textContent,
    };
  });

  // Open the reference modal for this synthetic featured/reference-available client via the actual button
  await page.click('.case-card.featured .reference-box .btn-primary');
  const modalSub = await page.evaluate(() => document.getElementById('reference-modal-sub').textContent);
  await page.keyboard.press('Escape');
  const modalClosedAfterEscape = await page.evaluate(() => document.getElementById('reference-modal-overlay').classList.contains('hidden'));

  // Required-field validation: submitting with empty required fields shouldn't crash or silently "succeed"
  await page.click('.case-card.featured .reference-box .btn-primary');
  const emptySubmitResult = await page.evaluate(async () => {
    document.getElementById('ref-name').value = '';
    document.getElementById('ref-company').value = '';
    document.getElementById('ref-email').value = '';
    document.getElementById('reference-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return {
      stillOnFormState: !document.getElementById('reference-modal-form-state').classList.contains('hidden'),
      successShown: !document.getElementById('reference-modal-success-state').classList.contains('hidden'),
    };
  });
  await page.keyboard.press('Escape');

  // ---- Mobile viewport pass ----
  const mobile = await browser.newPage();
  mobile.setViewportSize && await mobile.setViewportSize({ width: 390, height: 844 });
  const mobileErrors = [];
  mobile.on('pageerror', e => mobileErrors.push(e.message));
  await mobile.goto('file://' + path.resolve('./client_results.html'));
  await mobile.waitForTimeout(150);
  const mobileState = await mobile.evaluate(() => {
    const navLinks = document.getElementById('nav-links');
    const toggle = document.getElementById('nav-toggle');
    const card = document.querySelector('.case-card');
    return {
      navHiddenByDefault: getComputedStyle(navLinks).display === 'none',
      toggleVisible: getComputedStyle(toggle).display !== 'none',
      cardWidth: card ? card.getBoundingClientRect().width : null,
      viewportWidth: window.innerWidth,
      heroH1Size: getComputedStyle(document.querySelector('header.hero h1')).fontSize,
    };
  });
  // Confirm the mobile nav toggle actually opens the menu
  await mobile.click('#nav-toggle');
  const mobileNavOpenState = await mobile.evaluate(() => document.getElementById('nav-links').classList.contains('open'));

  console.log(JSON.stringify({ full, modalSub, modalClosedAfterEscape, emptySubmitResult, mobileState, mobileNavOpenState }, null, 2));

  const checks = [
    ['Featured badge shown for featured client', full.hasFeaturedBadge === true],
    ['Meta line combines company/location/units', /Willow Creek Apartments/.test(full.metaText) && /Austin, TX/.test(full.metaText) && /214 units/.test(full.metaText)],
    ['All 3 metric tiles render (savings, units, hours)', full.metricCount === 3],
    ['Money tile shows correctly formatted dollar amount', full.moneyTileText === '$18,420'],
    ['Money tile label correctly distinguishes "potential discrepancies identified" from "money saved"', full.moneyLabelText === 'Potential discrepancies identified'],
    ['Both tools rendered', full.toolsCount === 2],
    ['All 3 issues rendered', full.issuesCount === 3],
    ['Testimonial block rendered with correct quote', full.hasTestimonial && /caught things our manual review missed/.test(full.testimonialText)],
    ['Reference box rendered (referenceAvailable + permission both true)', full.hasReferenceBox === true],
    ['Reference box uses first name, not full claim about entire company', /^Jordan has agreed/.test(full.referenceBoxText.replace(/<[^>]+>/g,'').replace('Want to hear directly from this client?',''))],
    ['Modal subhead personalizes to the clicked client\'s first name', /Jordan/.test(modalSub)],
    ['Escape key closes the modal', modalClosedAfterEscape === true],
    ['Empty required fields: form does not silently "succeed"', emptySubmitResult.successShown === false],
    ['Empty required fields: stays on the form (native required validation blocks it)', emptySubmitResult.stillOnFormState === true],
    ['Mobile: nav links collapsed behind toggle by default', mobileState.navHiddenByDefault === true],
    ['Mobile: hamburger toggle button visible', mobileState.toggleVisible === true],
    ['Mobile: case card fits within the viewport width (no horizontal overflow)', mobileState.cardWidth !== null && mobileState.cardWidth <= mobileState.viewportWidth],
    ['Mobile: hero H1 uses the smaller mobile font size', mobileState.heroH1Size === '30px'],
    ['Mobile: tapping the toggle opens the nav menu', mobileNavOpenState === true],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== page errors ===', errors, mobileErrors);
  if (!allPass || errors.length || mobileErrors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
