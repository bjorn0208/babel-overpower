CREATE OR REPLACE FUNCTION public.lead_memory_similar(p_lead_id uuid, p_embedding extensions.halfvec, p_threshold double precision DEFAULT 0.85, p_top_k integer DEFAULT 5)
 RETURNS TABLE(id uuid, fato text, similarity double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT * FROM public.memoria_lead_similar(p_lead_id, p_embedding, p_threshold, p_top_k) $function$

