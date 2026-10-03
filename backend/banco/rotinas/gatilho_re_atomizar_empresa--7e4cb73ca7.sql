CREATE OR REPLACE FUNCTION public.gatilho_re_atomizar_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.auditoria_blocos (
    bloco_id,
    tabela,
    acao,
    motivo,
    executado_via
  ) VALUES (
    NULL,
    'blocos_conhecimento',
    're_categorizacao',
    'empresas atualizada (tenant ' || NEW.user_id::text || ') — blocos atômicos pendentes de re-geração',
    'cron'
  );
  RETURN NEW;
END;
$function$

