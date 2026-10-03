#!/usr/bin/env python3
"""Re-transcrição do histórico de chamadas com Deepgram nova-3.

Roda UMA vez (04/08/2026). Para cada chamada com gravação no Storage:
  1. baixa o mp3;
  2. transcreve no Deepgram (pontuação de verdade, palavra a palavra);
  3. herda o falante dos turnos antigos (whisper) por sobreposição de tempo —
     palavra a palavra, então fala emendada não contamina o vizinho;
  4. re-extrai o dossiê e re-avalia a nota sobre o texto bom.

Antes de alterar qualquer linha, grava backup JSONL completo em
/root/backup-transcricoes-<data>.jsonl. Nada é apagado do Storage.

Uso:  python3 retranscrever.py [--amostra N]   (N chamadas, sem gravar no banco)
      python3 retranscrever.py --refinar-turnos   (2ª passada: falantes com
          gemini-2.5-pro nas chamadas com turnos; referência vem do backup)
      python3 retranscrever.py --dossies [id_min]  (re-gera SÓ dossiê+nota a
          partir do texto já bom no banco — para completar o que o 402 do
          OpenRouter derrubou na 1ª passada; sem custo de Deepgram)
"""
import bisect
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request

sys.path.insert(0, "/opt/babel")
import transcritor as t  # noqa: E402 — reusa api(), chave_api(), dossiê, nota

BACKUP = "/root/backup-transcricoes-2026-08-04.jsonl"
ROTULO = {"vendedor": "Mentor", "lead": "Lead"}
# flash oscila entre execuções na tarefa de alinhamento (mesma temperatura 0,
# providers diferentes); o refino dos turnos usa o pro, que é estável.
ROTULO_MODELO = "google/gemini-2.5-flash"


def listar_chamadas(env):
    """Todas as chamadas com gravação, mais antigas primeiro (id crescente)."""
    linhas, offset = [], 0
    while True:
        bruto = t.api(env, "GET",
                      env["SUPABASE_URL"] + "/rest/v1/calls"
                      "?select=id,gravacao_path,duracao_seg,transcricao,"
                      "transcricao_turnos,dossie,nota_ia,nota_justificativa"
                      "&gravacao_path=not.is.null&order=id"
                      f"&limit=100&offset={offset}", None)
        pagina = json.loads(bruto)
        linhas += pagina
        if len(pagina) < 100:
            return linhas
        offset += 100


def baixar_mp3(env, caminho_storage, destino):
    url = (env["SUPABASE_URL"] + "/storage/v1/object/gravacoes/"
           + urllib.parse.quote(caminho_storage))
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE"]})
    with urllib.request.urlopen(req, timeout=120) as resp:
        with open(destino, "wb") as f:
            f.write(resp.read())


