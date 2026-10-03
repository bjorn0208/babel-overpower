# Auditoria do Front — mapa + achados

Gerado em 2026-10-02. Escopo: `frontend/` (React 19 + Vite 7 + TS 5.8 + Supabase JS 2.105, SPA na Vercel).
Método: checagens automáticas (tsc, ESLint, cruzamento front↔banco local, varredura de segurança) + leitura pontual. Sem subagentes.

---

## 1. Mapa (para se localizar)

| Onde | O quê |
|---|---|
| `src/main.tsx` → `src/App.tsx` | Entrada. 16 rotas em `App.tsx` (`/`, `/login`, `/impersonar`, `/reset-password`, públicas `/contrato/:chave`, `/consulta/:chave`, `/rifa/:chave`, `/sala/:chave`, `/agendar/:chave`, `/acompanhamento/:token`, `/cadastro`, `/reino`, `/mapa-motor`, `/app/rifas`; `/dev/*` só em DEV/smoke) |
| `src/pages/` | `Desktop.tsx` (o "SO" após login), `Login`, `Impersonar` (troca sessão via `verifyOtp` com `token_hash`), `Reino`, `public/` (páginas públicas por chave) |
| `src/os/` | Shell do desktop: `dock`, `janela`, `spotlight`, `topo`, `widgets`, `postits`, `notificacoes`, `wallpaper` |
| `src/apps/admin/` | Apps de admin de plataforma — maiores: `curadoria` (57), `gestao` (52), `consulta` (9) |
| `src/apps/user/` | Apps do tenant — maiores: `contratos` (58), `rifas` (57), `agente` (33), `campanha` (30), `conversas` (28), `reuniao` (24), `maquete-rpg` (18), `chat-teste` (14), `consulta` (13), `financeiro` (12) |
| `src/auth/` | `AuthContext.tsx` (sessão), `useRole.ts` (admin = `profiles.system_role === 'platform_admin'`) |
| `src/integrations/supabase/` | `client.ts` (lê `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`; Proxy lazy), `types.ts` (16.991 linhas, gerado) |
| `src/data/` | Hooks de dados (ex.: `hooksBundle.ts`) |
| `api/whatsapp-importar.ts` | Única função serverless Vercel (Baileys) |
| `middleware.ts` | Vercel Edge Middleware: injeta branding (`branding_sistema`) no HTML para previews de link |
| `public/indicacao.html`, `public/venda-realizada.html` | Páginas estáticas que fazem POST direto em edge functions (`gestao-indicacao`, `gestao-venda`) |
| `aplicativos/` | **Outros projetos** (babel-pabx, comercial-babel… com `node_modules` próprios) — não fazem parte do build do front |
| `pabx-publicado/`, `dist/` | Artefatos publicados/build |

