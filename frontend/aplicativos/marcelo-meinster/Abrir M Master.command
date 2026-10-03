#!/bin/bash
# Duplo clique neste arquivo para abrir o M Master.
# Na primeira vez em um Mac novo, ele instala as dependências sozinho.

cd "$(dirname "$0")" || exit 1

echo "🧠 M Master — Mapas Mentais com IA"
echo ""

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Este Mac não tem o Node.js instalado."
  echo ""
  echo "   1. Baixe a versão LTS em: https://nodejs.org"
  echo "   2. Instale (duplo clique no .pkg baixado)"
  echo "   3. Dê duplo clique neste arquivo de novo"
  echo ""
  read -r -p "Pressione Enter para fechar..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Primeira vez neste Mac — instalando dependências (1-2 min)..."
  npm install || { echo "❌ Falha ao instalar. Verifique a internet."; read -r -p "Enter para fechar..."; exit 1; }
  echo ""
fi

echo "🚀 Iniciando… o navegador vai abrir sozinho."
echo "   Para encerrar, feche esta janela do Terminal (ou Ctrl+C)."
echo ""
npx vite --open
