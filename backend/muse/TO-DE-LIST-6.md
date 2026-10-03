# TO-DE-LIST-6 — Muse: Gestão E2+E3 + baixa do L1

Continuação da TO-DE-LIST-3 (G1 parcial, L1 a reconciliar).

## Tarefas

- [ ] **T1 — Definir E2+E3 com o Dominic.** O E1 entregou `V.gestao` com 5
  abas (Indicações, Vendas, Clientes, Parcelas do setup, Mensalidades;
  suíte gs-e1 115/115). Falta escrever o escopo do E2 (aba Implementações
  — o E1 já grava `implementacoes`) e do E3 antes de implementar.
- [ ] **T2 — Implementar E2+E3** no padrão da TO-DE-LIST-3 (peças isoladas,
  `node --check`, suíte de regressão, captura, sem quebrar as 51 telas).
- [x] **T3 — Baixa do L1 (tela de login).** Provado de ponta a ponta
  (`teste-login-dados.py` → 5/5 login, 0 erros) e `[x]` na TO-DE-LIST-3.
- [ ] **T4 — Reconciliar suíte e2e com o UI atual.** `teste-login-dados.py`:
  2 falhas de seed (`Prova Do Banco` não existe no banco nem no
  `seed-demo.sql`). `teste-banco.py`: quebra no `ir(pg,'estoque')`
  (`#dock [data-go=estoque]` nulo — dock virou iOS tab bar + folha "Mais"
  depois que o teste foi escrito). Deriva pré-existente, não regressão
  (nenhum arquivo de front/banco foi tocado neste lote). Ao pegar: carregar
  a skill webapp-testing antes de depurar no navegador.

## Log

- **2026-10-02 — Lista criada.** E1 confirmado no log da TO-DE-LIST-3;
  login conferido por grep no `app.html` (6 ocorrências), prova visual
  pendente no T3.
- **2026-10-02 — T3 feita ("pode resolver").** L1 provado e baixado; T4
  aberta com a deriva e2e/seed encontrada no caminho. T1 (escopo E2+E3)
  segue precisando do Dominic.
