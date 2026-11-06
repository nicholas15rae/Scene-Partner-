## v3.0.0 — 2026-11-05 · Better voices, Prep + Voiceover (Stage B), Collab projects (Stage C)

### Voices (top priority)
- **Much stronger tone tags.** Bigger speed / pitch / volume shifts *and* phrasing tricks: angry and shouting turn full stops into exclamations and chop phrases; sad and soft add trailing pauses (…); nervous stutters the first word; sarcastic hangs on the last word; urgent runs phrases together; whisper is quiet and thin. Works on every engine.
- **Cadence per line** (Tone sheet): Steady · Building (louder, faster, higher) · Trailing off (fades, slows, drops) · Clipped (short chopped phrases).
- **Emphasis and breaths in lines:** put `*stars*` around a word to stress it, and ` / ` for a breath. Shown in bold / as a mark on screen.
- **Every voice ranked best-first, male and female**, across all engines (our ranking). Voice library tabs: Male · Female · Hundreds more · ♥ Favourites; filter by engine; ▶ preview; ♥ favourites (your v1.3 favourites carry over).
- **Piper voices (new engine, in your browser):** 22 official voices from *rhasspy/piper-voices* (11 male), plus two multi-speaker models with **904 and 109 voices** — pick a speaker number. Each downloads once when you first use it (~63–120 MB) and is cached. Shares the speech engine already bundled for Kokoro (no extra 22 MB).
- **Studio voices (optional, your desktop GPU):** a small local server (`studio-server/`) running **Chatterbox** (open-source, emotion "exaggeration" control) on your RTX 3060, with one-click Windows setup. Scene Reader finds it on `127.0.0.1`, maps tone tags to emotion intensity, and **falls back to Kokoro** if it isn't running. Phone access over your home Wi-Fi is optional (HTTPS). Nothing leaves your computer.
- **One player for every engine** with automatic fallback: Studio → Piper / Kokoro → device voice, line by line.
- Reader, narrator and every character can use any voice from any engine; *Give everyone a different voice* alternates the best male and female voices (favourites first).

### Bring your own voices
- **Import voice files** in the voice library: Piper (`.onnx` + `.onnx.json`) or Kokoro (`am_name.bin`). Stored on this device; remove any time.
- **Connect your own voice server** by address (e.g. your Studio server on the same Wi-Fi). For privacy the app only connects to addresses on your own computer or home network — internet addresses are refused.
- Rights note shown on import: only voices you have the rights to; no cloned voices of real people without their consent.

### Prep (Stage B)
- Editable **scene breakdown**: objective, obstacle, stakes.
- **Beats** (each starting at a chosen line) with an **action verb** per beat (60 verbs + Suggest).
- **Imagination ("as if")** prompts and **physical prep**: breath, posture, psychological gesture — imagination and body work rather than personal memory recall.
- **Alternate-take prompts** for each of your lines ("try this line as a threat / a joke / a secret…").
- Beats and prompts appear on the rehearsal screen.

### Voiceover studio (Stage B)
- Paste copy; mark **stress** and **breaths**; **15 / 30 / 60 s** (or any) target with live **pacing feedback** at relaxed / natural / brisk pace.
- **Direction cards**: warmer, conversational, smile, urgent, best friend, announcer (pick or shuffle).
- **Multi-voice scripts** (`NAME:` lines): AI voices read the other speakers and pause for yours (Next / Space / clicker); the AI lines are recorded into your take.
- **Read against a background**: music bed, sound effects or a **video clip** (read to picture), with volume control, synced to your recording.
- **Cue markers** (type a time, or tap while the background plays) — they flash, and can beep, during your take.
- **Record takes**, ★ the best, **compare two side by side** with waveforms, play A then B.
- **Export** the best take as **WAV** with your recorded **name slate** (optionally mixing in the music bed), or **export the video with your voice mixed in** (laptop recommended).
- Recordings stay on this device until you export them. No voice cloning.

### Collab projects, phase 1 (Stage C)
- Turn any scene into a **project**: claim the character you play; each actor records their own lines, in their own time ("Cue + record" plays the previous line first).
- **Multiple takes per line**; choose which one plays.
- **Coach / partner notes** on specific lines.
- **Play the scene** with everyone's takes in order — pauses on unrecorded lines (or fill them with AI voices).
- **Share as one file** (phone share sheet: text, email, Nearby Share). Opening a file you received **merges without overwriting**; you can only delete your own takes and notes, and deletions carry over to your partner's copy.
- **Export the full scene as audio** (WAV).

