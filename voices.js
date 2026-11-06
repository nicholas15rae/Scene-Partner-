// Scene Reader — voices: engines, catalogue, player and voice library (plain script, loaded before app.js).
//
// A voice is named by a "ref":  kokoro:am_michael · piper:en_US-ryan-high · piper:en_US-libritts_r-medium#42
//                               studio:default · import:piper:my-voice · import:kokoro:am_myvoice
// Engines, best effort first:  Studio (your desktop GPU) → Piper / Kokoro (in this browser) → device voice.
// PRIVACY: speech is generated on this device, or on a server on YOUR OWN computer/network. Never the cloud.
'use strict';

const { perform } = window.SceneTones;

/* ------------------------------------------------------------------ catalogue */

const ENGINE_LABEL = { kokoro: 'Kokoro', piper: 'Piper', studio: 'Studio', import: 'Imported' };
function parseRef(ref) {
  if (!ref) return { engine: 'device', id: '' };
  if (ref.startsWith('import:')) { const [, engine, ...rest] = ref.split(':'); return { engine, id: rest.join(':'), imported: true }; }
  const i = ref.indexOf(':');
  const engine = ref.slice(0, i), full = ref.slice(i + 1);
  const [id, sp] = full.split('#');
  return { engine, id, speaker: sp !== undefined ? +sp : undefined };
}
const importedVoices = () => (settings.imported || []).map((v) => ({ ...v, imported: true }));
const studioVoices = () => (ST.status === 'ready' ? ST.voices : []).map((v) => ({ engine: 'studio', id: v.id, ref: 'studio:' + v.id, name: v.name || v.id, gender: v.gender || 'Mixed', accent: 'Studio', rank: 0 }));
function catalogue() {
  const out = [];
  if (settings.hq) out.push(...window.VoicePacks.flatMap((p) => p.voices), ...importedVoices());
  out.push(...studioVoices());
  return out;
}
function voiceInfo(ref) {
  const r = parseRef(ref);
  const all = [...window.VoicePacks.flatMap((p) => p.voices), ...importedVoices(), ...studioVoices()];
  const base = all.find((v) => v.ref === ref) || all.find((v) => v.engine === r.engine && v.id === r.id && !v.imported === !r.imported);
  if (!base) return { ref, engine: r.engine, id: r.id, name: r.id || 'Device voice', gender: 'Mixed', accent: '' };
  return r.speaker !== undefined ? { ...base, ref, speaker: r.speaker, name: `${base.name.replace(/\s*\(.*\)$/, '')} #${r.speaker}` } : base;
}
const isFavRef = (ref) => (settings.vFavs || []).includes(ref);
const piperReady = (id) => P.loaded.has(id);

// Reader / narrator / per-character voice (with v1.2–1.3 settings carried over)
const readerRef = () => settings.readerRef || 'kokoro:' + (settings.kVoice || 'af_heart');
const narratorRef = () => settings.narratorRef || 'kokoro:' + (settings.nVoice || 'bm_fable');
function refFor(scene, who) { const c = castFor(scene, who); return c.v || (c.k ? 'kokoro:' + c.k : readerRef()); }

