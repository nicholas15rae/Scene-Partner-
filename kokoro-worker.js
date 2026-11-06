// Scene Reader — Kokoro voice engine (runs in the background on this device).
// Only the voice MODEL is downloaded (once, from Hugging Face) and cached in this browser.
// Your script text is turned into speech right here and is never sent anywhere.
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';

// Use the bundled speech-engine files instead of a CDN
env.wasmPaths = new URL('./vendor/kokoro/', import.meta.url).href;

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let chain = Promise.resolve(); // one job at a time — the model can't run two at once

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function load({ id, device, dtype }) {
  const files = new Map();
  tts = await KokoroTTS.from_pretrained(MODEL, {
    dtype,
    device,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file) files.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
      if (p.status === 'done' && p.file && files.has(p.file)) { const f = files.get(p.file); f.loaded = f.total; }
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      post({ type: 'progress', status: p.status, file: p.file || '', loaded, total });
    },
  });
  // Quick self-test so a broken engine (e.g. a GPU that can't run it) is caught now, not mid-scene
  const t0 = performance.now();
  const a = await tts.generate('Ready when you are.', { voice: 'af_heart', speed: 1 });
  const pcm = a.audio;
  let energy = 0, bad = false;
  for (let i = 0; i < pcm.length; i += 7) { const v = pcm[i]; if (!Number.isFinite(v)) { bad = true; break; } energy += v * v; }
  if (bad || !pcm.length || energy === 0) throw new Error('Voice engine self-test produced no usable audio');
  post({ id, type: 'loaded', device, dtype, testMs: Math.round(performance.now() - t0) });
}

async function speak({ id, text, voice, speed }) {
  if (!tts) throw new Error('Voice engine not loaded');
  const a = await tts.generate(text, { voice, speed });
  const pcm = new Float32Array(a.audio); // own copy, so it can be handed over without copying again
  post({ id, type: 'audio', pcm, rate: a.sampling_rate }, [pcm.buffer]);
}

self.onmessage = (e) => {
  const msg = e.data || {};
  chain = chain.then(async () => {
    try {
      if (msg.type === 'load') await load(msg);
      else if (msg.type === 'speak') await speak(msg);
    } catch (err) {
      post({ id: msg.id, type: 'error', message: String((err && err.message) || err) });
    }
  });
};
