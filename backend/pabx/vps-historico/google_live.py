"""Conversa em tempo real pela Live API do Gemini (Google AI Studio).

Diferente do fish.py/cartesia.py, que são só a VOZ, aqui o Google faz as três
coisas de uma vez: ouve, pensa e responde falando. O motor manda o áudio cru da
ligação e recebe áudio de volta — sem ASR, LLM e TTS separados.

Medido da VPS em 27/08/2026, áudio enviado em tempo real (20 ms por quadro),
TTFA = do instante em que a pessoa cala até o primeiro byte de voz da IA:
  gemini-3.1-flash-live-preview ............ 1347 ms (n=4/4, 1266–1526)
  gemini-2.5-flash-native-audio (thinking 0)  1708 ms
  gemini-2.5-flash-native-audio (padrão) ... 2830 ms  ← pensa em inglês antes de falar
Para comparação, o motor próprio (Deepgram + Groq + Cartesia) faz 800 ms de
mediana em 137 turnos reais de produção. Ou seja: o Google NÃO é mais rápido —
ele entrega voz natural sem depender de crédito de Cartesia/Fish, na mesma
latência em que o Piper entrega voz robótica.

ATENÇÃO: o 3.1 é preview e instável. A mesma configuração ora responde, ora
derruba a conexão logo após o setup. Quem chama tem que ter caminho de reserva.

Áudio: o AudioSocket do Asterisk fala slin 8 kHz; a Live API recebe PCM 16 kHz
e devolve PCM 24 kHz. A conversão nos dois sentidos acontece aqui dentro, com
o estado do ratecv preservado entre quadros (senão estala a cada 20 ms).
"""
import audioop
import base64
import json
import queue as queue_mod
import threading
import time

import websocket

URL = ("wss://generativelanguage.googleapis.com/ws/"
       "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=")

MODELO = "gemini-3.1-flash-live-preview"
VOZ_BEL = "Leda"          # feminina, pt-BR — a mais próxima da Bel entre as prontas
TAXA_ENTRADA = 16000
TAXA_SAIDA = 24000
TAXA_TELEFONE = 8000


class Sessao:
    def __init__(self, ws):
        self.ws = ws
        self.eventos = queue_mod.Queue()
        self.viva = True
        self.estado_subida = None      # ratecv 8k → 16k
        self.estado_descida = None     # ratecv 24k → 8k
        self.fala_lead = ""
        self.fala_bel = ""


def abrir(chave, instrucao, modelo=None, voz=None, pensar=False, timeout=20,
          ferramentas=None):
    """Abre a sessão e devolve quando o Google confirma o setup.

    pensar=False manda thinkingBudget 0: no native-audio isso corta 1,1 s por
    turno (o modelo raciocina em inglês antes de falar). No 3.1 não muda nada
    medível, mas também não atrapalha.

    ferramentas = lista de functionDeclarations. É por elas que a Bel anota o
    que descobriu e diz que é hora de desligar — o motor antigo fazia isso com
    JSON na resposta, o que aqui não existe: a resposta é voz.
    """
    ws = websocket.create_connection(URL + chave, timeout=timeout)
    gen = {"responseModalities": ["AUDIO"]}
    if not pensar:
        gen["thinkingConfig"] = {"thinkingBudget": 0}
    setup = {
        "model": f"models/{modelo or MODELO}",
        "generationConfig": gen,
        # As duas transcrições são o que alimenta o dossiê e o histórico da
        # ligação — sem elas a conversa acontece e não sobra registro nenhum.
        "inputAudioTranscription": {},
        "outputAudioTranscription": {},
        "systemInstruction": {"parts": [{"text": instrucao}]},
    }
    if ferramentas:
        setup["tools"] = [{"functionDeclarations": ferramentas}]
    if voz:
        gen["speechConfig"] = {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}},
                               "languageCode": "pt-BR"}
    ws.send(json.dumps({"setup": setup}))
    resposta = ws.recv()
    if isinstance(resposta, bytes):
        resposta = resposta.decode()
    if "setupComplete" not in resposta:
        ws.close()
        raise RuntimeError(f"setup recusado: {resposta[:200]}")
    s = Sessao(ws)
    threading.Thread(target=_receber, args=(s,), daemon=True).start()
    return s