/* ------------------------------------------------------------------ a small job queue (one at a time, urgent first) */
function makeQueue(send) {
  const q = { jobs: [], busy: null, cache: new Map(), nextId: 1 };
  q.job = (key, payload, urgent) => {
    if (q.cache.has(key)) return Promise.resolve(q.cache.get(key));
    let j = q.busy && q.busy.key === key ? q.busy : q.jobs.find((x) => x.key === key);
    if (j) { if (urgent && q.jobs.includes(j)) { q.jobs.splice(q.jobs.indexOf(j), 1); q.jobs.unshift(j); } return j.promise; }
    j = { id: q.nextId++, key, payload };
    j.promise = new Promise((res, rej) => { j.resolve = res; j.reject = rej; });
    j.promise.catch(() => {});
    urgent ? q.jobs.unshift(j) : q.jobs.push(j);
    q.pump();
    return j.promise;
  };
  q.pump = () => {
    if (q.busy || !q.jobs.length) return;
    const j = q.jobs.shift(); q.busy = j;
    const timer = setTimeout(() => q.done(j.id, null, new Error('Took too long')), 45000 + (j.payload.text || '').length * 200);
    Promise.resolve(send(j)).catch((e) => q.done(j.id, null, e));
    j.timer = timer;
  };
  q.done = (id, clip, err) => {
    const j = q.busy; if (!j || j.id !== id) return;
    clearTimeout(j.timer); q.busy = null;
    if (err) j.reject(err); else { q.cache.set(j.key, clip); while (q.cache.size > 30) q.cache.delete(q.cache.keys().next().value); j.resolve(clip); }
    q.pump();
  };
  q.clear = (err) => { const all = [...q.jobs, ...(q.busy ? [q.busy] : [])]; q.jobs = []; q.busy = null; all.forEach((j) => { clearTimeout(j.timer); j.reject(err || new Error('stopped')); }); };
  return q;
}

/* ------------------------------------------------------------------ Piper (in this browser) */
const P = { worker: null, loaded: new Set(), loading: new Map(), failed: new Map(), progress: null, q: null };
function pWorker() {
  if (P.worker) return P.worker;
  if (location.protocol === 'file:') throw new Error('Piper voices need the website link (Netlify)');
  P.worker = new Worker('piper-worker.js', { type: 'module' });
  P.q = makeQueue((j) => P.worker.postMessage({ id: j.id, type: 'speak', ...j.payload }));
  P.worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'progress') { P.progress = { voice: m.voice, loaded: m.loaded, total: m.total }; renderVoiceProgress(); return; }
    if (m.type === 'audio') return P.q.done(m.id, { pcm: m.pcm, rate: m.rate });
    if (m.type === 'loaded' || (m.type === 'error' && P.pendingLoads.has(m.id))) {
      const cb = P.pendingLoads.get(m.id); P.pendingLoads.delete(m.id);
      return cb && cb(m);
    }
    if (m.type === 'error') P.q.done(m.id, null, new Error(m.message));
  };
  P.worker.onerror = (e) => { console.warn('Piper worker error', e.message); P.q.clear(); P.worker = null; P.loaded.clear(); };
  P.pendingLoads = new Map();
  return P.worker;
}
// Make sure a Piper voice model is downloaded and loaded (resolves when ready)
function piperEnsure(info) {
  if (P.loaded.has(info.id)) return Promise.resolve();
  if (P.loading.has(info.id)) return P.loading.get(info.id);
  const pr = (async () => {
    const w = pWorker();
    const voice = { id: info.id, path: info.path };
    if (info.imported) { const f = await voiceFileGet(info.ref); voice.model = f.model; voice.config = f.config; }
    const id = 'L' + Math.random().toString(36).slice(2);
    const m = await new Promise((res) => { P.pendingLoads.set(id, res); w.postMessage({ id, type: 'load', voice }, voice.model ? [] : []); });
    if (m.type !== 'loaded') throw new Error(m.message || 'Couldn’t load that voice');
    P.loaded.add(info.id);
  })();
  P.loading.set(info.id, pr);
  pr.then(() => { P.loading.delete(info.id); P.failed.delete(info.id); P.progress = null; renderVoiceProgress(); },
    (e) => { P.loading.delete(info.id); P.failed.set(info.id, e.message); P.progress = null; renderVoiceProgress(); toast(`${info.name}: ${e.message}`); });
  renderVoiceProgress();
  return pr;
}

