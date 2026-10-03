# Estrutura SQL do motor e da plataforma

`rotinas/` contém as 452 funções públicas consultadas na origem em 26/09/2026 nesta auditoria, uma por assinatura. Nomes de arquivos incluem hash da assinatura para distinguir sobrecargas. São referências de leitura; mudanças devem gerar migrations novas.

O schema integral continua em `../schema.sql`. Dados, políticas, gatilhos, crons e inventários estão em `../../dados/`. O dump inclui estruturas gerenciadas do Supabase: precisa de plano de restauração para o novo projeto, não de execução cega do schema sobre um projeto já criado.

Estes arquivos podem conter configuração privada herdada da origem. Não publicar nem usar como seed automático.
