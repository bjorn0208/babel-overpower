#!/usr/bin/env python3
"""IA Ligadora do Babel Central.

Duas engrenagens num só serviço (systemd):
1. ORIGINADOR — lê campanhas ativas no Supabase, respeita a janela de horário e
   cria call files no Asterisk para os números pendentes (até 2 simultâneas).
2. CONVERSADOR — servidor AudioSocket (127.0.0.1:9092). Quando a pessoa atende,
   o Asterisk conecta o áudio aqui e a IA conversa: Fish ASR (ouvidos) →
   LLM via OpenRouter (cérebro) → Fish TTS (voz), com barge-in (se a pessoa
   falar por cima, a IA cala e escuta — essencial para soar humana).
"""
import audioop
import json
import os
import queue as queue_mod
import random
import re
import socket
import struct
import subprocess
import threading
import time
import urllib.request
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone

import fish

# Smart Turn v3: detector semântico de fim de turno (opcional — cai em
# heurística de silêncio se o modelo/libs não estiverem instalados).
try:
    from smart_turn import turno_completo as _turno_completo
except Exception:
    _turno_completo = None

try:
    import deepgram
except Exception:
    deepgram = None

try:
    import piper_tts as _piper
except Exception:
    _piper = None

try:
    import cartesia as _cartesia
except Exception:
    _cartesia = None

try:
    import google_live
except Exception:
    google_live = None


ENV_PATH = "/opt/babel/babel.env"
OUTGOING = "/var/spool/asterisk/outgoing"
PORTA_AUDIOSOCKET = 9092
FUSO_BR = timezone(timedelta(hours=-3))
MAX_SIMULTANEAS = 2
# Teto de uma ligação da Live API. O motor próprio para sozinho quando o LLM
# manda encerrar; aqui, se a ferramenta nunca for chamada, sem teto a sessão
# (e a conta no Google) fica aberta até a operadora derrubar.
MAX_SEGUNDOS_LIVE = int(str(os.environ.get("LIVE_MAX_SEG", "420")).strip())

# ASR às vezes alucina caracteres CJK em ruído/eco/trechos curtos, mesmo com
# language="pt". Descartamos transcrições que não parecem português.
_CJK = re.compile(r"[　-ヿ㐀-鿿가-퟿＀-￯]")


def texto_plausivel(t):
    """True se o texto do ASR parece fala em português (e não alucinação CJK)."""
    t = (t or "").strip()
    if not t:
        return False
    if _CJK.search(t):
        return False
    letras = sum(c.isalpha() for c in t)
    # precisa ter alguma letra latina de verdade, não só símbolos/pontuação
    return letras >= 1 and letras >= len(t.replace(" ", "")) * 0.4


# Caixa postal / gravadora da operadora: detectar cedo e não gastar crédito
_CAIXA_POSTAL = re.compile(
    r"caixa postal|deixe (o |a |seu )?recado|ap[oó]s o (sinal|bipe)|"
    r"n[aã]o pode atender|est[aá] indispon[ií]vel|mensagem ap[oó]s|"
    r"grave (sua |a )?mensagem", re.I)

# Palavras que indicam frase inacabada (regra de endpointing por conteúdo,
# padrão de produção): "meu telefone é nove, oito..." não é fim de turno.
_CONTINUACAO = {"e", "mas", "aí", "então", "que", "de", "do", "da", "no", "na",
                "com", "pra", "para", "o", "a", "um", "uma", "meu", "minha",
                "tipo", "é", "seu", "sua", "os", "as", "dos", "das", "por",
                # pronomes e verbos que pedem complemento: "...e eu", "eu quero",
                # "a gente", "estou" — todos ficam pendurados no ar.
                "eu", "ele", "ela", "nós", "nos", "você", "voce", "vocês",
                "voces", "gente", "estou", "tô", "to", "vou", "quero",
                "preciso", "tenho", "queria", "gostaria", "posso",
                # verbos que ficam pendurados: "a gente está", "eu tenho",
                # "isso é", "a empresa faz" — todos pedem complemento.
                "está", "esta", "tá", "ta", "estão", "estao", "são", "sao",
                "foi", "vai", "quer", "pode", "consegue", "faz", "fica",
                "fazer", "ter", "usar", "trabalho", "trabalha",
                # oblíquos: "tu está me", "quero te" — o verbo ainda vem
                "me", "te", "se", "lhe", "vos"}
_NUM_FALADO = {"zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete",
               "oito", "nove", "meia", "dez", "onze", "doze", "vinte", "trinta",
               "quarenta", "cinquenta", "cem", "duzentos", "mil"}


def texto_incompleto(t):
    """True se o texto do ASR sugere que a pessoa AINDA NÃO terminou a frase."""
    t = (t or "").strip()
    if not t:
        return False
    if t[-1] == ",":
        return True
    palavras = t.split()
    ultima = t.lower().rstrip(".,;:!?…").split()[-1] if palavras else ""
    # Isto vem ANTES da regra do ponto final de propósito: o smart_format da
    # Deepgram pontua na pausa, no meio do raciocínio — "Bel, tu está me." e
    # "Ah então, é." vieram assim de uma ligação real. Palavra que pede
    # complemento vale mais que o ponto que o ASR chutou.
    if ultima in _CONTINUACAO or ultima in _NUM_FALADO or ultima.isdigit():
        return True
    if len(ultima) > 4 and ultima.endswith("ndo"):     # gerúndio pendurado
        return True
    if t[-1] in ".!?…":
        return False
    # Frase curta que não fechou com pontuação: "Sim, minha empresa" tem
    # sujeito e mais nada — a pessoa está no meio do raciocínio. A regra da
    # última palavra não pega isso ("empresa" é substantivo comum), e o
    # resultado era a Bel responder a meia ideia e ser cortada quando a
    # pessoa completava a frase. Esperar mais 600 ms sai muito mais barato.
    return 2 <= len(palavras) <= 4

# ---------- infra Supabase ----------

# ---------- som-ponte contextual ----------
# A ponte é o "hm...", "boa pergunta...", "entendo..." que a Bel solta no
# instante em que a pessoa para de falar, enquanto a resposta de verdade ainda
# está sendo gerada. Sorteada, ela soava aleatória: "boa pergunta..." depois de
# um "não tenho interesse". Aqui a categoria sai do que a pessoa acabou de
# dizer. É regex de propósito — perguntar ao LLM qual ponte usar custaria mais
# tempo do que a resposta inteira.
_P_PERGUNTA = re.compile(
    r"\?|\b(quanto|como|qual|quais|quando|onde|quem|por\s*que|porqu[eê]|"
    r"o\s+que|pra\s+que|serve|funciona)\b", re.I)
_P_OBJECAO = re.compile(
    r"\b(n[ãa]o|nunca|j[áa]\s+tenho|j[áa]\s+uso|caro|custa\s+muito|sem\s+interesse|"
    r"ocupad|depois|outro\s+momento|dif[íi]cil|complicado|no\s+momento)\b", re.I)
_P_POSITIVO = re.compile(
    r"\b(sim|claro|pode|podemos|legal|[óo]timo|bacana|massa|quero|vamos|"
    r"fechado|beleza|com\s+certeza|isso\s+mesmo|perfeito|show)\b", re.I)


# Vai junto do guia de etapa, que é a ÚLTIMA mensagem antes da resposta. A
# regra de tamanho também está no prompt principal, mas lá em cima ela se
# dilui: em ligação real o modelo entregava 28-33 palavras (11-13 s de fala)
# contra as ~10 que entrega em teste isolado. Repetir aqui é o que segura.
LEMBRETE_TURNO = (
    "\n\nANTES DE RESPONDER, LEMBRE: você está no TELEFONE, não escrevendo."
    "\n- NO MÁXIMO 2 frases curtas. Conte-as antes de mandar."
    "\n- Reaja ao que ele acabou de dizer, diga UMA coisa nova, faça UMA"
    " pergunta e PARE."
    "\n- Se você JÁ se apresentou nesta ligação, NÃO se apresente de novo."
    "\n- Nunca empilhe dois assuntos na mesma fala.")


def categoria_ponte(texto):
    """Categoria de som-ponte que conversa com a última fala do contato."""
    t = (texto or "").strip()
    if len(t) < 3:
        return "p_neutro"
    if _P_PERGUNTA.search(t):          # pergunta ganha de tudo: vem explicação
        return "p_pergunta"
    if _P_OBJECAO.search(t):
        return "p_objecao"
    if _P_POSITIVO.search(t):
        return "p_positivo"
    if len(t) > 45 or re.search(r"\d{2,}", t):   # contou algo, deu um dado
        return "p_info"
    return "p_neutro"


def carregar_env():
    env = {}
    with open(ENV_PATH) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k] = v
    return env

ENV = carregar_env()


def _cfg(chave, padrao):
    """Config do babel.env (o systemd NÃO exporta esse arquivo pro ambiente,
    quem lê é o carregar_env acima), com o ambiente do processo como reserva."""
    return ENV.get(chave, os.environ.get(chave, padrao))


# Provedores de LLM por ordem de preferência. Medido daqui em 25/07/2026 com o
# llama-3.3-70b: Groq deu 291 ms de TTFT contra 871 ms do roteamento automático
# — mesmo modelo, mesma resposta, 3x mais rápido. `allow_fallbacks` segue
# ligado: se o Groq estiver fora, o OpenRouter escolhe outro por latência.
# (SambaNova e DeepInfra não têm presença no Brasil — ~500 ms só de rede.)
PROVEDORES_RAPIDOS = _cfg("LLM_PROVEDORES", "Groq,Cerebras").split(",")

# Voz da IA. Medido em 25/07/2026, TTFA por frase com a sessão de streaming já
# aberta (que é como o motor sempre usou): Fish 170 ms de mediana, Piper local
# 116 ms. São 54 ms de diferença — não vale trocar a voz humana do Fish pela
# voz sintética do Piper por isso. O Piper fica de reserva para quando o Fish
# estiver fora do ar (aí 116 ms de voz robótica ganham de uma ligação muda).
# ATENÇÃO: os fillers em /opt/babel/fillers são gravados na voz do Fish. Se
# trocar para o Piper, regenere-os — senão a ligação alterna DUAS vozes.
# 04/08/2026: crédito de API da Fish esgotou (402 em HTTP e WS) — a Bel ficou
# muda. Voz padrão agora é a CARTESIA (sonic-3.5, voz Ana Paula pt-BR): TTFA
# ~193 ms medido da VPS em sessão persistente, PCM 8 kHz direto. VOZ_LOCAL=True
# aqui significa só "não depende da chave Fish" — os caminhos sem streaming
# usam voz.tts_slin8k, que na Cartesia é o endpoint HTTP /tts/bytes.
VOZ_MOTOR = str(_cfg("VOZ_MOTOR", "cartesia")).strip().lower()
if VOZ_MOTOR == "piper" and _piper is not None:
    voz, VOZ_LOCAL = _piper, True
elif VOZ_MOTOR == "cartesia" and _cartesia is not None:
    voz, VOZ_LOCAL = _cartesia, True
else:
    voz, VOZ_LOCAL = fish, False

# Resposta especulativa: gera a resposta enquanto a pessoa ainda fala e só
# aproveita se a fala final for idêntica à apostada. Custa um LLM a mais por
# aposta; com o llama-4-scout isso são centavos.
# Quem conduz a conversa: "proprio" (Deepgram + OpenRouter + voz) ou
# "google_live" (Live API do Gemini faz as três coisas). Trocar aqui e
# reiniciar o serviço é o suficiente para voltar atrás.
MOTOR_CONVERSA = str(_cfg("MOTOR_CONVERSA", "proprio")).strip().lower()

ESPEC_ON = str(_cfg("ESPECULACAO", "0")).strip() == "1"

# Nomes próprios que o ASR precisa acertar. O nova-3 preserva a grafia do
# keyterm, então é assim que "Theus" para de virar "Deus" e "Babel" de virar
# "Abel" — erro que já foi parar no CRM como nome do contato.
# Teto de palavras faladas por turno (~2,5 palavras/segundo ao telefone, então
# 30 ≈ 12 s). Corta só o monólogo: as falas boas da Bel ficam entre 8 e 24.
MAX_PALAVRAS_FALA = int(str(_cfg("MAX_PALAVRAS_FALA", "30")).strip())

