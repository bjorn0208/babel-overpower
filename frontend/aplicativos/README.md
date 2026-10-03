# Aplicativos recuperados da Vercel

Fontes das publicações atuais capturados em 26/09/2026. Os manifestos registram cada deployment e hash. O frontend principal permanece na pasta acima; PABX e Comercial usam o Supabase separado Babel Comercial.

| Projeto | Pasta | Situação |
|---|---|---|
| babel-pabx | [babel-pabx](babel-pabx/) | Build local aprovado, sem teste dos serviços |
| comercial-babel | [comercial-babel](comercial-babel/) | Build local aprovado, sem teste dos serviços |
| apresentacao-babel-os | [apresentacao-babel-os](apresentacao-babel-os/) | Fonte publicado preservado; execução não validada |
| babel-identidade | [babel-identidade](babel-identidade/) | Fonte publicado preservado; execução não validada |
| babel-instalador | [babel-instalador](babel-instalador/) | Fonte publicado preservado; execução não validada |
| custos-babel | [custos-babel](custos-babel/) | Fonte publicado preservado; execução não validada |
| formulario-babel | [formulario-babel](formulario-babel/) | Fonte publicado preservado; execução não validada |
| marcelo-meinster | [marcelo-meinster](marcelo-meinster/) | Fonte publicado preservado; execução não validada |
| site-plano-rifas | [site-plano-rifas](site-plano-rifas/) | Fonte publicado preservado; execução não validada |

## Configuração

Os `.env` e valores remotos estão em `../../dados/complementos-20260926-1919/vercel/<projeto>/`, privados. Cada `.env.example` local contém somente os nomes e placeholders. O build local não usa produção. Não executar scripts/importações da aplicação contra clientes reais durante o ensaio.

O projeto Vercel `src` é um fragmento do frontend Babel sem package.json na publicação. Foi preservado em dados como referência separada, sem substituir a aplicação principal. Os 59 arquivos adicionais da captura principal são metadados, documentação e backend aninhado antigo; também ficam na captura privada.

Os fontes do Formulário incluem handlers Node e Apps Script. A planilha Google, suas propriedades e a URL publicada ainda exigem acesso Google. O PABX/Reunião precisam também do VPS HostGator.

[Estado consolidado](../../dados/complementos-20260926-1919/README.md) · [Catálogo de recursos](../../dados/catalogo-integracoes/README.md)
