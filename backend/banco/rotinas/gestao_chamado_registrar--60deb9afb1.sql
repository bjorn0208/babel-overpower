CREATE OR REPLACE FUNCTION public.gestao_chamado_registrar(p_chamado uuid, p_tipo text, p_texto text, p_aconteceu_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.gestao_chamados; v_quando timestamptz := coalesce(p_aconteceu_em, now()); v_id uuid;
begin
  select * into c from public.gestao_chamados where id = p_chamado and deleted_at is null for update;
  if c.id is null then raise exception 'gestao: chamado não encontrado' using errcode = '22023'; end if;
  if public.gestao_tem_papel(array['suporte']::text[]) then
    if p_tipo not in ('nota_interna', 'contato_cliente') then raise exception 'gestao: tipo de registro inválido' using errcode = '22023'; end if;
  -- Serjão B-3: o P&D comenta só enquanto o chamado está com ele (aguardando_equipe); depois de devolver, só lê
  elsif public.gestao_tem_papel(array['programador']::text[]) and c.passou_pd and c.status = 'aguardando_equipe' then
    if p_tipo <> 'nota_interna' then raise exception 'gestao: o P&D registra só nota interna' using errcode = '42501'; end if;
  else
    raise exception 'gestao: sem permissão para registrar neste chamado' using errcode = '42501';
  end if;
  if c.status in ('resolvido', 'nao_resolvido') then raise exception 'gestao: chamado fechado; reabra para registrar' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then raise exception 'gestao: escreva o texto do registro' using errcode = '22023'; end if;
  insert into public.gestao_chamado_eventos (chamado_id, tipo, texto, aconteceu_em) values (c.id, p_tipo, btrim(p_texto), v_quando) returning id into v_id;
  if p_tipo = 'contato_cliente' and (c.primeira_resposta_em is null or v_quando < c.primeira_resposta_em) then
    update public.gestao_chamados set primeira_resposta_em = v_quando where id = c.id;
  end if;
  return v_id;
end $function$