KEYTERMS_BASE = [k.strip() for k in str(_cfg(
    "ASR_KEYTERMS",
    "Babel,Bel,Theus,Matheus,PABX,CRM,WhatsApp,ramal,discador,telefonia"
)).split(",") if k.strip()]

# Silêncio que confirma o fim do turno (com Deepgram). É o maior item fixo que
# sobra no caminho crítico — sai direto do tempo de resposta. Baixar acelera,
# mas aumenta a chance de cortar quem fala pausado.
FIM_SILENCIO_MS = int(str(_cfg("FIM_SILENCIO_MS", "300")).strip())

def sb(metodo, caminho, corpo=None, prefer=None):
    req = urllib.request.Request(
        ENV["SUPABASE_URL"] + "/rest/v1/" + caminho,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method=metodo,
        headers={
            "apikey": ENV["SUPABASE_SERVICE_ROLE"],
            "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_ROLE"],
            "Content-Type": "application/json",
            **({"Prefer": prefer} if prefer else {}),
        })
    with urllib.request.urlopen(req, timeout=15) as resp:
        dados = resp.read()
    return json.loads(dados) if dados else None

def chave_api(provedor):
    linhas = sb("GET", f"chaves_api?provedor=eq.{provedor}&ativa=eq.true"
                        "&select=chave&order=criado_em&limit=1")
    return linhas[0]["chave"] if linhas else None

def subir_gravacao(chamada_id, pcm_slin8k):
    """PCM slin 8 kHz da ligação → mp3 → Storage (bucket 'gravacoes', pasta ia/).
    Devolve o caminho salvo ou None. Falha silenciosa: gravação é secundária."""
    if not pcm_slin8k:
        return None
    try:
        p = subprocess.run(
            ["ffmpeg", "-loglevel", "quiet", "-f", "s16le", "-ar", "8000", "-ac", "1",
             "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "pipe:1"],
            input=bytes(pcm_slin8k), capture_output=True)
        mp3 = p.stdout
        if not mp3:
            return None
        caminho = f"ia/{chamada_id}.mp3"
        req = urllib.request.Request(
            ENV["SUPABASE_URL"] + "/storage/v1/object/gravacoes/" + caminho,
            data=mp3, method="POST",
            headers={
                "apikey": ENV["SUPABASE_SERVICE_ROLE"],
                "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_ROLE"],
                "Content-Type": "audio/mpeg",
                "x-upsert": "true",
            })
        urllib.request.urlopen(req, timeout=30).read()
        return caminho
    except Exception as erro:
        log(f"falha ao subir gravação {chamada_id[:8]}: {erro}")
        return None

def log(msg):
    print(f"[{datetime.now(FUSO_BR):%H:%M:%S}] {msg}", flush=True)

# ---------- ORIGINADOR ----------

ativas_agora = set()  # ids de ia_chamadas em andamento neste processo

def originador():
    while True:
        try:
            ciclo_originador()
        except Exception as erro:
            log(f"erro no originador: {erro}")
        time.sleep(20)

def ciclo_originador():
    hora = datetime.now(FUSO_BR).hour
    campanhas = sb("GET", "campanhas_ia?status=eq.ativa&select=*") or []
    # zumbis: 'ligando' há mais de 3 min sem conclusão = não atendeu
    limite = (datetime.now(timezone.utc) - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    zumbis = sb("GET", f"ia_chamadas?status=eq.ligando&atualizado_em=lt.{limite}"
                        "&select=id,tentativas,campanha_id") or []
    for z in zumbis:
        if z["id"] in ativas_agora:
            continue
        camp = next((c for c in campanhas if c["id"] == z["campanha_id"]), None)
        maximo = camp["max_tentativas"] if camp else 2
        novo = "pendente" if z["tentativas"] + 1 < maximo else "sem_resposta"
        sb("PATCH", f"ia_chamadas?id=eq.{z['id']}",
           {"status": novo, "tentativas": z["tentativas"] + 1,
            "atualizado_em": datetime.now(timezone.utc).isoformat()})

    # ligações de TESTE (número = ramal interno de 4 dígitos): disparam sempre,
    # independente de janela de horário ou campanha pausada — é o admin testando
    testes = sb("GET", "ia_chamadas?status=eq.pendente&numero=like.____"
                        "&select=id,numero&limit=2") or []
    for p in testes:
        discar(p)

    for camp in campanhas:
        if not (camp["hora_inicio"] <= hora < camp["hora_fim"]):
            continue
        ligando = sb("GET", "ia_chamadas?status=eq.ligando&select=id") or []
        vagas = MAX_SIMULTANEAS - len(ligando)
        if vagas <= 0:
            return
        agora_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        pendentes = sb("GET", f"ia_chamadas?campanha_id=eq.{camp['id']}"
                              f"&status=eq.pendente&select=id,numero"
                              f"&or=(nao_antes.is.null,nao_antes.lte.{agora_utc})"
                              f"&order=criado_em&limit={vagas}") or []
        for p in pendentes:
            discar(p)

def discar(chamada):
    numero = "".join(ch for ch in chamada["numero"] if ch.isdigit())
    if len(numero) < 3:   # linha de SIMULADOR ('sim') ou lixo — nunca discar
        sb("PATCH", f"ia_chamadas?id=eq.{chamada['id']}",
           {"status": "falhou", "atualizado_em": datetime.now(timezone.utc).isoformat()})
        return
    if len(numero) <= 5:
        canal = f"PJSIP/{numero}"          # ramal interno — ligação de TESTE
    else:
        if len(numero) <= 11:
            numero = "55" + numero.lstrip("0")
        canal = f"PJSIP/{numero}@brdid"
    sb("PATCH", f"ia_chamadas?id=eq.{chamada['id']}",
       {"status": "ligando", "atualizado_em": datetime.now(timezone.utc).isoformat()})
    conteudo = (
        f"Channel: {canal}\n"
        "CallerID: 1152863430\n"
        "MaxRetries: 0\n"
        "WaitTime: 55\n"
        "Context: ia-ligadora\n"
        "Extension: s\n"
        "Priority: 1\n"
        f"Setvar: IA_CHAMADA_ID={chamada['id']}\n"
    )
    tmp = f"/tmp/ia-{chamada['id']}.call"
    with open(tmp, "w") as f:
        f.write(conteudo)
    os.rename(tmp, f"{OUTGOING}/ia-{chamada['id']}.call")
    log(f"discando {numero} (chamada {chamada['id'][:8]})")

# ---------- protocolo AudioSocket ----------
# TLV: 1 byte tipo + 2 bytes tamanho (big endian) + payload
# 0x00 fim · 0x01 uuid · 0x10 áudio slin 8kHz (320 B = 20 ms) · 0xff erro

def ler_pacote(conn):
    cab = conn.recv(3)
    if len(cab) < 3:
        return None, None
    tipo, tam = cab[0], struct.unpack(">H", cab[1:3])[0]
    dados = b""
    while len(dados) < tam:
        parte = conn.recv(tam - len(dados))
        if not parte:
            return None, None
        dados += parte
    return tipo, dados

def quadros_20ms(pcm):
    """Divide PCM 8k em quadros de 320 bytes (20 ms), completando o último."""
    for i in range(0, len(pcm), 320):
        quadro = pcm[i:i + 320]
        if len(quadro) < 320:
            quadro += b"\x00" * (320 - len(quadro))
        yield quadro


# ---------- áudio fixo: fillers pré-gravados na voz da Bel + ruído de linha ----------
# Fillers por categoria (gerados uma vez por gera_fillers.py, guardados em disco):
#   curto    → "uhum", "certo"…    — reconhecimento após fala longa do cliente
#   pensando → "é…", "olha…"…      — cobre o processamento após pergunta difícil
#   reacao   → "ah, sim!"…         — reação viva
# Ruído de linha: loop contínuo bem baixo que mata o "silêncio digital" —
# um dos maiores delatores de IA em telefonia (a Bland usa por padrão).
FILLERS_DIR = "/opt/babel/fillers"
RUIDO_PATH = "/opt/babel/ruido_linha.sln"
FILLERS = {}
RUIDO = b""


def carregar_audio_fixo():
    global RUIDO
    try:
        with open(RUIDO_PATH, "rb") as f:
            RUIDO = f.read()
    except Exception:
        RUIDO = b""
    try:
        for nome in sorted(os.listdir(FILLERS_DIR)):
            if nome.endswith(".sln") and "__" in nome:
                with open(os.path.join(FILLERS_DIR, nome), "rb") as f:
                    FILLERS.setdefault(nome.split("__")[0], []).append(f.read())
    except Exception:
        pass


carregar_audio_fixo()

# ---------- CONVERSADOR ----------

def servidor_audiosocket():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", PORTA_AUDIOSOCKET))
    srv.listen(8)
    log(f"AudioSocket ouvindo em 127.0.0.1:{PORTA_AUDIOSOCKET}")
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=atender, args=(conn,), daemon=True).start()

def atender(conn):
    chamada_id = None
    try:
        tipo, dados = ler_pacote(conn)
        if tipo != 0x01:
            return
        chamada_id = (str(uuid_mod.UUID(bytes=dados)) if len(dados) == 16
                      else dados.decode().strip())
        ativas_agora.add(chamada_id)
        if MOTOR_CONVERSA == "google_live" and google_live is not None:
            conversar_google_live(conn, chamada_id)
        else:
            conversar(conn, chamada_id)
    except Exception as erro:
        log(f"erro na conversa {chamada_id}: {erro}")
        if chamada_id:
            try:
                sb("PATCH", f"ia_chamadas?id=eq.{chamada_id}",
                   {"status": "falhou",
                    "atualizado_em": datetime.now(timezone.utc).isoformat()})
            except Exception:
                pass
    finally:
        ativas_agora.discard(chamada_id)
        try:
            conn.close()
        except Exception:
            pass

