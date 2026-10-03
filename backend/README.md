# Backend da Babel

Código publicado: 96 Edge Functions em `supabase/functions/<slug>/pacote/`. Cada pacote mantém seus arquivos e imports originais: 16 caminhos compartilhados tinham versões diferentes nas publicações, por isso não foram fundidos.

`supabase/config.toml` aponta cada função para seu entrypoint e preserva `verify_jwt` da captura. O projeto local se chama `sistemababel-local`; não há vínculo CLI com produção. A configuração usa entrypoints customizados, suportados pela [CLI Supabase](https://supabase.com/docs/guides/functions/function-configuration).

`schema.sql` é o schema completo extraído do dump. `historico-migrations/` contém 1.099 arquivos reconstruídos dos statements do histórico aplicado, sem misturar as versões divergentes do checkout antigo. Outras 7 versões têm registro mas não têm statements na origem; constam em `sem-sql-no-historico.json`. Não há invenção de SQL para esses registros. O dump em `../dados/banco/database.dump` preserva o estado final do banco.

A restauração deve partir do dump em um ambiente separado compatível com PostgreSQL 17 e extensões capturadas. As migrations históricas não são um instalador novo; não reaplicá-las depois de restaurar. `supabase/migrations/` é a pasta para mudanças futuras.

Credenciais recuperáveis e configurações do serviço ficam em `../dados/configuracoes/`, privadas. Ainda faltam 12 secrets na captura original. Banco e serviços locais não foram iniciados por esta preparação.

Um complemento somente de tipos foi incluído em `supabase/functions/ragentic-processar-inline/pacote/_shared/sintese-com-citacao.ts`: o pacote remoto tinha um `import type` para esse arquivo, mas não o incluía. As duas declarações foram recuperadas do código anterior via Serena, sem adicionar implementação de execução. Os arquivos efetivamente publicados continuam com seus hashes originais.

## Auditoria e dados atualizados

[Mapa completo do motor](MAPA-DO-MOTOR.md) e [auditoria para migração](../dados/AUDITORIA-MIGRACAO.md). A captura nova é de 26/09 às 18:00:44 BRT, em `../dados/atualizacao-20260926-1800/`; o schema foi reconfirmado idêntico ao anterior, exceto tokens aleatórios do pg_dump. As 452 funções SQL estão separadas em `banco/rotinas/`; os testes existentes foram preservados em `referencia-testes/`.
