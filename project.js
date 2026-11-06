// Scene Reader — Collab projects, phase 1 (plain script, loaded before app.js).
// A project = a script + who plays which character + recorded takes per line + notes.
// Each actor records their own lines in their own time; Scene Reader plays everyone's takes in order.
// Share it as ONE file (text, email, Nearby Share). The other person adds their takes and sends it back;
// importing MERGES — nothing anyone recorded is overwritten. You can only delete your own takes and notes.
// No server: the file goes wherever you send it, and nowhere else.
'use strict';

const PJ = { playing: null, rec: null };

function me() {
  if (!settings.actor || !settings.actor.id) { settings.actor = { id: 'a-' + newId(), name: settings.myName || '' }; saveSettings(); }
  return settings.actor;
}
async function ensureName() {
  if (me().name) return true;
  const r = await ask({ title: 'Your name (shown to your scene partners)', value: settings.myName || '', plain: true });
  if (r.action !== 'ok' || !r.value) return false;
  settings.actor.name = r.value; saveSettings(); return true;
}
function projOf(scene) {
  if (!scene.project) scene.project = { v: 1, actors: {}, roles: {}, takes: {}, chosen: {}, notes: {}, deleted: [], notesDeleted: [], created: Date.now() };
  const p = scene.project;
  if (me().name) p.actors[me().id] = { name: me().name };
  return p;
}
const actorName = (p, aid) => (aid === me().id ? 'you' : (p.actors[aid] && p.actors[aid].name) || 'someone');
const lineTakes = (p, bid) => (p.takes[bid] || []).filter((t) => !p.deleted.includes(t.id));
function playTakeFor(p, bid) {
  const list = lineTakes(p, bid);
  const ch = p.chosen[bid] && list.find((t) => t.id === p.chosen[bid].take);
  return ch || list[list.length - 1] || null;
}

/* ------------------------------------------------------------------ list of projects */
function renderProjects() {
  document.title = 'Collab projects · Scene Reader';
  const list = scenes.filter((s) => s.project);
  app.innerHTML = `
    <header class="top"><button class="icon-btn" data-go="#/" aria-label="Back">${I.back}</button><div class="top-title">Collab projects</div></header>
    <main class="wrap">
      <h1 class="step-h">Scene projects</h1>
      <p class="hint">Record your lines, send the project file to your scene partner, they add theirs and send it back. Scene Reader plays everyone’s takes in order.</p>
      ${list.length ? `<ul class="scene-list">${list.map((s) => { const p = s.project; const n = Object.values(p.takes).flat().filter((t) => !p.deleted.includes(t.id)).length;
        return `<li class="scene-item"><button class="scene-open" data-go="#/project/${s.id}"><span class="scene-title">${esc(s.title)}</span>
          <span class="scene-meta">${Object.values(p.actors).map((a) => esc(a.name)).join(', ') || 'Just you so far'} · ${n} take${n === 1 ? '' : 's'}</span></button></li>`; }).join('')}</ul>` : '<p class="note">No projects yet. Open a scene and choose <strong>Collab project</strong> from its menu (⋯) or the cast screen.</p>'}
      <input type="file" id="pj-file" accept=".json,application/json" hidden>
      <button class="btn ghost" data-act="pj-import">Open a project file you received</button>
    </main>`;
  $('#pj-file').addEventListener('change', (e) => { pjImportFile(e.target.files[0]); e.target.value = ''; });
}