**Tamanho:** ~169 mil linhas em `src` (438 tsx, 226 ts, 34 jsx, 5 js).
**Env:** `.env` / `.env.local` apontam para o Supabase remoto novo `llsdqtbtuyuqxvepmniy`. Variáveis usadas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`, `VITE_CONTRATO_URL`, `VITE_COMMANDBAR_MOTOR_UNICO`, `VITE_COMMANDBAR_HISTORICO_RAPIDO`.
**Scripts:** `dev` (vite), `build` (patch-baileys + vite build), `lint` (`eslint .`).

---

## 2. Resultado das checagens automáticas

| Checagem | Resultado |
|---|---|
| Contrato front→back: tabelas `.from()` | 143 usadas, **0 inexistentes** no banco |
| Contrato front→back: `.rpc()` | 84 usadas, **0 inexistentes** |
| Contrato front→back: edge functions (`invoke` / `functions/v1/`) | 37 usadas, **0 inexistentes** (inclui as 2 das páginas `public/*.html`) |
| `tsc --noEmit` | **0 erros** — mas ver F-02/F-03 (cobertura real é bem menor) |
| ESLint em `src api middleware.ts` | 25.069 erros, dos quais 24.725 são só `prettier` (formatação); 289 `no-explicit-any`; 47 `ban-ts-comment`; 30 avisos `exhaustive-deps`; 2 `rules-of-hooks`; 1 `no-constant-binary-expression` (bug real, F-01) |
| Segredos no código | Nenhum JWT/`service_role`/`sbp_`/`sk-` embutido em `src`, `api`, `middleware.ts`, `public` |
| XSS | 2 `dangerouslySetInnerHTML` (shadcn `chart.tsx` e construtor de contratos); renderizador de contrato escapa dados do cliente (`esc()`), só cláusulas por produto entram como HTML cru (autor = dono do tenant, só no preview interno) — risco baixo |

---

## 3. Achados (ordem de severidade)

### F-01 · ALTA · Preço `NaN`/0 alimentando comissão multinível
`src/data/hooksBundle.ts:310` — `item_preco: opts?.preco ?? Number((plano as any).preco_mensal) ?? 0`.
`Number()` nunca é null/undefined, então o `?? 0` é código morto. Se `preco_mensal` for `undefined` → `NaN` (vira `null` no JSON); se for `null` → `0`.
Esse insert em `pedidos_compra` com status `aprovado` dispara `trg_comissao_multinivel_insert`, que credita saldo na cadeia `referred_by`.
**Efeito:** comissão calculada sobre preço nulo/zero (ou erro no trigger, engolido como "best-effort").
**Correção:** `Number((plano as any).preco_mensal ?? 0) || 0` e validar `> 0` antes de lançar comissão.

### F-02 · ALTA · `types.ts` desatualizado em relação ao banco
`src/integrations/supabase/types.ts` não tem **39 tabelas/views** (ex.: `gestao_*`, `campanhas_babel`, `entregas_lead_babel`, `alertas_operacao`), **258 funções** e colunas em **20 tabelas** (ex.: `rifas.codigo_controle`, `rifas.hora_sorteio`, `conversas.produto_foco_id`, `memoria_dono.*`, `pedidos_rifa.*`, `rifas_config_tenant.*`).
O código usa essas tabelas mesmo assim, contornando o tipo: **92 `(supabase as any)`**, 198 `as any`.
**Efeito:** o `tsc` "0 erros" não cobre exatamente o código mais novo; nome de coluna errado só aparece em produção.
**Correção:** `supabase gen types typescript --local > src/integrations/supabase/types.ts` (com o banco local já restaurado) e remover os `as any` gradualmente.

### F-03 · MÉDIA · 114 arquivos sem nenhuma checagem estática
- **75 arquivos com `@ts-nocheck`** (arquivo inteiro sem tipos).
- **39 arquivos `.jsx`/`.js`** fora do `tsconfig` (`include` só `*.ts/*.tsx`) e fora do ESLint (`files: **/*.{ts,tsx}`): `apps/admin/{tenants,financeiro,controle,socio-comercial,loja,dashboard,cargos,aplicativos}`, `apps/user/{agenda,mentor,cargos,configuracoes,clientes,equipe,calculadora,onboarding}`.
Inclui telas sensíveis (admin de tenants e financeiro).

### F-04 · MÉDIA · Backups `.bak` publicados no deploy
`public/indicacao.html.bak-2026-09-29` e `public/venda-realizada.html.bak-2026-09-29` vão para `dist/` (já estão lá) e ficam acessíveis na web, com o endpoint do **projeto antigo** `pdamarjxcmkzbhqxtapl`.
Também `src/pages/Reino.tsx.bak-2026-09-29` (não entra no build, mas polui a busca).
**Correção:** remover os `.bak` de `public/` e `src/`.

### F-05 · MÉDIA · URLs do Supabase fixas no código (ignoram `.env`)
- `src/pages/Reino.tsx:155` — `BANNER_PADRAO` aponta para storage de `llsdqtbtuyuqxvepmniy`.
- `public/indicacao.html:21` e `public/venda-realizada.html:22` — `endpoint` fixo em `llsdqtbtuyuqxvepmniy.supabase.co/functions/v1/...`; a CSP dessas páginas também fixa o host.
**Efeito:** rodando local/staging, essas telas continuam falando com o projeto remoto; troca de projeto exige caçar strings.

### F-06 · BAIXA · `npm run lint` inutilizável como portão
`eslint .` varre `aplicativos/` (outros projetos, ~4,7 mil arquivos JS/TS) — não terminou em 13 min; restrito a `src` leva 1,5 min. E 24.725 erros de prettier escondem os 344 que importam.
**Correção:** `ignores: ["dist", "aplicativos", "pabx-publicado", ...]` e rodar `prettier --write` uma vez (ou desligar `prettier/prettier` no ESLint).

### F-07 · BAIXA · Hooks com dependências faltando (30)
`react-hooks/exhaustive-deps` — risco de estado desatualizado. Concentrados em `maquete-rpg/canvas/bonecos/CamadaBonecos.tsx` (3), `os/spotlight/Spotlight.tsx` (2), `pages/Reino.tsx` (2), `apps/admin/gestao/*`, `apps/admin/juridico/*`.
`rules-of-hooks` (2): `api/whatsapp-importar.ts:204` é falso positivo (função Baileys `use*`); `apps/admin/gestao/arrastar-rolar.ts:170` (`usarArrastarParaRolar` chama `useCallback` — só é seguro se for chamado no topo de componente).

---

## 4. Pendências para a auditoria do back (dependem de RLS/edge)

- `useRole.ts` decide admin por `profiles.system_role`. **Verificar se o usuário consegue fazer UPDATE do próprio `system_role`** (policy de `profiles`).
- `/impersonar` usa `token_hash` gerado por `impersonate-user` — verificar se a edge exige `platform_admin`.
- `middleware.ts` lê `branding_sistema` como anônimo — verificar se a policy expõe só a linha ativa e só colunas públicas.
- `public/*.html` fazem POST anônimo em `gestao-indicacao` / `gestao-venda` — verificar validação e rate-limit nas edges.

---

## 5. Rodar o front contra o Supabase local

Criar `frontend/.env.development.local` (prioridade sobre `.env` só no `vite dev`; não altera os arquivos existentes):
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY de `supabase status -o env` em backend/>
```
Depois `npm run dev` em `frontend/` → http://localhost:8080. O banco local nasce **sem dados**; usuários de teste: `admin@babel.local` / `usuario@babel.local`, senha `Teste@123456`.

**Feito em 2026-10-02:** arquivo criado e front rodando contra o Supabase local.
- O `node_modules` veio de um Mac **Apple Silicon** (só binários `darwin-arm64`); nesta máquina Intel o Vite não subia (`Cannot find module @rollup/rollup-darwin-x64`). Foram extraídos, nas mesmas versões, `@rollup/rollup-darwin-x64@4.60.4`, `@esbuild/darwin-x64@0.25.12` (+ `0.27.7` dentro de `vite/node_modules`), `@tailwindcss/oxide-darwin-x64@4.3.0`, `lightningcss-darwin-x64@1.32.0` — sem alterar `package.json`/lockfile. Um `npm ci` limpo nesta máquina resolveria de vez.
- `vite.config.ts` usa `host: "::"` — o dev server fica acessível na rede local (ex.: `192.168.1.111:8080`).
