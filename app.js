// Glance Pay — prototype web app for Meta Ray-Ban Display.
// NOTE: payments are simulated. No real money moves.
//
// Input: the glasses' Neural Band navigation reaches web apps as focus
// navigation; in a desktop browser use Arrow keys to move and Enter to press.
// Escape / Backspace = back.
//
// Pay code format (QR text):  glancepay:pay?m=<merchant>&a=<amount>&c=<currency>&i=<item>
// Example: glancepay:pay?m=Demo%20Caf%C3%A9&a=3.80&c=EUR&i=Flat%20white

const DEMO_CODE = 'glancepay:pay?m=Demo%20Caf%C3%A9&a=3.80&c=EUR&i=Flat%20white';

// Cards (examples, not real). Each card has its own two colours, read
// from the physical card by the camera when it is added.
const CARDS = [
  { name: 'Visa', last: '42', bg: '#1F4FD1', fg: '#FFFFFF' },
  { name: 'Mastercard', last: '17', bg: '#F2994A', fg: '#1A1A1A' },
];
const cardLabel = (c) => c.name + (c.last ? ' •• ' + c.last : '');

const state = {
  screen: 'home',
  card: 0,
  pending: null,     // { merchant, amount, currency, item }
  history: [],
  stream: null,
  scanTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- navigation between screens ----------
function show(name) {
  if (['scan', 'addcard'].includes(state.screen) && name !== state.screen) stopCamera();
  state.screen = name;
  $$('[data-screen]').forEach((s) => { s.hidden = s.id !== name; });
  const first = $('#' + name + ' [data-autofocus]') || $('#' + name + ' .btn');
  if (first) first.focus();
  if (name === 'scan') startCamera($('#camMsg'), 'Starting camera…');
  if (name === 'addcard') startCamera($('#addMsg'), 'Hold your card in the frame');
  if (name === 'history') renderHistory();
  if (name === 'editcard') openEdit();
}

// ---------- browser history ----------
// Every screen is a history entry, so the glasses' own Back works.
// Going Home unwinds back to the first entry; result screens (Paid,
// Cancelled) replace the screen before them so Back never re-opens a payment.
let depth = 0;
const REPLACE = ['done', 'cancelled'];

function go(name) {
  if (name === state.screen) return;
  if (name === 'home') {
    if (depth > 0) { history.go(-depth); return; } // popstate shows home
    history.replaceState({ screen: 'home', depth: 0 }, '', location.pathname);
  } else if (REPLACE.includes(name)) {
    history.replaceState({ screen: name, depth }, '', '#' + name);
  } else {
    depth++;
    history.pushState({ screen: name, depth }, '', '#' + name);
  }
  show(name);
}

window.addEventListener('popstate', (e) => {
  const s = e.state || { screen: 'home', depth: 0 };
  depth = s.depth || 0;
  if (state.screen === 'confirm') state.pending = null;
  show(s.screen);
});

function back() {
  if (depth > 0) history.back();
}

// ---------- pay code parsing ----------
function parseCode(text) {
  try {
    if (!text.startsWith('glancepay:pay?')) return null;
    const p = new URLSearchParams(text.slice('glancepay:pay?'.length));
    const amount = parseFloat(p.get('a'));
    if (!p.get('m') || !isFinite(amount) || amount <= 0) return null;
    return {
      merchant: p.get('m'),
      amount,
      currency: p.get('c') || 'EUR',
      item: p.get('i') || '',
    };
  } catch (e) {
    return null;
  }
}

function money(amount, currency) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

function openConfirm(payment) {
  state.pending = payment;
  $('#cMerchant').textContent = payment.merchant;
  $('#cAmount').textContent = money(payment.amount, payment.currency);
  $('#cItem').textContent = [payment.item, cardLabel(CARDS[state.card])].filter(Boolean).join(' · ');
  go('confirm');
}

// ---------- camera + QR scanning ----------
// Optional QR on a test card:  glancepay:card?b=<brand>&l=<last two digits>
function parseCard(text) {
  const m = /^glancepay:card\?(.*)$/.exec(text);
  if (!m) return null;
  const p = new URLSearchParams(m[1]);
  const brand = p.get('b');
  const last = (p.get('l') || '').replace(/\D/g, '').slice(-2);
  if (!brand || last.length !== 2) return null;
  return { name: brand, last };
}

async function startCamera(msg, readyText) {
  const video = $('#cam');
  state.msg = msg;
  msg.textContent = 'Starting camera…';
  msg.hidden = false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.textContent = 'No camera available';
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = state.stream;
    await video.play();
    if (readyText === 'Starting camera…') msg.hidden = true;
    else msg.textContent = readyText;
    if (state.screen === 'addcard') cardLoop(); else scanLoop();
  } catch (e) {
    msg.textContent = 'Camera not available';
  }
}

