// Scene Reader — hands-free controls (plain script, loaded before app.js).
//  • Keyboard-type devices: Bluetooth presentation clickers, page-turner foot pedals,
//    camera shutter remotes in keyboard mode, a laptop keyboard.
//  • Media buttons: headset / remote play-pause, next, previous (Media Session).
//  • Remote mode: a second phone becomes a big "next line" button, connected DIRECTLY
//    to this device over WebRTC. Pairing is done by QR code — no server stores anything,
//    and only button presses and "line 4 of 20" style status are sent. Never script text.
'use strict';

/* ------------------------------------------------------------------ key map */

const HF_ACTIONS = { next: 'Next line', prev: 'Previous line', pause: 'Pause / resume' };
const HF_DEFAULT = {
  Space: 'next', Enter: 'next', ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next',
  MediaTrackNext: 'next', AudioVolumeUp: 'next',
  ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', MediaTrackPrevious: 'prev', AudioVolumeDown: 'prev',
  MediaPlayPause: 'pause', MediaPlay: 'pause', MediaPause: 'pause', Escape: 'pause', F5: 'pause', p: 'pause', k: 'pause', b: 'pause', '.': 'pause',
};
const hfKeyId = (e) => (e.key === ' ' ? 'Space' : e.key === 'Unidentified' ? 'Code:' + e.code : e.key.length === 1 ? e.key.toLowerCase() : e.key);
const hfLabel = (id) => ({ Space: 'Space bar', ArrowRight: '→ Right arrow', ArrowLeft: '← Left arrow', ArrowUp: '↑ Up arrow', ArrowDown: '↓ Down arrow',
  PageDown: 'Page Down', PageUp: 'Page Up', AudioVolumeUp: 'Volume up', AudioVolumeDown: 'Volume down', MediaTrackNext: 'Media next',
  MediaTrackPrevious: 'Media previous', MediaPlayPause: 'Media play/pause', Escape: 'Esc', 'media:nexttrack': 'Media next (remote)',
  'media:previoustrack': 'Media previous (remote)', 'media:play': 'Media play', 'media:pause': 'Media pause', 'media:seekforward': 'Media skip ahead', 'media:seekbackward': 'Media skip back', F5: 'F5 (presenter)', b: 'B (presenter blank)' }[id] || id);
function hfMap() { return { ...HF_DEFAULT, 'media:nexttrack': 'next', 'media:previoustrack': 'prev', 'media:play': 'pause', 'media:pause': 'pause', 'media:seekforward': 'next', 'media:seekbackward': 'prev', ...(settings.keymap || {}) }; }

// Do an action on the rehearsal screen (from a key, a media button, or the remote phone)
function hfAction(a) {
  if (current.view !== 'run' || !run.scene) return false;
  if (a === 'next') primary();
  else if (a === 'prev') stepTo(-1);
  else if (a === 'pause') (run.playing || run.waiting) ? pause() : play();
  else return false;
  return true;
}

let hfLast = null; // last button seen on the "press your clicker" screen
function hfInput(id, source) {
  if (current.view === 'keys') { hfLast = { id, source, at: Date.now() }; renderKeysLast(); return true; }
  const a = hfMap()[id];
  return a && a !== 'none' ? hfAction(a) : false;
}

document.addEventListener('keydown', (e) => {
  if (current.view !== 'run' && current.view !== 'keys') return;
  if (e.target.matches && e.target.matches('input, textarea, select') ) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (current.view === 'run' && e.key === 'r') return play(firstSpeakable(run.scene));
  const used = hfInput(hfKeyId(e), 'key');
  if (used || current.view === 'keys') e.preventDefault();
});

/* ------------------------------------------------------------------ media buttons (Media Session) */

