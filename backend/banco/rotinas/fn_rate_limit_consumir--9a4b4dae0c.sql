CREATE OR REPLACE FUNCTION public.fn_rate_limit_consumir(_tenant_id uuid, _limite_por_min integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _janela timestamptz := date_trunc('minute', now());
  _atual integer;
BEGIN
  INSERT INTO public.rate_limit_tenant (tenant_id, janela, contador)
  VALUES (_tenant_id, _janela, 1)
  ON CONFLICT (tenant_id, janela)
  DO UPDATE SET contador = public.rate_limit_tenant.contador + 1
  RETURNING contador INTO _atual;
  RETURN _atual <= _limite_por_min;
END;
$function$

