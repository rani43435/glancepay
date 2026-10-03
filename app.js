// Glance Pay — prototype web app for Meta Ray-Ban Display.
// NOTE: payments are simulated. No real money moves.
//
// Input: the glasses' Neural Band navigation reaches web apps as focus
// navigation; in a desktop browser use Arrow keys to move and Enter to press.
// Escape / Backspace = back.
//
// Two kinds of QR codes (QR text):
//   Pay a shop:        glancepay:pay?m=<merchant>&a=<amount>&c=<currency>&i=<item>
//   Receive from a friend (they show it on their phone):
//                      glancepay:send?f=<from>&a=<amount>&c=<currency>&n=<note>
// The glasses display is private, so the wearer always scans; the other
// person always shows the code.

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
  const map = { scan: 'home', history: 'home', confirm: 'cancelled', done: 'home', cancelled: 'home', received: 'home' };
  if (state.screen === 'confirm') { cancel(); return; }
  if (state.screen === 'accept') { decline(); return; }
  if (map[state.screen]) show(map[state.screen]);
}

// ---------- pay code parsing ----------
function parseCode(text) {
  try {
    const m = /^glancepay:(pay|send)\?(.*)$/.exec(text);
    if (!m) return null;
    const p = new URLSearchParams(m[2]);
    const amount = parseFloat(p.get('a'));
    if (!isFinite(amount) || amount <= 0) return null;
    const currency = p.get('c') || 'EUR';
    if (m[1] === 'pay') {
      if (!p.get('m')) return null;
      return { type: 'pay', merchant: p.get('m'), amount, currency, item: p.get('i') || '' };
    }
    if (!p.get('f')) return null;
    return { type: 'send', from: p.get('f'), amount, currency, note: p.get('n') || '' };
  } catch (e) {
    return null;
  }
}

function money(amount, currency) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

function openCode(code) {
  if (code.type === 'send') openAccept(code);
  else openConfirm(code);
}

function openAccept(transfer) {
  state.pending = transfer;
  $('#aFrom').textContent = transfer.from + ' sends you';
  $('#aAmount').textContent = '+' + money(transfer.amount, transfer.currency);
  $('#aNote').textContent = transfer.note;
  show('accept');
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
      const code = parseCode(found.data);
      if (code) { openCode(code); return; }
      $('#camMsg').hidden = false;
      $('#camMsg').textContent = 'Not a Glance Pay code';
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

function accept() {
  const t = state.pending;
  if (!t) return;
  state.history.unshift({ merchant: t.from, amount: t.amount, currency: t.currency, incoming: true, at: new Date() });
  $('#receivedText').textContent = '+' + money(t.amount, t.currency) + ' from ' + t.from;
  state.pending = null;
  show('received');
}

function decline() {
  state.pending = null;
  show('home');
}

function renderHistory() {
  const ul = $('#historyList');
  ul.innerHTML = '';
  if (!state.history.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing yet';
    ul.appendChild(li);
    return;
  }
  state.history.forEach((h) => {
    const li = document.createElement('li');
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = h.merchant;
    b.textContent = (h.incoming ? '+' : '−') + money(h.amount, h.currency);
    if (h.incoming) b.className = 'in';
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
  if (action === 'pay') pay();
  if (action === 'cancel') cancel();
  if (action === 'accept') accept();
  if (action === 'decline') decline();
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