def iniciar(s, texto):
    """Dá o primeiro turno ao modelo — quem fala primeiro na ligação é a Bel.

    Sem isto a sessão fica esperando a pessoa falar, e a ligação abre com um
    silêncio de quem atendeu e não ouviu nada.
    """
    try:
        s.ws.send(json.dumps({"clientContent": {
            "turns": [{"role": "user", "parts": [{"text": texto}]}],
            "turnComplete": True}}))
    except Exception:
        s.viva = False


def enviar(s, pcm_slin8k):
    """Manda um quadro de áudio da ligação (slin 8 kHz) para o Google."""
    if not s.viva:
        return
    convertido, s.estado_subida = audioop.ratecv(
        pcm_slin8k, 2, 1, TAXA_TELEFONE, TAXA_ENTRADA, s.estado_subida)
    try:
        s.ws.send(json.dumps({"realtimeInput": {"audio": {
            "mimeType": f"audio/pcm;rate={TAXA_ENTRADA}",
            "data": base64.b64encode(convertido).decode()}}}))
    except Exception:
        s.viva = False


def _receber(s):
    """Thread que lê o WebSocket e traduz para eventos simples na fila.

    Eventos: ('audio', pcm8k) · ('lead', texto) · ('bel', texto)
             ('interrompida', None) · ('fim_turno', None) · ('fim', motivo)
    """
    while s.viva:
        try:
            m = s.ws.recv()
        except Exception as erro:
            s.eventos.put(("fim", str(erro)[:120]))
            break
        if not m:
            continue
        if isinstance(m, bytes):
            m = m.decode()
        try:
            d = json.loads(m)
        except Exception:
            continue
        if "goAway" in d:
            s.eventos.put(("fim", "goAway"))
            break
        for c in d.get("toolCall", {}).get("functionCalls", []):
            s.eventos.put(("ferramenta", c))
        sc = d.get("serverContent", {})
        t = sc.get("inputTranscription", {}).get("text")
        if t:
            s.fala_lead += t
            s.eventos.put(("lead", t))
        t = sc.get("outputTranscription", {}).get("text")
        if t:
            s.fala_bel += t
            s.eventos.put(("bel", t))
        for p in sc.get("modelTurn", {}).get("parts", []):
            dados = p.get("inlineData", {}).get("data")
            if not dados:
                continue
            pcm = base64.b64decode(dados)
            convertido, s.estado_descida = audioop.ratecv(
                pcm, 2, 1, TAXA_SAIDA, TAXA_TELEFONE, s.estado_descida)
            s.eventos.put(("audio", convertido))
        # A pessoa falou por cima: o Google já parou de gerar. Quem toca o áudio
        # tem que descartar o que ainda está na fila, senão a Bel continua
        # falando sozinha por mais alguns segundos depois de ser interrompida.
        if sc.get("interrupted"):
            s.eventos.put(("interrompida", None))
        if sc.get("turnComplete"):
            s.eventos.put(("fim_turno", None))
    s.viva = False


def responder_ferramenta(s, chamada, resultado=None):
    """Confirma a execução da ferramenta. Sem isso o modelo trava esperando."""
    if not s.viva:
        return
    try:
        s.ws.send(json.dumps({"toolResponse": {"functionResponses": [{
            "id": chamada.get("id"),
            "name": chamada.get("name"),
            "response": resultado or {"ok": True}}]}}))
    except Exception:
        s.viva = False


def eventos(s, timeout=0.02):
    """Drena o que chegou até agora, sem bloquear a bomba de áudio."""
    saida = []
    fim = time.time() + timeout
    while time.time() < fim:
        try:
            saida.append(s.eventos.get(timeout=max(0.0, fim - time.time())))
        except queue_mod.Empty:
            break
    return saida


def texto_conversa(s):
    """A conversa como texto, no formato que o resto do sistema já entende."""
    return {"lead": s.fala_lead.strip(), "bel": s.fala_bel.strip()}


def fechar(s):
    s.viva = False
    try:
        s.ws.close()
    except Exception:
        pass
