// Scene Reader parser — loaded as a plain script; exposes window.SceneParser.
(function () {
'use strict';
// Scene Reader — script parser
// Turns pasted text (or text pulled out of a PDF) into a list of blocks:
//   { id, type: 'heading' | 'action' | 'line', who?, text }
// Everything runs on the device. Nothing is sent anywhere.

const HEADING = /^(\d+[A-Z]?\.?\s+)?(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|INT|EXT|I\/E|E\/I|EST)[.\s]/;
const TRANSITION = /^(FADE (IN|OUT|TO)|CUT TO|SMASH CUT|MATCH CUT|JUMP CUT|DISSOLVE( TO)?|BACK TO|INTERCUT|THE END|END OF|FLASHBACK|END FLASHBACK|TITLE|SUPER|BLACK|OMITTED|MONTAGE|END MONTAGE|SERIES OF SHOTS|MOMENTS LATER|LATER|CONTINUOUS|SIDES|SCENE)\b/;
const NOISE = [
  /^\(?MORE\)?$/i,
  /^\(?CONTINUED\)?:?\s*(\(\d+\))?$/i,
  /^CONT(INUED|['’]D)\.?:?$/i,
  /^\d{1,3}[A-Z]?\.?$/,               // lone page / scene numbers
  /^page\s+\d+(\s+of\s+\d+)?\.?$/i,
  /^\d+\s*(\/|of)\s*\d+$/i,
];
const NOT_NAMES = new Set(['NOTE', 'NOTES', 'SCENE', 'PAGE', 'TIME', 'LOCATION', 'SETTING', 'SUPER', 'TITLE', 'INT', 'EXT', 'CAST', 'CHARACTERS', 'WATERMARK', 'DATE', 'DRAFT', 'REVISED', 'SIDES']);

let _id = 0;
const newId = () => 'b' + Date.now().toString(36) + (++_id).toString(36);

const isNoise = (t) => NOISE.some((r) => r.test(t));

function cleanHeading(t) {
  return t.replace(/^\d+[A-Z]?\.?\s+/, '').replace(/\s+\d+[A-Z]?\.?$/, '').trim();
}

// Normalise a character name: drop (V.O.), (CONT'D), etc.
function normName(raw) {
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(CONT['’]?D|CONTINUED)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// Is this line a screenplay-style character cue (ALL CAPS name on its own line)?
function cue(line) {
  const t = line.trim();
  if (t.length < 2 || t.length > 45) return null;
  const outsideParens = t.replace(/\([^)]*\)/g, '');
  if (/[a-z]/.test(outsideParens) || !/[A-Z]/.test(outsideParens)) return null;
  if (/[!?:,;"]$/.test(t)) return null;
  if (HEADING.test(t) || TRANSITION.test(t)) return null;
  const name = normName(t);
  if (!name || name.split(' ').length > 4) return null;
  if (!/^[A-Z0-9][A-Z0-9 .'’\-&#/]*$/.test(name)) return null;
  if (NOT_NAMES.has(name)) return null;
  return { name, contd: /CONT['’]?D|CONTINUED/i.test(t) };
}

// "SARAH: Hello" or "Sarah (quietly): Hello"
const INLINE = /^([A-Za-z][A-Za-z0-9 .'’\-]{0,30}?)\s*(\([^)]*\))?\s*:\s+(.+)$/;
function inlineCue(line) {
  const m = line.trim().match(INLINE);
  if (!m) return null;
  const name = normName(m[1]);
  if (!/^[A-Z]/.test(m[1]) || name.split(' ').length > 3 || NOT_NAMES.has(name)) return null;
  if (HEADING.test(line.trim())) return null;
  const text = (m[2] ? m[2] + ' ' : '') + m[3];
  return { name, text };
}

/* ---------------------------------------------------------------- format auto-detection
   Pasted scripts come in many shapes. Besides screenplay style (NAME on its own line) and
   chat style (Name: line), this finds:
     MAYA. Where were you?        (stage-play style)
     MAYA - Where were you?       (dash / en dash / em dash)
     MAYA      Where were you?    (name, then a tab or a wide gap)
     **MAYA:** Where were you?    (markdown, e.g. copied from a chat app)
     maya: where were you?        (lower-case chat)
     Maya                         (Title-case name on its own line)
     Where were you?
   A name only counts when it shows up more than once (or alongside other confirmed names),
   so one-off capitalised words in stage directions aren't mistaken for characters. */

const MAX_NAME = 32;
// ALL-CAPS name + separator + text. Lazy and greedy versions catch "DR. LEE. Hello" both ways.
const SAME_LINE = [
  /^([A-Z][A-Z0-9 .'’\-&]{0,31}?)\s*(\([^)]*\))?\s*(?:\.|:|\s[-–—]|[-–—]\s|\t|\s{2,})\s*(\S.*)$/,
  /^([A-Z][A-Z0-9 .'’\-&]{0,31})\s*(\([^)]*\))?\s*(?:\.|:|\s[-–—]|[-–—]\s|\t|\s{2,})\s*(\S.*)$/,
];
// Any-case "name: text"
const LOOSE_COLON = /^([A-Za-z][A-Za-z0-9 .'’\-]{0,31}?)\s*(\([^)]*\))?\s*:\s+(\S.*)$/;

function nameOk(raw) {
  const name = normName(raw).replace(/\.$/, '');
  if (!name || name.length < 2 || name.length > MAX_NAME) return null;
  if (name.split(' ').length > 3 || NOT_NAMES.has(name)) return null;
  if (HEADING.test(name + ' ') || TRANSITION.test(name)) return null;
  if (!/^[A-Z][A-Z0-9 .'’\-&]*$/.test(name)) return null;
  return name;
}

// Tidy things that hide a name: markdown bold/italics, bullets, leading ">" quotes.
function tidy(line) {
  return line
    .replace(/^\s*(?:[-*•>]\s+)/, '')
    .replace(/^\s*(\*\*|__|\*|_)([^*_]{1,40}?)\1(\s*:?)/, '$2$3')
    .replace(/^\s*(\*\*|__)([^*_]{1,40}?:)\1/, '$2');
}

function detectFormats(lines) {
  const cands = new Map(); // line index -> [{ name, text, style }]
  const own = new Map();   // line index -> name (Title-case names on their own line)
  let content = 0;
  const add = (i, name, text, style) => {
    const list = cands.get(i) || [];
    if (!list.some((c) => c.name === name && c.style === style)) list.push({ name, text, style });
    cands.set(i, list);
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || HEADING.test(t) || isNoise(t)) continue;
    content++;

    // ALL-CAPS name, then separator, then text
    for (const re of SAME_LINE) {
      const m = lines[i].replace(/^\s+/, '').match(re);
      if (!m || /[a-z]/.test(m[1])) continue;
      const name = nameOk(m[1]);
      if (!name) continue;
      const text = (m[2] ? m[2] + ' ' : '') + m[3];
      if (!/[a-z]/i.test(text)) continue;
      const after = lines[i].replace(/^\s+/, '').slice(m[1].length).replace(/^\s*\([^)]*\)/, '');
      const sep = after.trimStart()[0];
      const style = after.startsWith('\t') || /^\s{2,}/.test(after) && !/[.:\-–—]/.test(sep) ? 'gap'
        : sep === '.' ? 'period' : sep === ':' ? 'colon' : /[-–—]/.test(sep) ? 'dash' : 'gap';
      add(i, name, text, style);
    }
    // any-case "name: text"
    const lc = t.match(LOOSE_COLON);
    if (lc && /[a-z]/.test(lc[1])) {
      const name = nameOk(lc[1]);
      if (name) add(i, name, (lc[2] ? lc[2] + ' ' : '') + lc[3], 'lcolon');
    }
    // Title-case name alone on a line, with dialogue right under it, after a blank line
    const next = (lines[i + 1] || '').trim();
    const prev = (lines[i - 1] || '').trim();
    const bare = t.replace(/\s*\([^)]*\)$/, '');
    if (next && !prev && t.length <= 30 && /[a-z]/.test(bare) && /^[A-Z][a-zA-Z.'’\-]*( [A-Z][a-zA-Z.'’\-]*){0,2}$/.test(bare) && !/[!?:,;.]$/.test(bare)) {
      const name = nameOk(t);
      if (name) own.set(i, name);
    }
  }

  // A style counts as "how this script marks speakers" when it is used on 2+ lines by
  // 2+ different names (or one name repeats), and makes up a fair share of the text.
  const styleOk = (entries) => {
    const names = entries.map((e) => e.name);
    const distinct = new Set(names).size;
    return entries.length >= 2 && (distinct >= 2 || names.length > distinct) && entries.length >= content * 0.2;
  };
  const byStyle = new Map();
  for (const list of cands.values()) for (const c of list) (byStyle.get(c.style) || byStyle.set(c.style, []).get(c.style)).push(c);
  const okStyles = new Set([...byStyle].filter(([, e]) => styleOk(e)).map(([k]) => k));
  const counts = new Map();
  for (const [, e] of byStyle) for (const c of e) counts.set(c.name, (counts.get(c.name) || 0) + 1);

  const sameLine = new Map();
  for (const [i, list] of cands) {
    const best = list.filter((c) => okStyles.has(c.style)).sort((a, b) => counts.get(b.name) - counts.get(a.name) || a.name.length - b.name.length)[0];
    if (best) sameLine.set(i, best);
  }
  const ownLine = styleOk([...own.values()].map((name) => ({ name }))) ? own : new Map();
  return { sameLine, ownLine };
}

function parseLines(raw) {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => tidy(l).replace(/\s+$/, ''));
  const fmt = detectFormats(lines);
  for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/\t/g, '    ');

  const blocks = [];
  let cur = null; // block being built

  const close = () => {
    if (cur && cur.text.trim()) {
      cur.text = cur.text.replace(/\s+/g, ' ').trim();
      // Dialogue that runs over a page break: "SARAH (CONT'D)" right after Sarah's own line
      const prev = blocks[blocks.length - 1];
      if (cur.contd && prev && prev.type === 'line' && prev.who === cur.who) {
        prev.text += ' ' + cur.text;
      } else {
        delete cur.contd;
        delete cur.inline;
        blocks.push(cur);
      }
    }
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { close(); continue; }
    if (isNoise(t)) continue;

    if (HEADING.test(t)) {
      close();
      blocks.push({ id: newId(), type: 'heading', text: cleanHeading(t) });
      continue;
    }

    const next = (lines[i + 1] || '').trim();
    const c = cue(t);
    if (c && next && !isNoise(next) && !HEADING.test(next)) {
      close();
      cur = { id: newId(), type: 'line', who: c.name, text: '', contd: c.contd };
      continue;
    }

    // Auto-detected formats (see detectFormats above)
    const sl = fmt.sameLine.get(i);
    if (sl) {
      close();
      cur = { id: newId(), type: 'line', who: sl.name, text: sl.text, inline: true };
      continue;
    }
    const ol = fmt.ownLine.get(i);
    if (ol && next) {
      close();
      cur = { id: newId(), type: 'line', who: ol, text: '' };
      continue;
    }

    const ic = inlineCue(t);
    if (ic) {
      close();
      cur = { id: newId(), type: 'line', who: ic.name, text: ic.text, inline: true };
      continue;
    }

    // "Note: ..." style lines in a NAME: script are directions, not more dialogue
    if (cur && cur.inline && INLINE.test(t)) {
      close();
      cur = { id: newId(), type: 'action', text: t };
      continue;
    }

    if (cur) {
      // re-join words split across lines: "nine-" + "thirty"
      cur.text = /[a-z]-$/i.test(cur.text) && /^[a-z]/.test(t) ? cur.text + t : cur.text + ' ' + t;
    } else {
      close();
      if (TRANSITION.test(t) && t === t.toUpperCase()) {
        blocks.push({ id: newId(), type: 'action', text: t });
      } else {
        cur = { id: newId(), type: 'action', text: t };
      }
    }
  }
  close();
  return blocks;
}

function characters(blocks) {
  const counts = new Map();
  for (const b of blocks) if (b.type === 'line') counts.set(b.who, (counts.get(b.who) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function guessTitle(blocks, fallback = 'Untitled scene') {
  const h = blocks.find((b) => b.type === 'heading');
  return h ? h.text : fallback;
}

// What the reader voice actually says: no (parentheticals), no markup.
function speakable(text) {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*_]/g, '')
    .replace(/\s*--+\s*/g, ', ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim();
}

/* ==================================================================== v1.2.0
   1) CLEANUP — strip watermarks, repeating page headers/footers, page furniture,
      the actor's own name, and anything the user marked "Ignore this text".
   2) BLOB SPLITTER — when a PDF copy-paste arrives as one long run of text (no line
      breaks), split it by context: ALL-CAPS names, NAME:, name + (direction), sentence
      endings followed by a name. Every split gets a confidence score; unsure ones are
      flagged for a quick Yes / No / Change name review.                                */

const CONF_OK = 0.75;   // at or above: applied silently
const CONF_ASK = 0.5;   // between ASK and OK: applied, but flagged for review
const BRK = ' \u2029 ';        // marks where page furniture was removed (a hard boundary)
const BRK_MORE = ' \u2029\u2028 '; // same, after "(MORE)": the speech continues after the page break

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Key used to remember a piece of junk regardless of page numbers / spacing / case
const junkKey = (t) => t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
// Case-insensitive, spacing-tolerant regex for a phrase (used for "Ignore this text")
function phraseRegex(phrase) {
  const words = phrase.trim().split(/\s+/).map(esc);
  const pre = /^\w/.test(phrase.trim()) ? '(?<![\\w’\'])' : '';
  const post = /\w$/.test(phrase.trim()) ? '(?![\\w’\'])' : '';
  return new RegExp(pre + words.join('\\s+') + post, 'gi');
}

const W = String.raw`[A-Z][A-Z.'’]+`; // a capitalised word in a stamp, e.g. YOUR, NAME, O'NEIL
const STAMP_PRE = String.raw`(?:\b${W}(?:\s+${W}){0,3}\s*[-–—|•]\s*)?`;
const STAMP_POST = String.raw`(?:\s*[-–—|•]\s*${W}(?:\s+${W}){0,3}\b)?`;
const WATERMARKS = [
  // "YOUR NAME - CONFIDENTIAL", "CONFIDENTIAL", or one cut off at the end: "CONFIDENT"
  new RegExp(STAMP_PRE + String.raw`\bCONFIDENT[A-Z]*\b` + STAMP_POST, 'g'),
  new RegExp(STAMP_PRE + String.raw`\b(?:DO\s+NOT|Do\s+Not)\s+(?:COPY|DISTRIBUTE|DUPLICATE|SHARE|FORWARD|REPRODUCE|POST|Copy|Distribute|Duplicate|Share|Forward|Reproduce|Post)\b(?:\s+(?:OR|or|Or)\s+\w+)?` + STAMP_POST, 'g'),
  new RegExp(STAMP_PRE + String.raw`\b(?:NOT\s+FOR\s+(?:DISTRIBUTION|REPRODUCTION|RELEASE)|Not\s+for\s+(?:Distribution|Reproduction|Release)|FOR\s+AUDITION\s+(?:PURPOSES\s+|USE\s+)?ONLY|For\s+Audition\s+(?:Purposes\s+|Use\s+)?Only|AUDITION\s+(?:SIDES|MATERIALS?)\s+ONLY|WATERMARK(?:ED)?|PROPERTY\s+OF(?:\s+${W}){1,4})\b` + STAMP_POST, 'g'),
  // Casting platforms that stamp sides
  /\b(?:Breakdown\s+Services|Actors\s+Access|Casting\s+Networks|Casting\s+Frontier|Casting\s+Workbook|Eco\s*Cast|Sides\s*Express|Showfax|WeAudition|Cast\s*It\s+Talent|Backstage\.com)\b(?:\s*(?:Ltd|Inc|LLC)\.?)?\s*[©®™]?/gi,
  /(?:©|\bCopyright\s*©?)\s*\d{4}[^.\n\u2029]{0,60}?(?:All\s+rights\s+reserved\.?|(?=\s[A-Z]{2,}\s)|$)/gi,
  /\bAll\s+rights\s+reserved\.?/gi,
  // Revision header: "LAST CALL" - Ep. 104 - Blue Rev. 10/30/26 1.
  /["“][^"”\n]{1,60}["”]\s*[-–—]\s*(?:Ep(?:isode|\.)?\s*#?\d+\w*\s*[-–—]\s*)?(?:(?:White|Blue|Pink|Yellow|Green|Goldenrod|Buff|Salmon|Cherry|Tan|Gr[ae]y|Ivory)\s+)?(?:Rev(?:ision|\.)?|Draft)\s*[\d/.\-]+(?:\s+\d{1,3}\.?(?![\w/]))?/gi,
];
const FURNITURE = [
  [/\(\s*MORE\s*\)/g, BRK_MORE],
  [/\(\s*CONTINUED\s*\)|\bCONTINUED\s*:|\bCONTINUED\b(?=\s*$)|\(CONT(?:['’]D|INUED)\)\s*$/gm, BRK],
  [/\b(?:Page|PAGE|Pg\.?)\s+\d+(?:\s+of\s+\d+)?\b\.?/g, BRK],
];

// Text that repeats far apart and looks like page furniture (has a digit, quote or header word)
function repeatedChunks(text) {
  const toks = [...text.matchAll(/\S+/g)].map((m) => ({ s: m.index, e: m.index + m[0].length, k: m[0].replace(/\d+/g, '#').toLowerCase() }));
  const N = 4, pos = new Map();
  for (let i = 0; i + N <= toks.length; i++) {
    const key = toks.slice(i, i + N).map((t) => t.k).join(' ');
    (pos.get(key) || pos.set(key, []).get(key)).push(i);
  }
  const mark = new Array(toks.length).fill(false);
  for (const list of pos.values()) {
    if (list.length < 2) continue;
    for (let j = 0; j < list.length; j++) {
      const far = list.some((o) => Math.abs(o - list[j]) >= 25);
      if (far) for (let k = 0; k < N; k++) mark[list[j] + k] = true;
    }
  }
  const spans = [];
  for (let i = 0; i < toks.length; i++) {
    if (!mark[i]) continue;
    let j = i;
    while (j + 1 < toks.length && mark[j + 1]) j++;
    const t = text.slice(toks[i].s, toks[j].e);
    if (j - i + 1 >= N && /\d|["“”]|\b(?:rev|ep|draft|page|pg|sides|scene)\b\.?/i.test(t)) spans.push([toks[i].s, toks[j].e]);
    i = j;
  }
  return spans;
}

// Remove junk. mode 'blob' leaves a boundary marker; mode 'lines' removes cleanly.
function cleanText(raw, opts = {}, mode = 'lines') {
  const keep = new Set((opts.keep || []).map(junkKey));
  const removed = new Map();
  const note = (t, kind) => {
    const k = junkKey(t);
    if (!k || keep.has(k)) return false;
    const r = removed.get(k) || { text: t.replace(/\s+/g, ' ').trim(), key: k, kind, count: 0 };
    r.count++; removed.set(k, r);
    return true;
  };
  const gap = mode === 'blob' ? BRK : ' ';
  let t = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ');

  for (const phrase of opts.ignore || []) if (phrase.trim()) t = t.replace(phraseRegex(phrase), (m) => (note(m, 'ignored') ? gap : m));
  if (opts.myName && opts.myName.trim().length >= 3) t = t.replace(phraseRegex(opts.myName), (m) => (note(m, 'your name') ? gap : m));
  for (const re of WATERMARKS) t = t.replace(re, (m) => (note(m, 'watermark') ? gap : m));
  // Repeating headers/footers (work from the end so offsets stay valid)
  for (const [a, b] of repeatedChunks(t).reverse()) if (note(t.slice(a, b), 'header')) t = t.slice(0, a) + gap + t.slice(b);
  if (mode === 'blob') for (const [re, rep] of FURNITURE) t = t.replace(re, rep);
  // Lines that are now empty (were only junk) disappear instead of becoming blank lines
  if (mode === 'lines') t = t.split('\n').filter((l, i, all) => l.trim() || !all[i].length || !/\S/.test(raw.split('\n')[i] || '') ).map((l) => l.replace(/[ \t]{2,}(?=\S)/g, (g) => (g.length > 3 ? g : ' '))).join('\n');
  return { text: t, removed: [...removed.values()] };
}

/* ---------------------------------------------------------------- blob splitter */

const TIMES = String.raw`NIGHT|DAY|MORNING|EVENING|AFTERNOON|DUSK|DAWN|LATER|CONTINUOUS|SAME(?:\s+TIME)?|MOMENTS\s+LATER|SUNSET|SUNRISE|NOON|MIDNIGHT|PRESENT|FLASHBACK`;
const HEAD_BLOB = new RegExp(String.raw`(?:\b\d{1,4}[A-Z]?\s+)?\b((?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|EST)\.\s*[A-Z0-9][^a-z\u2029]*?(?:\s[-–—]\s*|\s)(?:${TIMES}))\b\.?(?:\s+\d{1,4}[A-Z]?(?![\w'’]))?`, 'g');
const HEAD_LOOSE = /(?:\b\d{1,4}[A-Z]?\s+)?\b((?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT)\.\s*(?:[A-Z0-9'’&\/\-–—.,#]+\s+)*?[A-Z0-9'’&\/\-–—.,#]{2,})(?=\s+(?:A|An|The|[A-Z][a-z]))/g;
const TRANS_BLOB = /(?<![\w'’])((?:FADE\s+(?:IN|OUT|TO(?:\s+BLACK)?)|(?:SMASH\s+|MATCH\s+|JUMP\s+|HARD\s+|QUICK\s+)?CUT\s+TO|DISSOLVE\s+TO|BACK\s+TO\s+SCENE|INTERCUT(?:\s+WITH)?|END\s+OF\s+(?:SCENE|EPISODE)|THE\s+END)\s*[:.])/g;

const TITLES = 'MR|MRS|MS|DR|SGT|DET|LT|CPT|CAPT|OFC|ST|JR|SR|PROF|GEN|COL|MAJ|AGT|SGT';
const NAME_TOK = String.raw`(?:(?:${TITLES})\.|[A-Z][A-Z0-9'’\-&]*[A-Z0-9])`;
const NAME_RUN = new RegExp(String.raw`(?<![\w'’.])(${NAME_TOK}(?:\s+(?:${NAME_TOK}|#?\d{1,2})){0,2})(?![\w'’])`, 'g');
const EXT_ONE = String.raw`\(\s*(?:V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?|CONT['’]?D\.?|CONT\.|CONTINUING|ON\s+(?:THE\s+)?(?:PHONE|SCREEN|TV|RADIO|COMMS)|INTO\s+PHONE|FILTERED|PRE-?LAP|SUBTITLED?|IN\s+[A-Z]+|OVER\s+[A-Z]+|SINGING|WHISPER(?:S|ING)?)\s*\)`;
const EXT_RUN = new RegExp(String.raw`^(?:\s*${EXT_ONE})+`);
const AGE = /^\(\s*(?:early\s+|mid[-\s]?|late\s+)?\d{1,2}s?(?:\s*[-–]\s*\d{1,2}s?)?\s*\)/i;
const TITLE_CUE = /(?<![\w'’])([A-Z][a-z'’\-]+(?:\s+[A-Z][a-z'’\-]+)?)\s*(?:(\((?!\s*\d)[^)]{1,40}\))\s*(?=[A-Z"“(])|(:)\s+)/g;

const BOUNDARY = /(?:^|[.?!…"”’)\]:\u2029\u2028]|--)\s*$/;

// Every place in a piece of text that could be a "who is speaking" cue, with a score
function findCues(text) {
  const out = [];
  NAME_RUN.lastIndex = 0;
  let m;
  while ((m = NAME_RUN.exec(text))) {
    let raw = m[1];
    const start = m.index;
    let end = start + raw.length;
    // part of a longer ALL-CAPS run (shouting, a title)? then it's not a name
    const before = text.slice(0, start);
    const prevWord = (before.match(/(\S+)\s*$/) || [])[1] || '';
    if (/^[A-Z][A-Z'’\-]+$/.test(prevWord) && !/[.?!:)]$/.test(prevWord)) continue;
    let rest = text.slice(end);
    const ext = rest.match(EXT_RUN);
    if (ext) { rest = rest.slice(ext[0].length); end += ext[0].length; }
    const colon = /^\s*:/.test(rest);
    if (colon) { const c = rest.match(/^\s*:/)[0]; rest = rest.slice(c.length); end += c.length; }
    // play style "MAYA. Where…" or "MAYA - Where…"
    const sepM = !colon && !ext && rest.match(/^(?:\.\s+(?=["“(]?[A-Z])|\s+[-–—]\s+(?=["“(]?[A-Z]))/);
    if (sepM) { rest = rest.slice(sepM[0].length); end += sepM[0].length; }
    if (!ext && !colon && /^\s+[A-Z][A-Z'’\-]+(?![a-z])/.test(rest) && !/^\s+(?:A|I)\b/.test(rest)) continue; // longer run
    const name = normName(raw).replace(/\s+#?\d+$/, (d) => d);
    if (name.length < 2 || NOT_NAMES.has(name) || /^\d/.test(name) || TRANSITION.test(name) || /^(?:INT|EXT|EST|I\/E)\b/.test(name)) continue;
    const r = rest.replace(/^\s+/, '');
    if (!r || r.startsWith('\u2029')) continue;            // nothing after it to say
    if (AGE.test(r)) continue;                              // "OKAFOR (40s)" — introducing a character
    if (/^[,;'’]/.test(r)) continue;                        // "JULES BENNETT, who…"
    const paren = !ext && /^\(/.test(r);
    const after = paren ? r.replace(/^\([^)]*\)\s*/, '') : r;
    if (/^[a-z]/.test(after) && !ext) continue;             // "OKAFOR doesn't move" — action
    let score = 0.2;
    if (ext) score += 0.35;
    if (colon) score += 0.3;
    if (sepM) score += 0.15;
    if (paren) score += 0.25;
    const boundary = BOUNDARY.test(before) || !before.trim();
    if (boundary) score += 0.25; else if (!ext && !colon && !sepM) score -= 0.4; else if (sepM) score -= 0.3;
    if (/^[A-Z0-9"“(¿¡]/.test(after)) score += 0.15;
    out.push({ start, end, name, cue: text.slice(start, end).trim(), score, contd: !!ext && /CONT/i.test(ext[0]), boundary });
  }
  // "Maya: …" and "Maya (pacing) …" in normal case
  TITLE_CUE.lastIndex = 0;
  while ((m = TITLE_CUE.exec(text))) {
    const before = text.slice(0, m.index);
    if (!(BOUNDARY.test(before) || !before.trim())) continue;
    const name = normName(m[1]);
    if (NOT_NAMES.has(name) || out.some((c) => m.index >= c.start && m.index < c.end)) continue;
    const end = m.index + m[0].length - (m[2] ? 0 : 0);
    const cueEnd = m[3] ? end : m.index + m[1].length;
    out.push({ start: m.index, end: cueEnd, name, cue: text.slice(m.index, cueEnd).trim(), score: m[3] ? 0.75 : 0.7, contd: false, boundary: true, titleCase: true });
  }
  return out.sort((a, b) => a.start - b.start);
}

// Split into sentences, without breaking after "Mr." / "Sgt." / "a.m." etc.
const ABBR = /(?:\b(?:Mr|Mrs|Ms|Dr|Sgt|Det|Lt|St|Jr|Sr|Prof|vs|etc|Capt|Gen|Col|Maj|Ofc|No)\.|\b[A-Z]\.|\b[ap]\.m\.)$/;
function sentences(text) {
  const parts = text.match(/[^.!?…\u2029]+(?:[.!?…]+["”’)\]]*|\u2029\u2028?|$)\s*/g) || [text];
  const out = [];
  for (const p of parts) {
    if (out.length && ABBR.test(out[out.length - 1].trim())) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}

const STAGE_VERBS = 'looks|stares|turns|opens|closes|sits|stands|walks|moves|nods|shakes|smiles|laughs|leans|pauses|glances|exits|enters|crosses|takes|puts|grabs|picks|hands|reaches|watches|waits|freezes|steps|slams|sighs|breathes|swallows|hesitates|studies|considers|holds|drops|rises|gets|starts|stops|backs|storms|leaves|returns|pulls|pushes|runs|kneels|lowers|raises|ignores|whispers|shouts|blinks|frowns|winces|flinches|stiffens|bristles|scoffs|snaps|folds|slumps|paces|checks|pours|drinks|eats|cries|stands|lights|sets|slides|tosses|throws|points|gestures|stares|looks';
const STAGE_WORDS = /\b(?:beat|pause|silence|looks?|moves?|glances?|stares?|turns?|toward|towards|away|across the|at the|door|window|mirror|phone|table|buzz(?:es)?|rings?|opens?|closes?)\b/i;
const STAGE_RE = new RegExp(String.raw`^(?:${STAGE_VERBS})\b`, 'i');

// How likely is this sentence (inside a speech) to be a stage direction?
function actionScore(s, names) {
  const t = s.replace(/^[\u2029\u2028\s]+/, '');
  if (/^\(?\s*(?:a\s+)?(?:long\s+|short\s+|brief\s+|tense\s+|awkward\s+|beat\.?\s+)?(?:beat|pause|silence)\s*[.!]?\)?$/i.test(t)) return 0.9;
  const m = t.match(/^([A-Z][a-zA-Z'’\-]+)(?:\s+([A-Z][a-zA-Z'’\-]+))?\s+([a-z][\w'’]*)(?:\s+([a-z][\w'’]*))?/);
  if (m) {
    const first = normName(m[1]), full = m[2] ? normName(m[1] + ' ' + m[2]) : first;
    const known = [...names].some((n) => n === first || n === full || n.split(' ').includes(first));
    const pron = /^(?:SHE|HE|THEY|EVERYONE|NOBODY|BOTH)$/.test(first) && !m[2];
    const verb = m[3], verb2 = m[4] || '';
    const neg = /^(?:doesn['’]t|does|can['’]t|won['’]t|isn['’]t|just|slowly|quickly|finally|suddenly|still|barely|then|only|also)$/.test(verb);
    const stage = STAGE_RE.test(verb) || (neg && (STAGE_RE.test(verb2) || /^(?:move|answer|respond|look|speak|react|budge|blink|say)/.test(verb2)));
    // third-person present tense ("looks", "moves") — stronger if the sentence has stage words
    const present = /s$/.test(verb) && !/^(?:is|was|has|does|says|thinks|knows|wants|needs|means|loves|hates|likes|feels|seems|gets|lies)$/.test(verb);
    const stageWords = STAGE_WORDS.test(t);
    if (known) return stage ? 0.85 : present ? (stageWords ? 0.75 : 0.6) : 0;
    if (pron) return stage ? 0.7 : present && stageWords ? 0.6 : /^(?:has|is)$/.test(verb) && /^(?:no|silent|quiet|gone)$/.test(verb2) ? 0.6 : 0;
  }
  // "The door opens." / "Her phone buzzes." — a thing doing something, with a stage word
  if (/^(?:The|A|An|His|Her|Their)\s+\w+(?:\s+\w+)?\s+[a-z]+s\b/.test(t) && STAGE_WORDS.test(t) && t.split(/\s+/).length <= 12) return 0.6;
  return 0;
}

// Drop a sentence (or 2–3 sentence group) that repeats straight after itself (a PDF copy glitch)
function collapseRepeats(text) {
  let ss = sentences(text);
  let changed = 0;
  for (let k = 1; k <= 3; k++) {
    for (let i = 0; i + 2 * k <= ss.length; ) {
      const a = ss.slice(i, i + k).join(' '), b = ss.slice(i + k, i + 2 * k).join(' ');
      if (a === b && a.split(/\s+/).length >= 4) { ss.splice(i + k, k); changed++; } else i++;
    }
  }
  return { text: ss.join(' '), changed };
}

function parseBlob(text) {
  const t = text.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/[ \t]+/g, ' ');
  // 1) cut out headings and transitions
  const pieces = [];
  const marks = [];
  const take = (re, type, group = 1) => {
    re.lastIndex = 0; let m;
    while ((m = re.exec(t))) {
      if (marks.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
      marks.push([m.index, m.index + m[0].length, type, type === 'heading' ? cleanHeading(m[group].replace(/\s+/g, ' ')) : m[group].replace(/\s+/g, ' ')]);
    }
  };
  take(HEAD_BLOB, 'heading'); take(HEAD_LOOSE, 'heading'); take(TRANS_BLOB, 'transition');
  marks.sort((a, b) => a[0] - b[0]);
  let at = 0;
  for (const [a, b, type, txt] of marks) { pieces.push({ type: 'text', text: t.slice(at, a) }); pieces.push({ type, text: txt }); at = b; }
  pieces.push({ type: 'text', text: t.slice(at) });

  // 2) score cues across the whole script; names used more than once are "known"
  const all = pieces.filter((p) => p.type === 'text').flatMap((p) => (p.cues = findCues(p.text)));
  const tally = new Map();
  for (const c of all) if (c.score >= CONF_ASK) tally.set(c.name, (tally.get(c.name) || 0) + 1);
  const known = new Set(all.filter((c) => c.score >= CONF_OK || tally.get(c.name) >= 2).map((c) => c.name));
  for (const c of all) {
    // "DEV FBI agents…" → keep the known name, give the rest back to the speech
    if (!known.has(c.name)) {
      const pre = [...known].find((n) => c.name.startsWith(n + ' '));
      if (pre) { c.end = c.start + c.cue.indexOf(c.cue.split(/\s+/)[pre.split(' ').length]); c.name = pre; c.cue = pre; }
    }
    if (tally.get(c.name) >= 2) c.score += 0.2;
    if (known.has(c.name) && c.boundary) c.score = Math.max(c.score, CONF_OK);
  }

  // 3) build blocks
  const blocks = [];
  const add = (b) => { b.id = newId(); b.text = b.text.replace(/[\u2029\u2028]/g, ' ').replace(/\s+/g, ' ').trim(); if (b.text) blocks.push(b); return b; };
  const lastLine = () => { for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].type === 'line') return { b: blocks[i], i }; return null; };
  const addAction = (txt, extra = {}) => {
    const c = collapseRepeats(txt.replace(/[\u2029\u2028]/g, ' ').replace(/\s+/g, ' ').trim());
    if (c.changed) extra.collapsed = c.changed;
    return add({ type: 'action', text: c.text, conf: 1, ...extra });
  };

  for (const p of pieces) {
    if (p.type === 'heading') { add({ type: 'heading', text: p.text, conf: 1 }); continue; }
    if (p.type === 'transition') { add({ type: 'action', text: p.text, conf: 1 }); continue; }
    const cues = p.cues.filter((c) => c.score >= CONF_ASK);
    const first = cues.length ? cues[0].start : p.text.length;
    addAction(p.text.slice(0, first));
    cues.forEach((c, k) => {
      let speech = p.text.slice(c.end, k + 1 < cues.length ? cues[k + 1].start : p.text.length);
      // A speech that carries on after a page break: "…that's (MORE) … JULES (CONT'D) all it was."
      const prev = lastLine();
      if (c.contd && prev && prev.b.who === c.name && blocks.slice(prev.i + 1).every((b) => b.type === 'action' && b.fromBreak)) {
        const { said, act } = splitSpeech(speech, known);
        prev.b.text = (prev.b.text + ' ' + said).replace(/\s+/g, ' ').trim();
        if (act.text) addAction(act.text, { conf: act.conf, ask: { kind: 'action' } });
        return;
      }
      const more = speech.indexOf('\u2029\u2028');
      let afterBreak = '';
      if (more >= 0) { afterBreak = speech.slice(more); speech = speech.slice(0, more); }
      const { said, act } = splitSpeech(speech, known);
      const line = add({ type: 'line', who: c.name, text: said, conf: Math.min(1, c.score), cue: c.cue });
      if (line.text && c.score < CONF_OK) line.ask = { kind: 'cue', name: c.name };
      if (act.text) addAction(act.text, { conf: act.conf, ask: { kind: 'action' } });
      if (afterBreak.replace(/[\u2029\u2028\s]/g, '')) addAction(afterBreak, { fromBreak: true });
    });
  }
  return blocks;
}

// First sentence is always speech; from the first likely stage direction on, it's action.
function splitSpeech(speech, names) {
  const ss = sentences(speech);
  for (let i = 1; i < ss.length; i++) {
    const sc = /^\u2029/.test(ss[i]) ? Math.max(actionScore(ss[i], names), 0) : actionScore(ss[i], names);
    if (sc >= CONF_ASK) return { said: ss.slice(0, i).join(' '), act: { text: ss.slice(i).join(' '), conf: sc } };
  }
  return { said: ss.join(' '), act: { text: '', conf: 1 } };
}

// Move "(leaning in)" out of the spoken text into b.dir. A "(beat)" mid-line becomes a short pause "…".
function pullDirection(b) {
  const dirs = [];
  let t = b.text.replace(/^\s*\(([^)]{1,80})\)\s*/, (m, d) => { dirs.push(d.trim()); return ''; });
  t = t.replace(/\s*\(([^)]{1,80})\)\s*/g, (m, d, off, all) => {
    dirs.push(d.trim());
    const end = off + m.length >= all.length;
    return /^(?:a\s+)?(?:long\s+|short\s+)?(?:beat|pause|silence)$/i.test(d.trim()) && !end ? ' … ' : end ? '' : ' ';
  });
  t = t.replace(/\s+/g, ' ').trim();
  if (!dirs.length || !t) return b;
  b.text = t;
  b.dir = [...new Set([...(b.dir ? [b.dir] : []), ...dirs])].join(' · ');
  return b;
}

// Does a line-by-line parse look wrong (one big lump, or names buried inside paragraphs)?
function looksLikeBlob(blocks) {
  if (!blocks.some((b) => b.type === 'line')) return true;
  const names = new Set(blocks.filter((b) => b.type === 'line').map((b) => b.who));
  return blocks.some((b) => {
    if (b.text.length < 40) return false;
    const inside = findCues(b.text).filter((c) => c.start > 0 && c.score >= CONF_OK - 0.05);
    // a long lump with a name buried in it, or a known speaker / 2+ names buried in one block
    return (b.text.length > 280 && inside.length) || inside.some((c) => names.has(c.name)) || inside.length >= 2;
  });
}

// Main entry: returns blocks, plus .cleanup (what was removed) and .mode ('lines' | 'blob')
function parseScript(raw, opts = {}) {
  let { text, removed } = cleanText(raw, opts, 'lines');
  let blocks = parseLines(text).map((b) => ({ ...b, conf: 1 }));
  let mode = 'lines';
  if (looksLikeBlob(blocks)) {
    ({ text, removed } = cleanText(raw, opts, 'blob'));
    const bb = parseBlob(text);
    if (bb.some((b) => b.type === 'line')) { blocks = bb; mode = 'blob'; }
  }
  // Repeated stage directions (copy glitch) — line mode too
  let collapsed = 0;
  for (const b of blocks) {
    if (b.type !== 'action') continue;
    if (b.collapsed) { collapsed += b.collapsed; delete b.collapsed; continue; }
    const c = collapseRepeats(b.text);
    if (c.changed) { b.text = c.text; collapsed += c.changed; }
  }
  for (const b of blocks) delete b.fromBreak;
  // Stage directions merged into dialogue (line mode too): split them out and flag for review
  const names = new Set(blocks.filter((b) => b.type === 'line').map((b) => b.who));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'line') continue;
    const { said, act } = splitSpeech(b.text, names);
    if (!act.text || !said) continue;
    b.text = said;
    blocks.splice(i + 1, 0, { id: newId(), type: 'action', text: act.text, conf: act.conf, ask: { kind: 'action' } });
  }
  // Parentheticals are direction, not dialogue: "(leaning in) It means…" → tag "leaning in"
  for (const b of blocks) if (b.type === 'line') pullDirection(b);
  if (collapsed) removed.push({ text: 'Repeated stage directions', key: 'repeat', kind: 'repeat', count: collapsed });
  Object.defineProperty(blocks, 'cleanup', { value: removed, enumerable: false });
  Object.defineProperty(blocks, 'mode', { value: mode, enumerable: false });
  return blocks;
}

window.SceneParser = { pullDirection, parseScript, parseLines, cleanText, characters, guessTitle, speakable, normName, newId, cleanHeading, phraseRegex, junkKey, collapseRepeats, CONFIDENT: CONF_OK };
})();
