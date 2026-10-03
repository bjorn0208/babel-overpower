# Índice de TODOs da Babel (02/10)

Todas as listas, quem é dono de cada uma e o que está aberto.
Regra: tarefa nova entra na lista do dono certo e ganha log com data.

## Listas do Muse (`backend/muse/`)

| Lista | Assunto | Estado |
|---|---|---|
| TO-DE-LIST-1 | Estruturar pastas (pedido inicial) | ✅ fechada (virou a 2) |
| TO-DE-LIST-2 | Mapear estrutura, README e mapa do dominic | ✅ fechada, salvo T4 (organização física → virou a 5) |
| TO-DE-LIST-3 | Telas do front novo (U1–U18, A1–A14 ✅) | 🔶 aberta: G1 (E2+E3) e L1 (reconciliar — login já existe no `app.html`) |
| TO-DE-LIST-4 | Agente de ativação única + Docker | 🔶 aberta (criada 02/10 — implementação neste mesmo lote) |
| TO-DE-LIST-5 | Organização física das pastas | 🔶 aberta (criada 02/10 — executada neste mesmo lote, falta commit inicial) |
| TO-DE-LIST-6 | Gestão E2+E3 + baixa do L1 | 🔶 aberta (criada 02/10) |
| TO-DE-LIST-7 | Voz no celular, Groq, túnel/Vercel, token | 🔶 aberta (criada 02/10 — pendências vindas do Claude 7/9) |

## Listas do Claude (`dominic/claude/`)

| Lista | Assunto | Estado |
|---|---|---|
| 1–6 | Banco local, curadoria, telas C2, cargos/controle, AUDITORIA | ✅ fechadas (ver logs em cada arquivo) |
| 7 | Voz no celular (HTTPS/túnel, STT, proxy, Vercel teste) | 🔶 aberta parcial: microfone real, túnel/Vercel dessincronizados, token p/ revogar → migrado p/ Muse-7 |
| 8 | (ver arquivo) | ver arquivo |
| 9 | Mentor ouvir + responder tudo + ícones celular | 🔶 aberta parcial: falta `GROQ_API_KEY`, teste com microfone real → migrado p/ Muse-7 |

## Checklists fora das listas

| Doc | Assunto | Estado |
|---|---|---|
| `dominic/ATIVACAO-GO-LIVE.md` | Go-live nuvem (Supabase cloud + Vercel) | ⏳ futuro — checklist pronto, nada executado |
| `~/Downloads/babel-coop/A-FAZER.md` | App Electron legado (~142 abertos) | 🗄️ legado — NÃO retomar sem decisão do Dominic |
| `dominic/PLANO-TELAS-EM-MASSA.md` | Plano das telas em massa | apoio da TO-DE-LIST-3 |

## Fila sugerida (próximos passos)

1. Muse-4: provar o `babel.sh up` do zero (down + up + status verde).
2. Muse-5: commit inicial no git (com o Dominic) + apagar `_backups/` quando o git der segurança.
3. Muse-7: `GROQ_API_KEY` + teste de voz real + republicar Vercel + revogar token do chat.
4. Muse-6: definir E2+E3 com o Dominic, dar baixa no L1, implementar.
5. Go-live: só depois de 1–4 verdes.
