(function () {
'use strict';
// Scene Reader — PDF text extraction, done entirely on this device with pdf.js.
// The PDF is read from memory; it is never uploaded anywhere.

let pdfjs = null;

const addScript = (src) => new Promise((resolve, reject) => {
  const el = document.createElement('script');
  el.src = src;
  el.onload = () => resolve(); el.onerror = () => reject(new Error('Could not load ' + src));
  document.head.appendChild(el);
});

async function lib() {
  if (!pdfjs) {
    // Opened by double-clicking (file://): browsers block background workers there,
    // so load pdf.js's worker code on the page itself. Slightly slower, still 100% on-device.
    if (location.protocol === 'file:') await addScript('vendor/pdf.worker.min.js');
    await addScript('vendor/pdf.min.js');
    pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', location.href).href;
  }
  return pdfjs;
}

const quantile = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * q)];
};
const median = (arr) => quantile(arr, 0.5);
// "LAST CALL - Ep 104 - Blue Rev. 3." and "... 4." count as the same header
const sig = (line) => line.toLowerCase().replace(/[\d\s.:()/-]+/g, ' ').trim();

// Returns { text, pages, scanned }
async function pdfToText(file) {
  const { getDocument } = await lib();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;

  const pagesLines = [];
  let chars = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Keep upright text only. Watermarks are usually rotated or huge.
    const items = content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => {
        const [a, b, c, d, x, y] = it.transform;
        return { str: it.str, x, y, w: it.width, size: Math.hypot(a, b), rotated: Math.abs(b) > 0.01 || Math.abs(c) > 0.01 };
      })
      .filter((it) => !it.rotated);

    const typical = median(items.map((i) => i.size)) || 12;
    const kept = items.filter((i) => i.size <= typical * 1.8);

    // Group into lines by vertical position
    kept.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of kept) {
      const row = rows.find((r) => Math.abs(r.y - it.y) < typical * 0.45);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);

    // Normal single line spacing (the small gaps), so bigger gaps become blank lines
    const gaps = [];
    for (let i = 1; i < rows.length; i++) gaps.push(rows[i - 1].y - rows[i].y);
    const step = quantile(gaps.filter((g) => g > typical * 0.5), 0.2) || typical * 1.2;
    const out = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i > 0 && rows[i - 1].y - r.y > step * 1.5) out.push('');
      r.items.sort((a, b) => a.x - b.x);
      let line = '';
      let end = null;
      for (const it of r.items) {
        if (end !== null && it.x - end > typical * 0.2 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
        line += it.str;
        end = it.x + it.w;
      }
      line = line.replace(/\s+/g, ' ').trim();
      chars += line.length;
      out.push(line);
    }
    pagesLines.push(out);
  }

  // Drop running headers/footers: text at the top or bottom of the page that repeats on other pages
  const edgeCount = new Map();
  const edges = (lines) => {
    const real = lines.filter(Boolean);
    // Headers almost always carry a page number or date; this keeps repeated character names safe.
    const edge = [...real.slice(0, 2), ...real.slice(-2)].filter((l) => /\d/.test(l) || sig(l).length >= 16);
    return [...new Set(edge.map(sig).filter((x) => x.length > 3))];
  };
  pagesLines.forEach((lines) => edges(lines).forEach((k) => edgeCount.set(k, (edgeCount.get(k) || 0) + 1)));
  const out = [];
  pagesLines.forEach((lines) => {
    const drop = new Set(edges(lines).filter((k) => edgeCount.get(k) > 1));
    const real = lines.filter(Boolean);
    const edgeLines = new Set([...real.slice(0, 2), ...real.slice(-2)]);
    for (const l of lines) if (!(edgeLines.has(l) && drop.has(sig(l)))) out.push(l);
    out.push(''); // page break
  });

  const pages = doc.numPages;
  await doc.destroy();
  return { text: out.join('\n'), pages, scanned: chars < 20 * Math.max(1, pages) };
}

window.ScenePdf = { pdfToText };
})();
