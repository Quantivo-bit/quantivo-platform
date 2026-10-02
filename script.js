(() => {
  'use strict';
  const Q = window.Quantivo;
  const menu = document.querySelector('.menu-toggle'), nav = document.querySelector('.site-nav');
  menu?.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }));
  const dropdowns = [...document.querySelectorAll('.nav-dropdown')];
  function closeDropdowns(except) { dropdowns.forEach(dropdown => { const open = dropdown === except; dropdown.classList.toggle('open', open); dropdown.querySelector('.nav-trigger')?.setAttribute('aria-expanded', String(open)); }); }
  dropdowns.forEach(dropdown => dropdown.querySelector('.nav-trigger')?.addEventListener('click', e => { e.preventDefault(); closeDropdowns(dropdown.classList.contains('open') ? null : dropdown); }));
  document.addEventListener('click', e => { if (!e.target.closest('.nav-dropdown')) closeDropdowns(null); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { nav?.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); closeDropdowns(null); } });

  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  let market = 'BTC', range = 30;
  function renderHero() {
    const m = Q.getMarket(market), rows = Q.candles(market).slice(-range);
    document.getElementById('hero-symbol').textContent = m.name;
    document.getElementById('hero-pair').textContent = `${m.symbol} / USDT`;
    document.getElementById('hero-price').textContent = Q.price(m.price);
    const token = document.getElementById('hero-token'); token.className = `token ${m.symbol.toLowerCase()}`; token.textContent = m.icon;
    document.getElementById('hero-chart').innerHTML = Q.chart(rows.map(r => r.close), { label: `${m.symbol}: ${range} synthetic hourly candles, not live data` });
    document.querySelectorAll('[data-market]').forEach(b => { b.classList.toggle('active', b.dataset.market === market); b.setAttribute('aria-pressed', String(b.dataset.market === market)); });
    document.querySelectorAll('[data-range]').forEach(b => { b.classList.toggle('active', +b.dataset.range === range); b.setAttribute('aria-pressed', String(+b.dataset.range === range)); });
  }
  document.querySelectorAll('[data-market]').forEach(b => b.addEventListener('click', () => { market = b.dataset.market; renderHero(); }));
  document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => { range = Number(b.dataset.range); renderHero(); }));
  renderHero();
  const features = {
    research: { status: 'SCRIPTED DEMO', title: 'A better question.<br>A clearer perspective.', description: 'Start with a market, a question or a strategy idea. Explore a structured research brief that makes the assumptions visible.', list: ['Market context in plain language', 'Technical indicators with explanations', 'A clear path from research to testing'], link: 'Try the research copilot', question: 'Compare BTC and ETH before I paper trade.', lead: "Let's make the comparison measurable.", answer: 'Review the trend and volatility, then run the same strategy on both sample series.', action: 'Open research' },
    rules: { status: 'LOCAL DEMO', title: 'Set the condition.<br>Keep the control.', description: 'Define a price condition, check it against the sample market and pause or resume your rules whenever you choose.', list: ['Create per-asset price rules', 'Pause, resume and manually check alerts', 'A visible event history in your browser'], link: 'Explore rules & alerts', question: 'Tell me when the sample BTC price is above $64,000.', lead: 'A clear rule, with a visible result.', answer: 'Create the condition and run a sample check. Background scheduling and external notifications are planned.', action: 'Create a local rule' },
    backtest: { status: 'WORKING LOCAL CALCULATION', title: 'A promising idea.<br>Now test the evidence.', description: 'Run a moving-average crossover on sample candles or import your own CSV. Measure the outcome with fees included.', list: ['Adjust strategy windows and starting capital', 'Compare against buy-and-hold', 'Review drawdown, fees and closed trades'], link: 'Open the backtest lab', question: 'Test a 9 / 21 moving-average crossover.', lead: 'Let the calculation answer.', answer: 'Use next-candle execution, include both entry and exit fees, then review the full equity curve.', action: 'Run a backtest' }
  };
  const tabs = [...document.querySelectorAll('[data-feature]')];
  function chooseFeature(key) {
    const f = features[key];
    tabs.forEach(t => { const active = t.dataset.feature === key; t.classList.toggle('active', active); t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1; });
    document.getElementById('feature-panel').setAttribute('aria-labelledby', `tab-${key}`);
    document.getElementById('feature-status').textContent = f.status;
    document.getElementById('feature-title').innerHTML = f.title;
    document.getElementById('feature-description').textContent = f.description;
    document.getElementById('feature-list').innerHTML = f.list.map(v => `<li>${Q.esc(v)}</li>`).join('');
    document.getElementById('feature-question').textContent = f.question;
    document.getElementById('feature-answer').innerHTML = `<span class="lime">${Q.esc(f.lead)}</span><p>${Q.esc(f.answer)}</p>`;
    const link = document.getElementById('feature-link'); link.textContent = `${f.link} ↗`; link.href = `workspace.html?view=${key}`;
    const cardLink = document.getElementById('feature-card-link'); cardLink.textContent = `${f.action} ↗`; cardLink.href = link.href;
  }
  tabs.forEach((tab, i) => { tab.addEventListener('click', () => chooseFeature(tab.dataset.feature)); tab.addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); chooseFeature(tabs[next].dataset.feature); }); });
})();
