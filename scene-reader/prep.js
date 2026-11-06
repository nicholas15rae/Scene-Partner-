// Scene Reader — Prep: scene breakdown, beats + action verbs, imagination and physical prep,
// alternate-take prompts. Plain script, loaded before app.js. Saved with the script, on this device.
// Approach: imagination ("as if") and physical work — not digging into your personal memories.
'use strict';

const VERBS = ['to charm', 'to corner', 'to plead with', 'to provoke', 'to reassure', 'to test', 'to warn', 'to dismiss', 'to beg', 'to challenge',
  'to comfort', 'to confess to', 'to deflect', 'to dominate', 'to expose', 'to flatter', 'to interrogate', 'to mock', 'to soothe', 'to stall',
  'to threaten', 'to win over', 'to seduce', 'to shame', 'to rally', 'to cross-examine', 'to trap', 'to tease', 'to bargain with', 'to lecture',
  'to protect', 'to dare', 'to belittle', 'to coax', 'to calm', 'to unsettle', 'to impress', 'to punish', 'to forgive', 'to recruit',
  'to wound', 'to steady', 'to hustle', 'to unmask', 'to dazzle', 'to needle', 'to pin down', 'to warn off', 'to win back', 'to crush',
  'to lure', 'to placate', 'to silence', 'to celebrate', 'to accuse', 'to enlist', 'to humour', 'to unnerve', 'to cajole', 'to defy'].sort();

const AS_IF = [
  'It’s as if you’re the last person holding a door shut against a storm.',
  'It’s as if every word costs you money — spend carefully.',
  'It’s as if they’re standing on a ledge and only your voice can bring them back.',
  'It’s as if you’ve rehearsed this speech a hundred times and it’s coming out wrong.',
  'It’s as if the room is slowly filling with water and only you have noticed.',
  'It’s as if you’re defusing a bomb and they’re holding the wire cutters.',
  'It’s as if you’re a lawyer who knows the witness is lying.',
  'It’s as if a camera is hidden somewhere and you must not be caught out.',
  'It’s as if they owe you everything and have forgotten.',
  'It’s as if you’re smuggling something precious past a guard.',
  'It’s as if you just won the lottery and can’t tell anyone yet.',
  'It’s as if you’re a cat that has cornered something it doesn’t want to eat yet.',
  'It’s as if the floor is tilting and only you can keep it level.',
  'It’s as if you have three minutes before the train leaves.',
  'It’s as if they’re the only witness to something you did.',
  'It’s as if you’re talking someone down from doing something reckless.',
  'It’s as if you’re auditioning to be their best friend.',
  'It’s as if the walls have ears and you must say it anyway.',
];
const PHYSICAL = {
  breath: ['High, quick breaths in the upper chest — as if you’ve just run up stairs.', 'Slow, low breath into the belly; let the exhale be longer than the inhale.',
    'Hold the breath slightly before each line, as if you’re about to be caught.', 'Sigh out fully, then take in only what you need.',
    'Breathe through the nose only — controlled, guarded.', 'Short in-breath, long steady out-breath, like blowing out a candle slowly.'],
  posture: ['Weight forward on the balls of your feet, ready to move.', 'Sink into the hips; heavy, rooted, immovable.', 'Chin up, chest open — you own this room.',
    'Shoulders rounding in, as if protecting something in your chest.', 'Lean back slightly, relaxed and amused.', 'Spine long, very still — only the eyes move.'],
  gesture: ['Push (away, with the whole body)', 'Pull (toward you, reeling something in)', 'Lift (raising something heavy up and out)', 'Smash (bringing something down hard)',
    'Embrace (gathering in)', 'Tear (ripping apart)', 'Wring (twisting, squeezing)', 'Penetrate (driving forward, through)', 'Throw (releasing out, away)', 'Open (spreading wide)'],
};
const ALT_TAKES = ['as a threat', 'as a joke', 'as a secret', 'as an apology', 'as a dare', 'as a confession', 'as if it’s the first time you’ve thought it',
  'as if you’ve said it a hundred times', 'as a victory', 'while trying not to cry', 'while trying not to laugh', 'to a child', 'as a sales pitch',
  'as a seduction', 'as a warning', 'as a question', 'as an accusation', 'as a lullaby', 'as if someone is listening at the door', 'as if it’s the last thing you’ll ever say',
  'as a test of their loyalty', 'with total calm', 'as a plea', 'as a celebration'];

const pick = (arr, not) => { const a = arr.filter((x) => x !== not); return a[Math.floor(Math.random() * a.length)]; };
const prepOf = (s) => (s.prep = s.prep || { beats: [], alt: {}, physical: {} });

