// Scene Reader — v1
// Private self-tape reader. Scripts are stored only in this browser (localStorage).

'use strict';
const { parseScript, characters, guessTitle, speakable, normName, newId, phraseRegex, junkKey } = window.SceneParser;
const { TAGS: TONES, PAUSES, CADENCES, delivery } = window.SceneTones;

// Load a plain script once (works from a double-clicked file and from a website)
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
  const el = document.createElement('script');
  el.src = src; el.dataset.src = src;
  el.onload = () => resolve(); el.onerror = () => reject(new Error('Could not load ' + src));
  document.head.appendChild(el);
});

/* ------------------------------------------------------------------ storage */

const APP_VERSION = '3.0.0';
const KEY_SCENES = 'sr.scenes';
const KEY_SETTINGS = 'sr.settings';
const DEFAULTS = { rate: 1, voiceURI: '', readActions: false, fontSize: 24, speakNames: false, allLangs: false, hq: false, kVoice: 'af_heart', kEngine: 'auto', myName: '', narrator: false, nVoice: 'bm_fable', nVoiceURI: '', kFavs: [], vFavs: null, readerRef: '', narratorRef: '', studio: false, studioUrl: 'http://127.0.0.1:5123', imported: [], spk: {} };

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Couldn’t save — storage is full or blocked.'); } };

let scenes = []; // loaded from the on-device library (IndexedDB) at start-up — see library.js
let settings = { ...DEFAULTS, ...load(KEY_SETTINGS, {}) };
if (settings.readActions && !('narratorSet' in settings)) { settings.narrator = true; } // v1.2 "read stage directions" → Narrator
settings.narratorSet = true;
if (!Array.isArray(settings.vFavs)) settings.vFavs = (settings.kFavs || []).map((k) => 'kokoro:' + k); // v1.3 favourites carry over
const saveScenes = () => libSave();
const saveSettings = () => save(KEY_SETTINGS, settings);
const getScene = (id) => scenes.find((s) => s.id === id);
const touch = (s) => { s.updated = Date.now(); saveScenes(); };