function stopCamera() {
  if (state.scanTimer) { clearTimeout(state.scanTimer); state.scanTimer = null; }
  if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
}

function scanLoop() {
  const video = $('#cam');
  if (state.screen !== 'scan' || !state.stream) return;
  if (window.jsQR && video.videoWidth) {
    const canvas = scanLoop.canvas || (scanLoop.canvas = document.createElement('canvas'));
    const w = 320;
    const h = Math.round(video.videoHeight * (w / video.videoWidth));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const found = window.jsQR(img.data, w, h);
    if (found) {
      const payment = parseCode(found.data);
      if (payment) { lockOn('#scan .cam-wrap', () => openConfirm(payment)); return; }
      state.msg.hidden = false;
      state.msg.textContent = 'That is not a pay code';
    }
  }
  state.scanTimer = setTimeout(scanLoop, 250);
}

// Found something: the scan corners snap in and a check pops, then move on.
function lockOn(selector, next) {
  const wrap = $(selector);
  if (state.msg) state.msg.hidden = true;
  wrap.classList.add('locked');
  setTimeout(() => {
    wrap.classList.remove('locked');
    next();
  }, 650);
}

// ---------- pay / cancel ----------
function pay() {
  const p = state.pending;
  if (!p) return;
  state.history.unshift({ ...p, card: cardLabel(CARDS[state.card]), at: new Date() });
  save();
  $('#doneText').textContent = money(p.amount, p.currency) + ' to ' + p.merchant;
  state.pending = null;
  go('done');
}

