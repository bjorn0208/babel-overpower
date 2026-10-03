-- Onda 5 fatia 3: adapter gatilhos_reativos unificando blocos_gatilho ∪ automacao_blocos ∪ gatilhos_reativos
-- Cria view vw_gatilhos_reativos que normaliza as três fontes num formato único
-- e função fn_buscar_gatilhos_reativos(tenant, cargo, cenario) usada pelos workers.

CREATE OR REPLACE VIEW public.vw_gatilhos_reativos AS
-- 1) origem nativa: gatilhos_reativos (já no formato pt-br)
SELECT
  g.id,
  'gatilhos_reativos'::text AS origem,
  g.escopo::text             AS escopo,
  g.tenant_id,
  g.nicho_id,
  g.cargo_id,
  g.cenario,
  g.acao_tipo,
  g.acao_carga,
  NULL::text                 AS exemplo_frase,
  g.ativo,
  g.criado_em
FROM public.gatilhos_reativos g
WHERE g.ativo = true

UNION ALL

-- 2) blocos_gatilho legados (palavras-chave/exemplos → ação)
SELECT
  b.id,
  'blocos_gatilho'::text     AS origem,
  b.escopo,
  b.tenant_id,
  b.nicho_id,
  b.cargo_id,
  COALESCE(b.categoria, b.nome_trigger) AS cenario,
  COALESCE(b.acao_disparada, 'prompt_bloco') AS acao_tipo,
  COALESCE(b.acao_payload, '{}'::jsonb)
    || jsonb_build_object('exemplo_frase', b.exemplo_frase,
                          'nome_trigger', b.nome_trigger,
                          'subcategoria', b.subcategoria,
                          'condicao_tipo', b.condicao_tipo,
                          'tempo_aguardar_minutos', b.tempo_aguardar_minutos)
                             AS acao_carga,
  b.exemplo_frase,
  b.ativo,
  b.created_at               AS criado_em
FROM public.blocos_gatilho b
WHERE b.ativo = true

UNION ALL

-- 3) automacao_blocos (cenários proativos/agendados)
SELECT
  a.id,
  'automacao_blocos'::text   AS origem,
  a.escopo,
  a.tenant_id,
  a.nicho_id,
  NULL::uuid                 AS cargo_id,
  a.cenario,
  'automacao'::text          AS acao_tipo,
  COALESCE(a.carga, '{}'::jsonb)
    || jsonb_build_object('condicao_extra', a.condicao_extra,
                          'descricao', a.descricao,
                          'nome', a.nome)
                             AS acao_carga,
  NULL::text                 AS exemplo_frase,
  a.ativo,
  a.created_at               AS criado_em
FROM public.automacao_blocos a
WHERE a.ativo = true;

COMMENT ON VIEW public.vw_gatilhos_reativos IS
'Onda 5 fatia 3 — adapter unificado: gatilhos_reativos ∪ blocos_gatilho ∪ automacao_blocos. Uso: workers do loop LLM-OS lêem aqui em vez de varrer 3 tabelas.';

-- Função helper: filtra por tenant (com fallback global), cargo e cenário.
CREATE OR REPLACE FUNCTION public.fn_buscar_gatilhos_reativos(
  p_tenant_id uuid,
  p_cargo_id  uuid DEFAULT NULL,
  p_cenario   text DEFAULT NULL,
  p_limite    int  DEFAULT 50
)
RETURNS SETOF public.vw_gatilhos_reativos
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.vw_gatilhos_reativos v
  WHERE
    -- escopo: global (sem tenant) OU pertence ao tenant
    (v.tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (p_cargo_id IS NULL OR v.cargo_id IS NULL OR v.cargo_id = p_cargo_id)
    AND (p_cenario IS NULL OR v.cenario ILIKE p_cenario)
  ORDER BY
    -- prioridade: tenant-específico > nicho > global
    CASE WHEN v.tenant_id = p_tenant_id THEN 0
         WHEN v.nicho_id IS NOT NULL THEN 1
         ELSE 2 END,
    v.criado_em DESC
  LIMIT GREATEST(1, LEAST(p_limite, 200));
$$;

COMMENT ON FUNCTION public.fn_buscar_gatilhos_reativos(uuid,uuid,text,int) IS
'Onda 5 fatia 3 — busca gatilhos reativos do escopo (tenant>nicho>global), opcionalmente filtrados por cargo e cenário.';

GRANT SELECT ON public.vw_gatilhos_reativos TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_buscar_gatilhos_reativos(uuid,uuid,text,int) TO authenticated, service_role;
;
