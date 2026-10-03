#!/bin/bash
# O Caddy renova o certificado de pabx.babel-os.com sozinho (TLS-ALPN na 443 —
# provado em 18/08/2026; a validação por porta 80 é recusada pela rede para os
# validadores do Let's Encrypt, então certbot standalone/webroot não renovaria).
# Este script copia o certificado do Caddy para o Asterisk (WSS 8089) e o
# coturn (TURN TLS 5349) sempre que ele mudar. Roda por systemd timer diário.
set -e
ORIG=/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/pabx.babel-os.com
[ -f "$ORIG/pabx.babel-os.com.crt" ] || exit 0
novo=$(md5sum "$ORIG/pabx.babel-os.com.crt" | cut -d" " -f1)
atual=$(md5sum /etc/asterisk/keys/pabx.crt 2>/dev/null | cut -d" " -f1 || true)
[ "$novo" = "$atual" ] && exit 0

cp "$ORIG/pabx.babel-os.com.crt" /etc/asterisk/keys/pabx.crt
cp "$ORIG/pabx.babel-os.com.key" /etc/asterisk/keys/pabx.key
chown asterisk:asterisk /etc/asterisk/keys/pabx.crt /etc/asterisk/keys/pabx.key
chmod 640 /etc/asterisk/keys/pabx.key
/usr/sbin/asterisk -rx "module reload http" >/dev/null 2>&1 || true

cp "$ORIG/pabx.babel-os.com.crt" /etc/coturn/certs/pabx.crt
cp "$ORIG/pabx.babel-os.com.key" /etc/coturn/certs/pabx.key
chown -R turnserver:turnserver /etc/coturn/certs
chmod 640 /etc/coturn/certs/pabx.key
systemctl restart coturn || true

echo "certificado do PABX sincronizado do Caddy em $(date -Is)"