/* ------------------------------------------------------------------ one project */
async function renderProject() {
  const scene = getScene(current.id);
  if (!scene) return go('#/projects');
  const p = projOf(scene);
  document.title = scene.title + ' · Project';
  const chars = characters(scene.blocks).map((c) => c.name);
  const lines = scene.blocks.filter((b) => b.type === 'line');
  const recorded = lines.filter((b) => playTakeFor(p, b.id)).length;
  app.innerHTML = `
    <header class="top"><button class="icon-btn" data-go="#/projects" aria-label="Back">${I.back}</button><div class="top-title">${esc(scene.title)}</div></header>
    <main class="wrap project">
      <div class="pj-bar">
        <button class="btn primary" data-act="pj-play">${I.play}<span>Play the scene</span></button>
        <button class="btn" data-act="pj-share">Share project</button>
        <button class="btn ghost" data-act="pj-import">Add a file you received</button>
        <button class="btn ghost" data-act="pj-export">Export scene audio (WAV)</button>
      </div>
      <input type="file" id="pj-file" accept=".json,application/json" hidden>
      <label class="toggle"><input type="checkbox" id="pj-fill" ${settings.pjFill ? 'checked' : ''}><span class="track"></span><span>Fill missing lines with AI voices (instead of pausing)</span></label>
      <p class="note">${recorded} of ${lines.length} lines recorded · You are <strong>${esc(me().name || 'not named yet')}</strong></p>

      <h2 class="section-h">Who plays who</h2>
      <div class="panel roles">${chars.map((c) => { const aid = p.roles[c]; return `<div class="role"><span class="cv-name">${esc(c)}</span>
          <span class="role-who">${aid ? (aid === me().id ? '<strong>You</strong>' : esc(actorName(p, aid))) : '<em>Unassigned</em>'}</span>
          ${aid === me().id ? `<button class="btn small ghost" data-act="pj-unclaim" data-c="${esc(c)}">Not me</button>` : !aid ? `<button class="btn small" data-act="pj-claim" data-c="${esc(c)}">I’m playing this</button>` : ''}</div>`; }).join('')}</div>

      <h2 class="section-h">Lines</h2>
      <ol class="pj-lines">${scene.blocks.map((b) => {
        if (b.type !== 'line') return `<li class="pj-act">${esc(b.type === 'heading' ? b.text : b.text.slice(0, 140))}</li>`;
        const mine = p.roles[b.who] === me().id;
        const tks = lineTakes(p, b.id), cur = playTakeFor(p, b.id);
        const notes = (p.notes[b.id] || []).filter((n) => !p.notesDeleted.includes(n.id));
        return `<li class="pj-line ${mine ? 'mine' : ''}" data-id="${b.id}">
          <div class="pj-head"><span class="cv-name">${esc(b.who)}</span>${mine ? '<span class="you">you</span>' : ''}<span class="grow"></span>
            ${mine ? `<button class="btn small rec" data-act="pj-rec" data-id="${b.id}">● Record</button><button class="btn small ghost" data-act="pj-reccue" data-id="${b.id}" title="Hear the previous line, then record">Cue + record</button>` : ''}
            ${cur ? `<button class="icon-btn sm" data-act="pj-hear" data-id="${b.id}" aria-label="Play this line">${I.play}</button>` : ''}</div>
          <p class="pj-text">${esc(b.text)}</p>
          ${tks.length ? `<div class="pj-takes">${tks.map((t, i) => `<span class="kchip take-chip ${cur && cur.id === t.id ? 'on' : ''}"><button class="tk-pick" data-act="pj-choose" data-id="${b.id}" data-t="${t.id}" title="Use this take">Take ${i + 1} · ${esc(actorName(p, t.aid))} · ${t.dur.toFixed(1)}s</button>${t.aid === me().id ? `<button data-act="pj-tdel" data-id="${b.id}" data-t="${t.id}" aria-label="Delete take">×</button>` : ''}</span>`).join('')}</div>` : `<p class="pj-none">${mine ? 'Not recorded yet' : 'Waiting for ' + esc(p.roles[b.who] ? actorName(p, p.roles[b.who]) : b.who)}</p>`}
          ${notes.map((n) => `<div class="pj-note"><strong>${esc(n.aid === me().id ? 'You' : n.name)}:</strong> ${esc(n.text)}${n.aid === me().id ? ` <button class="link" data-act="pj-ndel" data-id="${b.id}" data-n="${n.id}">delete</button>` : ''}</div>`).join('')}
          <button class="link pj-addnote" data-act="pj-note" data-id="${b.id}">+ Note on this line</button>
        </li>`; }).join('')}</ol>
      <div class="pj-player" id="pj-player" hidden></div>
    </main>`;
  $('#pj-file').addEventListener('change', (e) => { pjImportFile(e.target.files[0]); e.target.value = ''; });
}

