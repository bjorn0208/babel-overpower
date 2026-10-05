#!/usr/bin/env python3
"""Servidor local do Babel OS.

Substitui o `python3 -m http.server` para resolver o problema de a raiz
mostrar apenas a listagem de arquivos: aqui "/" abre direto o app.html
(login + dados reais). Qualquer outra pasta do arquivo e servida normally.

Também repassa (proxy) para os servidores locais, para o app funcionar num
único endereço — inclusive por HTTPS via túnel, no celular:
    /sb/...       -> Supabase local   http://127.0.0.1:54321/...
    /cerebro/...  -> cérebro          http://127.0.0.1:3078/...
    /voz/...      -> voz do Jarvis    http://127.0.0.1:3100/...
Os três continuam escutando só em 127.0.0.1; quem chega de fora passa por aqui.

Uso:  python3 servir.py [porta]      (padrao 8080)
"""
import os
import sys
import gzip
import functools
import http.client
import http.server
import socketserver

RAIZ = os.path.dirname(os.path.abspath(__file__))
ENTRADA = "/app.html"
DESTINOS = {"/sb": ("127.0.0.1", 54321), "/cerebro": ("127.0.0.1", 3078), "/voz": ("127.0.0.1", 3100)}
# cabeçalhos que não atravessam o repasse (hop-by-hop e os de navegador que os servidores locais recusariam)
NAO_REPASSA = {"host", "connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
               "origin", "referer", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "accept-encoding"}
# texto que vale comprimir (o babel-os.html cai de 1,5 MB para cerca de 430 KB)
COMPRIME = {".html", ".js", ".css", ".json", ".svg", ".txt"}
_GZ = {}  # caminho -> (etag, bytes gzip); refeito só quando o arquivo muda


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _destino(self):
        for pref, alvo in DESTINOS.items():
            if self.path == pref or self.path.startswith(pref + "/") or self.path.startswith(pref + "?"):
                return alvo, self.path[len(pref):] or "/"
        return None, None

    def _repassa(self):
        alvo, caminho = self._destino()
        if not alvo:
            return False
        tam = int(self.headers.get("Content-Length") or 0)
        corpo = self.rfile.read(tam) if tam else None
        cab = {k: v for k, v in self.headers.items() if k.lower() not in NAO_REPASSA}
        cab["Host"] = "%s:%d" % alvo
        try:
            c = http.client.HTTPConnection(alvo[0], alvo[1], timeout=120)
            c.request(self.command, caminho, body=corpo, headers=cab)
            r = c.getresponse()
            dados = r.read()
        except Exception as e:  # servidor local fora do ar
            msg = ('{"error":"servico local fora do ar: %s"}' % str(e).replace('"', "'")).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(msg)
            return True
        self.send_response(r.status, r.reason)
        for k, v in r.getheaders():
            if k.lower() not in ("transfer-encoding", "connection", "content-length", "keep-alive"):
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(dados)
        return True

    def do_GET(self):
        if self._repassa():
            return
        # "/" (e "/" com query) -> app.html, que já carrega babel-os.html
        if self.path.split("?")[0].rstrip("/") == "":
            self.send_response(302)
            self.send_header("Location", ENTRADA)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not self._gzip():
            super().do_GET()

    def do_HEAD(self):
        if not self._repassa() and not self._gzip():
            super().do_HEAD()

    def _gzip(self):
        """Entrega texto comprimido (gzip) com ETag quando o navegador aceita; False segue o fluxo normal."""
        if "gzip" not in (self.headers.get("Accept-Encoding") or ""):
            return False
        caminho = self.translate_path(self.path)
        if os.path.splitext(caminho)[1].lower() not in COMPRIME or not os.path.isfile(caminho):
            return False
        st = os.stat(caminho)
        etag = '"%x-%x-gz"' % (st.st_mtime_ns, st.st_size)
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.end_headers()
            return True
        c = _GZ.get(caminho)
        if not c or c[0] != etag:
            with open(caminho, "rb") as f:
                c = (etag, gzip.compress(f.read(), 6))
            _GZ[caminho] = c
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(caminho))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(c[1])))
        self.send_header("ETag", etag)
        self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(c[1])
        return True

    def do_POST(self):
        if not self._repassa():
            self.send_error(405)

    do_PUT = do_PATCH = do_DELETE = do_POST

    def do_OPTIONS(self):
        if not self._repassa():
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def end_headers(self):
        # revalida a cada uso: cada F5 pega o arquivo atual, mas sem baixar de novo o que não mudou (304)
        if not self._destino()[0]:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # silencio: só o que importa no terminal


class Servidor(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(Handler, directory=RAIZ)
    # voz neural (Francisca): sobe junto se estiver instalada e a porta 3100 estiver livre
    voz = os.path.join(RAIZ, "edge-tts", ".venv", "bin", "python")
    if os.path.exists(voz):
        import socket
        import subprocess
        with socket.socket() as s:
            livre = s.connect_ex(("127.0.0.1", 3100)) != 0
        if livre:
            subprocess.Popen([voz, os.path.join(RAIZ, "edge-tts", "server.py"), "--port", "3100"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            print("Voz neural (Francisca) em http://localhost:3100")
    with Servidor(("127.0.0.1", porta), handler) as httpd:
        print(f"Babel OS em http://localhost:{porta}/  ->  {ENTRADA}")
        print("Repasse: /sb -> :54321 · /cerebro -> :3078 · /voz -> :3100")
        print("Deixe esta janela aberta. Ctrl+C para parar.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor parado.")


if __name__ == "__main__":
    main()
