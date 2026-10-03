-- Fase 3 pendências: 7 tabelas + 18 colunas + 9 RPCs (preservando hybrid_search_*)

-- ============ BLOCO A: 7 tabelas com sufixo _chunks ============
ALTER TABLE public.acao_pausa_chunks RENAME TO acao_pausa_blocos;
ALTER TABLE public.automacao_chunks RENAME TO automacao_blocos;
ALTER TABLE public.diretriz_bolha_chunks RENAME TO diretriz_bolha_blocos;
ALTER TABLE public.emocao_chunks RENAME TO emocao_blocos;
ALTER TABLE public.manipulacao_chunks RENAME TO manipulacao_blocos;
ALTER TABLE public.prova_social_chunks RENAME TO prova_social_blocos;
ALTER TABLE public.regras_operacionais_chunks RENAME TO regras_operacionais_blocos;

-- ============ BLOCO C: 18 colunas com chunk ============
ALTER TABLE public.admin_ia_reflexao RENAME COLUMN destilado_em_chunk_id TO destilado_em_bloco_id;
ALTER TABLE public.auditoria_blocos RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.automacao_semantica RENAME COLUMN meta_chunk_origem TO meta_bloco_origem;
ALTER TABLE public.candidatos_bloco RENAME COLUMN promoted_chunk_id TO promoted_bloco_id;
ALTER TABLE public.candidatos_bloco RENAME COLUMN promoted_chunk_table TO promoted_bloco_table;
ALTER TABLE public.depoimentos_publicos RENAME COLUMN rag_chunk_id TO rag_bloco_id;
ALTER TABLE public.invocacoes_ferramenta RENAME COLUMN meta_chunk_id TO meta_bloco_id;
ALTER TABLE public.manipulacao_log RENAME COLUMN manipulacao_chunk_id TO manipulacao_bloco_id;
ALTER TABLE public.mensagens RENAME COLUMN chunks_acionados TO blocos_acionados;
ALTER TABLE public.overrides_tenant_blocos_comportamento RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.overrides_tenant_blocos_conhecimento RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.overrides_tenant_blocos_gatilho RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.overrides_tenant_blocos_humanizacao RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.overrides_tenant_blocos_meta RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.overrides_tenant_blocos_variacao RENAME COLUMN chunk_id TO bloco_id;
ALTER TABLE public.perguntas_orfas RENAME COLUMN resolvido_chunk_id TO resolvido_bloco_id;
ALTER TABLE public.prompts_mensagem RENAME COLUMN chunks_usados TO blocos_usados;
ALTER TABLE public.registro_reflexao RENAME COLUMN meta_chunk_criado_id TO meta_bloco_criado_id;

-- ============ BLOCO B: 9 RPCs (preservando hybrid_search_*) ============
ALTER FUNCTION public.chunks_atuais_tenant(uuid, text) RENAME TO blocos_atuais_tenant;
ALTER FUNCTION public.dedup_chunks_propostos(jsonb, numeric) RENAME TO dedup_blocos_propostos;
ALTER FUNCTION public.incrementar_meta_chunks_uso(uuid[]) RENAME TO incrementar_meta_blocos_uso;
ALTER FUNCTION public.knowledge_chunks_fts_trigger() RENAME TO blocos_conhecimento_fts_trigger;
ALTER FUNCTION public.promover_meta_chunks_estaveis(integer, integer) RENAME TO promover_meta_blocos_estaveis;
ALTER FUNCTION public.tg_admin_ia_chunks_enqueue_embedding() RENAME TO tg_admin_ia_blocos_enqueue_embedding;
ALTER FUNCTION public.tg_admin_ia_chunks_updated() RENAME TO tg_admin_ia_blocos_updated;
ALTER FUNCTION public.trg_anti_n1_chunk_candidates() RENAME TO trg_anti_n1_candidatos_bloco;
ALTER FUNCTION public.update_chunks_fts(uuid) RENAME TO update_blocos_fts;

-- ============ DO block: refactor de bodies plpgsql ============
DO $migr$
DECLARE
  r record;
  v_def text; v_new_def text;
  v_pares text[][] := ARRAY[
    ['regras_operacionais_chunks', 'regras_operacionais_blocos'],
    ['diretriz_bolha_chunks', 'diretriz_bolha_blocos'],
    ['manipulacao_chunks', 'manipulacao_blocos'],
    ['prova_social_chunks', 'prova_social_blocos'],
    ['acao_pausa_chunks', 'acao_pausa_blocos'],
    ['automacao_chunks', 'automacao_blocos'],
    ['emocao_chunks', 'emocao_blocos'],
    ['destilado_em_chunk_id', 'destilado_em_bloco_id'],
    ['meta_chunk_criado_id', 'meta_bloco_criado_id'],
    ['manipulacao_chunk_id', 'manipulacao_bloco_id'],
    ['promoted_chunk_table', 'promoted_bloco_table'],
    ['promoted_chunk_id', 'promoted_bloco_id'],
    ['resolvido_chunk_id', 'resolvido_bloco_id'],
    ['meta_chunk_origem', 'meta_bloco_origem'],
    ['chunks_acionados', 'blocos_acionados'],
    ['rag_chunk_id', 'rag_bloco_id'],
    ['meta_chunk_id', 'meta_bloco_id'],
    ['chunks_usados', 'blocos_usados'],
    ['knowledge_chunks_fts_trigger', 'blocos_conhecimento_fts_trigger'],
    ['promover_meta_chunks_estaveis', 'promover_meta_blocos_estaveis'],
    ['tg_admin_ia_chunks_enqueue_embedding', 'tg_admin_ia_blocos_enqueue_embedding'],
    ['trg_anti_n1_chunk_candidates', 'trg_anti_n1_candidatos_bloco'],
    ['incrementar_meta_chunks_uso', 'incrementar_meta_blocos_uso'],
    ['tg_admin_ia_chunks_updated', 'tg_admin_ia_blocos_updated'],
    ['dedup_chunks_propostos', 'dedup_blocos_propostos'],
    ['chunks_atuais_tenant', 'blocos_atuais_tenant'],
    ['update_chunks_fts', 'update_blocos_fts']
  ];
  v_par text[];
  v_total int := 0; v_ok int := 0; v_err int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, n.nspname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.prolang = (SELECT oid FROM pg_language WHERE lanname='plpgsql')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new_def := v_def;
    FOREACH v_par SLICE 1 IN ARRAY v_pares LOOP
      v_new_def := regexp_replace(v_new_def, '\m' || v_par[1] || '\M', v_par[2], 'g');
    END LOOP;
    IF v_new_def IS DISTINCT FROM v_def THEN
      v_total := v_total + 1;
      BEGIN
        EXECUTE v_new_def;
        v_ok := v_ok + 1;
      EXCEPTION WHEN OTHERS THEN
        v_err := v_err + 1;
        RAISE WARNING 'Erro recriar %.%: %', r.nspname, r.proname, SQLERRM;
      END;
    END IF;
  END LOOP;
  RAISE NOTICE 'Refactor funcoes: total=%, ok=%, err=%', v_total, v_ok, v_err;
END;
$migr$;

NOTIFY pgrst, 'reload schema';
;
