CREATE OR REPLACE FUNCTION public.gestao_chamado_evento_antes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.registrado_em := now();
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') then
    new.origem := 'app';
    new.autor_uid := (select auth.uid());
    new.autor_nome := public.gestao_chamado_autor_nome();
  elsif new.origem = 'app' then
    new.origem := 'sql';
    new.autor_uid := null;
    new.autor_nome := coalesce(nullif(btrim(new.autor_nome), ''), 'SQL direto');
  end if;
  if new.aconteceu_em > now() + interval '5 minutes' then
    raise exception 'gestao: a data do registro não pode ser no futuro' using errcode = '22023';
  end if;
  return new;
end $function$