/* ------------------------------------------------------------------ Studio (a server on YOUR computer) */
const ST = { status: 'off', info: null, voices: [], msg: '', q: null };
// Only addresses on this computer or your home network — never an internet server
function isPrivateAddress(u) {
  try {
    const h = new URL(u).hostname.replace(/^\[|\]$/g, '');
    return /^(localhost|127\.\d+\.\d+\.\d+|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|f[cd][0-9a-f]{2}:.*|fe80:.*)$/i.test(h) || /\.(local|lan|home\.arpa)$/i.test(h);
  } catch { return false; }
}
const studioUrl = () => (settings.studioUrl || 'http://127.0.0.1:5123').replace(/\/+$/, '');
async function studioCheck(quiet) {
  if (!isPrivateAddress(studioUrl())) { ST.status = 'failed'; ST.msg = 'For privacy, Studio voices only connect to your own computer or home network (e.g. 127.0.0.1 or 192.168.x.x).'; renderVoicesPanel(); return false; }
  ST.status = 'checking'; renderVoicesPanel();
  try {
    const res = await fetch(studioUrl() + '/health', { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    const info = await res.json();
    if (!info.ok) throw new Error(info.error || 'not ready');
    ST.info = info; ST.voices = info.voices && info.voices.length ? info.voices : [{ id: 'default', name: 'Studio default' }];
    ST.status = 'ready'; ST.msg = '';
    ST.q = ST.q || makeQueue(studioSend);
    if (!quiet) toast('Studio voices connected.');
  } catch (e) {
    ST.status = 'failed';
    ST.msg = 'Studio server not found at ' + studioUrl() + '. Start it on your desktop (studio-server → start-studio), then tap Connect.';
  }
  renderVoicesPanel(); renderCastVoices(); renderNarrator();
  return ST.status === 'ready';
}
async function studioSend(j) {
  const res = await fetch(studioUrl() + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(j.payload) });
  if (!res.ok) throw new Error('Studio error ' + res.status);
  const buf = await res.arrayBuffer();
  const audio = await audioCtx().decodeAudioData(buf);
  ST.q.done(j.id, { pcm: audio.getChannelData(0), rate: audio.sampleRate });
}

/* ------------------------------------------------------------------ the player */

// Which engines to try, in order, for a voice ref (falls back automatically)
function engineChain(ref) {
  const r = parseRef(ref);
  const chain = [];
  if (r.engine === 'studio' && settings.studio && ST.status === 'ready') chain.push('studio');
  if (r.engine === 'piper' && settings.hq) chain.push('piper');
  if (settings.hq && K.status === 'ready') chain.push('kokoro');
  chain.push('device');
  return chain;
}
// A Kokoro stand-in when a Studio/Piper voice can't be used: same gender, best voice
function kokoroFor(ref) {
  const r = parseRef(ref);
  if (r.engine === 'kokoro') return r.id;
  const g = voiceInfo(ref).gender;
  return g === 'Male' ? 'am_michael' : g === 'Female' ? 'af_heart' : (settings.kVoice || 'af_heart');
}

const sleep = (ms, tok) => new Promise((r) => setTimeout(r, ms));
function clipFor(engine, ref, seg, urgent) {
  const r = parseRef(ref);
  const shift = engine === 'studio' ? 1 : Math.pow(2, seg.pitch / 12);
  const speed = Math.max(0.5, Math.min(2, (settings.rate * seg.speed) / shift));
  if (engine === 'kokoro') return kJob(seg.text, kokoroFor(ref), urgent, speed);
  if (engine === 'piper') {
    const info = voiceInfo(ref);
    return piperEnsure(info).then(() => P.q.job(`${info.id}|${r.speaker || 0}|${speed.toFixed(2)}|${seg.text}`, { voiceId: info.id, speaker: r.speaker || 0, text: seg.text, speed }, urgent));
  }
  if (engine === 'studio') {
    const ex = Math.max(0.25, Math.min(2, seg.exaggeration || 0.5));
    const payload = { text: seg.text, voice: r.id || 'default', exaggeration: ex, cfg_weight: ex > 0.9 ? 0.3 : 0.5, temperature: 0.8 };
    return ST.q.job(`${r.id}|${ex}|${seg.text}`, payload, urgent);
  }
  return Promise.reject(new Error('no engine'));
}

async function playAi(plan, engine, ref, tok) {
  const clips = plan.map((s, i) => clipFor(engine, ref, s, i === 0));
  clips.forEach((c) => c.catch(() => {}));
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    const clip = await clips[i];
    if (tok !== K.playTok) return;
    if (s.gapBefore) await sleep(s.gapBefore * 1000 / settings.rate);
    const shift = engine === 'studio' ? 1 : Math.pow(2, s.pitch / 12);
    await kPlay(clip, tok, { rate: shift, gain: s.gain, thin: s.thin });
    if (tok !== K.playTok) return;
    if (s.gap) await sleep(s.gap * 1000 / settings.rate);
  }
}

