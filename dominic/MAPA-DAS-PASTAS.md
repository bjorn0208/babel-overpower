# Mapa das Pastas — Babel

Levantamento da estrutura em 2026-10-02. Sem repositório git na raiz.

> **Atualização 02/10 (TO-DE-LIST-5):** `git init` feito (sem commit ainda);
> listas do Muse em `backend/muse/` (1–7); testes em `backend/local/testes/`;
> snapshots em `backend/local/_backups/`; `.bak` em
> `frontend/_arquivo-2026-09-29/`; ativação única em
> `backend/agente-babel/babel.sh`; índice geral em `MAPA-GERAL-BABEL.md`
> e índice de TODOs em `dominic/TODO-INDICE.md`. A árvore abaixo continua
> válida como retrato original.

```text
babel overpowerblasterhipersonicultraboosteromegapowerplushiper.dom/
├── AGENTS.md              ← papel do Muse: auxiliar na estrutura das pastas
├── CLAUDE.md              ← papel do Claude: auditoria front/back, docker + supabase local
├── .claude/               ← settings (MCP supabase habilitado)
├── backend/               ← motor + banco (Supabase)
│   ├── README.md, MAPA-DO-MOTOR.md, INSTALAR-BANCO-NOVO.md
│   ├── schema.sql
│   ├── banco/rotinas/     ← rotinas SQL (funções/triggers)
│   ├── supabase/          ← config, functions, migrations, snippets
│   ├── historico-migrations/ ← histórico de migrations (~300 arquivos)
│   ├── pabx/              ← módulo PABX (schema, supabase, históricos)
│   └── referencia-testes/ ← referências de teste
├── frontend/              ← app antigo (Vite React: "plataforma-limpa-vite-react")
│   ├── src/, public/, api/, scripts/, aplicativos/
│   ├── dist/              ← SAÍDA DE BUILD (regenerável, não editar)
│   ├── .env*              ← SENSÍVEIS (5 arquivos; inclui .bak) — não mover
│   └── pabx-publicado/
├── nova-frontend-babel/   ← NOVO frontend (protótipo local Babel OS)
│   ├── babel-os.html      ← o protótipo (abre no Chrome/Edge)
│   ├── iniciar-babel.command / .bat ← sobe app + vozes + cérebro
│   ├── *.png *.jpg *.webp ← DEVEM FICAR NESTA PASTA (exigência do LEIA-ME.txt)
│   ├── cerebro/           ← respostas + memória (server.js)
│   ├── edge-tts/          ← servidor de vozes + cache de áudios
│   ├── JARVIS/            ← assistente original, separado (não usado pela Babel)
│   └── LEIA-ME.txt        ← manual do protótipo
└── dominic/               ← central de tarefas e documentos (ver README.md)
    ├── AUDITORIA-FRONT.md / AUDITORIA-BACK.md (Claude)
    ├── MAPA-DAS-PASTAS.md ← este arquivo (Muse)
    ├── claude/            ← TO-DE-LIST-1.md, TO-DO-LIST-2.md
    └── muse/              ← TO-DE-LIST-1.md, TO-DE-LIST-2.md
```

## Regras de segurança (o que NÃO mover)

1. `nova-frontend-babel/*.png|*.jpg|*.webp` — o `babel-os.html` e o
   `LEIA-ME.txt` exigem essas imagens na mesma pasta. Mover quebra o protótipo.
2. `frontend/.env*` — arquivos sensíveis e ativos; mexer só com pedido explícito.
3. `frontend/dist/`, `frontend/node_modules/`, `frontend/.vercel/` —
   gerados por build/instalação; nunca editar à mão.
4. `backend/historico-migrations/` — histórico; não renomear nem reordenar.

## Propostas pendentes de aprovação

- **P1.** Arquivar os `.bak-2026-09-29` do `frontend/` numa subpasta
  `frontend/_arquivo-2026-09-29/` (limpa a raiz sem apagar nada).
- **P2.** Inicializar git na raiz (`git init` + `.gitignore` para
  `node_modules/`, `dist/`, `.env*`, `.DS_Store`) para dar segurança às
  próximas mudanças.
- **P3.** Padronizar o nome `dominic/claude/TO-DO-LIST-2.md` para
  `TO-DE-LIST-2.md`, igual às demais listas.
