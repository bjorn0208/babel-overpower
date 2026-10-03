# Comparativo — front novo × front antigo × aplicativos

Levantamento de 2026-10-02 (Claude). Fontes: `nova-frontend-babel/babel-os.html` (+ `cerebro/dados.js`), `frontend/src/bundle/bundle.jsx` (shell do front antigo, importa todos os apps), `frontend/src/App.tsx` (rotas), `frontend/aplicativos/*`.

## 1. O que o front novo tem (14 telas)

| Tela nova | O que mostra (pelo código) | Equivalente no antigo |
|---|---|---|
| Início | "Luzes" — o que **pede você** (aprovações do agente), painéis de conversas, vendas, fila, qualidade, loja, contratos, clima | widgets do desktop (KPIs, agenda, finanças) |
| Conversas | Conversas com ficha do cliente e **memória** ("compra a cada 45 dias", "prefere Pix · fonte: seu áudio") | `user/conversas` |
| Notas | Notas/etiquetas | `user/notas` |
| Contatos | Contatos/leads (separado de Clientes) | `user/base` (base de leads) |
| Clientes | Clientes com filtros | `user/clientes` |
| Contratos | Contratos | `user/contratos` |
| Financeiro | Financeiro | `user/financeiro` (+ `contabilidade`) |
| Agenda | Agenda / lembretes | `user/agenda` |
| Agente | Agente **"Aurora"**: **poderes** com 3 níveis (sempre / pede você / nunca — ex.: Pix até R$ 5.000, desconto até 5%), **regras aprendidas do áudio do dono**, **dúvidas frequentes** ("vou confirmar" 14×) | `user/agente` (parcial) + `user/chat-teste` ("Treino") |
| Loja | Produtos/catálogo | `user/loja` (+ `produtos`, `estoque`) |
| Equipe | Papéis (Dono, Atendimento, Costura, Financeiro) × módulos (Conversas, Contatos, Financeiro, Contratos, Treino, Agenda, Loja) — matriz de permissões | `user/equipe` (+ `cargos`) |
| **Meu dia** | **NOVO** — fila de trabalho do funcionário ("Fila do Diego": entregas, provas, medidas, retiradas do dia) + clima | — |
| **Como a Aurora atendeu** | **NOVO** — qualidade do agente: 1ª resposta (mediana 41 s), resolveu sozinha (86% · 412 de 479), nota 4,6/5 | — (havia métricas soltas em `mentor`/curadoria) |
| Leitura e uso | Ajustes: tema, tamanho, contraste, mão, movimento, **voz da Babel**, cérebro local, chave Groq | `user/configuracoes` |

Também novo: **esfera de voz** (fala/ouve, abre telas, "lembre que…") com cérebro local (`cerebro/`, porta 3078) e vozes BR (`edge-tts/`, porta 3100).

## 2. Apps do front antigo que NÃO vieram no novo

**Do usuário/tenant (22):** `rifas`, `campanha`, `reuniao`, `consulta`, `juridico`, `rh`, `marketing`, `mentor`, `email`, `credito`, `calculadora`, `empresa`, `onboarding`, `textos`, `socio-comercial`, `reino`, `maquete-rpg`, `dados` (commandbar), `estoque`*, `produtos`*, `cargos`*, `contabilidade`* (* parcialmente cobertos por Loja/Equipe/Financeiro).

**De admin da plataforma (15 — nenhum veio):** `tenants`, `curadoria`, `gestao`, `controle`, `dashboard`, `financeiro`, `consulta`, `juridico`, `reunioes`, `nichos`, `cargos`, `loja`, `aparencia`, `aplicativos`, `socio-comercial`. O front novo **não tem login nem lado admin**.

**Rotas públicas (clientes finais — nenhuma veio):** `/login`, `/cadastro`, `/reset-password`, `/impersonar`, `/contrato/:chave`, `/consulta/:chave`, `/rifa/:chave`, `/app/rifas`, `/sala/:chave`, `/agendar/:chave`, `/acompanhamento/:token`, `/reino`, `/mapa-motor`.

## 3. `frontend/aplicativos/` (sites separados, publicados à parte na Vercel)

`apresentacao-babel-os`, `babel-identidade`, `babel-instalador`, `babel-pabx`, `comercial-babel`, `custos-babel`, `formulario-babel` ("Chupa-Cabra"), `marcelo-meinster` ("M Master", mapas mentais), `site-plano-rifas` — **nenhum faz parte do front novo** (não precisam: são projetos independentes, cada um com seu deploy).

## 4. Consequência para o deploy de hoje

- O front novo cobre o **dia a dia do tenant** (atendimento, clientes, contratos, financeiro, agenda, agente, equipe) com UX nova.
- Ele **não substitui sozinho** o antigo: sem login, sem admin, sem rotas públicas (contrato, rifa, agendamento, acompanhamento) e sem rifas/campanhas.
- Caminho seguro para hoje: **front novo como app do tenant** + **front antigo mantido** para admin, rotas públicas e módulos ausentes (mesmo Supabase).

## 5. Contexto dos briefings (Downloads, lidos em 02/10)

Fontes: `~/Downloads/NOVO-FRONTEND-BABEL-OS.md 2` (briefing do front novo, decisões do Theus de 27/09) e `~/Downloads/FRONTEND-BABEL-OS (1).md` (o front antigo tela a tela e por que refazer).

- O `babel-os.html` é o **protótipo da Onda 1 do empresário** do briefing: Início, Conversas, Contatos, Clientes, Contratos, Financeiro, Agenda, Agente e Treino, Equipe com cargos, Loja + **Meu dia** (funcionário). Os apps "ausentes" não são esquecimento: pelo mapa da seção 4 do briefing eles são **fundidos** (Base→Contatos, Marketing+Textos→Mídias), **arquivados** (Contabilidade, RH, E-mail demo, Crédito, Calculadora→Precificação) ou ficam para as **Ondas 2–4** (portal do cliente, Pedidos, Mídias, Reunião/Telefone, Rifas como PWA, Reino, Escola…).
- O briefing exige **Onda 0 antes**: fundação de dados nova (`pessoa`, `vinculo`, `consentimento`, `cargo` no JWT + `authorize()`, `manifesto`, `vista`, `minuta`, `saida`, `chamado`, `preco_app`), login-agente, fila "precisa de você" (Minutas), Alfabeto de Vistas. **No banco atual só existem `cargos` e `gestao_chamados`** — o resto é schema novo (D-025, limpeza do banco).
- Lei 1 do briefing: **nenhum dado de exemplo na tela final** — o protótipo é 100% mocado.
- A porta **Babel (admin)** da Onda 1 (Painel, Suporte e Gestão, Mesa do Capitão, Curadoria…) **não está no protótipo**.

**Leitura para o prazo de hoje (~10 h):** a Onda 0 completa (schema novo + login-agente + minutas) não cabe. Cabe: protótipo da Onda 1 do empresário ligado às **tabelas atuais** (conversas, leads, contratos, movimentos_financeiros, eventos_agenda, produtos, agentes_usuario, cargos) com login Supabase comum; admin, rotas públicas e rifas seguem no front antigo; fundação nova vira a próxima etapa.