def transcrever_palavras(chave, mp3):
    """Deepgram no mix → lista de palavras [{start, texto}] já pontuadas."""
    with open(mp3, "rb") as f:
        corpo = f.read()
    req = urllib.request.Request(
        "https://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR"
        "&punctuate=true&utterances=true",
        data=corpo, headers={"Authorization": "Token " + chave,
                             "Content-Type": "audio/mpeg"}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        dados = json.loads(resp.read())
    palavras = []
    for u in (dados.get("results") or {}).get("utterances") or []:
        for w in u.get("words") or []:
            texto = (w.get("punctuated_word") or w.get("word") or "").strip()
            if texto:
                palavras.append({"start": float(w.get("start") or 0),
                                 "texto": texto})
    return palavras


def montar_sentencas(palavras):
    """Agrupa as palavras em frases → [{"inicio": s, "texto": "..."}]."""
    sentencas, atual = [], None
    for p in palavras:
        if atual is None:
            atual = {"inicio": round(p["start"], 1), "texto": p["texto"]}
        else:
            atual["texto"] += " " + p["texto"]
        if p["texto"][-1:] in ".?!…" or len(atual["texto"]) > 240:
            sentencas.append(atual)
            atual = None
    if atual:
        sentencas.append(atual)
    return sentencas


def falante_no_tempo(turnos_antigos):
    """Devolve fn(t) → falante vigente em t segundos, pelos turnos antigos."""
    antigos = sorted(turnos_antigos, key=lambda x: float(x.get("inicio") or 0))
    inicios = [float(x.get("inicio") or 0) for x in antigos]

    def em(tempo):
        i = bisect.bisect_right(inicios, tempo) - 1
        return antigos[max(i, 0)].get("falante") or "vendedor"
    return em


def rotular_falantes_llm(env, sentencas, turnos_antigos):
    """Classifica o falante de cada frase via LLM — sem reescrever texto.

    A referência são os turnos antigos COM tempo: texto ruim, mas falante e
    momento certos (vieram de canais de áudio separados). O modelo alinha
    cada frase nova ao trecho antigo por tempo próximo + palavras parecidas.
    Qualquer falha (chave, formato, tamanho) devolve None → palpite por tempo.
    """
    chave = t.chave_api(env, "openrouter")
    if not chave or not sentencas:
        return None
    referencia = "\n".join(
        f"[{float(x.get('inicio') or 0):.0f}s] "
        f"{ROTULO.get(x.get('falante'), 'Mentor')}: {x.get('texto', '')}"
        for x in sorted(turnos_antigos,
                        key=lambda x: float(x.get("inicio") or 0)))
    linhas = "\n".join(
        f"{i}. [{s['inicio']:.0f}s] {s['texto']}"
        for i, s in enumerate(sentencas))
    prompt = (
        "Você corrige a divisão de falantes de uma ligação comercial "
        "transcrita duas vezes a partir do MESMO áudio.\n\n"
        "REFERÊNCIA — transcrição antiga: o texto está cheio de erros de "
        "audição, mas o FALANTE e o TEMPO de cada trecho estão corretos "
        "(vieram de canais de áudio separados). 'Mentor' = vendedor (nossa "
        "equipe); 'Lead' = cliente:\n"
        + referencia[:6000] +
        "\n\nNOVA transcrição (texto correto), frases numeradas com tempo:\n"
        + linhas[:8000] +
        "\n\nPara CADA frase nova, encontre o trecho correspondente na "
        "referência — tempo próximo (defasagem de até ~3s) e palavras "
        "parecidas, mesmo com erros — e copie o falante dele. Confira com a "
        "lógica da conversa: quem pergunta, quem responde, quem se "
        "apresenta.\n"
        f"Devolva SOMENTE JSON: {{\"falantes\": [...]}} com exatamente "
        f"{len(sentencas)} itens, cada um \"vendedor\" ou \"lead\"."
    )
    corpo = json.dumps({
        "model": ROTULO_MODELO,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0,
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
        rotulos = json.loads(texto).get("falantes")
        if (isinstance(rotulos, list) and len(rotulos) == len(sentencas)
                and all(r in ("vendedor", "lead") for r in rotulos)):
            return rotulos
    except Exception as erro:  # noqa: BLE001
        print(f"  rótulo LLM falhou: {erro}", flush=True)
    return None


def montar_com_falantes(env, palavras, turnos_antigos):
    """Frases novas + falantes herdados (LLM alinha; tempo puro é o plano B)."""
    sentencas = montar_sentencas(palavras)
    em = falante_no_tempo(turnos_antigos)
    palpites = [em(s["inicio"]) for s in sentencas]
    rotulos = rotular_falantes_llm(env, sentencas, turnos_antigos) or palpites
    turnos = []
    for s, falante in zip(sentencas, rotulos):
        if turnos and turnos[-1]["falante"] == falante:
            turnos[-1]["texto"] += " " + s["texto"]
        else:
            turnos.append({"falante": falante, "inicio": s["inicio"],
                           "texto": s["texto"]})
    texto = "\n".join(f"{ROTULO.get(x['falante'], x['falante'])}: {x['texto']}"
                      for x in turnos)
    return turnos, texto


def processar_chamada(env, chave_dg, linha, gravar):
    cid = linha["id"]
    mp3 = f"/tmp/retrans-{cid}.mp3"
    try:
        baixar_mp3(env, linha["gravacao_path"], mp3)
    except Exception as erro:  # noqa: BLE001
        return f"#{cid}: sem áudio no Storage ({str(erro)[:80]})"
    try:
        palavras = transcrever_palavras(chave_dg, mp3)
    finally:
        if os.path.exists(mp3):
            os.remove(mp3)
    if not palavras:
        return f"#{cid}: Deepgram não ouviu fala — mantida como está"

    if linha.get("transcricao_turnos"):
        turnos, texto = montar_com_falantes(env, palavras,
                                            linha["transcricao_turnos"])
    else:
        turnos = None
        texto = " ".join(p["texto"] for p in palavras)

    novo = {"transcricao": texto}
    if turnos:
        novo["transcricao_turnos"] = turnos

    # Dossiê e nota sobre o texto bom (mesmas travas do transcritor: a nota
    # exige 60s+ e 200+ chars; o dossiê, 80+ chars). Falha = mantém o antigo.
    saida = {}
    def _tarefa(nome, fn):
        try:
            saida[nome] = fn()
        except Exception as erro:  # noqa: BLE001
            print(f"  #{cid} {nome} falhou: {erro}", flush=True)
    fios = [threading.Thread(target=_tarefa, args=("dossie", lambda: t.extrair_dossie(env, texto))),
            threading.Thread(target=_tarefa, args=("aval", lambda: t.avaliar_qualidade(
                env, texto, linha.get("duracao_seg") or 0)))]
    for f in fios:
        f.start()
    for f in fios:
        f.join()
    if saida.get("dossie"):
        novo["dossie"] = saida["dossie"]
    if saida.get("aval"):
        novo["nota_ia"] = saida["aval"]["nota"]
        novo["nota_justificativa"] = saida["aval"]["justificativa"]

    if gravar:
        t.api(env, "PATCH",
              env["SUPABASE_URL"] + f"/rest/v1/calls?id=eq.{cid}",
              json.dumps(novo, ensure_ascii=False).encode(),
              headers_extra={"Prefer": "return=minimal"})
    else:
        print(f"--- #{cid} (amostra, nada gravado) ---")
        print(texto[:600])
    extras = [k for k in ("dossie", "nota_ia") if k in novo]
    return (f"#{cid}: ok ({len(texto)} chars"
            + (f", {len(turnos)} turnos" if turnos else ", texto corrido")
            + (", " + "+".join(extras) if extras else "") + ")")


def main():
    global ROTULO_MODELO
    amostra = 0
    if "--amostra" in sys.argv:
        amostra = int(sys.argv[sys.argv.index("--amostra") + 1])
    refinar = "--refinar-turnos" in sys.argv
    env = t.carregar_env()
    chave_dg = t.chave_api(env, "deepgram")
    if not chave_dg:
        sys.exit("sem chave deepgram na chaves_api")

    if "--dossies" in sys.argv:
        pos = sys.argv.index("--dossies")
        id_min = int(sys.argv[pos + 1]) if len(sys.argv) > pos + 1 else 0
        chamadas = [c for c in listar_chamadas(env) if c["id"] >= id_min]
        print(f"dossiês/notas: {len(chamadas)} chamadas (id >= {id_min})", flush=True)
        ok = erros = 0
        for n, linha in enumerate(chamadas, 1):
            texto = linha.get("transcricao") or ""
            novo, saida = {}, {}
            fios = [threading.Thread(target=lambda s=saida: s.update(
                        dossie=t.extrair_dossie(env, texto))),
                    threading.Thread(target=lambda s=saida: s.update(
                        aval=t.avaliar_qualidade(env, texto,
                                                 linha.get("duracao_seg") or 0)))]
            for f in fios:
                f.start()
            for f in fios:
                f.join()
            if saida.get("dossie"):
                novo["dossie"] = saida["dossie"]
            if saida.get("aval"):
                novo["nota_ia"] = saida["aval"]["nota"]
                novo["nota_justificativa"] = saida["aval"]["justificativa"]
            if novo:
                try:
                    t.api(env, "PATCH",
                          env["SUPABASE_URL"] + f"/rest/v1/calls?id=eq.{linha['id']}",
                          json.dumps(novo, ensure_ascii=False).encode(),
                          headers_extra={"Prefer": "return=minimal"})
                    ok += 1
                except Exception as erro:  # noqa: BLE001
                    erros += 1
                    print(f"#{linha['id']}: ERRO {str(erro)[:120]}", flush=True)
            print(f"[{n}/{len(chamadas)}] #{linha['id']}: "
                  + ("+".join(novo) if novo else "nada (travas/402)"), flush=True)
        print(f"fim: {ok} atualizadas, {erros} erros", flush=True)
        return

    if refinar:
        # 2ª passada, só nas chamadas com falantes: a REFERÊNCIA de falante
        # tem que ser a do whisper original (canais separados) — vem do
        # backup, nunca do banco (que já tem os rótulos da 1ª passada).
        ROTULO_MODELO = "google/gemini-2.5-pro"
        with open(BACKUP) as f:
            chamadas = [json.loads(l) for l in f]
        chamadas = [c for c in chamadas if c.get("transcricao_turnos")]
        print(f"refino de turnos: {len(chamadas)} chamadas, "
              f"modelo {ROTULO_MODELO}", flush=True)
    else:
        chamadas = listar_chamadas(env)
        print(f"{len(chamadas)} chamadas com gravação", flush=True)

    if not amostra and not os.path.exists(BACKUP):
        with open(BACKUP, "w") as f:
            for linha in chamadas:
                f.write(json.dumps(linha, ensure_ascii=False) + "\n")
        print(f"backup salvo: {BACKUP}", flush=True)

    if amostra:
        # amostra: pega chamadas com conteúdo de verdade, sem gravar nada
        chamadas = [c for c in chamadas
                    if (c.get("duracao_seg") or 0) >= 40][-amostra:]

    ok = erros = 0
    comeco = time.time()
    for n, linha in enumerate(chamadas, 1):
        try:
            resultado = processar_chamada(env, chave_dg, linha,
                                          gravar=not amostra)
            ok += 1
        except Exception as erro:  # noqa: BLE001 — segue para a próxima
            resultado = f"#{linha['id']}: ERRO {str(erro)[:120]}"
            erros += 1
        print(f"[{n}/{len(chamadas)}] {resultado}", flush=True)
    print(f"fim: {ok} ok, {erros} erros, {(time.time()-comeco)/60:.0f} min", flush=True)


if __name__ == "__main__":
    main()
