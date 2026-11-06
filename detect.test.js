// Scene Reader — detection test. Run from the scene-reader folder:  node tests/detect.test.js
// The sample arrives as ONE blob with no line breaks, like a PDF copy-paste.
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'parser.js'), 'utf8'), ctx);
const P = ctx.window.SceneParser;
const blob = fs.readFileSync(path.join(__dirname, 'sample-blob.txt'), 'utf8').trim();

const EXPECT = [
  ['heading', 'INT. PRECINCT - INTERVIEW ROOM - NIGHT'],
  ['action', "A bare table. DETECTIVE OKAFOR (40s) sits across from JULES BENNETT (20s), who hasn't slept."],
  ['OKAFOR', "You know why you're here."],
  ['JULES', "Because I'm the last person who saw him. You keep saying that like it means something."],
  ['OKAFOR', 'It means you were there at ten.', 'leaning in'],
  ['JULES', 'I was there at nine. I left at nine thirty. Check the cameras.'],
  ['OKAFOR', 'We did.'],
  ['action', 'A long beat. Jules looks at the two-way mirror.'],
  ['JULES', 'Then why am I still sitting here?'],
  ['SGT. DIAZ', 'Okafor. A word.'],
  ['action', "Okafor doesn't move."],
  ['OKAFOR', 'Because the cameras show you coming back.'],
  ['action', 'Jules opens her mouth. Closes it.'],
  ['JULES', "I came back for my phone. That's all. I swear to God that's all it was."],
  ['action', 'She has no answer.'],
  ['OKAFOR', "Then where's the phone, Jules?"],
  ['action', 'CUT TO:'],
];

const res = P.parseScript(blob);
const got = res.map((b) => [b.type === 'line' ? b.who : b.type, b.text, b.dir]);
let fails = 0;
const n = Math.max(EXPECT.length, got.length);
for (let i = 0; i < n; i++) {
  const e = EXPECT[i], g = got[i];
  const ok = e && g && e[0] === g[0] && e[1] === g[1] && (e[2] || undefined) === g[2];
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(i + 1).padStart(2)}  expected: ${e ? e[0] + ' | ' + e[1] + (e[2] ? '  [' + e[2] + ']' : '') : '(nothing)'}`);
  if (!ok) console.log(`           got:      ${g ? g[0] + ' | ' + g[1] + (g[2] ? '  [' + g[2] + ']' : '') : '(nothing)'}`);
}
// Nothing junk may survive anywhere, and parentheticals/action are never spoken
const all = res.map((b) => b.text).join(' ');
for (const junk of ['CONFIDENT', 'YOUR NAME', 'LAST CALL', 'Rev.', '(MORE)', 'CONTINUED:', "CONT'D", '(O.S.)'])
  if (all.includes(junk)) { fails++; console.log(`FAIL junk left in text: ${junk}`); }
const flagged = res.filter((b) => b.ask && b.ask.kind === 'action').map((b) => b.text);
for (const t of ['A long beat. Jules looks at the two-way mirror.', "Okafor doesn't move.", 'Jules opens her mouth. Closes it.'])
  if (!flagged.includes(t)) { fails++; console.log('FAIL not flagged for review: ' + t); } else console.log('PASS flagged for review: ' + t);
const chars = P.characters(res).map((c) => c.name).sort().join(',');
if (chars !== 'JULES,OKAFOR,SGT. DIAZ') { fails++; console.log('FAIL characters: ' + chars); } else console.log('PASS characters: ' + chars);
const spoken = res.filter((b) => b.type === 'line').map((b) => P.speakable(b.text)).join(' ');
if (/leaning in|\(/.test(spoken)) { fails++; console.log('FAIL parenthetical would be spoken'); }
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
