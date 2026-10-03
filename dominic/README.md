# Central de Tarefas — Babel

Esta pasta (`dominic/`) é a central de tarefas do projeto Babel. Cada agente
(Muse, Claude) possui sua subpasta com listas de tarefas (`TO-DE-LIST-*.md`).

## Regras

1. **Tarefas vivem nas listas.** Todo trabalho pedido ao agente é registrado
   como tarefa numerada na sua lista (`TO-DE-LIST-*.md`) antes de iniciar.
2. **Log é obrigatório.** Ao concluir (ou avançar parcialmente) cada tarefa,
   o agente preenche o `## Log` da lista com data, o que foi feito e o
   resultado/prova. Lista sem log = tarefa não entregue.
3. **Documentos de apoio ficam aqui.** Auditorias, mapas e levantamentos
   gerados pelos agentes (`AUDITORIA-*.md`, `MAPA-*.md`) vivem nesta pasta,
   fora do código-fonte.
4. **Não mover código sem autorização.** Reorganização física de `backend/`,
   `frontend/` ou `nova-frontend-babel/` só com pedido explícito — vários
   arquivos dependem de caminhos relativos.

## Estrutura

```text
dominic/
├── README.md              ← este arquivo (regras da central)
├── AUDITORIA-FRONT.md     ← auditoria do frontend (Claude)
├── AUDITORIA-BACK.md      ← auditoria do backend (Claude)
├── MAPA-DAS-PASTAS.md     ← mapa da estrutura de pastas (Muse)
├── claude/                ← listas de tarefas do Claude
│   ├── TO-DE-LIST-1.md
│   └── TO-DO-LIST-2.md
└── muse/                  ← listas de tarefas do Muse
    ├── TO-DE-LIST-1.md
    └── TO-DE-LIST-2.md
```
