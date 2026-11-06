// Scene Reader — Voiceover studio (plain script, loaded before app.js).
// Paste copy · timer with 15/30/60 s targets and pacing feedback · direction cards · read against
// music, sound effects or video · cue markers · record takes · compare · export WAV with a name slate,
// or the video with your voice mixed in. Multi-voice scripts: AI voices read the other speakers.
// Recordings and files stay on this device (IndexedDB) until YOU export them. No voice cloning.
'use strict';

const VO_CARDS = {
  warmer: { label: 'Warmer', tip: 'Let the voice drop a little and slow down. Think of someone you’re glad to see.' },
  conversational: { label: 'Conversational', tip: 'Talk to one person, not an audience. Allow small hesitations and real thinking.' },
  smile: { label: 'Smile', tip: 'Physically smile while you read — it brightens the vowels. Let it show on “you” and “your”.' },
  urgent: { label: 'Urgent', tip: 'Something has to happen now. Pick up the pace, lean on the verbs, land the call to action.' },
  bestfriend: { label: 'Best friend', tip: 'You’re telling your best friend about something you love. Relaxed, a little conspiratorial.' },
  announcer: { label: 'Announcer', tip: 'Big, polished and in control. Full breath support, clear consonants, confident downward endings.' },
};
const VO_PACE = { relaxed: [130, 'Relaxed'], natural: [150, 'Natural'], brisk: [170, 'Brisk'] };
const VO = { list: [], cur: null, recording: null, playing: [], bedBuf: null, bedUrl: '', compare: [], tickTimer: 0, lineIdx: -1 };

