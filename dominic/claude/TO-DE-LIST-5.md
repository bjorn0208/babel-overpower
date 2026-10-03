Liste a quantidade e o que tem de apps na babel antiga e o que tem na babel atual. 

ao final me diga quais faltam no front novo.

---

## Resposta (Claude Code)

**Babel antiga — 47 apps** (registro em `frontend/src/bundle/bundle.jsx`):
- **Admin (14):** Dashboard, Controle, Tenants, Loja, Aplicativos, Consulta, Jurídico, Aparência, Financeiro, Sócio Comercial, Curadoria, Cargos, Nichos, Reuniões.
- **Usuário (31):** Conversas, Conversa (isolada), Empresa, Maquete-RPG, Equipe, Loja, Chat Treino, Produtos, Contratos, Consulta, Jurídico, Agente, Mentor, Clientes, Sócio Comercial, Base, Campanha, Textos, Marketing, Notas, Financeiro (caixa), Reunião, Contabilidade, RH, E-mail, Crédito Bancário, Rifas, Reino, Estoque, Calculadora, Agenda.
- **Ambos (2):** Configurações, Gestão.

**Babel atual (front novo, `nova-frontend-babel/babel-os.html`) — 14 telas:**
Início, Conversas, Notas, Contatos, Clientes, Contratos, Financeiro, Agenda, Agente (inclui Treino), Loja, Equipe, Meu dia, Como a Aurora atendeu, Leitura e uso (ajustes) — mais a esfera de voz. Sem admin, sem login, dados mocados.

| | Antiga | Atual |
|---|---|---|
| Admin | 14 | 0 |
| Usuário | 31 | 14 |
| Ambos | 2 | 0 (Ajustes ≈ Configurações) |
| **Total** | **47** | **14** |

## Quais faltam no front novo

Das 47 da antiga: **12 cobertas** (Conversas, Conversa isolada, Notas, Base→Contatos, Clientes, Contratos, Financeiro, Agenda, Agente, Chat Treino→Agente, Loja, Equipe), **2 parciais** (Produtos → só catálogo na Loja; Configurações → "Leitura e uso" só tem preferências de tela, sem exportar/apagar dados) e **33 faltando**:

- **Usuário (18):** Empresa, Maquete-RPG, Consulta, Jurídico, Mentor, Sócio Comercial, Campanha, Textos, Marketing, Reunião, Contabilidade, RH, E-mail, Crédito Bancário, Rifas, Reino, Estoque, Calculadora.
- **Admin (14):** Dashboard, Controle, Tenants, Loja, Aplicativos, Consulta, Jurídico, Aparência, Financeiro, Sócio Comercial, Curadoria, Cargos, Nichos, Reuniões.
- **Ambos (1):** Gestão.

Equivalências e contexto dos briefings: `dominic/COMPARATIVO-FRONT.md`.

## Log

| Data/hora (BRT) | Ação | Resultado |
|---|---|---|
| 02/10 02:46 | Registro de apps extraído do `bundle.jsx` (slug, título, lado) e telas do `babel-os.html` | concluída |
| 02/10 02:50 | Cruzamento 47 apps antigos × 14 telas novas | 12 cobertas · 2 parciais · 33 faltando |
| 02/10 02:59 | Arquivo não existia mais na pasta `claude/`; recriado a pedido com o pedido original, as respostas e o log | concluída |