let hfAudio = null;
function silentWavUrl(seconds = 10) {
  const rate = 8000, n = rate * seconds, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
// Media buttons only reach a web page while it is "playing" something, so play silence.
function hfMediaOn() {
  if (!('mediaSession' in navigator)) return;
  if (!hfAudio) { hfAudio = new Audio(silentWavUrl()); hfAudio.loop = true; }
  hfAudio.play().catch(() => {});
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Scene Reader', artist: 'Rehearsal' });
    for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekforward', 'seekbackward']) {
      navigator.mediaSession.setActionHandler(a, () => { hfInput('media:' + a, 'media'); if (hfAudio.paused) hfAudio.play().catch(() => {}); });
    }
    navigator.mediaSession.playbackState = 'playing';
  } catch {}
}
function hfMediaOff() { if (hfAudio) hfAudio.pause(); }

/* ------------------------------------------------------------------ "press your clicker" screen */

function renderKeys() {
  document.title = 'Hands-free · Scene Reader';
  const back = current.id ? `#/run/${current.id}` : '#/';
  const map = hfMap();
  const byAction = (a) => Object.entries(map).filter(([, v]) => v === a).map(([k]) => k);
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-go="${back}" aria-label="Back">${I.back}</button>
      <div class="top-title">Hands-free</div>
    </header>
    <main class="wrap keys">
      <h1 class="step-h">Clickers, pedals &amp; remotes</h1>
      <p class="hint">Pair your Bluetooth presentation clicker, page-turner pedal or shutter remote with this device first (in its Bluetooth settings). Then press its buttons here.</p>
      <div class="press-box" id="press-box" tabindex="0" aria-live="polite"><span class="pb-big">Press a button on your clicker</span><span class="pb-sub">…or any key</span></div>
      <div class="assign">
        <button class="btn" data-act="hf-assign" data-a="next"><span>Make it <strong>Next</strong></span></button>
        <button class="btn" data-act="hf-assign" data-a="prev"><span>Make it <strong>Previous</strong></span></button>
        <button class="btn" data-act="hf-assign" data-a="pause"><span>Make it <strong>Pause</strong></span></button>
        <button class="btn ghost" data-act="hf-assign" data-a="none">Ignore it</button>
      </div>
      <button class="btn ghost" data-act="hf-media"><span>Listen for media buttons too <em>(headset / remote play, next)</em></span></button>

      <h2 class="section-h">Current buttons</h2>
      <div class="panel keymap">
        ${Object.entries(HF_ACTIONS).map(([a, label]) => `<div class="km-row"><span class="km-act">${label}</span><span class="km-keys">${byAction(a).map((k) => `<span class="kchip">${esc(hfLabel(k))}<button data-act="hf-unmap" data-k="${esc(k)}" aria-label="Remove ${esc(hfLabel(k))}">×</button></span>`).join('')}</span></div>`).join('')}
        <button class="btn small ghost" data-act="hf-reset">Reset to defaults</button>
      </div>
      <p class="note">Phone volume buttons — and shutter remotes that only send “volume up” — usually can't be seen by web apps on Android. If nothing shows up above, try the remote's other button, switch the clicker to keyboard mode, or use a second phone as a remote.</p>

      <h2 class="section-h">Second phone as a remote</h2>
      <div class="panel">
        <p class="note">Use another phone as a big “next line” button. The two devices connect directly on the same Wi-Fi — nothing goes through a server, and the remote never receives your script.</p>
        <p class="rm-status" id="rm-status">${rmStatusText()}</p>
        <button class="btn primary" data-act="rm-pair">Pair a phone as remote</button>
      </div>
    </main>`;
  setTimeout(() => $('#press-box')?.focus(), 50);
  renderKeysLast();
}

function renderKeysLast() {
  const box = $('#press-box');
  if (!box) return;
  if (!hfLast) return;
  const a = hfMap()[hfLast.id];
  box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  box.innerHTML = `<span class="pb-big">${esc(hfLabel(hfLast.id))}</span><span class="pb-sub">${a && a !== 'none' ? 'does: ' + HF_ACTIONS[a] : 'not assigned yet'}</span>`;
}

function hfClick(act, btn) {
  if (act === 'hf-assign') {
    if (!hfLast) return toast('Press a button on your clicker first.');
    settings.keymap = { ...(settings.keymap || {}), [hfLast.id]: btn.dataset.a };
    saveSettings(); renderKeys();
    toast(btn.dataset.a === 'none' ? `${hfLabel(hfLast.id)} will be ignored.` : `${hfLabel(hfLast.id)} → ${HF_ACTIONS[btn.dataset.a]}`);
    return true;
  }
  if (act === 'hf-unmap') { settings.keymap = { ...(settings.keymap || {}), [btn.dataset.k]: 'none' }; saveSettings(); renderKeys(); return true; }
  if (act === 'hf-reset') { settings.keymap = {}; saveSettings(); renderKeys(); toast('Buttons reset.'); return true; }
  if (act === 'hf-media') { hfMediaOn(); toast('Listening for media buttons — press play, next or previous on your remote.'); return true; }
  if (act === 'rm-pair') { rmPairDialog(); return true; }
  if (act === 'rm-cmd') { rmSend({ t: 'cmd', a: btn.dataset.a }); navigator.vibrate?.(20); return true; }
  if (act === 'rm-close') { rmClose(); go('#/'); return true; }
  return false;
}

/* ------------------------------------------------------------------ Remote mode (WebRTC, QR pairing) */

const RM = { pc: null, dc: null, role: '', connected: false, state: null };
const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
// Shrink a connection description so it fits in a QR code
async function rmEncode(desc) {
  const sdp = desc.sdp.split('\r\n').filter((l) => l && !/^a=(extmap|rtcp-fb|msid-semantic|max-message-size)/.test(l)).join('\n');
  const bytes = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: sdp }));
  return 'C' + b64u.enc('CompressionStream' in window ? await pipe(bytes, new CompressionStream('deflate-raw')) : bytes);
}
async function rmDecode(code) {
  code = code.trim().replace(/^.*#\/remote\//, '');
  let bytes = b64u.dec(code.slice(1));
  try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); } catch {}
  const o = JSON.parse(new TextDecoder().decode(bytes));
  return { type: o.t, sdp: o.s.split('\n').join('\r\n') + '\r\n' };
}
function rmIceDone(pc) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 3000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function rmWire(dc) {
  RM.dc = dc;
  dc.onopen = () => {
    RM.connected = true;
    toast(RM.role === 'host' ? 'Remote connected.' : 'Connected — you are the remote.');
    if (RM.role === 'host') { $('#dlg')?.open && $('#dlg').close(); rmSendState(); }
    rmUpdateUi();
  };
  dc.onclose = () => { RM.connected = false; rmUpdateUi(); if (RM.role) toast('Remote disconnected.'); };
  dc.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (RM.role === 'host' && m.t === 'cmd' && HF_ACTIONS[m.a]) { if (!hfAction(m.a)) rmSendState(); }
    if (RM.role === 'remote' && m.t === 'state') { RM.state = m; rmUpdateUi(); }
  };
}
function rmClose() {
  try { RM.dc && RM.dc.close(); } catch {}
  try { RM.pc && RM.pc.close(); } catch {}
  Object.assign(RM, { pc: null, dc: null, role: '', connected: false, state: null });
}
function rmNewPc() {
  rmClose();
  const pc = new RTCPeerConnection({ iceServers: [] }); // local network only: no outside servers
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) { RM.connected = false; rmUpdateUi(); } };
  RM.pc = pc;
  return pc;
}
async function rmHostOffer() {
  const pc = rmNewPc();
  RM.role = 'host';
  rmWire(pc.createDataChannel('scene-reader', { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer());
  await rmIceDone(pc);
  return rmEncode(pc.localDescription);
}
async function rmHostAccept(code) { await RM.pc.setRemoteDescription(await rmDecode(code)); }
async function rmJoin(code) {
  const pc = rmNewPc();
  RM.role = 'remote';
  pc.ondatachannel = (e) => rmWire(e.channel);
  await pc.setRemoteDescription(await rmDecode(code));
  await pc.setLocalDescription(await pc.createAnswer());
  await rmIceDone(pc);
  return rmEncode(pc.localDescription);
}
function rmSend(m) { if (RM.dc && RM.dc.readyState === 'open') RM.dc.send(JSON.stringify(m)); }
// Status only — no script text ever goes to the remote
function rmSendState() {
  if (RM.role !== 'host' || !RM.connected) return;
  if (current.view !== 'run' || !run.scene) return rmSend({ t: 'state', label: 'Open a scene to rehearse', sub: '', mine: false });
  const lines = run.scene.blocks.map((b, i) => [b, i]).filter(([b]) => isStop(b));
  const pos = lines.findIndex(([, i]) => i >= run.idx) + 1;
  const label = run.done ? 'Scene done' : run.waiting ? 'Your line' : run.playing ? 'Reader is speaking' : 'Paused';
  rmSend({ t: 'state', label, sub: run.done ? '' : `Line ${Math.max(1, pos)} of ${lines.length}`, mine: run.waiting, playing: run.playing });
}
function rmStatusText() { return RM.connected ? (RM.role === 'host' ? '● Remote connected' : '● Connected') : 'Not connected'; }
function rmUpdateUi() {
  const st = $('#rm-status'); if (st) st.textContent = rmStatusText();
  const rb = $('[data-act="rm-pair"]', app); if (rb && RM.role === 'host' && RM.connected) rb.textContent = 'Pair again';
  if (current.view === 'remote') renderRemote();
  const badge = $('#rm-badge'); if (badge) badge.hidden = !(RM.role === 'host' && RM.connected);
}

const loadQr = () => loadScript('vendor/qrcode.js');
function qrSvg(text) {
  const q = qrcode(0, 'L'); q.addData(text, 'Byte'); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

// Main device: show the pairing QR, then scan the reply
async function rmPairDialog() {
  if (!('RTCPeerConnection' in window)) return toast('This browser can’t pair a remote.');
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog" class="dlg sheet rm"><h3>Pair a remote</h3><p class="note">Making a pairing code…</p></form>`;
  d.showModal();
  let code;
  try { await loadQr(); code = await rmHostOffer(); } catch (e) { d.close(); return toast('Couldn’t start pairing: ' + e.message); }
  const link = location.href.split('#')[0] + '#/remote/' + code;
  d.innerHTML = `<form method="dialog" class="dlg sheet rm">
      <h3>Pair a remote</h3>
      <ol class="rm-steps">
        <li>Put both devices on the <strong>same Wi-Fi</strong>.</li>
        <li>On the second phone, open the <strong>camera app</strong> and scan this code. Scene Reader opens as a remote and shows a reply code.</li>
      </ol>
      <div class="qr">${qrSvg(link)}</div>
      <ol class="rm-steps" start="3"><li>Tap below and point <strong>this</strong> device's camera at the reply code.</li></ol>
      <button type="button" class="btn primary" data-scan>Scan the reply code</button>
      <div class="scan" hidden><video playsinline muted></video><p class="note">Hold the code steady in the frame…</p></div>
      <details class="paste"><summary>No camera? Paste the reply code</summary><textarea rows="3" placeholder="Paste the code shown on the remote"></textarea><button type="button" class="btn small" data-paste>Connect</button></details>
      <div class="dlg-row"><span class="grow"></span><button value="cancel" class="btn ghost">Close</button></div>
    </form>`;
  const accept = async (c) => { try { await rmHostAccept(c); $('.note', d) && toast('Connecting…'); } catch (e) { toast('That code didn’t work — try scanning again.'); } };
  d.onclick = async (e) => {
    if (e.target.closest('[data-scan]')) { const v = $('.scan', d); v.hidden = false; const c = await scanQr($('video', d)); v.hidden = true; if (c) accept(c); }
    if (e.target.closest('[data-paste]')) accept($('.paste textarea', d).value);
  };
  d.onclose = () => { d.onclick = null; stopScan(); if (!RM.connected) rmClose(); };
}

