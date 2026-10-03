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
}

function back() {
  const map = { addcard: 'home', cardpreview: 'addcard', scan: 'home', history: 'home', confirm: 'cancelled', done: 'home', cancelled: 'home' };
  if (state.screen === 'confirm') { cancel(); return; }
  if (map[state.screen]) show(map[state.screen]);
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
  show('confirm');
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
      if (payment) { openConfirm(payment); return; }
      state.msg.hidden = false;
      state.msg.textContent = 'That is not a pay code';
    }
  }
  state.scanTimer = setTimeout(scanLoop, 250);
}

// ---------- pay / cancel ----------
function pay() {
  const p = state.pending;
  if (!p) return;
  $('#payingText').textContent = 'Paying ' + money(p.amount, p.currency) + '…';
  show('paying');
  setTimeout(() => {
    state.history.unshift({ ...p, card: cardLabel(CARDS[state.card]), at: new Date() });
    $('#doneText').textContent = money(p.amount, p.currency) + ' to ' + p.merchant;
    state.pending = null;
    show('done');
  }, 1400);
}

function cancel() {
  state.pending = null;
  show('cancelled');
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
    if (info) { takeCard(f, info); return; }

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
    if (state.steady >= 4) { takeCard(f, null); return; }
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
  show('cardpreview');
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
  CARDS.push(card);
  state.card = CARDS.length - 1;
  state.newCard = null;
  renderCard();
  show('home');
}

function switchCard() {
  state.card = (state.card + 1) % CARDS.length;
  renderCard();
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
  if (btn.dataset.go) show(btn.dataset.go);
  const action = btn.dataset.action;
  if (action === 'demo') openConfirm(parseCode(DEMO_CODE));
  if (action === 'switchCard') switchCard();
  if (action === 'addCard') confirmAddCard();
  if (action === 'pay') pay();
  if (action === 'cancel') cancel();
});

// Arrow keys move focus between the buttons on the current screen
// (spatial navigation fallback for desktop testing).
document.addEventListener('keydown', (e) => {
  const buttons = $$('#' + state.screen + ' .btn');
  if (!buttons.length) return;
  const i = buttons.indexOf(document.activeElement);
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

renderCard();
show('home');
