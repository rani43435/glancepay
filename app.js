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

const state = {
  screen: 'home',
  pending: null,     // { merchant, amount, currency, item }
  history: [],
  stream: null,
  scanTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- navigation between screens ----------
function show(name) {
  if (state.screen === 'scan' && name !== 'scan') stopCamera();
  state.screen = name;
  $$('[data-screen]').forEach((s) => { s.hidden = s.id !== name; });
  const first = $('#' + name + ' .btn');
  if (first) first.focus();
  if (name === 'scan') startCamera();
  if (name === 'history') renderHistory();
}

function back() {
  const map = { scan: 'home', history: 'home', confirm: 'cancelled', done: 'home', cancelled: 'home' };
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
  $('#cItem').textContent = payment.item;
  show('confirm');
}

// ---------- camera + QR scanning ----------
async function startCamera() {
  const msg = $('#camMsg');
  const video = $('#cam');
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
    msg.hidden = true;
    scanLoop();
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
      $('#camMsg').hidden = false;
      $('#camMsg').textContent = 'That is not a pay code';
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
    state.history.unshift({ ...p, at: new Date() });
    $('#doneText').textContent = money(p.amount, p.currency) + ' to ' + p.merchant;
    state.pending = null;
    show('done');
  }, 1400);
}

function cancel() {
  state.pending = null;
  show('cancelled');
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
  state.history.forEach((h) => {
    const li = document.createElement('li');
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = h.merchant;
    b.textContent = money(h.amount, h.currency);
    li.append(a, b);
    ul.appendChild(li);
  });
}

// ---------- input ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  if (btn.dataset.go) show(btn.dataset.go);
  const action = btn.dataset.action;
  if (action === 'demo') openConfirm(parseCode(DEMO_CODE));
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

show('home');