async function voLoadAll() { VO.list = (await kvAll('vo')).sort((a, b) => b.updated - a.updated); return VO.list; }
async function voSave(p) { p.updated = Date.now(); await kvPut('vo', p.id, p); }
const voById = (id) => VO.list.find((p) => p.id === id);
const words = (t) => (t.replace(/\*|\s\/\s/g, ' ').match(/[A-Za-z0-9’']+/g) || []).length;

/* ------------------------------------------------------------------ list */
async function renderVoList() {
  document.title = 'Voiceover · Scene Reader';
  await voLoadAll();
  app.innerHTML = `
    <header class="top"><button class="icon-btn" data-go="#/" aria-label="Back">${I.back}</button><div class="top-title">Voiceover studio</div></header>
    <main class="wrap vo-list">
      <h1 class="step-h">Voiceover</h1>
      <p class="hint">Paste your copy, time it, record takes against music or picture, and export the best one.</p>
      <button class="btn huge primary" data-act="vo-new">${I.plus}<span>New voiceover</span></button>
      ${VO.list.length ? `<ul class="scene-list">${VO.list.map((p) => `<li class="scene-item">
          <button class="scene-open" data-go="#/vo/${p.id}"><span class="scene-title">${esc(p.title)}</span>
          <span class="scene-meta">${p.target ? p.target + ' s spot · ' : ''}${p.takes.length} take${p.takes.length === 1 ? '' : 's'} · ${new Date(p.updated).toLocaleDateString()}</span></button>
          <button class="icon-btn" data-act="vo-del" data-id="${p.id}" aria-label="Delete ${esc(p.title)}">${I.trash}</button></li>`).join('')}</ul>` : '<p class="note">No voiceovers yet.</p>'}
      <p class="privacy">${I.lock}<span>Recordings stay on this device until you export them.</span></p>
    </main>`;
}

/* ------------------------------------------------------------------ studio */
async function renderVo() {
  await voLoadAll();
  const p = voById(current.id);
  if (!p) return go('#/vo');
  VO.cur = p;
  document.title = p.title + ' · Voiceover';
  const t = voTiming(p);
  const sp = voSpeakers(p);
  app.innerHTML = `
    <header class="top"><button class="icon-btn" data-go="#/vo" aria-label="Back">${I.back}</button><div class="top-title">${esc(p.title)}</div>
      <button class="icon-btn" data-act="vo-rename" aria-label="Rename">${I.edit}</button></header>
    <main class="wrap vo">
      <section class="panel">
        <div class="vo-tools"><button class="tool" data-act="vo-stress" title="Select a word, then tap">*Stress*</button><button class="tool" data-act="vo-breath" title="Put the cursor where you breathe">/ Breath</button><button class="tool" data-act="vo-clearmarks">Clear marks</button></div>
        <textarea id="vo-copy" class="paste vo-copy" spellcheck="true" placeholder="Paste or type your copy.&#10;&#10;Two or more speakers? Use NAME: before each line and AI voices will read the others.">${esc(p.copy)}</textarea>
        <div class="vo-preview" id="vo-preview">${voFmt(p.copy)}</div>
      </section>

      <section class="panel">
        <div class="seg-row"><span>Target length</span><div class="seg">${[15, 30, 60].map((s) => `<button data-act="vo-target" data-s="${s}" class="${p.target === s ? 'on' : ''}">${s} s</button>`).join('')}<button data-act="vo-target" data-s="0" class="${!p.target ? 'on' : ''}">None</button><button data-act="vo-target" data-s="custom" class="${p.target && ![15, 30, 60].includes(p.target) ? 'on' : ''}">${p.target && ![15, 30, 60].includes(p.target) ? p.target + ' s' : 'Other'}</button></div></div>
        <div class="seg-row"><span>Your pace</span><div class="seg three">${Object.entries(VO_PACE).map(([k, [, l]]) => `<button data-act="vo-pace" data-k="${k}" class="${(p.pace || 'natural') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="vo-pacing ${t.cls}" id="vo-pacing">${t.text}</p>
      </section>

      ${sp.length > 1 ? `<section class="panel"><h3 class="mini-h">Multi-voice script</h3>
        <label class="field"><span>You read</span><select id="vo-me">${sp.map((n) => `<option ${n === p.me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        ${sp.filter((n) => n !== p.me).map((n) => `<label class="field"><span>${esc(n)}</span><select class="vo-cast" data-n="${esc(n)}">${settings.hq || ST.status === 'ready' ? refOptions((p.cast || {})[n] || '', '<option value="">Reader voice</option>') : '<option>Device voice</option>'}</select></label>`).join('')}
        <p class="note">${settings.hq || ST.status === 'ready' ? 'AI lines are recorded into your take. Wear headphones so the mic only hears you.' : 'Switch on High-quality voices (Pick your character → Voices) so the AI lines can be recorded into your takes.'}</p></section>` : ''}

      <section class="panel">
        <h3 class="mini-h">Direction</h3>
        <div class="dcard" id="dcard">${p.card ? `<strong>${VO_CARDS[p.card].label}</strong><span>${VO_CARDS[p.card].tip}</span>` : '<span>Pick a direction card, or shuffle one — like a director in the booth.</span>'}</div>
        <div class="lchips">${Object.entries(VO_CARDS).map(([k, c]) => `<button class="lchip ${p.card === k ? 'on' : ''}" data-act="vo-card" data-k="${k}">${c.label}</button>`).join('')}<button class="lchip ghost" data-act="vo-shuffle">Shuffle</button></div>
      </section>

      <section class="panel">
        <h3 class="mini-h">Read against music, sound or picture</h3>
        ${p.bed ? `<p class="bed-name">${p.bed.kind === 'video' ? '🎬' : '🎵'} ${esc(p.bed.name)} <button class="link" data-act="vo-bed-remove">remove</button></p>
          ${p.bed.kind === 'video' ? '<video id="vo-video" playsinline preload="metadata"></video>' : ''}
          <label class="field"><span>Background volume</span><input type="range" id="vo-bedvol" min="0" max="1" step="0.05" value="${p.bed.volume ?? 0.4}"></label>` : '<p class="note">Optional: add a music bed, sound effects or a video clip (read to picture). It plays while you record; headphones recommended.</p>'}
        <input type="file" id="vo-bedfile" accept="audio/*,video/*" hidden>
        <button class="btn ghost" data-act="vo-bed">${p.bed ? 'Replace file' : 'Add music, sound or video'}</button>
      </section>

      <section class="panel">
        <h3 class="mini-h">Cue markers</h3>
        <div class="markers">${(p.markers || []).map((m) => `<span class="kchip">${fmtTime(m.t)} ${esc(m.label || '')}<button data-act="vo-mdel" data-id="${m.id}" aria-label="Remove marker">×</button></span>`).join('') || '<span class="note">Marks the moments you need to hit (e.g. 0:12.5 “logo”). They flash during your take.</span>'}</div>
        <div class="btn-row"><input id="vo-mt" class="plain mk-in" inputmode="decimal" placeholder="Time (s)"><input id="vo-ml" class="plain mk-in" placeholder="Label"><button class="btn small" data-act="vo-madd">Add</button></div>
        ${p.bed ? `<button class="btn ghost" data-act="vo-tapmark">${VO.tapping ? 'Stop' : 'Play background & tap to mark'}</button>` : ''}
        <label class="toggle"><input type="checkbox" id="vo-beep" ${p.beep ? 'checked' : ''}><span class="track"></span><span>Beep at each marker (headphones)</span></label>
      </section>

      <section class="panel rec-panel">
        <div class="rec-clock" id="rec-clock">0:00.0</div>
        <div class="rec-bar"><div id="rec-fill"></div>${(p.markers || []).map((m) => p.target || p.bed ? `<i style="left:${Math.min(100, (m.t / voLength(p)) * 100)}%"></i>` : '').join('')}</div>
        <div class="rec-line" id="rec-line" hidden></div>
        <div class="rec-cue" id="rec-cue" hidden></div>
        <button class="btn huge rec-btn" data-act="vo-rec" id="vo-recbtn">● Record a take</button>
        <button class="btn huge" data-act="vo-next" id="vo-next" hidden>Next line ▶</button>
      </section>

      <section><h2 class="section-h">Takes <span>${p.takes.length}</span></h2>
        <div id="vo-takes">${voTakesHtml(p)}</div>
        <div id="vo-compare"></div>
      </section>

      <section class="panel">
        <h3 class="mini-h">Export</h3>
        <label class="toggle"><input type="checkbox" id="vo-slate-on" ${p.slateOn !== false ? 'checked' : ''}><span class="track"></span><span>Start with my name slate</span></label>
        <div class="btn-row"><button class="btn ghost" data-act="vo-slate">${VO.hasSlate ? 'Re-record name slate' : 'Record my name slate'}</button>${VO.hasSlate ? '<button class="btn ghost" data-act="vo-slate-play">▶ Slate</button>' : ''}</div>
        ${p.bed && p.bed.kind === 'audio' ? `<label class="toggle"><input type="checkbox" id="vo-incbed" ${p.incBed ? 'checked' : ''}><span class="track"></span><span>Mix the background into the WAV</span></label>` : ''}
        <button class="btn primary" data-act="vo-export">Export best take (WAV)</button>
        ${p.bed && p.bed.kind === 'video' ? '<button class="btn" data-act="vo-export-video">Export video with my voice</button><p class="note">Plays through once in real time to build the video. Best on a laptop.</p>' : ''}
        <p class="note" id="vo-export-status"></p>
      </section>
    </main>`;
  VO.hasSlate = !!(await audioGet('vo-slate'));
  $$('[data-act="vo-slate"]').forEach((b) => (b.textContent = VO.hasSlate ? 'Re-record name slate' : 'Record my name slate'));
  if (VO.hasSlate && !$('[data-act="vo-slate-play"]')) $('[data-act="vo-slate"]').insertAdjacentHTML('afterend', '<button class="btn ghost" data-act="vo-slate-play">▶ Slate</button>');
  await voLoadBed(p);
  $('#vo-copy').addEventListener('input', (e) => { p.copy = e.target.value; $('#vo-preview').innerHTML = voFmt(p.copy); voPacingUpdate(p); clearTimeout(VO.saveT); VO.saveT = setTimeout(() => voSave(p), 400); });
  $('#vo-bedfile').addEventListener('change', (e) => voSetBed(p, e.target.files[0]));
  voDrawTakeWaves(p);
}

const voFmt = (t) => esc(t || '').replace(/\*([^*]+)\*/g, '<strong class="emph">$1</strong>').replace(/\s\/\s/g, ' <span class="breath">/</span> ').replace(/\n/g, '<br>');
function voSpeakers(p) { try { return characters(parseScript(p.copy || '')).map((c) => c.name); } catch { return []; } }
const voLength = (p) => Math.max(p.target || 0, VO.bedDur || 0, ...(p.markers || []).map((m) => m.t + 1), 5);
function voTiming(p) {
  const w = words(p.copy || '');
  if (!w) return { text: 'Paste your copy to see how long it reads.', cls: '' };
  const wpm = VO_PACE[p.pace || 'natural'][0];
  const secs = (w / wpm) * 60 + ((p.copy.match(/\s\/\s/g) || []).length * 0.35);
  let text = `${w} words ≈ <strong>${secs.toFixed(1)} s</strong> at a ${VO_PACE[p.pace || 'natural'][1].toLowerCase()} pace`;
  let cls = '';
  if (p.target) {
    const diff = p.target - secs;
    const need = (w / Math.max(1, p.target - 0.5)).toFixed(1);
    if (diff >= 1.5) { text += ` — fits ${p.target} s with ${diff.toFixed(1)} s to breathe.`; cls = 'ok'; }
    else if (diff >= -0.5) { text += ` — right on ${p.target} s. Keep it moving.`; cls = 'tight'; }
    else { text += ` — <strong>${(-diff).toFixed(1)} s too long</strong> for ${p.target} s. You’d need ~${need} words/sec, or trim ~${Math.ceil((-diff / 60) * wpm)} words.`; cls = 'over'; }
  }
  return { text, cls };
}
function voPacingUpdate(p) { const t = voTiming(p), el = $('#vo-pacing'); if (el) { el.innerHTML = t.text; el.className = 'vo-pacing ' + t.cls; } }

function voTakesHtml(p) {
  if (!p.takes.length) return '<p class="note">Your takes appear here. ★ the best one to export it.</p>';
  return p.takes.slice().reverse().map((tk) => {
    const off = p.target ? tk.dur - p.target : 0;
    return `<div class="take ${tk.best ? 'best' : ''}" data-id="${tk.id}">
      <div class="take-head"><button class="vl-fav ${tk.best ? 'on star' : 'star'}" data-act="vo-best" data-id="${tk.id}" aria-label="Best take">★</button>
        <span class="take-name">${esc(tk.name)}</span><span class="take-dur ${p.target ? (Math.abs(off) <= 0.5 ? 'ok' : off > 0 ? 'over' : 'under') : ''}">${tk.dur.toFixed(1)} s${p.target ? ` (${off >= 0 ? '+' : ''}${off.toFixed(1)})` : ''}</span>
        <label class="cmp"><input type="checkbox" data-cmp="${tk.id}" ${VO.compare.includes(tk.id) ? 'checked' : ''}> compare</label>
        <button class="icon-btn sm" data-act="vo-play" data-id="${tk.id}" aria-label="Play ${esc(tk.name)}">${I.play}</button>
        <button class="icon-btn sm" data-act="vo-tdel" data-id="${tk.id}" aria-label="Delete ${esc(tk.name)}">${I.trash}</button></div>
      <canvas class="wave" data-wave="${tk.id}"></canvas>
    </div>`;
  }).join('');
}
async function voDrawTakeWaves(p) {
  for (const c of $$('canvas[data-wave]')) { try { const blob = await audioGet(c.dataset.wave); if (blob) drawWave(c, await decodeBlob(blob)); } catch {} }
  voRenderCompare(p);
}
async function voRenderCompare(p) {
  const box = $('#vo-compare'); if (!box) return;
  const ids = VO.compare.filter((id) => p.takes.some((t) => t.id === id)).slice(-2);
  if (ids.length < 2) { box.innerHTML = p.takes.length > 1 ? '<p class="note">Tick “compare” on two takes to hear them side by side.</p>' : ''; return; }
  const tks = ids.map((id) => p.takes.find((t) => t.id === id));
  box.innerHTML = `<div class="compare">${tks.map((tk, i) => `<div class="cmp-col"><span class="cmp-ab">${'AB'[i]}</span><strong>${esc(tk.name)}</strong><span>${tk.dur.toFixed(1)} s</span>
      <canvas class="wave" data-cw="${tk.id}"></canvas><button class="btn small" data-act="vo-play" data-id="${tk.id}">${I.play}<span>Play ${'AB'[i]}</span></button></div>`).join('')}</div>
    <button class="btn ghost" data-act="vo-ab" data-a="${ids[0]}" data-b="${ids[1]}">Play A, then B</button>`;
  for (const c of $$('canvas[data-cw]', box)) { const blob = await audioGet(c.dataset.cw); if (blob) drawWave(c, await decodeBlob(blob), '#8fb8ff'); }
}

/* ------------------------------------------------------------------ background bed / video */
async function voSetBed(p, file) {
  if (!file) return;
  if (file.size > 300e6) return toast('That file is too big (over 300 MB).');
  const id = 'vo-bed-' + p.id;
  await audioPut(id, file);
  p.bed = { name: file.name, kind: file.type.startsWith('video') ? 'video' : 'audio', volume: p.bed?.volume ?? 0.4, audioId: id, type: file.type };
  await voSave(p); renderVo();
}
async function voLoadBed(p) {
  VO.bedBuf = null; VO.bedDur = 0;
  if (VO.bedUrl) { URL.revokeObjectURL(VO.bedUrl); VO.bedUrl = ''; }
  if (!p.bed) return;
  const blob = await audioGet(p.bed.audioId);
  if (!blob) return;
  VO.bedBlob = blob;
  if (p.bed.kind === 'video') {
    VO.bedUrl = URL.createObjectURL(blob);
    const v = $('#vo-video'); if (v) { v.src = VO.bedUrl; v.onloadedmetadata = () => { VO.bedDur = v.duration; }; }
  } else {
    try { VO.bedBuf = await decodeBlob(blob); VO.bedDur = VO.bedBuf.duration; } catch { toast('Couldn’t read that audio file.'); }
  }
}
function voBedStart(p) {
  const vol = p.bed?.volume ?? 0.4;
  if (p.bed?.kind === 'video') { const v = $('#vo-video'); if (v) { v.currentTime = 0; v.volume = vol; v.muted = false; v.play().catch(() => {}); return { stop: () => v.pause() }; } }
  if (VO.bedBuf) return playBuffer(VO.bedBuf, { gain: vol });
  return null;
}

/* ------------------------------------------------------------------ recording */
function voBeep() { const c = audioCtx(); const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1000; g.gain.value = 0.15; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.08); }

async function voRecord(p) {
  if (VO.recording) return voStop(p);
  unlockSpeech(); audioCtx();
  const btn = $('#vo-recbtn');
  try { await getMic(); } catch { return toast('Microphone blocked — allow it in the browser’s site settings.'); }
  for (const n of ['3', '2', '1']) { btn.textContent = n; await new Promise((r) => setTimeout(r, 650)); }
  const sp = voSpeakers(p);
  const multi = sp.length > 1;
  const rec = await startRecording({ withAi: multi });
  VO.recording = { rec, bed: voBedStart(p), fired: new Set(), multi };
  btn.textContent = '■ Stop'; btn.classList.add('recording');
  if (p.card) { const cue = $('#rec-cue'); cue.hidden = false; cue.innerHTML = `<strong>${VO_CARDS[p.card].label}</strong> — ${VO_CARDS[p.card].tip}`; }
  const len = voLength(p);
  const tick = () => {
    if (!VO.recording) return;
    const t = rec.elapsed();
    $('#rec-clock').textContent = fmtTime(t) + (p.target ? ` / ${p.target}.0` : '');
    $('#rec-fill').style.width = Math.min(100, (t / len) * 100) + '%';
    $('#rec-fill').classList.toggle('over', !!p.target && t > p.target);
    for (const m of p.markers || []) if (t >= m.t && !VO.recording.fired.has(m.id)) {
      VO.recording.fired.add(m.id);
      const cl = $('#rec-clock'); cl.classList.remove('flash'); void cl.offsetWidth; cl.classList.add('flash');
      toast('▶ ' + (m.label || 'Cue') + ' — ' + fmtTime(m.t));
      if (p.beep) voBeep();
    }
    VO.tickTimer = requestAnimationFrame(tick);
  };
  tick();
  if (multi) { VO.blocks = parseScript(p.copy).filter((b) => b.type === 'line'); VO.lineIdx = -1; $('#vo-next').hidden = false; voNextLine(p); }
}
// Multi-voice: AI reads the other speakers, then waits for you (Next / Space / clicker)
async function voNextLine(p) {
  if (!VO.recording) return;
  VO.lineIdx++;
  const b = VO.blocks[VO.lineIdx];
  const box = $('#rec-line');
  if (!b) { box.hidden = false; box.innerHTML = '<em>End of script — tap Stop.</em>'; $('#vo-next').hidden = true; return; }
  box.hidden = false;
  const me = b.who === (p.me || voSpeakers(p)[0]);
  box.innerHTML = `<span class="who">${esc(b.who)}${me ? ' (you)' : ''}</span> ${voFmt(b.text)}`;
  box.classList.toggle('mine', me);
  if (me) return;
  const ref = (p.cast || {})[b.who] || readerRef();
  await say(speakable(b.text), { ref, tone: b.tone, cadence: b.cadence });
  if (VO.recording) voNextLine(p);
}
async function voStop(p) {
  const r = VO.recording; if (!r) return;
  VO.recording = null; cancelAnimationFrame(VO.tickTimer); stopSpeech();
  r.bed && r.bed.stop();
  const { blob, dur } = await r.rec.stop();
  const tk = { id: 'tk-' + newId(), name: 'Take ' + ((p.takes.reduce((m, t) => Math.max(m, t.n || 0), 0)) + 1), n: p.takes.reduce((m, t) => Math.max(m, t.n || 0), 0) + 1, created: Date.now(), dur, best: !p.takes.length };
  await audioPut(tk.id, blob);
  p.takes.push(tk); await voSave(p);
  renderVo();
  toast(`${tk.name}: ${dur.toFixed(1)} s${p.target ? ` (target ${p.target} s)` : ''}`);
}

async function voPlayTake(p, id, after) {
  voStopPlayback();
  const blob = await audioGet(id); if (!blob) return toast('That take is missing.');
  const buf = await decodeBlob(blob);
  const pl = playBuffer(buf);
  VO.playing = [pl];
  const bed = voBedStart(p); if (bed) VO.playing.push(bed);
  await pl.done;
  if (bed) bed.stop();
  if (after) after();
}
function voStopPlayback() { VO.playing.forEach((x) => x && x.stop && x.stop()); VO.playing = []; }

/* ------------------------------------------------------------------ export */
async function voExport(p, video) {
  const best = p.takes.find((t) => t.best) || p.takes[p.takes.length - 1];
  if (!best) return toast('Record a take first.');
  const st = $('#vo-export-status');
  const name = fileSafe(`${settings.myName || 'Voiceover'} - ${p.title} - ${best.name}`);
  const take = await decodeBlob(await audioGet(best.id));
  if (video) {
    st.textContent = 'Building the video… keep this tab open.';
    try {
      const { blob, ext } = await exportVideo(VO.bedBlob, take, { bedGain: p.bed.volume ?? 0.4, onProgress: (f) => (st.textContent = `Building the video… ${Math.round(f * 100)}%`) });
      downloadBlob(blob, name + '.' + ext); st.textContent = `Saved ${name}.${ext}`;
    } catch (e) { st.textContent = 'Video export failed: ' + e.message; }
    return;
  }
  const items = [];
  let at = 0;
  const slate = p.slateOn !== false && (await audioGet('vo-slate'));
  if (slate) { const sb = await decodeBlob(slate); items.push({ buffer: sb, at: 0 }); at = sb.duration + 0.6; }
  items.push({ buffer: take, at });
  if (p.incBed && VO.bedBuf) items.push({ buffer: VO.bedBuf, at, gain: p.bed.volume ?? 0.4, dur: take.duration + 1 }); // bed ends 1 s after your take
  const out = normalize(await mixDown(items, { sampleRate: 48000 }));
  downloadBlob(encodeWav(out), name + '.wav');
  st.textContent = `Saved ${name}.wav (${out.duration.toFixed(1)} s${slate ? ', with slate' : ''})`;
}

async function voRecordSlate() {
  let r;
  try { unlockSpeech(); r = await startRecording(); } catch { return toast('Microphone blocked — allow it in the browser’s site settings.'); }
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog" class="dlg"><h3>● Recording your slate</h3>
      <p class="note">Say your name the way you’d slate an audition — e.g. “Nic Rae.” Then tap Stop.</p>
      <div class="dlg-row"><button value="cancel" class="btn ghost">Cancel</button><span class="grow"></span><button value="ok" class="btn primary">■ Stop</button></div></form>`;
  d.returnValue = 'cancel';
  await new Promise((res) => { d.onclose = res; d.showModal(); });
  const { blob, dur } = await r.stop();
  if (d.returnValue !== 'ok') return;
  if (dur < 0.4) return toast('That was too short — try again.');
  await audioPut('vo-slate', blob); VO.hasSlate = true;
  toast('Slate saved — it starts every voiceover export (you can switch it off).'); renderVo();
}

/* ------------------------------------------------------------------ events */
async function voClick(act, btn) {
  if (!act.startsWith('vo-')) return false;
  const p = VO.cur;
  switch (act) {
    case 'vo-new': {
      const np = { id: newId(), title: 'Untitled voiceover', copy: '', target: 30, pace: 'natural', markers: [], takes: [], created: Date.now(), updated: Date.now(), slateOn: true };
      await kvPut('vo', np.id, np); go('#/vo/' + np.id); return true;
    }
    case 'vo-del': { await voLoadAll(); const d = voById(btn.dataset.id); if (d && confirm(`Delete “${d.title}” and its takes from this device?`)) { for (const t of d.takes) await audioDel(t.id); if (d.bed) await audioDel(d.bed.audioId); await kvDel('vo', d.id); renderVoList(); } return true; }
    case 'vo-rename': { const r = await ask({ title: 'Rename voiceover', value: p.title, plain: true }); if (r.action === 'ok' && r.value) { p.title = r.value; await voSave(p); renderVo(); } return true; }
    case 'vo-target': {
      let s = btn.dataset.s;
      if (s === 'custom') { const r = await ask({ title: 'Target length (seconds)', value: String(p.target || 45), plain: true }); if (r.action !== 'ok') return true; s = Math.max(1, Math.round(+r.value || 0)); }
      p.target = +s; await voSave(p); renderVo(); return true;
    }
    case 'vo-pace': p.pace = btn.dataset.k; await voSave(p); renderVo(); return true;
    case 'vo-card': p.card = p.card === btn.dataset.k ? '' : btn.dataset.k; await voSave(p); renderVo(); return true;
    case 'vo-shuffle': { const ks = Object.keys(VO_CARDS).filter((k) => k !== p.card); p.card = ks[Math.floor(Math.random() * ks.length)]; await voSave(p); renderVo(); return true; }
    case 'vo-stress': case 'vo-breath': case 'vo-clearmarks': {
      const ta = $('#vo-copy'); const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      if (act === 'vo-stress') { if (a === b) { toast('Select a word first, then tap Stress.'); return true; } ta.value = v.slice(0, a) + '*' + v.slice(a, b).replace(/\*/g, '') + '*' + v.slice(b); }
      if (act === 'vo-breath') ta.value = v.slice(0, a).replace(/\s*$/, '') + ' / ' + v.slice(b).replace(/^\s*/, '');
      if (act === 'vo-clearmarks') ta.value = v.replace(/\*/g, '').replace(/\s\/\s/g, ' ');
      ta.dispatchEvent(new Event('input')); ta.focus(); return true;
    }
    case 'vo-bed': $('#vo-bedfile').click(); return true;
    case 'vo-bed-remove': await audioDel(p.bed.audioId); delete p.bed; await voSave(p); renderVo(); return true;
    case 'vo-madd': {
      const t = parseFloat(($('#vo-mt').value || '').replace(',', '.'));
      if (!(t >= 0)) { toast('Type the time in seconds, e.g. 12.5'); return true; }
      p.markers = [...(p.markers || []), { id: newId(), t, label: $('#vo-ml').value.trim() }].sort((x, y) => x.t - y.t);
      await voSave(p); renderVo(); return true;
    }
    case 'vo-mdel': p.markers = p.markers.filter((m) => m.id !== btn.dataset.id); await voSave(p); renderVo(); return true;
    case 'vo-tapmark': {
      if (VO.tapping) { VO.tapping.bed && VO.tapping.bed.stop(); VO.tapping = null; await voSave(p); renderVo(); return true; }
      audioCtx();
      VO.tapping = { t0: performance.now(), bed: voBedStart(p) };
      btn.textContent = 'Tap here at each moment · tap Stop when done';
      btn.insertAdjacentHTML('afterend', '<button class="btn primary" data-act="vo-tap">Mark!</button><button class="btn ghost" data-act="vo-tapmark">Stop</button>');
      btn.remove(); return true;
    }
    case 'vo-tap': {
      if (!VO.tapping) return true;
      const t = (performance.now() - VO.tapping.t0) / 1000;
      p.markers = [...(p.markers || []), { id: newId(), t: Math.round(t * 10) / 10, label: 'Cue ' + ((p.markers || []).length + 1) }].sort((x, y) => x.t - y.t);
      toast('Marked ' + fmtTime(t)); return true;
    }
    case 'vo-rec': voRecord(p); return true;
    case 'vo-next': voNextLine(p); return true;
    case 'vo-play': voPlayTake(p, btn.dataset.id); return true;
    case 'vo-ab': voPlayTake(p, btn.dataset.a, () => setTimeout(() => voPlayTake(p, btn.dataset.b), 500)); return true;
    case 'vo-best': p.takes.forEach((t) => (t.best = t.id === btn.dataset.id)); await voSave(p); renderVo(); return true;
    case 'vo-tdel': { const tk = p.takes.find((t) => t.id === btn.dataset.id); if (tk && confirm(`Delete ${tk.name}?`)) { await audioDel(tk.id); p.takes = p.takes.filter((t) => t !== tk); if (tk.best && p.takes.length) p.takes[p.takes.length - 1].best = true; await voSave(p); renderVo(); } return true; }
    case 'vo-slate': voRecordSlate(); return true;
    case 'vo-slate-play': { const s = await audioGet('vo-slate'); if (s) playBuffer(await decodeBlob(s)); return true; }
    case 'vo-export': voExport(p, false); return true;
    case 'vo-export-video': voExport(p, true); return true;
  }
  return false;
}
async function voChange(e) {
  if (current.view !== 'vo' || !VO.cur) return false;
  const p = VO.cur, t = e.target;
  if (t.id === 'vo-bedvol') { p.bed.volume = +t.value; await voSave(p); return true; }
  if (t.id === 'vo-beep') { p.beep = t.checked; await voSave(p); return true; }
  if (t.id === 'vo-slate-on') { p.slateOn = t.checked; await voSave(p); return true; }
  if (t.id === 'vo-incbed') { p.incBed = t.checked; await voSave(p); return true; }
  if (t.id === 'vo-me') { p.me = t.value; await voSave(p); renderVo(); return true; }
  if (t.matches('.vo-cast')) { p.cast = { ...(p.cast || {}), [t.dataset.n]: t.value }; await voSave(p); voicePreview(t.value || readerRef()); return true; }
  if (t.matches('[data-cmp]')) { const id = t.dataset.cmp; VO.compare = t.checked ? [...VO.compare.filter((x) => x !== id), id].slice(-2) : VO.compare.filter((x) => x !== id); $$('[data-cmp]').forEach((c) => (c.checked = VO.compare.includes(c.dataset.cmp))); voRenderCompare(p); return true; }
  return false;
}
// Space / Enter / clicker = next line during a multi-voice take
document.addEventListener('keydown', (e) => {
  if (current.view !== 'vo' || !VO.recording || !VO.recording.multi || e.target.matches('input, textarea')) return;
  if ([' ', 'Enter', 'ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); voNextLine(VO.cur); }
});
function voLeave() { if (VO.recording) voStop(VO.cur); voStopPlayback(); if (VO.tapping) { VO.tapping.bed && VO.tapping.bed.stop(); VO.tapping = null; } }
