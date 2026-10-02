(function (root) {
  'use strict';
  const markets = [
    { symbol: 'BTC', name: 'Bitcoin', price: 64280, icon: '₿', seed: 17 },
    { symbol: 'ETH', name: 'Ethereum', price: 2640.5, icon: '◆', seed: 31 },
    { symbol: 'SOL', name: 'Solana', price: 148.72, icon: '≋', seed: 49 },
    { symbol: 'BNB', name: 'BNB', price: 579.4, icon: '◇', seed: 63 },
    { symbol: 'XRP', name: 'XRP', price: 0.5872, icon: '×', seed: 89 }
  ];
  const getMarket = symbol => markets.find(m => m.symbol === symbol) || markets[0];
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (value, digits = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const price = value => money(value, value < 1 ? 4 : 2);
  const pct = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const qty = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);
  const samples = {};
  function candles(symbol) {
    if (samples[symbol]) return samples[symbol];
    const m = getMarket(symbol); let seed = m.seed; let last = m.price * .9;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rows = Array.from({ length: 240 }, (_, i) => {
      const open = last * (1 + (random() - .5) * .003);
      const close = open * (1 + .00035 + Math.sin(i / 11 + m.seed) * .0045 + (random() - .5) * .010);
      const row = { time: Date.UTC(2026, 8, 21) + i * 3600000, open, close, high: Math.max(open, close) * (1 + random() * .005), low: Math.min(open, close) * (1 - random() * .005), volume: 250 + random() * 800 };
      last = close; return row;
    });
    const scale = m.price / rows.at(-1).close;
    rows.forEach(r => ['open', 'high', 'low', 'close'].forEach(k => { r[k] *= scale; }));
    samples[symbol] = rows; return rows;
  }
  function sma(values, period) {
    let sum = 0;
    return values.map((v, i) => { sum += v; if (i >= period) sum -= values[i - period]; return i >= period - 1 ? sum / period : null; });
  }
  function indicators(rows) {
    const close = rows.map(r => r.close), fast = sma(close, 9).at(-1), slow = sma(close, 21).at(-1);
    let gains = 0, losses = 0;
    for (let i = rows.length - 14; i < rows.length; i++) { const delta = close[i] - close[i - 1]; if (delta > 0) gains += delta; else losses -= delta; }
    const rsi = gains === 0 && losses === 0 ? 50 : losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    const ranges = rows.slice(-14).map((r, i) => Math.max(r.high - r.low, Math.abs(r.high - rows[rows.length - 15 + i].close), Math.abs(r.low - rows[rows.length - 15 + i].close)));
    const atr = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    return { fast, slow, rsi, atr, trend: fast >= slow ? 'Above slow average' : 'Below slow average', change: (close.at(-1) / close.at(-25) - 1) * 100 };
  }
  function chart(values, options = {}) {
    if (!values.length || values.some(v => !Number.isFinite(v))) return '';
    const width = 700, height = options.spark ? 80 : 235, pad = options.spark ? 3 : 35;
    const secondary = options.secondary || [], all = values.concat(secondary);
    const min = Math.min(...all), max = Math.max(...all), span = (max - min) || max * .01 || 1;
    const lo = min - span * .1, hi = max + span * .12;
    const plotW = width - pad * 2, plotH = height - pad * 2;
    const points = vals => vals.map((v, i) => `${(pad + i / Math.max(vals.length - 1, 1) * plotW).toFixed(2)},${(pad + (hi - v) / (hi - lo) * plotH).toFixed(2)}`).join(' ');
    const pts = points(values), last = pts.split(' ').at(-1).split(',');
    const id = `fill-${++chart.counter}`;
    const grid = options.spark ? '' : [0, 1, 2, 3].map(i => {
      const y = pad + i * plotH / 3, v = hi - i / 3 * (hi - lo);
      const label = v < 1 ? v.toFixed(3) : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(1);
      return `<path d="M${pad} ${y}H${width-pad}" stroke="#30452b" stroke-width=".7" stroke-dasharray="3 6"/><text x="${width-pad+8}" y="${y+3}" text-anchor="start">${label}</text>`;
    }).join('');
    return `<svg class="data-chart" viewBox="0 0 ${width + (options.spark ? 0 : 12)} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(options.label || 'Synthetic demo price series')}"><title>${esc(options.label || 'Synthetic demo price series')}</title><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a4f781" stop-opacity=".2"/><stop offset="100%" stop-color="#a4f781" stop-opacity="0"/></linearGradient></defs>${grid}${options.spark ? '' : `<polygon points="${pad},${height-pad} ${pts} ${width-pad},${height-pad}" fill="url(#${id})"/>`}${secondary.length ? `<polyline points="${points(secondary)}" fill="none" stroke="#ad95ed" stroke-width="1.6" stroke-dasharray="5 4"/>` : ''}<polyline points="${pts}" fill="none" stroke="#a4f781" stroke-width="${options.spark ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="${options.spark ? 0 : 3}" fill="#c6ffa5"/></svg>`;
  }
  chart.counter = 0;
  function backtest(rows, { fast = 9, slow = 21, capital = 10000, feePct = .1 } = {}) {
    if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast < 2 || slow <= fast || slow > 200) throw new Error('Use whole-number windows: fast ≥ 2, slow > fast, and slow ≤ 200.');
    if (!Number.isFinite(capital) || capital < 1 || capital > 10000000) throw new Error('Starting balance must be between $1 and $10,000,000.');
    if (!Number.isFinite(feePct) || feePct < 0 || feePct > 5) throw new Error('Fee must be between 0% and 5% per side.');
    if (rows.length < slow + 5) throw new Error(`At least ${slow + 5} candles are needed for these windows.`);
    const close = rows.map(r => r.close), f = sma(close, fast), s = sma(close, slow), fee = feePct / 100;
    let cash = capital, position = null, peak = capital, drawdown = 0;
    const trades = [], equity = [], baseline = [], times = [];
    const start = slow + 1, bhQuantity = capital / (rows[start].open * (1 + fee));
    const sell = (row, exitPrice) => {
      const gross = position.quantity * exitPrice, exitFee = gross * fee;
      cash += gross - exitFee;
      trades.push({ entryTime: position.time, exitTime: row.time, entry: position.entry, exit: exitPrice, quantity: position.quantity, fees: position.entryFee + exitFee, pnl: gross - exitFee - position.cost });
      position = null;
    };
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      const crossUp = f[i-1] > s[i-1] && f[i-2] <= s[i-2];
      const crossDown = f[i-1] < s[i-1] && f[i-2] >= s[i-2];
      if (crossDown && position) sell(row, row.open);
      else if (crossUp && !position) {
        const quantity = cash / (row.open * (1 + fee));
        position = { quantity, entry: row.open, time: row.time, cost: cash, entryFee: quantity * row.open * fee }; cash = 0;
      }
      if (i === rows.length - 1 && position) sell(row, row.close);
      const value = cash + (position ? position.quantity * row.close : 0);
      peak = Math.max(peak, value); drawdown = Math.min(drawdown, (value / peak - 1) * 100);
      equity.push(value); baseline.push(bhQuantity * row.close * (i === rows.length - 1 ? 1 - fee : 1)); times.push(row.time);
    }
    return { equity, baseline, times, trades, final: cash, netReturn: (cash / capital - 1) * 100, drawdown, buyHold: (baseline.at(-1) / capital - 1) * 100, totalFees: trades.reduce((a, t) => a + t.fees, 0), fast, slow, capital, feePct };
  }
  function parseLine(line) {
    const fields = []; let cell = '', quote = false;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (quote && line[i+1] === '"') { cell += '"'; i++; } else quote = !quote; } else if (c === ',' && !quote) { fields.push(cell.trim()); cell = ''; } else cell += c; }
    if (quote) throw new Error('A CSV row contains an unclosed quote.'); fields.push(cell.trim()); return fields;
  }
  function parseCSV(text) {
    const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(x => x.trim());
    if (lines.length < 31 || lines.length > 10001) throw new Error('Upload between 30 and 10,000 candle rows.');
    const header = parseLine(lines.shift()).map(x => x.toLowerCase());
    const required = ['timestamp', 'open', 'high', 'low', 'close'];
    for (const key of required) if (!header.includes(key)) throw new Error(`Missing column: ${key}. Download the sample CSV for the expected format.`);
    let prev = -Infinity;
    return lines.map((line, i) => {
      const values = parseLine(line); if (values.length !== header.length) throw new Error(`Row ${i+2}: column count does not match the header.`);
      const read = key => values[header.indexOf(key)];
      const rawTime = read('timestamp');
      let time = /^\d+(\.\d+)?$/.test(rawTime) ? Number(rawTime) * (Number(rawTime) < 1e11 ? 1000 : 1) : Date.parse(rawTime);
      if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime()) || time <= prev) throw new Error(`Row ${i+2}: timestamps must be valid and strictly increasing.`);
      prev = time;
      const row = { time };
      for (const key of ['open', 'high', 'low', 'close']) { row[key] = Number(read(key)); if (!read(key) || !Number.isFinite(row[key]) || row[key] <= 0) throw new Error(`Row ${i+2}: ${key} must be a positive number.`); }
      row.volume = header.includes('volume') ? Number(read('volume')) : 0;
      if (!Number.isFinite(row.volume) || row.volume < 0) throw new Error(`Row ${i+2}: volume must be non-negative.`);
      if (row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close) || row.high < row.low) throw new Error(`Row ${i+2}: inconsistent OHLC prices.`);
      return row;
    });
  }
  function csv(rows) { return rows.map(row => row.map(v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+@\-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n'); }
  function download(name, text, type = 'text/csv;charset=utf-8') { const blob = new Blob([text], { type }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
  const api = { markets, getMarket, candles, indicators, sma, backtest, parseCSV, csv, chart, money, price, pct, qty, esc, download };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Quantivo = api;
})(typeof window !== 'undefined' ? window : globalThis);
