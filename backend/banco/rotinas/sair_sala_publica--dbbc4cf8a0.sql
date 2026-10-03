CREATE OR REPLACE FUNCTION public.sair_sala_publica(p_participante_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.salas_reuniao_participantes
    set saiu_em = now()
    where id = p_participante_id and saiu_em is null;
end;
$function$

