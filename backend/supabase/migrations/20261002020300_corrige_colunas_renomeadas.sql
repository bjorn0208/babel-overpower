-- Funções chamadas pelo front/edges que referenciam colunas renomeadas ou ambíguas
-- (AUDITORIA-BACK B-05). Reescrita textual mínima do corpo; aborta se o trecho
-- original não for encontrado; idempotente (pula o que já foi corrigido).
--   metricas_base                     leads.product            → leads.produto      (front apps/user/base)
--   obter_documentos_publicos_cliente documentos_cliente.file_* → nome_arquivo etc.  (página pública de acompanhamento;
--                                     as CHAVES do JSON devolvido não mudam)
--   enviar_reproposta                 "status" ambíguo (coluna de saída × acoes_agendadas.status) (edge processar-acompanhamentos)
--   criar_cliente_manual              gen_random_bytes sem schema com search_path='' → extensions.gen_random_bytes;
--                                     token hex (text) gravado em chave_rastreamento (uuid) → cast explícito
--   fn_saude_motor                    idade em segundos (int) convertida direto em timestamptz → erro engolido pelo
--                                     EXCEPTION WHEN OTHERS: o monitor do motor (rpc_metricas_motor) mostrava "nenhuma
--                                     fila" sempre que havia fila. Agora: ultimo_evento = now() - idade
do $$
declare
  r record;
  v_def text;
  v_novo text;
begin
  for r in
    select * from (values
      ('metricas_base',                     '\mproduct\M',                              'produto',                                   'produto INTO v_top_produto'),
      ('obter_documentos_publicos_cliente', 'd\.file_name\M',                           'd.nome_arquivo',                            'd.nome_arquivo'),
      ('obter_documentos_publicos_cliente', 'd\.label\M',                               'd.rotulo',                                  'd.rotulo'),
      ('obter_documentos_publicos_cliente', 'd\.file_path\M',                           'd.caminho_arquivo',                         'd.caminho_arquivo'),
      ('obter_documentos_publicos_cliente', 'd\.file_type\M',                           'd.tipo_arquivo',                            'd.tipo_arquivo'),
      ('enviar_reproposta',                 'WHERE lead_id = v_rec\.lead_id AND status IN', 'WHERE acoes_agendadas.lead_id = v_rec.lead_id AND acoes_agendadas.status IN', 'acoes_agendadas.status IN'),
      ('criar_cliente_manual',              '(?<!extensions\.)gen_random_bytes\(',      'extensions.gen_random_bytes(',              'extensions.gen_random_bytes('),
      ('criar_cliente_manual',              'now\(\), v_token,',                        'now(), v_token::uuid,',                     'v_token::uuid'),
      ('fn_saude_motor',                    'm\.newest_msg_age_sec::timestamptz',       'now() - make_interval(secs => m.newest_msg_age_sec)', 'make_interval(secs => m.newest_msg_age_sec)')
    ) as t(fn, padrao, troca, marca_ok)
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn;
    if v_def is null then
      raise notice '% não existe — pulando', r.fn;
      continue;
    end if;
    v_novo := regexp_replace(v_def, r.padrao, r.troca, 'g');
    if v_novo <> v_def then
      execute v_novo;
      raise notice '% corrigida (%)', r.fn, r.padrao;
    elsif position(r.marca_ok in v_def) > 0 then
      raise notice '% já corrigida (%)', r.fn, r.padrao;
    else
      raise exception '%: trecho "%" não encontrado — revisar à mão', r.fn, r.padrao;
    end if;
  end loop;
end $$;
