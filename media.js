// Scene Reader — recording, audio files and simple mixing (plain script, loaded before app.js).
// Everything happens on this device. Recordings are stored in this browser (IndexedDB) and only
// leave the device when YOU export or share a file.
'use strict';

const MEDIA = { mic: null, rec: null, tap: null, recCtxDest: null };

// Microphone with phone "call" processing switched off — cleaner, more natural voiceover
async function getMic() {
  if (MEDIA.mic && MEDIA.mic.getAudioTracks().some((t) => t.readyState === 'live')) return MEDIA.mic;
  MEDIA.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  return MEDIA.mic;
}
function releaseMic() { if (MEDIA.mic) { MEDIA.mic.getTracks().forEach((t) => t.stop()); MEDIA.mic = null; } }

function recMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

// Record the mic. With { withAi: true } the AI reader's voice is recorded into the same take
// (it is played inside the app, so it's captured cleanly — wear headphones so the mic doesn't hear it twice).
async function startRecording({ withAi = false } = {}) {
  const mic = await getMic();
  const ctx = audioCtx();
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createMediaStreamSource(mic);
  src.connect(dest);
  if (withAi) MEDIA.tap = dest; // kPlay() also sends AI audio here while recording
  const rec = new MediaRecorder(dest.stream, recMime() ? { mimeType: recMime(), audioBitsPerSecond: 128000 } : {});
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const t0 = performance.now();
  const done = new Promise((res) => { rec.onstop = () => res(new Blob(parts, { type: rec.mimeType || 'audio/webm' })); });
  rec.start(250);
  MEDIA.rec = {
    rec, t0,
    elapsed: () => (performance.now() - t0) / 1000,
    stop: async () => { if (rec.state !== 'inactive') rec.stop(); const blob = await done; src.disconnect(); MEDIA.tap = null; MEDIA.rec = null; return { blob, dur: (performance.now() - t0) / 1000 }; },
  };
  return MEDIA.rec;
}

async function decodeBlob(blob) { return audioCtx().decodeAudioData(await blob.arrayBuffer()); }
const pcmToBuffer = (pcm, rate) => { const b = audioCtx().createBuffer(1, pcm.length, rate); b.copyToChannel(pcm, 0); return b; };

// Mix clips onto one timeline, offline (faster than real time). items: [{ buffer, at (s), gain }]
async function mixDown(items, { sampleRate = 44100, tail = 0.3, channels = 1 } = {}) {
  const end = Math.max(0.1, ...items.map((i) => i.at + (i.dur ?? i.buffer.duration))) + tail;
  const oc = new OfflineAudioContext(channels, Math.ceil(end * sampleRate), sampleRate);
  for (const it of items) {
    const s = oc.createBufferSource(); s.buffer = it.buffer;
    const g = oc.createGain(); g.gain.value = it.gain ?? 1;
    s.connect(g).connect(oc.destination); s.start(it.at);
    if (it.dur !== undefined && it.dur < it.buffer.duration) { // trim, with a short fade-out
      const fade = Math.min(0.8, it.dur / 3);
      g.gain.setValueAtTime(it.gain ?? 1, it.at + it.dur - fade); g.gain.linearRampToValueAtTime(0, it.at + it.dur); s.stop(it.at + it.dur);
    }
  }
  return oc.startRendering();
}

// 16-bit PCM WAV — opens anywhere (casting sites, editors, email)
function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

// Make the loudest point -1 dB (so quiet takes aren't too quiet)
function normalize(buffer, peakDb = -1) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  if (!peak) return buffer;
  const g = Math.pow(10, peakDb / 20) / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return buffer;
}

// Waveform drawing for a take
function drawWave(canvas, buffer, color = '#f4b740') {
  const ctx = canvas.getContext('2d'), w = canvas.width = canvas.clientWidth * devicePixelRatio, h = canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = color;
  const d = buffer.getChannelData(0), step = Math.max(1, Math.floor(d.length / w));
  for (let x = 0; x < w; x++) {
    let max = 0; const s = x * step;
    for (let i = 0; i < step; i += 4) max = Math.max(max, Math.abs(d[s + i] || 0));
    const y = Math.max(1, max * h * 0.95);
    ctx.fillRect(x, (h - y) / 2, 1, y);
  }
}

// Play a buffer; returns { stop, done }
function playBuffer(buffer, { gain = 1, at = 0, offset = 0 } = {}) {
  const ctx = audioCtx();
  const s = ctx.createBufferSource(); s.buffer = buffer;
  const g = ctx.createGain(); g.gain.value = gain;
  s.connect(g).connect(ctx.destination);
  const done = new Promise((r) => (s.onended = r));
  s.start(ctx.currentTime + at, offset);
  return { stop: () => { try { s.stop(); } catch {} }, done, src: s };
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
// Share sheet on phones (Nearby Share, Messages, email…); download elsewhere
async function shareOrDownload(blob, name, title) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
const fileSafe = (t) => (t || 'untitled').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'untitled';
const blobToB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
const b64ToBlob = (b64, type) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

// Video + your voice → one video file (plays through in real time; laptop recommended)
async function exportVideo(videoBlob, voiceBuffer, { bedGain = 0.4, voiceAt = 0, onProgress } = {}) {
  const v = document.createElement('video');
  v.src = URL.createObjectURL(videoBlob); v.playsInline = true; v.muted = false;
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('Can’t read this video')); });
  const ctx = audioCtx();
  const dest = ctx.createMediaStreamDestination();
  const vs = ctx.createMediaElementSource(v); const vg = ctx.createGain(); vg.gain.value = bedGain; vs.connect(vg).connect(dest);
  const stream = new MediaStream([...v.captureStream().getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6e6 } : {});
  const parts = []; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  await v.play();
  const vb = ctx.createBufferSource(); vb.buffer = voiceBuffer; vb.connect(dest); vb.start(ctx.currentTime + voiceAt);
  const total = Math.max(v.duration, voiceAt + voiceBuffer.duration);
  await new Promise((r) => {
    const tick = () => { onProgress && onProgress(Math.min(1, v.currentTime / total)); if (v.ended || v.currentTime >= total) return r(); requestAnimationFrame(tick); };
    tick();
  });
  rec.stop(); await done;
  vs.disconnect(); URL.revokeObjectURL(v.src);
  const mime = rec.mimeType || 'video/webm';
  return { blob: new Blob(parts, { type: mime }), ext: /mp4/.test(mime) ? 'mp4' : 'webm' };
}
