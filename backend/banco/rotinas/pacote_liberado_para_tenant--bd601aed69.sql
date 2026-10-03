CREATE OR REPLACE FUNCTION public.pacote_liberado_para_tenant(p_pacote_id uuid, p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.pacotes_conhecimento pc
    WHERE pc.id = p_pacote_id
      AND pc.ativo = true
      AND pc.deleted_at IS NULL
      AND (
        (pc.origem = 'tenant' AND pc.tenant_id = p_tenant_id)
        OR (
          pc.origem = 'admin'
          AND (pc.nicho_id IS NULL OR pc.nicho_id = (SELECT p.nicho_id FROM public.profiles p WHERE p.id = p_tenant_id))
          AND (
            pc.loja_aplicativo_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.aplicativos_instalados ai
              WHERE ai.user_id = p_tenant_id AND ai.aplicativo_id = pc.loja_aplicativo_id
            )
          )
        )
      )
  );
$function$

