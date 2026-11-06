"""
Scene Reader — Studio voice server (runs on YOUR computer; nothing leaves it).

Uses Chatterbox (Resemble AI, MIT licence), an open-source text-to-speech model with an
"exaggeration" (emotion intensity) control, on your NVIDIA graphics card.

  start-studio.bat            normal use (this computer only, http://127.0.0.1:5123)
  start-studio.bat --lan      also let your phone use it over your home Wi-Fi (https://<this PC's IP>:5124)
  python server.py --fake     test mode: beeps instead of a voice (no model, no GPU needed)

Scene Reader talks to it with:
  GET  /health   → {"ok": true, "engine": "Chatterbox", "device": "cuda", "voices": [...]}
  GET  /voices   → the same voice list
  POST /tts      {"text", "voice", "exaggeration", "cfg_weight", "temperature"} → audio/wav
"""
import argparse, io, ipaddress, json, math, os, socket, ssl, struct, sys, threading, time, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.path.join(HERE, "voices")
VERSION = "1.0.0"

ap = argparse.ArgumentParser(description="Scene Reader Studio voice server")
ap.add_argument("--port", type=int, default=5123, help="port on this computer (default 5123)")
ap.add_argument("--lan", action="store_true", help="also serve your home network over HTTPS on port+1 (for your phone)")
ap.add_argument("--allow-origin", action="append", default=[], help="extra website allowed to use this server (e.g. https://my-reader.netlify.app)")
ap.add_argument("--fake", action="store_true", help="test mode without the AI model (plays tones)")
ap.add_argument("--cpu", action="store_true", help="run the model on the processor instead of the graphics card (slow)")
args = ap.parse_args()

# ------------------------------------------------------------------ who may use this server
# Your Scene Reader site, this computer, and files opened directly. Anything else is refused.
def origin_allowed(origin: str) -> bool:
    if not origin or origin == "null":
        return True
    if origin in args.allow_origin:
        return True
    try:
        u = urlparse(origin)
        host = u.hostname or ""
    except Exception:
        return False
    if host.endswith(".netlify.app") or host in ("localhost", "127.0.0.1", "::1"):
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return host.endswith(".local")

# ------------------------------------------------------------------ the voice model
class FakeEngine:
    name, device, sr = "Fake test engine", "none", 24000
    def voices(self):
        return [{"id": "default", "name": "Studio test voice", "gender": "Mixed"}]
    def generate(self, text, voice, exaggeration, cfg_weight, temperature):
        n = int(self.sr * min(8, 0.2 + 0.06 * len(text)))
        f = 180 + 120 * exaggeration
        return [0.25 * math.sin(2 * math.pi * f * i / self.sr) for i in range(n)], self.sr

class ChatterboxEngine:
    name = "Chatterbox"
    def __init__(self):
        import torch
        from chatterbox.tts import ChatterboxTTS
        self.torch = torch
        self.device = "cpu" if args.cpu or not torch.cuda.is_available() else "cuda"
        print(f"Loading Chatterbox on {self.device} (first run downloads the model, ~2-3 GB)...", flush=True)
        self.model = ChatterboxTTS.from_pretrained(device=self.device)
        self.sr = self.model.sr
        self.lock = threading.Lock()
    def voices(self):
        out = [{"id": "default", "name": "Studio (Chatterbox)", "gender": "Mixed"}]
        if os.path.isdir(VOICES_DIR):
            for f in sorted(os.listdir(VOICES_DIR)):
                if f.lower().endswith((".wav", ".mp3", ".flac")):
                    stem = os.path.splitext(f)[0]
                    g = "Male" if stem.lower().startswith(("m_", "male")) else "Female" if stem.lower().startswith(("f_", "female")) else "Mixed"
                    out.append({"id": f, "name": stem.replace("_", " "), "gender": g})
        return out
    def generate(self, text, voice, exaggeration, cfg_weight, temperature):
        prompt = None
        if voice and voice != "default":
            p = os.path.join(VOICES_DIR, os.path.basename(voice))
            if os.path.isfile(p):
                prompt = p
        with self.lock, self.torch.inference_mode():
            wav = self.model.generate(text, audio_prompt_path=prompt, exaggeration=exaggeration,
                                      cfg_weight=cfg_weight, temperature=temperature)
        return wav.squeeze(0).cpu().numpy().tolist(), self.sr

