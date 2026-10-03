-- Onda 1 / Projeto: Fase x Requisitos Semanticos
-- Migration: fase_requisitos_enqueue_embedding_trigger
-- Adiciona case fase_requisitos na funcao publica enqueue_embedding_job
-- + 2 triggers (BEFORE INSERT, BEFORE UPDATE descricao_semantica) em fase_requisitos.
-- Sem isso, INSERTs/UPDATEs em fase_requisitos nunca enfileiram em pgmq.embedding_jobs
-- e o pipeline gerar-embedding nunca processa.

CREATE OR REPLACE FUNCTION public.enqueue_embedding_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_text text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'knowledge_chunks' THEN
      v_text := coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, '');
    WHEN 'behavior_chunks' THEN
      v_text := coalesce(NEW.situacao_descricao, '') || ' ' || coalesce(NEW.instrucao, '');
    WHEN 'human_chunks' THEN
      v_text := coalesce(NEW.categoria, '') || ' ' || coalesce(NEW.regra, '');
    WHEN 'trigger_chunks' THEN
      v_text := coalesce(NEW.nome_trigger, '') || ' ' || coalesce(NEW.exemplo_frase, '');
    WHEN 'variation_chunks' THEN
      v_text := coalesce(NEW.nome_variation, '') || ' ' || coalesce(NEW.instrucao, '');
    WHEN 'meta_chunks' THEN
      v_text := coalesce(NEW.corpo, '');
    WHEN 'emocao_chunks' THEN
      v_text := coalesce(NEW.emocao, '') || ' ' || coalesce(NEW.corpo, '');
    WHEN 'prova_social_chunks' THEN
      v_text := coalesce(NEW.depoimento, '') || ' ' || coalesce(NEW.autor, '');
    WHEN 'episodic_memory' THEN
      v_text := coalesce(NEW.episodio_resumo, '') || ' ' || coalesce(NEW.emocao, '');
    WHEN 'procedural_chunks' THEN
      v_text := coalesce(NEW.nome_procedimento, '') || ' ' || coalesce(NEW.passos::text, '');
    WHEN 'anti_padroes' THEN
      v_text := coalesce(NEW.situacao, '') || ' ' || coalesce(NEW.acao_correta, '');
    WHEN 'agente_identidade' THEN
      v_text := coalesce(NEW.dimensao, '') || ' ' || coalesce(NEW.texto, '');
    WHEN 'lead_memory' THEN
      v_text := coalesce(NEW.fato, '') || ' ' || coalesce(NEW.categoria, '');
    WHEN 'manipulacao_chunks' THEN
      v_text := coalesce(NEW.tipo, '') || ' ' || coalesce(NEW.resposta_padrao, '');
    WHEN 'diretriz_bolha_chunks' THEN
      v_text := coalesce(NEW.contexto, '') || ' ' || coalesce(NEW.motivo, '');
    WHEN 'regras_operacionais_chunks' THEN
      v_text := coalesce(NEW.contexto, '') || ' ' || coalesce(NEW.regra, '');
    WHEN 'intent_categoria_pivots' THEN
      v_text := coalesce(NEW.frase_pivo, '');
    WHEN 'automacao_chunks' THEN
      v_text := coalesce(NEW.nome, '') || ' ' || coalesce(NEW.descricao, '');
    WHEN 'acao_pausa_chunks' THEN
      v_text := coalesce(NEW.gatilho_descricao, '') || ' ' || coalesce(NEW.gatilho_falas::text, '') || ' ' || coalesce(NEW.mensagem_retorno, '');
    WHEN 'fase_requisitos' THEN
      v_text := coalesce(NEW.descricao_curta, '') || ' ' || coalesce(NEW.descricao_semantica, '');
    ELSE
      v_text := NULL;
  END CASE;

  IF v_text IS NOT NULL AND trim(v_text) <> '' THEN
    PERFORM pgmq.send('embedding_jobs', jsonb_build_object(
      'table',  TG_TABLE_NAME,
      'row_id', NEW.id,
      'text',   trim(v_text)
    ));
    NEW.embedding_status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enqueue_embedding_fase_requisitos     ON public.fase_requisitos;
DROP TRIGGER IF EXISTS trg_enqueue_embedding_fase_requisitos_upd ON public.fase_requisitos;

CREATE TRIGGER trg_enqueue_embedding_fase_requisitos
  BEFORE INSERT ON public.fase_requisitos
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE TRIGGER trg_enqueue_embedding_fase_requisitos_upd
  BEFORE UPDATE OF descricao_curta, descricao_semantica ON public.fase_requisitos
  FOR EACH ROW
  WHEN (
    old.descricao_curta IS DISTINCT FROM new.descricao_curta
    OR old.descricao_semantica IS DISTINCT FROM new.descricao_semantica
  )
  EXECUTE FUNCTION public.enqueue_embedding_job();
;
