
-- Migration 5 — Criar views PT-BR + manter velhas como alias durante transição

-- v_crenca_taxa (substitui v_belief_taxa)
CREATE OR REPLACE VIEW public.v_crenca_taxa AS
SELECT date_trunc('hour'::text, created_at) AS hora,
    count(*) AS total_turnos,
    count(*) FILTER (WHERE (((metadata ->> 'belief_devolvido'::text))::boolean = true)) AS crenca_ok,
    count(*) FILTER (WHERE ((metadata ->> 'motivo_falha'::text) = 'parsed_ausente'::text)) AS falha_parsed_ausente,
    count(*) FILTER (WHERE ((metadata ->> 'motivo_falha'::text) = 'zod_falhou'::text)) AS falha_zod,
    count(*) FILTER (WHERE ((metadata ->> 'motivo_falha'::text) = 'sem_tenant'::text)) AS falha_sem_tenant,
    round(((100.0 * (count(*) FILTER (WHERE (((metadata ->> 'belief_devolvido'::text))::boolean = true)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS pct_ok
FROM public.logs_requisicao_llm
WHERE ((tipo = 'chat'::text) AND (created_at > (now() - '7 days'::interval)) AND (metadata ? 'belief_devolvido'::text))
GROUP BY (date_trunc('hour'::text, created_at))
ORDER BY (date_trunc('hour'::text, created_at)) DESC;

-- v_saude_perfil (substitui v_profile_health)
CREATE OR REPLACE VIEW public.v_saude_perfil AS
SELECT p.id,
    p.email,
    p.full_name,
    p.parent_user_id,
    p.system_role,
    CASE
        WHEN ((p.parent_user_id IS NULL) AND (ua.user_id IS NULL)) THEN 'tenant_sem_agente'::text
        WHEN ((p.parent_user_id IS NOT NULL) AND (ua.user_id IS NOT NULL)) THEN 'equipe_com_agente_orfao'::text
        WHEN ((p.parent_user_id IS NOT NULL) AND (p.system_role = 'platform_admin'::text)) THEN 'equipe_como_admin'::text
        WHEN ((p.parent_user_id IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.profiles pp
          WHERE ((pp.id = p.parent_user_id) AND (pp.parent_user_id IS NULL)))))) THEN 'pai_invalido'::text
        ELSE 'ok'::text
    END AS status_integridade
FROM (public.profiles p
LEFT JOIN public.agentes_usuario ua ON ((ua.user_id = p.id)));

-- Drop views velhas (callers EN ficam quebrados — Theus quer 100%)
DROP VIEW IF EXISTS public.v_belief_taxa;
DROP VIEW IF EXISTS public.v_profile_health;

-- Permissões
GRANT SELECT ON public.v_crenca_taxa TO authenticated, service_role;
GRANT SELECT ON public.v_saude_perfil TO authenticated, service_role;

-- Validação
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.views
  WHERE table_schema='public' AND table_name IN ('v_belief_taxa','v_profile_health');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Validação falhou: views EN ainda existem';
  END IF;
END $$;

;
