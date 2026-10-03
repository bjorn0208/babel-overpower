#!/usr/bin/env python3
"""Ponte de teste do simulador: microfone do navegador ↔ motor da Bel.

O navegador conecta via WSS (Caddy → 127.0.0.1:9093), manda um JSON
{"chamada_id": ...} e daí em diante é áudio cru: PCM s16le 8 kHz nos dois
sentidos. A ponte liga esse fluxo no AudioSocket do motor (127.0.0.1:9092) —
ou seja, a conversa usa EXATAMENTE o mesmo pipeline da ligação real
(Smart Turn, fillers, ruído, barge-in, gravação), só troca o telefone
pelo navegador.
"""
import asyncio
import json
import re
import socket as socket_mod
import struct
import urllib.request
import uuid as uuid_mod
from datetime import datetime, timezone


def parse_ts(s):
    """Timestamp do Postgres → datetime, tolerante ao formato (o Python 3.10 é
    exigente: fração de 3 ou 6 dígitos e offset com dois-pontos)."""
    s = s.strip().replace("Z", "+00:00").replace(" ", "T", 1)
    s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], s)
    s = re.sub(r"([+-]\d{2})$", r"\1:00", s)   # +00 → +00:00
    return datetime.fromisoformat(s)

import websockets

ENV_PATH = "/opt/babel/babel.env"
MOTOR = ("127.0.0.1", 9092)
PORTA = 9093


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


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def valida_chamada(chamada_id):
    """Só aceita simulações legítimas: linha 'sim' criada há pouco pelo painel."""
    try:
        url = (ENV["SUPABASE_URL"] + "/rest/v1/ia_chamadas"
               f"?id=eq.{chamada_id}&numero=eq.sim&status=eq.ligando&select=id,criado_em")
        req = urllib.request.Request(url, headers={
            "apikey": ENV["SUPABASE_SERVICE_ROLE"],
            "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_ROLE"],
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            linhas = json.loads(resp.read())
        if not linhas:
            return False
        criado = parse_ts(linhas[0]["criado_em"])
        return (datetime.now(timezone.utc) - criado).total_seconds() < 180
    except Exception as erro:
        log(f"validação falhou: {erro}")
        return False


async def recv_exato(loop, sock, n):
    dados = b""
    while len(dados) < n:
        parte = await loop.sock_recv(sock, n - len(dados))
        if not parte:
            raise ConnectionError("motor fechou")
        dados += parte
    return dados


async def atender(ws):
    # 1º frame: JSON com o id da simulação
    try:
        inicial = await asyncio.wait_for(ws.recv(), timeout=10)
        chamada_id = json.loads(inicial)["chamada_id"]
    except Exception:
        await ws.close()
        return
    if not valida_chamada(chamada_id):
        log(f"chamada recusada: {chamada_id[:8]}")
        await ws.close(code=4403, reason="chamada inválida")
        return
    log(f"simulação {chamada_id[:8]}: navegador conectado")

    loop = asyncio.get_event_loop()
    sock = socket_mod.socket(socket_mod.AF_INET, socket_mod.SOCK_STREAM)
    sock.setblocking(False)
    await loop.sock_connect(sock, MOTOR)
    # apresenta a "chamada" ao motor (mesmo aperto de mão do Asterisk)
    await loop.sock_sendall(
        sock, b"\x01" + struct.pack(">H", 16) + uuid_mod.UUID(chamada_id).bytes)

    async def navegador_para_motor():
        resto = b""
        try:
            async for dados in ws:
                if not isinstance(dados, (bytes, bytearray)):
                    continue
                resto += bytes(dados)
                while len(resto) >= 320:
                    quadro, resto = resto[:320], resto[320:]
                    await loop.sock_sendall(
                        sock, b"\x10" + struct.pack(">H", 320) + quadro)
        except Exception:
            pass

    async def motor_para_navegador():
        try:
            while True:
                cab = await recv_exato(loop, sock, 3)
                tipo = cab[0]
                tam = struct.unpack(">H", cab[1:3])[0]
                dados = await recv_exato(loop, sock, tam) if tam else b""
                if tipo == 0x00:
                    break
                if tipo == 0x10 and dados:
                    await ws.send(dados)
        except Exception:
            pass

    t1 = asyncio.create_task(navegador_para_motor())
    t2 = asyncio.create_task(motor_para_navegador())
    _, pendentes = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
    for p in pendentes:
        p.cancel()
    try:
        sock.close()
    except Exception:
        pass
    try:
        await ws.close()
    except Exception:
        pass
    log(f"simulação {chamada_id[:8]}: encerrada")


async def principal():
    async with websockets.serve(atender, "127.0.0.1", PORTA, max_size=2 ** 20):
        log(f"ponte de teste ouvindo em 127.0.0.1:{PORTA}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(principal())
