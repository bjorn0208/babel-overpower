# Índice de TODOs da Babel (02/10)

Todas as listas, quem é dono de cada uma e o que está aberto.
Regra: tarefa nova entra na lista do dono certo e ganha log com data.

## Listas do Muse (`backend/muse/`)

| Lista | Assunto | Estado |
|---|---|---|
| TO-DE-LIST-1 | Estruturar pastas (pedido inicial) | ✅ fechada (virou a 2) |
| TO-DE-LIST-2 | Mapear estrutura, README e mapa do dominic | ✅ fechada, salvo T4 (organização física → virou a 5) |
| TO-DE-LIST-3 | Telas do front novo (U1–U18, A1–A14 ✅) | 🔶 aberta: G1 (E2+E3) e L1 (reconciliar — login já existe no `app.html`) |
| TO-DE-LIST-4 | Agente de ativação única + Docker | ✅ fechada (up do zero verde + fixes sobe_fundo e groqKey) |
| TO-DE-LIST-5 | Organização física das pastas | ✅ fechada (commit `fa26123`) |
| TO-DE-LIST-6 | Gestão E2+E3 + baixa do L1 | ✅ fechada (T4: banco 14/14 + login 9/9) |
| TO-DE-LIST-7 | Voz no celular, Groq, túnel/Vercel, token | 🔶 aberta: T1 ✅ (OpenRouter, Groq dispensada); faltam T2 (mic real), T3 (token Vercel), T4 (revogar token) |

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

1. ~~Muse-4: provar o `babel.sh up` do zero~~ ✅ (02/10, PIDs 6019/6033/6047/6063).
2. ~~Muse-5: commit inicial~~ ✅ (`fa26123`); `_backups/` fica no disco até dar confiança.
3. ~~Muse-7 T1 (chave IA)~~ ✅ (OpenRouter recuperada); restam T2 (mic real), T3+T4 (Vercel: republicar + revogar token) — precisam do Dominic.
4. ~~Muse-6~~ ✅ fechada (T4: banco 14/14 + login 9/9).
5. Go-live: só depois da lista 7 (T2 mic real, T3 Vercel+token, T4 revogar) — todas precisam do Dominic. Túnel OK (302, fitness-dubai-fewer-dosage).
