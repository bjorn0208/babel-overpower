CREATE OR REPLACE FUNCTION public.purgar_soft_delete_expirado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  alvo record;
  n integer;
  total jsonb := '[]'::jsonb;
  alvos constant jsonb := '[
    {"t":"acao_pausa_blocos","d":90},{"t":"anti_padroes","d":90},
    {"t":"blocos_comportamento","d":90},{"t":"blocos_conhecimento","d":90},
    {"t":"blocos_gatilho","d":90},{"t":"blocos_humanizacao","d":90},
    {"t":"blocos_meta","d":90},{"t":"blocos_padrao","d":90},
    {"t":"blocos_procedurais","d":90},{"t":"blocos_variacao","d":90},
    {"t":"diretriz_bolha_blocos","d":90},{"t":"emocao_blocos","d":90},
    {"t":"manipulacao_blocos","d":90},{"t":"prova_social_blocos","d":90},
    {"t":"regras_operacionais_blocos","d":90},{"t":"avisos_curadoria","d":90},
    {"t":"config_chamadas_llm","d":90},{"t":"campos_ficha","d":90},
    {"t":"rollouts_canario","d":90},{"t":"registro_reflexao","d":90},
    {"t":"pilha_objetivos","d":90},{"t":"invocacoes_ferramenta","d":90},
    {"t":"notas_app","d":180},{"t":"arquivos_textos","d":180},
    {"t":"pastas_base","d":180},{"t":"eventos_agenda","d":180},
    {"t":"salas_reuniao","d":180},{"t":"consultas_pacotes","d":180},
    {"t":"consultas_tipos","d":180},{"t":"metas_financeiras","d":180}
  ]'::jsonb;
BEGIN
  FOR alvo IN SELECT (e->>'t') AS tabela, (e->>'d')::int AS dias FROM jsonb_array_elements(alvos) e
  LOOP
    BEGIN
      EXECUTE format(
        'DELETE FROM public.%I WHERE deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => %s)',
        alvo.tabela, alvo.dias);
      GET DIAGNOSTICS n = ROW_COUNT;
      INSERT INTO public.registro_purge (tabela, linhas_apagadas) VALUES (alvo.tabela, n);
      total := total || jsonb_build_object('tabela', alvo.tabela, 'apagadas', n);
    EXCEPTION WHEN foreign_key_violation THEN
      -- FK RESTRICT segurando linha: pula a tabela nesta rodada e registra; nunca aborta o lote
      INSERT INTO public.registro_purge (tabela, linhas_apagadas, erro)
      VALUES (alvo.tabela, 0, SQLERRM);
    END;
  END LOOP;
  RETURN total;
END;
$function$

