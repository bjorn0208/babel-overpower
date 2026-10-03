CREATE OR REPLACE FUNCTION public.rifa_hora_padrao_metodo(p_metodo text, p_data date)
 RETURNS time without time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_metodo = 'loteria_federal' then
      case extract(isodow from p_data)::int when 7 then time '11:00' when 3 then time '20:00' end
    when extract(isodow from p_data)::int between 1 and 6 then
      case p_metodo
        when 'ppt' then time '09:20'
        when 'ptm' then time '11:20'
        when 'pt_rio' then time '14:20'
        when 'ptv' then time '16:20'
        when 'ptn' then time '18:20'
        when 'corujinha' then time '21:20'
      end
  end
$function$

