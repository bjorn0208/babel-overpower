#!/bin/bash
# Copia o certificado renovado para o coturn e o reinicia (sem chamada ativa
# no relay isso é instantâneo; com chamada, o TURN reconecta pelo ICE restart)
# Vive em /etc/letsencrypt/renewal-hooks/deploy/coturn-babel.sh na VPS.
cp -L /etc/letsencrypt/live/pabx.babel-os.com/fullchain.pem /etc/coturn/certs/pabx.crt
cp -L /etc/letsencrypt/live/pabx.babel-os.com/privkey.pem /etc/coturn/certs/pabx.key
chown -R turnserver:turnserver /etc/coturn/certs
chmod 640 /etc/coturn/certs/pabx.key
systemctl restart coturn || true
