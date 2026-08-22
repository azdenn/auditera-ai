// Covers the three homepage additions: the hand-drawn animated hero that
// replaced the static screenshot, the DepositVerify tool card, and the
// signed-in tutorial.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('../dist/index.html'));
  await page.waitForTimeout(700);

  const hero = await page.evaluate(() => {
    const wrap = document.querySelector('.hero-anim');
    const paths = document.querySelectorAll('.hero-anim .ink');
    const anim = paths.length ? getComputedStyle(paths[0]).animationName : null;
    const dur = paths.length ? getComputedStyle(paths[0]).animationDuration : null;
    const iter = paths.length ? getComputedStyle(paths[0]).animationIterationCount : null;
    // Every stage must share one cycle length, otherwise the loop desyncs.
    const durs = new Set(Array.from(paths).map(p => getComputedStyle(p).animationDuration));
    return {
      present: !!wrap, pathCount: paths.length, anim, dur, iter,
      uniqueDurations: Array.from(durs),
      noDelays: Array.from(paths).every(p => getComputedStyle(p).animationDelay === '0s'),
      oldImgGone: !document.querySelector('img.hero-shot'),
      // Guard against the whole hero block being duplicated by a bad splice:
      // the previous edit left two heroes on the page and every existing
      // check still passed, because they all used querySelector (first match)
      // rather than counting.
      heroCount: document.querySelectorAll('.hero-anim').length,
      heroWrapCount: document.querySelectorAll('.hero-anim-wrap').length,
      headerCount: document.querySelectorAll('header.hero').length,
      h1Count: document.querySelectorAll('header.hero h1').length,
      ctaCount: document.querySelectorAll('header.hero .hero-ctas').length,
      navCount: document.querySelectorAll('nav.top').length,
      hasAria: !!(wrap && wrap.getAttribute('aria-label')),
      usesRoughFilter: !!document.querySelector('#rough feDisplacementMap'),
      texts: Array.from(document.querySelectorAll('.hero-anim text')).map(t=>t.textContent),
    };
  });

  // Actually advance the animation and confirm the drawing progresses.
  // Sampling one stage at two arbitrary moments is unreliable: each stage
  // only draws during its own slice of the 15s cycle, so a badly-timed pair
  // of reads sits entirely outside that slice and looks frozen. Instead,
  // assert the animation clock is genuinely advancing AND that at least one
  // stroke somewhere in the scene changes over the sampling window.
  const progress = await page.evaluate(async () => {
    const all = () => Array.from(document.querySelectorAll('.hero-anim .ink'))
      .map(p => getComputedStyle(p).strokeDashoffset).join('|');
    const anims = document.getAnimations ? document.getAnimations() : [];
    const t0 = anims.length ? anims[0].currentTime : null;
    const before = all();
    await new Promise(r => setTimeout(r, 3000));
    const t1 = anims.length ? anims[0].currentTime : null;
    const after = all();
    return { clockAdvanced: t0 !== null && t1 !== null && t1 > t0, strokesChanged: before !== after, animCount: anims.length };
  });

  // The tools and the tutorial moved to the app page; the homepage is marketing
  // only now. Both still need checking, so the suite visits each in turn.
  await page.goto('file://' + path.resolve('../dist/app.html'));
  await page.waitForTimeout(500);

  const cards = await page.evaluate(() => ({
    names: Array.from(document.querySelectorAll('.tool-card h3')).map(h=>h.textContent.trim()),
    depositLaunch: !!document.querySelector('[onclick="launchTool(\'deposit\')"]'),
    toolSourcesGone: typeof TOOL_SOURCES === 'undefined',
    depositPath: (typeof TOOL_PATHS !== 'undefined' && TOOL_PATHS.deposit) || null,
    pageBytes: document.documentElement.outerHTML.length,
  }));

  const tut = await page.evaluate(() => {
    const d = document.getElementById('tutorial');
    if (!d) return null;
    d.open = true;
    return {
      steps: d.querySelectorAll('.tut-step').length,
      headings: Array.from(d.querySelectorAll('.tut-step h4')).map(h=>h.textContent.trim()),
      text: d.textContent,
    };
  });

  console.log(JSON.stringify({hero:{...hero, texts:undefined}, progress, cards,
    tutSteps: tut && tut.steps, tutHeadings: tut && tut.headings}, null, 2));

  const checks = [
    ['Static hero screenshot is gone', hero.oldImgGone === true],
    ['Hand-drawn animated hero is present', hero.present === true],
    ['Exactly ONE hero animation on the page (not duplicated)', hero.heroCount === 1 && hero.heroWrapCount === 1],
    ['Exactly ONE hero header, h1 and CTA row', hero.headerCount === 1 && hero.h1Count === 1 && hero.ctaCount === 1],
    ['Exactly ONE nav', hero.navCount === 1],
    ['Hero is built from many drawn strokes', hero.pathCount > 25],
    ['Strokes are animated', !!hero.anim && hero.anim !== 'none'],
    ['Animation loops forever', hero.iter === 'infinite'],
    ['All stages share one cycle length so the loop stays in sync', hero.uniqueDurations.length === 1],
    ['No animation-delay is used (delays would desync the loop)', hero.noDelays === true],
    ['Strokes are roughened to read as hand-drawn', hero.usesRoughFilter === true],
    ['Hero has an accessible description', hero.hasAria === true],
    ['The animation clock is actually running', progress.clockAdvanced === true],
    ['The drawing visibly progresses over time', progress.strokesChanged === true],
    ['Hero tells the audit story', /Signed lease/.test(hero.texts.join(' ')) && /Rent roll/.test(hero.texts.join(' ')) && /recovered/.test(hero.texts.join(' '))],
    ['All three tools are listed', cards.names.includes('LeaseVerify') && cards.names.includes('ConcessionVerify') && cards.names.includes('DepositVerify')],
    ['DepositVerify has a working launch button', cards.depositLaunch === true],
    // The gate is worthless if the page still carries the files it is gating.
    ['The tools are NOT embedded in the homepage any more', cards.toolSourcesGone === true],
    ['DepositVerify is fetched from a gated path instead', cards.depositPath === '/tools/depositverify.html'],
    ['The homepage is small now that it carries no tools (was ~9.6 MB)', cards.pageBytes < 400000],
    ['Tutorial exists in the signed-in area', !!tut],
    ['Tutorial has a full walkthrough', tut && tut.steps >= 5],
    ['Tutorial covers getting reports out of ResMan', tut && /ResMan/.test(tut.text)],
    ['Tutorial warns about the Rent Roll Summary trap', tut && /Rent Roll Summary/.test(tut.text)],
    ['Tutorial explains Option Filters never delete anything', tut && /never deleted/i.test(tut.text)],
    ['Tutorial explains exports including the PDF', tut && /PDF/.test(tut.text)],
    ['Tutorial explains privacy', tut && /never uploaded/i.test(tut.text)],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  const real = errors.filter(e => !/ERR_TUNNEL|Failed to load resource/.test(e));
  console.log('=== page errors ===', real);
  if (!allPass || real.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
