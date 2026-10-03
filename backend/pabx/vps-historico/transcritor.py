#!/usr/bin/env python3
"""Transcritor de chamadas do PABX Babel.

Consome a fila de chamadas finalizadas (/var/spool/babel/fila), transcreve
com Deepgram nova-3 (pontuação de verdade; whisper.cpp local é o fallback se
a API faltar), sobe o áudio para o Supabase Storage e registra tudo na
tabela calls. Roda em loop contínuo (systemd).

São dois ritmos: uma thread registra a chamada no banco em segundos (para o
placar e o histórico não esperarem), e o laço principal transcreve com calma
e completa a mesma linha depois.
"""
import json
import os
import subprocess
import threading
import time
import urllib.request

ENV_PATH = "/opt/babel/babel.env"
FILA = "/var/spool/babel/fila"
ERRO = "/var/spool/babel/erro"
PROCESSADOS = "/var/spool/babel/processados"
RAMAIS_JSON = "/opt/babel/ramais.json"
WHISPER = "/opt/whisper.cpp/build/bin/whisper-cli"
MODELO = "/opt/whisper.cpp/models/ggml-small-q5_1.bin"
VAD_MODELO = "/opt/whisper.cpp/models/for-tests-silero-v6.2.0-ggml.bin"
# A VPS tem 2 cores e a fila chegou a 98 chamadas atrasadas. Estas opções
# cortaram 42% do tempo em teste (97s → 56s num áudio de 5min40):
#   -bo 1 -bs 1  busca gulosa em vez de feixe de 5 caminhos
#   --vad        pula o silêncio (metade de uma ligação é o outro lado calado)
# Os tempos de cada fala continuam certos, então a divisão de falantes não muda.
RAPIDO = ["-bo", "1", "-bs", "1", "--vad", "-vm", VAD_MODELO]
INTERVALO_SEG = 10
REGISTRO_SEG = 4        # ritmo da thread que joga a chamada no banco
SEG_MIN_DIARIZAR = 20   # abaixo disso não vale gastar 2 passadas do whisper
MAX_TENTATIVAS = 3


def carregar_env():
    env = {}
    with open(ENV_PATH) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                env[chave] = valor
    return env


def api(env, metodo, url, dados, content_type="application/json",
        headers_extra=None):
    headers = {
        "apikey": env["SUPABASE_SERVICE_ROLE"],
        "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE"],
        "Content-Type": content_type,
    }
    headers.update(headers_extra or {})
    req = urllib.request.Request(url, data=dados, headers=headers,
                                 method=metodo)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def usuario_do_ramal(ramal):
    try:
        with open(RAMAIS_JSON) as f:
            mapa = json.load(f)
        return (mapa.get(ramal) or {}).get("user_id")
    except OSError:
        return None


def transcrever(wav):
    base = wav + ".16k"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                    "-ar", "16000", "-ac", "1", base + ".wav"], check=True)
    try:
        r = subprocess.run([WHISPER, "-m", MODELO, "-f", base + ".wav",
                            "-l", "pt", "-t", "2", "--no-timestamps"] + RAPIDO,
                           capture_output=True, text=True, check=True,
                           timeout=1800)
        return r.stdout.strip()
    finally:
        os.remove(base + ".wav")


