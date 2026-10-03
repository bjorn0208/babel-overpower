-- DEC-041 opção (a) APROVADA pelo Theus 2026-05-28 15:45 BRT.
-- Elimina redundância status × ativo em recursos_ativacao_curadoria.
-- ativo passa a ser coluna computed STORED derivada de status='ativo'.
-- Sincronia garantida pelo Postgres — UPDATE em status reflete em ativo
-- automaticamente; UPDATE direto em ativo passa a falhar (computed).

ALTER TABLE public.recursos_ativacao_curadoria DROP COLUMN ativo;

ALTER TABLE public.recursos_ativacao_curadoria
  ADD COLUMN ativo boolean
  GENERATED ALWAYS AS (status = 'ativo') STORED;

-- Recriar RPC ativar_recurso_curadoria sem o UPDATE em `ativo`
-- (computed agora; setado automaticamente por status='ativo').
CREATE OR REPLACE FUNCTION public.ativar_recurso_curadoria(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rec public.recursos_ativacao_curadoria;
  v_dep text;
  v_dep_ativo boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;
  SELECT * INTO v_rec FROM public.recursos_ativacao_curadoria WHERE chave_recurso = p_chave;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'recurso desconhecido'); END IF;
  IF v_rec.status = 'bloqueado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'recurso bloqueado', 'motivo', v_rec.motivo_bloqueio);
  END IF;
  -- Checar dependências (lê ativo já derivado)
  FOREACH v_dep IN ARRAY v_rec.dependencias_chaves LOOP
    SELECT ativo INTO v_dep_ativo FROM public.recursos_ativacao_curadoria WHERE chave_recurso = v_dep;
    IF NOT v_dep_ativo THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'dependencia inativa', 'dependencia', v_dep);
    END IF;
  END LOOP;

  -- Só status (ativo é computed)
  UPDATE public.recursos_ativacao_curadoria
  SET status = 'ativo', atualizado_por = (SELECT auth.uid())
  WHERE chave_recurso = p_chave;

  RETURN jsonb_build_object('ok', true, 'msg', 'recurso ativado', 'aviso',
    CASE WHEN v_rec.tipo = 'cron' THEN 'Cron pg_cron precisa ser agendado manualmente após esta ativação.'
         ELSE 'Ativação imediata.'
    END);
END;
$function$;

-- Recriar RPC pausar_recurso_curadoria idem.
CREATE OR REPLACE FUNCTION public.pausar_recurso_curadoria(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;
  UPDATE public.recursos_ativacao_curadoria
  SET status = 'pausado', atualizado_por = (SELECT auth.uid())
  WHERE chave_recurso = p_chave AND status <> 'bloqueado';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'recurso bloqueado ou inexistente'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;
;
