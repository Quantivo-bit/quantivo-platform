(() => {
  'use strict';
  const A = window.QuantivoAuth, Q = window.Quantivo, $ = id => document.getElementById(id);
  const modal = $('auth-dialog');
  let nextView = A.view(new URLSearchParams(location.search).get('view'));
  const nextURL = () => `workspace.html?view=${nextView}`;
  function updateHeader() {
    document.querySelector('.auth-actions').innerHTML = A.user
      ? `<a class="button small primary" href="workspace.html">My workspace ↗</a><button class="signin-link" data-auth="signout">Sign out</button>`
      : '<button class="signin-link" data-auth="signin">Sign in</button><button class="button small primary" data-auth="register">Register ↗</button>';
  }
  function select(mode) {
    const register = mode !== 'signin';
    $('auth-register-panel').hidden = !register; $('auth-signin-panel').hidden = register;
    modal.setAttribute('aria-labelledby', register ? 'auth-title' : 'signin-title');
    document.querySelectorAll('.auth-tabs [data-auth-tab]').forEach(t => {
      const active = t.dataset.authTab === (register ? 'register' : 'signin');
      t.classList.toggle('active', active); t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1;
    });
    $('register-error').textContent = ''; $('signin-error').textContent = '';
  }
  function serviceStatus() {
    const el = $('auth-service'); el.classList.toggle('offline', !A.available);
    el.textContent = A.available ? 'Your account saves your paper journal and watchlist across devices.' : 'You are viewing the website preview. Accounts are not connected here yet. You can explore every demo tool as a guest.';
    for (const form of [$('register-form'), $('signin-form')]) for (const input of form.elements) input.disabled = !A.available;
    $('auth-footnote').textContent = A.available ? 'Research and simulation only. No payment or broker access. Email verification and password recovery are not available in this beta.' : 'Guest activity stays in this browser. A guest workspace is not a registered account.';
  }
  async function open(mode) {
    select(mode); if (!modal.open) modal.showModal();
    $('auth-service').textContent = 'Checking account availability…';
    await A.ready; serviceStatus();
    if (A.user) { location.href = nextURL(); return; }
    (A.available ? $(`${mode === 'signin' ? 'signin-email' : 'register-name'}`) : $('guest-entry')).focus();
  }
  document.addEventListener('click', async e => {
    const button = e.target.closest('[data-auth]');
    if (button) {
      e.preventDefault();
      if (button.dataset.auth === 'signout') {
        button.disabled = true;
        try { await A.logout(); updateHeader(); } catch (error) { button.textContent = 'Retry sign out'; button.title = error.message; button.disabled = false; }
      } else open(button.dataset.auth);
      return;
    }
    const tab = e.target.closest('[data-auth-tab]');
    if (tab) { e.preventDefault(); select(tab.dataset.authTab); return; }
    if (e.target.closest('[data-close-auth]')) { modal.close(); return; }
    const link = e.target.closest('a[href]');
    if (link && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const target = new URL(link.href);
      if (target.origin === location.origin && target.pathname.endsWith('/workspace.html') && !A.user && !A.guest) {
        e.preventDefault(); nextView = A.view(target.searchParams.get('view')); open('register');
      }
    }
  });
  $('guest-entry').addEventListener('click', () => { A.enterGuest(); location.href = `${nextURL()}&guest=1`; });
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  document.querySelectorAll('.auth-tabs [role=tab]').forEach(t => t.addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
      e.preventDefault(); const mode = e.key === 'Home' ? 'register' : e.key === 'End' ? 'signin' : (t.dataset.authTab === 'register' ? 'signin' : 'register');
      select(mode); $(`auth-${mode}-tab`).focus();
    }
  }));
  for (const mode of ['register', 'signin']) {
    const form = $(`${mode}-form`);
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type=submit]'), label = submit.textContent;
      const error = $(`${mode}-error`); error.textContent = ''; submit.disabled = true; submit.textContent = mode === 'register' ? 'Creating workspace…' : 'Signing in…';
      try {
        await A.ready;
        const details = {email: $(`${mode}-email`).value.trim(), password: $(`${mode}-password`).value};
        if (mode === 'register') Object.assign(details, {name: $('register-name').value.trim(), consent: $('register-consent').checked});
        await A.login(mode === 'register' ? 'register' : 'login', details);
        form.reset(); location.href = nextURL();
      } catch (err) { error.textContent = err.message; } finally { submit.disabled = false; submit.textContent = label; }
    });
  }
  document.querySelectorAll('.nav-dropdown').forEach(drop => {
    const trigger = drop.querySelector('.nav-trigger'), links = [...drop.querySelectorAll('.nav-menu a')];
    trigger.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); if (!drop.classList.contains('open')) trigger.click(); links[0]?.focus(); } });
    drop.addEventListener('keydown', e => {
      if (e.key === 'Escape') { trigger.focus(); return; }
      if (['ArrowDown','ArrowUp','Home','End'].includes(e.key) && links.includes(document.activeElement)) {
        e.preventDefault(); e.stopPropagation(); const i = links.indexOf(document.activeElement), n = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links[n].focus();
      }
    });
    drop.addEventListener('focusout', () => setTimeout(() => { if (!drop.contains(document.activeElement)) { drop.classList.remove('open'); trigger.setAttribute('aria-expanded','false'); } }, 0));
  });
  A.ready.then(() => { updateHeader(); const mode = new URLSearchParams(location.search).get('auth'); if (['register','signin'].includes(mode)) open(mode); });
})();
