import { firebaseConfig, PLAY_URL } from './firebase-config.js';

const $ = (id) => document.getElementById(id);
const DEMO = !firebaseConfig.apiKey;
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

let allPrompts = [];
let typeFilter = '';
let fb = null; // { auth, db, ... } when configured

const SAMPLES = [
  { id: 's1', title: 'Diya on a rainy window', type: 'video', category: 'Festivals', tags: ['diwali', 'loop'], previewUrl: '',
    promptText: 'Slow steady shot of a diya flickering on a rainy window ledge at dusk, warm golden light, soft focus, vertical 9:16.' },
  { id: 's2', title: 'Golden hour rooftop portrait', type: 'image', category: 'Portraits', tags: ['saree', 'goldenhour'], previewUrl: '',
    promptText: 'Golden-hour portrait on a quiet rooftop, deep red saree, soft warm light, shallow depth of field, 4:5 vertical.' },
  { id: 's3', title: 'Retro 90s family photo', type: 'image', category: 'Retro', tags: ['film', 'nostalgia'], previewUrl: '',
    promptText: 'Retro 90s-style family photo on a verandah, film grain, warm faded colours, soft flash.' },
];

for (const id of ['topPlay', 'heroPlay', 'bannerPlay']) $(id).href = PLAY_URL;

let loadNote = '';
function parsePrompt(id, d) {
  if (!d) return null;
  const s = (v) => (typeof v === 'string' && v.trim() ? v : null);
  const title = s(d.title), promptText = s(d.promptText), category = s(d.category);
  const type = d.type === 'image' || d.type === 'video' ? d.type : null;
  if (!title || !promptText || !category || !type) return null;
  return { id, title, promptText, type, category,
    tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : [],
    previewUrl: typeof d.previewUrl === 'string' && d.previewUrl.startsWith('https://') ? d.previewUrl : '' };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function copyText(t, btn) {
  try { await navigator.clipboard.writeText(t); }
  catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = o), 1500); }
}

function openDetail(p) {
  const sh = $('sheet'); sh.replaceChildren();
  const pv = el('div', 'pv'); if (p.previewUrl) pv.style.backgroundImage = `url("${p.previewUrl}")`;
  sh.append(pv, el('h3', null, p.title), el('div', 'cat', p.category), el('strong', null, 'Full Prompt'));
  sh.append(el('pre', null, p.promptText));
  const row = el('div', 'btns');
  const cp = el('button', 'btn primary', 'Copy Prompt'); cp.style.flex = '2'; cp.onclick = () => copyText(p.promptText, cp);
  const cl = el('button', 'btn outline', 'Close'); cl.style.flex = '1'; cl.onclick = closeDetail;
  row.append(cl, cp); sh.append(row);
  $('modal').classList.remove('hidden');
}
function closeDetail() { $('modal').classList.add('hidden'); }
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeDetail(); });

function render() {
  const q = $('q').value.trim().toLowerCase();
  const list = allPrompts.filter((p) => (!typeFilter || p.type === typeFilter) &&
    (!q || [p.title, p.category, ...p.tags].some((x) => x.toLowerCase().includes(q))));
  const g = $('grid'); g.replaceChildren();
  $('empty').classList.toggle('hidden', list.length > 0);
  $('empty').textContent = 'No prompts yet.' + (!allPrompts.length && loadNote ? ' (' + loadNote + ')' : '');
  for (const p of list) {
    const c = el('div', 'card');
    const pv = el('div', 'pv'); if (p.previewUrl) pv.style.backgroundImage = `url("${p.previewUrl}")`;
    pv.append(el('span', 't', p.type)); pv.onclick = () => openDetail(p);
    const bd = el('div', 'bd');
    const h = el('h3', null, p.title); h.onclick = () => openDetail(p);
    bd.append(h, el('div', 'cat', p.category));
    if (p.tags.length) bd.append(el('div', 'tags', p.tags.map((t) => '#' + t).join(' ')));
    const act = el('div', 'act'); const b = el('button', 'btn primary block', 'Copy Prompt'); b.onclick = () => copyText(p.promptText, b);
    act.append(b); bd.append(act); c.append(pv, bd); g.append(c);
  }
}

