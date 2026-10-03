-- 1) Adiciona case pra acao_pausa_chunks no roteador da função enqueue
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
      v_text := coalesce(NEW.titulo, '') || ' ' || coalesce(NEW.corpo, '');
    WHEN 'human_chunks' THEN
      v_text := coalesce(NEW.titulo, '') || ' ' || coalesce(NEW.corpo, '');
    WHEN 'trigger_chunks' THEN
      v_text := coalesce(NEW.nome_trigger, '') || ' ' || coalesce(NEW.exemplo_frase, '');
    WHEN 'variation_chunks' THEN
      v_text := coalesce(NEW.corpo, '');
    WHEN 'meta_chunks' THEN
      v_text := coalesce(NEW.titulo, '') || ' ' || coalesce(NEW.corpo, '');
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

-- 2) Triggers INSERT + UPDATE em acao_pausa_chunks
DROP TRIGGER IF EXISTS trg_enqueue_embedding_acao_pausa ON public.acao_pausa_chunks;
CREATE TRIGGER trg_enqueue_embedding_acao_pausa
BEFORE INSERT ON public.acao_pausa_chunks
FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_acao_pausa_upd ON public.acao_pausa_chunks;
CREATE TRIGGER trg_enqueue_embedding_acao_pausa_upd
BEFORE UPDATE OF gatilho_descricao, gatilho_falas, mensagem_retorno ON public.acao_pausa_chunks
FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

-- 3) Reenfileira o chunk pendente existente (UPDATE no-op no campo pra disparar trigger)
UPDATE public.acao_pausa_chunks
SET gatilho_descricao = gatilho_descricao
WHERE embedding IS NULL OR embedding_status = 'pending';
;
