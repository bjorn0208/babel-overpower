#!/usr/bin/env python3
"""Provisionador de ramais do PABX Babel.

Lê os vendedores ativos no Supabase e gera os ramais WebRTC do Asterisk
(pjsip_ramais.conf, extensions_ramais.conf e ramais.json). Recarrega o
Asterisk somente quando algo mudou. Roda em loop contínuo (systemd).
"""
import json
import os
import subprocess
import time
import urllib.request

ENV_PATH = "/opt/babel/babel.env"
PJSIP_RAMAIS = "/etc/asterisk/pjsip_ramais.conf"
EXT_RAMAIS = "/etc/asterisk/extensions_ramais.conf"
RAMAIS_JSON = "/opt/babel/ramais.json"
INTERVALO_SEG = 20   # provisionamento completo (ramais, limites)
PULSO_SEG = 5        # atualização de "quem está em ligação agora"
DID = "1152863430"

MODELO_RAMAL = """
[auth-{ramal}]
type=auth
auth_type=userpass
username={ramal}
password={senha}

[{ramal}]
type=aor
max_contacts=3
remove_existing=yes

[{ramal}]
type=endpoint
transport=transport-wss
context=discagem-interna
disallow=all
allow=opus
allow=ulaw
allow=alaw
auth=auth-{ramal}
aors={ramal}
webrtc=yes
use_avpf=yes
media_encryption=dtls
dtls_verify=fingerprint
dtls_cert_file=/etc/asterisk/keys/pabx.crt
dtls_private_key=/etc/asterisk/keys/pabx.key
dtls_setup=actpass
ice_support=yes
rtcp_mux=yes
force_rport=yes
rewrite_contact=yes
rtp_symmetric=yes
direct_media=no
callerid={nome} <{did}>
"""
# rtp_symmetric=yes: celular atrás de NAT móvel — devolve RTP para a origem real.
# direct_media=no: Asterisk fica no meio da mídia para fazer a ponte
#   DTLS-SRTP (navegador) <-> RTP (operadora) e permitir a gravação.


def carregar_env():
    env = {}
    with open(ENV_PATH) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                env[chave] = valor
    return env


def sb(env, metodo, caminho, corpo=None, prefer=None):
    req = urllib.request.Request(
        env["SUPABASE_URL"] + "/rest/v1/" + caminho,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method=metodo,
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE"],
            "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE"],
            "Content-Type": "application/json",
            **({"Prefer": prefer} if prefer else {}),
        })
    with urllib.request.urlopen(req, timeout=15) as resp:
        dados = resp.read()
    return json.loads(dados) if dados else None


def buscar_vendedores(env):
    return sb(env, "GET", "profiles?select=user_id,nome,ramal,sip_password,ativo"
                          "&ativo=is.true&ramal=not.is.null&order=ramal")


def buscar_config(env, chave, padrao):
    linhas = sb(env, "GET", f"config?chave=eq.{chave}&select=valor") or []
    return linhas[0]["valor"] if linhas else padrao


def canais_ativos():
    """Lê do Asterisk quem está em ligação agora: [{ramal, numero, seg}]."""
    saida = subprocess.run(
        ["asterisk", "-rx", "core show channels concise"],
        capture_output=True, text=True, timeout=10).stdout
    ativos = []
    for linha in saida.splitlines():
        partes = linha.split("!")
        if len(partes) < 12 or not partes[0].startswith("PJSIP/"):
            continue
        nome_canal = partes[0].split("/", 1)[1]
        ramal = nome_canal.split("-", 1)[0]
        if not (ramal.isdigit() and len(ramal) == 4):
            continue  # só pernas de ramal (1001, 1002…)
        estado = partes[4]
        if estado not in ("Up", "Ring", "Ringing"):
            continue
        try:
            seg = int(partes[11])
        except (ValueError, IndexError):
            seg = 0
        ativos.append({"ramal": ramal,
                       "numero": partes[2] or partes[7] or "",
                       "em_chamada": estado == "Up",
                       "seg": seg})
    return ativos


def publicar_em_ligacao(env, ativos):
    sb(env, "PATCH", "config?chave=eq.em_ligacao",
       {"valor": json.dumps(ativos, ensure_ascii=False),
        "atualizado_em": "now()"})


def gerar_configs(vendedores, max_simultaneas):
    blocos = ["; Gerado pelo provisionador Babel — NÃO editar à mão\n"]
    for v in vendedores:
        blocos.append(MODELO_RAMAL.format(
            ramal=v["ramal"], senha=v["sip_password"],
            nome=v["nome"], did=DID))
    pjsip = "".join(blocos)

    grupo = "&".join("PJSIP/" + v["ramal"] for v in vendedores) or "PJSIP/1001"
    ext = ("; Gerado pelo provisionador Babel — NÃO editar à mão\n"
           f"GRUPO_VENDAS={grupo}\n"
           f"LIMITE_SIMULTANEAS={max_simultaneas}\n")

    mapa = {v["ramal"]: {"user_id": v["user_id"], "nome": v["nome"]}
            for v in vendedores}
    return pjsip, ext, json.dumps(mapa, ensure_ascii=False, indent=1)


def escrever_se_mudou(caminho, conteudo):
    atual = None
    if os.path.exists(caminho):
        with open(caminho) as f:
            atual = f.read()
    if atual == conteudo:
        return False
    tmp = caminho + ".tmp"
    with open(tmp, "w") as f:
        f.write(conteudo)
    os.replace(tmp, caminho)
    return True


def recarregar_asterisk():
    for cmd in ("pjsip reload", "dialplan reload"):
        subprocess.run(["asterisk", "-rx", cmd], check=False,
                       capture_output=True, timeout=30)


def ciclo(env):
    vendedores = buscar_vendedores(env)
    maximo = buscar_config(env, "max_simultaneas", "15")
    pjsip, ext, mapa = gerar_configs(vendedores, maximo)
    mudou = escrever_se_mudou(PJSIP_RAMAIS, pjsip)
    mudou = escrever_se_mudou(EXT_RAMAIS, ext) or mudou
    escrever_se_mudou(RAMAIS_JSON, mapa)
    if mudou:
        recarregar_asterisk()
        print(f"ramais atualizados: {[v['ramal'] for v in vendedores]} "
              f"(limite simultâneas: {maximo})", flush=True)
    publicar_em_ligacao(env, canais_ativos())


def main():
    env = carregar_env()
    ultimo_ciclo = 0.0
    while True:
        try:
            agora = time.monotonic()
            if agora - ultimo_ciclo >= INTERVALO_SEG:
                ciclo(env)  # provisionamento completo (já publica em_ligacao)
                ultimo_ciclo = agora
            else:
                # Entre um ciclo e outro só atualizamos quem está em ligação:
                # o webphone usa isso para bloquear o botão quando não há canal
                # livre, e 20s de atraso deixariam o mentor discar no vazio.
                publicar_em_ligacao(env, canais_ativos())
        except Exception as erro:  # noqa: BLE001 — serviço não pode morrer
            print(f"erro no ciclo: {erro}", flush=True)
        time.sleep(PULSO_SEG)


if __name__ == "__main__":
    main()
