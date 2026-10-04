# Babel — Aplicativos Frontend

Apps frontend da plataforma Babel. Cada subdiretório é independente com deploy próprio.

## Apps Ativos

| App | Tipo | Como Rodar | Dono | Status |
|-----|------|-----------|------|--------|
| `comercial-babel` | Vite/Rolldown | `npm run dev` | Carlos | ✅ Build OK, Supabase local |
| `formulario-babel` | Vite | `npm run dev` | Carlos | ✅ Build OK, Google Sheets backend |
| `marcelo-meinster` | Vite | `npm run dev` | Carlos | ✅ Build OK, OpenRouter AI |
| `plataforma-limpa-vite-react` | Vite (front principal) | `cd ../.. && npm run dev` | Dominic | ✅ Build OK, Supabase local |
| `apresentacao-babel-os` | HTML estático | Abrir `index.html` | Carlos | ✅ Deploy Vercel |
| `babel-identidade` | HTML estático | Abrir `index.html` | Carlos | ✅ Deploy Vercel |
| `custos-babel` | HTML estático | Abrir `index.html` | Carlos | ✅ Deploy Vercel |
| `site-plano-rifas` | HTML estático | Abrir `index.html` | Carlos | ✅ Deploy Vercel |
| `babel-instalador` | WASM | Abrir `public/babel-chat.html` | Carlos | ✅ Arquivos presentes |

## Configuração Local (Apps Node)

1. Copie `.env.example` para `.env` no diretório do app
2. Preencha as variáveis conforme o backend alvo:
   - **Supabase local:** `VITE_SUPABASE_URL=http://127.0.0.1:54321` + chave anon do `supabase status`
   - **Google Sheets (formulario-babel):** `PLANILHA_WEBAPP_URL=<URL do Web App>`
   - **OpenRouter (marcelo-meinster):** `OPENROUTER_API_KEY=<chave>` + `OPENROUTER_MODEL=<modelo>`
3. Instale dependências: `npm install`
4. Rode: `npm run dev`

## Endpoints Compartilhados

Ver `INVENTARIO-CARLOS.md` para lista completa de RPCs, Edge Functions e tabelas Supabase usadas pelo `comercial-babel`.

## Notas

- Apps estáticos não possuem build step; são servidos diretamente via Vercel ou arquivo local.
- Para rebuild limpo (fix native binding x64): `rm -rf node_modules package-lock.json && npm install`
- Os `.env` de produção estão em `../../dados/complementos-20260926-1919/vercel/<projeto>/` (privados).