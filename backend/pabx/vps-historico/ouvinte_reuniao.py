#!/usr/bin/env python3
"""Ouvinte do app Reunião (BABEL OS) — grava uma faixa de áudio POR participante.

Descobre salas `os-*` no LiveKit local (poll twirp 5s), entra em cada uma como
participante OCULTO (grant hidden, só escuta) e escreve o áudio de cada pessoa
em PCM cru 16 kHz mono: /var/spool/babel/reuniao/<sala_id>/<peer_id>.pcm.
O transcritor_reuniao.py lê os deltas e roda o whisper — faixa separada =
"quem disse o quê" garantido, sem diarização por IA.

Sala esvaziou → desconecta, grava marcador `fim` e o transcritor limpa depois.
Config em /opt/babel/reuniao.env. Sem dependência além do pacote `livekit`.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request

from livekit import rtc

ENV_PATH = "/opt/babel/reuniao.env"
BASE = "/var/spool/babel/reuniao"
TAXA = 16000          # 16 kHz mono s16le — formato que o whisper.cpp quer
POLL_SEG = 5


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


# ─── JWT HS256 na mão (stdlib) — token de servidor e de bot ──────────────────

def _b64url(dados: bytes) -> bytes:
    return base64.urlsafe_b64encode(dados).rstrip(b"=")


def token_livekit(grants: dict, identidade: str, ttl_seg: int = 3600) -> str:
    agora = int(time.time())
    cabecalho = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    corpo = _b64url(json.dumps({
        "iss": ENV["LIVEKIT_API_KEY"],
        "sub": identidade,
        "iat": agora,
        "nbf": agora - 10,
        "exp": agora + ttl_seg,
        "video": grants,
    }).encode())
    assinatura = _b64url(hmac.new(
        ENV["LIVEKIT_API_SECRET"].encode(), cabecalho + b"." + corpo, hashlib.sha256).digest())
    return (cabecalho + b"." + corpo + b"." + assinatura).decode()


def listar_salas() -> list[dict]:
    req = urllib.request.Request(
        ENV["LIVEKIT_HTTP"] + "/twirp/livekit.RoomService/ListRooms",
        data=b"{}", method="POST",
        headers={"Authorization": "Bearer " + token_livekit({"roomList": True}, "ouvinte-admin", 120),
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.load(resp).get("rooms") or []


# ─── Sessão de uma sala ──────────────────────────────────────────────────────

def info_sala_plataforma(sala_id: str) -> dict:
    """tenant_id da sala no Supabase da plataforma (service_role)."""
    req = urllib.request.Request(
        ENV["PLATAFORMA_SUPABASE_URL"] + "/rest/v1/salas_reuniao"
        f"?id=eq.{sala_id}&select=tenant_id&limit=1",
        headers={"apikey": ENV["PLATAFORMA_SERVICE_ROLE"],
                 "Authorization": "Bearer " + ENV["PLATAFORMA_SERVICE_ROLE"]})
    with urllib.request.urlopen(req, timeout=10) as resp:
        linhas = json.load(resp)
    return linhas[0] if linhas else {}


class SessaoSala:
    def __init__(self, nome_sala: str):
        self.nome_sala = nome_sala                      # ex.: os-<uuid>
        self.sala_id = nome_sala.removeprefix("os-")
        self.dir = os.path.join(BASE, self.sala_id)
        self.room: rtc.Room | None = None
        self.tarefas: set[asyncio.Task] = set()
        self.encerrada = False

    def _meta(self, participante: rtc.RemoteParticipant | None = None):
        caminho = os.path.join(self.dir, "meta.json")
        try:
            with open(caminho) as f:
                meta = json.load(f)
        except Exception:
            meta = {"sala_id": self.sala_id, "tenant_id": None, "participantes": {}}
        if meta.get("tenant_id") is None:
            meta["tenant_id"] = info_sala_plataforma(self.sala_id).get("tenant_id")
        if participante is not None:
            nome = participante.name or participante.identity
            meta["participantes"][participante.identity] = {
                "nome": nome,
                # convidado é marcado pela edge sala-reuniao no nome do token
                "do_time": "(convidado)" not in nome,
            }
        with open(caminho, "w") as f:
            json.dump(meta, f, ensure_ascii=False)

    async def _gravar_track(self, track: rtc.Track, participante: rtc.RemoteParticipant):
        destino = os.path.join(self.dir, f"{participante.identity}.pcm")
        try:
            stream = rtc.AudioStream(track, sample_rate=TAXA, num_channels=1)
        except TypeError:
            # versão antiga sem reamostragem embutida — grava na taxa nativa e
            # deixa o transcritor reamostrar (ffmpeg)
            stream = rtc.AudioStream(track)
        try:
            async for evento in stream:
                quadro = evento.frame
                with open(destino, "ab") as f:
                    f.write(bytes(quadro.data))
        except Exception as erro:
            print(f"[{self.nome_sala}] gravação {participante.identity}: {erro}", flush=True)

    async def rodar(self):
        os.makedirs(self.dir, exist_ok=True)
        self._meta()
        self.room = rtc.Room()

        @self.room.on("track_subscribed")
        def _ao_assinar(track, publicacao, participante):
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                return
            self._meta(participante)
            tarefa = asyncio.create_task(self._gravar_track(track, participante))
            self.tarefas.add(tarefa)
            tarefa.add_done_callback(self.tarefas.discard)

        @self.room.on("participant_connected")
        def _ao_entrar(participante):
            self._meta(participante)

        token = token_livekit({
            "room": self.nome_sala, "roomJoin": True,
            "canSubscribe": True, "canPublish": False, "hidden": True,
        }, "__ouvinte__", ttl_seg=6 * 3600)
        await self.room.connect(ENV["LIVEKIT_URL"], token)
        print(f"[{self.nome_sala}] ouvindo", flush=True)

        # vive enquanto tiver gente de verdade na sala
        while True:
            await asyncio.sleep(5)
            vivos = [p for p in self.room.remote_participants.values()]
            if not vivos:
                break
        await self.encerrar()

    async def encerrar(self):
        if self.encerrada:
            return
        self.encerrada = True
        try:
            if self.room:
                await self.room.disconnect()
        except Exception:
            pass
        for tarefa in list(self.tarefas):
            tarefa.cancel()
        # marcador pro transcritor saber que pode fechar e limpar a sala
        try:
            open(os.path.join(self.dir, "fim"), "w").close()
        except OSError:
            pass
        print(f"[{self.nome_sala}] encerrada", flush=True)


# ─── Laço principal ──────────────────────────────────────────────────────────

async def principal():
    os.makedirs(BASE, exist_ok=True)
    sessoes: dict[str, SessaoSala] = {}
    while True:
        try:
            salas = listar_salas()
        except Exception as erro:
            print(f"ListRooms falhou: {erro}", flush=True)
            salas = []
        nomes_vivos = set()
        for sala in salas:
            nome = sala.get("name") or ""
            participantes = int(sala.get("num_participants") or sala.get("numParticipants") or 0)
            if not nome.startswith("os-") or participantes == 0:
                continue
            nomes_vivos.add(nome)
            if nome not in sessoes:
                sessao = SessaoSala(nome)
                sessoes[nome] = sessao
                tarefa = asyncio.create_task(sessao.rodar())
                tarefa.add_done_callback(lambda _t, n=nome: sessoes.pop(n, None))
        # sala sumiu do servidor → garante encerramento
        for nome, sessao in list(sessoes.items()):
            if nome not in nomes_vivos and sessao.room is not None:
                await sessao.encerrar()
                sessoes.pop(nome, None)
        await asyncio.sleep(POLL_SEG)


if __name__ == "__main__":
    asyncio.run(principal())
