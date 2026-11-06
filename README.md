# Scene Reader — Studio voices (optional, Windows desktop)

Emotional AI voices generated on **your own PC's graphics card** (tested target: RTX 3060, 12 GB).
Uses [Chatterbox](https://github.com/resemble-ai/chatterbox) (Resemble AI, MIT licence) — an open-source
voice model with an *emotion intensity* control that Scene Reader drives from your tone tags.
**Nothing leaves your computer**: Scene Reader sends each line to this server on your PC, it speaks it, and sends the audio back.

## One-time setup (about 15 minutes)
1. Install **Python 3.11** from python.org (tick **Add python.exe to PATH**).
2. Make sure your **NVIDIA driver** is up to date (GeForce Experience / nvidia.com).
3. Double-click **`setup-studio.bat`** in this folder. It downloads PyTorch and Chatterbox (~6 GB).

## Every time
1. Double-click **`start-studio.bat`**. The first start downloads the Chatterbox model (~2–3 GB), then takes ~20 s to load.
2. In Scene Reader on the same PC: **Pick your character → Voices → Studio voices → Connect**.
   Chrome may ask to *allow access to devices on your local network* — choose **Allow**.
3. Pick **Studio** as the reader or a character's voice. Tone tags control its emotion:
   neutral 0.4 → warm 0.8 → angry 1.3 → shouting 1.5 (Chatterbox "exaggeration").
4. If the server isn't running, Scene Reader automatically uses Kokoro instead.

## Using it from your phone (same Wi-Fi)
1. Double-click **`start-studio-for-phone.bat`** — it shows an address like `https://192.168.1.20:5124`.
2. On the phone, open that address + `/health` in Chrome once and accept the security warning (it's your own PC's certificate).
3. In Scene Reader on the phone: **Studio voices → Server address** → paste the address → **Connect**.
Scene Reader only ever connects to addresses on your own computer or home network — never the internet.

## Extra voices
See `voices/README.txt`. Only use recordings you have the rights to; no voices of real people without their consent.

## Troubleshooting
- *"Studio server not found"* — is the black window open? Is the address `http://127.0.0.1:5123`?
- Very slow — the graphics card wasn't found; update the NVIDIA driver and run setup again.
- Test without the model: `.venv\Scripts\python.exe server.py --fake` (plays tones).