// Speak a line. opts: { ref, tone, cadence, voice (device voice), pitch (device pitch) }
async function say(text, opts = {}) {
  const plan = perform(text, opts.tone, opts.cadence);
  const ref = opts.ref || readerRef();
  const tok = K.playTok;
  for (const engine of engineChain(ref)) {
    if (tok !== K.playTok) return;
    if (engine === 'device') return sayDevicePlan(plan, opts);
    try { return await playAi(plan, engine, ref, tok); }
    catch (e) {
      console.warn(engine + ' failed, falling back', e);
      if (engine === 'kokoro' && ++K.fails >= 2) kCrash('Too many errors');
      if (engine === 'studio') { ST.status = 'failed'; ST.msg = 'Lost the Studio server — using Kokoro instead.'; toast('Studio server stopped — switched to Kokoro.'); renderVoicesPanel(); }
    }
  }
}
async function sayDevicePlan(plan, opts) {
  const tok = K.playTok;
  for (const s of plan) {
    if (tok !== K.playTok) return;
    if (s.gapBefore) await sleep(s.gapBefore * 1000 / settings.rate);
    await sayDevice(s.text, { ...opts, seg: s });
    if (s.gap && tok === K.playTok) await sleep(s.gap * 1000 / settings.rate);
  }
}
// Warm up the next lines while the current one plays (or while you say yours)
function vPrefetch(scene, fromIdx) {
  let n = 0;
  for (let i = fromIdx; i < scene.blocks.length && n < 2; i++) {
    const b = scene.blocks[i];
    if (!isStop(b) || (b.type === 'line' && b.who === scene.me)) continue;
    const { text, opts } = lineSpeech(scene, b);
    n++;
    if (!text) continue;
    const engine = engineChain(opts.ref)[0];
    if (engine === 'device') continue;
    perform(text, opts.tone, opts.cadence).slice(0, 2).forEach((s) => clipFor(engine, opts.ref, s, false).catch(() => {}));
  }
}

/* ------------------------------------------------------------------ voice pickers */

function refOptions(selected, first = '') {
  const cat = catalogue();
  const label = (v) => `${isFavRef(v.ref) ? '♥ ' : ''}${esc(v.name)} · ${ENGINE_LABEL[v.imported ? 'import' : v.engine]}${v.accent && v.accent !== 'Studio' ? ' · ' + (v.accent === 'American' ? 'US' : v.accent === 'British' ? 'UK' : v.accent) : ''}${v.engine === 'piper' && !v.imported && !piperReady(v.id) && v.size ? ' · ↓' + v.size + ' MB' : ''}`;
  const opt = (v) => `<option value="${esc(v.ref)}" ${v.ref === selected ? 'selected' : ''}>${label(v)}</option>`;
  const favs = (settings.vFavs || []).map((r) => voiceInfo(r)).filter((v) => cat.some((c) => c.engine === v.engine) || v.engine === 'studio');
  const by = (g) => cat.filter((v) => v.gender === g && !v.speakers).sort((a, b) => a.rank - b.rank);
  let html = first;
  if (favs.length) html += `<optgroup label="♥ Favourites">${favs.map(opt).join('')}</optgroup>`;
  const st = cat.filter((v) => v.engine === 'studio');
  if (st.length) html += `<optgroup label="Studio (your desktop)">${st.map(opt).join('')}</optgroup>`;
  html += `<optgroup label="Male voices — best first">${by('Male').filter((v) => v.engine !== 'studio').map(opt).join('')}</optgroup>`;
  html += `<optgroup label="Female voices — best first">${by('Female').filter((v) => v.engine !== 'studio').map(opt).join('')}</optgroup>`;
  const multi = cat.filter((v) => v.speakers);
  if (multi.length) html += `<optgroup label="Hundreds more (pick a number in the voice library)">${multi.map((v) => opt({ ...v, ref: v.ref + '#0', name: v.name.replace(/\s*\(.*\)$/, '') + ' #0' })).join('')}</optgroup>`;
  if (selected && !html.includes(`value="${esc(selected)}"`)) html += `<option value="${esc(selected)}" selected>${esc(voiceInfo(selected).name)}</option>`;
  return html;
}

