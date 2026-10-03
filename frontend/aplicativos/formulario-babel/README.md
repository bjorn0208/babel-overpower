# Chupa-Cabra Babel

Formulário de levantamento dos clientes (tenants) da Babel. O cliente recebe o link, preenche as 64 perguntas em 10 seções (as 38 do Formulário de Implementação + as de agente, contrato, agenda, funil e passagem pra humano), cadastra os produtos e, no fim, aceita o uso dos dados e conecta um WhatsApp da empresa — por QR code ou por código de pareamento. Tudo cai numa planilha do Google:

- **Aba "Dados"** — uma linha por cliente: data, as 64 respostas (uma coluna por pergunta), como conectou (QR code / Código / Sem conexão), o aceite de dados, quantas conversas vieram e um ID do envio.
- **Aba "Produtos"** — uma linha por produto/serviço que o cliente cadastrou (nome, como funciona, valor, prazos, entrega, garantia, contrato…), com "Enviado em", "ID do envio" e "Empresa" na frente pra cruzar com a aba "Dados".
- **Uma aba por cliente** (nome comercial) — coluna A = contato (nome e telefone), coluna B = a conversa inteira, uma mensagem por linha com data/hora.

Não tem banco: só a planilha.

## Como funciona

```
navegador ──POST /api/enviar──▶ Vercel Function ──POST──▶ Apps Script ──▶ aba "Dados"
navegador ──POST /api/whatsapp-qr (SSE)──▶ Vercel Function (Baileys, QR ou código, histórico) ──POST em lotes──▶ Apps Script ──▶ aba do cliente
```

- `src/campos.ts` — os 64 campos (chave, rótulo, tipo, seção). **Duas ordens de propósito:** a do array `CAMPOS` é a das colunas da aba "Dados" (campo novo entra sempre no fim, o Apps Script reescreve o cabeçalho quando ele muda); a da tela vem de `ORDEM_TELA`, que é o roteiro do formulário. Mudar a *chave* de um campo quebra os rascunhos salvos no navegador; seção e rótulo podem mudar à vontade.
- `PLACEHOLDERS` (mesmo arquivo) — os exemplos por conjunto de segmento: `generico` é o padrão, `credito` entra quando o segmento fala de crédito/financeiro/limpa nome. Segmento novo = uma entrada nova no objeto + a regra em `conjuntoExemplos`. Nenhum exemplo promete resultado, cita "via judicial"/"advogado" como argumento de venda ou usa "garantido" ligado a resultado.
- `CAMPOS_PRODUTO` (mesmo arquivo) — os 17 campos de cada cartão de produto/serviço; o cliente adiciona quantos quiser. Mesma regra: campo novo no fim.
- `api/enviar.ts` — valida e grava a linha na aba "Dados" e os produtos na aba "Produtos" (mesma chamada ao Apps Script). A gravação acontece **antes** de qualquer conexão de WhatsApp: se o vínculo falhar, o preenchimento não se perde.
- `api/whatsapp-qr.ts` — vínculo do WhatsApp (Baileys) por QR de "aparelho conectado" ou por código de pareamento (`metodo: "codigo"` + `telefone`), lê o histórico 1 vez, formata cada conversa e manda em lotes. Portado de `BABEL OS 2/frontend/api/whatsapp-importar.ts`; faz `logout()` ao terminar.
- `src/TelaConexao.tsx` — a tela do vínculo: QR, código com botão de copiar, "Gerar novamente" e troca entre os dois métodos.
- `planilha/Code.gs` — o Apps Script que vai dentro da planilha.

## 1. Instalar o Apps Script na planilha (uma vez)

1. Crie uma planilha nova no Google Sheets (ex.: "Levantamento Tenants Babel").
2. **Extensões → Apps Script**. Apague o conteúdo de `Código.gs` e cole o `planilha/Code.gs` deste repo. Salve.
3. Gere um segredo: `openssl rand -hex 24`.
4. No editor do Apps Script: **Configurações do projeto (engrenagem) → Propriedades do script → Adicionar**: nome `TOKEN`, valor = o segredo. Salvar.
5. **Implantar → Nova implantação → tipo "App da Web"**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Implantar → autorizar a conta → copiar a **URL do app da Web** (termina em `/exec`).
6. Teste no terminal:
   ```bash
   curl -sL "URL_DO_EXEC" -H 'Content-Type: text/plain' -d '{"token":"SEU_SEGREDO","acao":"ping"}'
   # → {"ok":true}
   ```
   Sem `-X POST`: o Apps Script responde com um redirect e o curl precisa trocar pra GET nele (com `-X POST` forçado ele repete POST e o Google devolve 405/404 — não é erro do script).

