CREATE OR REPLACE FUNCTION public.admin_uso_pacote(p_pacote_id uuid)
 RETURNS TABLE(tenant_id uuid, tenant_nome text, instalado boolean, agentes_ligados integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RAISE EXCEPTION 'apenas admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH pc AS (SELECT * FROM public.pacotes_conhecimento WHERE id = p_pacote_id),
  t AS (
    SELECT ai.user_id AS tid FROM public.aplicativos_instalados ai, pc WHERE ai.aplicativo_id = pc.loja_aplicativo_id
    UNION
    SELECT pa.tenant_id FROM public.pacotes_conhecimento_ativacao pa WHERE pa.pacote_id = p_pacote_id
  )
  SELECT t.tid,
         coalesce(p.full_name, p.email, t.tid::text),
         EXISTS (SELECT 1 FROM public.aplicativos_instalados ai, pc WHERE ai.user_id = t.tid AND ai.aplicativo_id = pc.loja_aplicativo_id),
         (SELECT count(*)::int FROM public.pacotes_conhecimento_ativacao pa WHERE pa.pacote_id = p_pacote_id AND pa.tenant_id = t.tid AND pa.ligado)
  FROM t LEFT JOIN public.profiles p ON p.id = t.tid
  ORDER BY 2;
END;
$function$

