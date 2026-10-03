CREATE OR REPLACE FUNCTION public.gestao_chamado_abrir(p_cliente_id uuid, p_titulo text, p_relato text, p_canal text, p_relatado_por text, p_categoria text, p_prioridade text, p_responsavel text, p_atend_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nome text; v_id uuid;
begin
  if not public.gestao_tem_papel(array['suporte']::text[]) then
    raise exception 'gestao: sem permissão para abrir chamado' using errcode = '42501';
  end if;
  select c.nome into v_nome from public.gestao_clientes c where c.id = p_cliente_id and c.deleted_at is null;
  if v_nome is null then raise exception 'gestao: cliente não encontrado' using errcode = '22023'; end if;
  if p_atend_id is not null and not exists (select 1 from public.gestao_suporte_atend s
      where s.id = p_atend_id and s.cliente_id = p_cliente_id and s.deleted_at is null) then
    raise exception 'gestao: o acompanhamento não é deste cliente' using errcode = '22023';
  end if;
  insert into public.gestao_chamados (cliente_id, cliente_nome, atend_id, titulo, relato, canal, relatado_por, categoria, prioridade, responsavel)
  values (p_cliente_id, v_nome, p_atend_id, btrim(p_titulo), btrim(p_relato), p_canal, nullif(btrim(coalesce(p_relatado_por, '')), ''),
          p_categoria, coalesce(p_prioridade, 'media'), nullif(btrim(coalesce(p_responsavel, '')), ''))
  returning id into v_id;
  return v_id;
end $function$

