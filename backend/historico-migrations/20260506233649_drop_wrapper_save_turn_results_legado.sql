-- Wrapper EN save_turn_results foi mantido durante Big-Bang pra nao quebrar a edge chat
-- enquanto o caller nao era atualizado. Agora actions-send.ts ja chama salvar_resultados_turno
-- direto e o chat foi redeployado. Drop seguro.

DROP FUNCTION IF EXISTS public.save_turn_results(
  uuid, uuid, text, text[], integer, text, jsonb, text, text[],
  uuid, text, integer, integer, numeric, integer,
  text, text, jsonb, jsonb, uuid
);
;
