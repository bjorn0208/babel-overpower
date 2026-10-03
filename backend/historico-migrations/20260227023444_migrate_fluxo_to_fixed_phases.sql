
-- Migrar fluxo de array de fases com blocos para objeto com 5 fases fixas
DO $$
DECLARE
  agent RECORD;
  fase jsonb;
  fase_nome text;
  novo jsonb;
  instrucoes_arr jsonb;
  regras_arr jsonb;
  perguntas_arr jsonb;
  bloco jsonb;
BEGIN
  FOR agent IN SELECT id, fluxo FROM user_agents WHERE fluxo IS NOT NULL AND jsonb_typeof(fluxo) = 'array' AND jsonb_array_length(fluxo) > 0
  LOOP
    novo := jsonb_build_object(
      'saudacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb),
      'qualificacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb, 'perguntas_chave', '[]'::jsonb),
      'apresentacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb, 'midias_envio', '[]'::jsonb),
      'negociacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb),
      'fechado', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb)
    );

    FOR fase IN SELECT * FROM jsonb_array_elements(agent.fluxo)
    LOOP
      fase_nome := lower(fase->>'nome');
      instrucoes_arr := '[]'::jsonb;
      regras_arr := '[]'::jsonb;
      perguntas_arr := '[]'::jsonb;

      -- Extrair instrucoes e regras dos blocos
      IF fase->'blocos' IS NOT NULL AND jsonb_array_length(fase->'blocos') > 0 THEN
        -- Instrucoes (blocos tipo mensagem)
        FOR bloco IN SELECT * FROM jsonb_array_elements(fase->'blocos') WHERE value->>'tipo' = 'mensagem' AND value->'dados'->>'texto' != ''
        LOOP
          instrucoes_arr := instrucoes_arr || to_jsonb(bloco->'dados'->>'texto');
        END LOOP;

        -- Regras (blocos tipo regra)
        FOR bloco IN SELECT * FROM jsonb_array_elements(fase->'blocos') WHERE value->>'tipo' = 'regra' AND value->'dados'->>'texto' != ''
        LOOP
          regras_arr := regras_arr || to_jsonb(bloco->'dados'->>'texto');
        END LOOP;

        -- Capturas -> perguntas-chave
        FOR bloco IN SELECT * FROM jsonb_array_elements(fase->'blocos') WHERE value->>'tipo' = 'captura'
        LOOP
          perguntas_arr := perguntas_arr || jsonb_build_object(
            'id', bloco->>'id',
            'pergunta', 'Qual o seu ' || COALESCE(bloco->'dados'->>'campo', 'dado'),
            'campo', COALESCE(bloco->'dados'->>'campo', 'campo')
          );
        END LOOP;
      END IF;

      IF fase_nome LIKE '%saudac%' THEN
        novo := jsonb_set(novo, '{saudacao}', jsonb_build_object('descricao', COALESCE(fase->>'descricao', ''), 'instrucoes', instrucoes_arr, 'regras', regras_arr));
      ELSIF fase_nome LIKE '%qualific%' OR fase_nome LIKE '%diagn%' THEN
        novo := jsonb_set(novo, '{qualificacao}', jsonb_build_object('descricao', COALESCE(fase->>'descricao', ''), 'instrucoes', instrucoes_arr, 'regras', regras_arr, 'perguntas_chave', perguntas_arr));
      ELSIF fase_nome LIKE '%apresent%' THEN
        novo := jsonb_set(novo, '{apresentacao}', jsonb_build_object('descricao', COALESCE(fase->>'descricao', ''), 'instrucoes', instrucoes_arr, 'regras', regras_arr, 'midias_envio', '[]'::jsonb));
      ELSIF fase_nome LIKE '%negoci%' OR fase_nome LIKE '%proposta%' THEN
        novo := jsonb_set(novo, '{negociacao}', jsonb_build_object('descricao', COALESCE(fase->>'descricao', ''), 'instrucoes', instrucoes_arr, 'regras', regras_arr));
      ELSIF fase_nome LIKE '%fechad%' OR fase_nome LIKE '%fechament%' OR fase_nome LIKE '%contrato%' THEN
        novo := jsonb_set(novo, '{fechado}', jsonb_build_object('descricao', COALESCE(fase->>'descricao', ''), 'instrucoes', instrucoes_arr, 'regras', regras_arr));
      END IF;
    END LOOP;

    UPDATE user_agents SET fluxo = novo WHERE id = agent.id;
  END LOOP;

  -- Agentes sem fluxo ou fluxo vazio: criar default
  UPDATE user_agents SET fluxo = jsonb_build_object(
    'saudacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb),
    'qualificacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb, 'perguntas_chave', '[]'::jsonb),
    'apresentacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb, 'midias_envio', '[]'::jsonb),
    'negociacao', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb),
    'fechado', jsonb_build_object('descricao', '', 'instrucoes', '[]'::jsonb, 'regras', '[]'::jsonb)
  )
  WHERE fluxo IS NULL OR fluxo = '[]'::jsonb OR fluxo = '{}'::jsonb;
END $$;

;