/* ------------------------------------------------------------------ helpers */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  remote: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="3"/><circle cx="12" cy="8" r="2.2"/><path d="M10 14h4M10 17h4"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" class="fill"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z" class="fill"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 6l-8 6 8 6zM6 6v12" class="fill"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6l8 6-8 6zM18 6v12" class="fill"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  join: '<svg viewBox="0 0 24 24"><path d="M12 19V7M7 11l5-5 5 5M5 3h14"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function ask({ title, value = '', placeholder = '', extra = '', plain = false }) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${esc(title)}</h3>
        <input name="v" class="${plain ? 'plain' : ''}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="${plain ? 'sentences' : 'characters'}">
        <div class="dlg-row">
          ${extra ? `<button value="extra" class="btn ghost danger">${esc(extra)}</button>` : '<span></span>'}
          <span class="grow"></span>
          <button value="cancel" class="btn ghost">Cancel</button>
          <button value="ok" class="btn primary">Save</button>
        </div>
      </form>`;
    const input = $('input', d);
    d.onclose = () => resolve({ action: d.returnValue, value: input.value.trim() });
    d.returnValue = 'cancel';
    d.showModal();
    input.focus();
    input.select();
  });
}

/* ------------------------------------------------------------------ speech */

const synth = window.speechSynthesis;
let allVoices = [];
function loadVoices() { allVoices = synth ? synth.getVoices() : []; }
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', () => { loadVoices(); if (current.view === 'cast') renderVoiceSelect(); });
}

// Which voices to offer: ON-DEVICE ONLY (online voices send your lines to Google/Microsoft), your language first.
function voiceList() {
  let list = allVoices.filter((v) => v.localService);
  if (!settings.allLangs) {
    const lang = (navigator.language || 'en-US').slice(0, 2).toLowerCase();
    const mine = list.filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(lang));
    if (mine.length) list = mine;
  }
  return [...list].sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
}

// Apple's joke voices (Bubbles, Zarvox…) — still selectable, but listed last.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|ralph|fred|junior|kathy)\b/i;
// Rough quality score from the voice's name. Higher = more natural-sounding.
function voiceScore(v) {
  const n = v.name;
  let s = 0;
  if (/premium/i.test(n)) s += 60;
  if (/enhanced|neural|natural|wavenet|studio|journey|polyglot/i.test(n)) s += 45;
  if (/siri/i.test(n)) s += 35;
  if (/google/i.test(n)) s += 15;
  if (/compact|espeak|eloquence|robot/i.test(n)) s -= 25;
  if (NOVELTY.test(n) && !/premium|enhanced|siri/i.test(n)) s -= 60;
  if (v.default) s += 3;
  return s;
}
const voiceTier = (v) => (voiceScore(v) >= 30 ? 'best' : voiceScore(v) < -20 ? 'novelty' : 'std');
const findVoice = (uri) => (uri ? voiceList().find((x) => x.voiceURI === uri) || null : null);

// Per-character voice + pitch for the other parts (saved with each scene)
const PITCHES = [['0.75', 'Much lower'], ['0.9', 'Lower'], ['1', 'Normal'], ['1.1', 'Higher'], ['1.25', 'Much higher']];
function castFor(scene, who) { return (scene && scene.cast && scene.cast[who]) || {}; }
function voiceFor(scene, who) { return findVoice(castFor(scene, who).voiceURI) || currentVoice(); }
function pitchFor(scene, who) { return Number(castFor(scene, who).pitch) || 1; }

// Strip a leading "MAYA:" / "Maya." / "MAYA -" left in the text by an unusual script format,
// so names are only spoken when the "Say character names" setting is on.
function stripName(text, who) {
  if (!who) return text;
  const n = who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return text.replace(new RegExp('^\\s*' + n + '\\s*(\\([^)]*\\))?\\s*(:|\\.|\\s[-–—])\\s+', 'i'), '$1 ').trim();
}
const titleCase = (n) => n.toLowerCase().replace(/(^|[\s\-'’.])([a-z])/g, (m, a, b) => a + b.toUpperCase());

function currentVoice() {
  const list = voiceList();
  if (settings.voiceURI) {
    const v = list.find((x) => x.voiceURI === settings.voiceURI);
    if (v) return v;
  }
  const lang = (navigator.language || 'en-US').slice(0, 2);
  const same = list.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  return (
    same.find((v) => /premium|enhanced|natural|neural/i.test(v.name)) ||
    same.find((v) => v.default) ||
    same[0] ||
    list[0] ||
    null
  );
}

// Split long lines into sentence-sized chunks (some browsers stall on long utterances).
function chunks(text) {
  const parts = text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) || [text];
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > 220 && buf) { out.push(buf.trim()); buf = ''; }
    buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const keep = []; // hold references so browsers don't garbage-collect utterances mid-speech


let noVoiceWarned = false;
function sayDevice(text, opts = {}) {
  return new Promise((resolve) => {
    if (!synth) return setTimeout(resolve, 400);
    const parts = chunks(text);
    const voice = opts.voice || currentVoice();
    // Privacy: never let the browser pick an online voice for us
    if (!voice && allVoices.length) {
      if (!noVoiceWarned) { noVoiceWarned = true; toast('No on-device voice found. Turn on High-quality voices (Reader settings) to hear the other parts.'); }
      return setTimeout(resolve, 600 + text.length * 45 / settings.rate);
    }
    const d = opts.seg || { speed: 1, pitch: 0, gain: 1 };
    const pitch = Math.max(0.1, Math.min(2, (opts.pitch || 1) * Math.pow(2, d.pitch / 12)));
    const rate = Math.max(0.5, Math.min(2.5, settings.rate * d.speed));
    let i = 0, seq = 0, done = false, watchdog;
    const finish = () => { if (done) return; done = true; clearTimeout(watchdog); resolve(); };
    const next = () => {
      if (done) return;
      if (i >= parts.length) return finish();
      const part = parts[i++];
      const my = ++seq;
      const u = new SpeechSynthesisUtterance(part);
      u.rate = rate;
      u.pitch = pitch;
      u.volume = Math.min(1, d.gain);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      keep.push(u); if (keep.length > 20) keep.shift();
      clearTimeout(watchdog);
      // Safety net: if the browser never reports "finished", move on anyway.
      watchdog = setTimeout(() => { if (my === seq) next(); }, 4000 + (part.length * 120) / settings.rate);
      u.onend = () => { if (my === seq) next(); };
      u.onerror = (e) => {
        if (my !== seq) return;
        if (e.error === 'interrupted' || e.error === 'canceled') finish();
        else next();
      };
      synth.speak(u);
    };
    next();
  });
}

function stopSpeech() {
  if (synth) synth.cancel();
  K.playTok++;
  if (K.src) { try { K.src.stop(); } catch {} K.src = null; }
}

// iOS only allows speech after a tap; speak a silent blip on the first tap to unlock it.
let unlocked = false;
function unlockSpeech() {
  if (settings.hq || settings.studio) audioCtx(); // phones only allow audio after a tap
  if (unlocked || !synth) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}

/* ------------------------------------------------------------------ high-quality voices (Kokoro, on-device AI)
   The model (onnx-community/Kokoro-82M-v1.0-ONNX) is downloaded once from Hugging Face and cached
   in this browser. Speech is generated in a background worker ON THIS DEVICE — script text is
   never sent anywhere. */

const K_CAST_ORDER = ['am_michael', 'af_bella', 'am_fenrir', 'bf_emma', 'bm_george', 'af_nicole', 'am_puck', 'bm_fable', 'af_aoede', 'af_kore', 'af_sarah', 'bf_isabella'];
const K = { status: 'off', msg: '', worker: null, device: '', dtype: '', loaded: 0, total: 0, jobs: [], busy: null, cache: new Map(), nextId: 1, playTok: 0, src: null, ctx: null, fails: 0, warned: false };


const isPhone = () => navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

async function kPlans() {
  const plans = [];
  const wantGpu = settings.kEngine === 'webgpu' || (settings.kEngine === 'auto' && !isPhone());
  let gpu = false;
  if (wantGpu && 'gpu' in navigator) { try { gpu = !!(await navigator.gpu.requestAdapter()); } catch {} }
  // WebGPU: the Kokoro authors recommend full precision (fp32, ~326 MB) on GPU.
  // Phones / no WebGPU: the small quantised model (q8, ~92 MB) on WASM.
  if (gpu) plans.push({ device: 'webgpu', dtype: 'fp32' });
  plans.push({ device: 'wasm', dtype: 'q8' });
  return plans;
}

const renderHQ = () => renderVoicesPanel();
function kSet(status, msg = '') { K.status = status; K.msg = msg; renderHQ(); }

async function kokoroStart() {
  if (K.status === 'loading' || K.status === 'ready') return;
  if (location.protocol === 'file:') return kSet('failed', 'High-quality voices only work from your website link (Netlify) — browsers block them when index.html is opened as a file. Using device voices here.');
  if (!('Worker' in window) || typeof WebAssembly !== 'object') return kSet('failed', 'This browser can’t run high-quality voices. Using device voices.');
  try { navigator.storage?.persist?.(); } catch {}
  K.loaded = 0; K.total = 0; K.fails = 0; K.warned = false;
  kSet('loading');
  for (const plan of await kPlans()) {
    try {
      await kBoot(plan);
      kSet('ready');
      if (current.view === 'run' || current.view === 'cast') toast('High-quality voices are ready.');
      return;
    } catch (e) {
      console.warn('Kokoro could not start with', plan, e);
      kKill();
    }
  }
  kSet('failed', 'High-quality voices couldn’t load. Check your internet connection and tap Try again. Using device voices for now.');
}

function kBoot(plan) {
  return new Promise((resolve, reject) => {
    const w = new Worker('kokoro-worker.js', { type: 'module' });
    K.worker = w;
    const id = K.nextId++;
    let quiet;
    const poke = () => { clearTimeout(quiet); quiet = setTimeout(() => reject(new Error('Voice engine stalled')), 120000); };
    poke();
    w.onerror = (e) => { clearTimeout(quiet); reject(new Error(e.message || 'Voice engine failed to start')); };
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') { poke(); K.loaded = m.loaded; K.total = m.total; renderHQProgress(); return; }
      if (m.id !== id) return;
      clearTimeout(quiet);
      if (m.type === 'loaded') {
        K.device = m.device; K.dtype = m.dtype;
        w.onmessage = (ev) => kMessage(ev.data || {});
        w.onerror = () => kCrash('Voice engine crashed');
        resolve();
      } else reject(new Error(m.message || 'Voice engine failed'));
    };
    w.postMessage({ id, type: 'load', ...plan });
  });
}

function kKill() {
  if (K.worker) { try { K.worker.terminate(); } catch {} }
  K.worker = null;
  const all = [...K.jobs, ...(K.busy ? [K.busy] : [])];
  K.jobs = []; K.busy = null;
  all.forEach((j) => { clearTimeout(j.timer); j.reject(new Error('Voice engine stopped')); });
}

function kCrash(reason) {
  console.warn('Kokoro stopped:', reason);
  kKill();
  kSet('failed', 'High-quality voices stopped working, so the device voice took over. Tap Try again to reload them.');
  toast('High-quality voices stopped — switched to the device voice.');
}

function kMessage(m) {
  const j = K.busy;
  if (!j || m.id !== j.id) return;
  K.busy = null;
  clearTimeout(j.timer);
  if (m.type === 'audio') {
    K.cache.set(j.key, { pcm: m.pcm, rate: m.rate });
    while (K.cache.size > 30) K.cache.delete(K.cache.keys().next().value);
    K.fails = 0;
    j.resolve(K.cache.get(j.key));
  } else j.reject(new Error(m.message || 'Voice engine error'));
  kPump();
}

// Queue a line for the voice engine. Urgent = needed right now (jumps the queue).
// How Kokoro delivers a tone: generate at `speed`, play back at `rate` (pitch shift), at `gain` volume
function kSpec(tone) {
  const d = delivery(tone);
  const rate = Math.pow(2, d.pitch / 12);
  return { speed: Math.max(0.5, Math.min(2, (settings.rate * d.speed) / rate)), rate, gain: d.volume, thin: tone === 'whisper' };
}

function kJob(text, voice, urgent, speed = settings.rate) {
  speed = Math.round(speed * 100) / 100;
  const key = voice + '|' + speed + '|' + text;
  if (K.cache.has(key)) return Promise.resolve(K.cache.get(key));
  let j = K.busy && K.busy.key === key ? K.busy : K.jobs.find((x) => x.key === key);
  if (j) {
    if (urgent && K.jobs.includes(j)) { K.jobs.splice(K.jobs.indexOf(j), 1); K.jobs.unshift(j); }
    return j.promise;
  }
  j = { id: K.nextId++, key, text, voice, speed };
  j.promise = new Promise((res, rej) => { j.resolve = res; j.reject = rej; });
  j.promise.catch(() => {});
  if (urgent) K.jobs.unshift(j); else K.jobs.push(j);
  kPump();
  return j.promise;
}

function kPump() {
  if (K.busy || !K.jobs.length || !K.worker) return;
  const j = K.jobs.shift();
  K.busy = j;
  j.timer = setTimeout(() => { if (K.busy === j) kCrash('Took too long'); }, 30000 + j.text.length * 150);
  K.worker.postMessage({ id: j.id, type: 'speak', text: j.text, voice: j.voice, speed: j.speed });
}

function audioCtx() {
  if (!K.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) K.ctx = new C(); }
  if (K.ctx && K.ctx.state === 'suspended') K.ctx.resume().catch(() => {});
  return K.ctx;
}

function kPlay(clip, tok, fx = {}) {
  return new Promise((resolve) => {
    const ctx = audioCtx();
    if (!ctx || tok !== K.playTok) return resolve();
    const buf = ctx.createBuffer(1, clip.pcm.length, clip.rate);
    buf.copyToChannel(clip.pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (fx.rate && fx.rate !== 1) src.playbackRate.value = fx.rate; // pitch shift (speed compensated when generated)
    let node = src;
    if (fx.thin) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450; node.connect(hp); node = hp; }
    const gain = ctx.createGain(); gain.gain.value = fx.gain || 1; node.connect(gain); node = gain;
    if ((fx.gain || 1) > 1) { const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; node.connect(comp); node = comp; }
    node.connect(ctx.destination);
    if (MEDIA.tap) node.connect(MEDIA.tap); // recording a take with AI lines (voiceover / collab)
    src.onended = () => { if (K.src === src) K.src = null; resolve(); };
    K.src = src;
    src.start();
  });
}



/* ------------------------------------------------------------------ wake lock */

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not supported or denied — fine */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current.view === 'run') keepAwake(true);
});

/* ------------------------------------------------------------------ routing */

const current = { view: '', id: '' };

function go(hash) { location.hash = hash; }

function route() {
  const [, view = '', id = ''] = (location.hash || '#/').split('/');
  if (current.view === 'run' && view !== 'run') { leaveRun(); if (reloadPending) return location.reload(); }
  if (current.view === 'vo' && view !== 'vo') voLeave();
  if (current.view === 'project' && view !== 'project') pjLeave();
  current.view = view || 'home';
  current.id = id;
  app.oninput = null;
  if (view !== 'remote' && typeof rmSendState === 'function') setTimeout(rmSendState, 0);
  if (view === 'keys') { window.scrollTo(0, 0); return renderKeys(); }
  if (view === 'remote') { window.scrollTo(0, 0); return renderRemote(); }
  if (view === 'vo') { window.scrollTo(0, 0); return id ? renderVo() : renderVoList(); }
  if (view === 'projects') { window.scrollTo(0, 0); return renderProjects(); }
  const s = id && getScene(id);
  if (view && view !== 'home' && !s) return go('#/');
  window.scrollTo(0, 0);
  if (view === 'edit') renderEdit(s);
  else if (view === 'cast') renderCast(s);
  else if (view === 'run') renderRun(s);
  else if (view === 'prep') renderPrep();
  else if (view === 'project') renderProject();
  else renderHome();
}
window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ import */

function createScene(text, fallbackTitle) {
  const blocks = parseScript(text, { myName: settings.myName });
  if (!blocks.some((b) => b.type === 'line')) {
    toast('Couldn’t find any character lines. Check the text and try again.');
    return null;
  }
  const s = {
    id: newId(), title: guessTitle(blocks, fallbackTitle), blocks: [...blocks], me: '',
    raw: text, ignore: [], keep: [], cleanup: blocks.cleanup || [], edited: false,
    ...(settings.libFolder && settings.libFolder !== '__none' ? { folder: settings.libFolder } : {}),
    created: Date.now(), updated: Date.now(),
  };
  scenes.unshift(s);
  saveScenes();
  go('#/edit/' + s.id);
  const unsure = s.blocks.filter((b) => b.ask).length;
  if (unsure) setTimeout(() => toast(`${unsure} spot${unsure === 1 ? '' : 's'} need${unsure === 1 ? 's' : ''} a quick check — look for the gold “?” prompts.`), 300);
  return s;
}

// Run the breakdown again from the original text (keeps your character choice and voices)
function reparse(scene) {
  if (!scene.raw) return toast('This scene was saved before v1.2, so it can’t be re-run. Paste it again instead.');
  const blocks = parseScript(scene.raw, { myName: settings.myName, ignore: scene.ignore, keep: scene.keep });
  scene.blocks = [...blocks];
  scene.cleanup = blocks.cleanup || [];
  scene.edited = false;
  touch(scene);
  rerenderEditKeepScroll(scene);
}
const edited = (scene) => { scene.edited = true; touch(scene); };

async function importFile(file) {
  if (!file) return;
  const name = file.name.replace(/\.[^.]+$/, '');
  if (/\.(txt|fountain|text)$/i.test(file.name) || file.type.startsWith('text/')) {
    return createScene(await file.text(), name);
  }
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast('Please choose a PDF or a text file.');
  const btn = $('[data-act="pick-file"]');
  btn?.classList.add('busy');
  try {
    await loadScript('pdf-import.js');
    const { pdfToText } = window.ScenePdf;
    const { text, scanned } = await pdfToText(file);
    if (scanned) {
      toast('This PDF looks scanned (images only). Scanned support is coming — for now, copy and paste the text.');
      return;
    }
    createScene(text, name);
  } catch (e) {
    console.error(e);
    toast(/password/i.test(String(e)) ? 'This PDF is password-protected.' : 'Couldn’t read that PDF.');
  } finally {
    btn?.classList.remove('busy');
  }
}

// Drag a file anywhere onto the home screen
window.addEventListener('dragover', (e) => { if (current.view === 'home') { e.preventDefault(); document.body.classList.add('dropping'); } });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
window.addEventListener('drop', (e) => {
  document.body.classList.remove('dropping');
  if (current.view !== 'home') return;
  e.preventDefault();
  importFile(e.dataTransfer.files[0]);
});

const SAMPLE = `INT. ALL-NIGHT DINER - 2 A.M.

