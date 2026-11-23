import { auth, setSession, getProfile } from '../lib/api.js';
import { h, toast, errMsg, navigate } from '../lib/ui.js';

export default function login(root, { query }) {
  let mode = 'login'; // login | register | magic | reset
  const name = h('input', { type: 'text', placeholder: 'Nama lengkap', autocomplete: 'name' });
  const email = h('input', { type: 'email', placeholder: 'nama@email.com', autocomplete: 'email', required: true });
  const pw = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const submit = h('button', { class: 'btn primary block lg', type: 'submit' });
  const title = h('h2', { class: 'center' });
  const sub = h('p', { class: 'muted center small' });
  const nameRow = h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Nama'), name);
  const pwRow = h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Password'), pw);
  const links = h('div', { class: 'stack center small', style: { marginTop: '1rem' } });

  const link = (label, m) => h('a', { href: 'javascript:void 0', onclick: () => { mode = m; sync(); } }, label);

  function sync() {
    const cfg = {
      login: ['Masuk', 'Masuk untuk mengelola acara & absensi', 'Masuk'],
      register: ['Daftar akun', 'Buat akun panitia baru', 'Daftar'],
      magic: ['Masuk tanpa password', 'Kami kirim link masuk ke email Anda', 'Kirim link'],
      reset: ['Lupa password', 'Kami kirim link untuk mengatur ulang password', 'Kirim link reset'],
    }[mode];
    title.textContent = cfg[0]; sub.textContent = cfg[1]; submit.textContent = cfg[2];
    nameRow.classList.toggle('hidden', mode !== 'register');
    pwRow.classList.toggle('hidden', mode === 'magic' || mode === 'reset');
    pw.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    links.replaceChildren(
      mode !== 'login' ? h('div', null, 'Sudah punya akun? ', link('Masuk', 'login')) : null,
      mode !== 'register' ? h('div', null, 'Belum punya akun? ', link('Daftar', 'register')) : null,
      mode === 'login' ? h('div', null, link('Masuk dengan link email', 'magic'), ' · ', link('Lupa password?', 'reset')) : null,
    );
  }

  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const em = email.value.trim();
    if (!em) return toast('Email wajib diisi', 'err');
    submit.disabled = true;
    try {
      if (mode === 'login') {
        const data = await auth.signIn(em, pw.value);
        setSession(data.session);
        await getProfile().catch(() => {});
        navigate(query.next || '/');
      } else if (mode === 'register') {
        if (pw.value.length < 6) throw new Error('Password minimal 6 karakter');
        const data = await auth.signUp(em, pw.value, name.value.trim());
        if (data.session) {
          setSession(data.session);
          await getProfile().catch(() => {});
          navigate(query.next || '/');
        } else {
          toast('Pendaftaran berhasil. Cek email untuk konfirmasi.', 'ok');
          mode = 'login'; sync();
        }
      } else if (mode === 'magic') {
        await auth.magicLink(em);
        toast('Link masuk sudah dikirim ke email Anda', 'ok');
      } else {
        await auth.resetPassword(em);
        toast('Link reset password sudah dikirim', 'ok');
      }
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally { submit.disabled = false; }
  } },
  nameRow,
  h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Email'), email),
  pwRow,
  submit);

  root.appendChild(h('div', { class: 'auth-wrap' }, h('div', { class: 'card auth-card' },
    h('img', { class: 'logo', src: 'assets/icon.svg', alt: '' }),
    h('div', { class: 'center small muted', style: { fontWeight: 700, marginBottom: '.25rem' } }, window.APP_CONFIG?.APP_NAME || 'Absensi QR'),
    title, sub, form, links)));
  sync();
}
