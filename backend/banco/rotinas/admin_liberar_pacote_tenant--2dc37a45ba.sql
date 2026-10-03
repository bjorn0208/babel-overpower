CREATE OR REPLACE FUNCTION public.admin_liberar_pacote_tenant(p_pacote_id uuid, p_tenant_id uuid, p_liberar boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pc public.pacotes_conhecimento%ROWTYPE;
  v_slug text;
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RAISE EXCEPTION 'apenas admin' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pc FROM public.pacotes_conhecimento WHERE id = p_pacote_id AND origem = 'admin';
  IF v_pc.loja_aplicativo_id IS NULL THEN
    RAISE EXCEPTION 'pacote não está publicado na Loja' USING ERRCODE = '22023';
  END IF;
  SELECT slug INTO v_slug FROM public.loja_aplicativos WHERE id = v_pc.loja_aplicativo_id;

  IF p_liberar THEN
    INSERT INTO public.aplicativos_instalados (user_id, aplicativo_id, aplicativo_slug)
    VALUES (p_tenant_id, v_pc.loja_aplicativo_id, v_slug)
    ON CONFLICT (user_id, aplicativo_id) DO NOTHING;
  ELSE
    DELETE FROM public.aplicativos_instalados
     WHERE user_id = p_tenant_id AND aplicativo_id = v_pc.loja_aplicativo_id;
    UPDATE public.pacotes_conhecimento_ativacao
       SET ligado = false
     WHERE pacote_id = p_pacote_id AND tenant_id = p_tenant_id AND ligado;
  END IF;
END;
$function$

