#!/bin/bash
# Publica o front do Babel OS numa Vercel SÓ PARA TESTES. Banco, cérebro e voz continuam no Mac,
# alcançados pelo túnel Cloudflare (servir.py repassa /sb, /cerebro, /voz).
# Uso (o token não fica salvo em arquivo):
#   VERCEL_TOKEN=xxxx bash backend/deploy/vercel-teste.sh            # usa o túnel atual (/private/tmp/babel-tunel.log)
#   VERCEL_TOKEN=xxxx TUNEL=https://....trycloudflare.com bash backend/deploy/vercel-teste.sh
# Token: vercel.com → Account Settings → Tokens. O endereço do túnel muda a cada reinício → rode de novo.
set -euo pipefail
: "${VERCEL_TOKEN:?defina VERCEL_TOKEN}"
TUNEL=${TUNEL:-$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /private/tmp/babel-tunel.log 2>/dev/null | head -1 || true)}
[ -n "$TUNEL" ] || { echo "túnel não encontrado — suba o cloudflared ou defina TUNEL"; exit 1; }
FRONT="$(cd "$(dirname "$0")/../../nova-frontend-babel" && pwd)"
D=$(mktemp -d)/babel-teste
mkdir -p "$D/vendor"
# só o que o app usa (sem cérebro, voz, JARVIS, .venv, caches)
cp "$FRONT"/{app.html,babel-os.html,babel-banco.js,config.js,b-logo.png,bg.jpg,galaxy.jpg,globe.webp,sphere.webp} "$D"/
cp "$FRONT"/vendor/supabase.js "$D"/vendor/
cat > "$D/vercel.json" <<JSON
{
  "rewrites": [
    { "source": "/sb/:path*", "destination": "$TUNEL/sb/:path*" },
    { "source": "/cerebro/:path*", "destination": "$TUNEL/cerebro/:path*" },
    { "source": "/voz/:path*", "destination": "$TUNEL/voz/:path*" },
    { "source": "/", "destination": "/app.html" }
  ],
  "headers": [{ "source": "/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-store" }] }]
}
JSON
echo "== publicando $D (túnel: $TUNEL)"
cd "$D" && npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" --name babel-os-teste
