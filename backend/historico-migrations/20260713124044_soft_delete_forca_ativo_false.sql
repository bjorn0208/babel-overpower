-- Invariante: linha com `deleted_at` preenchido NUNCA pode continuar `ativo = true`.
--
-- Motivo (incidente 2026-07-13): as RPCs `busca_hibrida_*` filtram por `ativo`, não por
-- `deleted_at`. O delete do Hub de Conhecimento carimbava só a data — o bloco sumia da tela
-- e continuava vivo no RAG, e o agente seguia respondendo por um bloco "excluído".
-- Garantir o invariante NO BANCO protege qualquer caminho de escrita (frontend, edge, script,
-- SQL manual), hoje e no futuro — em vez de depender de cada chamador lembrar de setar os dois.

CREATE OR REPLACE FUNCTION public.tg_soft_delete_desativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Deletado => inativo, sempre. Restaurar (deleted_at = NULL) NÃO reativa automaticamente:
  -- religar é decisão explícita de quem restaura.
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.ativo := false;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_soft_delete_desativa() IS
  'Força ativo=false quando deleted_at é preenchido. Impede bloco soft-deletado de continuar sendo recuperado pelo RAG (as busca_hibrida_* filtram ativo, não deleted_at).';

DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'acao_pausa_blocos', 'anti_padroes', 'blocos_comportamento', 'blocos_conhecimento',
    'blocos_gatilho', 'blocos_humanizacao', 'blocos_meta', 'blocos_padrao',
    'blocos_procedurais', 'blocos_variacao', 'campos_ficha', 'config_chamadas_llm',
    'consultas_pacotes', 'consultas_tipos', 'diretriz_bolha_blocos', 'emocao_blocos',
    'manipulacao_blocos', 'prova_social_blocos', 'regras_operacionais_blocos'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_desativa ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_soft_delete_desativa
         BEFORE INSERT OR UPDATE OF deleted_at ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_soft_delete_desativa()', t);
  END LOOP;
END;
$$;

-- Saneamento: mata os fantasmas que já existem (deletados mas ainda ativos).
UPDATE public.blocos_conhecimento SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_comportamento SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_gatilho SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_humanizacao SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_meta SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_padrao SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_procedurais SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.blocos_variacao SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.acao_pausa_blocos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.anti_padroes SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.diretriz_bolha_blocos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.emocao_blocos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.manipulacao_blocos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.prova_social_blocos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.regras_operacionais_blocos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.campos_ficha SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.config_chamadas_llm SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.consultas_pacotes SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
UPDATE public.consultas_tipos SET ativo = false WHERE deleted_at IS NOT NULL AND ativo = true;
;