/* ------------------------------------------------------------------ record */
async function pjRecord(scene, bid, withCue) {
  const p = projOf(scene);
  if (PJ.rec) return pjStopRec(scene);
  if (!(await ensureName())) return;
  unlockSpeech();
  try { await getMic(); } catch { return toast('Microphone blocked — allow it in the browser’s site settings.'); }
  const i = scene.blocks.findIndex((b) => b.id === bid);
  if (withCue) {
    const prev = [...scene.blocks.slice(0, i)].reverse().find((b) => b.type === 'line');
    if (prev) { toast('Cue: ' + prev.who); await pjPlayLine(scene, prev, true); }
  }
  const r = await startRecording();
  PJ.rec = { r, bid };
  const btn = $(`.pj-line[data-id="${bid}"] [data-act="pj-rec"]`);
  if (btn) { btn.textContent = '■ Stop'; btn.classList.add('recording'); }
  toast('Recording — tap Stop when you’re done.');
}
async function pjStopRec(scene) {
  const p = projOf(scene);
  const { r, bid } = PJ.rec; PJ.rec = null;
  const { blob, dur } = await r.stop();
  if (dur < 0.3) return renderProject();
  const t = { id: 'pt-' + newId(), aid: me().id, created: Date.now(), dur, type: blob.type };
  await audioPut(t.id, blob);
  p.takes[bid] = [...(p.takes[bid] || []), t];
  p.chosen[bid] = { take: t.id, at: Date.now() };
  touch(scene); renderProject();
}

