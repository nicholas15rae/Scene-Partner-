// Scene Reader — Piper voice engine (runs in the background ON THIS DEVICE).
// Each voice MODEL is downloaded once from the official rhasspy/piper-voices repo on Hugging Face
// (or comes from a voice file you imported) and is cached in this browser.
// Your script text is turned into speech right here and never sent anywhere.
import * as ortNs from './vendor/piper/ort.webgpu.min.mjs';
import { createPiperPhonemize } from './vendor/piper/piper_phonemize.mjs';

const ort = ortNs.default && ortNs.default.InferenceSession ? ortNs.default : ortNs;
const base = new URL('./', import.meta.url).href;
ort.env.wasm.wasmPaths = base + 'vendor/kokoro/';            // shared with Kokoro (identical files)
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
ort.env.logLevel = 'error';

const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const CACHE = 'piper-voices';
const sessions = new Map(); // voice id -> { session, config }   (kept: the last 2 voices used)
let chain = Promise.resolve();
const post = (m, t) => self.postMessage(m, t || []);

async function getFile(url, onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'This voice isn’t available' : 'Download failed (' + res.status + ')');
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const parts = []; let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    onProgress && onProgress(loaded, total);
  }
  const buf = new Uint8Array(loaded); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  if (cache) try { await cache.put(url, new Response(buf)); } catch {}
  return buf;
}

async function load({ id, voice }) {
  if (sessions.has(voice.id)) { post({ id, type: 'loaded', voice: voice.id }); return; }
  let model, config;
  if (voice.model && voice.config) { model = new Uint8Array(voice.model); config = JSON.parse(new TextDecoder().decode(voice.config)); } // imported voice
  else {
    const url = HF + voice.path + '.onnx';
    config = JSON.parse(new TextDecoder().decode(await getFile(url + '.json')));
    model = await getFile(url, (loaded, total) => post({ type: 'progress', voice: voice.id, loaded, total }));
  }
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  sessions.set(voice.id, { session, config });
  while (sessions.size > 2) { const k = sessions.keys().next().value; try { await sessions.get(k).session.release(); } catch {} sessions.delete(k); }
  post({ id, type: 'loaded', voice: voice.id, rate: config.audio.sample_rate, speakers: config.num_speakers || 1 });
}

// The phonemizer's program and 18 MB language data are fetched and compiled ONCE, then reused for every line.
let phonAssets = null;
function phonemizerAssets() {
  if (!phonAssets) phonAssets = Promise.all([
    fetch(base + 'vendor/piper/piper_phonemize.wasm').then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)),
    fetch(base + 'vendor/piper/piper_phonemize.data').then((r) => r.arrayBuffer()),
  ]).catch((e) => { phonAssets = null; throw e; });
  return phonAssets;
}

// text → phoneme ids (espeak-ng, the same phonemizer Piper voices were trained with)
function phonemize(text, lang) {
  return new Promise(async (resolve, reject) => {
    let got = false;
    try {
      const [wasmModule, data] = await phonemizerAssets();
      const mod = await createPiperPhonemize({
        print: (out) => { if (got) return; try { got = true; resolve(JSON.parse(out).phoneme_ids); } catch (e) { reject(e); } },
        printErr: () => {},
        instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmModule, imports).then((inst) => ok(inst, wasmModule)); return {}; },
        getPreloadedPackage: () => data,
        locateFile: (u) => base + 'vendor/piper/' + (u.endsWith('.wasm') ? 'piper_phonemize.wasm' : u.endsWith('.data') ? 'piper_phonemize.data' : u),
      });
      mod.callMain(['-l', lang, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
      setTimeout(() => { if (!got) reject(new Error('Phonemizer gave no output')); }, 8000);
    } catch (e) { reject(e); }
  });
}

async function speak({ id, voiceId, text, speed, speaker }) {
  const v = sessions.get(voiceId);
  if (!v) throw new Error('Voice not loaded');
  const { session, config } = v;
  const ids = await phonemize(text, (config.espeak && config.espeak.voice) || 'en-us');
  const inf = config.inference || {};
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / (speed || 1), inf.noise_w ?? 0.8]), [3]),
  };
  if ((config.num_speakers || 1) > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(Math.max(0, Math.min(config.num_speakers - 1, speaker || 0)))]), [1]);
  const out = await session.run(feeds);
  const pcm = new Float32Array(out.output.data);
  post({ id, type: 'audio', pcm, rate: config.audio.sample_rate }, [pcm.buffer]);
}

self.onmessage = (e) => {
  const m = e.data || {};
  chain = chain.then(async () => {
    try {
      if (m.type === 'load') await load(m);
      else if (m.type === 'speak') await speak(m);
    } catch (err) { post({ id: m.id, type: 'error', message: String((err && err.message) || err) }); }
  });
};
