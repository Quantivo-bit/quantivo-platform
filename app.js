(async () => {
  'use strict';
  const Q = window.Quantivo, $ = id => document.getElementById(id);
  const STORAGE = 'quantivo-v4-guest-data', A = window.QuantivoAuth;
  await A.ready;
  if (new URLSearchParams(location.search).get('guest') === '1' && !A.user) A.enterGuest();
  let version = 0, busy = false;
  const viewNames = { overview: 'Overview', research: 'Research copilot', markets: 'Market watch', backtest: 'Backtest lab', portfolio: 'Paper portfolio', rules: 'Rules & alerts', journal: 'Trade journal', connections: 'Connections' };
  const fresh = () => ({ trades: [], rules: [], favorites: ['BTC', 'ETH'], onboarding: false });
  let storageOK = true;
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE); if (!raw) return fresh();
      const value = JSON.parse(raw), base = fresh();
      if (!value || typeof value !== 'object') return base;
      base.onboarding = value.onboarding === true;
      base.favorites = Array.isArray(value.favorites) ? value.favorites.filter(s => Q.markets.some(m => m.symbol === s)) : base.favorites;
      base.rules = Array.isArray(value.rules) ? value.rules.filter(r => r && typeof r.id === 'string' && Q.markets.some(m => m.symbol === r.symbol) && ['above', 'below'].includes(r.condition) && Number.isFinite(r.threshold) && r.threshold > 0).slice(0, 100).map(r => ({ id: r.id, symbol: r.symbol, condition: r.condition, threshold: r.threshold, active: Boolean(r.active) })) : [];
      let cash = 10000; const holdings = {};
      if (Array.isArray(value.trades)) for (const t of value.trades.slice(0, 10000)) {
        if (!t || !Q.markets.some(m => m.symbol === t.symbol) || !['BUY', 'SELL'].includes(t.side) || ![t.quantity, t.price, t.fee, t.notional].every(Number.isFinite) || t.quantity <= 0 || t.price <= 0 || t.fee < 0 || t.notional <= 0 || !Number.isFinite(Date.parse(t.time))) continue;
        if (Math.abs(t.notional - t.quantity * t.price) > .001 || Math.abs(t.fee - t.notional * .001) > .001) continue;
        const owned = holdings[t.symbol] || 0;
        if (t.side === 'BUY') { if (t.notional + t.fee > cash + 1e-6) continue; cash -= t.notional + t.fee; holdings[t.symbol] = owned + t.quantity; }
        else { if (t.quantity > owned + 1e-8) continue; cash += t.notional - t.fee; holdings[t.symbol] = Math.max(0, owned - t.quantity); }
        base.trades.push({ id: String(t.id || ''), time: t.time, symbol: t.symbol, side: t.side, quantity: t.quantity, price: t.price, notional: t.notional, fee: t.fee });
      }
      return base;
    } catch { storageOK = false; return fresh(); }
  }
  let state = A.user ? fresh() : load();
  let loadError = '';
  if (A.user) {
    try { const result = await A.request('workspace'); state = result.state; version = result.version; }
    catch (error) { loadError = error.message; }
  }
  let current = 'overview', selected = 'BTC', uploaded = null, lastTest = null, toastTimer, orderDraft = null;
  let chat = [], alerts = [], search = '', onlyFavorites = false;
  const newID = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function storageStatus() {
    $('storage-status').textContent = !storageOK ? 'Changes not saved · reload to retry' : busy ? 'Saving…' : A.user ? 'Saved to your account' : 'Guest demo · saved on this device';
    $('storage-status').classList.toggle('save-state-error', !storageOK);
  }
  function hasSession() { return Boolean(A.user || A.guest); }
  function updateWorkspaceUser() {
    const name = A.user?.name || 'Guest researcher', initial = name.trim().charAt(0).toUpperCase() || 'Q';
    $('workspace-user').textContent = A.user ? `Hi, ${name.split(' ')[0]}` : 'Guest demo';
    $('workspace-signout').textContent = A.user ? 'Sign out' : 'Exit demo';
    $('workspace-signout').hidden = !hasSession();
    $('top-avatar').textContent = initial; $('sidebar-avatar').textContent = initial;
    $('sidebar-user').firstChild.textContent = name;
    $('sidebar-user-status').textContent = A.user ? 'Private paper workspace · v4' : 'Guest · this browser only';
  }
  async function save() {
    if (busy) return false;
    busy = true; storageStatus();
    try {
      if (A.user) {
        const result = await A.request('preferences', 'PUT', {version, favorites: state.favorites, rules: state.rules, onboarding: state.onboarding});
        state = result.state; version = result.version;
      } else localStorage.setItem(STORAGE, JSON.stringify(state));
      storageOK = true; return true;
    } catch (error) {
      storageOK = false; toast(error.message, true);
      if (A.user) { try { const data = await A.request('workspace'); state = data.state; version = data.version; } catch {} }
      if (!A.user && !A.guest) renderAccessGate();
      return false;
    } finally { busy = false; storageStatus(); }
  }
  function toast(message, error = false) { const t = document.querySelector('.toast'); clearTimeout(toastTimer); t.textContent = message; t.classList.toggle('error', error); t.hidden = false; toastTimer = setTimeout(() => { t.hidden = true; }, 4500); }
  function balance() {
    let cash = 10000, fees = 0; const positions = {};
    for (const t of state.trades) { cash += t.side === 'BUY' ? -t.notional - t.fee : t.notional - t.fee; positions[t.symbol] = (positions[t.symbol] || 0) + (t.side === 'BUY' ? t.quantity : -t.quantity); fees += t.fee; }
    Object.keys(positions).forEach(s => { if (Math.abs(positions[s]) < 1e-8) delete positions[s]; });
    const value = Object.entries(positions).reduce((sum, [s, q]) => sum + q * Q.getMarket(s).price, 0);
    return { cash, positions, fees, value, equity: cash + value };
  }
  function token(symbol) { const m = Q.getMarket(symbol); return `<span class="token ${m.symbol.toLowerCase()}">${m.icon}</span>`; }
  function options(active = selected) { return Q.markets.map(m => `<option value="${m.symbol}" ${m.symbol === active ? 'selected' : ''}>${m.name} (${m.symbol}/USDT)</option>`).join(''); }
  function heading(title, description, actions = '') { return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`; }
  function metric(label, value, note = '', cls = '') { return `<div class="metric-card"><span>${label}</span><strong class="${cls}">${value}</strong><small>${note}</small></div>`; }
  function empty(title, text, action = '') { return `<div class="empty-state"><span>◌</span><h3>${title}</h3><p>${text}</p>${action}</div>`; }
  function link(view, text, primary = false) { return `<a href="?view=${view}" data-view="${view}" class="button small ${primary ? 'primary' : 'secondary'}">${text} ↗</a>`; }
  function navigate(view, push = true) {
    current = Object.hasOwn(viewNames, view) ? view : 'overview';
    if (push) { const url = new URL(location.href); url.searchParams.set('view', current); url.searchParams.delete('prompt'); history.pushState({}, '', url); }
    document.querySelectorAll('.app-sidebar [data-view]').forEach(a => { const active = a.dataset.view === current; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('breadcrumb').textContent = viewNames[current]; document.title = `${viewNames[current]} — Quantivo Demo`;
    $('app-sidebar').classList.remove('open'); document.querySelector('.app-menu').setAttribute('aria-expanded', 'false');
    render(); if (push) { $('app-main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  }
  function render() {
    updateWorkspaceUser();
    if (loadError) { $('app-main').innerHTML = empty('Your workspace could not load.', Q.esc(loadError), '<button class="button primary" id="reload-workspace">Try again</button>'); $('reload-workspace').onclick = () => location.reload(); return; }
    if (!hasSession()) { renderAccessGate(); storageStatus(); return; }
    const views = { overview: renderOverview, research: renderResearch, markets: renderMarkets, backtest: renderBacktest, portfolio: renderPortfolio, rules: renderRules, journal: renderJournal, connections: renderConnections };
    views[current](); storageStatus();
  }
  function renderAccessGate() {
    $('app-main').innerHTML = `<section class="access-gate"><div class="access-orb" aria-hidden="true">q</div><span class="eyebrow lime">A SPACE FOR YOUR RESEARCH</span><h1>Your next step starts here.</h1><p>${A.available ? 'Create an account to save your paper portfolio, watchlists and rules. Sign in to continue on any device.' : 'Explore the sample workspace. Registration will be available when the account service is connected.'}</p><div class="access-actions">${A.available ? `<a class="button primary" href="index.html?auth=register&view=${current}">Register ↗</a><a class="button secondary" href="index.html?auth=signin&view=${current}">Sign in</a>` : ''}</div><button id="continue-guest" class="button secondary">Explore as a guest →</button><div class="access-points"><span>✓ Virtual funds</span><span>✓ No payment</span><span>✓ No live orders</span></div><a class="text-link" href="guide.html">Read the quick guide ↗</a></section>`;
    $('continue-guest').onclick = () => { A.enterGuest(); render(); };
  }
  function startGuide() {
    if (state.onboarding) return '';
    return `<section class="start-guide"><button class="dismiss-guide" id="dismiss-guide" aria-label="Dismiss getting started guide">×</button><span class="eyebrow lime">START HERE · THREE SIMPLE STEPS</span><h2>A little structure. A clearer first move.</h2><p>Explore a market, test an idea and review a virtual order. Your workspace keeps each step in reach.</p><div class="start-steps"><a href="?view=markets" data-view="markets">01 · Find your market<small>Explore five sample assets and save favorites.</small></a><a href="?view=backtest" data-view="backtest">02 · Test an idea<small>Use sample candles or import a historical CSV.</small></a><a href="?view=portfolio" data-view="portfolio">03 · Practice a decision<small>Review every paper order before confirming.</small></a></div></section>`;
  }
  function renderOverview() {
    const b = balance(), m = Q.getMarket(selected), ind = Q.indicators(Q.candles(selected));
    $('app-main').innerHTML = heading('A clearer view of your next move.', 'Your research, markets and paper activity, in one place.', link('research', 'Ask the copilot', true)) +
    startGuide() + `<div class="metric-grid">${metric('Virtual equity', Q.money(b.equity), 'Marked at fixed demo quotes')}${metric('Available cash', Q.money(b.cash), 'Started with $10,000')}${metric('Open paper positions', Object.keys(b.positions).length.toString().padStart(2, '0'), 'No real capital at risk')}${metric('Research universe', '05', 'Illustrative crypto markets', 'lime')}</div>
    <div class="app-grid"><section class="panel"><div class="panel-heading"><h2>Market perspective</h2><span class="tag demo">SYNTHETIC CANDLES</span></div><div class="asset-selector">${Q.markets.map(x => `<button data-select-market="${x.symbol}" aria-pressed="${x.symbol === selected}" class="${x.symbol === selected ? 'active' : ''}">${x.symbol}</button>`).join('')}</div><div class="chart-summary"><div><strong>${Q.price(m.price)}</strong><small>${m.name} · sample hourly series</small></div><span class="${ind.change >= 0 ? 'positive' : 'negative'}">${Q.pct(ind.change)}<small class="subtle" style="display:block;font-size:9px">last 24 sample bars</small></span></div><div class="app-chart">${Q.chart(Q.candles(selected).slice(-90).map(r => r.close))}</div><div class="chart-caption"><span>Sample snapshot · not a live feed</span><a href="?view=backtest" data-view="backtest">Explore in the lab ↗</a></div></section><section class="panel"><div class="panel-heading"><h2>Market watch</h2><a href="?view=markets" data-view="markets">View all ↗</a></div>${Q.markets.map(x => { const change = Q.indicators(Q.candles(x.symbol)).change; return `<div class="market-row">${token(x.symbol)}<div class="name">${x.name}<small>${x.symbol}/USDT</small></div><div class="market-price">${Q.price(x.price)}<small class="${change >= 0 ? 'positive' : 'negative'}">${Q.pct(change)}</small></div><button data-research-market="${x.symbol}" aria-label="Research ${x.name}">↗</button></div>`; }).join('')}<div class="notice">These are illustrative market snapshots. Switch to the lab to use your own historical CSV.</div></section></div>
    <div class="quick-actions"><a class="quick-action" href="?view=research" data-view="research"><span>✧</span><h3>Ask a better question</h3><p>Explore the scripted research copilot.</p></a><a class="quick-action" href="?view=backtest" data-view="backtest"><span>⌁</span><h3>Put an idea to the test</h3><p>Calculate a strategy's return after fees.</p></a><a class="quick-action" href="?view=portfolio" data-view="portfolio"><span>▤</span><h3>Practice your next move</h3><p>Review and place a virtual order.</p></a></div>`;
  }
  function renderMarkets() {
    $('app-main').innerHTML = heading('Keep your market in focus.', 'Search the sample universe and build a watchlist.') + `<section class="panel"><div class="table-toolbar"><input id="market-search" type="search" placeholder="Search by name or symbol…" aria-label="Search markets" value="${Q.esc(search)}"><label class="checkbox-label"><input type="checkbox" id="favorites-only" ${onlyFavorites ? 'checked' : ''}> Favorites only</label><span class="tag demo">SAMPLE QUOTES</span></div><div class="table-scroll" id="market-table"></div></section><div class="notice">24-bar changes and indicators are calculated from the synthetic sample series. The displayed quotes are fixed demo values.</div>`;
    marketTable();
    $('market-search').addEventListener('input', e => { search = e.target.value; marketTable(); });
    $('favorites-only').addEventListener('change', e => { onlyFavorites = e.target.checked; marketTable(); });
  }
  function marketTable() {
    const list = Q.markets.filter(m => `${m.name} ${m.symbol}`.toLowerCase().includes(search.toLowerCase()) && (!onlyFavorites || state.favorites.includes(m.symbol)));
    $('market-table').innerHTML = list.length ? `<table><thead><tr><th>Watch</th><th>Asset</th><th>Sample price</th><th>24-bar change</th><th>90-bar view</th><th>Research</th></tr></thead><tbody>${list.map(m => { const rows = Q.candles(m.symbol), ind = Q.indicators(rows), fav = state.favorites.includes(m.symbol); return `<tr><td><button class="star-button" data-favorite="${m.symbol}" aria-label="Favorite ${m.name}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button></td><td><div class="table-asset">${token(m.symbol)}<div>${m.name}<small>${m.symbol}/USDT</small></div></div></td><td>${Q.price(m.price)}</td><td class="${ind.change >= 0 ? 'positive' : 'negative'}">${Q.pct(ind.change)}</td><td><div class="table-spark">${Q.chart(rows.slice(-90).map(r => r.close), { spark: true })}</div></td><td><button class="table-button" data-research-market="${m.symbol}">Analyze ↗</button></td></tr>`; }).join('')}</tbody></table>` : empty('No markets match.', 'Try another name or turn off the favorites filter.');
  }
  function researchResponse(prompt) {
    const terms = prompt.toLowerCase();
    const aliases = { BTC: /\bbtc\b|bitcoin|بیت.?کوین/, ETH: /\beth\b|ethereum|اتریوم/, SOL: /\bsol\b|solana|سولانا/, BNB: /\bbnb\b|بایننس/, XRP: /\bxrp\b|ripple|ریپل/ };
    const named = Q.markets.filter(m => aliases[m.symbol].test(terms)); if (named.length) selected = named[0].symbol;
    const m = Q.getMarket(selected), ind = Q.indicators(Q.candles(selected));
    if (/خرید|فروش|سفارش|\bbuy\b|\bsell\b|order/.test(terms)) return `No order has been placed. This copilot cannot execute trades.\n\nOpen Paper portfolio to choose the asset and order value. Review the fixed demo quote and the 0.10% fee, then explicitly confirm the paper order. All funds are virtual.`;
    if (/compare|مقایسه/.test(terms) || named.length > 1) {
      const compare = named.length > 1 ? named.slice(0, 3) : Q.markets.slice(0, 2);
      return `Sample comparison — not live analysis:\n\n${compare.map(x => { const k = Q.indicators(Q.candles(x.symbol)); return `${x.name}: ${Q.price(x.price)}. Last 24 sample bars: ${Q.pct(k.change)}. Simple RSI (14): ${k.rsi.toFixed(1)}. ATR (14) / price: ${(k.atr / x.price * 100).toFixed(2)}%.`; }).join('\n\n')}\n\nTo compare the evidence, run identical fast/slow windows and fees on both datasets in Backtest lab. These generated series do not imply a real-market opportunity.`;
    }
    if (/backtest|strategy|بک.?تست|استراتژی/.test(terms)) return `A testable starting point for ${m.symbol}:\n\n• Long-only SMA crossover: fast 9, slow 21.\n• Execute a signal at the next candle's open.\n• Include the 0.10% fee on entry and exit.\n• Compare net return and maximum drawdown with buy-and-hold.\n\nOpen Backtest lab to calculate the result. Use your own historical CSV for a more relevant test. This is a test template, not an optimized or recommended strategy.`;
    if (/risk|ریسک|drawdown|افت/.test(terms)) return `Before a ${m.symbol} paper trade:\n\n1. Define the maximum virtual amount you will commit.\n2. Review fees, historical drawdown and data quality.\n3. Test different time windows; one favorable sample is not evidence of future profit.\n4. Review every order and keep a journal.\n\nThe synthetic sample ATR (14) is ${Q.price(ind.atr)}, about ${(ind.atr / m.price * 100).toFixed(2)}% of the demo quote. This is illustrative, not a live risk assessment.`;
    if (/alert|هشدار|rule|قانون/.test(terms)) return `Use Rules & alerts to create a ${m.symbol} price condition. Choose above or below, enter a threshold, then click Check sample prices.\n\nSigned-in users save rules to their account; guests save them in this browser. Checks run only when requested in the open page; there is no background scheduler, email or Telegram delivery yet.`;
    if (named.length || /trend|analy|research|market|تحلیل|بازار|روند/.test(terms)) return `${m.name} — synthetic sample research brief\n\nFixed sample quote: ${Q.price(m.price)}\nLast 24 sample bars: ${Q.pct(ind.change)}\nFast / slow SMA: ${Q.price(ind.fast)} / ${Q.price(ind.slow)}\nTrend context: ${ind.trend}\nSimple RSI (14): ${ind.rsi.toFixed(1)}\n\nA moving average describes the sample series; it is not a forecast. Test your assumptions in Backtest lab before reviewing a virtual order. No live data, AI model or broker is connected.`;
    return `This is a scripted research demo, so I cannot answer open-ended questions or retrieve live information.\n\nTry “Analyze BTC”, “Compare BTC and ETH”, “Review risk for SOL”, or “How do I backtest a strategy?”. You can ask these in Persian too. No trade is placed through this chat.`;
  }
  function renderResearch() {
    const m = Q.getMarket(selected), ind = Q.indicators(Q.candles(selected));
    $('app-main').innerHTML = heading('A question is a good place to start.', 'Explore context, assumptions and the next thing to test.', '<span class="tag demo">SCRIPTED COPILOT · NO AI CONNECTION</span>') + `<div class="research-layout"><section class="panel chat-panel"><div class="panel-heading"><div class="copilot-heading"><span class="ai-spark">✧</span><div>Quantivo research<small>Illustrative responses · sample context</small></div></div><button class="table-button" id="clear-chat">New conversation</button></div><div class="chat-log" id="chat-log" role="log" aria-label="Demo research conversation" aria-live="polite"></div><form id="chat-form" class="chat-form"><input id="chat-input" maxlength="500" required autocomplete="off" dir="auto" placeholder="Ask about BTC, risk or a backtest…" aria-label="Research question"><button class="button primary" type="submit" aria-label="Send question">↑</button></form><p class="chat-disclaimer">Scripted demo. Responses are not personalized financial advice.</p></section><aside class="panel research-context"><h3>In your research context</h3><div class="market-row">${token(m.symbol)}<div class="name">${m.name}<small>${m.symbol}/USDT · sample</small></div><span>${Q.price(m.price)}</span></div><div class="context-item"><span>Fast SMA (9)</span><strong>${Q.price(ind.fast)}</strong></div><div class="context-item"><span>Slow SMA (21)</span><strong>${Q.price(ind.slow)}</strong></div><div class="context-item"><span>Simple RSI (14)</span><strong>${ind.rsi.toFixed(1)}</strong></div><div class="context-item"><span>ATR (14)</span><strong>${Q.price(ind.atr)}</strong></div><div class="notice">Calculated from generated candles, not a live feed or XGBoost prediction.</div>${link('backtest', 'Test an idea', true)}<p style="margin-top:20px">Bring your own historical CSV into the lab when you're ready.</p></aside></div>`;
    drawChat();
    $('chat-form').addEventListener('submit', e => { e.preventDefault(); const text = $('chat-input').value.trim(); if (text) sendPrompt(text); });
    $('clear-chat').addEventListener('click', () => { chat = []; drawChat(); $('chat-input').focus(); });
  }
  function drawChat() {
    $('chat-log').innerHTML = `<div class="chat-message"><span class="ai-spark">✧</span><div><span class="message-label">Quantivo · scripted demo</span><p>Let's turn a market question into something you can test. Explore a sample analysis, compare assets or review the research workflow.</p></div></div>${!chat.length ? `<div class="prompt-grid">${['Analyze BTC', 'Compare BTC and ETH', 'Review risk for SOL', 'How do I backtest a strategy?'].map(p => `<button data-prompt="${Q.esc(p)}">${p} ↗</button>`).join('')}</div>` : ''}${chat.map(msg => `<div class="chat-message ${msg.role}">${msg.role === 'assistant' ? '<span class="ai-spark">✧</span>' : ''}<div><span class="message-label">${msg.role === 'user' ? 'You' : 'Quantivo · scripted demo'}</span><p dir="auto">${Q.esc(msg.text)}</p></div></div>`).join('')}`;
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
  }
  function sendPrompt(text) { chat.push({ role: 'user', text: text.slice(0, 500) }, { role: 'assistant', text: researchResponse(text) }); chat = chat.slice(-40); renderResearch(); $('chat-input').focus(); }
  function renderBacktest() {
    $('app-main').innerHTML = heading('Give your idea a fair test.', 'Calculate a strategy result on sample candles or your own historical data.', '<a href="guide.html#limitations" class="text-link">Read the assumptions ↗</a>') + `<section class="panel"><div class="panel-heading"><h2>Your test environment</h2><span class="tag available">LOCAL CALCULATION</span></div><div class="backtest-data"><div><label class="field"><span>Market / sample series</span><select id="backtest-market">${options()}</select></label><p id="dataset-label">${uploaded ? `Imported: ${Q.esc(uploaded.name)} · ${uploaded.rows.length} candles` : 'Synthetic sample dataset · 240 hourly candles'}</p><div class="export-actions"><button id="sample-csv" class="table-button">Download sample CSV ↓</button>${uploaded ? '<button id="use-sample" class="table-button">Use sample instead</button>' : ''}</div></div><div><label class="field"><span>Import your historical CSV · stays on this device</span><input id="csv-upload" type="file" accept=".csv,text/csv"></label><p>Columns: timestamp, open, high, low, close, volume.<br>30–10,000 candles · maximum 2 MB · increasing timestamps.</p><p id="csv-error" class="form-error" role="alert"></p></div></div><div class="strategy-templates" aria-label="Strategy templates"><button data-template="9,21">Fast / slow · 9 / 21</button><button data-template="20,50">Trend template · 20 / 50</button><button data-template="5,15">Short-window · 5 / 15</button></div><form id="backtest-form"><div class="backtest-form"><label class="field"><span>Fast SMA window</span><input type="number" id="fast-window" min="2" max="199" step="1" value="${lastTest?.fast || 9}" required></label><label class="field"><span>Slow SMA window</span><input type="number" id="slow-window" min="3" max="200" step="1" value="${lastTest?.slow || 21}" required></label><label class="field"><span>Starting balance (USD)</span><input type="number" id="starting-capital" min="1" max="10000000" step=".01" value="${lastTest?.capital || 10000}" required></label><label class="field"><span>Fee per side (%)</span><input type="number" id="trade-fee" min="0" max="5" step=".01" value="${lastTest?.feePct ?? .1}" required></label></div><div class="form-actions"><span class="subtle" style="font-size:10px">Long-only · next-bar open · fees on entry and exit</span><button class="button primary small" type="submit">Run backtest <span>↗</span></button></div><p id="backtest-error" class="form-error" role="alert"></p></form></section><div id="backtest-results" class="result-section"></div>`;
    $('backtest-market').addEventListener('change', e => { selected = e.target.value; uploaded = null; lastTest = null; renderBacktest(); });
    $('sample-csv').addEventListener('click', () => { const rows = Q.candles(selected); Q.download(`Quantivo-${selected}-synthetic-sample.csv`, Q.csv([['timestamp','open','high','low','close','volume'], ...rows.map(r => [new Date(r.time).toISOString(), r.open, r.high, r.low, r.close, r.volume])])); });
    $('use-sample')?.addEventListener('click', () => { uploaded = null; lastTest = null; renderBacktest(); });
    $('csv-upload').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB.'); const rows = Q.parseCSV(await file.text()); uploaded = { name: file.name, rows }; lastTest = null; if (current === 'backtest') renderBacktest(); toast(`${rows.length} candles imported locally.`); } catch (err) { if ($('csv-error')) $('csv-error').textContent = err.message; }
    });
    $('backtest-form').addEventListener('submit', e => {
      e.preventDefault(); $('backtest-error').textContent = '';
      try { const source = uploaded ? `Uploaded CSV: ${uploaded.name}` : `${selected} synthetic sample`; lastTest = { ...Q.backtest(uploaded?.rows || Q.candles(selected), { fast: +$('fast-window').value, slow: +$('slow-window').value, capital: +$('starting-capital').value, feePct: +$('trade-fee').value }), source }; drawBacktestResult(); toast('Backtest calculated. Review the results below.'); } catch (err) { $('backtest-error').textContent = err.message; }
    });
    drawBacktestResult();
  }
  function drawBacktestResult() {
    const target = $('backtest-results'); if (!lastTest) { target.innerHTML = ''; return; }
    const r = lastTest;
    target.innerHTML = `<div class="metric-grid">${metric('Net return', Q.pct(r.netReturn), 'Entry + exit fees included', r.netReturn >= 0 ? 'positive' : 'negative')}${metric('Maximum drawdown', `${r.drawdown.toFixed(2)}%`, 'Marked at candle closes', 'negative')}${metric('Closed trades', String(r.trades.length), `${Q.money(r.totalFees)} total fees`)}${metric('Buy-and-hold', Q.pct(r.buyHold), 'Same period & fee assumptions', r.buyHold >= 0 ? 'positive' : 'negative')}</div><section class="panel"><div class="panel-heading"><div><h2>What the evidence looks like</h2><p>${Q.esc(r.source)} · SMA ${r.fast} / ${r.slow}</p></div><button class="table-button" id="export-backtest">Export trades ↓</button></div><div class="chart-legend"><span><i></i>Strategy</span><span><i class="purple-dot"></i>Buy-and-hold</span></div><div class="app-chart">${Q.chart(r.equity, { secondary: r.baseline, label: 'Calculated strategy and buy-and-hold equity curves' })}</div><div class="chart-caption"><span>${new Date(r.times[0]).toISOString().slice(0, 16).replace('T', ' ')} UTC</span><span>${new Date(r.times.at(-1)).toISOString().slice(0,16).replace('T', ' ')} UTC</span></div><div class="notice">Final strategy equity: ${Q.money(r.final)}. Final open positions are closed at the last candle. This test does not model spread, slippage, funding or liquidity constraints.</div>${r.trades.length ? `<div class="table-scroll"><table><thead><tr><th>Entry (UTC)</th><th>Exit (UTC)</th><th>Entry price</th><th>Exit price</th><th>Net P&amp;L</th></tr></thead><tbody>${r.trades.slice(-20).map(t => `<tr><td>${new Date(t.entryTime).toISOString().slice(5,16).replace('T',' ')}</td><td>${new Date(t.exitTime).toISOString().slice(5,16).replace('T',' ')}</td><td>${Q.price(t.entry)}</td><td>${Q.price(t.exit)}</td><td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${Q.money(t.pnl)}</td></tr>`).join('')}</tbody></table></div>${r.trades.length > 20 ? '<p class="subtle" style="font-size:10px">Showing the last 20 trades. Export includes all trades.</p>' : ''}` : empty('No crossover trades in this period.', 'Try another window or dataset. A zero-trade result is a valid outcome.')}</section>`;
    $('export-backtest').addEventListener('click', () => Q.download('Quantivo-backtest-trades.csv', Q.csv([['entry_utc','exit_utc','entry_price','exit_price','quantity','fees_usd','net_pnl_usd'], ...r.trades.map(t => [new Date(t.entryTime).toISOString(),new Date(t.exitTime).toISOString(),t.entry,t.exit,t.quantity,t.fees,t.pnl])])));
  }
  function renderPortfolio() {
    const b = balance();
    $('app-main').innerHTML = heading('Practice with purpose.', 'Fixed demo quotes. Virtual funds. Every order reviewed by you.', link('journal', 'View journal')) + `<div class="metric-grid">${metric('Virtual equity', Q.money(b.equity), 'Fixed sample quotes')}${metric('Available cash', Q.money(b.cash), 'No margin or leverage')}${metric('Position value', Q.money(b.value), `${Object.keys(b.positions).length} assets held`)}${metric('Fees paid', Q.money(b.fees), '0.10% on each paper fill')}</div><div class="order-layout"><section class="panel"><div class="panel-heading"><h2>New paper order</h2><span class="tag demo">SIMULATION</span></div><form id="order-form"><label class="field"><span>Asset</span><select id="order-symbol">${options()}</select></label><label class="field"><span>Side</span><select id="order-side"><option value="BUY">Buy with virtual USD</option><option value="SELL">Sell a paper holding</option></select></label><label class="field"><span>Order value (USD), before fees</span><input id="order-amount" type="number" value="100" min="1" max="10000000" step=".01" required></label><div class="order-estimate" id="order-estimate"></div><button class="button primary wide" type="submit">Review paper order <span>→</span></button><p class="form-error" id="order-error" role="alert"></p></form><div class="notice">Paper fills use the fixed quote shown here, with a 0.10% fee. Quotes do not update in this demo.</div></section><section class="panel"><div class="panel-heading"><h2>Your paper holdings</h2><span class="tag muted">PAPER LEDGER</span></div>${Object.keys(b.positions).length ? `<div class="table-scroll"><table><thead><tr><th>Asset</th><th>Quantity</th><th>Value</th><th>Action</th></tr></thead><tbody>${Object.entries(b.positions).map(([s, q]) => `<tr><td><div class="table-asset">${token(s)}<span>${s}</span></div></td><td>${Q.qty(q)}</td><td>${Q.money(q * Q.getMarket(s).price)}</td><td><button class="table-button" data-sell="${s}">Sell</button></td></tr>`).join('')}</tbody></table></div>` : empty('Your first paper position starts here.', 'Choose an asset, enter a virtual order value and review it before confirming.')}<div class="notice purple-notice">This portfolio is separate from backtest results and imported CSV files. It never sends an order to cTrader or an exchange.</div></section></div>`;
    for (const id of ['order-symbol','order-side','order-amount']) $(id).addEventListener('input', orderEstimate);
    $('order-form').addEventListener('submit', e => { e.preventDefault(); reviewOrder(); }); orderEstimate();
  }
  function draftOrder() {
    const symbol = $('order-symbol').value, side = $('order-side').value, notional = Number($('order-amount').value), m = Q.getMarket(symbol), b = balance();
    if (!Number.isFinite(notional) || notional < 1 || notional > 10000000) throw new Error('Enter an order value between $1 and $10,000,000.');
    const fee = notional * .001, quantity = notional / m.price;
    if (side === 'BUY' && notional + fee > b.cash + 1e-6) throw new Error(`Insufficient virtual cash. Available: ${Q.money(b.cash)} including fees.`);
    if (side === 'SELL' && quantity > (b.positions[symbol] || 0) + 1e-8) throw new Error(`Insufficient ${symbol} holding. Available: ${Q.qty(b.positions[symbol] || 0)} ${symbol}.`);
    return { symbol, side, notional, quantity, price: m.price, fee };
  }
  function orderEstimate() {
    const m = Q.getMarket($('order-symbol').value), raw = Number($('order-amount').value), amount = Number.isFinite(raw) && raw > 0 ? raw : 0, side = $('order-side').value, fee = amount * .001;
    $('order-estimate').innerHTML = `<div><span>Fixed sample quote</span><strong>${Q.price(m.price)}</strong></div><div><span>Estimated quantity</span><strong>${Q.qty(amount / m.price)} ${m.symbol}</strong></div><div><span>Paper fee · 0.10%</span><strong>${Q.money(fee)}</strong></div><div><span>${side === 'BUY' ? 'Total debit' : 'Net proceeds'}</span><strong>${Q.money(amount + (side === 'BUY' ? fee : -fee))}</strong></div>`;
  }
  function dialog(content) { $('dialog-content').innerHTML = content; $('app-dialog').showModal(); }
  function reviewOrder() {
    $('order-error').textContent = '';
    try { orderDraft = { ...draftOrder(), id: newID() }; const d = orderDraft; dialog(`<span class="tag demo">PAPER ORDER ONLY</span><h2 id="dialog-title" style="margin-top:20px">Review your ${d.side.toLowerCase()}.</h2><p>This will update your virtual portfolio. No live order is sent.</p><div class="order-estimate"><div><span>Asset / side</span><strong>${d.symbol}/USDT · ${d.side}</strong></div><div><span>Quantity</span><strong>${Q.qty(d.quantity)}</strong></div><div><span>Fixed quote</span><strong>${Q.price(d.price)}</strong></div><div><span>Order value</span><strong>${Q.money(d.notional)}</strong></div><div><span>Fee</span><strong>${Q.money(d.fee)}</strong></div><div><span>${d.side === 'BUY' ? 'Total debit' : 'Net proceeds'}</span><strong>${Q.money(d.notional + (d.side === 'BUY' ? d.fee : -d.fee))}</strong></div></div><div class="dialog-actions"><button class="button small secondary" data-close-dialog>Cancel</button><button class="button small primary" id="confirm-order">Confirm paper ${d.side.toLowerCase()}</button></div>`); $('confirm-order').addEventListener('click', confirmOrder); } catch (err) { $('order-error').textContent = err.message; }
  }
  async function confirmOrder() {
    if (!orderDraft || busy || !hasSession()) return;
    const d = orderDraft, b = balance(), button = $('confirm-order');
    if ((d.side === 'BUY' && d.notional + d.fee > b.cash + 1e-6) || (d.side === 'SELL' && d.quantity > (b.positions[d.symbol] || 0) + 1e-8)) { orderDraft = null; $('app-dialog').close(); toast('Your balance changed. Review the order again.', true); return; }
    busy = true; button.disabled = true; button.textContent = 'Recording…';
    try {
      if (A.user) {
        const result = await A.request('orders', 'POST', {id:d.id, symbol:d.symbol, side:d.side, notional:d.notional});
        state = result.state; version = result.version;
      } else {
        const next = {...state, trades: [...state.trades, {...d, time: new Date().toISOString()}]};
        localStorage.setItem(STORAGE, JSON.stringify(next)); state = next;
      }
      storageOK = true; orderDraft = null; $('app-dialog').close(); renderPortfolio(); toast('Paper order recorded. No live order was sent.');
    } catch (error) { toast(error.message, true); button.disabled = false; button.textContent = 'Retry confirmation'; }
    finally { busy = false; storageStatus(); }
  }
  function renderRules() {
    $('app-main').innerHTML = heading('A condition worth keeping an eye on.', 'Create price rules, then check them against fixed sample prices.', '<button class="button small primary" id="check-rules">Check sample prices ↗</button>') + `<div class="rules-layout"><section class="panel"><div class="panel-heading"><h2>Create a price rule</h2><span class="tag demo">MANUAL CHECKS</span></div><form id="rule-form"><label class="field"><span>Asset</span><select id="rule-symbol">${options()}</select></label><label class="field"><span>Alert when sample price is</span><select id="rule-condition"><option value="above">Above threshold</option><option value="below">Below threshold</option></select></label><label class="field"><span>Threshold (USD)</span><input id="rule-threshold" type="number" min=".000001" max="10000000" step="any" value="${Q.getMarket(selected).price}" required></label><button class="button primary wide" type="submit">Save price rule <span>+</span></button><p id="rule-error" class="form-error" role="alert"></p></form><div class="notice">Checks run when you click “Check sample prices”. These rules do not run after you close the page.</div></section><section class="panel"><div class="panel-heading"><h2>Your rules</h2><span class="tag muted">${state.rules.length} SAVED</span></div><div id="rules-list"></div><div class="alert-list" id="alerts-log" role="log" aria-label="Local alert checks" aria-live="polite"></div></section></div><div class="notice purple-notice">Daily scheduling, Telegram and email notifications are on the connection roadmap. No external messages are sent by this demo.</div>`;
    drawRules();
    $('rule-symbol').addEventListener('change', e => { $('rule-threshold').value = Q.getMarket(e.target.value).price; });
    $('rule-form').addEventListener('submit', async e => { e.preventDefault(); if (busy) return; const threshold = Number($('rule-threshold').value); if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 10000000) { $('rule-error').textContent = 'Enter a valid positive threshold up to $10,000,000.'; return; } if (state.rules.length >= 100) { $('rule-error').textContent = 'This demo supports up to 100 price rules.'; return; } state.rules.push({ id: newID(), symbol: $('rule-symbol').value, condition: $('rule-condition').value, threshold, active: true }); const saved = await save(); render(); if (saved) toast('Rule saved. Use Check sample prices to evaluate it.'); });
    $('check-rules').addEventListener('click', checkRules);
  }
  function drawRules() {
    $('rules-list').innerHTML = state.rules.length ? state.rules.map(r => `<div class="rule-card"><div><h3>${r.symbol} ${r.condition} ${Q.price(r.threshold)}</h3><p>Fixed sample quote: ${Q.price(Q.getMarket(r.symbol).price)}</p></div><div class="rule-actions"><span class="tag ${r.active ? 'available' : 'muted'}">${r.active ? 'ENABLED' : 'PAUSED'}</span><button class="table-button" data-rule-toggle="${Q.esc(r.id)}">${r.active ? 'Pause' : 'Resume'}</button><button class="icon-button" data-rule-remove="${Q.esc(r.id)}" aria-label="Remove rule for ${r.symbol}">×</button></div></div>`).join('') : empty('Give a condition a home.', 'Create a price rule, then evaluate it against the sample snapshot.');
    $('alerts-log').innerHTML = alerts.map(a => `<div class="alert-item">${Q.esc(a.message)}<small>${Q.esc(a.time)} · manual sample check</small></div>`).join('');
  }
  function checkRules() {
    const enabled = state.rules.filter(r => r.active); if (!enabled.length) { toast('Create or enable a price rule first.'); return; }
    const hits = enabled.filter(r => r.condition === 'above' ? Q.getMarket(r.symbol).price > r.threshold : Q.getMarket(r.symbol).price < r.threshold);
    const time = new Date().toLocaleTimeString();
    if (!hits.length) alerts.unshift({ message: `Checked ${enabled.length} enabled rules. No sample conditions matched.`, time });
    else hits.forEach(r => alerts.unshift({ message: `${r.symbol}: sample quote ${Q.price(Q.getMarket(r.symbol).price)} is ${r.condition} ${Q.price(r.threshold)}. No order placed.`, time }));
    alerts = alerts.slice(0, 15); drawRules(); toast(`${enabled.length} rules checked; ${hits.length} matched the sample snapshot.`);
  }
  function renderJournal() {
    $('app-main').innerHTML = heading('A record of every paper decision.', 'Your paper order history, including quantities, quotes and fees.', '<button class="button small secondary" id="reset-demo">Reset demo</button>') + `<section class="panel"><div class="panel-heading"><div><h2>Paper-trade journal</h2><p>${state.trades.length} recorded orders · local browser time</p></div><button class="table-button" id="export-journal" ${state.trades.length ? '' : 'disabled'}>Export CSV ↓</button></div>${state.trades.length ? `<div class="table-scroll"><table><thead><tr><th>Time</th><th>Asset</th><th>Side</th><th>Quantity</th><th>Quote</th><th>Value</th><th>Fee</th></tr></thead><tbody>${state.trades.slice().reverse().map(t => `<tr><td>${Q.esc(new Date(t.time).toLocaleString())}</td><td>${t.symbol}/USDT</td><td><span class="tag ${t.side === 'BUY' ? 'available' : 'muted'}">${t.side}</span></td><td>${Q.qty(t.quantity)}</td><td>${Q.price(t.price)}</td><td>${Q.money(t.notional)}</td><td>${Q.money(t.fee)}</td></tr>`).join('')}</tbody></table></div>` : empty('Your journal is ready.', 'After you confirm a paper order, its full record appears here.', link('portfolio', 'Place a paper order', true))}</section><div class="notice">CSV exports use UTC timestamps. This journal contains only your paper orders; backtest trades are exported separately in the lab.</div>`;
    $('export-journal').addEventListener('click', () => Q.download('Quantivo-paper-journal.csv', Q.csv([['time_utc','symbol','side','quantity','sample_price','notional_usd','fee_usd','mode'], ...state.trades.map(t => [t.time,t.symbol,t.side,t.quantity,t.price,t.notional,t.fee,'PAPER_DEMO'])])));
    $('reset-demo').addEventListener('click', () => { dialog('<h2 id="dialog-title">Reset this demo workspace?</h2><p>This clears paper trades, price rules and favorites in the current workspace, restoring the virtual balance to $10,000. Export your journal first if you want to keep a copy.</p><div class="dialog-actions"><button class="button small secondary" data-close-dialog>Keep my demo</button><button class="button small danger" id="confirm-reset">Reset demo</button></div>'); $('confirm-reset').addEventListener('click', async () => {
      if (busy) return; busy = true; $('confirm-reset').disabled = true;
      try {
        if (A.user) { const result = await A.request('workspace/reset', 'POST', {}); state = result.state; version = result.version; }
        else { state = fresh(); localStorage.setItem(STORAGE, JSON.stringify(state)); }
        alerts = []; chat = []; uploaded = null; lastTest = null; orderDraft = null; storageOK = true;
        $('app-dialog').close(); renderJournal(); toast('Paper workspace reset. Virtual balance: $10,000.');
      } catch (error) { toast(error.message, true); $('confirm-reset').disabled = false; }
      finally { busy = false; storageStatus(); }
    }); });
  }
  const connections = [
    { icon: '↧', title: 'Historical CSV', status: 'AVAILABLE', text: 'Import candles and calculate a strategy result locally.', view: 'backtest' },
    { icon: 'Py', title: 'Python / XGBoost', status: 'PLANNED', text: 'Bring your research pipeline and versioned model outputs into the workspace.', detail: 'Your existing Python research pipeline is separate from this demo. The next step is a backend service that exposes validated data, model metadata and research results to the web interface. No model inference is running here.' },
    { icon: 'cT', title: 'cTrader Demo', status: 'PLANNED', text: 'A broker demo connection for account and execution validation.', detail: 'A cTrader demo integration needs a server-side application and a supported authorization flow. This interface has no active broker connection. After the connection is implemented, account reads and order handling must be tested in the broker demo environment.' },
    { icon: '⌁', title: 'TradingView', status: 'PLANNED', text: 'Bring chart alerts into a reviewed strategy workflow.', detail: 'TradingView webhooks need a backend endpoint that validates events and records them. An alert would first appear for review. The static GitHub Pages website cannot receive webhooks on its own.' },
    { icon: 'C', title: 'CoinPaprika', status: 'PLANNED', text: 'Add market context and fundamental data to your research.', detail: 'Market-data access, refresh rules and data-source timestamps must be implemented and checked separately. The current interface uses synthetic sample data; it does not call CoinPaprika.' },
    { icon: '↗', title: 'Scheduled alerts', status: 'PLANNED', text: 'Background checks with email or Telegram delivery.', detail: 'Background schedules and external notifications need a running server, delivery integration and user settings. The current price rules evaluate only when you request a sample check; they do not run after you close the page.' }
  ];
  function renderConnections() {
    $('app-main').innerHTML = heading('A transparent connection roadmap.', 'See what works today and what needs to be connected next.') + `<div class="app-connections">${connections.map((c, i) => `<article class="app-connection"><span class="connection-icon ${i === 1 ? 'purple' : 'lime'}">${c.icon}</span><h2>${c.title}</h2><p>${c.text}</p><span class="tag ${c.status === 'AVAILABLE' ? 'available' : 'muted'}">${c.status === 'AVAILABLE' ? 'AVAILABLE IN DEMO' : 'NOT CONNECTED · PLANNED'}</span>${c.view ? link(c.view, 'Import a dataset', true) : `<button class="button small secondary" data-connection="${i}">View next steps ↗</button>`}</article>`).join('')}</div><div class="notice purple-notice">No account keys, broker credentials or wallet permissions are requested in this demo. Live integrations are a separate development stage.</div>`;
  }
  document.addEventListener('click', async e => {
    if (busy) return;
    const route = e.target.closest('a[data-view]');
    if (route && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); navigate(route.dataset.view); return; }
    const el = e.target.closest('button'); if (!el || busy) return;
    if (el.id === 'dismiss-guide') { state.onboarding = true; await save(); render(); }
    if (el.hasAttribute('data-select-market')) { selected = Q.getMarket(el.dataset.selectMarket).symbol; renderOverview(); }
    if (el.hasAttribute('data-research-market')) { selected = Q.getMarket(el.dataset.researchMarket).symbol; navigate('research'); sendPrompt(`Analyze ${selected}`); }
    if (el.hasAttribute('data-favorite')) { const s = el.dataset.favorite; state.favorites = state.favorites.includes(s) ? state.favorites.filter(x => x !== s) : [...state.favorites, s]; await save(); if (hasSession() && current === 'markets') marketTable(); }
    if (el.hasAttribute('data-prompt')) sendPrompt(el.dataset.prompt);
    if (el.hasAttribute('data-template')) { const [f,s] = el.dataset.template.split(','); $('fast-window').value = f; $('slow-window').value = s; }
    if (el.hasAttribute('data-sell')) { const s = el.dataset.sell, b = balance(); $('order-symbol').value = s; $('order-side').value = 'SELL'; $('order-amount').value = ((b.positions[s] || 0) * Q.getMarket(s).price).toFixed(2); orderEstimate(); $('order-amount').focus(); }
    if (el.hasAttribute('data-close-dialog')) { orderDraft = null; $('app-dialog').close(); }
    if (el.hasAttribute('data-rule-toggle')) { const r = state.rules.find(x => x.id === el.dataset.ruleToggle); if (r) { r.active = !r.active; await save(); if (hasSession() && current === 'rules') drawRules(); } }
    if (el.hasAttribute('data-rule-remove')) { state.rules = state.rules.filter(r => r.id !== el.dataset.ruleRemove); const saved = await save(); render(); if (saved) toast('Rule removed.'); }
    if (el.hasAttribute('data-connection')) { const c = connections[Number(el.dataset.connection)]; if (c) dialog(`<span class="tag muted">PLANNED CONNECTION</span><h2 id="dialog-title" style="margin-top:20px">${c.title}</h2><p>${c.detail}</p><div class="dialog-actions"><button class="button small primary" data-close-dialog>Understood</button></div>`); }
  });
  document.querySelector('.app-menu').addEventListener('click', e => { const open = $('app-sidebar').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
  $('workspace-signout')?.addEventListener('click', async () => { if (busy) return; try { await A.logout(); location.href = 'index.html'; } catch (error) { toast(error.message, true); } });
  $('app-dialog').addEventListener('cancel', () => { orderDraft = null; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('app-sidebar').classList.remove('open'); document.querySelector('.app-menu').setAttribute('aria-expanded', 'false'); } });
  window.addEventListener('quantivo-session-ended', () => { state = fresh(); orderDraft = null; $('app-dialog').close(); render(); });
  window.addEventListener('popstate', () => navigate(new URLSearchParams(location.search).get('view') || 'overview', false));
  window.addEventListener('storage', e => { if (!A.user && (e.key === STORAGE || e.key === null)) { state = load(); if ($('app-dialog').open) { orderDraft = null; $('app-dialog').close(); } render(); } });
  navigate(new URLSearchParams(location.search).get('view') || 'overview', false);
})();
