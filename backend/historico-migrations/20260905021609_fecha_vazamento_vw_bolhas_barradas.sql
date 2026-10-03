-- VAZAMENTO ENTRE TENANTS (P0), criado em 2026-09-04 junto com o vigia de bolhas.
--
-- A view roda com a permissão do dono (postgres), então ignora a RLS de
-- caixa_saida_mensagens e profiles. E estava com TODOS os privilégios concedidos
-- a anon e authenticated — a chave anon é pública no frontend.
--
-- Verificado em produção antes do fix: `set local role anon; select * from
-- public.vw_bolhas_barradas` devolvia tenant_id, nome do tenant e trecho do
-- conteúdo de mensagem de outro cliente.
--
-- Fix em duas camadas:
--   1. security_invoker: a RLS das tabelas de base passa a valer pra quem consulta.
--      service_role continua enxergando tudo (ele ignora RLS), que é o uso real —
--      a view é ferramenta de diagnóstico do vigia, não tem consumidor no frontend.
--   2. revoke: nenhum papel de cliente precisa dessa view, e ela ainda tinha
--      INSERT/UPDATE/DELETE/TRUNCATE concedidos, o que não faz sentido nenhum.

alter view public.vw_bolhas_barradas set (security_invoker = on);

revoke all on public.vw_bolhas_barradas from anon;
revoke all on public.vw_bolhas_barradas from authenticated;

comment on view public.vw_bolhas_barradas is
  'Bolhas barradas por guard nos últimos 7 dias, agrupadas por dia/motivo/tenant. '
  'security_invoker=on e sem grant pra anon/authenticated: é diagnóstico de operação, '
  'consultada com service_role. Ver migration 20260905_fecha_vazamento_vw_bolhas_barradas.';
;
