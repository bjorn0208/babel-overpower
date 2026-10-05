#!/usr/bin/env python3
"""Babel OS - servidor local de voz Edge TTS (Microsoft, neural, gratuito).

Fala com as vozes neurais pt-BR (Francisca, Thalita...) sem API key.
O babel-os.html chama este servidor; sem ele, o app usa a voz do navegador.

Uso:
    ./edge-tts/.venv/bin/python edge-tts/server.py [--port 3100]

Rotas:
    GET  /         pagina de estado
    GET  /health   {"ok": true}
    GET  /voices   vozes neurais pt-BR (as 3 que a Microsoft oferece)
    POST /tts      {"text": "...", "voice": "pt-BR-FranciscaNeural"} -> audio/mpeg
"""
import asyncio
import hashlib
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)

DEFAULT_VOICE = "pt-BR-FranciscaNeural"
VOICES = [
    ("pt-BR-FranciscaNeural", "Francisca · feminina (recomendada)"),
    ("pt-BR-ThalitaMultilingualNeural", "Thalita · feminina"),
    ("pt-BR-AntonioNeural", "Antônio · masculina"),
]
VOICE_IDS = set(v for v, _ in VOICES)
MAX_TEXT = 2000

try:
    import edge_tts
except ImportError:
    edge_tts = None


def synth(text, voice, path, rate=None, pitch=None):
    async def go():
        kw = {}
        if rate:
            kw["rate"] = rate
        if pitch:
            kw["pitch"] = pitch
        comm = edge_tts.Communicate(text, voice, **kw)
        await comm.save(path)

    asyncio.run(go())


def cache_path(text, voice, rate, pitch):
    key = hashlib.sha1(
        ("%s\n%s\n%s\n%s" % (voice, rate or "", pitch or "", text)).encode("utf-8")
    ).hexdigest()
    return key, os.path.join(CACHE, key + ".mp3")


def valid_voice(v):
    return isinstance(v, str) and v in VOICE_IDS


def valid_pct(v):
    return isinstance(v, str) and re.match(r"^[+-]\d+%$", v)


def valid_pitch(v):
    return isinstance(v, str) and re.match(r"^[+-]\d+Hz$", v)


class H(BaseHTTPRequestHandler):
    server_version = "BabelEdgeTTS/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            body = (
                "<!doctype html><meta charset=utf-8><title>Babel Edge TTS</title>"
                "<h1>Babel Edge TTS · ok</h1>"
                "<p>POST /tts com %s</p>" % json.dumps({"text": "Oi!", "voice": DEFAULT_VOICE})
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/health":
            self._json({"ok": True, "default_voice": DEFAULT_VOICE})
        elif self.path.startswith("/tts-stream?"):
            self._stream()
        elif self.path == "/voices":
            self._json({"voices": [{"id": v, "label": l} for v, l in VOICES]})
        else:
            self._json({"error": "rota desconhecida"}, 404)

    def _stream(self):
        """GET /tts-stream?text=...&voice=...: o audio sai enquanto a Microsoft sintetiza
        (1o som em ~1s, contra ~2s esperando o mp3 inteiro); no fim grava no cache."""
        if edge_tts is None:
            self._json({"error": "edge-tts nao instalado. Rode: pip install edge-tts"}, 500)
            return
        q = parse_qs(urlparse(self.path).query)
        text = (q.get("text", [""])[0]).strip()
        voice = q.get("voice", [DEFAULT_VOICE])[0]
        rate = q.get("rate", [None])[0]
        pitch = q.get("pitch", [None])[0]
        if not text or len(text) > MAX_TEXT or not valid_voice(voice) \
                or (rate is not None and not valid_pct(rate)) or (pitch is not None and not valid_pitch(pitch)):
            self._json({"error": "pedido invalido"}, 400)
            return
        key, path = cache_path(text, voice, rate, pitch)
        if os.path.exists(path):
            with open(path, "rb") as f:
                audio = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio)))
            self._cors()
            self.end_headers()
            self.wfile.write(audio)
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        partes = []

        async def go():
            kw = {}
            if rate:
                kw["rate"] = rate
            if pitch:
                kw["pitch"] = pitch
            async for c in edge_tts.Communicate(text, voice, **kw).stream():
                if c["type"] == "audio":
                    self.wfile.write(c["data"])
                    self.wfile.flush()
                    partes.append(c["data"])

        try:
            asyncio.run(go())
        except (BrokenPipeError, ConnectionResetError):
            return  # o app parou de ouvir (fechou a conversa)
        except Exception as e:
            sys.stderr.write("falha no streaming: %s\n" % e)
            return
        tmp = path + ".tmp"
        try:
            with open(tmp, "wb") as f:
                f.write(b"".join(partes))
            os.replace(tmp, path)
        except OSError:
            pass

    def do_POST(self):
        if self.path != "/tts":
            self._json({"error": "rota desconhecida"}, 404)
            return
        if edge_tts is None:
            self._json({"error": "edge-tts nao instalado. Rode: pip install edge-tts"}, 500)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if length > 65536:
            self._json({"error": "pedido grande demais"}, 413)
            return
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._json({"error": "JSON invalido"}, 400)
            return
        text = (data.get("text") or "").strip()
        voice = data.get("voice") or DEFAULT_VOICE
        rate = data.get("rate")
        pitch = data.get("pitch")
        if not text:
            self._json({"error": "cade o text?"}, 400)
            return
        if len(text) > MAX_TEXT:
            self._json({"error": "texto longo demais (max %d)" % MAX_TEXT}, 400)
            return
        if not valid_voice(voice):
            self._json({"error": "voz desconhecida", "voices": sorted(VOICE_IDS)}, 400)
            return
        if rate is not None and not valid_pct(rate):
            self._json({"error": "rate invalido (ex.: +10%, -5%)"}, 400)
            return
        if pitch is not None and not valid_pitch(pitch):
            self._json({"error": "pitch invalido (ex.: +2Hz)"}, 400)
            return
        key, path = cache_path(text, voice, rate, pitch)
        if not os.path.exists(path):
            tmp = path + ".tmp"
            try:
                synth(text, voice, tmp, rate, pitch)
            except Exception as e:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                self._json({"error": "falha ao sintetizar: %s" % e}, 502)
                return
            try:
                os.replace(tmp, path)
            except OSError:
                pass
        try:
            with open(path, "rb") as f:
                audio = f.read()
        except OSError as e:
            self._json({"error": "falha ao ler cache: %s" % e}, 500)
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("X-Cache-Key", key)
        self._cors()
        self.end_headers()
        self.wfile.write(audio)


def main():
    port = 3100
    args = sys.argv[1:]
    if "--port" in args:
        try:
            port = int(args[args.index("--port") + 1])
        except (ValueError, IndexError):
            print("porta invalida", file=sys.stderr)
            return 1
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    print("Babel Edge TTS em http://localhost:%d" % port)
    print("Voz padrao: %s" % DEFAULT_VOICE)
    print("No app: Ajustes -> Mao e voz -> Voz -> uma voz BR")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
