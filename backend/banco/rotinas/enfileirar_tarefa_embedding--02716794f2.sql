CREATE OR REPLACE FUNCTION public.enfileirar_tarefa_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_text text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'blocos_conhecimento' THEN v_text := coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, '');
    WHEN 'blocos_comportamento' THEN v_text := coalesce(NEW.situacao_descricao, '') || ' ' || coalesce(NEW.instrucao, '');
    WHEN 'blocos_humanizacao' THEN v_text := coalesce(NEW.categoria, '') || ' ' || coalesce(NEW.regra, '');
    WHEN 'blocos_gatilho' THEN v_text := coalesce(NEW.nome_trigger, '') || ' ' || coalesce(NEW.exemplo_frase, '');
    WHEN 'blocos_variacao' THEN v_text := coalesce(NEW.nome_variation, '') || ' ' || coalesce(NEW.instrucao, '');
    WHEN 'blocos_meta' THEN v_text := coalesce(NEW.corpo, '');
    WHEN 'emocao_blocos' THEN v_text := coalesce(NEW.emocao, '') || ' ' || coalesce(NEW.corpo, '');
    WHEN 'prova_social_blocos' THEN v_text := coalesce(NEW.depoimento, '') || ' ' || coalesce(NEW.autor, '');
    WHEN 'memoria_episodica' THEN v_text := coalesce(NEW.episodio_resumo, '') || ' ' || coalesce(NEW.emocao, '');
    WHEN 'blocos_procedurais' THEN v_text := coalesce(NEW.nome_procedimento, '') || ' ' || coalesce(NEW.passos::text, '');
    WHEN 'anti_padroes' THEN v_text := coalesce(NEW.situacao, '') || ' ' || coalesce(NEW.acao_correta, '');
    WHEN 'agente_identidade' THEN v_text := coalesce(NEW.dimensao, '') || ' ' || coalesce(NEW.texto, '');
    WHEN 'memoria_lead' THEN v_text := coalesce(NEW.fato, '') || ' ' || coalesce(NEW.categoria, '');
    WHEN 'manipulacao_blocos' THEN v_text := coalesce(NEW.tipo, '') || ' ' || coalesce(NEW.resposta_padrao, '');
    WHEN 'diretriz_bolha_blocos' THEN v_text := coalesce(NEW.contexto, '') || ' ' || coalesce(NEW.motivo, '');
    WHEN 'regras_operacionais_blocos' THEN v_text := coalesce(NEW.contexto, '') || ' ' || coalesce(NEW.regra, '');
    WHEN 'pivots_categoria_intent' THEN v_text := coalesce(NEW.frase_pivo, '');
    WHEN 'automacao_blocos' THEN v_text := coalesce(NEW.nome, '') || ' ' || coalesce(NEW.descricao, '');
    WHEN 'acao_pausa_blocos' THEN v_text := coalesce(NEW.gatilho_descricao, '') || ' ' || coalesce(NEW.gatilho_falas::text, '') || ' ' || coalesce(NEW.mensagem_retorno, '');
    WHEN 'fase_requisitos' THEN v_text := coalesce(NEW.descricao_curta, '') || ' ' || coalesce(NEW.descricao_semantica, '');
    WHEN 'pacotes_conhecimento_blocos' THEN v_text := coalesce(NEW.titulo, '') || ' ' || coalesce(NEW.conteudo, '');
    ELSE v_text := NULL;
  END CASE;
  IF v_text IS NOT NULL AND trim(v_text) <> '' THEN
    PERFORM pgmq.send('embedding_jobs', jsonb_build_object('table', TG_TABLE_NAME, 'row_id', NEW.id, 'text', trim(v_text)));
    NEW.embedding_status := 'pendente';
  END IF;
  RETURN NEW;
END;
$function$