Rain on the windows. MAYA (30s) sits alone in a booth, cold coffee in front of her. DEV (30s) slides in across from her, soaked.

DEV
You picked the worst diner in the city.

MAYA
I picked the only one that's open.

DEV
(shaking off the rain)
Fair. So. You called.

MAYA
I called eleven times, Dev. You picked up on the twelfth.

DEV
I was working.

MAYA
At midnight.

DEV
At midnight. Yes.

ROSA, the waitress, appears with a pot of coffee. She reads the table and decides not to ask.

ROSA
Top you up?

MAYA
Please. And one for him. He's staying.

ROSA pours and drifts away.

DEV
Am I?

MAYA
(beat)
Mom sold the house.

Dev freezes, cup halfway to his mouth.

DEV
She can't sell it. Half of it's—

MAYA
Ours. I know. That's why I called eleven times.`;

/* ------------------------------------------------------------------ HOME */

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (current.view === 'home') renderHome(); });

function renderHome() {
  document.title = 'Scene Reader';
  app.innerHTML = `
    <header class="top">
      <div class="brand"><span class="mark"></span>Scene Reader</div>
      ${installEvt ? '<button class="btn ghost small" data-act="install">Install app</button>' : ''}
    </header>
    <main class="wrap home">
      <section class="hero">
        <h1>Your reader,<br>whenever you need one.</h1>
        <p class="lede">Open your sides, pick your role, and the reader takes every other part — pausing for you on each cue.</p>
      </section>

      <section class="panel">
        <button class="btn huge primary" data-act="pick-file">${I.file}<span>Open PDF sides</span></button>
        <input type="file" id="file" accept="application/pdf,.pdf,.txt,.fountain" hidden>
        <div class="divider"><span>or paste the scene</span></div>
        <textarea id="paste" class="paste" spellcheck="false" placeholder="MAYA&#10;Where were you last night?&#10;&#10;DEV&#10;Working.&#10;&#10;— or —&#10;&#10;Maya: Where were you last night?&#10;Dev: Working."></textarea>
        <p class="detect" id="detect" aria-live="polite"></p>
        <button class="btn big" data-act="use-paste">Break it down</button>
        <button class="link" data-act="sample">or try a sample scene</button>
      </section>

      <section class="studio-links">
        <button class="btn big" data-go="#/vo"><span>🎙 Voiceover studio</span></button>
        <button class="btn big" data-go="#/projects"><span>👥 Collab projects${scenes.some((s) => s.project) ? ` (${scenes.filter((s) => s.project).length})` : ''}</span></button>
      </section>
      ${libSectionHtml()}

      <p class="privacy">${I.lock}<span><strong>Private by design.</strong> Your sides are read and stored only on this device. Nothing is uploaded — not to us, not to anyone.</span></p>
      <p class="app-foot">Scene Reader v${APP_VERSION}</p>
    </main>`;

  $('#file').addEventListener('change', (e) => importFile(e.target.files[0]));
  libBind();

  // Auto-detect: show who's in the scene as you type, and break it down straight away on paste
  const box = $('#paste');
  let timer;
  box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(showDetected, 250); });
  box.addEventListener('paste', () => {
    const wasEmpty = !box.value.trim();
    setTimeout(() => {
      const found = showDetected();
      if (wasEmpty && found.length) {
        toast(`Found ${found.length} character${found.length === 1 ? '' : 's'}: ${found.map((c) => c.name).join(', ')}. Check the breakdown.`);
        createScene(box.value.trim(), 'Pasted scene');
      }
    }, 0);
  });
}

function showDetected() {
  const box = $('#paste'), out = $('#detect');
  if (!box || !out) return [];
  const t = box.value.trim();
  const found = t ? characters(parseScript(t)) : [];
  out.innerHTML = !t ? '' : found.length
    ? `<strong>Detected ${found.length} character${found.length === 1 ? '' : 's'}:</strong> ${found.map((c) => `${esc(c.name)} <span>(${c.count})</span>`).join(' · ')}`
    : 'No characters detected yet — put each name on its own line, or use “Name: line”.';
  out.classList.toggle('none', !!t && !found.length);
  return found;
}

/* ------------------------------------------------------------------ EDIT */

function whoOptions(scene, sel) {
  const chars = characters(scene.blocks).map((c) => c.name);
  if (sel.type === 'line' && !chars.includes(sel.who)) chars.push(sel.who);
  const val = sel.type === 'line' ? 'c:' + sel.who : sel.type;
  const opt = (v, label) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(label)}</option>`;
  return [
    ...chars.map((c) => opt('c:' + c, c)),
    '<option disabled>──────────</option>',
    opt('action', 'Stage direction'),
    opt('heading', 'Scene heading'),
    opt('new', '+ New character…'),
  ].join('');
}

function askBar(b) {
  if (!b.ask) return '';
  const q = b.ask.kind === 'cue'
    ? `New line here? Is this <strong>${esc(b.who || b.ask.name)}</strong>?`
    : 'Stage direction starts here?';
  return `<div class="askbar" role="group" aria-label="Check this split">
      <span class="askq">${q}</span>
      <span class="askbtns">
        <button class="btn small primary" data-act="ask-yes">Yes</button>
        <button class="btn small" data-act="ask-no">No</button>
        ${b.ask.kind === 'cue' ? '<button class="btn small ghost" data-act="ask-change">Change name</button>' : ''}
      </span>
    </div>`;
}

function blockCard(scene, b, n) {
  const merge = n > 1 ? `<li class="gap"><button class="gap-btn" data-act="merge" aria-label="Merge block ${n} into block ${n - 1}">⇕ merge</button></li>` : '';
  return `${merge}
    <li class="eblock t-${b.type}${b.ask ? ' ask' : ''}" data-id="${b.id}">
      ${askBar(b)}
      <div class="erow">
        <span class="num">${n}</span>
        <select class="who" aria-label="Who says this">${whoOptions(scene, b)}</select>
        <span class="grow"></span>
        ${b.type !== 'heading' ? `<button class="tone-btn" data-act="tone" title="Direction, tone and pauses" aria-label="Direction, tone and pauses for block ${n}">Tone</button>` : ''}
        <button class="icon-btn sm" data-act="add" title="Add a line below" aria-label="Add line below">${I.plus}</button>
        <button class="icon-btn sm" data-act="del" title="Delete" aria-label="Delete">${I.trash}</button>
      </div>
      ${tagsHtml(b) ? `<div class="etags" data-act="tone">${tagsHtml(b)}</div>` : ''}
      <textarea class="etext" rows="1" spellcheck="false">${esc(b.text)}</textarea>
      <div class="etools">
        <button class="tool" data-act="split" title="Split this bubble where the cursor is">✂ Split here</button>
        <button class="tool" data-act="ignore-sel" title="Remove the selected text everywhere in this script">⊘ Ignore this text</button>
      </div>
    </li>`;
}

function cleanupPanel(scene) {
  const items = scene.cleanup || [];
  const label = { watermark: 'Watermark', header: 'Page header', 'your name': 'Your name', ignored: 'You ignored', repeat: 'Repeated' };
  return `<details class="cleanup" ${items.length ? '' : ''}>
      <summary>Removed automatically <span>${items.length ? items.reduce((n, x) => n + x.count, 0) + ' bits' : 'nothing'}</span></summary>
      ${items.length ? `<ul>${items.map((x) => `<li><span class="ck">${label[x.kind] || x.kind}</span><span class="ct">${esc(x.text)}</span><span class="cn">×${x.count}</span>${scene.raw && x.kind !== 'repeat' ? `<button class="btn small ghost" data-act="put-back" data-key="${esc(x.key)}">Put back</button>` : ''}</li>`).join('')}</ul>` : '<p class="note">No watermarks or page headers found.</p>'}
      <label class="field myname"><span>Your name</span><input id="myName" value="${esc(settings.myName || '')}" placeholder="Removed if it’s stamped on your sides" autocomplete="off"></label>
      ${scene.raw ? '<button class="btn small ghost" data-act="reparse">Re-run the breakdown</button>' : ''}
    </details>`;
}

function renderEdit(scene) {
  document.title = 'Check script · Scene Reader';
  const chars = characters(scene.blocks);
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="home" aria-label="Back">${I.back}</button>
      <input class="title-input" id="title" value="${esc(scene.title)}" aria-label="Scene name">
    </header>
    <main class="wrap edit">
      <h1 class="step-h"><span class="step">1</span>Check the breakdown</h1>
      <p class="hint">Tap a bubble to edit it. <strong>✂ Split here</strong> splits at your cursor, <strong>⇕ merge</strong> joins two bubbles, and a <strong>long-press</strong> on a bubble changes who says it. Select junk text and tap <strong>⊘ Ignore this text</strong> to remove it everywhere.</p>
      ${scene.blocks.some((b) => b.ask) ? `<div class="review"><span>${scene.blocks.filter((b) => b.ask).length} split${scene.blocks.filter((b) => b.ask).length === 1 ? '' : 's'} to check</span><button class="btn small primary" data-act="next-ask">Show me</button></div>` : ''}
      ${cleanupPanel(scene)}
      <div class="chips">${chars.map((c) => `<button class="chip" data-act="rename" data-name="${esc(c.name)}">${esc(c.name)}<span>${c.count}</span></button>`).join('')}</div>
      <ol class="eblocks">${scene.blocks.map((b, i) => blockCard(scene, b, i + 1)).join('')}</ol>
      <button class="btn ghost wide" data-act="add-end">${I.plus}<span>Add a line at the end</span></button>
    </main>
    <footer class="dock">
      <button class="btn huge primary" data-act="to-cast">Pick my character</button>
    </footer>`;

  $$('.etext').forEach(autoGrow);
  $('#title').addEventListener('input', (e) => { scene.title = e.target.value || 'Untitled scene'; touch(scene); });
}

