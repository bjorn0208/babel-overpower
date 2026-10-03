#!/bin/bash
# Roda NA VPS como root. Aplica o bmail.js corrigido (CORS restrito,
# anti-traversal, TLS verificado fora de loopback) com backup e reversão
# automática se a ponte não subir. O firewall NÃO é tocado — já está certo.
set -u

if [ ! -f /root/bmail.js ]; then
  echo "ERRO: /root/bmail.js não existe — rode o scp antes"; exit 1
fi

BAK="/opt/bmail/bmail.js.bak-$(date +%F)"
cp -a /opt/bmail/bmail.js "$BAK"

# .mjs para o --check entender o `import` fora da pasta do projeto
cp /root/bmail.js /root/bmail-check.mjs
if ! /opt/node20/bin/node --check /root/bmail-check.mjs; then
  echo "ERRO: bmail.js novo com sintaxe inválida — nada aplicado"; exit 1
fi
rm -f /root/bmail-check.mjs

cp /root/bmail.js /opt/bmail/bmail.js

# Remetente do Resend: o padrão do código ainda é @contato.babel-os.com, mas
# desde 08/08 só babel-os.com está verificado — sem isto, responder falha (403).
# O endereço oficial escolhido em 15/08 é contato@babel-os.com, e as respostas
# dos clientes voltam para ele (precisa do alias no Stalwart).
mkdir -p /etc/systemd/system/babel-bmail-api.service.d
cat > /etc/systemd/system/babel-bmail-api.service.d/remetente.conf <<'FIM'
[Service]
Environment="BMAIL_REMETENTE=Grupo Babel <contato@babel-os.com>"
Environment="BMAIL_REPLYTO=contato@babel-os.com"
Environment="BMAIL_RESEND=re_XhTkXoje_DWbFHFphB5pJxRmSJgf6eYwa"
FIM
chmod 600 /etc/systemd/system/babel-bmail-api.service.d/remetente.conf
systemctl daemon-reload

systemctl restart babel-bmail-api
sleep 3

if systemctl is-active --quiet babel-bmail-api; then
  echo "ponte atualizada e no ar (backup em $BAK)"
  curl -s -o /dev/null -w "resposta da ponte: HTTP %{http_code}\n" http://127.0.0.1:3311/api/mail/status
else
  echo "ERRO: ponte não subiu — revertendo para o backup"
  cp "$BAK" /opt/bmail/bmail.js
  systemctl restart babel-bmail-api
  exit 1
fi
