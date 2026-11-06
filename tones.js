// Scene Reader — tone tags and voice packs (plain script; exposes window.SceneTones and window.VoicePacks).
//
// TONE TAGS are engine-neutral. Each tag describes the INTENT (emotion + intensity) and a few
// generic delivery hints. Every voice engine maps them to whatever it can do:
//   • Kokoro / device voices: speed, pitch (semitones), volume, pauses   (what v1.3 uses)
//   • A future emotion-capable engine (e.g. Chatterbox, Orpheus on a desktop GPU) can read
//     `emotion`, `intensity` and `style` instead — the tags stored on your lines stay the same.
(function () {
'use strict';

const TAGS = {
  neutral:   { label: 'Neutral',   emotion: 'neutral',   intensity: 0.0, style: 'plain',          speed: 1.00, pitch: 0,    volume: 1.00 },
  angry:     { label: 'Angry',     emotion: 'anger',     intensity: 0.7, style: 'tense, clipped', speed: 1.06, pitch: -1,   volume: 1.20 },
  shouting:  { label: 'Shouting',  emotion: 'anger',     intensity: 1.0, style: 'loud, projected', speed: 1.08, pitch: 2,   volume: 1.45 },
  whisper:   { label: 'Whisper',   emotion: 'secrecy',   intensity: 0.6, style: 'whispered',      speed: 0.90, pitch: -1,   volume: 0.40 },
  soft:      { label: 'Soft',      emotion: 'tenderness', intensity: 0.4, style: 'gentle, quiet', speed: 0.94, pitch: -0.5, volume: 0.70 },
  sad:       { label: 'Sad',       emotion: 'sadness',   intensity: 0.6, style: 'heavy, slow',    speed: 0.88, pitch: -2,   volume: 0.80 },
  nervous:   { label: 'Nervous',   emotion: 'fear',      intensity: 0.5, style: 'quick, unsure',  speed: 1.10, pitch: 1,    volume: 0.90 },
  sarcastic: { label: 'Sarcastic', emotion: 'contempt',  intensity: 0.6, style: 'dry, drawn-out', speed: 0.94, pitch: 1,    volume: 1.00 },
  urgent:    { label: 'Urgent',    emotion: 'urgency',   intensity: 0.8, style: 'fast, pressing', speed: 1.15, pitch: 1,    volume: 1.10 },
  warm:      { label: 'Warm',      emotion: 'warmth',    intensity: 0.5, style: 'friendly, smiling', speed: 0.96, pitch: 0.5, volume: 1.00 },
};
const PAUSES = [0, 0.5, 1, 2, 3]; // seconds, before or after a line

// What a given engine should do for a tag. Unknown/empty tag = neutral.
function delivery(tag) { return TAGS[tag] || TAGS.neutral; }

window.SceneTones = { TAGS, PAUSES, delivery };

// VOICE PACKS. To add more voices later, add a pack here (same shape). Kokoro voices must
// exist in that model's `voices/` folder on Hugging Face; a future engine adds its own pack.
const g = (id, name, grade) => ({
  id, name, grade,
  gender: id[1] === 'f' ? 'Female' : 'Male',
  accent: id[0] === 'a' ? 'American' : 'British',
});
window.VoicePacks = [
  {
    id: 'kokoro-en', engine: 'kokoro', name: 'Kokoro · English',
    model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    sample: 'Hi. I’ll be reading with you today. Whenever you’re ready.',
    voices: [
      g('af_heart', 'Heart', 'A'), g('af_bella', 'Bella', 'A-'), g('af_nicole', 'Nicole', 'B-'), g('af_aoede', 'Aoede', 'C+'),
      g('af_kore', 'Kore', 'C+'), g('af_sarah', 'Sarah', 'C+'), g('af_alloy', 'Alloy', 'C'), g('af_nova', 'Nova', 'C'),
      g('af_sky', 'Sky', 'C-'), g('af_jessica', 'Jessica', 'D'), g('af_river', 'River', 'D'),
      g('am_fenrir', 'Fenrir', 'C+'), g('am_michael', 'Michael', 'C+'), g('am_puck', 'Puck', 'C+'), g('am_echo', 'Echo', 'D'),
      g('am_eric', 'Eric', 'D'), g('am_liam', 'Liam', 'D'), g('am_onyx', 'Onyx', 'D'), g('am_santa', 'Santa', 'D-'), g('am_adam', 'Adam', 'F+'),
      g('bf_emma', 'Emma', 'B-'), g('bf_isabella', 'Isabella', 'C'), g('bf_alice', 'Alice', 'D'), g('bf_lily', 'Lily', 'D'),
      g('bm_george', 'George', 'C'), g('bm_fable', 'Fable', 'C'), g('bm_lewis', 'Lewis', 'D+'), g('bm_daniel', 'Daniel', 'D'),
    ],
  },
];
})();
