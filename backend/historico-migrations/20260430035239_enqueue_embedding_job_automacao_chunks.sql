-- DEC-017 · habilita embedding automático em automacao_chunks.
-- 1) Amplia enqueue_embedding_job pra reconhecer a tabela nova (case 'automacao_chunks').
-- 2) Triggers BEFORE INSERT/UPDATE pra enfileirar.
-- 3) Re-enqueue dos 6 chunks já existentes (UPDATE no_op pra disparar trigger).

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

CREATE TRIGGER trg_enqueue_embedding_automacao_chunks
  BEFORE INSERT ON public.automacao_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE TRIGGER trg_enqueue_embedding_automacao_chunks_upd
  BEFORE UPDATE OF nome, descricao ON public.automacao_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

-- Re-enqueue dos 6 chunks já existentes
UPDATE public.automacao_chunks
   SET descricao = descricao
 WHERE embedding_status = 'pending';
;
