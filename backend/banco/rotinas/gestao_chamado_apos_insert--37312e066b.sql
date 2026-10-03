CREATE OR REPLACE FUNCTION public.gestao_chamado_apos_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not new.importado then
    insert into public.gestao_chamado_eventos (chamado_id, tipo, texto, aconteceu_em) values (new.id, 'criacao', new.relato, new.aberto_em);
  end if;
  return null;
end $function$