function renderPrep() {
  const scene = getScene(current.id);
  if (!scene) return go('#/');
  const P = prepOf(scene);
  document.title = 'Prep · ' + scene.title;
  const lines = scene.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'line');
  const mine = lines.filter(({ b }) => b.who === scene.me);
  const lineLabel = (b, i) => `${i + 1}. ${b.who}: ${b.text.slice(0, 50)}${b.text.length > 50 ? '…' : ''}`;
  const field = (k, label, ph) => `<label class="field col"><span>${label}</span><textarea class="pf" data-k="${k}" rows="2" placeholder="${esc(ph)}">${esc(P[k] || '')}</textarea></label>`;
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-go="#/cast/${scene.id}" aria-label="Back">${I.back}</button>
      <div class="top-title">Prep · ${esc(scene.title)}</div>
    </header>
    <main class="wrap prep">
      <h1 class="step-h">Prep ${scene.me ? `<span class="you-tag">${esc(scene.me)}</span>` : ''}</h1>
      ${!scene.me ? '<p class="hint">Pick your character first (back) so Prep can show your lines.</p>' : ''}

      <h2 class="section-h">The scene</h2>
      <div class="panel">
        ${field('objective', 'Objective — what do I want from them?', 'e.g. Get Okafor to believe me and let me go home')}
        ${field('obstacle', 'Obstacle — what’s in my way?', 'e.g. The camera footage contradicts my story')}
        ${field('stakes', 'Stakes — what happens if I don’t get it?', 'e.g. I’m charged; my sister finds out where I really was')}
      </div>

      <h2 class="section-h">Beats &amp; action verbs</h2>
      <div class="panel beats">
        ${(P.beats || []).length ? P.beats.map((bt, k) => `<div class="beat" data-k="${k}">
            <div class="beat-head"><span class="beat-n">Beat ${k + 1}</span>
              <select class="bt-start" aria-label="Beat starts at">${scene.blocks.map((b, i) => b.type === 'line' ? `<option value="${b.id}" ${b.id === bt.start ? 'selected' : ''}>${esc(lineLabel(b, i))}</option>` : '').join('')}</select>
              <button class="icon-btn sm" data-act="beat-del" data-k="${k}" aria-label="Delete beat">${I.trash}</button></div>
            <div class="beat-row"><input class="bt-title plain" value="${esc(bt.title || '')}" placeholder="Name this beat (e.g. The denial)">
              <select class="bt-verb" aria-label="Action verb"><option value="">Action verb…</option>${VERBS.map((v) => `<option ${v === bt.verb ? 'selected' : ''}>${v}</option>`).join('')}</select>
              <button class="btn small ghost" data-act="beat-verb" data-k="${k}">Suggest</button></div>
          </div>`).join('') : '<p class="note">Split the scene into beats — each time what you’re doing changes. Give each an action verb: what you’re doing <em>to</em> them.</p>'}
        <button class="btn ghost" data-act="beat-add">+ Add a beat</button>
      </div>

      <h2 class="section-h">Imagination</h2>
      <div class="panel">
        <div class="card-prompt" id="asif">${esc(P.asif || pick(AS_IF))}</div>
        <div class="btn-row"><button class="btn ghost" data-act="asif-next">Another “as if”</button><button class="btn ghost" data-act="asif-keep">Keep this one</button></div>
        ${field('asifNotes', 'What does this make me want to do?', 'Images, impulses, what changes in your body…')}
      </div>

      <h2 class="section-h">Physical prep</h2>
      <div class="panel phys">
        ${Object.entries({ breath: 'Breath', posture: 'Posture', gesture: 'Psychological gesture' }).map(([k, label]) => `
          <div class="phys-row"><span class="lbl">${label}</span><div class="card-prompt small" id="ph-${k}">${esc(P.physical[k] || pick(PHYSICAL[k]))}</div>
          <div class="btn-row"><button class="btn small ghost" data-act="ph-next" data-k="${k}">Another</button><button class="btn small ghost" data-act="ph-keep" data-k="${k}">Keep</button></div></div>`).join('')}
        <p class="note">Psychological gesture: do it big, full-body, three times — then keep only the inner impulse when you say the lines.</p>
      </div>

      <h2 class="section-h">Alternate takes</h2>
      <div class="panel alts">
        ${mine.length ? mine.map(({ b }) => `<div class="alt" data-id="${b.id}">
            <p class="alt-line">${esc(b.text)}</p>
            <div class="alt-row"><span class="alt-prompt">${P.alt[b.id] ? 'Try it <strong>' + esc(P.alt[b.id]) + '</strong>' : '<em>No prompt yet</em>'}</span>
              <button class="btn small ghost" data-act="alt-next" data-id="${b.id}">${P.alt[b.id] ? 'Another' : 'Give me one'}</button>
              ${P.alt[b.id] ? `<button class="icon-btn sm" data-act="alt-clear" data-id="${b.id}" aria-label="Clear">×</button>` : ''}</div>
          </div>`).join('') : '<p class="note">Your lines appear here once you’ve picked your character.</p>'}
        ${mine.length ? '<button class="btn ghost" data-act="alt-all">Shuffle a prompt for every line</button>' : ''}
        <p class="note">Prompts show on your lines while you rehearse. Wild choices help you find the real one.</p>
      </div>
      <button class="btn huge primary" data-go="#/run/${scene.id}">${I.play}<span>Rehearse with this prep</span></button>
    </main>`;
  app.oninput = (e) => {
    const f = e.target.closest('.pf');
    if (f) { P[f.dataset.k] = f.value; clearTimeout(f._t); f._t = setTimeout(() => touch(scene), 400); }
    const bt = e.target.closest('.bt-title');
    if (bt) { P.beats[+bt.closest('.beat').dataset.k].title = bt.value; clearTimeout(bt._t); bt._t = setTimeout(() => touch(scene), 400); }
  };
}

function prepChange(e) {
  if (current.view !== 'prep') return false;
  const scene = getScene(current.id), P = prepOf(scene);
  const bt = e.target.closest('.beat');
  if (bt && e.target.matches('.bt-start')) { P.beats[+bt.dataset.k].start = e.target.value; sortBeats(scene); touch(scene); renderPrep(); return true; }
  if (bt && e.target.matches('.bt-verb')) { P.beats[+bt.dataset.k].verb = e.target.value; touch(scene); return true; }
  return false;
}
function sortBeats(scene) {
  const pos = (id) => scene.blocks.findIndex((b) => b.id === id);
  scene.prep.beats.sort((a, b) => pos(a.start) - pos(b.start));
}

function prepClick(act, btn) {
  if (current.view !== 'prep') return false;
  const scene = getScene(current.id), P = prepOf(scene);
  const keepScroll = () => { const y = scrollY; renderPrep(); scrollTo(0, y); };
  switch (act) {
    case 'beat-add': {
      const used = new Set(P.beats.map((b) => b.start));
      const first = scene.blocks.find((b) => b.type === 'line' && !used.has(b.id));
      P.beats.push({ start: first ? first.id : '', title: '', verb: '' }); sortBeats(scene); touch(scene); keepScroll(); return true;
    }
    case 'beat-del': P.beats.splice(+btn.dataset.k, 1); touch(scene); keepScroll(); return true;
    case 'beat-verb': P.beats[+btn.dataset.k].verb = pick(VERBS, P.beats[+btn.dataset.k].verb); touch(scene); keepScroll(); return true;
    case 'asif-next': $('#asif').textContent = pick(AS_IF, $('#asif').textContent); return true;
    case 'asif-keep': P.asif = $('#asif').textContent; touch(scene); toast('Kept.'); return true;
    case 'ph-next': { const el = $('#ph-' + btn.dataset.k); el.textContent = pick(PHYSICAL[btn.dataset.k], el.textContent); return true; }
    case 'ph-keep': P.physical[btn.dataset.k] = $('#ph-' + btn.dataset.k).textContent; touch(scene); toast('Kept.'); return true;
    case 'alt-next': P.alt[btn.dataset.id] = pick(ALT_TAKES, P.alt[btn.dataset.id]); touch(scene); keepScroll(); return true;
    case 'alt-clear': delete P.alt[btn.dataset.id]; touch(scene); keepScroll(); return true;
    case 'alt-all': scene.blocks.filter((b) => b.type === 'line' && b.who === scene.me).forEach((b) => (P.alt[b.id] = pick(ALT_TAKES, P.alt[b.id]))); touch(scene); keepScroll(); return true;
  }
  return false;
}

// Shown on the rehearsal screen: beat banner + alternate-take prompt
function prepRunExtras(scene, b) {
  const P = scene.prep;
  if (!P) return { before: '', tag: '' };
  const k = (P.beats || []).findIndex((x) => x.start === b.id);
  const bt = k >= 0 ? P.beats[k] : null;
  return {
    before: bt ? `<div class="rb beat-banner">Beat ${k + 1}${bt.title ? ' · ' + esc(bt.title) : ''}${bt.verb ? ` — <strong>${esc(bt.verb)}</strong>` : ''}</div>` : '',
    tag: P.alt && P.alt[b.id] && b.who === scene.me ? `<span class="tag alt">try it ${esc(P.alt[b.id])}</span>` : '',
  };
}
