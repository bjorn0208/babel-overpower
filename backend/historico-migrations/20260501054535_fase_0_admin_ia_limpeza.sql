-- Fase 0 do plano Admin IA v1 (docs/planejamento/admin-ia-v1.md)
-- 1) Corrige RPC promover_meta_chunks_estaveis (referenciava coluna inexistente atualizado_em — real é updated_at)
-- 2) Padroniza schema do JSONB regras_operacionais_chunks.parametros via comments

CREATE OR REPLACE FUNCTION public.promover_meta_chunks_estaveis(
  p_min_usos integer DEFAULT 10,
  p_janela_dias integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_promovidos int := 0;
BEGIN
  WITH usos_por_chunk AS (
    SELECT
      jsonb_array_elements_text(coalesce(metadata->'planejador'->'meta_consultados', '[]'::jsonb))::uuid AS meta_id,
      count(*) FILTER (
        WHERE coalesce(metadata->'verificador'->>'ok','true') <> 'false'
      ) AS usos_validos
    FROM public.llm_request_logs
    WHERE created_at > now() - (p_janela_dias || ' days')::interval
      AND metadata ? 'planejador'
    GROUP BY jsonb_array_elements_text(coalesce(metadata->'planejador'->'meta_consultados', '[]'::jsonb))
  ),
  promocoes AS (
    UPDATE public.meta_chunks mc
       SET stability_tier = 'promovido',
           updated_at = now()
      FROM usos_por_chunk u
     WHERE mc.id = u.meta_id
       AND mc.stability_tier = 'experimental'
       AND u.usos_validos >= p_min_usos
    RETURNING mc.id
  )
  SELECT count(*) INTO v_promovidos FROM promocoes;

  RETURN v_promovidos;
END;
$function$;

-- Padronização do schema JSONB de regras_operacionais_chunks.parametros
COMMENT ON COLUMN public.regras_operacionais_chunks.parametros IS
'Schema fixo por categoria (precedência: tenant > nicho > global):
- threshold: {acao: text, threshold: numeric (0..1)}
- rerank: {top_k: int, mmr: numeric (0..1), decay: numeric (0..1)}
- delay: {ms: int, jitter: int}
- limite: {max: int, janela: text}
- pausa: {horas: int, motivo: text}
- modelo: {slug: text, temperatura: numeric}
- embed: {modelo: text, dim: int}';

COMMENT ON TABLE public.regras_operacionais_chunks IS
'Regras operacionais por escopo (global/nicho/tenant). Override de configs vindas de trigger_thresholds, etc. Precedência efetiva: tenant > nicho > global. Resolução via tool admin_ia.threshold_resolver_efetivo.';
;
