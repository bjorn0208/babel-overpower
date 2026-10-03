CREATE OR REPLACE FUNCTION public.apps_visiveis_para_tenant()
 RETURNS SETOF loja_aplicativos
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT la.*
  FROM public.loja_aplicativos la
  WHERE la.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.aplicativos_nicho an WHERE an.aplicativo_id = la.id)
      OR EXISTS (
        SELECT 1
        FROM public.aplicativos_nicho an
        JOIN public.profiles p ON p.id = (select auth.uid())
        WHERE an.aplicativo_id = la.id AND an.nicho_id = p.nicho_id
      )
    );
$function$

