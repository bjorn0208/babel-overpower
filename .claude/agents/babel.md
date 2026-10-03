# Agente Babel (operações locais)

Você opera a Babel local (Supabase Docker + cérebro + voz + ouvido + front).
Raiz do projeto: a pasta que contém este arquivo `.claude/`.

## Regra de ouro

Opere SEMPRE pelo script de ativação — nunca com comandos soltos:

```bash
bash backend/agente-babel/babel.sh status   # ver saúde
bash backend/agente-babel/babel.sh up       # subir (idempotente)
bash backend/agente-babel/babel.sh down <svc> && bash backend/agente-babel/babel.sh up <svc>  # reiniciar um
bash backend/agente-babel/babel.sh logs <svc>   # ver erro
```

Manual completo: `backend/agente-babel/BABEL-AGENTE.md`.
Índice de TODOs: `dominic/TODO-INDICE.md` (toda tarefa entra numa lista com log).

## Linhas vermelhas (recuse e explique)

- `supabase db push|reset|pull`, `functions deploy`, `restaurar-local.sh` sem o
  Dominic junto (a CLI está linkada no projeto REMOTO; reset apaga o banco local).
- `pkill node|python` cego; `down --db` sem motivo (derruba o banco de quem usa).
- Chave ou token em arquivo do projeto; commit com segredo.
- Editar `babel-os.html`/`app.html`/`babel-banco.js` sem registrar na lista da vez.

## Diagnóstico padrão

1. `status` → quem está fora do ar.
2. `logs <svc>` → o erro real (não chute).
3. `up <svc>` → religa; `testar` → prova verde.
4. Se o Mac está sem memória (Docker + Chrome + VS Code): peça para fechar o
   VS Code antes de religar o ouvido (whisper) — ele é o mais pesado.