def conversar(conn, chamada_id):
    inicio = time.time()
    reg = sb("GET", f"ia_chamadas?id=eq.{chamada_id}"
                    "&select=*,campanhas_ia(*),leads(empresa,cidade,nicho)")
    if not reg:
        return
    reg = reg[0]
    camp = reg["campanhas_ia"]
    lead = reg.get("leads") or {}
    chave_fish = chave_api("fish_audio")
    chave_llm = chave_api("openrouter")
    # Com voz local (Piper) a chave do Fish deixa de ser obrigatória: ela só
    # serve ao ASR de reserva, que já tem o Deepgram na frente.
    if not chave_llm or (not chave_fish and not VOZ_LOCAL):
        log("faltam chaves de voz/openrouter — encerrando chamada")
        conn.sendall(b"\x00\x00\x00")
        return

    # ---- configuração avançada da campanha (tela Gestão→IA→Ajustes) ----
    cfg = camp.get("config") or {}

    def c_num(chave, padrao):
        try:
            return float(cfg.get(chave))
        except (TypeError, ValueError):
            return float(padrao)

    def c_bool(chave, padrao):
        v = cfg.get(chave)
        return bool(v) if isinstance(v, bool) else padrao

    piso_s = c_num("piso_ms", 300) / 1000
    jitter_s = c_num("jitter_ms", 120) / 1000
    modo_turno = cfg.get("fim_turno") or "semantico"     # semantico | fixo
    silencio_fixo = int(c_num("silencio_fixo_ms", 850))
    teto_pausa = int(c_num("teto_pausa_ms", 2500))
    # 0,5 era permissivo demais: medido em ligação real, o Smart Turn devolveu
    # 0,58 / 0,63 / 0,82 / 0,88 / 0,89 para frases claramente inacabadas
    # ("Bel, tu está me...", "a gente está") — tudo acima de 0,5, ou seja,
    # ele carimbava QUALQUER pausa como fim de turno e a Bel entrava por cima.
    # Em 0,9 só passam os 0,95+, que na amostra eram fim de frase de verdade.
    limiar_turno = c_num("limiar_turno", 0.9)
    interromper_ms = int(c_num("interromper_ms", 450))
    limiar_voz_cima = int(c_num("limiar_voz", 1500))
    fillers_on = c_bool("fillers_ativos", True)
    uhum_longa = c_bool("uhum_fala_longa", True)
    chance_pensando = c_num("chance_pensando", 0.30)
    ruido_on = c_bool("ruido_ativo", True)
    temperatura = c_num("temperatura", 0.7)
    velocidade = c_num("voz_velocidade", 1.0)
    max_turnos = int(c_num("max_turnos", 20))
    ponte_resposta = c_bool("ponte_resposta", True)   # som-ponte p/ percebido <400ms
    transferir_ramal = str(cfg.get("transferir_ramal") or "").strip()
    recontato_horas = int(c_num("recontato_horas", 72))
    wpp_followup = c_bool("wpp_followup", False)
    wpp_template = str(cfg.get("wpp_template") or "").strip()

    # OUVIDOS: Deepgram streaming pt-BR (transcreve enquanto a pessoa fala e
    # detecta o fim do turno). Se indisponível, cai no Fish ASR (batch).
    chave_deepgram = chave_api("deepgram") if deepgram else None
    dg = None
    if chave_deepgram:
        try:
            # keyterms: base + quem estamos ligando + a empresa do lead
            _kt = list(KEYTERMS_BASE)
            for _extra in (reg.get("contato_nome"), (lead or {}).get("empresa")):
                if _extra:
                    _kt += [p for p in str(_extra).split() if len(p) > 2]
            # endpointing 300ms: recomendação da Deepgram para agentes de voz
            # (o 850 herdado do VAD atrasava o is_final e, com ele, o parcial
            # de que o barge-in depende).
            dg = deepgram.SessaoDeepgram(chave_deepgram,
                                         endpointing_ms=300,
                                         utterance_end_ms=1000,
                                         keyterms=sorted(set(_kt)))
        except Exception as erro:
            log(f"deepgram indisponível ({erro}) — Fish ASR")
            dg = None

    def alimentar_dg(dados):
        if dg is not None:
            dg.alimentar(dados)

    # RAG ESPECULATIVO: a busca na base leva ~500-700ms. Em vez de rodar depois
    # que a pessoa termina (no caminho crítico), rodamos ENQUANTO ela fala, sobre
    # a transcrição parcial da Deepgram. Quando ela para, o resultado já existe.
    rag_caixa = {"texto": "", "achados": [], "rodando": False}

    def rag_especulativo(texto):
        texto = (texto or "").strip()
        if len(texto) < 6 or rag_caixa["rodando"] or texto == rag_caixa["texto"]:
            return
        rag_caixa["rodando"] = True

        def _rodar():
            try:
                rag_caixa["achados"] = buscar_conhecimento(texto, camp["id"])
                rag_caixa["texto"] = texto
            except Exception:
                pass
            rag_caixa["rodando"] = False

        threading.Thread(target=_rodar, daemon=True).start()

    def rag_do_turno(texto):
        """Usa o resultado especulativo se foi feito pra fala parecida; senão
        calcula na hora (fallback)."""
        esp = rag_caixa["texto"]
        if esp and (esp in texto or texto in esp or esp[:12] == texto[:12]):
            return rag_caixa["achados"]
        try:
            return buscar_conhecimento(texto, camp["id"])
        except Exception:
            return []

    def drenar_dg():
        if dg is not None:
            while dg.proximo_turno(0):
                pass

    empresa = lead.get("empresa") or "sua empresa"   # "pela sua empresa" (nunca "pela a empresa")
    contato_nome = (reg.get("contato_nome") or "").strip() or None
    briefing = (reg.get("briefing") or "").strip() or None
    abertura = (camp["abertura"].replace("{empresa}", empresa)
                .replace("{nome}", contato_nome or "o responsável"))
    fluxo = camp.get("fluxo") or FLUXO_PADRAO
    etapas = {e["id"]: e for e in fluxo}
    etapa_atual = fluxo[0]["id"]
    resultado_final = "em_andamento"
    transcricao = []
    capturado = {}
    metricas = []            # timing por turno (p/ análise na aba Testar)
    gravacao = bytearray()   # PCM slin 8k de toda a ligação (p/ ouvir depois)
    historico = [{"role": "system",
                  "content": montar_prompt(camp, lead, contato_nome, briefing,
                                           bool(transferir_ramal))}]

    estado = {"buffer": b"", "falando_ia": False, "interrompida": False,
              "desligou": False, "fim": False, "ultimo_filler": None,
              "texto_dg": None}

    def salvar_parcial():
        """Transcrição/etapa/métricas AO VIVO — a aba Testar acompanha em tempo real."""
        try:
            sb("PATCH", f"ia_chamadas?id=eq.{chamada_id}", {
                "transcricao": "\n".join(transcricao),
                "etapa_atual": etapas.get(etapa_atual, {}).get("nome", etapa_atual),
                "capturado": {**capturado, "_resultado": resultado_final},
                "metricas": metricas,
                "atualizado_em": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass
    trava_envio = threading.Lock()
    ruido_pos = [0]

    def com_ruido(quadro):
        """Mixa o ruído de linha no quadro (mantém a linha 'viva')."""
        if not RUIDO or not ruido_on:
            return quadro
        p = ruido_pos[0]
        if p + 320 > len(RUIDO):
            p = 0
        ruido_pos[0] = p + 320
        try:
            return audioop.add(quadro, RUIDO[p:p + 320], 2)
        except Exception:
            return quadro

    def enviar_quadro(quadro):
        with trava_envio:
            conn.sendall(b"\x10" + struct.pack(">H", 320) + com_ruido(quadro))

    def bomba_ruido():
        """Enquanto a Bel não fala, mantém o ruído de linha no ar — sem isso,
        o silêncio digital absoluto durante o 'pensamento' denuncia IA."""
        proximo = time.time()
        while not estado["fim"]:
            proximo += 0.02
            atraso = proximo - time.time()
            if atraso > 0:
                time.sleep(atraso)
            else:
                proximo = time.time()
            if estado["falando_ia"] or not RUIDO:
                continue
            try:
                enviar_quadro(b"\x00" * 320)
            except Exception:
                return

    if RUIDO and ruido_on:
        threading.Thread(target=bomba_ruido, daemon=True).start()

    def tocar_bargein(fonte, piso_ate=0.0):
        """Toca PCM (bytes ou iterável de chunks) no ritmo do relógio.
        Barge-in em 2 estágios (padrão de produção): rajada curta de voz
        (<300 ms — um "uhum" do cliente) NÃO interrompe; fala sustentada
        (~550 ms) interrompe e o áudio dela fica no buffer.
        falando_ia só liga no 1º quadro real — antes disso o ruído de linha
        continua no ar (silêncio digital durante o "pensamento" denuncia IA)."""
        if isinstance(fonte, (bytes, bytearray)):
            fonte = [bytes(fonte)]
        cont = {"voz": 0, "quieto": 0}
        primeiro = True
        resto = b""
        proximo = time.time()
        for chunk in fonte:
            if estado["interrompida"] or estado["desligou"]:
                break
            dados_chunk = resto + bytes(chunk)
            corte = len(dados_chunk) - (len(dados_chunk) % 320)
            resto = dados_chunk[corte:]
            for quadro in quadros_20ms(dados_chunk[:corte]):
                if primeiro:
                    # piso social + jitter: nunca responder "instantâneo demais"
                    if piso_ate:
                        espera = piso_ate - time.time()
                        if espera > 0:
                            time.sleep(espera)
                    estado["falando_ia"] = True
                    primeiro = False
                    proximo = time.time()
                try:
                    enviar_quadro(quadro)
                except OSError:
                    estado["desligou"] = True
                    break
                gravacao.extend(quadro)
                proximo += 0.02
                atraso = proximo - time.time()
                if atraso > 0:
                    time.sleep(atraso)
                escutar_por_cima(cont)
                if estado["interrompida"] or estado["desligou"]:
                    break
        if resto and not estado["interrompida"] and not estado["desligou"]:
            try:
                enviar_quadro(resto + b"\x00" * (320 - len(resto)))
                gravacao.extend(resto)
            except OSError:
                estado["desligou"] = True

    def escutar_por_cima(cont):
        """Barge-in tolerante a sílabas: a fala humana tem vales de energia a
        cada sílaba — só desistimos da rajada após 160 ms contínuos de quiet.
        Fala sustentada (~450 ms acumulados) interrompe a Bel de verdade."""
        conn.setblocking(False)
        try:
            while True:
                tipo, dados = ler_pacote_nb(conn)
                if tipo is None:
                    break
                if tipo == 0x00:
                    estado["desligou"] = True
                elif tipo == 0x10:
                    alimentar_dg(dados)
                    if audioop.rms(dados, 2) > limiar_voz_cima:
                        cont["voz"] += 20
                        cont["quieto"] = 0
                        estado["buffer"] += dados
                    else:
                        cont["quieto"] += 20
                        if cont["quieto"] >= 160:
                            if cont["voz"] < 300:
                                cont["voz"] = 0        # era só um "uhum"/ruído
                                estado["buffer"] = b""
                            else:
                                cont["voz"] = max(0, cont["voz"] - 40)
                    if cont["voz"] >= interromper_ms and not estado["interrompida"]:
                        # só corta a Bel se a Deepgram confirmar FALA de verdade
                        # (não ruído). Sem dg, cai no RMS puro.
                        fala_real = (dg is None) or dg.falando or bool(dg.parcial)
                        if fala_real:
                            estado["interrompida"] = True
                            log(f"BARGE-IN voz={cont['voz']}ms "
                                f"dg_falando={getattr(dg,'falando',None)} "
                                f"parcial={getattr(dg,'parcial','')[:40]!r}")
        except Exception:
            pass
        finally:
            conn.setblocking(True)

    # ---- SESSÃO DE VOZ PERSISTENTE (uma por ligação) + tocador contínuo ----
    # Uma única conexão WS de TTS a ligação inteira: cada turno só manda texto
    # + flush — zero handshake por resposta (~0,5 s a menos em cada turno).
    tts_caixa = {"ws": None, "fila": None}
    player = {"frames": 0, "ultimo_frame": 0.0, "piso_ate": 0.0}

    def tts_garantir():
        """Abre (ou reabre) a sessão de voz. Devolve True se pronta."""
        if tts_caixa["ws"] is not None:
            return True
        try:
            ws = voz.tts_stream_abrir(chave_fish, camp.get("voz_id"), speed=velocidade)
        except Exception as erro:
            log(f"sessão tts indisponível: {erro}")
            return False
        fila = queue_mod.Queue()

        def receptor():
            for c in voz.tts_stream_chunks(ws):
                fila.put(c)
            fila.put(None)          # sessão morreu — o turno seguinte reabre

        threading.Thread(target=receptor, daemon=True).start()
        tts_caixa["ws"] = ws
        tts_caixa["fila"] = fila
        return True

    def tts_texto(frase):
        """Manda uma frase pra sessão. Reabre uma vez se ela tiver caído."""
        for _ in (1, 2):
            if not tts_garantir():
                return False
            try:
                voz.tts_stream_texto(tts_caixa["ws"], frase)
                return True
            except Exception:
                tts_caixa["ws"] = None      # caiu — tenta reabrir
        return False

    def tts_flush():
        try:
            if tts_caixa["ws"] is not None:
                voz.tts_stream_flush(tts_caixa["ws"])
        except Exception:
            tts_caixa["ws"] = None

    def tts_drenar_fila():
        """Joga fora áudio de turno anterior (ex.: resto após interrupção)."""
        fila = tts_caixa["fila"]
        if fila is None:
            return
        try:
            while True:
                fila.get_nowait()
        except queue_mod.Empty:
            pass

    def tocador_continuo():
        """Thread única que toca TUDO que a sessão de voz produzir, a ligação
        inteira. Enquanto toca, escuta a linha (barge-in); interrompida →
        descarta o resto do turno. Nunca fica surda."""
        cont = {"voz": 0, "quieto": 0}
        resto = b""
        proximo = None
        while not estado["fim"]:
            fila = tts_caixa["fila"]
            if fila is None:
                time.sleep(0.05)
                continue
            if estado["interrompida"] or estado["desligou"]:
                resto = b""
                tts_drenar_fila()
                estado["falando_ia"] = False
                proximo = None
                time.sleep(0.03)
                continue
            if len(resto) >= 320:
                quadro, resto = resto[:320], resto[320:]
                if proximo is None:
                    # piso social: nunca responder "instantâneo demais"
                    while player["piso_ate"] and time.time() < player["piso_ate"]:
                        escutar_por_cima(cont)
                        if estado["interrompida"] or estado["desligou"]:
                            break
                        time.sleep(0.02)
                    estado["falando_ia"] = True
                    proximo = time.time()
                if estado["interrompida"] or estado["desligou"]:
                    continue
                try:
                    enviar_quadro(quadro)
                except OSError:
                    estado["desligou"] = True
                    continue
                gravacao.extend(quadro)
                player["frames"] += 1
                player["ultimo_frame"] = time.time()
                proximo += 0.02
                atraso = proximo - time.time()
                if atraso > 0:
                    time.sleep(atraso)
                escutar_por_cima(cont)
            else:
                try:
                    chunk = fila.get(timeout=0.04)
                except queue_mod.Empty:
                    if proximo is not None:      # pausa entre frases/turnos
                        estado["falando_ia"] = False
                        proximo = None
                    if estado["falando_ia"]:
                        escutar_por_cima(cont)
                    continue
                if chunk is None:
                    tts_caixa["ws"] = None       # sessão morreu
                    tts_caixa["fila"] = None
                    continue
                resto += chunk

    threading.Thread(target=tocador_continuo, daemon=True).start()

    def esperar_fala_terminar(frames_antes, t0, timeout=75.0):
        """Espera a Bel COMEÇAR a falar (áudio do turno chegar) e TERMINAR
        (450 ms sem quadro novo e fila vazia). Devolve (falou, t1)."""
        prazo = time.time() + timeout
        t1 = None
        # 1) começar: até 6 s pro primeiro quadro do turno
        inicio_espera = time.time()
        while time.time() - inicio_espera < 6.0:
            if estado["interrompida"] or estado["desligou"]:
                return player["frames"] > frames_antes, t1
            if player["frames"] > frames_antes:
                t1 = time.time() - t0
                break
            time.sleep(0.02)
        else:
            return False, None
        # 2) terminar
        while time.time() < prazo:
            if estado["interrompida"] or estado["desligou"]:
                return True, t1
            fila = tts_caixa["fila"]
            vazia = fila is None or fila.empty()
            if vazia and time.time() - player["ultimo_frame"] > 0.45:
                return True, t1
            time.sleep(0.03)
        return True, t1

    def tocar_filler(categoria):
        """Toca um filler pré-gravado da voz da Bel (rotaciona, nunca repete)."""
        opcoes = FILLERS.get(categoria) or []
        if not opcoes:
            return False
        escolha = random.choice([o for o in opcoes if o is not estado["ultimo_filler"]]
                                or opcoes)
        estado["ultimo_filler"] = escolha
        estado["falando_ia"] = True
        try:
            proximo = time.time()
            for quadro in quadros_20ms(bytes(escolha)):
                enviar_quadro(quadro)
                gravacao.extend(quadro)
                proximo += 0.02
                atraso = proximo - time.time()
                if atraso > 0:
                    time.sleep(atraso)
        except OSError:
            estado["desligou"] = True
        estado["falando_ia"] = False
        return True

    def drenar_pos_fala():
        # Se a pessoa cortou a IA, o buffer já tem a fala dela — vai direto
        # escutar, sem dreno (não há eco a limpar, ela está no ar).
        if estado["interrompida"]:
            estado["falando_ia"] = False
            return
        # Dreno curto (150 ms) do rabo de eco da própria voz. MAS: se a pessoa
        # já começou a responder (voz alta e sustentada), guardamos esse áudio
        # no buffer pra não perder o começo da resposta dela.
        fim_dreno = time.time() + 0.15
        voz_seguida = 0
        inicio_fala = b""
        conn.setblocking(False)
        try:
            while time.time() < fim_dreno:
                t, d = ler_pacote_nb(conn)
                if t is None:
                    time.sleep(0.01)
                    continue
                if t == 0x10 and audioop.rms(d, 2) > 1500:
                    voz_seguida += 20
                    if voz_seguida >= 100:      # ≥100 ms contínuos = fala real
                        inicio_fala += d
                else:
                    voz_seguida = max(0, voz_seguida - 20)
        except Exception:
            pass
        finally:
            conn.setblocking(True)
        estado["buffer"] = inicio_fala
        estado["falando_ia"] = False

    def falar(texto):
        estado["interrompida"] = False
        transcricao.append("IA: " + texto)
        try:
            if VOZ_LOCAL:
                # direto pra slin 8k: sem wav intermediário, sem ffmpeg
                pcm = voz.tts_slin8k(texto, camp.get("voz_id"), velocidade)
            else:
                pcm = fish.wav_para_slin8k(
                    fish.tts(chave_fish, texto, camp.get("voz_id"), velocidade))
        except Exception as erro:
            log(f"tts falhou: {erro}")
            return
        tocar_bargein(pcm)     # gravação acontece dentro do tocador
        drenar_pos_fala()

    def ler_pacote_nb(c):
        try:
            cab = c.recv(3)
        except BlockingIOError:
            return None, None
        if len(cab) < 3:
            return None, None
        tipo, tam = cab[0], struct.unpack(">H", cab[1:3])[0]
        dados = b""
        c.setblocking(True)
        while len(dados) < tam:
            parte = c.recv(tam - len(dados))
            if not parte:
                break
            dados += parte
        c.setblocking(False)
        return tipo, dados

    # ---- RESPOSTA ESPECULATIVA (mesma ideia do rag_especulativo, um passo além)
    # O que sobra de caro no turno é o LLM (~290 ms de TTFT via Groq) mais a
    # síntese (~120 ms). Aqui apostamos: quando a transcrição parcial PARA de
    # mudar, geramos a resposta e já sintetizamos o áudio — tudo enquanto o VAD
    # ainda espera o silêncio confirmar. Se a aposta bater, a Bel responde na
    # hora; se a pessoa emendou mais alguma coisa, jogamos fora e seguimos o
    # caminho normal. NUNCA falamos uma resposta feita para outra frase.
    espec = {"base": None, "frases": [], "resposta": None,
             "txt_visto": "", "visto_em": 0.0, "rodando": False,
             "acertos": 0, "tentativas": 0}

    def montar_mensagens_turno(texto, incluir_user):
        """Mesmo contexto que o turno real monta (histórico + etapa + RAG)."""
        msgs = list(historico)
        if incluir_user:
            msgs.append({"role": "user", "content": texto})
        et = etapas.get(etapa_atual, fluxo[0])
        guia = f'ETAPA ATUAL: "{et["nome"]}" (id={etapa_atual}). Meta agora: {et["meta"]}.'
        achados = rag_do_turno(texto)
        if achados:
            guia += ("\nBASE DE CONHECIMENTO — responda fatos SOMENTE com base nisto:\n"
                     + "\n".join(f"- {a['resposta']}" for a in achados))
        msgs.append({"role": "system", "content": guia + LEMBRETE_TURNO})
        return msgs

    def _normalizar(s):
        return re.sub(r"[^\w\s]", "", (s or "").lower()).strip()

    def llm_especulativo(parcial):
        """Dispara a aposta quando o parcial estabiliza por ~220 ms."""
        if not ESPEC_ON or estado["falando_ia"] or estado["desligou"]:
            return
        parcial = (parcial or "").strip()
        # frase curta demais ou visivelmente cortada ("meu número é...") não vale
        # apostar: a pessoa quase certamente vai continuar falando.
        if len(parcial) < 18 or texto_incompleto(parcial):
            return
        agora = time.time()
        if parcial != espec["txt_visto"]:
            espec["txt_visto"] = parcial
            espec["visto_em"] = agora
            return
        if agora - espec["visto_em"] < 0.22:
            return
        if espec["rodando"] or espec["base"] == parcial:
            return
        espec["rodando"] = True
        espec["base"] = parcial
        espec["frases"] = []
        espec["tentativas"] += 1

        def _rodar(txt):
            # Só o texto: a voz local sintetiza em ~120 ms, não compensa
            # pré-gerar áudio que provavelmente será descartado.
            try:
                msgs = montar_mensagens_turno(txt, True)
                frases = []
                resp = cerebro_stream(chave_llm, camp["modelo_llm"], msgs,
                                      lambda f: frases.append(f), temperatura)
                if espec["base"] == txt and frases:   # ninguém invalidou no meio
                    espec["frases"] = frases
                    espec["resposta"] = resp
            except Exception:
                espec["base"] = None
            finally:
                espec["rodando"] = False

        threading.Thread(target=_rodar, args=(parcial,), daemon=True).start()

    def espec_serve(texto):
        """Só aproveita se a fala final for EXATAMENTE a que foi apostada.
        Conservador de propósito: responder à metade da frase é pior do que
        esperar os 400 ms."""
        if not ESPEC_ON or not espec["base"] or not espec["frases"]:
            return False
        return _normalizar(espec["base"]) == _normalizar(texto)

    def espec_limpar():
        espec["base"] = None
        espec["frases"] = []
        espec["resposta"] = None
        espec["txt_visto"] = ""

    def escutar(max_seg=12.0, buffer_proprio=None):
        """Junta a fala da pessoa e decide QUANDO ela terminou.

        Com Smart Turn (semântico): checa a partir de 240 ms de pausa se a
        frase está COMPLETA — completa responde já; incompleta ("meu telefone
        é...") espera até 2,5 s. Sem o modelo: fallback nos 850 ms fixos.
        Fala curta (>=200 ms) vale: "oi", "sim" e "alô" SÃO respostas."""
        pcm = estado["buffer"] if buffer_proprio is None else buffer_proprio
        estado["buffer"] = b""
        estado["texto_dg"] = None
        silencio_ms = 0
        voz_ms = 0
        comecou = len(pcm) > 0
        proxima_checagem = 180
        prazo = time.time() + max_seg
        # Endpoint AGRESSIVO com Deepgram (300ms): a transcrição já está pronta
        # em tempo real, então não esperamos silêncio pra "ouvir" — só pra ter
        # certeza que a pessoa terminou. Se a frase parece incompleta, espera+.
        fim_silencio = FIM_SILENCIO_MS if dg is not None else silencio_fixo

        def _fechar(p):
            # nosso VAD decidiu o fim → pega o texto JÁ transcrito da Deepgram.
            # Se a transcrição ainda não chegou (VAD foi mais rápido que a rede),
            # dá até 300ms pra ela vir — evita cair no Fish à toa.
            if dg is not None:
                alvo = time.time() + 0.3
                while time.time() < alvo and not (dg.parcial or dg._acc):
                    time.sleep(0.02)
                estado["texto_dg"] = dg.pegar_turno()
            return p

        while time.time() < prazo:
            tipo, dados = ler_pacote(conn)
            if tipo is None or tipo == 0x00:
                estado["desligou"] = True
                return _fechar(pcm) if voz_ms >= 200 else None
            if tipo != 0x10:
                continue
            alimentar_dg(dados)
            if dg is not None and dg.parcial:
                rag_especulativo(dg.parcial)   # busca a base ENQUANTO a pessoa fala
                llm_especulativo(dg.parcial)   # e já ensaia a resposta inteira
            energia = audioop.rms(dados, 2)
            if energia > 700:
                comecou = True
                voz_ms += 20
                silencio_ms = 0
                proxima_checagem = 180
                pcm += dados
            elif comecou:
                silencio_ms += 20
                pcm += dados
                if voz_ms < 200:
                    continue
                # Smart Turn (semântico) quando NÃO temos Deepgram
                if dg is None and modo_turno == "semantico" and _turno_completo is not None and silencio_ms >= proxima_checagem:
                    completo, prob = _turno_completo(pcm, limiar_turno)
                    if completo:
                        return _fechar(pcm)
                    if completo is None and silencio_ms >= silencio_fixo:
                        return _fechar(pcm)
                    proxima_checagem = silencio_ms + 320
                elif silencio_ms >= fim_silencio:
                    # Com Deepgram, DOIS porteiros antes de dar o turno por
                    # encerrado — senão uma pausa de quem está pensando no meio
                    # da frase vira resposta a meia ideia ("time de vendas e
                    # preciso" → responde → a pessoa completa → responde de novo).
                    # 1) heurística textual: "meu número é nove..." está cortado
                    if dg is not None and silencio_ms < 850 and texto_incompleto(dg.parcial):
                        pass
                    # 2) Smart Turn: decide SEMANTICAMENTE se a frase fechou.
                    #    Custa 43 ms nesta CPU e pega o que a regra textual não
                    #    pega. Reconsulta espaçada pra não rodar a cada 20 ms.
                    elif (dg is not None and modo_turno == "semantico"
                          and _turno_completo is not None
                          and silencio_ms < teto_pausa):
                        if silencio_ms >= proxima_checagem:
                            completo, _prob = _turno_completo(pcm, limiar_turno)
                            # Sem NENHUM texto transcrito não há turno a fechar:
                            # o modelo já devolveu completo=True com parcial=''
                            # e a Bel entrou falando sozinha.
                            if not (dg.parcial or dg._acc):
                                completo = False
                            log(f"turno? completo={completo} p={_prob if _prob is None else round(_prob,2)} "
                                f"sil={silencio_ms}ms parcial={(dg.parcial or '')[:44]!r}")
                            if completo is False:      # None = modelo indisponível
                                proxima_checagem = silencio_ms + 240
                            else:
                                return _fechar(pcm)
                    else:
                        return _fechar(pcm)
                if silencio_ms >= teto_pausa:
                    return _fechar(pcm)
        return _fechar(pcm) if (voz_ms >= 200) else None

    # ---- diálogo ----
    # OSError (broken pipe etc.) = o outro lado desligou → fim normal, salva tudo
    try:
        # Abertura humana: gera o áudio EM PARALELO enquanto espera o "alô"
        # da pessoa — ninguém liga e sai falando em cima do atendimento.
        abertura_caixa = {}

        def gerar_abertura():
            try:
                if VOZ_LOCAL:
                    abertura_caixa["pcm"] = voz.tts_slin8k(
                        abertura, camp.get("voz_id"), velocidade)
                else:
                    abertura_caixa["pcm"] = fish.wav_para_slin8k(
                        fish.tts(chave_fish, abertura, camp.get("voz_id"), velocidade))
            except Exception as erro:
                abertura_caixa["erro"] = erro

        th_ab = threading.Thread(target=gerar_abertura, daemon=True)
        th_ab.start()
        threading.Thread(target=tts_garantir, daemon=True).start()  # aquece a sessão
        escutar(max_seg=2.5)          # espera o "alô" (conteúdo não importa)
        estado["buffer"] = b""
        drenar_dg()                   # o "alô" não conta como turno
        th_ab.join(timeout=10)
        if not estado["desligou"]:
            if abertura_caixa.get("pcm"):
                transcricao.append("IA: " + abertura)
                tocar_bargein(abertura_caixa["pcm"])
                drenar_pos_fala()
            else:
                falar(abertura)
            # A abertura é FALADA fora do LLM (áudio pronto antes do "alô").
            # Sem registrá-la no histórico, o modelo não sabe que já se
            # apresentou e abre a conversa de novo — foi o que fez a Bel dizer
            # "Aqui é a Bel, da Babel!" duas vezes seguidas.
            historico.append({"role": "assistant",
                              "content": json.dumps({"fala": abertura},
                                                    ensure_ascii=False)})
            salvar_parcial()
        sem_resposta = 0
        filler_turno_anterior = False
        descartes = 0
        for turno in range(max_turnos):  # limite de turnos por segurança
            if estado["desligou"]:
                break
            pcm = escutar()
            if estado["desligou"] and pcm is None:
                break
            if pcm is None:
                sem_resposta += 1
                if sem_resposta == 1:
                    falar("[caloroso] Alô? Consegue me ouvir?")
                    continue
                falar("[caloroso] Vou ligar num outro momento então. Obrigada, viu! Até logo!")
                break
            sem_resposta = 0
            t_fechou = time.time()
            gravacao.extend(pcm)   # registra a fala da pessoa na gravação
            filler_agora = False
            # reconhecimento após fala longa (>3 s): "uhum" imediato soa humano.
            # (desligado quando a PONTE já dá o som-ponte todo turno)
            if (fillers_on and not ponte_resposta and uhum_longa and len(pcm) > 48000
                    and not estado["interrompida"] and not filler_turno_anterior):
                filler_agora = tocar_filler("curto")
            texto = estado.pop("texto_dg", None) or ""
            if texto:
                t_asr = 0.0          # streaming: o texto já chegou pronto
            else:
                t0 = time.time()
                try:
                    texto = fish.asr(chave_fish, fish.slin8k_para_wav16k(pcm))
                except Exception as erro:
                    log(f"asr falhou: {erro}")
                    texto = ""
                t_asr = time.time() - t0
            if not texto_plausivel(texto):
                if texto.strip():
                    log(f"asr descartado (não parece pt): {texto!r}")
                # a pessoa FALOU (>1,5 s de voz) e não entendemos → não a ignore
                if len(pcm) > 24000:
                    descartes += 1
                    if descartes == 1:
                        falar("[caloroso] Desculpa, picotou aqui — pode repetir?")
                    elif descartes == 2:
                        falar("[calma] A linha tá falhando um pouquinho. Repete mais uma vez pra mim?")
                continue
            descartes = 0
            # caixa postal? não gasta crédito conversando com gravadora
            if turno <= 1 and _CAIXA_POSTAL.search(texto):
                log(f"caixa postal detectada: {texto[:50]!r} — desligando")
                resultado_final = "caixa_postal"
                break
            # endpoint por conteúdo: terminou em número/vírgula/palavra de
            # continuação → a pessoa não acabou; escuta a emenda antes de responder
            extensoes = 0
            while texto_incompleto(texto) and extensoes < 2 and not estado["desligou"]:
                extra = escutar(max_seg=1.6, buffer_proprio=b"")
                if not extra:
                    break
                gravacao.extend(extra)
                try:
                    t2 = fish.asr(chave_fish, fish.slin8k_para_wav16k(extra))
                except Exception:
                    t2 = ""
                if not texto_plausivel(t2):
                    break
                texto = texto.rstrip() + " " + t2.strip()
                extensoes += 1
            transcricao.append("Cliente: " + texto)
            salvar_parcial()
            historico.append({"role": "user", "content": texto})
            # contexto efêmero por turno: onde estamos no fluxo + fatos do RAG
            mensagens = list(historico)
            et = etapas.get(etapa_atual, fluxo[0])
            guia = f'ETAPA ATUAL: "{et["nome"]}" (id={etapa_atual}). Meta agora: {et["meta"]}.'
            achados = rag_do_turno(texto)     # já computado durante a fala (~0ms)
            if achados:
                guia += ("\nBASE DE CONHECIMENTO — responda fatos SOMENTE com base nisto:\n"
                         + "\n".join(f"- {a['resposta']}" for a in achados))
            mensagens.append({"role": "system", "content": guia + LEMBRETE_TURNO})
            # pergunta difícil: filler "pensando" (só se a PONTE estiver desligada)
            if fillers_on and not ponte_resposta and not filler_agora and not filler_turno_anterior and (
                    texto.rstrip().endswith("?") or random.random() < chance_pensando):
                filler_agora = tocar_filler("pensando")
            filler_turno_anterior = filler_agora
            # SESSÃO PERSISTENTE: as frases vão pra sessão de voz JÁ ABERTA
            # (texto + flush) — zero handshake; a Bel fala enquanto o cérebro
            # ainda escreve o resto da resposta.
            t0 = time.time()
            estado["interrompida"] = False
            tts_drenar_fila()                 # sobras de turno interrompido, fora
            frames_antes = player["frames"]
            # PONTE DE RESPOSTA: som curto de "pensando" na voz da Bel JÁ na fila.
            # A pessoa ouve resposta em ~300ms enquanto o LLM+TTS preparam a fala
            # real — é o que derruba o delay PERCEBIDO pra baixo de 400ms.
            ponte_frames = 0
            _cat_ponte = categoria_ponte(texto)
            _sons_ponte = (FILLERS.get(_cat_ponte) or FILLERS.get("p_neutro")
                           or FILLERS.get("ponte") or FILLERS.get("pensando"))
            if ponte_resposta and _sons_ponte and tts_garantir():
                escolha = random.choice([o for o in _sons_ponte
                                         if o is not estado["ultimo_filler"]] or _sons_ponte)
                estado["ultimo_filler"] = escolha
                _fila = tts_caixa.get("fila")
                if _fila is not None:
                    for _q in quadros_20ms(bytes(escolha)):
                        _fila.put(_q)
                        ponte_frames += 1
                player["piso_ate"] = 0        # a ponte É a resposta rápida, sem piso
            else:
                player["piso_ate"] = t_fechou + piso_s + random.uniform(0.0, jitter_s)
            log(f"ponte: {ponte_frames} quadros injetados ({_cat_ponte})")
            partes = []

            marca_llm = {"t1": None}

            def ao_frase(frase):
                if estado["interrompida"] or estado["desligou"]:
                    return
                # Teto duro de fala por turno. A regra das "2 frases curtas"
                # está no prompt e no lembrete, mas em ligação real o modelo
                # entregou 34 e 39 palavras (14-16 s de monólogo). Cortamos em
                # fronteira de FRASE, então nunca fica pela metade.
                if sum(len(p.split()) for p in partes) >= MAX_PALAVRAS_FALA:
                    return
                if marca_llm["t1"] is None:
                    marca_llm["t1"] = time.time() - t0
                # só a 1ª frase leva o marcador de emoção; tags soltas no meio
                # ([animada], [caloroso]...) seriam faladas pelo TTS — tira.
                if partes:
                    frase = re.sub(r"\[[a-zA-Zçãáéíóúâêô]{2,15}\]", " ", frase).strip()
                    if not frase:
                        return
                tts_texto(frase)              # se a sessão caiu, o fallback fala
                partes.append(frase)

            try:
                if espec_serve(texto):
                    # A aposta bateu: a resposta já estava pronta antes de a
                    # pessoa terminar. Passa pelo MESMO caminho de sempre
                    # (ao_frase → TTS → tocador), só sem esperar o LLM agora.
                    espec["acertos"] += 1
                    resposta = espec["resposta"]
                    for _f in espec["frases"]:
                        ao_frase(_f)
                    log(f"especulação acertou ({espec['acertos']}/{espec['tentativas']})")
                else:
                    resposta = cerebro_stream(chave_llm, camp["modelo_llm"], mensagens, ao_frase, temperatura)
            except Exception as erro:
                log(f"stream falhou ({erro}) — modo direto")
                resposta = cerebro(chave_llm, camp["modelo_llm"], mensagens, temperatura)
            espec_limpar()
            tts_flush()
            falou_stream, t1_seg = esperar_fala_terminar(frames_antes, t0)
            t_llm = time.time() - t0
            fala_txt = " ".join(partes) or (resposta.get("fala") or "")
            # Gravar SÓ o que foi realmente FALADO: se a Bel foi cortada, o
            # áudio parou no meio, mas o texto gerado é maior. Estimo o quanto
            # saiu pelo tempo de áudio tocado (~14 caracteres por segundo).
            fala_dita = fala_txt
            if estado["interrompida"] and falou_stream:
                tocado_ms = max(0, (player["frames"] - frames_antes - ponte_frames)) * 20
                limpo = re.sub(r"\[[^\]]*\]", "", fala_txt)
                total_est_ms = max(1, len(limpo) * 70)
                frac = min(1.0, tocado_ms / total_est_ms)
                palavras = fala_txt.split()
                n = max(1, round(len(palavras) * frac))
                fala_dita = " ".join(palavras[:n])
                if n < len(palavras):
                    fala_dita += "…"
            if falou_stream:
                transcricao.append("IA: " + fala_dita
                                   + (" (você cortou)" if estado["interrompida"] else ""))
                drenar_pos_fala()
            t1 = f"{t1_seg:.1f}s" if (falou_stream and t1_seg) else "—"
            tl = f"{marca_llm['t1']:.1f}s" if marca_llm["t1"] else "—"
            log(f"turno {turno}: asr {t_asr:.1f}s · 1ª frase LLM {tl} · 1º áudio {t1} · "
                f"fim {t_llm:.1f}s · ouvi: {texto[:50]!r} · falo: {fala_txt[:50]!r}")
            metricas.append({
                "turno": turno,
                "asr": round(t_asr, 1),
                "primeiro_audio": round(t1_seg, 1) if (falou_stream and t1_seg) else None,
                "interrompida": bool(estado["interrompida"]),
            })
            if estado["interrompida"]:
                # o histórico do LLM guarda SÓ o que ela realmente falou —
                # senão ela "acha" que disse coisas que o cliente não ouviu
                resposta["fala"] = fala_dita + " [o cliente me cortou aqui]"
            historico.append({"role": "assistant", "content": json.dumps(resposta, ensure_ascii=False)})
            capturado.update(resposta.get("capturado") or {})
            nova_etapa = resposta.get("etapa")
            if nova_etapa in etapas:
                etapa_atual = nova_etapa
            if resposta.get("resultado"):
                resultado_final = resposta["resultado"]
            if not falou_stream and fala_txt and not estado["desligou"]:
                falar(fala_txt)   # fallback: o WS não tocou nada — fala via HTTP
            salvar_parcial()
            if resposta.get("transferir") and transferir_ramal and not estado["desligou"]:
                falar("[animada] Perfeito! Vou te passar agora pro nosso especialista. "
                      "Um segundinho na linha, tá?")
                subprocess.run(["asterisk", "-rx",
                                f"database put transferir {chamada_id} {transferir_ramal}"],
                               capture_output=True)
                resultado_final = "transferida"
                log(f"transferência a quente → ramal {transferir_ramal}")
                break
            if resposta.get("encerrar") or estado["desligou"]:
                break
    except OSError:
        transcricao.append("(o outro lado desligou)")
        log(f"chamada {chamada_id[:8]}: encerrada pelo outro lado")
    estado["fim"] = True   # desliga a bomba de ruído e o tocador contínuo
    if dg is not None:
        dg.fechar()
    try:
        if tts_caixa["ws"] is not None:
            voz.tts_stream_fim(tts_caixa["ws"])
            voz.tts_stream_fechar(tts_caixa["ws"])
    except Exception:
        pass

    try:
        conn.sendall(b"\x00\x00\x00")  # encerra a chamada
    except Exception:
        pass
    finalizar_chamada(chamada_id, reg, camp, lead, resultado_final, transcricao,
                      capturado, gravacao,
                      etapas.get(etapa_atual, {}).get("nome", etapa_atual),
                      inicio, contato_nome, briefing, wpp_followup, wpp_template,
                      recontato_horas)


# ---------- CONVERSADOR ALTERNATIVO: Live API do Gemini ----------
# O motor próprio (Deepgram → OpenRouter → Cartesia/Piper) é mais rápido: 800 ms
# de mediana em 137 turnos reais contra ~1,3 s aqui. A Live API entra quando o
# crédito de voz acaba — ela fala com voz natural usando a cota do Google, e é
# a diferença entre a Bel falar mal e a Bel não falar nada. Ver google_live.py.

MODELOS_LIVE = [m.strip() for m in str(_cfg(
    "LIVE_MODELOS",
    # 3.1 primeiro por ser o mais rápido (1321 ms), 2.5 atrás por ser o mais
    # firme (5/5 sessões responderam no teste; o 3.1 fez 4/5).
    "gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-latest"
)).split(",") if m.strip()]
VOZ_LIVE = str(_cfg("LIVE_VOZ", "Leda")).strip()

FERRAMENTAS_LIVE = [
    {"name": "anotar",
     "description": ("Registra um dado que você descobriu na conversa (nome, "
                     "empresa, horário combinado, orçamento…). Chame assim que "
                     "souber, sem interromper o papo."),
     "parameters": {"type": "object", "properties": {
         "campo": {"type": "string", "description": "rótulo exato do formulário"},
         "valor": {"type": "string"}}, "required": ["campo", "valor"]}},
    {"name": "encerrar_ligacao",
     "description": ("Chame DEPOIS de se despedir, quando a ligação chegou ao "
                     "fim. Classifique o desfecho."),
     "parameters": {"type": "object", "properties": {
         "resultado": {"type": "string",
                       "enum": ["agendou", "sem_interesse", "nao_perturbe",
                                "ligar_depois", "caixa_postal"]}},
      "required": ["resultado"]}},
]


def montar_prompt_voz(camp, lead, contato_nome=None, briefing=None):
    """O mesmo prompt do motor próprio, adaptado para voz nativa.

    Duas podas obrigatórias: o bloco de JSON (aqui a resposta é fala, não texto)
    e o de marcadores de emoção — a Live API não interpreta "[alegre]", ela
    LERIA a palavra em voz alta.
    """
    base = montar_prompt(camp, lead, contato_nome, briefing)
    corte = base.find("RESPONDA SEMPRE em JSON")
    if corte > 0:
        base = base[:corte]
    ini = base.find("EMOÇÃO — comece SEMPRE")
    fim = base.find("IDENTIDADE:")
    if 0 < ini < fim:
        base = base[:ini] + base[fim:]
    return base + """
COMO REGISTRAR O QUE DESCOBRIR: use a ferramenta `anotar` (campo, valor) assim
que souber cada dado do formulário. Não fale que está anotando — apenas anote.

QUANDO ENCERRAR: despeça-se com naturalidade e SÓ DEPOIS chame a ferramenta
`encerrar_ligacao` com o resultado: agendou · sem_interesse · nao_perturbe
(pediu para não ligar mais — obrigatório respeitar) · ligar_depois (momento
ruim) · caixa_postal (caiu na secretária eletrônica). Enquanto nada disso
acontecer, siga conversando e não chame a ferramenta.

VOCÊ FALA PRIMEIRO: a pessoa acabou de atender o telefone. Comece pela abertura.
"""


def conversar_google_live(conn, chamada_id):
    """Conversa pela Live API. Cai no motor próprio se o Google não atender."""
    inicio = time.time()
    reg = sb("GET", f"ia_chamadas?id=eq.{chamada_id}"
                    "&select=*,campanhas_ia(*),leads(empresa,cidade,nicho)")
    if not reg:
        return
    reg = reg[0]
    camp = reg["campanhas_ia"]
    lead = reg.get("leads") or {}
    contato_nome = reg.get("contato_nome")
    briefing = reg.get("briefing")
    chave_google = chave_api("google_ai") or ENV.get("GOOGLE_API_KEY")
    if not chave_google:
        log("sem chave google_ai — usando o motor próprio")
        return conversar(conn, chamada_id)

    instrucao = montar_prompt_voz(camp, lead, contato_nome, briefing)
    hist = {"lead": "", "bel": ""}    # o que já foi dito, somando as sessões

    def abrir_sessao(retomando=False):
        """Tenta os modelos em ordem. Na retomada, devolve o contexto do que já
        foi conversado — senão a Bel se reapresenta no meio da ligação."""
        contexto = instrucao
        if retomando and (hist["bel"] or hist["lead"]):
            contexto += ("\n\nRETOMADA: esta ligação JÁ ESTÁ EM ANDAMENTO e a "
                         "conexão piscou. Continue exatamente de onde parou, "
                         "sem se reapresentar e sem recomeçar.\n"
                         f"Você já disse: {hist['bel'][-700:]}\n"
                         f"A pessoa já disse: {hist['lead'][-700:]}")
        for modelo in MODELOS_LIVE:
            try:
                s = google_live.abrir(chave_google, contexto, modelo=modelo,
                                      voz=VOZ_LIVE, ferramentas=FERRAMENTAS_LIVE)
                log(f"live api {'retomada' if retomando else 'aberta'} ({modelo})")
                return s
            except Exception as erro:
                log(f"live api {modelo} recusou: {str(erro)[:90]}")
        return None

    def guardar(s):
        c = google_live.texto_conversa(s)
        hist["lead"] += (" " + c["lead"]).rstrip()
        hist["bel"] += (" " + c["bel"]).rstrip()

    sessao = abrir_sessao()
    if sessao is None:
        log("live api fora do ar — caindo no motor próprio")
        return conversar(conn, chamada_id)
    google_live.iniciar(sessao, "(a pessoa atendeu o telefone)")

    fila = []                      # quadros de 20 ms prontos para tocar
    gravacao = bytearray()
    capturado = {}
    resultado_final = "em_andamento"
    despedindo = False             # já chamou encerrar_ligacao: espera a voz sair
    calado_desde = None
    reconexoes = 0
    ruido_pos = [0]
    mudo = b"\x00" * 320

    def com_ruido(quadro):
        """Mesma razão do motor próprio: silêncio digital absoluto denuncia IA."""
        if not RUIDO:
            return quadro
        p = ruido_pos[0]
        if p + 320 > len(RUIDO):
            p = 0
        ruido_pos[0] = p + 320
        try:
            return audioop.add(quadro, RUIDO[p:p + 320], 2)
        except Exception:
            return quadro

    try:
        while True:
            tipo, dados = ler_pacote(conn)
            if tipo is None or tipo == 0x00:
                break
            if tipo != 0x10:
                continue
            # O AudioSocket manda sempre 20 ms; completar o que vier curto evita
            # que um quadro torto desalinhe a troca (é um envio para cada leitura).
            if len(dados) < 320:
                dados += b"\x00" * (320 - len(dados))
            google_live.enviar(sessao, dados)

            for ev, val in google_live.eventos(sessao, 0.001):
                if ev == "audio":
                    fila.extend(quadros_20ms(val))
                elif ev == "interrompida":
                    # a pessoa falou por cima: o Google parou de gerar, então o
                    # que está na fila é fala que ela já mandou calar.
                    fila.clear()
                elif ev == "ferramenta":
                    nome = val.get("name")
                    args = val.get("args") or {}
                    if nome == "anotar" and args.get("campo"):
                        capturado[str(args["campo"])] = str(args.get("valor", ""))
                    elif nome == "encerrar_ligacao":
                        resultado_final = args.get("resultado") or "em_andamento"
                        despedindo = True
                    google_live.responder_ferramenta(sessao, val)
                elif ev == "fim":
                    # O 3.1 é preview e derruba a sessão sozinho (1 em 5 no
                    # teste). Derrubar a LIGAÇÃO por causa disso é perder o
                    # lead: reabre e continua de onde parou.
                    log(f"live api caiu: {val}")
                    guardar(sessao)
                    google_live.fechar(sessao)
                    nova = abrir_sessao(retomando=True) if reconexoes < 2 else None
                    if nova is None:
                        despedindo = True
                    else:
                        sessao, reconexoes = nova, reconexoes + 1
                        fila.clear()
                        google_live.iniciar(sessao, "(a ligação continua)")
                    break

            quadro = fila.pop(0) if fila else mudo
            conn.sendall(b"\x10" + struct.pack(">H", 320) + com_ruido(quadro))
            try:
                gravacao.extend(audioop.add(dados, quadro, 2))
            except Exception:
                gravacao.extend(dados)

            if despedindo and not fila:
                # deixa a última frase escoar antes de derrubar a linha
                calado_desde = calado_desde or time.time()
                if time.time() - calado_desde > 0.6:
                    break
            elif fila:
                calado_desde = None

            if time.time() - inicio > MAX_SEGUNDOS_LIVE:
                log("live api: teto de duração da ligação")
                break
    except OSError:
        log(f"chamada {chamada_id[:8]}: encerrada pelo outro lado")

    guardar(sessao)
    google_live.fechar(sessao)
    try:
        conn.sendall(b"\x00\x00\x00")
    except Exception:
        pass

    transcricao = []
    if hist["bel"].strip() or hist["lead"].strip():
        transcricao = [f"Bel: {hist['bel'].strip()}", f"Lead: {hist['lead'].strip()}"]
    capturado["_resultado"] = resultado_final
    cfg = camp.get("config") or {}
    finalizar_chamada(chamada_id, reg, camp, lead, resultado_final, transcricao,
                      capturado, gravacao, None, inicio, contato_nome, briefing,
                      bool(cfg.get("wpp_followup")), cfg.get("wpp_template"),
                      float(cfg.get("recontato_horas") or 0))


def finalizar_chamada(chamada_id, reg, camp, lead, resultado_final, transcricao,
                      capturado, gravacao, etapa_nome, inicio, contato_nome,
                      briefing, wpp_followup, wpp_template, recontato_horas):
    """Fecha a ligação: grava o resultado, alimenta o lead, a agenda e a régua.

    Estava embutido no fim do conversar(). Virou função porque o conversador do
    Google (Live API) termina exatamente do mesmo jeito — o que muda entre os
    dois motores é só COMO se conversa, não o que fica registrado depois.
    """
    capturado["_resultado"] = resultado_final
    gravacao_url = subir_gravacao(chamada_id, gravacao)
    sb("PATCH", f"ia_chamadas?id=eq.{chamada_id}", {
        "status": "sem_resposta" if resultado_final == "caixa_postal" else "concluida",
        "transcricao": "\n".join(transcricao),
        "capturado": capturado,
        "gravacao_url": gravacao_url,
        "etapa_atual": etapa_nome,
        "duracao_seg": int(time.time() - inicio),
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
    })
    if reg.get("lead_id"):
        resumo = "; ".join(f"{k}: {v}" for k, v in capturado.items()) or "sem dados capturados"
        sb("POST", "lead_eventos", {
            "lead_id": reg["lead_id"], "tipo": "nota",
            "descricao": f"🤖 IA ligou ({camp['nome']}): {resumo}",
        })
        # compliance: pediu para não ligar mais → descarta e não volta pra fila
        if resultado_final == "nao_perturbe":
            sb("PATCH", f"leads?id=eq.{reg['lead_id']}",
               {"status": "descartado", "proxima_acao_em": None})
            sb("POST", "lead_eventos", {
                "lead_id": reg["lead_id"], "tipo": "status",
                "descricao": "🚫 Pediu para não ser contatado — bloqueado (não-perturbe)."})
        elif resultado_final == "agendou":
            sb("PATCH", f"leads?id=eq.{reg['lead_id']}", {"status": "reuniao_marcada"})
    # agendou → cria o compromisso na Agenda (horário provisório: próximo dia útil 9h)
    if resultado_final == "agendou":
        try:
            quando_txt = str(capturado.get("melhor_dia_horario")
                             or capturado.get("data_pagamento") or "").strip()
            agora_br = datetime.now(FUSO_BR)
            ini = (agora_br + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
            if ini.weekday() >= 5:                       # cai no fim de semana → segunda
                ini += timedelta(days=7 - ini.weekday())
            quem = contato_nome or lead.get("empresa") or reg["numero"]
            sb("POST", "agenda_eventos", {
                "lead_id": reg.get("lead_id"),
                "titulo": f"🤖 IA agendou: {quem}"
                          + (f" — cliente pediu: {quando_txt}" if quando_txt else " (confirmar horário)"),
                "inicio": ini.isoformat(),
                "fim": (ini + timedelta(hours=1)).isoformat(),
                "tipo": "reuniao",
            })
            log("evento criado na agenda")
        except Exception as erro:
            log(f"falha ao criar evento na agenda: {erro}")
        # WhatsApp de confirmação → entra na fila (aguardando a API ser conectada)
        if wpp_followup and wpp_template:
            try:
                msg_wpp = (wpp_template
                           .replace("{nome}", contato_nome or "")
                           .replace("{dia_horario}", quando_txt or "a combinar").strip())
                sb("POST", "wpp_fila", {"numero": reg["numero"], "mensagem": msg_wpp})
                log("whatsapp na fila (aguardando API)")
            except Exception as erro:
                log(f"falha na fila de whatsapp: {erro}")
    # ligar_depois → régua de recontato: volta pra fila daqui X horas
    if resultado_final == "ligar_depois" and recontato_horas > 0:
        try:
            sb("POST", "ia_chamadas", {
                "campanha_id": camp["id"], "lead_id": reg.get("lead_id"),
                "numero": reg["numero"], "contato_nome": contato_nome,
                "briefing": briefing, "status": "pendente",
                "nao_antes": (datetime.now(timezone.utc)
                              + timedelta(hours=recontato_horas)).isoformat(),
            })
            log(f"recontato agendado pra daqui {recontato_horas}h")
        except Exception as erro:
            log(f"falha no recontato: {erro}")
    log(f"chamada {chamada_id[:8]} concluída · resultado: {resultado_final} · {capturado}")

FLUXO_PADRAO = [
    {"id": "abertura", "nome": "Abertura", "meta": "Confirmar que fala com o responsável e prender a atenção"},
    {"id": "descoberta", "nome": "Descoberta", "meta": "Entender a situação e a dor atual do cliente"},
    {"id": "apresentacao", "nome": "Apresentação", "meta": "Conectar a solução à dor e despertar interesse"},
    {"id": "objecao", "nome": "Objeção", "meta": "Dissolver dúvidas e resistências"},
    {"id": "fechamento", "nome": "Fechamento", "meta": "Propor o agendamento da apresentação"},
    {"id": "confirmacao", "nome": "Confirmação", "meta": "Capturar dia e horário e encerrar"},
]


def montar_formulario(camp):
    """Descreve o formulário de captura: cada dado, sua pergunta e se é obrigatório."""
    form = camp.get("formulario")
    if not form:  # retrocompat: campos simples
        return (", ".join(camp.get("campos") or []) or "nenhum campo específico"), []
    linhas, obrigatorios = [], []
    for c in form:
        rot = c.get("rotulo", "")
        perg = c.get("pergunta", "").strip()
        obr = c.get("obrigatorio")
        marca = " (OBRIGATÓRIO)" if obr else ""
        linha = f'  • {rot}{marca}'
        if perg:
            linha += f' — pergunte assim: "{perg}"'
        linhas.append(linha)
        if obr:
            obrigatorios.append(rot)
    return "\n".join(linhas), obrigatorios


# Modo de conversa por tipo de campanha — muda o tom e o alvo da Bel.
DICAS_TIPO = {
    "vender": """
MODO VENDA: conduza para o compromisso de compra nesta ligação ou o próximo
passo concreto. Quando sentir interesse, peça o pedido com naturalidade
("quer que eu já deixe reservado pra você?").""",
    "cobrar": """
MODO COBRANÇA (regras OBRIGATÓRIAS): tom cordial, respeitoso e discreto.
- NUNCA ameace, constranja ou exponha o débito a terceiros.
- CONFIRME que fala com a pessoa certa ANTES de citar qualquer valor.
- Se não for a pessoa, NÃO diga o motivo — só peça pra ela retornar.
- Objetivo: uma DATA CONCRETA de pagamento. Confirme repetindo a data.""",
    "pos_venda": """
MODO PÓS-VENDA: você liga pra AGRADECER e cuidar, não pra vender.
Pergunte a nota de zero a dez, escute problemas de verdade (anote tudo em
"capturado") e só mencione novidade ou indicação se o clima estiver ótimo.""",
    "pesquisa": """
MODO PESQUISA: peça permissão logo no início ("são dois minutinhos, posso?").
UMA pergunta do formulário por vez, agradeça cada resposta. Não venda nada.""",
    "apresentar": """
MODO APRESENTAÇÃO: gere curiosidade e deixe a porta aberta — leve, sem
pressão de fechamento. O sucesso é a pessoa querer saber mais.""",
    "convidar": """
MODO CONVITE: você liga para CONVIDAR a pessoa para um evento. Tom animado e
acolhedor — é um presente, não uma venda. Os detalhes do evento (data, local,
horário) estão na base de conhecimento: conte com entusiasmo, confirme presença
("posso contar com você?"), anote acompanhantes e diga que vai mandar o lembrete.
Confirmou presença → resultado "agendou".""",
}


def montar_prompt(camp, lead, contato_nome=None, briefing=None, pode_transferir=False):
    formulario_txt, obrigatorios = montar_formulario(camp)
    conhecimento = (camp.get("base_conhecimento") or "").strip()
    fluxo = camp.get("fluxo") or FLUXO_PADRAO
    etapas_txt = "\n".join(
        f"  {i+1}. {e['nome']} — meta: {e['meta']}" for i, e in enumerate(fluxo))
    ids = " → ".join(e["id"] for e in fluxo)
    bloco_kb = f"""

BASE DE CONHECIMENTO (única fonte de verdade sobre a empresa — NUNCA invente nada além disto):
{conhecimento}

REGRA ANTI-INVENÇÃO: se perguntarem algo que NÃO está na base de conhecimento,
responda com naturalidade que essa parte quem detalha é o especialista na
apresentação (ex.: "boa pergunta! esse detalhe o pessoal te mostra certinho na
call"). É PROIBIDO inventar preços, prazos, nomes ou características.""" if conhecimento else ""
    bloco_pessoa = ""
    if contato_nome:
        bloco_pessoa += f"""

QUEM VOCÊ ESTÁ LIGANDO: {contato_nome}. Você JÁ SABE o nome — confirme com
leveza no início ("falo com {contato_nome}?") e use o nome naturalmente."""
    if briefing:
        bloco_pessoa += f"""

BRIEFING DO VENDEDOR sobre esta pessoa/empresa (use para PERSONALIZAR a
conversa com naturalidade — demonstre que conhece o contexto, mas NUNCA
recite isto como lista nem revele que tem uma ficha):
{briefing}"""
    dica_tipo = DICAS_TIPO.get(camp.get("tipo") or "", "")
    bloco_transfer = """

TRANSFERÊNCIA A QUENTE: se a pessoa pedir para falar com um humano AGORA
("me passa alguém", "quero falar com uma pessoa", "tem como resolver já?"),
avise ("perfeito, vou te passar pro especialista agora!") e inclua
"transferir": true no JSON — ela será conectada na hora.""" if pode_transferir else ""
    return f"""Você é {camp['persona']}. Você está numa LIGAÇÃO TELEFÔNICA real com {lead.get('empresa') or 'uma empresa'} ({lead.get('cidade') or ''}, ramo: {lead.get('nicho') or 'não informado'}).

SEU OBJETIVO FINAL: {camp['objetivo']}
{dica_tipo}{bloco_transfer}{bloco_pessoa}{bloco_kb}

FLUXO DA LIGAÇÃO — você CONDUZ do início ao fim, não é passiva. Etapas na ordem:
{etapas_txt}
Regras do fluxo:
- Você recebe a cada momento em que ETAPA está. Trabalhe a meta dela.
- Avance para a próxima etapa SÓ quando a meta atual estiver cumprida.
- Se o cliente resistir ou fugir, trate e traga de volta para o rumo — não abandone o objetivo.
- Ordem das etapas (use estes ids no campo "etapa"): {ids}

FORMULÁRIO — dados que você precisa coletar durante a conversa (faça as perguntas
de forma natural, encaixadas no papo, nunca como interrogatório):
{formulario_txt}
{("NÃO encerre a ligação sem ter coletado os dados OBRIGATÓRIOS: " + ", ".join(obrigatorios) + ".") if obrigatorios else ""}
Cada dado que descobrir, coloque em "capturado" com o rótulo exato acima.

COMO VOCÊ FALA (isto é uma LIGAÇÃO por voz, não um texto — fale, não escreva):
- REGRA DE OURO DO TAMANHO: no MÁXIMO 2 frases curtas por vez. PONTO FINAL.
  Uma ligação é troca rápida — quem fala demais soa robô e é cortado.
  Exemplo do tamanho CERTO: "Ah, entendi! A gente ajuda a organizar suas ligações
  e não perder cliente. Posso te mostrar como?" — parou aí, devolveu a bola.
  ERRADO: explicar PABX + gravação + navegador + equipe tudo de uma vez.
- Se tiver muito a dizer, diga UMA coisa e pergunte antes de continuar.
  É PROIBIDO despejar pitch em cima de reclamação — acolha em 1 frase primeiro.
- NUNCA leia listas ("temos três planos: um... dois..."). Fale como gente no telefone.
- Números por extenso e em grupos: "mil reais", "onze, nove-dois-um-zero...".
- Ao marcar dia/hora, CONFIRME repetindo: "quinta, dia vinte e quatro, às três da tarde — isso?".
- Use marcadores naturais: "ah, entendi", "perfeito", "deixa eu te perguntar", "olha só".
- Uma pergunta por vez. Reaja ao que a pessoa disse ANTES de puxar outro assunto.
- Use o NOME da pessoa quando descobrir.
- TERMINE TODA FALA com uma pergunta ou um convite claro ("faz sentido?", "posso
  te contar como?"). NUNCA termine em afirmação solta — a pessoa precisa saber
  que é a vez dela, senão fica um silêncio esquisito na linha.

{"NOME DO CLIENTE: você já sabe (" + contato_nome + ") — confirme que é a pessoa certa e use o nome com naturalidade (1-2 vezes na ligação, não mais)." if contato_nome else '''NOME DO CLIENTE — REGRA DE FERRO: você NÃO SABE o nome de quem atendeu.
- NUNCA chame a pessoa por um nome que ela não disse NESTA ligação.
- Nomes que aparecem na base de conhecimento (dono, equipe) são do NOSSO lado
  (da empresa que está ligando) — NÃO são o cliente.
- Pergunte o nome cedo e com leveza ("com quem eu falo?"). A partir do momento
  em que a pessoa disser, use o nome DELA e guarde em "capturado".'''}

ARQUITETURA DE CADA FALA (é isto que faz o diálogo encaixar):
1. REAJA primeiro ao que a pessoa ACABOU de dizer — curto e específico,
   ecoando a palavra dela ("Planilha, entendi.", "Sete anos, que legal!").
2. Depois, NO MÁXIMO uma informação nova.
3. Feche com UMA pergunta que avança a etapa atual.
Regras do encaixe:
- Se a pessoa PERGUNTAR algo, responda DIRETO na primeira frase (sem rodeio),
  e só depois devolva uma pergunta.
- Use o que ela disse antes ("você comentou que...") — memória cria conexão.
- Varie o formato: às vezes só reação+pergunta; às vezes só resposta direta.

SOAR GENTE, NÃO ROTEIRO (imperfeição leve = autenticidade):
- De vez em quando (NÃO sempre) comece com "É...", "Olha...", "Então...", "Ah, tá".
- Exemplo RUIM (perfeito demais): "Certamente! A Babel oferece uma solução completa."
- Exemplo BOM: "Ah, então... a gente cuida disso pra você, sabe? Sem complicação."
- No máximo UMA hesitação leve a cada 2-3 falas. Nunca duas seguidas.
- Frases de comprimento VARIADO: uma curtinha, depois uma média. Nunca o mesmo ritmo.

EMOÇÃO — comece SEMPRE a "fala" com um marcador entre colchetes que o sintetizador
usa para dar entonação. Escolha conforme o momento:
- abertura e quebra-gelo: [alegre] ou [rindo]
- explicando / ouvindo: [caloroso] ou [empática]
- objeção / cliente com dúvida: [calma]
- interesse e fechamento: [animada] ou [empolgada]
Exemplo de fala: "[alegre] Oi, tudo bem? Aqui é a Bel, da Babel!"

IDENTIDADE: você não anuncia que é uma IA. Se perguntarem diretamente, admita com
leveza ("sou sim, um atendimento inteligente da Babel!") e siga naturalmente. NUNCA minta dizendo que é humana.

QUANDO ENCERRAR (marque "encerrar": true e classifique em "resultado"):
- Cliente AGENDOU / topou a apresentação → resultado "agendou". Confirme dia/hora e despeça feliz.
- Cliente sem interesse claro ("não quero", "não preciso") → resultado "sem_interesse". Agradeça e encerre cordial.
- Cliente pede para PARAR ("tira meu número", "não me liga mais", "me remove") → resultado "nao_perturbe". Peça desculpas, garanta que não liga mais, encerre. (É obrigatório respeitar.)
- Momento ruim ("tô ocupado", "agora não dá", "tô dirigindo") → resultado "ligar_depois". Peça desculpa e encerre rápido.
- Já é cliente / já resolveu ("já uso", "já tenho") → resultado "sem_interesse".
Enquanto NADA disso acontece, "resultado" é "em_andamento" e "encerrar" é false — a conversa CONTINUA.

Se a transcrição vier com ERRO ou sem sentido (ruído da linha), NÃO responda ao conteúdo:
diga com leveza que picotou ("desculpa, cortou aqui — pode repetir?") e siga de onde estava.

RESPONDA SEMPRE em JSON puro, sem markdown, com "fala" como PRIMEIRO campo:
{{"fala": "[emoção] o que você vai dizer", "capturado": {{"campo": "valor, se houver"}}, "etapa": "id da etapa atual", "resultado": "em_andamento", "encerrar": false}}
- "etapa": EXATAMENTE um destes ids: {ids}. Nenhum outro valor existe.
- "resultado": SOMENTE um destes: em_andamento, agendou, sem_interesse, nao_perturbe, ligar_depois. Nenhum outro valor existe."""

def buscar_conhecimento(texto, campanha_id):
    """RAG: pergunta à base vetorizada quais fatos são relevantes a esta fala."""
    if not ENV.get("MOTOR_SECRET"):
        return []
    corpo = json.dumps({
        "acao": "buscar", "token": ENV["MOTOR_SECRET"],
        "campanha_id": campanha_id, "texto": texto, "limite": 3,
    }).encode()
    req = urllib.request.Request(
        ENV["SUPABASE_URL"] + "/functions/v1/conhecimento", data=corpo,
        headers={"apikey": ENV["SUPABASE_SERVICE_ROLE"],
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.load(resp).get("resultados", [])
    except Exception as erro:
        log(f"busca de conhecimento falhou: {erro}")
        return []


def _extrair_json(texto):
    """Extrai o objeto {fala,...} de um texto de LLM. NUNCA devolve JSON cru."""
    texto = texto.strip()
    # remove cerca markdown ```json ... ``` se o modelo embrulhou a resposta
    if texto.startswith("```"):
        texto = re.sub(r"^```[a-zA-Z]*\s*", "", texto)
        texto = re.sub(r"\s*```$", "", texto).strip()
    # tenta o objeto inteiro e, se falhar, isola o primeiro {...} do texto
    candidatos = [texto]
    ini, fim = texto.find("{"), texto.rfind("}")
    if 0 <= ini < fim:
        bloco = texto[ini:fim + 1]
        candidatos += [bloco, bloco.replace("\n", " "),
                       bloco.replace("\r", " ").replace("\n", "\\n")]
    for candidato in candidatos:
        try:
            obj = json.loads(candidato)
            if isinstance(obj, dict) and obj.get("fala") is not None:
                return obj
        except Exception:
            continue
    # último recurso: extrai só a "fala"
    m = re.search(r'"fala"\s*:\s*"([^"]+)', texto, re.S)
    if m:
        fala = m.group(1).replace("\\n", " ").strip()
    else:
        fala = "[caloroso] Desculpa, acho que cortou aqui. Pode repetir?"
    return {"fala": fala[:300], "capturado": {}, "encerrar": False}


def cerebro(chave, modelo, historico, temperatura=0.7):
    # max_tokens folgado: modelos "pensantes" (ex. gemini-3.5-flash) queimam o
    # orçamento em raciocínio e devolvem fala DECAPITADA com orçamento curto.
    # O cérebro da ligação deve ser um modelo SEM pensamento (gemini-2.5-flash):
    # 2s/turno contra 6,5s+ dos pensantes.
    corpo = json.dumps({
        "model": modelo,
        "messages": historico,
        "temperature": temperatura,
        "max_tokens": 140,
        "provider": {"order": PROVEDORES_RAPIDOS, "sort": "latency"},
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": "Bearer " + chave,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        dados = json.load(resp)
    return _extrair_json(dados["choices"][0]["message"]["content"])


_FIM_FRASE = re.compile(r"[.!?…]+\s")


def _desescapar(s):
    return (s.replace('\\"', '"').replace("\\n", " ")
             .replace("\\t", " ").replace("\\\\", "\\").strip())


def cerebro_stream(chave, modelo, historico, ao_frase, temperatura=0.7):
    """Streama a resposta do LLM (SSE). Assim que cada FRASE do campo "fala"
    se completa, chama ao_frase(frase) — que sintetiza e toca na hora. O JSON
    completo é parseado no fim e devolvido. É isto que fecha o vão de silêncio:
    a Bel começa a responder ~2 s antes de a resposta terminar de ser escrita."""
    corpo = json.dumps({
        "model": modelo,
        "messages": historico,
        "temperature": temperatura,
        "max_tokens": 140,
        "stream": True,
        # Groq na frente (3x menos TTFT no mesmo modelo); se ele estiver fora,
        # cai pro provedor de menor latência do momento — congestionamento de um
        # provedor não pode virar pausa de 20 s na ligação.
        "provider": {"order": PROVEDORES_RAPIDOS, "sort": "latency"},
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": "Bearer " + chave,
                 "Content-Type": "application/json"})
    texto = ""
    ini = None       # onde o VALOR de "fala" começa no texto acumulado
    fechada = False  # a string de "fala" já fechou aspas?
    emitido = 0      # até onde (relativo ao valor) já viraram frases faladas
    with urllib.request.urlopen(req, timeout=60) as resp:
        for bruta in resp:
            bruta = bruta.decode("utf-8", "ignore").strip()
            if not bruta.startswith("data:"):
                continue
            payload = bruta[5:].strip()
            if payload == "[DONE]":
                break
            try:
                delta = ((json.loads(payload)["choices"][0].get("delta") or {})
                         .get("content") or "")
            except Exception:
                continue
            if not delta:
                continue
            texto += delta
            if ini is None:
                m = re.search(r'"fala"\s*:\s*"', texto)
                if m:
                    ini = m.end()
            if ini is None or fechada:
                continue
            # valor de "fala" até agora (respeitando aspas escapadas)
            valor = texto[ini:]
            fim = -1
            i = 0
            while i < len(valor):
                if valor[i] == '"' and (i == 0 or valor[i - 1] != "\\"):
                    fim = i
                    break
                i += 1
            if fim >= 0:
                valor = valor[:fim]
                fechada = True
            # emite as frases completas ainda não faladas
            novo = valor[emitido:]
            cortes = [m2.end() for m2 in _FIM_FRASE.finditer(novo)]
            if cortes:
                pronto = novo[:cortes[-1]]
                if pronto.strip():
                    ao_frase(_desescapar(pronto))
                emitido += len(pronto)
            if fechada:
                resto = valor[emitido:]
                if resto.strip():
                    ao_frase(_desescapar(resto))
                emitido = len(valor)
    return _extrair_json(texto)

# ---------- main ----------

if __name__ == "__main__":
    # aquece o Smart Turn no boot (a 1ª inferência carrega o modelo ~0,8 s;
    # melhor pagar isso agora do que na 1ª ligação)
    if _turno_completo is not None:
        threading.Thread(target=lambda: _turno_completo(b"\x00\x00" * 8000),
                         daemon=True).start()
    # mesma ideia pra voz: a 1ª síntese carrega o modelo (~0,8 s). Aquecendo
    # aqui, a primeira frase da primeira ligação já sai em ~120 ms.
    if VOZ_LOCAL:
        threading.Thread(target=lambda: voz.tts_slin8k("Oi, tudo bem?"),
                         daemon=True).start()
    log(f"áudio fixo: {sum(len(v) for v in FILLERS.values())} fillers · "
        f"ruído {'ok' if RUIDO else 'AUSENTE'} · "
        f"smart-turn {'ok' if _turno_completo else 'AUSENTE'} · "
        f"voz {VOZ_MOTOR + ' (' + getattr(voz, 'VOZ_BEL', '?') + ')' if VOZ_LOCAL else 'Fish remoto'} · "
        f"llm {'/'.join(PROVEDORES_RAPIDOS)} · "
        f"fim-silêncio {FIM_SILENCIO_MS}ms · "
        f"especulação {'LIGADA' if ESPEC_ON else 'desligada'}")
    threading.Thread(target=originador, daemon=True).start()
    servidor_audiosocket()