function voicePreview(ref, text) {
  unlockSpeech(); stopSpeech();
  const info = voiceInfo(ref);
  if (info.engine === 'piper' && !piperReady(info.id)) toast(`Downloading ${info.name}${info.size ? ' (' + info.size + ' MB, once)' : ''}…`);
  return say(text || window.VoicePacks[0].sample, { ref });
}

/* ------------------------------------------------------------------ the Voices panel (cast screen) */

function renderVoicesPanel() {
  const box = $('#hq-panel');
  if (!box) return;
  const st = K.status;
  const where = K.device === 'webgpu' ? 'WebGPU · full quality' : 'on-device · compact model';
  box.innerHTML = `
    <label class="toggle"><input type="checkbox" id="hq" ${settings.hq ? 'checked' : ''}><span class="track"></span><span><strong>High-quality voices</strong> <em>(Kokoro + Piper, in this browser)</em></span></label>
    <p class="note">Natural AI voices that run <strong>on this device</strong>. Kokoro is a one-time ~92 MB download; each Piper voice downloads when you first use it (~63–120 MB). Only voice models are downloaded — your script never leaves your device.</p>
    ${settings.hq ? `
      <div class="hq-status ${st}" id="hq-status" aria-live="polite">
        ${st === 'loading' ? `<div class="kbar"><div id="kbar-fill"></div></div><span id="kbar-text"></span>` : ''}
        ${st === 'ready' ? `<span class="ok">● Kokoro ready</span> <span class="dim">${where}</span>` : ''}
        ${st === 'failed' ? `<span class="warn">${esc(K.msg)}</span> <button class="btn small" data-act="k-retry">Try again</button>` : ''}
        ${st === 'off' ? '<span class="dim">Starting…</span>' : ''}
      </div>
      <div class="hq-status" id="piper-status" hidden></div>` : ''}
    <div class="field col"><span>Reader voice</span><select id="readerRef">${settings.hq || ST.status === 'ready' ? refOptions(readerRef()) : '<option>Device voice (see Reader below)</option>'}</select></div>
    <div class="btn-row"><button class="btn ghost" data-act="v-preview">${I.play}<span>Hear this voice</span></button>
      <button class="btn ghost" data-act="voice-lib"><span>Voice library</span></button></div>

    <details class="studio" ${settings.studio ? 'open' : ''}>
      <summary><strong>Studio voices</strong> <em>— emotional AI voices from your desktop's graphics card</em></summary>
      <label class="toggle"><input type="checkbox" id="studio" ${settings.studio ? 'checked' : ''}><span class="track"></span><span>Use my Studio server</span></label>
      <label class="field col"><span>Server address</span><input id="studioUrl" class="plain" value="${esc(studioUrl())}" autocomplete="off" inputmode="url"></label>
      <div class="hq-status ${ST.status}">
        ${ST.status === 'ready' ? `<span class="ok">● Connected</span> <span class="dim">${esc((ST.info && (ST.info.engine + ' on ' + ST.info.device)) || '')} · ${ST.voices.length} voice${ST.voices.length === 1 ? '' : 's'}</span>`
          : ST.status === 'checking' ? '<span class="dim">Connecting…</span>'
          : ST.status === 'failed' ? `<span class="warn">${esc(ST.msg)}</span>` : '<span class="dim">Not connected</span>'}
        <button class="btn small" data-act="studio-connect">Connect</button>
      </div>
      <p class="note">Runs on your own Windows PC (setup in the <em>studio-server</em> folder). Nothing leaves your computer. If it isn't running, Kokoro takes over.</p>
    </details>

    <details class="adv"><summary>Kokoro engine</summary>
      <div class="field"><span>Engine</span><select id="kEngine">
        <option value="auto" ${settings.kEngine === 'auto' ? 'selected' : ''}>Automatic</option>
        <option value="wasm" ${settings.kEngine === 'wasm' ? 'selected' : ''}>Compact (~92 MB, best for phones)</option>
        <option value="webgpu" ${settings.kEngine === 'webgpu' ? 'selected' : ''}>WebGPU (~326 MB, fastest on computers)</option>
      </select></div>
    </details>`;
  renderHQProgress();
  renderVoiceProgress();
}