### Other
- Home screen: shortcuts to Voiceover studio and Collab projects. Script menu (⋯): Prep, Collab project.
- Version 3.0.0 in the footer. Updates install automatically as before; your scripts, voices and downloaded models are kept.
- Fixed: on the collab screen a take button could cover its delete × (layout); hidden buttons could show.

=======
>>>>>>> 11c8c4044de38932b33e7e3fb9279b404d776c7f
## v1.3.0 — 2026-11-05 · Stage A: core polish

### Detection
- **Directions become tags.** Parentheticals like `(leaning in)` are taken out of the spoken text and shown as a small tag on the bubble (and on the rehearsal screen). A mid-line `(beat)` becomes a short pause.
- **Action merged into dialogue is split out** — in pasted blobs *and* normally formatted scripts. Looks for third-person present-tense sentences (*Jules looks…*, *Okafor doesn't move*), character names as the subject, and words like beat / pause / looks / moves / door / phone. Every split is **flagged for review** ("Stage direction starts here?" Yes / No). Ordinary dialogue such as "She knows why." is left alone.
- **Narrator** (off by default): a separate voice reads scene headings ("Interior. Precinct, interview room, night.") and stage directions. Replaces v1.2's "Read stage directions aloud" (if you had that on, Narrator starts on).
- Spoken text no longer has a stray space before commas after an age like "(20s)" is removed.

### Tone tags
- New **Tone** button on every bubble: one optional tag — neutral, angry, shouting, whisper, soft, sad, nervous, sarcastic, urgent, warm — plus an optional **pause before / after** (½–3 s) and the **direction** text. ▶ Hear it previews.
- Mapped to delivery: Kokoro gets speed, pitch (playback shift with speed compensation), volume (with a limiter when louder) and a thinner sound for whisper; device voices get rate, pitch and volume.
- Tags are engine-neutral (`tones.js`): each also records an *emotion*, *intensity* and *style*, so a future emotion-capable engine can use the same tags on your saved scripts.

### Voices
- **Voice library**: all 28 Kokoro English voices, grouped American/British × female/male, with grades, ▶ previews and ♥ **favourites** (favourites appear first in every voice list).
- Voices come from a **voice-pack registry** (`tones.js` → `VoicePacks`) so more packs can be added later without touching the app.

### Hands-free
- **Keys**: Next = Space, Enter, →, ↓, Page Down, media-next, volume-up · Previous = ←, ↑, Page Up, media-previous, volume-down · Pause = media play/pause, Esc, F5, B, P, K. Works with Bluetooth presentation clickers, page-turner foot pedals and camera shutter remotes that act as keyboards. F5 no longer reloads the page while rehearsing.
- **Media buttons** (headset / Bluetooth media remotes) work while rehearsing.
- **"Press your clicker" screen** (remote icon on the rehearsal screen): press any button, then make it Next / Previous / Pause / ignored. Remove or reset assignments.
- **Remote mode**: a second phone becomes a giant "Next line" button (plus Previous / Pause). Pair by QR code: scan the main device's code with the second phone's camera app, then scan the reply with the main device (or paste it). The phones connect **directly** over WebRTC on the same Wi-Fi — no server, nothing stored. The remote only receives status ("Your line · Line 5 of 6"), never script text.

### Script library
- Scripts now live in an on-device **IndexedDB library** (scenes from v1.0–1.2 move across automatically; the old copy is kept as a safety net).
- **Folders** by show or audition, **search** (titles, characters and lines), **rename**, **move**, **duplicate**, **delete**, and **rename folder**. New scripts go into the folder you're viewing.
- Each script keeps its breakdown, your character, voices, tone tags and folder.
- **Back up all scripts** to a single file and **Restore** it later; restoring never overwrites — if you have a different version, the backup copy is added alongside it. Export a single script from its ⋯ menu.

### Other
- Version shown in the footer: v1.3.0. Service worker `sr-v1.3.0`.
- Security policy: camera allowed for this site only (QR pairing); media from this site only. Still no connections except the Hugging Face voice-model download.

## v1.2.0 — 2026-11-05

### Script detection (works on PDF copy-paste "blobs")
- Pasting or opening a scene now splits it into character bubbles even when the text arrives as **one long run with no line breaks** (typical of copying from a PDF).
- Splits by context, not just line breaks: ALL-CAPS names (1–3 words, e.g. `SGT. DIAZ`) with optional `(CONT'D)` / `(V.O.)` / `(O.S.)`, `NAME:` format, `NAME (pacing)` and other parentheticals, play style `NAME.` / `NAME -`, and a sentence ending followed by a name.
- Builds the character list from names that repeat (or are clearly marked), then splits on every later occurrence.
- Knows the difference between a speaker cue and a character being introduced in action (`DETECTIVE OKAFOR (40s) sits…`) or named mid-sentence.
- Spots where a speech ends and a stage direction starts (`A long beat.`, `Okafor doesn't move.`, `Jules looks at…`).
- Joins speeches broken across pages by `(MORE)` … `NAME (CONT'D)`.
- Parentheticals stay visible as direction and are never read aloud. Scene headings (INT./EXT., with scene numbers) are recognised; transitions (`CUT TO:`) are shown but never read.
- **Smart review:** every split gets a confidence score. Confident splits are applied automatically; unsure ones are highlighted with a prompt — *"New line here? Is this WAITRESS?"* **Yes / No / Change name** (or *"Stage direction starts here?"* Yes / No).
- Includes `tests/detect.test.js`, which checks the "LAST CALL" sample splits into the 17 expected pieces.

### Watermark & junk cleanup
- Automatically removes: repeating page headers/footers (e.g. `"LAST CALL" - Ep. 104 - Blue Rev. 10/30/26 1.`), `CONFIDENTIAL` / `DO NOT COPY` / `NOT FOR DISTRIBUTION` stamps (including `YOUR NAME - CONFIDENTIAL` and stamps cut off mid-word), casting-platform stamps (Casting Workbook, Breakdown Services, Actors Access, Casting Networks…), copyright lines, page numbers, `(MORE)`, `CONTINUED:`.
- Works **mid-sentence** too, because watermarks land inside dialogue when a PDF is copied.
- **Your name:** enter it once (breakdown screen → *Removed automatically*) and it's stripped wherever it's stamped.
- Repeated stage directions caused by copy glitches are collapsed to one.
- **Removed automatically** list shows everything that was taken out, with **Put back** for each.

### Breakdown screen
- **✂ Split here** — tap inside a bubble, then split at the cursor (if a character's name follows, it's picked up automatically; otherwise you choose who says the new part).
- **⇕ merge** — tap between two bubbles to join them.
- **Long-press** a bubble (or right-click on a computer) to reassign the character.
- Edit any bubble's text directly.
- **⊘ Ignore this text** — select junk once; every copy is removed and it's remembered for that script.
- **Re-run the breakdown** from the original text at any time.

### High-quality voices (opt-in)
- New **High-quality voices** toggle using **Kokoro** (`kokoro-js`) with the official model `onnx-community/Kokoro-82M-v1.0-ONNX`, downloaded from Hugging Face in your browser the first time and cached (about 92 MB). Progress bar while it downloads.
- Runs **on your device** in a background worker: WebGPU when available (computers), WASM with the compact q8 model on phones. If WebGPU fails it falls back to WASM; if Kokoro fails at any point the device voice takes over automatically.
- Pick a Kokoro voice for the reader and **per character**, each with a ▶ preview. Speed control applies.
- The next lines are prepared while the current one plays (and while you say yours), so there's little or no waiting.
- Privacy: only the voice **model** is downloaded. Script text is never sent anywhere. The site's security policy allows connections to Hugging Face only.

### Device voices
- **Online voices are never used** (they send your lines to Google/Microsoft). The "Show online voices" option is gone.
- Best quality first (Premium / Enhanced / Natural / Neural / Google); help notes for installing better voices on Android (Google Text-to-speech voice data) and Windows.

### Updates
- The app now **updates itself**: it checks for a new version whenever you open or return to it and switches over automatically (mid-rehearsal, it waits until you leave the scene).
- Updates no longer delete the downloaded voice model.
- Version number shown at the bottom of the home screen.

### Kept from earlier versions
- "Say character names before lines" setting (default **off**).
- Double-click `index.html` works offline (high-quality voices need the website link).
- All v1.1 paste formats, per-character device voices and pitch, PDF import, offline use.

## v1.1.0 — 2026-11-05
- Auto-detect pasted scripts (play style, dash, wide gap, markdown, lower-case chat, Title-case names).
- "Say character names before lines" toggle (default off).
- Device voices ranked by quality; per-character voice and pitch; *Give everyone a different voice*.

## v1.0.1 — 2026-11-05
- Fixed the blank page when opening `index.html` by double-clicking (scripts no longer load as modules).

## v1.0.0
- First version: paste or open PDF sides, pick your character, the reader reads the other parts and waits for yours.
