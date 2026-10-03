"""Voz da Bel via Cartesia (sonic-3.5) — espelha a interface do fish.py.

Uma sessão WebSocket persistente por ligação; cada turno vira um "context"
da Cartesia: o texto entra aos pedaços (continue=true, conforme o LLM gera)
e o flush fecha o context (continue=false) — a sessão continua aberta para
o turno seguinte, zero handshake por resposta.

Medido da VPS em 04/08/2026: TTFA ~216-232 ms (pcm_s16le 8 kHz, pt).
A velocidade (voz_velocidade das campanhas) não tem equivalente estável na
API da Cartesia e é ignorada de propósito.

A chave vem do babel.env (CARTESIA_API_KEY) — lida aqui mesmo porque o
systemd não popula os.environ (pegadinha conhecida do projeto).
"""
import base64
import json
import urllib.request
import uuid

try:
    import websocket  # websocket-client
except Exception:      # sem a lib, o motor cai no TTS HTTP sem quebrar
    websocket = None

VERSAO = "2025-04-16"
MODELO = "sonic-3.5"
VOZ_BEL = "1cf751f6-8749-43ab-98bd-230dd633abdb"  # Ana Paula (pt-BR, feminina)
SAIDA_8K = {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 8000}


def _chave():
    try:
        with open("/opt/babel/babel.env") as f:
            for linha in f:
                linha = linha.strip()
                if linha.startswith("CARTESIA_API_KEY="):
                    return linha.split("=", 1)[1]
    except OSError:
        pass
    return ""


def _voz_valida(voz_id):
    """voz_id de campanha pode ser um reference_id da Fish (legado) — só
    passa adiante se tiver cara de UUID da Cartesia; senão, voz da Bel."""
    v = (voz_id or "").strip()
    return v if len(v) == 36 and v.count("-") == 4 else VOZ_BEL


def tts(chave, texto, voz_id=None, speed=1.0):
    """Sintetiza texto → wav 8 kHz (paridade com fish.tts; chave é ignorada)."""
    corpo = {"model_id": MODELO, "transcript": texto, "language": "pt",
             "voice": {"mode": "id", "id": _voz_valida(voz_id)},
             "output_format": {"container": "wav", "encoding": "pcm_s16le",
                               "sample_rate": 8000}}
    req = urllib.request.Request(
        "https://api.cartesia.ai/tts/bytes", data=json.dumps(corpo).encode(),
        headers={"X-API-Key": _chave(), "Cartesia-Version": VERSAO,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def tts_slin8k(texto, voz_id=None, speed=1.0):
    """Sintetiza texto → PCM s16le 8 kHz cru (pronto para o AudioSocket)."""
    corpo = {"model_id": MODELO, "transcript": texto, "language": "pt",
             "voice": {"mode": "id", "id": _voz_valida(voz_id)},
             "output_format": SAIDA_8K}
    req = urllib.request.Request(
        "https://api.cartesia.ai/tts/bytes", data=json.dumps(corpo).encode(),
        headers={"X-API-Key": _chave(), "Cartesia-Version": VERSAO,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


# ---------- TTS em streaming (sessão persistente, um context por turno) ----------

class _Sessao:
    def __init__(self, ws, voz_id):
        self.ws = ws
        self.voz = voz_id
        self.ctx = None     # context do turno em andamento (None = nenhum)


def tts_stream_abrir(chave, voz_id=None, sample_rate=8000, speed=1.0):
    """Abre a sessão de voz. `chave` (da Fish) é ignorada — a nossa vem do env."""
    if websocket is None:
        raise RuntimeError("websocket-client não instalado")
    ws = websocket.create_connection(
        "https://api.cartesia.ai/tts/websocket".replace("https", "wss")
        + f"?api_key={_chave()}&cartesia_version={VERSAO}", timeout=15)
    return _Sessao(ws, _voz_valida(voz_id))


def tts_stream_texto(s, texto):
    """Empurra um pedaço de texto. Primeiro pedaço do turno abre o context."""
    if s.ctx is None:
        s.ctx = "t-" + uuid.uuid4().hex[:12]
    s.ws.send(json.dumps({
        "model_id": MODELO, "transcript": texto + " ",
        "voice": {"mode": "id", "id": s.voz}, "output_format": SAIDA_8K,
        "language": "pt", "context_id": s.ctx, "continue": True}))


def tts_stream_flush(s):
    """Fecha o context do turno (sintetiza o que faltou) SEM fechar a sessão."""
    if s.ctx is None:
        return
    s.ws.send(json.dumps({
        "model_id": MODELO, "transcript": "",
        "voice": {"mode": "id", "id": s.voz}, "output_format": SAIDA_8K,
        "language": "pt", "context_id": s.ctx, "continue": False}))
    s.ctx = None


def tts_stream_fim(s):
    """Avisa que o texto acabou (paridade com a Fish: é só um flush final)."""
    try:
        tts_stream_flush(s)
    except Exception:
        pass


def tts_stream_chunks(s):
    """Gera chunks de PCM 8 kHz a sessão inteira. 'done' é fim de UM turno
    (a sessão segue); só sai quando o WS morre de verdade."""
    while True:
        try:
            dados = s.ws.recv()
        except Exception:
            return
        if not dados:
            return
        try:
            m = json.loads(dados)
        except Exception:
            continue
        tipo = m.get("type")
        if tipo == "chunk":
            b64 = m.get("data")
            if b64:
                yield base64.b64decode(b64)
        # "done"/"timestamps": informativos por turno — a sessão continua.
        # "error" de context (ex.: timeout de continuação): o turno seguinte
        # abre context novo; não derruba a sessão.


def tts_stream_fechar(s):
    try:
        s.ws.close()
    except Exception:
        pass