// Camera QR scanner: built-in BarcodeDetector when available, otherwise jsQR (works on laptops too)
let scanStream = null;
function stopScan() { if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; } }
async function scanQr(video) {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch { toast('Camera not available — paste the code instead.'); return null; }
  video.srcObject = scanStream; await video.play().catch(() => {});
  let detector = null;
  if ('BarcodeDetector' in window) { try { if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
  if (!detector) await loadScript('vendor/jsQR.js');
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  const t0 = Date.now();
  while (scanStream && Date.now() - t0 < 120000) {
    await new Promise((r) => setTimeout(r, 200));
    if (!video.videoWidth) continue;
    try {
      if (detector) { const r = await detector.detect(video); if (r[0]) { stopScan(); return r[0].rawValue; } }
      else {
        cv.width = video.videoWidth; cv.height = video.videoHeight; cx.drawImage(video, 0, 0);
        const r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
        if (r && r.data) { stopScan(); return r.data; }
      }
    } catch {}
  }
  stopScan();
  return null;
}

// Second phone: #/remote/<code>
async function renderRemote() {
  document.title = 'Remote · Scene Reader';
  const code = current.id;
  if (RM.role === 'remote' && RM.connected) {
    const s = RM.state || { label: 'Connected', sub: '' };
    app.innerHTML = `<main class="remote ${s.mine ? 'mine' : ''}">
        <div class="rm-top"><span class="rm-label">${esc(s.label)}</span><span class="rm-sub">${esc(s.sub || '')}</span></div>
        <button class="rm-next" data-act="rm-cmd" data-a="next">Next line</button>
        <div class="rm-row"><button class="btn huge" data-act="rm-cmd" data-a="prev">Previous</button><button class="btn huge" data-act="rm-cmd" data-a="pause">${s.playing || s.mine ? 'Pause' : 'Play'}</button></div>
        <button class="btn ghost small" data-act="rm-close">Disconnect</button>
      </main>`;
    keepAwake(true);
    return;
  }
  if (!code) {
    app.innerHTML = `<header class="top"><button class="icon-btn" data-go="#/" aria-label="Back">${I.back}</button><div class="top-title">Remote</div></header>
      <main class="wrap"><h1 class="step-h">Use this phone as a remote</h1>
      <p class="hint">On the main device, open a scene and tap <strong>Remote</strong> (or Hands-free → Pair a phone). Then scan its code with this phone's camera app.</p></main>`;
    return;
  }
  if (RM.role !== 'remote') {
    app.innerHTML = `<main class="wrap"><h1 class="step-h">Pairing…</h1><p class="hint">Making the reply code.</p></main>`;
    try {
      await loadQr();
      RM.reply = await rmJoin(code);
    } catch (e) {
      app.innerHTML = `<main class="wrap"><h1 class="step-h">That code didn’t work</h1><p class="hint">Make a new pairing code on the main device and scan it again.</p></main>`;
      return;
    }
  }
  if (RM.connected) return renderRemote();
  app.innerHTML = `<main class="wrap rm-reply">
      <h1 class="step-h">Almost there</h1>
      <p class="hint">On the main device, tap <strong>Scan the reply code</strong> and point its camera here.</p>
      <div class="qr big">${qrSvg(RM.reply)}</div>
      <details class="paste"><summary>Main device has no camera?</summary><p class="note">Copy this code and paste it there:</p><textarea rows="4" readonly>${esc(RM.reply)}</textarea></details>
      <p class="rm-status" id="rm-status">Waiting for the main device…</p>
    </main>`;
  keepAwake(true);
}
