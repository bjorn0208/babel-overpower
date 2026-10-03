CREATE OR REPLACE FUNCTION public.tg_pacotes_ativacao_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dono uuid;
BEGIN
  SELECT a.user_id INTO v_dono FROM public.agentes a WHERE a.id = NEW.agente_id;
  IF v_dono IS NULL THEN
    RAISE EXCEPTION 'agente % não encontrado', NEW.agente_id USING ERRCODE = 'P0002';
  END IF;
  -- tenant_id é sempre o dono do agente (não confia no que veio do client)
  NEW.tenant_id := v_dono;
  NEW.updated_at := now();
  IF NEW.ligado THEN
    IF NOT public.pacote_liberado_para_tenant(NEW.pacote_id, v_dono) THEN
      RAISE EXCEPTION 'pacote não liberado para este tenant (instale na Loja antes de ligar)' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' OR OLD.ligado IS DISTINCT FROM true THEN
      NEW.ligado_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

