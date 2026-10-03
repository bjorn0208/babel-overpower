CREATE OR REPLACE FUNCTION public.gestao_chamado_ficha_interna(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'cliente', jsonb_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'telefone', c.telefone, 'situacao', c.situacao,
      'fechamento', c.fechamento, 'implantacao', c.implementacao, 'implementador', c.implementador, 'suporte', c.suporte, 'obs', c.obs, 'link_drive', c.link_drive),
    'implementacoes', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'responsavel', i.responsavel,
        'programador', i.programador, 'enviado_em', i.enviado_em, 'iniciado_em', i.iniciado_em, 'concluido_em', i.concluido_em,
        'validado_em', i.validado_em, 'obs_final', i.obs_final) order by i.criado_em)
      from public.gestao_implementacoes i where i.cliente_id = c.id and i.deleted_at is null), '[]'::jsonb),
    'acompanhamentos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'responsavel', s.responsavel,
        'inicio', s.inicio, 'concluido_em', s.concluido_em, 'obs_final', s.obs_final) order by s.criado_em)
      from public.gestao_suporte_atend s where s.cliente_id = c.id and s.deleted_at is null), '[]'::jsonb))
  into v
  from public.gestao_clientes c where c.id = p_cliente_id and c.deleted_at is null;
  if v is null then raise exception 'gestao: cliente não encontrado' using errcode = '22023'; end if;
  return v;
end $function$