ENGINE = FakeEngine() if args.fake else ChatterboxEngine()

def to_wav(samples, sr):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples))
    return buf.getvalue()

# ------------------------------------------------------------------ HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "SceneReaderStudio/" + VERSION
    def log_message(self, fmt, *a):  # never log request bodies (your script text)
        sys.stdout.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % a))
    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin or "*")
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")   # Chrome: website → your own computer
            self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Cache-Control", "no-store")
    def refuse(self):
        self.send_response(403); self.cors(); self.end_headers(); self.wfile.write(b"origin not allowed")
    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors()
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        if not origin_allowed(self.headers.get("Origin", "")): return self.refuse()
        self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self):
        if not origin_allowed(self.headers.get("Origin", "")): return self.refuse()
        path = urlparse(self.path).path
        if path in ("/health", "/"):
            return self.send_json({"ok": True, "app": "scene-reader-studio", "version": VERSION, "engine": ENGINE.name,
                                   "device": ENGINE.device, "voices": ENGINE.voices()})
        if path == "/voices":
            return self.send_json(ENGINE.voices())
        self.send_json({"ok": False, "error": "not found"}, 404)
    def do_POST(self):
        if not origin_allowed(self.headers.get("Origin", "")): return self.refuse()
        if urlparse(self.path).path != "/tts":
            return self.send_json({"ok": False, "error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > 20000: raise ValueError("text too long")
            req = json.loads(self.rfile.read(n) or b"{}")
            text = str(req.get("text", "")).strip()[:1000]
            if not text: raise ValueError("no text")
            ex = max(0.25, min(2.0, float(req.get("exaggeration", 0.5))))
            cfg = max(0.0, min(1.0, float(req.get("cfg_weight", 0.5))))
            temp = max(0.05, min(1.5, float(req.get("temperature", 0.8))))
            samples, sr = ENGINE.generate(text, req.get("voice", "default"), ex, cfg, temp)
            body = to_wav(samples, sr)
        except Exception as e:
            return self.send_json({"ok": False, "error": str(e)}, 400)
        self.send_response(200); self.cors()
        self.send_header("Content-Type", "audio/wav"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the Wi-Fi/Ethernet address
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()

def self_signed_cert(ip):
    """Make a certificate for your home network address (stored next to this file)."""
    crt, key = os.path.join(HERE, "studio-cert.pem"), os.path.join(HERE, "studio-key.pem")
    if os.path.exists(crt) and os.path.exists(key):
        return crt, key
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    import datetime
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Scene Reader Studio")])
    san = x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address(ip)), x509.DNSName("localhost"), x509.DNSName(socket.gethostname() + ".local")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650)).add_extension(san, critical=False).sign(k, hashes.SHA256()))
    open(crt, "wb").write(cert.public_bytes(serialization.Encoding.PEM))
    open(key, "wb").write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
    return crt, key

def main():
    local = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"\n  Scene Reader Studio is running ({ENGINE.name} on {ENGINE.device}).")
    print(f"  In Scene Reader on THIS computer: Voices → Studio voices → address http://127.0.0.1:{args.port} → Connect")
    if args.lan:
        ip = lan_ip()
        crt, key = self_signed_cert(ip)
        lan = ThreadingHTTPServer(("0.0.0.0", args.port + 1), Handler)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(crt, key)
        lan.socket = ctx.wrap_socket(lan.socket, server_side=True)
        threading.Thread(target=lan.serve_forever, daemon=True).start()
        print(f"  On your PHONE (same Wi-Fi): first open https://{ip}:{args.port + 1}/health and accept the warning once,")
        print(f"  then in Scene Reader use the address https://{ip}:{args.port + 1}")
    print("  Keep this window open while you rehearse. Close it (or press Ctrl+C) to stop.\n")
    try:
        local.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