Se editar o `Code.gs` depois: **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar**. Assim a URL continua a mesma.

## 2. Rodar local

```bash
npm install
cp .env.example .env.local   # preencha PLANILHA_WEBAPP_URL e PLANILHA_TOKEN
npm run dev                  # vercel dev — sobe o Vite + as functions em http://localhost:3000
```

`npm run dev:front` sobe só o Vite (formulário sem as APIs). `npm run check` roda o TypeScript no front e nas functions.

## 3. Deploy

```bash
vercel link              # projeto "formulario-babel" (era "chupa-cabra" até 2026-09-11)
vercel env add PLANILHA_WEBAPP_URL production
vercel env add PLANILHA_TOKEN production
vercel --prod
```

## O 428 antes do QR (resolvido em 2026-09-11)

O WhatsApp aposentou as sub-plataformas WIN32 e DARWIN: um socket que se identifica como "Mac OS/Desktop" ou "Windows/Desktop" com histórico completo cai com 428 em ~1 s, antes de gerar o QR. O Baileys corrigiu no master (PR #2741, Windows → WIN_HYBRID) mas o `7.0.0-rc14` do npm ainda não tem. Aqui isso é resolvido por `scripts/patch-baileys.mjs`, que roda no `postinstall` e faz a troca de uma linha na lib; a function usa `Browsers.windows("Desktop")`. Quando o Baileys publicar uma versão com o fix, o script detecta e não faz nada.

A function `whatsapp-importar.ts` da Babel usa `Browsers.macOS("Desktop")` e sofre do mesmo problema.

## iPhone: "Não foi possível conectar o dispositivo" (resolvido em 2026-09-15)

O celular recusa o vínculo quando o socket anuncia uma versão velha do WhatsApp Web. O `fetchLatestBaileysVersion()` lê um JSON do repo do Baileys que fica dias atrasado e ainda responde `isLatest: true` (issue #2679). Em 15/09 ele devolvia 2.3000.1043857760 com a web já em 2.3000.1047595053, e o iPhone da VALORIZA SOLUÇÕES não conectava. Agora a function pega a versão direto do `web.whatsapp.com/sw.js` (`fetchLatestWaWebVersion`), cai pro Baileys e, por último, pro `FALLBACK_WA_VERSION`. Se voltar a acontecer, confira no log a linha `WA version=… origem=…` e atualize o fallback.

## Limites que valem saber

- Só conversas de **texto** e **individuais** (sem grupos, sem mídia). O histórico é o que o celular sincroniza no vínculo — normalmente os últimos meses, não o arquivo eterno.
- O QR precisa ser aberto num **computador** e escaneado pelo celular que tem o WhatsApp. Quem só tem o celular usa **conectar por código**: o formulário pede o número, a function chama `requestPairingCode` do Baileys e a pessoa digita o código em Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone.
- A function tem 300 s (`maxDuration`): 120 s esperando o scan do QR (180 s no código, que é mais lento de digitar), até 220 s de sincronização, o resto pra gravar na planilha.
- O WhatsApp conectado no fim **não precisa ser** o número que o agente vai usar — é só de onde a Babel lê as conversas pra aprender.
- Célula do Sheets aguenta 50.000 caracteres: conversa maior é fatiada em "(parte 2)", "(parte 3)".
- Se o mesmo cliente enviar duas vezes, a segunda aba vira "Nome (2)" — nada é sobrescrito.
- Baileys é client não-oficial do WhatsApp: há chance baixa-mas-real de o número ser flagado. É leitura pontual com logout no fim.

## Colunas de controle da aba "Dados"

As quatro últimas colunas ("Como conectou", "Aceite de dados", "Conversas trazidas", "ID do envio") ficam sempre depois das respostas, e o `Code.gs` acha o "ID do envio" pela última coluna e o total pela penúltima. Como campo novo entra antes delas, elas andam pra direita a cada rodada de campos novos — os envios antigos continuam com esses dois valores na posição velha. É o preço de nunca mexer nas colunas de resposta já gravadas.