/* ------------------------------------------------------------------ playback */
async function pjPlayLine(scene, b, quiet) {
  const p = projOf(scene);
  const t = playTakeFor(p, b.id);
  if (t) {
    const blob = await audioGet(t.id);
    if (blob) { const pl = playBuffer(await decodeBlob(blob)); PJ.cur = pl; await pl.done; return 'take'; }
  }
  if (settings.pjFill || quiet) { await say(speakable(stripName(b.text, b.who)), { ref: refFor(scene, b.who), tone: b.tone, cadence: b.cadence }); return 'ai'; }
  return 'missing';
}
async function pjPlayScene(scene) {
  if (PJ.playing) { PJ.playing.stop = true; PJ.cur && PJ.cur.stop(); stopSpeech(); return; }
  unlockSpeech(); audioCtx();
  const state = (PJ.playing = { stop: false });
  const box = $('#pj-player'); box.hidden = false;
  const btn = $('[data-act="pj-play"]'); if (btn) btn.lastElementChild.textContent = 'Stop';
  for (const b of scene.blocks) {
    if (state.stop) break;
    if (b.type !== 'line') continue;
    $$('.pj-line').forEach((el) => el.classList.toggle('now', el.dataset.id === b.id));
    $(`.pj-line[data-id="${b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.innerHTML = `<strong>${esc(b.who)}</strong> ${esc(b.text.slice(0, 80))}`;
    const how = await pjPlayLine(scene, b);
    if (how === 'missing') {
      box.innerHTML = `<strong>${esc(b.who)}</strong> — no take yet. <button class="btn small primary" id="pj-go">Continue ▶</button>`;
      await new Promise((r) => { $('#pj-go').onclick = r; const t = setInterval(() => { if (state.stop) { clearInterval(t); r(); } }, 200); });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  PJ.playing = null; box.hidden = true;
  $$('.pj-line').forEach((el) => el.classList.remove('now'));
  if (btn && btn.isConnected) btn.lastElementChild.textContent = 'Play the scene';
}

// Whole scene as one WAV (chosen takes in order; AI voices or a short silence for missing lines)
async function pjExport(scene) {
  const p = projOf(scene);
  toast('Building the scene audio…');
  const items = []; let at = 0; let missing = 0;
  for (const b of scene.blocks.filter((x) => x.type === 'line')) {
    const t = playTakeFor(p, b.id);
    let buf = null;
    if (t) { const blob = await audioGet(t.id); if (blob) buf = await decodeBlob(blob); }
    if (!buf && settings.pjFill) buf = await aiLineBuffer(scene, b).catch(() => null);
    if (!buf) { missing++; at += 1.0; continue; }
    items.push({ buffer: buf, at }); at += buf.duration + 0.35;
  }
  if (!items.length) return toast('Nothing recorded yet.');
  const out = normalize(await mixDown(items, { sampleRate: 48000 }));
  downloadBlob(encodeWav(out), fileSafe(scene.title + ' - scene') + '.wav');
  toast(`Saved the scene (${out.duration.toFixed(0)} s)${missing ? ` — ${missing} line${missing === 1 ? '' : 's'} missing (left as a pause)` : ''}.`);
}
// Render an AI line to audio (Kokoro / Piper / Studio only — device voices can't be recorded)
async function aiLineBuffer(scene, b) {
  const ref = refFor(scene, b.who);
  const engine = engineChain(ref).find((e) => e !== 'device');
  if (!engine) throw new Error('no recordable voice');
  const plan = SceneTones.perform(speakable(stripName(b.text, b.who)), b.tone, b.cadence);
  const clips = await Promise.all(plan.map((s, i) => clipFor(engine, ref, s, i === 0)));
  return mixDown(clips.map((c, i) => ({ buffer: pcmToBuffer(c.pcm, c.rate), at: plan.slice(0, i).reduce((t, s, k) => t + clips[k].pcm.length / clips[k].rate + (s.gap || 0), 0) })), { sampleRate: 48000, tail: 0 });
}

/* ------------------------------------------------------------------ share + merge */
async function pjShare(scene) {
  if (!(await ensureName())) return;
  const p = projOf(scene);
  const audio = {};
  for (const t of Object.values(p.takes).flat()) {
    if (p.deleted.includes(t.id)) continue;
    const blob = await audioGet(t.id);
    if (blob) audio[t.id] = { type: blob.type, b64: await blobToB64(blob) };
  }
  const { raw, cleanup, ...sceneOut } = scene;
  const file = { app: 'scene-reader', kind: 'project', version: 1, appVersion: APP_VERSION, from: me().name, sent: new Date().toISOString(), scene: sceneOut, audio };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const how = await shareOrDownload(blob, fileSafe(scene.title) + '.scene-project.json', scene.title);
  if (how === 'downloaded') toast('Saved the project file — send it to your scene partner by text, email or Nearby Share.');
}

async function pjImportFile(file) {
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('That isn’t a Scene Reader project file.'); }
  if (!data || data.app !== 'scene-reader' || data.kind !== 'project' || !data.scene) return toast('That isn’t a Scene Reader project file.');
  const res = await pjMerge(data);
  go('#/project/' + data.scene.id);
  setTimeout(() => toast(res), 300);
}

// Merge an incoming project into this device's copy. Never overwrites anyone's takes or notes.
async function pjMerge(data) {
  const inc = data.scene, ip = inc.project || {};
  let local = getScene(inc.id);
  let newTakes = 0, newNotes = 0;
  for (const [id, a] of Object.entries(data.audio || {})) if (!(await audioGet(id))) await audioPut(id, b64ToBlob(a.b64, a.type));
  if (!local) {
    local = { ...inc, updated: Date.now() };
    scenes.unshift(local);
    projOf(local);
    newTakes = Object.values(ip.takes || {}).flat().length;
    saveScenes();
    return `Added “${inc.title}” from ${data.from || 'your scene partner'} — ${newTakes} take${newTakes === 1 ? '' : 's'}.`;
  }
  const p = projOf(local);
  const countTakes = () => Object.values(p.takes).flat().length;
  const before = countTakes();
  p.deleted = [...new Set([...p.deleted, ...(ip.deleted || [])])];
  p.notesDeleted = [...new Set([...p.notesDeleted, ...(ip.notesDeleted || [])])];
  Object.assign(p.actors, ip.actors || {}, p.actors);
  for (const [c, aid] of Object.entries(ip.roles || {})) if (!p.roles[c]) p.roles[c] = aid;
  for (const [bid, list] of Object.entries(ip.takes || {})) {
    const have = new Set((p.takes[bid] || []).map((t) => t.id));
    const add = list.filter((t) => !have.has(t.id) && !p.deleted.includes(t.id));
    if (add.length) { p.takes[bid] = [...(p.takes[bid] || []), ...add]; newTakes += add.length; }
  }
  for (const [bid, list] of Object.entries(ip.notes || {})) {
    const have = new Set((p.notes[bid] || []).map((n) => n.id));
    const add = list.filter((n) => !have.has(n.id));
    if (add.length) { p.notes[bid] = [...(p.notes[bid] || []), ...add]; newNotes += add.length; }
  }
  for (const [bid, ch] of Object.entries(ip.chosen || {})) if (!p.chosen[bid] || ch.at > p.chosen[bid].at) p.chosen[bid] = ch;
  for (const bid of Object.keys(p.takes)) p.takes[bid] = p.takes[bid].filter((t) => { const keep = !p.deleted.includes(t.id); if (!keep) audioDel(t.id); return keep; });
  const removed = before + newTakes - countTakes();
  const scriptDiffers = JSON.stringify(local.blocks.map((b) => [b.id, b.who, b.text])) !== JSON.stringify(inc.blocks.map((b) => [b.id, b.who, b.text]));
  touch(local);
  return `Merged from ${data.from || 'your scene partner'}: ${newTakes} new take${newTakes === 1 ? '' : 's'}, ${newNotes} new note${newNotes === 1 ? '' : 's'}${removed ? `, ${removed} take${removed === 1 ? '' : 's'} deleted by ${removed === 1 ? 'its owner' : 'their owners'}` : ''}.${scriptDiffers ? ' (Their script edits were not applied — yours is kept.)' : ''}`;
}

/* ------------------------------------------------------------------ events */
async function pjClick(act, btn) {
  if (!act.startsWith('pj-')) return false;
  const scene = getScene(current.id);
  const p = scene && projOf(scene);
  switch (act) {
    case 'pj-import': $('#pj-file').click(); return true;
    case 'pj-claim': if (!(await ensureName())) return true; p.roles[btn.dataset.c] = me().id; touch(scene); renderProject(); return true;
    case 'pj-unclaim': delete p.roles[btn.dataset.c]; touch(scene); renderProject(); return true;
    case 'pj-rec': pjRecord(scene, btn.dataset.id, false); return true;
    case 'pj-reccue': pjRecord(scene, btn.dataset.id, true); return true;
    case 'pj-hear': unlockSpeech(); pjPlayLine(scene, scene.blocks.find((b) => b.id === btn.dataset.id)); return true;
    case 'pj-choose': p.chosen[btn.dataset.id] = { take: btn.dataset.t, at: Date.now() }; touch(scene); renderProject(); return true;
    case 'pj-tdel': {
      const t = lineTakes(p, btn.dataset.id).find((x) => x.id === btn.dataset.t);
      if (!t || t.aid !== me().id) return toast('You can only delete your own takes.'), true;
      if (!confirm('Delete this take? It will also disappear for your scene partner when they open your next file.')) return true;
      p.deleted.push(t.id); p.takes[btn.dataset.id] = p.takes[btn.dataset.id].filter((x) => x.id !== t.id); await audioDel(t.id);
      if (p.chosen[btn.dataset.id]?.take === t.id) delete p.chosen[btn.dataset.id];
      touch(scene); renderProject(); return true;
    }
    case 'pj-note': {
      if (!(await ensureName())) return true;
      const r = await ask({ title: 'Note on this line', placeholder: 'e.g. Take a beat before “I swear” — let them see you decide to lie', plain: true });
      if (r.action === 'ok' && r.value) { p.notes[btn.dataset.id] = [...(p.notes[btn.dataset.id] || []), { id: 'n-' + newId(), aid: me().id, name: me().name, text: r.value, at: Date.now() }]; touch(scene); renderProject(); }
      return true;
    }
    case 'pj-ndel': p.notesDeleted.push(btn.dataset.n); p.notes[btn.dataset.id] = (p.notes[btn.dataset.id] || []).filter((n) => n.id !== btn.dataset.n); touch(scene); renderProject(); return true;
    case 'pj-play': pjPlayScene(scene); return true;
    case 'pj-share': pjShare(scene); return true;
    case 'pj-export': pjExport(scene); return true;
    case 'pj-make': { const s = getScene(btn.dataset.id || current.id); if (!(await ensureName())) return true; projOf(s); if (s.me) s.project.roles[s.me] = me().id; touch(s); go('#/project/' + s.id); return true; }
  }
  return false;
}
function pjChange(e) { if (e.target.id === 'pj-fill') { settings.pjFill = e.target.checked; saveSettings(); return true; } return false; }
function pjLeave() { if (PJ.playing) { PJ.playing.stop = true; PJ.cur && PJ.cur.stop(); } if (PJ.rec) { const s = getScene(current.id); PJ.rec.r.stop(); PJ.rec = null; } }