function renderVoiceProgress() {
  const box = $('#piper-status');
  const libRow = P.progress && $(`[data-vrow="piper:${P.progress.voice}"] .vl-dl`);
  if (P.progress) {
    const mb = (b) => (b / 1e6).toFixed(0);
    const info = voiceInfo('piper:' + P.progress.voice);
    const t = P.progress.total ? `Downloading ${info.name} (Piper)… ${mb(P.progress.loaded)} of ${mb(P.progress.total)} MB` : `Downloading ${info.name}…`;
    if (box) { box.hidden = false; box.innerHTML = `<div class="kbar"><div style="width:${P.progress.total ? Math.min(100, P.progress.loaded / P.progress.total * 100) : 3}%"></div></div><span>${esc(t)}</span>`; }
    if (libRow) libRow.textContent = P.progress.total ? Math.round(P.progress.loaded / P.progress.total * 100) + '%' : '…';
  } else if (box) {
    const loading = [...P.loading.keys()];
    box.hidden = !loading.length;
    if (loading.length) box.innerHTML = `<span class="dim">Preparing ${esc(voiceInfo('piper:' + loading[0]).name)}…</span>`;
  }
}

/* ------------------------------------------------------------------ voice library */

const RIGHTS_NOTE = 'Only import voices you have the rights to use. No cloned voices of real people without their consent.';
function openVoiceLibrary() {
  const d = $('#dlg');
  const f = { g: 'Male', e: '' };
  const row = (v) => {
    const fav = isFavRef(v.ref);
    const dl = v.engine === 'piper' && !v.imported && !piperReady(v.id) ? `<span class="vl-dl">${v.size ? v.size + ' MB' : ''}</span>` : '<span class="vl-dl ok">✓</span>';
    const spk = v.speakers ? `<span class="vl-spk"><button type="button" data-spk="-1" data-base="${esc(v.ref)}">◀</button><input type="number" min="0" max="${v.speakers - 1}" value="${settings.spk?.[v.id] || 0}" data-spkin="${esc(v.ref)}" aria-label="Speaker number"><button type="button" data-spk="1" data-base="${esc(v.ref)}">▶</button></span>` : '';
    const theRef = v.speakers ? v.ref + '#' + (settings.spk?.[v.id] || 0) : v.ref;
    return `<div class="vl-row" data-vrow="${esc(v.ref)}">
      <button type="button" class="vl-fav ${isFavRef(theRef) ? 'on' : ''}" data-fav="${esc(theRef)}" aria-label="Favourite ${esc(v.name)}">♥</button>
      <span class="vl-main"><span class="vl-name">${esc(v.name)}</span><span class="vl-sub">${ENGINE_LABEL[v.imported ? 'import' : v.engine]}${v.accent ? ' · ' + esc(v.accent) : ''}${v.grade ? ' · grade ' + v.grade : ''}${v.imported ? ` · <button type="button" class="link" data-rmvoice="${esc(v.ref)}">remove</button>` : ''}</span>${spk}</span>
      ${dl}
      <button type="button" class="icon-btn sm" data-prev="${esc(theRef)}" aria-label="Hear ${esc(v.name)}">${I.play}</button>
    </div>`;
  };
  const draw = () => {
    const all = [...window.VoicePacks.flatMap((p) => p.voices), ...importedVoices(), ...studioVoices()];
    const list = all.filter((v) => (f.g === 'Mixed' ? v.speakers || v.gender === 'Mixed' : f.g === 'Fav' ? isFavRef(v.ref) || (settings.vFavs || []).some((r) => r.startsWith(v.ref + '#')) : v.gender === f.g && !v.speakers) && (!f.e || v.engine === f.e))
      .sort((a, b) => a.rank - b.rank);
    $('.vl-list', d).innerHTML = list.length ? list.map(row).join('') : '<p class="note">No voices here yet.</p>';
    $$('.vl-tabs [data-g]', d).forEach((b) => b.classList.toggle('on', b.dataset.g === f.g));
    $$('.vl-tabs [data-e]', d).forEach((b) => b.classList.toggle('on', b.dataset.e === f.e));
  };
  d.innerHTML = `<form method="dialog" class="dlg sheet vl">
      <h3>Voice library</h3>
      ${settings.hq ? '' : '<p class="note"><strong>Switch on High-quality voices to hear these.</strong></p>'}
      <div class="vl-tabs">
        <button type="button" data-g="Male">Male</button><button type="button" data-g="Female">Female</button>
        <button type="button" data-g="Mixed">Hundreds more</button><button type="button" data-g="Fav">♥ Favourites</button>
      </div>
      <div class="vl-tabs small">
        <button type="button" data-e="">All engines</button><button type="button" data-e="kokoro">Kokoro</button><button type="button" data-e="piper">Piper</button>${ST.status === 'ready' ? '<button type="button" data-e="studio">Studio</button>' : ''}
      </div>
      <p class="note">Best first. ▶ to hear · ♥ to keep at the top of every list. Piper voices download once when you first play them.</p>
      <div class="vl-list"></div>
      <details class="vl-import"><summary>Import your own voices</summary>
        <p class="note">Piper: choose a voice's <em>.onnx</em> and <em>.onnx.json</em> files together. Kokoro: a voice <em>.bin</em> file named like <em>am_myvoice.bin</em> (a/b = American/British, f/m = female/male). Files stay on this device.</p>
        <p class="note rights">${RIGHTS_NOTE}</p>
        <input type="file" id="voice-files" multiple accept=".onnx,.json,.bin">
      </details>
      <div class="dlg-row"><span class="grow"></span><button value="ok" class="btn primary">Done</button></div>
    </form>`;
  d.onclick = (e) => {
    const t = e.target;
    const g = t.closest('[data-g]'), en = t.closest('[data-e]'), fav = t.closest('[data-fav]'), pv = t.closest('[data-prev]'), sp = t.closest('[data-spk]'), rm = t.closest('[data-rmvoice]');
    if (g) { f.g = g.dataset.g; draw(); }
    if (en) { f.e = en.dataset.e; draw(); }
    if (fav) { const r = fav.dataset.fav; settings.vFavs = isFavRef(r) ? settings.vFavs.filter((x) => x !== r) : [...(settings.vFavs || []), r]; saveSettings(); fav.classList.toggle('on', isFavRef(r)); }
    if (pv) voicePreview(pv.dataset.prev);
    if (sp) { const base = sp.dataset.base, info = voiceInfo(base); const n = Math.max(0, Math.min(info.speakers - 1, (settings.spk?.[info.id] || 0) + +sp.dataset.spk)); settings.spk = { ...(settings.spk || {}), [info.id]: n }; saveSettings(); draw(); voicePreview(base + '#' + n); }
    if (rm) { e.preventDefault(); removeImportedVoice(rm.dataset.rmvoice).then(draw); }
  };
  d.onchange = (e) => {
    if (e.target.matches('[data-spkin]')) { const info = voiceInfo(e.target.dataset.spkin); settings.spk = { ...(settings.spk || {}), [info.id]: Math.max(0, Math.min(info.speakers - 1, +e.target.value || 0)) }; saveSettings(); draw(); }
    if (e.target.id === 'voice-files') importVoiceFiles([...e.target.files]).then(() => { f.g = 'Fav'; draw(); });
  };
  d.onclose = () => { d.onclick = d.onchange = null; stopSpeech(); renderVoicesPanel(); renderCastVoices(); renderNarrator(); };
  d.showModal();
  draw();
}