def transcrever_segmentos(wav):
    """Transcreve um lado da conversa e devolve [(inicio_seg, texto)].

    Usa a saída JSON do whisper.cpp para saber QUANDO cada fala aconteceu —
    é o que permite intercalar os dois lados na ordem real do diálogo.
    """
    if not os.path.exists(wav) or os.path.getsize(wav) < 1000:
        return []
    base = wav + ".16k"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                    "-ar", "16000", "-ac", "1", base + ".wav"], check=True)
    saida = base + ".wav.json"
    try:
        subprocess.run([WHISPER, "-m", MODELO, "-f", base + ".wav",
                        "-l", "pt", "-t", "2", "-oj", "-of", base + ".wav"] + RAPIDO,
                       capture_output=True, text=True, check=True, timeout=1800)
        with open(saida) as f:
            dados = json.load(f)
        segmentos = []
        for s in dados.get("transcription", []):
            texto = (s.get("text") or "").strip()
            if not texto:
                continue
            ms = ((s.get("offsets") or {}).get("from")
                  or (s.get("timestamps") or {}).get("from") or 0)
            # offsets vêm em ms; timestamps podem vir como "00:00:03,240"
            if isinstance(ms, str):
                try:
                    hh, mm, resto = ms.split(":")
                    ss = float(resto.replace(",", "."))
                    inicio = int(hh) * 3600 + int(mm) * 60 + ss
                except Exception:  # noqa: BLE001
                    inicio = 0.0
            else:
                inicio = float(ms) / 1000.0
            segmentos.append((inicio, texto))
        return segmentos
    finally:
        for f in (base + ".wav", saida):
            if os.path.exists(f):
                os.remove(f)