const blockOf = (scene, el) => scene.blocks.find((x) => x.id === el.closest('.eblock').dataset.id);

// Remove a phrase everywhere in this script, and remember it for the next re-run
function ignorePhrase(scene, phrase) {
  const re = phraseRegex(phrase);
  let n = 0;
  for (const b of scene.blocks) b.text = b.text.replace(re, () => { n++; return ' '; }).replace(/\s+/g, ' ').trim();
  scene.blocks = scene.blocks.filter((b) => b.text);
  scene.ignore = [...new Set([...(scene.ignore || []), phrase])];
  const key = junkKey(phrase);
  scene.cleanup = (scene.cleanup || []).filter((x) => x.key !== key);
  scene.cleanup.push({ text: phrase, key, kind: 'ignored', count: n });
  edited(scene);
  rerenderEditKeepScroll(scene);
  toast(`Removed “${phrase.length > 30 ? phrase.slice(0, 30) + '…' : phrase}” ${n}× — it’ll stay gone for this script.`);
}

// Big-button sheet to pick who says a block (long-press, Change name, after a split)
// Delivery sheet: direction tag, one tone tag, pause before/after, preview
function toneSheet(scene, b) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    const st = { tone: b.tone || '', cadence: b.cadence || '', before: +b.pauseBefore || 0, after: +b.pauseAfter || 0 };
    const pauseRow = (key, label) => `<div class="seg-row"><span>${label}</span><div class="seg" data-pause="${key}">${PAUSES.map((p) =>
      `<button type="button" data-v="${p}" class="${st[key] === p ? 'on' : ''}">${p ? p + 's' : 'None'}</button>`).join('')}</div></div>`;
    d.innerHTML = `<form method="dialog" class="dlg sheet tone-sheet">
        <h3>${b.type === 'line' ? esc(b.who) : 'Stage direction'}</h3>
        <p class="sheet-text">“${esc(b.text.slice(0, 90))}${b.text.length > 90 ? '…' : ''}”</p>
        <label class="field col"><span>Direction <em>(shown, never read aloud)</em></span><input id="t-dir" value="${esc(b.dir || '')}" placeholder="e.g. leaning in" autocomplete="off"></label>
        <span class="lbl">Tone</span>
        <div class="tone-grid">${Object.entries(TONES).map(([k, t]) => `<button type="button" data-tone="${k}" class="${st.tone === k ? 'on' : ''}">${t.label}</button>`).join('')}</div>
        <span class="lbl">Cadence</span>
        <div class="tone-grid cad">${Object.entries(CADENCES).map(([k, c]) => `<button type="button" data-cad="${k}" class="${(st.cadence || 'steady') === k ? 'on' : ''}" title="${c.hint}">${c.label}</button>`).join('')}</div>
        <p class="note">Tip: put <strong>*stars*</strong> around a word in the line to stress it, and “ / ” for a breath.</p>
        ${pauseRow('before', 'Pause before')}
        ${pauseRow('after', 'Pause after')}
        <div class="dlg-row"><button type="button" class="btn ghost" data-hear>${I.play}<span>Hear it</span></button><span class="grow"></span><button value="cancel" class="btn ghost">Cancel</button><button value="ok" class="btn primary">Done</button></div>
      </form>`;
    const apply = (x) => { x.cadence = st.cadence && st.cadence !== 'steady' ? st.cadence : undefined; x.tone = st.tone || undefined; x.pauseBefore = st.before || undefined; x.pauseAfter = st.after || undefined; x.dir = $('#t-dir').value.trim() || undefined; return x; };
    d.onclick = (e) => {
      const t = e.target.closest('[data-tone]'), p = e.target.closest('[data-pause] button');
      const cd = e.target.closest('[data-cad]');
      if (cd) { st.cadence = cd.dataset.cad; $$('[data-cad]', d).forEach((x) => x.classList.toggle('on', x === cd)); }
      if (t) { st.tone = st.tone === t.dataset.tone ? '' : t.dataset.tone; $$('[data-tone]', d).forEach((x) => x.classList.toggle('on', x.dataset.tone === st.tone)); }
      if (p) { const key = p.parentElement.dataset.pause; st[key] = +p.dataset.v; $$('button', p.parentElement).forEach((x) => x.classList.toggle('on', x === p)); }
      if (e.target.closest('[data-hear]')) {
        unlockSpeech(); stopSpeech();
        const { text, opts } = lineSpeech(scene, apply({ ...b }));
        if (text) say(text, opts);
      }
    };
    d.returnValue = 'cancel';
    d.onclose = () => {
      d.onclick = null; stopSpeech();
      if (d.returnValue !== 'ok') return resolve(false);
      apply(b);
      for (const k of ['tone', 'cadence', 'pauseBefore', 'pauseAfter', 'dir']) if (b[k] === undefined) delete b[k];
      touch(scene);
      rerenderEditKeepScroll(scene);
      resolve(true);
    };
    d.showModal();
  });
}

function reassign(scene, b, title) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    const names = characters(scene.blocks).map((c) => c.name);
    if (b.type === 'line' && !names.includes(b.who)) names.push(b.who);
    const cur = b.type === 'line' ? 'c:' + b.who : b.type;
    const opt = (v, label, cls = '') => `<button value="${esc(v)}" class="who-opt ${cls} ${v === cur ? 'on' : ''}">${esc(label)}</button>`;
    d.innerHTML = `<form method="dialog" class="dlg sheet">
        <h3>${esc(title)}</h3>
        <p class="sheet-text">“${esc(b.text.slice(0, 90))}${b.text.length > 90 ? '…' : ''}”</p>
        <div class="who-grid">${names.map((n) => opt('c:' + n, n)).join('')}</div>
        <div class="who-grid">${opt('action', 'Stage direction', 'alt')}${opt('heading', 'Scene heading', 'alt')}${opt('new', '+ New character', 'alt')}</div>
        <div class="dlg-row"><span class="grow"></span><button value="cancel" class="btn ghost">Cancel</button></div>
      </form>`;
    d.returnValue = 'cancel';
    d.onclose = async () => {
      const v = d.returnValue;
      if (!v || v === 'cancel') return resolve(false);
      if (v === 'new') {
        const r = await ask({ title: 'New character', placeholder: 'NAME' });
        const name = normName(r.value);
        if (r.action !== 'ok' || !name) return resolve(false);
        b.type = 'line'; b.who = name;
      } else if (v.startsWith('c:')) { b.type = 'line'; b.who = v.slice(2); }
      else { b.type = v; delete b.who; }
      resolve(true);
    };
    d.showModal();
  });
}

