# Motor da Babel — mapa para trabalhar nesta pasta

## Ponto de partida observado

Auditoria de 26/09/2026. O motor publicado é **ragentic-processar-inline v317**; a entrada WhatsApp principal é **webhook v122**. As 96 versões locais correspondem às versões consultadas na origem nesta auditoria. O pacote do motor tem seu código e seus módulos compartilhados em `supabase/functions/ragentic-processar-inline/pacote/`.

Cada edge mantém a versão dos módulos que foi publicada junto dela. Há 16 caminhos compartilhados com conteúdos diferentes entre publicações. Unificar `_shared` exige comparar comportamento e validar; copiar uma versão sobre todas muda o sistema.

## Onde estão as peças

Todos os caminhos da segunda coluna partem de `supabase/functions/`.

| Peça | Código publicado | Dependências de banco preservadas |
|---|---|---|
| Entrada WhatsApp | `webhook/pacote/` | canais, conversas, mensagens, deduplicação, buffer e travas |
| Instagram e WhatsApp oficial | `webhook-instagram/pacote/`, `webhook-whatsapp-oficial/pacote/` | canais, distribuição e configuração das integrações |
| Turno do agente | `ragentic-processar-inline/pacote/ragentic-processar-inline/index.ts` | agentes, cargos, configuração LLM, conhecimento, memória, ferramentas e traces |
| Ferramentas e prompt | `ragentic-processar-inline/pacote/_shared/` | ferramentas dinâmicas, produtos, financeiro, rifas, documentos, mentor e curadoria |
| Recuperação de conhecimento | `_shared/tools-rag.ts` e `_shared/tools-internas.ts` dentro dos pacotes que os usam | `busca_hibrida_*`, blocos, escopo global/nicho/tenant, vetores e provedores |
| Embeddings e ingestão | `gerar-embedding/pacote/`, `processar-conversas-zip/pacote/`, `aprender-conversa-whatsapp/pacote/` | dados originais, estado de embedding, fila `embedding_jobs`, arquivos Storage |
| Memória do lead e do dono | módulos `memoria-*`, `recall-memoria.ts` e edges de memória | memória do lead, episódica, crença, ficha, perfil da empresa e memória do dono |
| Enfileiramento e envio | `ragentic-tick/pacote/`, `processar-acompanhamentos/pacote/`, `enviar-mensagem/pacote/` | filas pgmq, caixa de saída, ações agendadas, limites e canais |
| Mentor e canais internos | `mentor-chat/pacote/`, `agente-mestre-chat/pacote/` e `_shared/canal-interno.ts` | conversas do mentor, memória e permissões das ferramentas |
| Operação recorrente | edges `cron-*` e definições em `../dados/auditoria/crons-completos.json` | 57 crons, todos ativos na origem consultada |
| Interface de configuração/inspeção | `../frontend/src/apps/` a partir desta pasta backend | Admin/curadoria, agente, cargos, conversas, chat de teste e Mentor |

O mapa descreve a localização e as dependências verificadas. Não representa um teste executado de cada caminho.

## SQL e dados

- [Rotinas SQL por assinatura](banco/README.md): 452 funções públicas em arquivos individuais.
- `schema.sql`: estado completo do schema da captura inicial; captura atualizada e dados estão indicados em `../dados/README.md`.
- `historico-migrations/`: 1.099 arquivos recuperados de 1.106 entradas aplicadas. Sete entradas não contêm SQL no histórico remoto. O estado final dessas mudanças está no schema; não inventar arquivos nem repetir o histórico após restaurar.
- `../dados/auditoria/`: políticas, gatilhos, crons, relações, chamadas do código e cobertura de segredos.
- [Testes existentes](referencia-testes/README.md): 23 testes e suas dependências, preservados como referência do checkout de desenvolvimento. Não são uma aprovação da versão publicada.

## Resultado da conferência de dependências

O inventário AST percorreu 1.096 arquivos do backend e do frontend, incluindo API handlers. Encontrou referências estáticas a 183 relações, 14 buckets, 175 nomes de RPC e 43 edges. Relações, buckets e edges referenciados foram encontrados; 174 dos 175 nomes de RPC foram encontrados.

**Inconsistência da origem:** `cron-tags-curadoria/pacote/cron-tags-curadoria/index.ts:18` chama `backfill_candidatos_tag`, ausente do catálogo atual. O código ignora o campo `error` dessa chamada. Isso pode fazer a etapa falhar sem interromper o restante do pipeline. O cron `tag_curadoria_executar` está ativo a cada três horas e aponta para essa edge. O efeito em execução não foi reproduzido. A ausência existe antes da migração; não é arquivo perdido no clone.

Há chamadas dinâmicas que o inventário estático não consegue resolver sozinho. O endpoint RAG atualmente cadastrado no banco foi conferido e sua RPC existe. Testes de integração ainda são necessários para argumentos, permissões e efeitos.

## Antes de melhorar ou ligar o novo ambiente

1. Restaurar primeiro em outro Supabase isolado, preservando IDs e relações entre tenants.
2. Ajustar URLs/chaves do projeto novo, referências diretas ao projeto antigo e callbacks externos. Os locais estão em `../dados/auditoria/referencias-projeto-origem.json`.
3. Manter automações e envios desligados durante o ensaio: o backup contém filas, ações pendentes e 57 crons ativos na origem.
4. Validar um turno com entrada de teste, memória, RAG com fonte, ferramentas, saída controlada e traces; testar duas identidades de tenants diferentes.
5. Só então alterar módulos do motor, com testes voltados ao comportamento escolhido. O arquivo principal publicado tem cerca de 305 KB; dividir o arquivo deve preservar o comportamento observável.

O clone contém o código e os dados da Babel. Serviços externos — WhatsApp, LLM, e-mail, pagamentos e hospedagem — exigem configuração e validação próprias no destino.