/* ------------------------------------------------------------------ bring your own voices */

async function importVoiceFiles(files) {
  if (!files.length) return;
  if (!confirm(RIGHTS_NOTE + '\n\nImport these voice files?')) return;
  const byStem = new Map();
  for (const f of files) {
    const stem = f.name.replace(/\.onnx\.json$|\.json$|\.onnx$|\.bin$/i, '');
    byStem.set(stem, { ...(byStem.get(stem) || {}), [/\.json$/i.test(f.name) ? 'config' : /\.onnx$/i.test(f.name) ? 'model' : 'bin']: f });
  }
  let n = 0;
  for (const [stem, g] of byStem) {
    try {
      if (g.bin) {
        if (!/^[ab][fm]_[a-z0-9_]+$/i.test(stem)) { toast(`${stem}.bin: name it like am_myvoice.bin`); continue; }
        const id = stem.toLowerCase();
        const c = await caches.open('kokoro-voices');
        await c.put(`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${id}.bin`, new Response(await g.bin.arrayBuffer()));
        addImported({ engine: 'kokoro', id, ref: 'import:kokoro:' + id, name: stem.slice(3).replace(/_/g, ' ') + ' (imported)', gender: id[1] === 'm' ? 'Male' : 'Female', accent: id[0] === 'a' ? 'American' : 'British', rank: 0.5 });
        n++;
      } else if (g.model && g.config) {
        const cfg = JSON.parse(await g.config.text());
        if (!cfg.audio || !cfg.phoneme_id_map) throw new Error('not a Piper voice config');
        const ref = 'import:piper:' + stem;
        await voiceFilePut(ref, { model: await g.model.arrayBuffer(), config: await g.config.arrayBuffer() });
        addImported({ engine: 'piper', id: 'imp-' + stem, ref, name: stem + ' (imported)', gender: /female|_f\b/i.test(stem) ? 'Female' : /male|_m\b/i.test(stem) ? 'Male' : 'Mixed', accent: (cfg.language && cfg.language.name_english) || '', rank: 0.5, speakers: cfg.num_speakers > 1 ? cfg.num_speakers : undefined });
        n++;
      } else toast(`${stem}: a Piper voice needs both the .onnx and .onnx.json file`);
    } catch (e) { toast(`${stem}: couldn’t import (${e.message})`); }
  }
  if (n) toast(`Imported ${n} voice${n === 1 ? '' : 's'} — they're in your Favourites.`);
}
function addImported(v) {
  settings.imported = [...(settings.imported || []).filter((x) => x.ref !== v.ref), v];
  settings.vFavs = [...new Set([...(settings.vFavs || []), v.ref])];
  saveSettings();
}
async function removeImportedVoice(ref) {
  if (!confirm('Remove this imported voice from this device?')) return;
  const v = voiceInfo(ref);
  settings.imported = (settings.imported || []).filter((x) => x.ref !== ref);
  settings.vFavs = (settings.vFavs || []).filter((x) => x !== ref);
  saveSettings();
  if (v.engine === 'kokoro') { try { (await caches.open('kokoro-voices')).delete(`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${v.id}.bin`); } catch {} }
  else await voiceFileDel(ref);
}
