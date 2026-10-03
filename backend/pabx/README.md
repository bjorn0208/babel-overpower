# Backend PABX recuperado

Origem confirmada: projeto Supabase **Babel Comercial**, ref `fimfdajfjorevsfcsywh`. O nome do projeto não indicava PABX; a identificação foi confirmada pelo histórico local e pelas tabelas atuais de chamadas/telefonia.

- `supabase/functions/`: as 16 Edge Functions publicadas, baixadas pela API do Supabase. Arquivos preservados sem edição; versões e origem em [manifesto-origem.json](manifesto-origem.json) e no inventário da captura em `dados/pabx`.
- `schema.sql`: schema extraído do dump PostgreSQL, com tabelas, funções, índices, políticas e demais objetos incluídos pelo pg_dump. Não é migration pronta para aplicar sobre outro projeto.
- `dependencias.json`: hosts, nomes de variáveis e provedores encontrados no código das edges.

O código histórico do motor de voz e serviços VPS foi recuperado em [vps-historico](vps-historico/) e [bmail-historico](bmail-historico/). A versão instalada atualmente no servidor ainda não foi comparada. Edge Functions não substituem Asterisk, LiveKit, transcritores, ligadora, provisionador, coturn e bmail.

Dados e arquivos: [dados/pabx](../../dados/pabx/README.md). O fonte editável da publicação foi recuperado depois: [frontend PABX](../../frontend/aplicativos/babel-pabx/). O [build HTTP anterior](../../frontend/pabx-publicado/README.md) também foi preservado; o Git histórico local foi preservado no arquivo original, sem comprovar equivalência com a publicação atual. Não houve deploy, integração ao app Babel nem teste de chamadas.
