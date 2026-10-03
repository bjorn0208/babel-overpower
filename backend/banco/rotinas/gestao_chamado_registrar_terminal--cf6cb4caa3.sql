CREATE OR REPLACE FUNCTION public.gestao_chamado_registrar_terminal(p_codigo text, p_tipo text, p_texto text, p_autor text, p_aconteceu_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid := public.gestao_chamado_do_codigo(p_codigo); c public.gestao_chamados; v_quando timestamptz := coalesce(p_aconteceu_em, now()); v_ev uuid;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') then
    raise exception 'gestao: o registro pelo terminal não pode ser chamado pela tela' using errcode = '42501';
  end if;
  if v_id is null then raise exception 'gestao: chamado % não encontrado', p_codigo using errcode = '22023'; end if;
  select * into c from public.gestao_chamados where id = v_id for update;
  if p_tipo not in ('nota_interna', 'contato_cliente') then raise exception 'gestao: tipo de registro inválido (nota_interna ou contato_cliente)' using errcode = '22023'; end if;
  if c.status in ('resolvido', 'nao_resolvido') then raise exception 'gestao: chamado fechado; reabra pela tela' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then raise exception 'gestao: escreva o texto do registro' using errcode = '22023'; end if;
  if btrim(coalesce(p_autor, '')) !~ '^[^()]{2,60} \(IA\), por [^()]{2,60}$' then
    raise exception 'gestao: autor no formato "Nome (IA), por Pessoa"' using errcode = '22023';
  end if;
  insert into public.gestao_chamado_eventos (chamado_id, tipo, texto, aconteceu_em, autor_nome, origem)
  values (c.id, p_tipo, btrim(p_texto), v_quando, btrim(p_autor), 'terminal') returning id into v_ev;
  if p_tipo = 'contato_cliente' and (c.primeira_resposta_em is null or v_quando < c.primeira_resposta_em) then
    update public.gestao_chamados set primeira_resposta_em = v_quando where id = c.id;
  end if;
  return v_ev;
end $function$

