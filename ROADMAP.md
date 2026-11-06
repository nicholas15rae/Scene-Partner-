# Scene Reader — Roadmap

## Built in stages (one release each, wait for "next" between them)
- **Stage A — v1.3.0 Core polish** ✅ (this release)
- **Stage B — v2.0.0 Prep + Voiceover**
  - Prep: editable scene breakdown (objective, obstacle, stakes, beats), action verbs per beat, "as-if" imagination and physical prep prompts (breath, posture, psychological gesture), alternate-take prompts ("try this line as a threat / a joke / a secret"). Imagination and physical work over personal memory recall.
  - Voiceover: paste copy, timer with 15/30/60 s targets and pacing feedback, direction cards (warmer, conversational, smile, urgent, best friend, announcer), record takes, compare side by side, mark breaths and emphasis, export best take as WAV with a name slate. Recordings stay on the device. No voice cloning.
- **Stage C — v3.0.0 Collab projects, phase 1**
  - Scene project = script + character assignments + recorded takes per line + notes. Each actor records their own lines; playback in order, pausing on unrecorded lines. Multiple takes per line, choose which plays. Coach notes on lines. Share as a single file (text, email, Nearby Share); the other person adds takes and sends it back; merges without overwriting. Delete your own takes. Export the full scene as audio.

## Notes only (not being built yet)
- **Studio voices**: optional emotion-capable open-source model (e.g. Chatterbox or Orpheus) running on Nic's desktop GPU as a local server; reuses the tone tags in `tones.js` (`emotion`, `intensity`, `style`).
- **Phase 2 shared projects** by invite link with end-to-end encryption.
- **Consent-based voice cloning.**
- **App-store packaging** with Capacitor.

Privacy rule for everything: script text and recordings never go to any cloud service.