function cancel() {
  state.pending = null;
  go('cancelled');
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderHistory() {
  const ul = $('#historyList');
  ul.innerHTML = '';
  if (!state.history.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No payments yet';
    ul.appendChild(li);
    return;
  }
  // Group payments by day (history is newest first), each with its time.
  let lastDay = null;
  state.history.forEach((h) => {
    const day = h.at.toDateString();
    if (day !== lastDay) {
      const head = document.createElement('li');
      head.className = 'day';
      head.textContent = dayLabel(h.at);
      ul.appendChild(head);
      lastDay = day;
    }
    const li = document.createElement('li');
    const left = document.createElement('span');
    const name = document.createElement('span');
    const time = document.createElement('span');
    const amt = document.createElement('span');
    left.className = 'who';
    name.textContent = h.merchant;
    time.className = 'time';
    time.textContent = h.at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    amt.className = 'amt';
    amt.textContent = money(h.amount, h.currency);
    left.append(name, time);
    li.append(left, amt);
    ul.appendChild(li);
  });
}

// ---------- add a card: detected automatically by the camera ----------
// The card is held in the middle of the view. Each moment we compare the
// middle of the frame with the edges: when the middle is one clear colour
// that differs from the background, and stays that way for about a second,
// the card is taken. A test-card QR is taken straight away.
function grabFrame() {
  const video = $('#cam');
  const canvas = grabFrame.canvas || (grabFrame.canvas = document.createElement('canvas'));
  const w = 320;
  const h = Math.round(video.videoHeight * (w / video.videoWidth));
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  return { ctx, w, h };
}

function cardLoop() {
  const video = $('#cam');
  if (state.screen !== 'addcard' || !state.stream) return;
  if (video.videoWidth) {
    const f = grabFrame();
    const { ctx, w, h } = f;

    let info = null;
    if (window.jsQR) {
      const found = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
      if (found) info = parseCard(found.data);
    }
    if (info) { lockOn('#addcard .cam-wrap', () => takeCard(f, info)); return; }

    const cw = Math.round(w * 0.6), ch = Math.round(h * 0.4);
    const centre = mainColors(ctx.getImageData(Math.round((w - cw) / 2), Math.round((h - ch) / 2), cw, ch).data);
    const edge = mainColors(ctx.getImageData(0, 0, w, Math.round(h * 0.15)).data);
    const looksLikeCard = centre.share >= 0.35 && colorDist(centre.bgRgb, edge.bgRgb) > 60;

    if (looksLikeCard && state.candidate && colorDist(centre.bgRgb, state.candidate) < 40) {
      state.steady++;
    } else {
      state.steady = looksLikeCard ? 1 : 0;
    }
    state.candidate = looksLikeCard ? centre.bgRgb : null;
    state.msg.textContent = state.steady > 0 ? 'Hold still…' : 'Hold your card in the frame';
    if (state.steady >= 4) { lockOn('#addcard .cam-wrap', () => takeCard(f, null)); return; }
  }
  state.scanTimer = setTimeout(cardLoop, 250);
}

function takeCard({ ctx, w, h }, info) {
  state.steady = 0;
  state.candidate = null;
  // Centre area, card-shaped (about 60% x 40% of the frame)
  const cw = Math.round(w * 0.6), ch = Math.round(h * 0.4);
  const colors = mainColors(ctx.getImageData(Math.round((w - cw) / 2), Math.round((h - ch) / 2), cw, ch).data);
  state.newCard = {
    name: info ? info.name : 'Card ' + (CARDS.length + 1),
    last: info ? info.last : '',
    bg: colors.bg,
    fg: colors.fg,
  };
  paintCard($('#previewCard'), state.newCard);
  $('#newCardName').value = state.newCard.name;
  go('cardpreview');
}

const colorDist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

// Most common colour = card background; the next clearly different common
// colour = print colour. Falls back to white/black for readable text.
function mainColors(data) {
  const buckets = new Map();
  let total = 0;
  for (let i = 0; i < data.length; i += 4 * 3) { // every 3rd pixel
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
    total++;
  }
  const list = [...buckets.values()]
    .map((e) => ({ n: e.n, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }))
    .sort((a, b) => b.n - a.n);
  const first = list[0];
  const second = list.find((c) => c.n >= total * 0.04 && colorDist(c, first) > 90);
  const lum = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const fg = second || (lum(first) > 0.55 ? { r: 20, g: 20, b: 20 } : { r: 255, g: 255, b: 255 });
  return { bg: hex(first), fg: hex(fg), bgRgb: first, share: first.n / total };
}

function confirmAddCard() {
  const card = state.newCard;
  if (!card) return;
  card.name = cleanName($('#newCardName').value) || card.name;
  CARDS.push(card);
  state.card = CARDS.length - 1;
  state.newCard = null;
  save();
  renderCard();
  go('home');
}

const cleanName = (v) => v.replace(/\s+/g, ' ').trim().slice(0, 20);

// ---------- edit / delete the chosen card ----------
function openEdit() {
  const c = CARDS[state.card];
  paintCard($('#editPreview'), c);
  $('#editCardName').value = c.name;
  // Keep at least one card
  $('#deleteBtn').disabled = CARDS.length <= 1;
}

function saveCard() {
  const name = cleanName($('#editCardName').value);
  if (name) CARDS[state.card].name = name;
  save();
  renderCard();
  go('home');
}

function deleteCard() {
  if (CARDS.length <= 1) return;
  CARDS.splice(state.card, 1);
  state.card = Math.min(state.card, CARDS.length - 1);
  save();
  renderCard();
  go('home');
}

function switchCard() {
  state.card = (state.card + 1) % CARDS.length;
  renderCard();
  save();
}

function paintCard(el, c) {
  el.style.setProperty('--card-bg', c.bg);
  el.style.setProperty('--card-fg', c.fg);
  el.querySelector('.card-brand').textContent = c.name;
  el.querySelector('.card-name').textContent = c.last ? '•• ' + c.last : '';
}

function renderCard() {
  paintCard($('.card-btn'), CARDS[state.card]);
}

// ---------- input ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  if (btn.dataset.go) go(btn.dataset.go);
  const action = btn.dataset.action;
  if (action === 'demo') openConfirm(parseCode(DEMO_CODE));
  if (action === 'switchCard') switchCard();
  if (action === 'addCard') confirmAddCard();
  if (action === 'saveCard') saveCard();
  if (action === 'deleteCard') deleteCard();
  if (action === 'pay') pay();
  if (action === 'cancel') cancel();
});

