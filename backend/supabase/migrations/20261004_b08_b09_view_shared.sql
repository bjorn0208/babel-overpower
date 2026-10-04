-- B-08: View config_plataforma_publico com security_invoker=true
-- Garante que RLS da tabela base seja respeitado mesmo para anon/authenticated
CREATE OR REPLACE VIEW public.config_plataforma_publico WITH (security_invoker='true') AS
SELECT id,
       system_name,
       logo_url,
       primary_color,
       description,
       domain,
       support_email,
       pix_key,
       termos_uso,
       termos_uso_ativo
FROM public.config_plataforma;

COMMENT ON VIEW public.config_plataforma_publico IS 'Config da plataforma exposta ao visitante (B-08 fix): security_invoker=true garante que RLS da tabela base seja aplicado.';

-- B-09: Deduplicação _shared — cors.ts canônico
-- Substitui todas as 36 cópias por versão única com CORS restrito
-- Nota: este SQL apenas documenta; a deduplicação real é feita via script de arquivos
-- O conteúdo canônico do cors.ts deve ser replicado manualmente ou via script shell