function showSignedIn(user) {
  $('signedOut').classList.add('hidden'); $('signedIn').classList.remove('hidden');
  $('userBox').classList.remove('hidden'); $('topPlay').classList.add('hidden');
  if (user && user.photoURL) $('avatar').src = user.photoURL; else $('avatar').classList.add('hidden');
  render();
}
function showSignedOut() {
  $('signedIn').classList.add('hidden'); $('signedOut').classList.remove('hidden'); $('userBox').classList.add('hidden'); $('topPlay').classList.remove('hidden');
}
function showError(m) { const e = $('err'); e.textContent = m; e.classList.toggle('hidden', !m); }

$('q').addEventListener('input', render);
for (const b of document.querySelectorAll('.chip')) b.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on');
  typeFilter = b.dataset.type; render();
});

async function initFirebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig);
  fb = { A, F, auth: A.getAuth(app), db: F.getFirestore(app) };

  async function ensureUserDoc(u) {
    // Mirrors the Android app: one /users/{uid} document, created once, only for verified emails.
    if (!u.emailVerified) return;
    const ref = F.doc(fb.db, 'users', u.uid);
    try {
      const snap = await F.getDoc(ref);
      if (snap.exists()) return;
      const data = {
        displayName: (u.displayName || 'NovaPrompt user').trim().slice(0, 80) || 'NovaPrompt user',
        email: u.email, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(),
      };
      if (u.photoURL && u.photoURL.length <= 2048) data.photoURL = u.photoURL;
      await F.setDoc(ref, data);
    } catch (e) { console.warn('user doc', e.code || e); }
  }
  async function loadPrompts() {
    const q = F.query(F.collection(fb.db, 'prompts'), F.where('published', '==', true),
      F.orderBy('createdAt', 'desc'), F.limit(50));
    const snap = await F.getDocs(q);
    allPrompts = snap.docs.map((d) => parsePrompt(d.id, d.data())).filter(Boolean);
    loadNote = 'Server returned ' + snap.size + ' published prompt(s), ' + allPrompts.length + ' usable.';
  }

  $('signIn').onclick = async () => {
    showError('');
    try { await A.signInWithPopup(fb.auth, new A.GoogleAuthProvider()); }
    catch (e) { showError(e.code === 'auth/popup-closed-by-user' ? '' : 'Sign-in failed. Please try again.'); }
  };
  $('signOut').onclick = () => A.signOut(fb.auth);
  A.onAuthStateChanged(fb.auth, async (u) => {
    if (!u) { showSignedOut(); return; }
    await ensureUserDoc(u);
    try { await loadPrompts(); } catch (e) { console.warn('prompts', e.code || e); allPrompts = []; loadNote = 'Could not load prompts: ' + (e.code || e.message || e); }
    showSignedIn(u);
  });
}

if (DEMO) {
  allPrompts = SAMPLES;
  const preview = location.hash === '#preview';
  if (preview) {
    $('demoBadge').classList.remove('hidden');
    $('signIn').onclick = () => showSignedIn(null);
    $('signOut').onclick = showSignedOut;
  } else {
    // Public interim mode: sign-up is not switched on yet, so show the app download and a few sample prompts only.
    $('signupPart').classList.add('hidden');
    $('getAppTitle').classList.remove('hidden'); $('getAppText').classList.remove('hidden');
    $('signedIn').classList.remove('hidden'); $('signedIn').insertAdjacentElement('afterbegin', el('h2', 'section-title', 'A taste of the prompts'));
    render();
  }
} else {
  initFirebase().catch((e) => { console.error(e); showError('Could not start sign-in. Please try again later.'); });
}
