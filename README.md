# Scene Reader — v1.3.0

A private reader for self-tapes. Open your sides, pick your character, and the app reads everyone else's lines out loud, then waits for you on each of your cues.

**Privacy:** your sides are read and saved only inside your own browser. PDFs are opened on your device (the PDF reader is bundled in the `vendor` folder, not loaded from the internet), and the site is locked so it can't talk to any outside server — except Hugging Face, and only to download the optional high-quality voice model. Your script text never leaves your device. Netlify only hands your browser the app's files — it never sees your scripts.

---

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The page itself |
| `styles.css` | The look (dark mode, big text) |
| `app.js` | Screens, the reader, buttons, saving |
| `parser.js` | Works out who says what from your sides |
| `pdf-import.js` + `vendor/` | Pulls the text out of PDFs, on your device |
| `tones.js` | Tone tags + voice packs (engine-neutral) |
| `handsfree.js` + `vendor/qrcode.js`, `vendor/jsQR.js` | Clickers, pedals, media buttons, Remote mode (QR pairing) |
| `library.js` | Your script library (stored on this device), backups |
| `ROADMAP.md` | What's planned next |
| `kokoro-worker.js` + `vendor/kokoro/` | Optional high-quality voices (Kokoro), run on your device |
| `sw.js`, `manifest.webmanifest`, `icons/` | Makes it installable, work offline, and update itself |
| `CHANGELOG.md` | What changed in each version |
| `tests/` | Detection test: `node tests/detect.test.js` (optional, needs Node.js) |
| `netlify.toml` | Netlify settings, including the privacy lock |

There is no build step and nothing to install. The folder *is* the website.

---

## 1. Put it online (easiest: Netlify Drop, about 2 minutes)

1. Unzip `scene-reader.zip`. You'll have a folder called `scene-reader`.
2. Go to **app.netlify.com/drop** (log in with your Netlify account).
3. Drag the whole `scene-reader` folder onto the page.
4. Netlify gives you a link like `random-name-123.netlify.app`. Open it — that's your app.
5. Optional: in Netlify, **Site configuration → Change site name** to something like `nic-scene-reader`.

**Updating later:** in your site's **Deploys** tab, drag the updated folder onto the drop area at the bottom. Each release already has its own version in `sw.js`; the app notices the new version the next time it's opened and switches over by itself (the version is shown at the bottom of the home screen).

### Or: the GitHub way (same as your other site)
1. Make a new **private** repo on GitHub and upload everything inside the `scene-reader` folder.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Leave **Build command** empty, set **Publish directory** to `.` and deploy.
Every time you push a change, Netlify redeploys on its own.

---

## 2. Install it on your phone

- **iPhone (Safari):** open your link → Share button → **Add to Home Screen**.
- **Android (Chrome):** open your link → ⋮ menu → **Install app** (or tap **Install app** on the home screen of Scene Reader).
- **Laptop (Chrome/Edge):** the install icon appears at the right end of the address bar.

Once installed it opens full-screen and works without internet.

---

## 3. Test it (5-minute checklist)

1. **Sample scene:** tap *or try a sample scene* → check the breakdown → *Pick my character* → choose MAYA → **Hear the reader** → *Rehearse as MAYA* → tap **Start scene**.
   - The reader says Dev's line, then the big button turns gold: **Your line**. Say it, then tap the button (or press Space on a laptop).
2. **Your real sides:** tap **Open PDF sides** and choose a PDF.
   - On the check screen, fix anything that's off: change a speaker with the dropdown, mark stray bits as *Stage direction*, delete page headers, use ⤒ to join a line that got split, or tap a name chip to rename/merge a character.
3. **Controls while rehearsing:** tap any line to jump there, ⟲ restarts, ◀ ▶ step between lines, − / + changes reader speed, A− / A+ changes text size.
4. **Privacy check:** after the app has loaded once, put your phone in airplane mode and reload — it still works and still reads PDFs. That's your proof nothing is being sent anywhere.

### Keyboard / Bluetooth remote