// Arrow keys move focus between the buttons on the current screen
// (spatial navigation fallback for desktop testing).
document.addEventListener('keydown', (e) => {
  const buttons = $$('#' + state.screen + ' .btn:not(:disabled), #' + state.screen + ' input');
  if (!buttons.length) return;
  const i = buttons.indexOf(document.activeElement);
  // While typing a name: Left/Right/Backspace edit the text; Up/Down/Enter move on.
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      buttons[(i + 1) % buttons.length].focus();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      buttons[(i - 1 + buttons.length) % buttons.length].focus();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      back();
      e.preventDefault();
    }
    return;
  }
  if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
    buttons[(i + 1 + buttons.length) % buttons.length].focus();
    e.preventDefault();
  } else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
    buttons[(i - 1 + buttons.length) % buttons.length].focus();
    e.preventDefault();
  } else if (e.key === 'Escape' || e.key === 'Backspace') {
    back();
    e.preventDefault();
  }
});

// ---------- saving ----------
// Cards, the chosen card and history are kept on this device, so they
// survive a refresh. Storage can be blocked (private mode etc.), so every
// read and write is wrapped and the app still works without it.
const STORE_KEY = 'glancepay.v1';

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      cards: CARDS,
      card: state.card,
      history: state.history.map((h) => ({ ...h, at: h.at.toISOString() })),
    }));
  } catch (e) { /* storage unavailable: keep working in memory */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
    const cards = (Array.isArray(data.cards) ? data.cards : []).filter((c) =>
      c && typeof c.name === 'string' && typeof c.last === 'string' && isColor(c.bg) && isColor(c.fg));
    if (cards.length) CARDS.splice(0, CARDS.length, ...cards);
    state.card = Number.isInteger(data.card) && data.card >= 0 && data.card < CARDS.length ? data.card : 0;
    state.history = (Array.isArray(data.history) ? data.history : [])
      .filter((h) => h && typeof h.merchant === 'string' && isFinite(h.amount))
      .map((h) => ({ ...h, at: new Date(h.at) }))
      .filter((h) => !isNaN(h.at));
  } catch (e) { /* bad or missing data: start fresh */ }
}

// Card previews follow the name as it is typed
$('#newCardName').addEventListener('input', (e) => {
  $('#previewCard .card-brand').textContent = cleanName(e.target.value) || 'Card';
});
$('#editCardName').addEventListener('input', (e) => {
  $('#editPreview .card-brand').textContent = cleanName(e.target.value) || 'Card';
});

load();
renderCard();
// Always start on Home (a reload on a deeper screen starts fresh)
history.replaceState({ screen: 'home', depth: 0 }, '', location.pathname);
show('home');