// Long-press (or right-click) a bubble to change who says it
let lpTimer = null, lpStart = null;
app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.etools button, .askbar button')) e.preventDefault(); // keep the text selection / cursor
  const el = e.target.closest('.eblock');
  if (!el || current.view !== 'edit' || e.target.closest('textarea, button, select, input')) return;
  lpStart = { x: e.clientX, y: e.clientY };
  clearTimeout(lpTimer);
  lpTimer = setTimeout(async () => {
    lpTimer = null;
    navigator.vibrate?.(15);
    const scene = getScene(current.id);
    const b = blockOf(scene, el);
    if (b && (await reassign(scene, b, 'Who says this?'))) { delete b.ask; edited(scene); rerenderEditKeepScroll(scene); }
  }, 500);
});
const lpCancel = (e) => { if (lpTimer && (!lpStart || e.type !== 'pointermove' || Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 10)) { clearTimeout(lpTimer); lpTimer = null; } };
['pointerup', 'pointercancel', 'pointermove'].forEach((t) => app.addEventListener(t, lpCancel));
window.addEventListener('scroll', () => { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });
app.addEventListener('contextmenu', async (e) => {
  const el = e.target.closest('.eblock');
  if (!el || current.view !== 'edit' || e.target.closest('textarea, input')) return;
  e.preventDefault();
  clearTimeout(lpTimer); lpTimer = null;
  const scene = getScene(current.id);
  const b = blockOf(scene, el);
  if (b && (await reassign(scene, b, 'Who says this?'))) { delete b.ask; edited(scene); rerenderEditKeepScroll(scene); }
});

function autoGrow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

app.addEventListener('input', (e) => {
  if (!e.target.classList.contains('etext')) return;
  const scene = getScene(current.id);
  const b = scene?.blocks.find((x) => x.id === e.target.closest('.eblock').dataset.id);
  if (!b) return;
  b.text = e.target.value;
  scene.edited = true;
  autoGrow(e.target);
  clearTimeout(e.target._t);
  e.target._t = setTimeout(() => touch(scene), 400);
});

app.addEventListener('change', async (e) => {
  if (prepChange(e) || pjChange(e) || (await voChange(e))) return;
  const scene = getScene(current.id);
  if (e.target.classList.contains('who')) {
    const b = scene.blocks.find((x) => x.id === e.target.closest('.eblock').dataset.id);
    const v = e.target.value;
    if (v === 'new') {
      const r = await ask({ title: 'New character', placeholder: 'NAME' });
      const name = normName(r.value);
      if (r.action === 'ok' && name) { b.type = 'line'; b.who = name; }
    } else if (v.startsWith('c:')) { b.type = 'line'; b.who = v.slice(2); }
    else { b.type = v; delete b.who; }
    delete b.ask;
    edited(scene);
    rerenderEditKeepScroll(scene);
  }
  if (e.target.id === 'myName') {
    settings.myName = e.target.value.trim(); saveSettings();
    if (scene?.raw && settings.myName && (!scene.edited || confirm('Re-run the breakdown to remove your name? Your manual edits to this scene will be replaced.'))) reparse(scene);
  }
  // Cast screen settings
  if (e.target.id === 'voice') { settings.voiceURI = e.target.value; saveSettings(); }
  if (e.target.id === 'readActions') { settings.readActions = e.target.checked; saveSettings(); }
  if (e.target.id === 'hq') {
    settings.hq = e.target.checked; saveSettings();
    if (settings.hq) { unlockSpeech(); kokoroStart(); }
    renderHQ(); renderVoiceSelect(); renderNarrator();
  }
  if (e.target.id === 'narrator') { settings.narrator = e.target.checked; saveSettings(); renderNarrator(); }
  if (e.target.id === 'narratorRef') { settings.narratorRef = e.target.value; saveSettings(); voicePreview(settings.narratorRef, 'Interior. Precinct, interview room, night.'); }
  if (e.target.id === 'readerRef') { settings.readerRef = e.target.value; saveSettings(); voicePreview(settings.readerRef); renderCastVoices(); }
  if (e.target.id === 'studio') { settings.studio = e.target.checked; saveSettings(); if (settings.studio) { unlockSpeech(); studioCheck(); } else { ST.status = 'off'; renderVoicesPanel(); renderCastVoices(); renderNarrator(); } }
  if (e.target.id === 'studioUrl') { settings.studioUrl = e.target.value.trim(); saveSettings(); if (settings.studio) studioCheck(); }
  if (e.target.id === 'nVoiceURI') { settings.nVoiceURI = e.target.value; saveSettings(); }
  if (e.target.id === 'kEngine') {
    settings.kEngine = e.target.value; saveSettings();
    if (K.status === 'ready' || K.status === 'failed') { kKill(); K.status = 'off'; kokoroStart(); }
  }
  if (e.target.matches('.cv-k')) {
    const sc = getScene(current.id);
    const name = e.target.closest('.cv').dataset.name;
    sc.cast = sc.cast || {};
    const c = { ...(sc.cast[name] || {}) }; delete c.k; c.v = e.target.value; sc.cast[name] = c;
    touch(sc);
    previewChar(sc, name);
  }
  if (e.target.id === 'speakNames') { settings.speakNames = e.target.checked; saveSettings(); }
  if (e.target.id === 'allLangs') { settings.allLangs = e.target.checked; saveSettings(); renderVoiceSelect(); }
  if (e.target.matches('.cv-voice, .cv-pitch')) {
    const scene = getScene(current.id);
    const name = e.target.closest('.cv').dataset.name;
    scene.cast = scene.cast || {};
    const c = (scene.cast[name] = scene.cast[name] || {});
    if (e.target.matches('.cv-voice')) c.voiceURI = e.target.value; else c.pitch = e.target.value;
    touch(scene);
    previewChar(scene, name);
  }
});

function rerenderEditKeepScroll(scene) {
  const y = window.scrollY;
  renderEdit(scene);
  window.scrollTo(0, y);
}

/* ------------------------------------------------------------------ CAST */

function voiceOptions(list, selected, first = '') {
  const opt = (x) => `<option value="${esc(x.voiceURI)}" ${x.voiceURI === selected ? 'selected' : ''}>${voiceTier(x) === 'best' ? '★ ' : ''}${esc(x.name)} · ${esc(x.lang)}${x.localService ? '' : ' · online'}</option>`;
  const group = (label, tier) => { const g = list.filter((x) => voiceTier(x) === tier); return g.length ? `<optgroup label="${label}">${g.map(opt).join('')}</optgroup>` : ''; };
  return first + group('★ Best quality', 'best') + group('Standard', 'std') + group('Novelty', 'novelty');
}

