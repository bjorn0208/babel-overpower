# Mapa Geral da Babel — onde está cada coisa (02/10)

Esta pasta (`babel overpowerblaster... .dom/`) é a **raiz canônica, o projeto vivo**.
Todo o resto abaixo é legado, protótipo antigo ou apoio. Nada foi apagado;
este mapa diz o que é vivo e o que é arquivo.

## 1. Projeto vivo (esta pasta)

| Pasta | Papel | Estado |
|---|---|---|
| `nova-frontend-babel/` | Front novo (Babel OS: `app.html` + `babel-os.html`, 51 telas) | VIVO — onde se trabalha |
| `nova-frontend-babel/cerebro/` | Cérebro local (porta 3078) | VIVO |
| `nova-frontend-babel/edge-tts/` | Vozes BR (porta 3100) | VIVO |
| `backend/supabase/` | Banco: config, migrations, 96 functions | VIVO (Docker `sistemababel-local`) |
| `backend/local/` | Scripts do banco local + `testes/` + `_backups/` | VIVO |
| `backend/stt/` | Ouvido local Whisper (porta 3079) | VIVO |
| `backend/deploy/` | Scripts de subida (nuvem + Vercel teste) | VIVO |
| `backend/agente-babel/` | **Agente de ativação única** (`babel.sh up`) | VIVO — começa aqui |
| `backend/muse/` | TO-DE-LISTs do Muse (1–7) | VIVO |
| `dominic/` | Central: auditorias, plano de telas, go-live, listas do Claude (1–9), índice de TODOs | VIVO |
| `frontend/` | Front antigo (React Vite, 47 apps: admin + rotas públicas) | EM USO PARALELO — mantém até o novo cobrir admin/públicas (ver `dominic/COMPARATIVO-FRONT.md`) |
| `nova-frontend-babel/JARVIS/` | Assistente original separado | PARADO — não é usado pela Babel |

Como subir tudo de uma vez: `bash backend/agente-babel/babel.sh up`
(ver `backend/agente-babel/BABEL-AGENTE.md`).

## 2. Fora daqui (não mexer sem motivo)

| Lugar | O que é | Estado |
|---|---|---|
| `~/Downloads/babel-coop/` | App Electron antigo (A-FAZER.md com ~142 abertos) | LEGADO — parado em 01/10; só consultar |
| `~/Desktop/Téobaldo/` | Protótipos e estudos do Téobaldo (`babel-coop-frontend/`, `laboratorio/`) | ARQUIVO de referência |
| `~/BabelCoop/` e `~/BabelCoop-testes/` | Dados do `.coop` (diário, acervo, agentes) | DADOS — não é código |
| `~/Downloads/babel-os*/`, `frontend_nova_babel_os/`, `*.md` de briefing | Zips e briefings antigos do front | ARQUIVO — briefings já lidos e citados no comparativo |
| `~/Rick/` | Ferramentas do Rick (não é Babel) | OUTRO projeto |

## 3. Regras

1. Código novo só nesta pasta. Achou algo útil no legado? Copie para cá, não trabalhe lá.
2. Antes de mover qualquer pasta de código, confira os caminhos relativos
   (`babel-os.html` exige as imagens na mesma pasta; testes usam `backend/local/testes/`).
3. Segredos (`.env*`, chaves) nunca entram no git — ver `.gitignore`.
4. Toda tarefa entra numa TO-DE-LIST com log — ver `dominic/TODO-INDICE.md`.