def transcrever_deepgram_segmentos(chave, caminho, content_type="audio/wav"):
    """Um lado da conversa via Deepgram nova-3 → [(inicio_seg, texto)].

    Mesmo formato do whisper — quem chama não sabe qual motor rodou.
    punctuate SEM smart_format: o smart_format troca "um" por "1" em pt-BR.
    Erro de rede/API vira exceção; quem chama decide o fallback local.
    """
    if not os.path.exists(caminho) or os.path.getsize(caminho) < 1000:
        return []
    with open(caminho, "rb") as f:
        corpo = f.read()
    req = urllib.request.Request(
        "https://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR"
        "&punctuate=true&utterances=true",
        data=corpo, headers={"Authorization": "Token " + chave,
                             "Content-Type": content_type}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        dados = json.loads(resp.read())
    segmentos = []
    for u in (dados.get("results") or {}).get("utterances") or []:
        texto = (u.get("transcript") or "").strip()
        if texto:
            segmentos.append((float(u.get("start") or 0), texto))
    return segmentos


def montar_dialogo(wav_vendedor, wav_lead, transcreve=transcrever_segmentos):
    """Une os dois lados em um diálogo ordenado no tempo.

    Devolve (turnos, texto_legivel). Cada turno:
      {"falante": "vendedor"|"lead", "inicio": 12.4, "texto": "..."}
    Falas seguidas do mesmo lado são agrupadas em um único turno.
    `transcreve` é o motor: whisper local (padrão) ou Deepgram.
    """
    marcados = ([{"falante": "vendedor", "inicio": t, "texto": x}
                 for t, x in transcreve(wav_vendedor)]
                + [{"falante": "lead", "inicio": t, "texto": x}
                   for t, x in transcreve(wav_lead)])
    marcados.sort(key=lambda s: s["inicio"])

    turnos = []
    for s in marcados:
        if turnos and turnos[-1]["falante"] == s["falante"]:
            turnos[-1]["texto"] += " " + s["texto"]
        else:
            turnos.append(dict(s))

    rotulo = {"vendedor": "Mentor", "lead": "Lead"}
    texto = "\n".join(f"{rotulo[t['falante']]}: {t['texto']}" for t in turnos)
    return turnos, texto


CAMPOS_DOSSIE = """
- nome_atendente: nome de quem atendeu a ligação (a pessoa do outro lado)
- cargo_atendente: cargo/função dela na empresa (ex.: recepcionista, sócio)
- nome_dono: nome do dono/decisor da empresa, se citado
- empresa: nome da empresa, se citado
- dor: a dor/problema/dificuldade que a empresa tem hoje (frase objetiva)
- desejo: o que a empresa quer alcançar/melhorar (frase objetiva)
- objecoes: objeções levantadas (ex.: preço, já tem fornecedor, sem tempo)
- orcamento: qualquer indicação de verba/valores citada
- ferramentas_atuais: o que usam hoje (sistemas, fornecedores)
- melhor_horario: melhor dia/horário para retornar, se combinado
- proximo_passo: o que ficou combinado ao final
- temperatura: "quente", "morno" ou "frio" — interesse demonstrado
- resumo: 1 ou 2 frases sobre o que aconteceu na conversa
"""


def chave_api(env, provedor):
    try:
        dados = api(env, "GET",
                    env["SUPABASE_URL"] + f"/rest/v1/chaves_api?provedor=eq.{provedor}"
                    "&ativa=eq.true&select=chave&order=criado_em&limit=1", None)
        linhas = json.loads(dados or b"[]")
        return linhas[0]["chave"] if linhas else None
    except Exception:  # noqa: BLE001
        return None


def validar_dossie(dossie, dialogo):
    """Descarta campo cuja evidência não aparece de fato na conversa.

    É a trava anti-invenção: se o modelo "lembrou" de um nome ou de uma dor
    que ninguém falou, o campo cai fora em vez de virar dado falso no CRM.
    """
    evidencias = dossie.pop("evidencia", None) or {}
    conversa = " ".join(dialogo.lower().split())
    limpo, descartados = {}, []
    for chave, valor in dossie.items():
        if isinstance(valor, list):
            valor = [v for v in valor if str(v).strip()]
            if valor:
                limpo[chave] = valor
            continue
        texto = str(valor or "").strip()
        if not texto:
            continue
        # resumo/temperatura são interpretação, não citação — passam direto
        if chave in ("resumo", "temperatura"):
            limpo[chave] = texto
            continue
        trecho = " ".join(str(evidencias.get(chave, "")).lower().split())
        if len(trecho) >= 3 and trecho in conversa:
            limpo[chave] = texto
        else:
            descartados.append(chave)
    if descartados:
        print(f"  dossiê: descartados sem evidência → {', '.join(descartados)}", flush=True)
    return limpo or None


def extrair_dossie(env, dialogo):
    """Lê a conversa e extrai os dados do contato (dossiê).

    Falha silenciosa: sem chave ou com erro, a chamada segue sem dossiê —
    a transcrição é o que não pode faltar.
    """
    if not dialogo or len(dialogo) < 80:
        return None
    chave = chave_api(env, "openrouter")
    if not chave:
        return None
    prompt = (
        "Você monta o dossiê do contato a partir de uma ligação comercial.\n"
        "No diálogo, 'Mentor' é a nossa equipe e 'Lead' é a pessoa que atendeu.\n\n"
        "Devolva SOMENTE um JSON com estes campos:\n" + CAMPOS_DOSSIE +
        "\nE um campo 'evidencia': objeto com o trecho LITERAL da conversa que "
        "justifica cada campo preenchido (mesma chave do campo).\n\n"
        "REGRAS DE FERRO — precisão acima de tudo:\n"
        "1. NUNCA invente. Só preencha o que foi dito de fato na conversa.\n"
        "2. Campo sem certeza absoluta = \"\" (string vazia).\n"
        "3. nome_atendente só se a pessoa DISSE o nome dela nesta ligação.\n"
        "4. nome_dono é o dono da empresa DO CLIENTE — nunca o nome do mentor "
        "nem da nossa empresa.\n"
        "5. dor e desejo com as palavras do próprio cliente, não as suas.\n"
        "6. objecoes é lista de strings; os demais campos são strings.\n\n"
        "DIÁLOGO:\n" + dialogo[:12000]
    )
    corpo = json.dumps({
        "model": "google/gemini-2.5-flash",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": "Bearer " + chave,
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            resposta = json.loads(resp.read())
        texto = resposta["choices"][0]["message"]["content"]
        texto = texto.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        dossie = json.loads(texto)
        if not isinstance(dossie, dict):
            return None
        return validar_dossie(dossie, dialogo)
    except Exception as erro:  # noqa: BLE001
        print(f"dossiê não extraído: {erro}", flush=True)
        return None


def roteiro_do_funil(env):
    """Funil de mentoria ativo (nome, fases e objetivos) para a régua da nota."""
    try:
        bruto = api(env, "GET",
                    env["SUPABASE_URL"] + "/rest/v1/funis?ativo=eq.true"
                    "&select=nome,funil_fases(ordem,nome,objetivo)"
                    "&order=criado_em&limit=1", None)
        funis = json.loads(bruto)
        if not funis:
            return ""
        fases = sorted(funis[0].get("funil_fases") or [], key=lambda x: x["ordem"])
        linhas = [f"{f['ordem']}. {f['nome']} — {f.get('objetivo') or ''}" for f in fases]
        return funis[0]["nome"] + "\n" + "\n".join(linhas)
    except Exception:  # noqa: BLE001
        return ""


def avaliar_qualidade(env, dialogo, duracao_seg):
    """Nota 0-10 da ligação contra o roteiro do funil, com justificativa.

    Falha silenciosa: sem chave, sem funil ou com erro, a chamada segue sem
    nota — transcrição e dossiê são o que não pode faltar.
    """
    if not dialogo or len(dialogo) < 200 or (duracao_seg or 0) < 60:
        return None
    chave = chave_api(env, "openrouter")
    if not chave:
        return None
    roteiro = roteiro_do_funil(env)
    prompt = (
        "Você avalia a qualidade de uma ligação comercial da equipe Babel.\n"
        "No diálogo, 'Mentor' é a nossa equipe e 'Lead' é o cliente.\n\n"
        + ("NOSSO ROTEIRO (a régua):\n" + roteiro + "\n\n" if roteiro else "")
        + "Avalie SOMENTE o desempenho do MENTOR: abertura, escuta, condução,\n"
        "clareza, contorno de objeções e encaminhamento do próximo passo.\n"
        "Seja justo: ligação curta de qualificação não precisa cumprir o roteiro\n"
        "inteiro — avalie o que cabia naquele momento.\n\n"
        "Devolva SOMENTE JSON: {\"nota\": 0-10 (uma casa decimal), "
        "\"justificativa\": \"2-3 frases, em pt-BR, citando algo que a conversa mostra\"}\n\n"
        "DIÁLOGO:\n" + dialogo[:12000]
    )
    corpo = json.dumps({
        "model": "google/gemini-2.5-flash",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": "Bearer " + chave,
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            resposta = json.loads(resp.read())
        texto = resposta["choices"][0]["message"]["content"]
        texto = texto.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        aval = json.loads(texto)
        nota = float(aval.get("nota"))
        if not 0 <= nota <= 10:
            return None
        return {"nota": round(nota, 1),
                "justificativa": str(aval.get("justificativa") or "")[:500]}
    except Exception as erro:  # noqa: BLE001
        print(f"nota não avaliada: {erro}", flush=True)
        return None


def duracao_audio(wav):
    """Duração real do áudio em segundos (0 se não der para medir)."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", wav], capture_output=True, text=True)
        return int(float(r.stdout.strip() or 0))
    except Exception:  # noqa: BLE001
        return 0


def converter_mp3(wav):
    mp3 = wav.rsplit(".", 1)[0] + ".mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                    "-ac", "1", "-b:a", "64k", mp3], check=True)
    return mp3


def subir_gravacao(env, mp3, caminho_storage):
    with open(mp3, "rb") as f:
        api(env, "POST",
            env["SUPABASE_URL"] + "/storage/v1/object/gravacoes/" +
            caminho_storage, f.read(), content_type="audio/mpeg",
            headers_extra={"x-upsert": "true"})


def registrar_chamada(env, linha):
    api(env, "POST",
        env["SUPABASE_URL"] + "/rest/v1/calls?on_conflict=linked_id",
        json.dumps(linha, ensure_ascii=False).encode(),
        headers_extra={"Prefer": "resolution=merge-duplicates,return=minimal"})


def preparar(meta):
    """Monta a linha do banco a partir do metadado da chamada.

    Devolve (linha, atendida, resgate). Não transcreve nada — é rápido de
    propósito, para a chamada poder ser registrada antes do whisper rodar.
    """
    user_id = usuario_do_ramal(meta.get("ramal") or "")
    atendida = meta.get("status") == "ANSWERED" and meta.get("duracao_seg", 0) > 0

    # Early media: em alguns fixos o áudio corre sem a operadora sinalizar o
    # atendimento — a conversa acontece e o CDR fecha com 0s "não atendida".
    # Se o wav tem tamanho de conversa, transcreve e decide pelo CONTEÚDO em
    # vez de apagar (caso Fabrício 02/08: ~1min de conversa constava perdida).
    resgate = False
    if not atendida and os.path.exists(meta.get("wav", "")):
        dur_wav = duracao_audio(meta["wav"])
        if dur_wav >= 10:
            resgate = True
            atendida = True
            meta["duracao_seg"] = max(meta.get("duracao_seg", 0), dur_wav)

    linha = {
        "linked_id": meta["uniqueid"],
        "direcao": meta["direcao"],
        "numero_externo": meta.get("numero_externo"),
        "user_id": user_id,
        "ramal": meta.get("ramal"),
        "iniciada_em": meta.get("iniciada_em"),
        "atendida_em": meta.get("atendida_em"),
        "encerrada_em": meta.get("encerrada_em"),
        "duracao_seg": meta.get("duracao_seg", 0),
        "status": "atendida" if atendida else "perdida",
        "transcricao_status": "pendente",
    }
    return linha, atendida, resgate


def salvar_meta(arquivo, meta):
    """Grava o metadado de forma atômica — a thread de registro e o laço de
    transcrição leem o mesmo arquivo, e um JSON pela metade quebraria os dois."""
    tmp = arquivo + ".tmp"
    with open(tmp, "w") as f:
        json.dump(meta, f, ensure_ascii=False)
    os.replace(tmp, arquivo)


def marcar_registrado(arquivo):
    """Reserva a chamada: quem marcar primeiro é quem grava no banco."""
    try:
        with open(arquivo) as f:
            meta = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None  # já saiu da fila ou está sendo reescrito
    if meta.get("registrado"):
        return None
    meta["registrado"] = True
    salvar_meta(arquivo, meta)
    return meta


def registrar_cedo(env, arquivo):
    """Grava a chamada no banco ANTES de transcrever.

    A transcrição leva ~40s e a fila roda em série: sem isso, uma ligação
    esperava vários minutos para aparecer no placar e no histórico — e as
    últimas da fila esperavam a transcrição de todas as anteriores.
    O registro final (com áudio e transcrição) é um upsert por linked_id,
    então completa esta mesma linha depois.
    """
    meta = marcar_registrado(arquivo)
    if meta is None:
        return
    linha, _, _ = preparar(meta)
    registrar_chamada(env, linha)


def processar(env, arquivo):
    with open(arquivo) as f:
        meta = json.load(f)
    # Reserva antes de começar: se a thread de registro pegasse esta chamada
    # no meio da transcrição, gravaria "pendente" por cima do resultado final.
    if not meta.get("registrado"):
        meta["registrado"] = True
        salvar_meta(arquivo, meta)
    uid = meta["uniqueid"]
    linha, atendida, resgate = preparar(meta)
    user_id = linha["user_id"]
    wav = meta["wav"]
    if not atendida or not os.path.exists(wav):
        linha["transcricao_status"] = "sem_audio"
        registrar_chamada(env, linha)
        if os.path.exists(wav):
            os.remove(wav)
        os.replace(arquivo, os.path.join(PROCESSADOS, os.path.basename(arquivo)))
        return

    # Lados separados (gravados pelo MixMonitor): permitem saber QUEM falou.
    # Se não existirem (ligação antiga ou gravação de um lado só), cai no
    # modo antigo: transcrição corrida, sem divisão de falantes.
    #
    # Chamada curta não passa por aqui: dividir falantes custa DUAS passadas do
    # whisper, e em 20 segundos (quase sempre caixa postal ou "alô, não tenho
    # interesse") isso rende 2 turnos. Uma passada no mix resolve e libera a
    # fila para as ligações que importam.
    wav_vend = wav.replace(".wav", "-vend.wav")
    wav_lead = wav.replace(".wav", "-lead.wav")
    turnos = []
    texto = ""
    tem_lados = os.path.exists(wav_vend) or os.path.exists(wav_lead)
    curta = (meta.get("duracao_seg", 0) or 0) < SEG_MIN_DIARIZAR
    chave_dg = chave_api(env, "deepgram")

    # Deepgram primeiro: pontuação de verdade e ~R$0,03/min. Com API, vale
    # diarizar até as curtas (o custo de 2 passadas era do whisper na CPU).
    if chave_dg and tem_lados:
        try:
            turnos, texto = montar_dialogo(
                wav_vend, wav_lead,
                transcreve=lambda w: transcrever_deepgram_segmentos(chave_dg, w))
        except Exception as erro:  # noqa: BLE001 — API fora → whisper local
            print(f"deepgram falhou nos lados ({erro}); whisper local", flush=True)
            turnos = []
    if not turnos and not curta and tem_lados:
        turnos, texto = montar_dialogo(wav_vend, wav_lead)
    if not turnos:
        texto = ""
        if chave_dg:
            try:
                texto = " ".join(
                    x for _, x in transcrever_deepgram_segmentos(chave_dg, wav))
            except Exception as erro:  # noqa: BLE001
                print(f"deepgram falhou no mix ({erro}); whisper local", flush=True)
        if not texto.strip():
            texto = transcrever(wav)

    # resgate sem fala de verdade (tom de chamada, caixa postal muda): descarta
    if resgate and len((texto or "").strip()) < 40:
        linha["status"] = "perdida"
        linha["duracao_seg"] = 0
        linha["transcricao_status"] = "sem_audio"
        registrar_chamada(env, linha)
        for f in (wav, wav_vend, wav_lead):
            if os.path.exists(f):
                os.remove(f)
        os.replace(arquivo, os.path.join(PROCESSADOS, os.path.basename(arquivo)))
        print(f"chamada {uid}: resgate descartado (áudio sem fala)", flush=True)
        return

    mp3 = converter_mp3(wav)
    pasta = user_id or "sem-usuario"
    caminho_storage = f"{pasta}/{uid}.mp3"
    subir_gravacao(env, mp3, caminho_storage)
    linha["gravacao_path"] = caminho_storage
    linha["transcricao"] = texto
    linha["transcricao_status"] = "concluida"
    if turnos:
        linha["transcricao_turnos"] = turnos

    # Dossiê e nota são duas idas ao OpenRouter, cada uma de dezenas de
    # segundos. São espera de rede, não CPU — rodando juntas, a fila anda na
    # metade do tempo. Se qualquer uma falhar, a transcrição vai assim mesmo.
    saida = {}
    def _tarefa(nome, fn):
        try:
            saida[nome] = fn()
        except Exception as erro:  # noqa: BLE001 — nenhuma delas pode derrubar
            print(f"{nome} falhou: {erro}", flush=True)
    fios = [
        threading.Thread(target=_tarefa, args=("dossie", lambda: extrair_dossie(env, texto))),
        threading.Thread(target=_tarefa, args=("aval", lambda: avaliar_qualidade(
            env, texto, meta.get("duracao_seg", 0)))),
    ]
    for f in fios:
        f.start()
    for f in fios:
        f.join()
    dossie = saida.get("dossie")
    if dossie:
        linha["dossie"] = dossie
    aval = saida.get("aval")
    if aval:
        linha["nota_ia"] = aval["nota"]
        linha["nota_justificativa"] = aval["justificativa"]
    registrar_chamada(env, linha)

    for f in (wav, mp3, wav_vend, wav_lead):
        if os.path.exists(f):
            os.remove(f)
    os.replace(arquivo, os.path.join(PROCESSADOS, os.path.basename(arquivo)))
    quem = f", {len(turnos)} turnos" if turnos else ""
    print(f"chamada {uid} transcrita ({len(texto)} chars{quem})"
          + (" + dossiê" if dossie else ""), flush=True)


def marcar_erro(env, arquivo, erro):
    try:
        with open(arquivo) as f:
            meta = json.load(f)
        meta["tentativas"] = meta.get("tentativas", 0) + 1
        meta["ultimo_erro"] = str(erro)[:300]
        salvar_meta(arquivo, meta)
        if meta["tentativas"] >= MAX_TENTATIVAS:
            os.replace(arquivo, os.path.join(ERRO, os.path.basename(arquivo)))
            # Registra com TODOS os metadados: sem isso a chamada ficava
            # "sem dono" no histórico e fora do placar do vendedor.
            atendida = (meta.get("status") == "ANSWERED"
                        and meta.get("duracao_seg", 0) > 0)
            registrar_chamada(env, {
                "linked_id": meta["uniqueid"],
                "direcao": meta.get("direcao", "entrada"),
                "numero_externo": meta.get("numero_externo"),
                "user_id": usuario_do_ramal(meta.get("ramal") or ""),
                "ramal": meta.get("ramal"),
                "iniciada_em": meta.get("iniciada_em"),
                "atendida_em": meta.get("atendida_em"),
                "encerrada_em": meta.get("encerrada_em"),
                "duracao_seg": meta.get("duracao_seg", 0),
                "status": "atendida" if atendida else "perdida",
                "transcricao_status": "erro",
            })
    except Exception as e2:  # noqa: BLE001
        print(f"falha ao marcar erro de {arquivo}: {e2}", flush=True)


def registrar_pendentes(env):
    """Passada rápida: joga no banco tudo que ainda não foi registrado."""
    for nome in sorted(os.listdir(FILA)):
        if not nome.endswith(".json"):
            continue
        try:
            registrar_cedo(env, os.path.join(FILA, nome))
        except Exception as erro:  # noqa: BLE001 — não pode travar a fila
            print(f"registro rápido falhou em {nome}: {erro}", flush=True)


def laco_registro(env):
    """Thread dedicada ao registro rápido.

    Fica fora do laço de transcrição de propósito: assim a ligação entra no
    placar em segundos mesmo com a fila do whisper cheia. Sem isso, o pior
    caso era esperar a transcrição em curso terminar (~40 a 90s).
    """
    while True:
        try:
            registrar_pendentes(env)
        except Exception as erro:  # noqa: BLE001 — a thread não pode morrer
            print(f"laço de registro: {erro}", flush=True)
        time.sleep(REGISTRO_SEG)


def main():
    env = carregar_env()
    threading.Thread(target=laco_registro, args=(env,), daemon=True).start()
    while True:
        # Mais RECENTE primeiro (o nome do arquivo começa pelo epoch da
        # chamada). Numa fila atrasada, o que o mentor quer ver é a ligação
        # que ele acabou de fazer — não a de duas horas atrás. As antigas
        # continuam saindo, só que depois.
        for nome in sorted(os.listdir(FILA), reverse=True):
            if not nome.endswith(".json"):
                continue
            arquivo = os.path.join(FILA, nome)
            comeco = time.monotonic()
            try:
                processar(env, arquivo)
            except Exception as erro:  # noqa: BLE001 — serviço não pode morrer
                print(f"erro em {nome}: {erro}", flush=True)
                marcar_erro(env, arquivo, erro)
            gasto = time.monotonic() - comeco
            if gasto > 60:
                print(f"ATENÇÃO: {nome} levou {gasto:.0f}s "
                      f"(fila com {len(os.listdir(FILA))})", flush=True)
        time.sleep(INTERVALO_SEG)


if __name__ == "__main__":
    main()
