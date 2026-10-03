#!/bin/bash
# Enfileira os metadados da chamada finalizada para o transcritor Babel.
# Uso: fim_chamada.sh UNIQUEID DIRECAO NUMERO RAMAL INICIO ATENDIDA FIM BILLSEC DISPOSITION
python3 - "$@" <<'PY'
import json
import os
import subprocess
import sys

campos = (sys.argv[1:] + [""] * 9)[:9]
u, direcao, numero, ramal, inicio, atendida, fim, billsec, disp = campos

# Blindagem: chamada de sistema/teste sem número E sem ramal não vira registro
# (era o que gerava "ligações-fantasma" sem dono no histórico).
if not numero.strip() and not ramal.strip():
    sys.exit(0)


def iso(texto):
    if not texto.strip():
        return None
    r = subprocess.run(["date", "-d", texto, "+%FT%T%:z"],
                       capture_output=True, text=True)
    return r.stdout.strip() or None


dados = {
    "uniqueid": u,
    "direcao": "entrada" if direcao == "entrada" else "saida",
    "numero_externo": numero or None,
    "ramal": ramal or None,
    "iniciada_em": iso(inicio),
    "atendida_em": iso(atendida),
    "encerrada_em": iso(fim),
    "duracao_seg": int(billsec or 0),
    "status": disp or "DESCONHECIDO",
    "wav": f"/var/spool/babel/gravacoes/{u}.wav",
    "tentativas": 0,
}
destino = f"/var/spool/babel/fila/{u}.json"
with open(destino + ".tmp", "w") as f:
    json.dump(dados, f, ensure_ascii=False)
os.replace(destino + ".tmp", destino)
PY
