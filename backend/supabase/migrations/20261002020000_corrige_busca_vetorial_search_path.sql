-- Motor ragentic: busca vetorial quebrada (AUDITORIA-BACK B-02).
-- As funções abaixo têm search_path='' e usam o operador <=> do pgvector sem
-- qualificar; com search_path vazio o operador (schema extensions) não é achado:
--   ERROR: operator does not exist: extensions.halfvec <=> extensions.halfvec
-- Correção mínima, sem mexer no corpo: search_path fixo com public + extensions
-- (continua "não mutável" para o security advisor). Ref.: supabase/supabase#28507.
-- Tolerante: só altera o que existir (o schema base é carregado fora das migrations,
-- ver backend/local/restaurar-local.sh).
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('busca_hibrida_emocao', 'busca_vetorial',
                        'detectar_intent_categoria', 'buscar_memoria_dono')
  loop
    execute format('alter function %s set search_path = public, extensions', f);
  end loop;
end $$;
