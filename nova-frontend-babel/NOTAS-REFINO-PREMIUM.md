# Refino premium do babel os (04 e 05/10/2026)

Front novo (`babel-os.html`, 49 telas) refinado em 17 lotes, sempre comparando o antes (localhost:8080, `main`) com o depois (localhost:8081, `refino-premium`). Cada lote foi aprovado pelo Adrian antes de entrar. Scripts, diffs, fotos e testes de cada lote ficam em `Desktop/adrian/babel-overpower/lote-N/`; diário completo em `Desktop/adrian/babel-overpower/diario-refino-premium.md`.

## O que mudou

| Lote | O quê |
|---|---|
| 1a a 6 | Escala tipográfica com tokens e piso de 11px; espaçamento mais enxuto; dock no estilo macOS (reordenar, configurar); carregamento mais leve (fontes sem bloquear, logo de 200 KB para 38 KB); tema Noite padrão |
| 7 | Cortes no celular corrigidos (0 rolagem lateral em 390px) |
| 8 | Calculadora e Notas como janelas no desktop; notas de desenvolvimento fora da tela |
| 9 | Janelas mais premium; caixa de texto do Início alinhada, sem sobrepor a conversa |
| 10 | Comandos de voz ("abra as conversas"), sem eco do que foi dito, voz melhor |
| 11 | Conversa do Início fecha; microfone funcionando; resposta ao vivo (streaming) e voz por partes (`edge-tts/server.py` com `/tts-stream`; `servir.py` sobe a voz sozinho) |
| 12 | Babel conversacional: executa comandos (ex.: criar nota com quantos leads entraram hoje) e responde como gente (`babel-banco.js`: `contarLeads`) |
| 13 | Conversa contínua: microfone reabre depois da resposta; encerra por silêncio, "obrigado" ou Esc; "Deixa eu ver." |
| 14 | Autonomia nos apps: registro de ações com risco, confirmação no código, desfazer e histórico; modelo reserva quando a cota da IA acaba |
| 15 | Lote A da auditoria (só visual): modais, ícones de app, contraste, foco do teclado, leitor de tela, celular estreito |
| 16 | Lote B da auditoria: 297 emojis e símbolos de interface viraram ícones do conjunto |
| 17 | Lote C da auditoria: Agenda no dia de hoje; um contador só (sino, Conversas, Início); Exportar baixa CSV; imagem reduzida e aviso quando o navegador não grava; aba Cargos; "Sair" de Ajustes; nomes, saudação, mês e números da conta; textos sem jargão; ações dizem o que de fato aconteceu; "Gerar Pix" escondido; modelo único de vazio, carregando e erro |
| Login | `app.html`: login conversacional, fontes sem bloquear |

## Prova (lote 17, último)
- `node --check` no script principal: ok.
- 49 telas em 390, 1024 e 1440 (Chrome headless mudo, IA bloqueada): 0 rolagem lateral, 0 erros de console.

## Em aberto (Lote D, decisão do Adrian)
- Chave da Groq no código do navegador (`Groq.key()`); repositório público: trocar a chave e levar a chamada para o servidor.
- Separar os dados de demonstração da conta real (luzes de exemplo, "2 de ontem passaram do horário", respostas locais do Mentor).
- Domínio real dos links públicos (rifa, reunião, contrato) e da rota /reino.
- Plano pago da Groq (a cota grátis acaba em testes); microfone no celular precisa de https.
