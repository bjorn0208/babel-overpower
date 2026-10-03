# B-Mail — servidor de e-mail próprio da Babel

## O que está no ar

**`mail.babel-os.com`** — Stalwart 0.16.16 na VPS da Babel, serviço `babel-mail`,
sobe sozinho no boot. Software livre, dados na sua máquina, sem terceiros.

| endereço | o que é |
|---|---|
| https://mail.babel-os.com/admin/ | painel (`admin` / `BabelMail-2026`) |
| porta 25 | recebe e-mail do mundo |
| `babel-os.com` MX → mail.babel-os.com | qualquer um pode escrever para `@babel-os.com` |

Caixa: `theus@babel-os.com`.

### Convivência com o PABX

O e-mail divide a máquina com Asterisk, whisper e LiveKit. Por isso o serviço
tem **CPUQuota=60%**, **MemoryMax=900M**, `Nice=10`, I/O ocioso, e só sobe
**depois** do Asterisk num reboot. A ligação é o faturamento; o e-mail nunca
pode tomar a máquina dela.

O Caddy dá o TLS por proxy reverso (`127.0.0.1:8080`) — o Stalwart não toca na
porta 443, que é do Caddy. Backup do Caddyfile em
`/root/backup-Caddyfile-2026-08-08`.

## A ponte (roda na máquina de quem desenvolve)

```sh
cd bmail/servidor
BMAIL_STALWART='https://mail.babel-os.com' \
BMAIL_USUARIO='theus@babel-os.com' BMAIL_SENHA='<senha>' \
BMAIL_HOSTNAME='mail.babel-os.com' \
BMAIL_RESEND='<chave do Resend>' \
node bmail.js &
```

O navegador nunca fala JMAP direto: tudo passa por aqui. Rotas:
`mailboxes`, `threads`, `thread`, `marcar`, `responder`, `enviar`, `status`.

## O que funciona

- **Receber** do mundo, com antispam classificando
- **Ler** na aba B-Mail do PABX, com iframe isolado e imagens remotas bloqueadas
- **Responder** — cai no mesmo fio (In-Reply-To/References) e arquiva em Enviados
- **Enviar proposta** pelo botão da tela pós-ligação (Resend, chega na entrada)

## O bloqueio que resta (diagnóstico refeito em 15/08/2026)

Um único culpado para os dois problemas: **o HostGator** (a rede é unifiedlayer).
Um chamado resolve os dois pedidos:

**1. Receber — entrada da porta 25 filtrada pelo provedor.** O firewall da VPS
aceita (teste pelo IP público de dentro da máquina: abre), o Stalwart escuta na
25 e entrega na caixa (testado por SMTP real, mensagem chegou via JMAP) — mas
de fora a porta não conecta. O filtro está antes da VPS. As portas 465 e 993
passam normalmente; só a 25 (e a 587, que nem escuta) está retida.

**2. Enviar direto — falta o PTR.** A saída da porta 25 está LIVRE (a VPS
alcança o MX do Gmail), mas o reverso do IP é o genérico
`143-95-216-197.unifiedlayer.com` e o Gmail recusa:

```
550-5.7.25 The IP address sending this message does not have a PTR record
setup ... As a policy, Gmail does not accept messages from IPs with
missing PTR records.
```

Pedir no mesmo chamado: PTR de `143.95.216.197` → `mail.babel-os.com`.

**DNS já resolvido em 15/08:** SPF da raiz
(`v=spf1 include:amazonses.com ip4:143.95.216.197 ~all`) e DMARC
(`_dmarc`, `p=none`, relatórios para `theus@babel-os.com`) criados na Vercel.

Enquanto isso, a rota `responder` sai pelo Resend (`@contato.babel-os.com`) com
**Reply-To para `theus@babel-os.com`** — a resposta do cliente volta para o
servidor da Babel. Quando o PTR sair, é só remover `BMAIL_RESEND` e tudo volta
pelo caminho nativo, sem mudar código.

## Armadilhas que custaram caro

**Criar conta:** em "Credentials" **não há campo de senha** — é preciso clicar
em **"+ Add item"** primeiro. Sem isso a conta nasce sem credencial e nada
autentica, sem mensagem de erro que explique.

**Bootstrap da v0.16:** o `-c` não aceita mais `config.toml`. Quer um JSON só com
o banco: `{"@type":"RocksDb","path":"/caminho"}` — chave `@type`, valor em
CamelCase. Um TOML normal devolve `expected value at line 1 column 1`, que
parece erro de sintaxe e não é.

**`POST /api/principal` não existe mais.** Na v0.16 a administração virou JMAP:
`POST /jmap/` com `using: ["urn:ietf:params:jmap:core","urn:stalwart:jmap"]` e
métodos `x:Account/query|get|set`, autenticando com Basic `admin`. Foi assim que
o alias `contato@babel-os.com` foi criado em 15/08 (objeto:
`aliases: {"0": {"name": "contato", "domainId": "b"}}` na conta `theus`).
O `POST /api` dos docs devolve 404 nesta versão — use `/jmap/`.

**Dois servidores.** Havia um Stalwart de teste no Mac (porta 3311 local) e este
na VPS. Bancos separados — conta criada num não existe no outro.

**Envio via JMAP** exige `identityId` (de `Identity/get`), e o fio da conversa
vai em `inReplyTo`/`references` **sem** os sinais `<>` — cabeçalho cru faz o
servidor recusar a criação.

## Próximos passos

1. PTR reverso na Hostinger (só isso destrava o envio próprio)
2. Compor mensagem nova (hoje só responde)
3. Anexos
4. Camada Babel: o agente lê a resposta e sugere o retorno
