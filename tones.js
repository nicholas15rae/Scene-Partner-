// Scene Reader — tone tags, cadence, the "performance plan", and the voice catalogue.
// Plain script; exposes window.SceneTones and window.VoicePacks.
//
// TONE TAGS are engine-neutral. Each describes INTENT (emotion, intensity, style) plus delivery hints.
// Every voice engine turns them into what it can do:
//   • Kokoro / Piper: phrasing tricks (punctuation, chunking, pauses) + speed, pitch and volume per phrase
//   • Studio (Chatterbox on your desktop): emotion "exaggeration" + pacing, from `emotion` / `intensity`
//   • Device voices: rate, pitch, volume per phrase
// Tags saved on your lines never need to change when a better engine arrives.
(function () {
'use strict';

const TAGS = {
  neutral:   { label: 'Neutral',   emotion: 'neutral',    intensity: 0.0, style: 'plain',             speed: 1.00, pitch: 0,    volume: 1.00, gap: 0,    punct: '' },
  angry:     { label: 'Angry',     emotion: 'anger',      intensity: 0.8, style: 'tense, clipped',    speed: 1.12, pitch: -1.5, volume: 1.40, gap: 0.08, punct: 'exclaim' },
  shouting:  { label: 'Shouting',  emotion: 'anger',      intensity: 1.0, style: 'loud, projected',   speed: 1.12, pitch: 3,    volume: 1.80, gap: 0.10, punct: 'exclaim' },
  whisper:   { label: 'Whisper',   emotion: 'secrecy',    intensity: 0.6, style: 'whispered',         speed: 0.86, pitch: -1,   volume: 0.32, gap: 0.30, punct: 'soft', thin: true },
  soft:      { label: 'Soft',      emotion: 'tenderness', intensity: 0.4, style: 'gentle, quiet',     speed: 0.88, pitch: -1,   volume: 0.62, gap: 0.25, punct: 'soft' },
  sad:       { label: 'Sad',       emotion: 'sadness',    intensity: 0.7, style: 'heavy, slow',       speed: 0.80, pitch: -3,   volume: 0.72, gap: 0.45, punct: 'trail' },
  nervous:   { label: 'Nervous',   emotion: 'fear',       intensity: 0.6, style: 'quick, unsure',     speed: 1.18, pitch: 2,    volume: 0.88, gap: 0.18, punct: 'stutter' },
  sarcastic: { label: 'Sarcastic', emotion: 'contempt',   intensity: 0.7, style: 'dry, drawn-out',    speed: 0.84, pitch: 2,    volume: 1.05, gap: 0.30, punct: 'sneer' },
  urgent:    { label: 'Urgent',    emotion: 'urgency',    intensity: 0.9, style: 'fast, pressing',    speed: 1.26, pitch: 1.5,  volume: 1.30, gap: 0.04, punct: 'runon' },
  warm:      { label: 'Warm',      emotion: 'warmth',     intensity: 0.5, style: 'friendly, smiling', speed: 0.92, pitch: 1,    volume: 1.05, gap: 0.20, punct: 'soft' },
};
const CADENCES = {
  steady:   { label: 'Steady',      hint: 'even all the way through' },
  building: { label: 'Building',    hint: 'gets louder, faster and higher' },
  trailing: { label: 'Trailing off', hint: 'fades, slows and drops away' },
  clipped:  { label: 'Clipped',     hint: 'short, chopped phrases' },
};
const PAUSES = [0, 0.5, 1, 2, 3];
const delivery = (tag) => TAGS[tag] || TAGS.neutral;

/* ---------------------------------------------------------------- phrasing tricks */
const CONJ = /\s+(and|but|so|because|or|then|if|when)\s+/gi;
function textTricks(t, d) {
  switch (d.punct) {
    case 'exclaim': return t.replace(/\.(?=\s|$)(?!\.)/g, '!').replace(/,\s*/g, '. ');
    case 'runon':   return t.replace(/,\s*/g, ' ').replace(/\.(?=\s|$)(?!\.)/g, '!');
    case 'soft':    return t.replace(/,?\s+(and|but|so|because|or|then|if|when)\s+/gi, (m, w) => `, ${w} `);
    case 'trail':   return t.replace(/,?\s+(and|but|so|because|or|then|if|when)\s+/gi, (m, w) => `… ${w} `).replace(/[.!]$/, '…');
    case 'stutter': return t.replace(/^(\W*)([A-Za-z’']+)/, (m, p, w) => `${p}${w}— ${w}`).replace(/,\s*/g, '… ');
    default: return t;
  }
}

// Split into phrases, keeping punctuation. "*word*" (emphasis) and " / " (breath) become their own beats.
function phrases(t, clipped) {
  const out = [];
  const re = clipped ? /[^.!?…,;:—]+[.!?…,;:—]*/g : /[^.!?…]+[.!?…]*/g;
  for (const raw of t.split(/\s+\/\s+|\s\/\/\s/)) {
    const bits = raw.match(re) || [raw];
    bits.map((x) => x.trim()).filter(Boolean).forEach((x) => out.push({ text: x }));
    if (out.length) out[out.length - 1].breath = true;
  }
  if (out.length) out[out.length - 1].breath = false;
  // pull out emphasised words
  const res = [];
  for (const p of out) {
    const parts = p.text.split(/(\*[^*]+\*)/).filter((x) => x.trim());
    parts.forEach((x, i) => res.push({ text: x.replace(/\*/g, '').replace(/^[\s,;:]+/, '').trim(), emph: /^\*.*\*$/.test(x.trim()), breath: i === parts.length - 1 && p.breath }));
  }
  return res.filter((p) => /[A-Za-z0-9]/.test(p.text));
}

// For a one-phrase line, cut into 2–3 chunks so a building/trailing cadence can be heard
function chunkWords(text, n) {
  const w = text.split(/\s+/);
  if (w.length < 6) return [text];
  const size = Math.ceil(w.length / n);
  const out = [];
  for (let i = 0; i < w.length; i += size) out.push(w.slice(i, i + size).join(' '));
  return out;
}

/* ---------------------------------------------------------------- the performance plan
   Returns segments: { text, speed, pitch (semitones), gain, gap (s after), thin, exaggeration }
   One plain segment for a neutral, steady line with no marks (sounds most natural). */
function perform(text, tag, cadence) {
  const d = delivery(tag);
  const cad = CADENCES[cadence] ? cadence : 'steady';
  const marked = /\*[^*]+\*|\s\/\s/.test(text);
  let t = textTricks(text, d);
  const base = { speed: d.speed, pitch: d.pitch, gain: d.volume, thin: !!d.thin, exaggeration: exaggerationFor(d) };
  if (cad === 'steady' && !marked && d.punct !== 'sneer' && !d.gap) return [{ ...base, text: t.replace(/\*/g, ''), gap: 0 }];

  let ps = phrases(t, cad === 'clipped' || d.punct === 'exclaim');
  if (!ps.length) return [{ ...base, text: t.replace(/\*/g, ''), gap: 0 }];
  if ((cad === 'building' || cad === 'trailing') && ps.length === 1 && !ps[0].emph) ps = chunkWords(ps[0].text, 3).map((x) => ({ text: x }));
  // Sarcastic: hang on the last word — "Sure. You were… *working*."
  if (d.punct === 'sneer') {
    const last = ps[ps.length - 1];
    const m = last.text.match(/^(.*\S)\s+(\S+[.!?…]*)$/);
    if (m && !last.emph) ps.splice(ps.length - 1, 1, { text: m[1] + '…' }, { text: m[2], emph: true });
  }
  const n = ps.length;
  return ps.map((p, i) => {
    const k = n > 1 ? i / (n - 1) : 1;
    const s = { ...base, text: p.text, gap: d.gap };
    if (cad === 'building') { s.speed *= 0.94 + 0.2 * k; s.gain *= 0.75 + 0.6 * k; s.pitch += 2.5 * k; s.gap *= 0.6; }
    if (cad === 'trailing') { s.speed *= 1 - 0.2 * k; s.gain *= 1 - 0.55 * k; s.pitch -= 2.5 * k; s.gap = Math.max(s.gap, 0.25) * (1 + k); if (i === n - 1) s.text = s.text.replace(/[.!?]*$/, '…'); }
    if (cad === 'clipped') { s.speed *= 1.1; s.gap = 0.07; s.text = s.text.replace(/[,;:—]$/, '.'); if (!/[.!?…]$/.test(s.text)) s.text += '.'; }
    if (p.emph) { s.speed *= 0.86; s.gain *= 1.3; s.pitch += 1.5; s.gapBefore = 0.12; }
    if (p.breath) s.gap = Math.max(s.gap, 0.35);
    if (i === n - 1) s.gap = 0;
    return s;
  });
}
// Studio (Chatterbox) "exaggeration": 0.25 calm … 2 very intense; default 0.5
function exaggerationFor(d) { return Math.round((0.4 + d.intensity * (d.emotion === 'anger' ? 1.1 : 0.8)) * 100) / 100; }

window.SceneTones = { TAGS, CADENCES, PAUSES, delivery, perform };

/* ---------------------------------------------------------------- VOICE CATALOGUE
   Add packs here (same shape) to offer more voices. A voice's `ref` is "engine:id".
   `rank`: our best-first ranking within each gender, across all engines (1 = best). */
const KG = (id, name, grade, rank) => ({
  engine: 'kokoro', id, ref: 'kokoro:' + id, name, grade, rank,
  gender: id[1] === 'f' ? 'Female' : 'Male', accent: id[0] === 'a' ? 'American' : 'British',
});
const PV = (id, name, gender, accent, rank, size, extra = {}) => {
  const [loc, voice, quality] = id.split('-');
  return { engine: 'piper', id, ref: 'piper:' + id, name, gender, accent, rank, size, quality,
    path: `${loc.slice(0, 2)}/${loc}/${voice}/${quality}/${id}`, ...extra };
};

window.VoicePacks = [
  {
    id: 'kokoro-en', engine: 'kokoro', name: 'Kokoro (built in)', model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    sample: 'Hi. I’ll be reading with you today. Whenever you’re ready.',
    voices: [
      KG('af_heart', 'Heart', 'A', 1), KG('af_bella', 'Bella', 'A-', 2), KG('af_nicole', 'Nicole', 'B-', 5), KG('bf_emma', 'Emma', 'B-', 6),
      KG('af_aoede', 'Aoede', 'C+', 10), KG('af_kore', 'Kore', 'C+', 11), KG('af_sarah', 'Sarah', 'C+', 12), KG('bf_isabella', 'Isabella', 'C', 15),
      KG('af_alloy', 'Alloy', 'C', 16), KG('af_nova', 'Nova', 'C', 17), KG('af_sky', 'Sky', 'C-', 19), KG('bf_alice', 'Alice', 'D', 22),
      KG('bf_lily', 'Lily', 'D', 23), KG('af_jessica', 'Jessica', 'D', 24), KG('af_river', 'River', 'D', 25),
      KG('am_fenrir', 'Fenrir', 'C+', 2), KG('am_michael', 'Michael', 'C+', 3), KG('am_puck', 'Puck', 'C+', 6), KG('bm_george', 'George', 'C', 8),
      KG('bm_fable', 'Fable', 'C', 10), KG('bm_lewis', 'Lewis', 'D+', 14), KG('am_echo', 'Echo', 'D', 17), KG('am_eric', 'Eric', 'D', 18),
      KG('am_liam', 'Liam', 'D', 19), KG('am_onyx', 'Onyx', 'D', 20), KG('bm_daniel', 'Daniel', 'D', 21), KG('am_santa', 'Santa', 'D-', 24), KG('am_adam', 'Adam', 'F+', 25),
    ],
  },
  {
    id: 'piper-en', engine: 'piper', name: 'Piper (download per voice)', repo: 'rhasspy/piper-voices',
    sample: 'Hi. I’ll be reading with you today. Whenever you’re ready.',
    voices: [
      PV('en_US-ryan-high', 'Ryan', 'Male', 'American', 1, 121), PV('en_GB-northern_english_male-medium', 'Northern English', 'Male', 'British', 4, 63),
      PV('en_US-joe-medium', 'Joe', 'Male', 'American', 5, 63), PV('en_US-hfc_male-medium', 'HFC Male', 'Male', 'American', 7, 63),
      PV('en_US-john-medium', 'John', 'Male', 'American', 9, 63), PV('en_US-bryce-medium', 'Bryce', 'Male', 'American', 11, 63),
      PV('en_US-norman-medium', 'Norman', 'Male', 'American', 12, 63), PV('en_GB-alan-medium', 'Alan', 'Male', 'British', 13, 63),
      PV('en_US-kusal-medium', 'Kusal', 'Male', 'American', 15, 63), PV('en_US-ryan-medium', 'Ryan (smaller)', 'Male', 'American', 16, 63),
      PV('en_US-danny-low', 'Danny', 'Male', 'American', 22, 63), PV('en_US-reza_ibrahim-medium', 'Reza', 'Male', 'American', 23, 63),
      PV('en_US-lessac-high', 'Lessac', 'Female', 'American', 3, 109), PV('en_US-hfc_female-medium', 'HFC Female', 'Female', 'American', 4, 63),
      PV('en_GB-cori-high', 'Cori', 'Female', 'British', 7, 109), PV('en_US-amy-medium', 'Amy', 'Female', 'American', 8, 63),
      PV('en_US-ljspeech-high', 'LJ', 'Female', 'American', 9, 109), PV('en_GB-jenny_dioco-medium', 'Jenny', 'Female', 'British', 13, 63),
      PV('en_US-kristin-medium', 'Kristin', 'Female', 'American', 14, 63), PV('en_GB-alba-medium', 'Alba', 'Female', 'British', 18, 63),
      PV('en_GB-southern_english_female-low', 'Southern English', 'Female', 'British', 20, 63), PV('en_US-kathleen-low', 'Kathleen', 'Female', 'American', 21, 63),
      // Multi-speaker models: one download, hundreds of different voices (pick a speaker number)
      PV('en_US-libritts_r-medium', 'LibriTTS (904 voices)', 'Mixed', 'American', 30, 78, { speakers: 904 }),
      PV('en_GB-vctk-medium', 'VCTK (109 voices)', 'Mixed', 'British', 31, 77, { speakers: 109 }),
    ],
  },
];
})();