| Key | Action |
|---|---|
| Space, Enter, ↓, Page Down | Continue (or skip the reader's line) |
| → / ← (also Page Up, ↑) | Next / previous line |
| P or Esc | Pause / resume |
| R | Restart scene |

Bluetooth page-turner pedals and keyboard-style remotes work. Cheap camera-shutter remotes usually send "volume up", which websites can't detect.

---

## Run it on your laptop (no internet, no install)

Just **double-click `index.html`**. It opens in your browser and works fully offline, including opening PDFs.

Three small differences when opened this way (they're browser rules for plain files, not bugs):
- Scenes you save are kept separately from the Netlify version, so they won't show up there.
- It won't offer "Install app" — that only works from the Netlify link.
- High-quality voices need the Netlify link (or the local-server method below); double-clicked, it uses device voices.

**Optional: run it like a real website** (needed only if something ever acts up when double-clicked):
1. Install Python from python.org (on Windows, tick **"Add python.exe to PATH"** during install).
2. Open the `scene-reader` folder in File Explorer, click the address bar, type `cmd` and press Enter.
3. In the black window, type: `python -m http.server 8000`
4. Open **http://localhost:8000** in Chrome or Edge. Close the black window to stop it.

---

## Changes in v1.1.0

- **Auto-detects pasted scripts.** As you paste or type, it shows who it found ("Detected 3 characters: MAYA (2) · DEV (2) · ROSA (1)"). Pasting into the empty box breaks the scene down straight away. On top of screenplay style and `Name: line`, it now understands:
  `MAYA. line` (play style) · `MAYA - line` · `MAYA      line` (tab or wide gap) · `**MAYA:** line` (copied from chat apps) · `maya: line` (lower case) · `Maya` on its own line above the dialogue.
- **"Say character names before lines"** toggle (Reader settings). Off by default, so the scene flows naturally. Turn it on for table-read style ("Dev. You picked the worst diner…"). With it off, a name accidentally left at the start of a line is skipped too.
- **Better voices.** Voices are ranked by quality and grouped (★ Best quality / Standard / Novelty), and only your language shows unless you switch on *Show voices in all languages*. New **Character voices** section: give each other character their own voice and pitch, preview with ▶, or tap *Give everyone a different voice*. If your device has only one voice, each character gets a different pitch instead. Includes tips for installing better voices on Android, Windows and iPhone.

## Changes in v1.0.1

- Fixed: double-clicking `index.html` showed a blank page. The app now loads as plain scripts instead of "modules", which browsers block for local files. Nothing about how it looks or works changed.
- `sw.js` version bumped to `sr-v1.0.1` so installed phones pick up the update.

---

## High-quality voices (Kokoro)

On the *Pick your character* screen, switch on **High-quality voices**. The first time, the app downloads the official Kokoro voice model (about 92 MB) from Hugging Face, with a progress bar. After that it loads from your browser's storage, even offline.

- **Reader voice** and a voice **per character**, each with ▶ to preview. ★ = best-rated voices (Heart and Bella are the most natural).
- **Engine:** *Automatic* uses the compact model on phones and WebGPU on computers that support it (a bigger, about 326 MB, download, but faster). If anything fails, the device voice takes over and the scene keeps going.
- Use Wi-Fi for the first download. Clearing your browser's site data removes the model (it downloads again next time).

## Hands-free

- **Clicker / pedal / shutter remote:** pair it in your phone's or laptop's Bluetooth settings, then on the rehearsal screen tap the remote icon → press its buttons → *Make it Next / Previous / Pause*.
- **Second phone as remote:** both on the same Wi-Fi. Rehearsal screen → remote icon → *Pair a phone as remote* → scan the code with the second phone's camera app → on the main device tap *Scan the reply code* and point it at the second phone.

## Your scripts and backups

Everything is stored in this browser on this device. Use **Back up all scripts** now and then and keep the file somewhere safe (it contains your sides). **Restore from a backup** adds scripts back without overwriting anything.

## Good to know

- **Device voices:** only **on-device** voices are ever used, so lines never leave your device. "Online" voices (e.g. *Google US English*, *Microsoft … Online (Natural)*) send each line to Google/Microsoft, so Scene Reader never uses them. For the most natural sound, switch on High-quality voices.
  - iPhone: better voices are free in **Settings → Accessibility → Spoken Content → Voices** (download an "Enhanced" or "Premium" one), then pick it in the app.
  - No sound on iPhone? Check the silent switch and volume.
- **Your scenes live in this browser on this device.** They don't sync between phone and laptop (on purpose). Clearing your browser's site data deletes them.
- **Scanned PDFs** (photos of pages) aren't supported yet — the app will tell you. Copy-paste the text for now.
- **Pasting text** works in screenplay style (NAME on its own line, line underneath) or chat style (`Name: line`).
- The screen stays awake while you rehearse.

---

## Next up (from your list)

1. Kokoro voices — natural, still on-device
2. Different voice per character
3. Line-learning mode (hide your lines / first letters only)
4. Auto-advance when you finish speaking (on-device speech recognition)
5. Scanned PDFs with on-device OCR
