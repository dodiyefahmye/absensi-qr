// Titik masuk aplikasi: inisialisasi Supabase, router hash, dan layout.
import { initSupabase, isConfigured, sb, state, setSession, getProfile, auth } from './lib/api.js';
import { h, toast, modal, errMsg, navigate } from './lib/ui.js';

const routes = [
  { path: '/login', load: () => import('./pages/login.js'), public: true, bare: true },
  { path: '/f/:token', load: () => import('./pages/public-form.js'), public: true, bare: true },
  { path: '/t/:token', load: () => import('./pages/ticket.js'), public: true, bare: true },
  { path: '/join/:code', load: () => import('./pages/join.js') },
  { path: '/event/:id/scan', load: () => import('./pages/scanner.js'), bare: true },
  { path: '/event/:id/display', load: () => import('./pages/display.js'), bare: true },
  { path: '/event/:id/report', load: () => import('./pages/report.js') },
  { path: '/event/:id/monitor', load: () => import('./pages/monitor.js'), bare: true },
  { path: '/event/:id', load: () => import('./pages/editor.js') },
  { path: '/', load: () => import('./pages/dashboard.js') },
];

const app = document.getElementById('app');
let cleanup = null;
let renderSeq = 0;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    const rp = r.path.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

function topbar() {
  const name = state.profile?.full_name || state.user?.email || '';
  const dark = document.documentElement.dataset.theme === 'dark';
  const toggle = h('button', { class: 'btn ghost icon', title: 'Mode gelap/terang', 'aria-label': 'Ganti tema', onclick: () => {
    const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = d === 'dark' ? 'dark' : '';
    localStorage.setItem('ui-theme', d);
    toggle.textContent = d === 'dark' ? '☀️' : '🌙';
  } }, dark ? '☀️' : '🌙');
  return h('header', { class: 'topbar no-print' },
    h('div', { class: 'container' },
      h('a', { class: 'brand', href: '#/' }, h('img', { src: 'assets/icon.svg', alt: '' }), (window.APP_CONFIG?.APP_NAME || 'Absensi QR')),
      h('span', { class: 'spacer' }),
      h('span', { class: 'small muted hide-sm' }, name),
      toggle,
      h('button', { class: 'btn sm', onclick: async () => { await auth.signOut(); navigate('/login'); } }, 'Keluar')));
}

async function render() {
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  const m = match(path);
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }

  if (!m) { navigate('/'); return; }
  const { route, params } = m;

  if (!route.public && !state.user) {
    navigate('/login?next=' + encodeURIComponent(location.hash.slice(1)));
    return;
  }
  if (route.path === '/login' && state.user) { navigate(query.next || '/'); return; }

  document.title = window.APP_CONFIG?.APP_NAME || 'Absensi QR';
  const main = h('main');
  app.replaceChildren(...(route.bare ? [main] : [topbar(), main]));
  main.appendChild(h('div', { class: 'boot' }, h('div', { class: 'spinner' })));

  try {
    const mod = await route.load();
    if (seq !== renderSeq) return;
    main.replaceChildren();
    const c = await mod.default(main, { params, query });
    if (seq !== renderSeq) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'container narrow' }, h('div', { class: 'card center' },
      h('h2', null, 'Terjadi kesalahan'), h('p', { class: 'muted' }, errMsg(e)),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', onclick: () => render() }, 'Coba lagi'),
        h('a', { class: 'btn primary', href: '#/' }, 'Ke beranda')))));
  }
}

function setupScreen() {
  app.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'card auth-card', style: { maxWidth: '640px' } },
    h('img', { class: 'logo', src: 'assets/icon.svg', alt: '' }),
    h('h2', { class: 'center' }, 'Konfigurasi belum diisi'),
    h('p', { class: 'muted center' }, 'Aplikasi belum terhubung ke Supabase.'),
    h('ol', null,
      h('li', null, 'Buat project gratis di supabase.com.'),
      h('li', null, 'Buka SQL Editor, tempel isi file supabase/schema.sql, lalu Run.'),
      h('li', null, 'Salin Project URL & anon/publishable key dari Project Settings → API.'),
      h('li', null, 'Isi ke file config.js, atau simpan sebagai GitHub Secrets SUPABASE_URL & SUPABASE_ANON_KEY.')),
    h('p', { class: 'small muted' }, 'Panduan lengkap ada di README.md.'))));
}

function passwordRecoveryModal() {
  const pw = h('input', { type: 'password', placeholder: 'Minimal 6 karakter', autocomplete: 'new-password' });
  modal({
    title: 'Atur password baru',
    body: h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Password baru'), pw),
    actions: [{ label: 'Simpan', class: 'primary', onClick: async () => {
      if (pw.value.length < 6) { toast('Password minimal 6 karakter', 'err'); return false; }
      await auth.updatePassword(pw.value);
      toast('Password berhasil diubah', 'ok');
    } }],
  });
}

async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      // muat ulang sekali saat versi baru aplikasi aktif
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return; // jangan reload pada kunjungan pertama
        reloaded = true;
        location.reload();
      });
    }).catch(() => {});
  }
  if (!isConfigured()) return setupScreen();

  try {
    await initSupabase();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'container narrow' }, h('div', { class: 'card center', style: { marginTop: '10vh' } },
      h('h2', null, 'Tidak dapat memuat aplikasi'), h('p', { class: 'muted' }, errMsg(e)),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Muat ulang'))));
    return;
  }

  // bersihkan ?code= dari URL setelah login via email (PKCE)
  if (location.search && /[?&](code|error)=/.test(location.search)) {
    history.replaceState(null, '', location.pathname + (location.hash || '#/'));
  }

  if (state.user) getProfile().catch(() => {});

  sb.auth.onAuthStateChange((event, session) => {
    const had = !!state.user;
    setSession(session);
    if (event === 'PASSWORD_RECOVERY') { passwordRecoveryModal(); return; }
    if (event === 'SIGNED_IN' && !had) { getProfile().catch(() => {}); render(); }
    if (event === 'SIGNED_OUT') render();
  });

  window.addEventListener('hashchange', render);
  render();
}

boot();
