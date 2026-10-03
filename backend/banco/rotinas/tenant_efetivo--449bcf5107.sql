CREATE OR REPLACE FUNCTION public.tenant_efetivo(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_tenant uuid;
BEGIN
  -- A chave pública nunca resolve tenant nenhum.
  IF (SELECT auth.role()) = 'anon' THEN
    RAISE EXCEPTION 'autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  -- Sem usuário no JWT: service_role (edge) ou chamada interna. O tenant é o que veio.
  IF v_uid IS NULL THEN
    RETURN p_tenant_id;
  END IF;

  -- Logado: o tenant é o do JWT. Membro de equipe responde pelo tenant do dono.
  SELECT COALESCE(p.parent_user_id, p.id) INTO v_tenant
  FROM public.profiles p
  WHERE p.id = v_uid;

  v_tenant := COALESCE(v_tenant, v_uid);

  IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'tenant informado nao pertence a quem chama' USING ERRCODE = '42501';
  END IF;

  RETURN v_tenant;
END;
$function$