// Voice + pitch rows for every character except you
function renderCastVoices() {
  const box = $('#cast-voices');
  if (!box) return;
  const scene = getScene(current.id);
  const others = characters(scene.blocks).map((c) => c.name).filter((n) => n !== scene.me);
  const list = voiceList();
  box.innerHTML = others.length ? others.map((n) => {
    const c = castFor(scene, n);
    const p = String(Number(c.pitch) || 1);
    if (settings.hq || ST.status === 'ready') return `<div class="cv" data-name="${esc(n)}">
      <div class="cv-head"><span class="cv-name">${esc(n)}</span>
        <button class="icon-btn sm" data-act="preview-char" data-name="${esc(n)}" aria-label="Hear ${esc(n)}">${I.play}</button></div>
      <div class="cv-row one"><select class="cv-k" aria-label="Voice for ${esc(n)}">${refOptions(c.v || (c.k ? 'kokoro:' + c.k : ''), '<option value="">Same as reader</option>')}</select></div>
    </div>`;
    return `<div class="cv" data-name="${esc(n)}">
      <div class="cv-head"><span class="cv-name">${esc(n)}</span>
        <button class="icon-btn sm" data-act="preview-char" data-name="${esc(n)}" aria-label="Hear ${esc(n)}">${I.play}</button></div>
      <div class="cv-row">
        <select class="cv-voice" aria-label="Voice for ${esc(n)}">${voiceOptions(list, findVoice(c.voiceURI) ? c.voiceURI : '', `<option value="">Reader voice</option>`)}</select>
        <select class="cv-pitch" aria-label="Pitch for ${esc(n)}">${PITCHES.map(([val, label]) => `<option value="${val}" ${val === p ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </div>
    </div>`;
  }).join('') : '<p class="note">Pick your character first.</p>';
}


// Speak this character's first line in their voice
function previewChar(scene, name) {
  unlockSpeech(); stopSpeech();
  const b = scene.blocks.find((x) => x.type === 'line' && x.who === name);
  const line = b ? speakable(stripName(b.text, name)) : 'Hello.';
  const b2 = b || {};
  say((settings.speakNames ? titleCase(name) + '. ' : '') + line.slice(0, 160), { voice: voiceFor(scene, name), pitch: pitchFor(scene, name), ref: refFor(scene, name), tone: b2.tone, cadence: b2.cadence });
}

// Give each other character a different voice (or a different pitch, if this device has only one voice)
function autoCast(scene) {
  const others = characters(scene.blocks).map((c) => c.name).filter((n) => n !== scene.me);
  if (settings.hq || ST.status === 'ready') {
    // Best voices first, alternating male/female, skipping the reader's voice; favourites win
    const cat = catalogue().filter((v) => !v.speakers && v.ref !== readerRef());
    const fav = (settings.vFavs || []).filter((r) => r !== readerRef() && cat.some((v) => v.ref === r));
    const m = cat.filter((v) => v.gender === 'Male').sort((a, b) => a.rank - b.rank).map((v) => v.ref);
    const f = cat.filter((v) => v.gender === 'Female').sort((a, b) => a.rank - b.rank).map((v) => v.ref);
    const pool = [...new Set([...fav, ...m.flatMap((r, i) => [r, f[i]]).filter(Boolean)])];
    scene.cast = scene.cast || {};
    others.forEach((n, i) => { const c = { ...(scene.cast[n] || {}) }; delete c.k; c.v = i === 0 ? '' : pool[(i - 1) % pool.length]; scene.cast[n] = c; });
    touch(scene);
    renderCastVoices();
    return toast('Each character now has their own voice. Tip: favourites (♥) are used first.');
  }
  const pool = voiceList().filter((v) => voiceTier(v) !== 'novelty');
  const reader = currentVoice();
  const ordered = reader ? [reader, ...pool.filter((v) => v.voiceURI !== reader.voiceURI)] : pool;
  const pitchCycle = ['1', '0.9', '1.1', '0.75', '1.25'];
  scene.cast = {};
  others.forEach((n, i) => {
    const v = ordered.length ? ordered[i % ordered.length] : null;
    const round = ordered.length ? Math.floor(i / ordered.length) : i;
    scene.cast[n] = { voiceURI: v && i ? v.voiceURI : '', pitch: pitchCycle[round % pitchCycle.length] };
  });
  touch(scene);
  renderCastVoices();
  toast(ordered.length > 1 ? 'Each character now has their own voice.' : 'This device has one voice, so each character gets a different pitch.');
}


function renderHQProgress() {
  const fill = $('#kbar-fill'), txt = $('#kbar-text');
  if (!fill || !txt) return;
  const mb = (b) => (b / 1e6).toFixed(0);
  const pct = K.total ? Math.min(100, (K.loaded / K.total) * 100) : 0;
  fill.style.width = (K.total ? pct : 3) + '%';
  txt.textContent = !K.total ? 'Starting the voice engine…'
    : pct < 99.5 ? `Downloading voice model… ${mb(K.loaded)} of ${mb(K.total)} MB`
      : 'Preparing the voice engine…';
}

function renderVoiceSelect() {
  const sel = $('#voice');
  if (!sel) return;
  const v = currentVoice();
  const list = voiceList();
  sel.innerHTML = list.length ? voiceOptions(list, v && v.voiceURI) : '<option>Default voice</option>';
  renderCastVoices();
  const note = $('#voice-note');
  const noLocal = allVoices.length && !allVoices.some((x) => x.localService);
  if (note) {
    note.textContent = noLocal
      ? 'This browser only has online voices, which would send your lines away — so they’re turned off. Use High-quality voices instead.'
      : settings.hq ? 'Used as a backup if High-quality voices aren’t ready. On-device only — your lines never leave this device.'
        : 'On-device voices only, so your lines never leave this device. Best quality first.';
  }
}

function renderCast(scene) {
  document.title = 'Pick your character · Scene Reader';
  const chars = characters(scene.blocks);
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="back-edit" aria-label="Back to script">${I.back}</button>
      <div class="top-title">${esc(scene.title)}</div>
    </header>
    <main class="wrap cast">
      <h1 class="step-h"><span class="step">2</span>Who are you playing?</h1>
      <div class="cast-list">
        ${chars.map((c) => `
          <button class="cast-btn ${scene.me === c.name ? 'on' : ''}" data-act="pick-me" data-name="${esc(c.name)}">
            <span class="cast-name">${esc(c.name)}</span>
            <span class="cast-count">${c.count} line${c.count === 1 ? '' : 's'}</span>
          </button>`).join('')}
      </div>

      <h2 class="section-h">Voices</h2>
      <div class="panel settings" id="hq-panel"></div>

      <h2 class="section-h">Reader</h2>
      <div class="panel settings">
        <label class="field"><span>Device voice</span><select id="voice"></select></label>
        <p class="note" id="voice-note"></p>
        <div class="field"><span>Speed</span>${speedStepper()}</div>
        <label class="toggle"><input type="checkbox" id="speakNames" ${settings.speakNames ? 'checked' : ''}><span class="track"></span><span>Say character names before lines <em>(table-read style)</em></span></label>
        <label class="toggle"><input type="checkbox" id="allLangs" ${settings.allLangs ? 'checked' : ''}><span class="track"></span><span>Show voices in all languages <em>(accents)</em></span></label>
        <button class="btn ghost" data-act="test-voice">${I.play}<span>Hear the reader</span></button>
      </div>

      <h2 class="section-h">Narrator</h2>
      <div class="panel settings" id="narrator-panel"></div>

      <h2 class="section-h">Character voices</h2>
      <div class="panel settings">
        <p class="note cv-note">Give the other characters their own voice so it sounds like a real scene partner. ★ marks the most natural-sounding voices.</p>
        <div id="cast-voices" class="cast-voices"></div>
        <button class="btn ghost" data-act="auto-cast"><span>Give everyone a different voice</span></button>
        <details class="tips">
          <summary>Get better voices on this device</summary>
          <ul>
            <li><strong>Best option:</strong> switch on <em>High-quality voices</em> above — natural AI voices that run on this device.</li>
            <li><strong>Android:</strong> Settings → search <em>Text-to-speech</em> → Preferred engine: <em>Speech Services by Google</em> → ⚙ → <em>Install voice data</em> → English (United States) → tap a voice to download it, and turn off <em>Use network voices</em> if shown. Then close and reopen Scene Reader.</li>
            <li><strong>Windows:</strong> Settings → Time &amp; language → Speech → <em>Manage voices</em> → <em>Add voices</em> → English. Restart the browser after. (Edge's “Online (Natural)” voices send your lines to Microsoft, so Scene Reader hides them.)</li>
            <li><strong>iPhone / Mac:</strong> Settings → Accessibility → Spoken Content → Voices → download an <em>Enhanced</em> or <em>Premium</em> voice.</li>
          </ul>
        </details>
      </div>
      <h2 class="section-h">More with this scene</h2>
      <div class="btn-row more-row">
        <button class="btn" data-go="#/prep/${scene.id}"><span>Prep this scene</span></button>
        <button class="btn" data-act="pj-make" data-id="${scene.id}"><span>${scene.project ? 'Open collab project' : 'Make a collab project'}</span></button>
      </div>
    </main>
    <footer class="dock">
      <button class="btn huge primary" data-act="to-run" ${scene.me ? '' : 'disabled'}>${scene.me ? `Rehearse as ${esc(scene.me)}` : 'Pick a character'}</button>
    </footer>`;
  renderVoiceSelect();
  renderHQ();
  renderNarrator();
  if (settings.hq) kokoroStart();
  if (settings.studio && ST.status !== 'ready') studioCheck(true);
}

function renderNarrator() {
  const box = $('#narrator-panel');
  if (!box) return;
  box.innerHTML = `
    <label class="toggle"><input type="checkbox" id="narrator" ${settings.narrator ? 'checked' : ''}><span class="track"></span><span><strong>Narrator</strong> — reads scene headings and stage directions in a separate voice</span></label>
    ${settings.narrator ? `<div class="cv-row ${settings.hq ? 'one' : ''}">
      ${settings.hq || ST.status === 'ready' ? `<select id="narratorRef" aria-label="Narrator voice">${refOptions(narratorRef())}</select>`
        : `<select id="nVoiceURI" aria-label="Narrator voice">${voiceOptions(voiceList(), settings.nVoiceURI, '<option value="">Reader voice</option>')}</select>`}
      </div>
      <button class="btn ghost" data-act="n-preview">${I.play}<span>Hear the narrator</span></button>` : ''}`;
}
const narratorDeviceVoice = () => findVoice(settings.nVoiceURI) || currentVoice();
// "INT. PRECINCT - NIGHT" → "Interior. Precinct, night."
function headingSpeech(t) {
  return t.replace(/^\s*INT\.?\s*\/\s*EXT\.?/i, 'Interior, exterior.').replace(/^\s*EXT\.?\s*\/\s*INT\.?/i, 'Exterior, interior.')
    .replace(/^\s*INT\.?\s*/i, 'Interior. ').replace(/^\s*EXT\.?\s*/i, 'Exterior. ')
    .replace(/\s+[-–—]\s+/g, ', ').toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()) + '.';
}

const RATES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2];
const fmtRate = (r) => (Number.isInteger(r) ? r.toFixed(1) : String(r)) + '×';
function speedStepper() {
  return `<div class="stepper">
    <button class="icon-btn" data-act="slower" aria-label="Slower">${I.minus}</button>
    <span class="rate" aria-live="polite">${fmtRate(settings.rate)}</span>
    <button class="icon-btn" data-act="faster" aria-label="Faster">${I.plus}</button>
  </div>`;
}
function changeRate(dir) {
  let i = RATES.findIndex((r) => r >= settings.rate - 0.001);
  if (i < 0) i = RATES.indexOf(1);
  settings.rate = RATES[Math.max(0, Math.min(RATES.length - 1, i + dir))];
  saveSettings();
  $$('.rate').forEach((el) => (el.textContent = fmtRate(settings.rate)));
}

/* ------------------------------------------------------------------ RUN (rehearse) */

const run = { idx: 0, playing: false, waiting: false, done: false, token: 0, scene: null, shown: -1 };
const GAP_MS = 280;

function renderRun(scene) {
  document.title = scene.title + ' · Scene Reader';
  run.scene = scene;
  Object.assign(run, { idx: firstSpeakable(scene), playing: false, waiting: false, done: false, shown: -1 });
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="back-cast" aria-label="Back">${I.back}</button>
      <div class="top-title"><span class="you-tag">${esc(scene.me)}</span>${esc(scene.title)}</div>
      <span class="rm-badge" id="rm-badge" ${RM.role === 'host' && RM.connected ? '' : 'hidden'}>Remote ●</span>
      <button class="icon-btn" data-go="#/keys/${scene.id}" aria-label="Hands-free: clicker, pedal or remote phone" title="Hands-free">${I.remote}</button>
      <div class="font-btns">
        <button class="icon-btn" data-act="font-down" aria-label="Smaller text">A<small>−</small></button>
        <button class="icon-btn" data-act="font-up" aria-label="Bigger text">A<small>+</small></button>
      </div>
    </header>
    <main class="script" id="script" style="--script:${settings.fontSize}px">
      ${scene.blocks.map((b, i) => runBlock(scene, b, i)).join('')}
      <div class="end-mark">End of scene</div>
    </main>
    <footer class="dock run-dock">
      <button class="cue-btn" id="cue" data-act="primary"></button>
      <div class="controls">
        <button class="icon-btn" data-act="restart" aria-label="Restart scene">${I.restart}</button>
        <button class="icon-btn" data-act="prev" aria-label="Previous line">${I.prev}</button>
        <button class="icon-btn play" data-act="playpause" aria-label="Play or pause" id="pp">${I.play}</button>
        <button class="icon-btn" data-act="next" aria-label="Next line">${I.next}</button>
        ${speedStepper()}
      </div>
    </footer>`;
  keepAwake(true);
  paint();
}

// Small tags: direction (leaning in), tone (angry), pauses
function tagsHtml(b) {
  const t = [];
  if (b.dir) t.push(`<span class="tag dir">${esc(b.dir)}</span>`);
  if (b.tone && b.tone !== 'neutral' && TONES[b.tone]) t.push(`<span class="tag tone t-${b.tone}">${TONES[b.tone].label}</span>`);
  if (b.cadence && CADENCES[b.cadence]) t.push(`<span class="tag tone">${CADENCES[b.cadence].label}</span>`);
  if (+b.pauseBefore) t.push(`<span class="tag pause">⏸ ${b.pauseBefore}s before</span>`);
  if (+b.pauseAfter) t.push(`<span class="tag pause">⏸ ${b.pauseAfter}s after</span>`);
  return t.length ? `<span class="tags">${t.join('')}</span>` : '';
}

function runBlock(scene, b, i) {
  const fmt = (t) => esc(t).replace(/\(([^)]*)\)/g, '<span class="paren">($1)</span>').replace(/\*([^*]+)\*/g, '<strong class="emph">$1</strong>').replace(/\s\/\s/g, ' <span class="breath" title="breath">/</span> ');
  if (b.type === 'heading') return `<div class="rb heading" data-i="${i}">${esc(b.text)}</div>`;
  if (b.type === 'action') return `<div class="rb action" data-i="${i}">${fmt(b.text)}</div>`;
  const mine = b.who === scene.me;
  const px = prepRunExtras(scene, b);
  return `${px.before}<div class="rb line ${mine ? 'mine' : 'theirs'}" data-i="${i}">
    <div class="speaker">${esc(b.who)}${mine ? '<span class="you">you</span>' : ''}${tagsHtml(b)}${px.tag}</div>
    <div class="txt">${fmt(b.text)}</div>
  </div>`;
}

// What the reader (or narrator) says for a block, in which voice and tone
function lineSpeech(scene, b) {
  let text = b.type === 'heading' ? headingSpeech(b.text) : speakable(b.type === 'line' ? stripName(b.text, b.who) : b.text);
  if (!text) return { text: '', opts: {} };
  const opts = b.type === 'line'
    ? { voice: voiceFor(scene, b.who), pitch: pitchFor(scene, b.who), ref: refFor(scene, b.who), tone: b.tone, cadence: b.cadence }
    : { voice: narratorDeviceVoice(), ref: narratorRef(), tone: b.tone, cadence: b.cadence };
  // Table-read style: "Dev. You picked the worst diner in the city."
  if (b.type === 'line' && settings.speakNames) text = titleCase(b.who) + '. ' + text;
  return { text, opts };
}

const isStop = (b) => b.type === 'line' || (settings.narrator && (b.type === 'action' || b.type === 'heading'));
function firstSpeakable(scene) { const i = scene.blocks.findIndex(isStop); return i < 0 ? 0 : i; }

function step() {
  const tok = ++run.token;
  const blocks = run.scene.blocks;
  // Skip things we don't read aloud
  while (run.idx < blocks.length && !isStop(blocks[run.idx])) run.idx++;
  if (run.idx >= blocks.length) {
    Object.assign(run, { playing: false, waiting: false, done: true });
    return paint();
  }
  const b = blocks[run.idx];
  // Optional pause before this line (tone tag sheet)
  const before = (Number(b.pauseBefore) || 0) * 1000;
  if (before && run.preDone !== run.idx) {
    run.preDone = run.idx; run.waiting = false; paint();
    return setTimeout(() => { if (tok === run.token && run.playing) step(); }, before);
  }
  if (b.type === 'line' && b.who === run.scene.me) {
    run.waiting = true;
    vPrefetch(run.scene, run.idx + 1); // get the reply ready while you say your line
    return paint();
  }
  run.waiting = false;
  paint();
  const { text, opts } = lineSpeech(run.scene, b);
  if (!text) { run.idx++; return step(); }
  vPrefetch(run.scene, run.idx + 1);
  say(text, opts).then(() => {
    if (tok !== run.token || !run.playing) return;
    setTimeout(() => {
      if (tok !== run.token || !run.playing) return;
      run.idx++;
      step();
    }, GAP_MS + (Number(b.pauseAfter) || 0) * 1000);
  });
}

function halt() { run.token++; stopSpeech(); }

function play(from) {
  unlockSpeech();
  hfMediaOn();
  halt();
  if (from !== undefined) run.idx = Math.max(0, Math.min(from, run.scene.blocks.length - 1));
  Object.assign(run, { playing: true, done: false, waiting: false, preDone: -1 });
  step();
}

function pause() {
  halt();
  run.playing = false;
  run.waiting = false;
  paint();
}

function primary() {
  if (run.done) return play(firstSpeakable(run.scene));
  if (run.waiting) {
    const after = (Number(run.scene.blocks[run.idx]?.pauseAfter) || 0) * 1000;
    run.idx++;
    if (!after) return play();
    Object.assign(run, { waiting: false, playing: true }); paint();
    const tok = ++run.token;
    return setTimeout(() => { if (tok === run.token && run.playing) play(); }, after);
  }
  if (run.playing) { run.idx++; return play(); } // skip the reader's line
  play();
}

function stepTo(dir) {
  const blocks = run.scene.blocks;
  let i = run.idx + dir;
  while (i >= 0 && i < blocks.length && !isStop(blocks[i])) i += dir;
  if (i < 0 || i >= blocks.length) return;
  if (run.playing || run.waiting) play(i);
  else { halt(); run.idx = i; run.done = false; paint(); }
}

function paint() {
  const scene = run.scene;
  const blocks = $$('.rb');
  blocks.forEach((el) => {
    const i = +el.dataset.i;
    el.classList.toggle('current', i === run.idx && !run.done);
    el.classList.toggle('past', run.done || i < run.idx);
  });

  const cue = $('#cue');
  const b = scene.blocks[run.idx];
  let label, sub, cls;
  if (run.done) { label = 'Scene done'; sub = 'Tap to run it again'; cls = 'done'; }
  else if (run.waiting) { label = 'Your line'; sub = 'Tap or press Space when you’re done'; cls = 'mine'; }
  else if (run.playing) { label = b?.type === 'line' ? `${b.who} is reading` : 'Reading direction'; sub = 'Tap to skip ahead'; cls = 'reading'; }
  else { label = run.idx === firstSpeakable(scene) ? 'Start scene' : 'Paused'; sub = 'Tap to ' + (run.idx === firstSpeakable(scene) ? 'begin' : 'resume') + ' · Space'; cls = 'idle'; }
  cue.className = 'cue-btn ' + cls;
  cue.innerHTML = `<span class="cue-label">${esc(label)}</span><span class="cue-sub">${esc(sub)}</span>`;
  $('#pp').innerHTML = run.playing || run.waiting ? I.pause : I.play;
  rmSendState();

  if (run.shown !== run.idx && !run.done) {
    run.shown = run.idx;
    const el = blocks[run.idx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function leaveRun() {
  hfMediaOff();
  halt();
  run.playing = false;
  keepAwake(false);
}

function setFont(d) {
  settings.fontSize = Math.max(16, Math.min(44, settings.fontSize + d));
  saveSettings();
  $('#script')?.style.setProperty('--script', settings.fontSize + 'px');
  run.shown = -1; paint();
}

/* ------------------------------------------------------------------ clicks */

app.addEventListener('click', async (e) => {
  // Tap a line in the script to jump there
  const rb = e.target.closest('.rb');
  if (rb && current.view === 'run') {
    const i = +rb.dataset.i;
    if (run.waiting && i === run.idx) return primary(); // tapping your highlighted line = done
    if (!isStop(run.scene.blocks[i])) return;
    return play(i);
  }

  const goBtn = e.target.closest('[data-go]');
  if (goBtn) return go(goBtn.dataset.go);
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const scene = getScene(current.id);
  if (hfClick(act, btn)) return;
  if (act.startsWith('lib-')) { await libClick(act, btn); return; }
  if (prepClick(act, btn)) return;
  if (await voClick(act, btn)) return;
  if (await pjClick(act, btn)) return;

  switch (act) {
    // home
    case 'pick-file': $('#file').click(); break;
    case 'use-paste': {
      const t = $('#paste').value.trim();
      if (!t) { toast('Paste your scene into the box first.'); $('#paste').focus(); break; }
      createScene(t, 'Pasted scene');
      break;
    }
    case 'sample': createScene(SAMPLE, 'Sample scene'); break;
    case 'open': { const s = getScene(btn.dataset.id); go(s.me ? '#/cast/' + s.id : '#/edit/' + s.id); break; }
    case 'edit': go('#/edit/' + btn.dataset.id); break;
    case 'delete': {
      const s = getScene(btn.dataset.id);
      if (confirm(`Delete “${s.title}” from this device?`)) { scenes = scenes.filter((x) => x !== s); saveScenes(); renderHome(); }
      break;
    }
    case 'install': installEvt?.prompt(); installEvt = null; renderHome(); break;
    case 'home': go('#/'); break;

    // edit
    case 'rename': {
      const old = btn.dataset.name;
      const r = await ask({ title: `Rename ${old}`, value: old, extra: 'Not a character' });
      if (r.action === 'extra') {
        scene.blocks.forEach((b) => { if (b.type === 'line' && b.who === old) { b.type = 'action'; delete b.who; } });
        if (scene.me === old) scene.me = '';
      } else if (r.action === 'ok') {
        const name = normName(r.value);
        if (!name) break;
        scene.blocks.forEach((b) => { if (b.type === 'line' && b.who === old) b.who = name; });
        if (scene.me === old) scene.me = name;
        // Two lines in a row by the same person after a merge are left as-is (user can join them).
      } else break;
      touch(scene);
      rerenderEditKeepScroll(scene);
      break;
    }
    case 'tone': await toneSheet(scene, blockOf(scene, btn)); break;
    case 'voice-lib': openVoiceLibrary(); break;
    case 'n-preview': {
      unlockSpeech(); stopSpeech();
      const b = scene?.blocks.find((x) => x.type === 'heading') || { type: 'heading', text: 'INT. COFFEE SHOP - DAY' };
      const { text, opts } = lineSpeech(scene || { blocks: [] }, b);
      say(text, opts);
      break;
    }
    case 'next-ask': {
      const el = $('.eblock.ask');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); }
      break;
    }
    case 'ask-yes': {
      const b = blockOf(scene, btn);
      delete b.ask; b.conf = 1; touch(scene);
      rerenderEditKeepScroll(scene);
      break;
    }
    case 'ask-no': {
      const i = scene.blocks.findIndex((x) => x.id === btn.closest('.eblock').dataset.id);
      const b = scene.blocks[i], prev = scene.blocks[i - 1];
      const back = b.ask.kind === 'cue' ? ((b.cue || b.who) + ' ' + b.text) : b.text;
      if (prev && prev.type !== 'heading') { prev.text = (prev.text + ' ' + back).trim(); scene.blocks.splice(i, 1); }
      else { b.type = 'action'; delete b.who; b.text = back; delete b.ask; }
      edited(scene);
      rerenderEditKeepScroll(scene);
      break;
    }
    case 'ask-change': {
      const b = blockOf(scene, btn);
      if (await reassign(scene, b, 'Who says this line?')) { delete b.ask; edited(scene); rerenderEditKeepScroll(scene); }
      break;
    }
    case 'merge': {
      const next = btn.closest('.gap').nextElementSibling;
      const i = scene.blocks.findIndex((x) => x.id === next.dataset.id);
      if (i > 0) {
        const prev = scene.blocks[i - 1];
        prev.text = (prev.text + ' ' + scene.blocks[i].text).trim();
        delete prev.ask;
        scene.blocks.splice(i, 1);
        edited(scene);
        rerenderEditKeepScroll(scene);
      }
      break;
    }
    case 'split': {
      const el = btn.closest('.eblock');
      const ta = $('.etext', el);
      const b = blockOf(scene, btn);
      const at = ta.selectionStart;
      const head = ta.value.slice(0, at).trim(), tail = ta.value.slice(at).trim();
      if (!head || !tail) { toast('Put the cursor where the new line should start, then tap Split.'); ta.focus(); break; }
      b.text = head;
      const nb = { id: newId(), type: b.type, text: tail };
      if (b.type === 'line') nb.who = b.who;
      // "…answer. JULES all it was" — if the new part starts with a character's name, use it
      const names = characters(scene.blocks).map((c) => c.name).sort((x, y) => y.length - x.length);
      const hit = names.find((n) => new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + "(?:\\s*\\([^)]*\\))?\\s*:?\\s+").test(tail + ' '));
      if (hit) {
        nb.type = 'line'; nb.who = hit;
        nb.text = tail.replace(new RegExp('^' + hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + "(?:\\s*\\((?:V\\.?O|O\\.?S|O\\.?C|CONT)[^)]*\\))?\\s*:?\\s*"), '');
      }
      const i = scene.blocks.indexOf(b);
      scene.blocks.splice(i + 1, 0, nb);
      edited(scene);
      rerenderEditKeepScroll(scene);
      if (!hit) { const done = await reassign(scene, nb, 'Who says the new part?'); if (done) { edited(scene); rerenderEditKeepScroll(scene); } }
      else toast('Split — the new part is ' + hit + '.');
      break;
    }
    case 'ignore-sel': {
      const ta = $('.etext', btn.closest('.eblock'));
      const phrase = ta.value.slice(ta.selectionStart, ta.selectionEnd).replace(/\s+/g, ' ').trim();
      if (phrase.length < 2) { toast('Select the junk text first (press and drag), then tap Ignore this text.'); ta.focus(); break; }
      ignorePhrase(scene, phrase);
      break;
    }
    case 'put-back': {
      const key = btn.dataset.key;
      if (scene.edited && !confirm('Putting this back re-runs the breakdown, which replaces your manual edits to this scene. Continue?')) break;
      const item = (scene.cleanup || []).find((x) => x.key === key);
      scene.ignore = (scene.ignore || []).filter((x) => junkKey(x) !== key);
      if (item && item.kind !== 'ignored') scene.keep = [...new Set([...(scene.keep || []), item.text])];
      reparse(scene);
      toast('Put back.');
      break;
    }
    case 'reparse':
      if (!scene.edited || confirm('Re-run the breakdown? Your manual edits to this scene will be replaced.')) { reparse(scene); toast('Breakdown re-run.'); }
      break;
    case 'join': {
      const i = scene.blocks.findIndex((b) => b.id === btn.closest('.eblock').dataset.id);
      if (i > 0) {
        scene.blocks[i - 1].text = (scene.blocks[i - 1].text + ' ' + scene.blocks[i].text).trim();
        scene.blocks.splice(i, 1);
        touch(scene);
        rerenderEditKeepScroll(scene);
      }
      break;
    }
    case 'add':
    case 'add-end': {
      const i = act === 'add' ? scene.blocks.findIndex((b) => b.id === btn.closest('.eblock').dataset.id) : scene.blocks.length - 1;
      const ref = scene.blocks[i];
      const nb = { id: newId(), type: 'line', who: ref?.type === 'line' ? ref.who : characters(scene.blocks)[0]?.name || 'NEW', text: '' };
      scene.blocks.splice(i + 1, 0, nb);
      edited(scene);
      rerenderEditKeepScroll(scene);
      $(`.eblock[data-id="${nb.id}"] textarea`)?.focus();
      break;
    }
    case 'del': {
      const el = btn.closest('.eblock');
      scene.blocks = scene.blocks.filter((b) => b.id !== el.dataset.id);
      edited(scene);
      rerenderEditKeepScroll(scene);
      break;
    }
    case 'to-cast':
      if (!characters(scene.blocks).length) { toast('No character lines yet — set a speaker on at least one line.'); break; }
      go('#/cast/' + scene.id);
      break;

    // cast
    case 'back-edit': go('#/edit/' + scene.id); break;
    case 'pick-me':
      scene.me = btn.dataset.name;
      touch(scene);
      $$('.cast-btn').forEach((b) => b.classList.toggle('on', b === btn));
      renderCastVoices();
      { const go2 = $('[data-act="to-run"]'); go2.disabled = false; go2.textContent = 'Rehearse as ' + scene.me; }
      break;
    case 'test-voice': unlockSpeech(); stopSpeech(); say('Hi. I’ll be reading with you today. Whenever you’re ready.'); break;
    case 'preview-char': previewChar(scene, btn.dataset.name); break;
    case 'v-preview': voicePreview(readerRef()); break;
    case 'studio-connect': settings.studio = true; saveSettings(); unlockSpeech(); studioCheck(); break;
    case 'k-retry': kKill(); K.status = 'off'; kokoroStart(); break;
    case 'auto-cast': autoCast(scene); break;
    case 'slower': changeRate(-1); break;
    case 'faster': changeRate(1); break;
    case 'to-run': stopSpeech(); go('#/run/' + scene.id); break;

    // run
    case 'back-cast': go('#/cast/' + scene.id); break;
    case 'primary': primary(); break;
    case 'playpause': (run.playing || run.waiting) ? pause() : play(); break;
    case 'restart': play(firstSpeakable(run.scene)); break;
    case 'prev': stepTo(-1); break;
    case 'next': stepTo(1); break;
    case 'font-up': setFont(2); break;
    case 'font-down': setFont(-2); break;
  }
});

/* keyboard, clickers, pedals, media buttons and the remote phone: see handsfree.js */

/* ------------------------------------------------------------------ boot */

if (!synth) setTimeout(() => toast('This browser can’t speak text aloud. Try Chrome, Safari or Edge.'), 600);
// High-quality voices were on last time: start loading them in the background (from cache after the first time)
if (settings.hq && location.protocol !== 'file:') setTimeout(kokoroStart, 1200);
if (settings.studio) setTimeout(() => studioCheck(true), 1500);
// Auto-update: check for a new version on every open / return to the app, and switch to it.
let reloadPending = false;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; } // first install — this page is already the newest version
    if (reloadPending) return;
    reloadPending = true;
    if (current.view === 'run' && (run.playing || run.waiting)) toast('Update ready — it’ll apply when you leave this scene.');
    else location.reload();
  });
}
libLoad().then((list) => { scenes = list; route(); });
