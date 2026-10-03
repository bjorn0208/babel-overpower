CREATE OR REPLACE FUNCTION public.buscar_memoria_dono(p_owner_id uuid, p_query_embedding extensions.halfvec, p_match_count integer DEFAULT 30)
 RETURNS TABLE(id uuid, fato text, categoria text, relevancia text, vezes_evocado integer, ultima_evocacao_em timestamp with time zone, criado_em timestamp with time zone, valido_ate timestamp with time zone, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id, m.fato, m.categoria, m.relevancia, m.vezes_evocado, m.ultima_evocacao_em, m.criado_em, m.valido_ate,
         (1 - (m.vetor_semantico operator(extensions.<=>) p_query_embedding))::double precision as score
    from public.memoria_dono m
   where m.owner_id = p_owner_id and m.ativa
     and m.vetor_semantico is not null
     and (m.valido_ate is null or m.valido_ate > now())
   order by m.vetor_semantico operator(extensions.<=>) p_query_embedding
   limit greatest(1, least(coalesce(p_match_count, 30), 100));
$function$

