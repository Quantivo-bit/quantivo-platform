(() => {
  'use strict';
  const A = window.QuantivoAuth = { user: null, csrf: null, available: false, guest: false };
  const views = ['overview','research','markets','backtest','portfolio','rules','journal','connections'];
  A.view = value => views.includes(value) ? value : 'overview';
  A.enterGuest = () => { A.guest = true; try { sessionStorage.setItem('quantivo-v4-guest', '1'); } catch {} };
  try { A.guest = sessionStorage.getItem('quantivo-v4-guest') === '1'; } catch {}
  A.request = async (path, method = 'GET', data) => {
    let response;
    try {
      response = await fetch(new URL(`api/${path}`, location.href), {
        method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json', 'X-Quantivo-Request': '1', ...(A.csrf ? { 'X-CSRF-Token': A.csrf } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) })
      });
    } catch { throw new Error('The account service could not be reached. Check your connection and try again.'); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      const error = new Error(typeof result?.detail === 'string' ? result.detail : 'The account service is not available on this website yet.');
      error.status = response.status;
      if (response.status === 401) { A.user = null; A.csrf = null; window.dispatchEvent(new Event('quantivo-session-ended')); }
      throw error;
    }
    return result;
  };
  A.ready = A.request('auth/me').then(data => {
    A.available = data.service === 'quantivo-v4'; A.user = data.user; A.csrf = data.csrf;
    if (A.user) A.guest = false;
    return A;
  }).catch(() => A);
  A.login = async (mode, details) => {
    if (!A.available) throw new Error('Account registration is not connected on this preview. Explore as a guest below.');
    const data = await A.request(`auth/${mode}`, 'POST', details);
    A.user = data.user; A.csrf = data.csrf; A.guest = false;
    try { sessionStorage.removeItem('quantivo-v4-guest'); } catch {}
  };
  A.logout = async () => {
    if (A.user) await A.request('auth/logout', 'POST', {});
    A.user = null; A.csrf = null; A.guest = false;
    try { sessionStorage.removeItem('quantivo-v4-guest'); } catch {}
  };
})();
