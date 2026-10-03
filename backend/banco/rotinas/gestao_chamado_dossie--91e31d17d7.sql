CREATE OR REPLACE FUNCTION public.gestao_chamado_dossie(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid := public.gestao_chamado_do_codigo(p_codigo); c public.gestao_chamados;
begin
  if v_id is null then raise exception 'gestao: chamado % não encontrado', p_codigo using errcode = '22023'; end if;
  select * into c from public.gestao_chamados where id = v_id;
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and not (public.gestao_tem_papel(array['suporte','financeiro','comercial']::text[])
              or (c.passou_pd and public.gestao_tem_papel(array['programador']::text[]))) then
    raise exception 'gestao: sem permissão para ver este chamado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'codigo', 'CH-' || lpad(c.numero::text, 4, '0'),
    'chamado', to_jsonb(c) - 'deleted_at',
    'linha_do_tempo', coalesce((select jsonb_agg(jsonb_build_object('quando', e.aconteceu_em, 'registrado_em', e.registrado_em, 'tipo', e.tipo,
        'autor', e.autor_nome, 'origem', e.origem, 'de', e.valor_antigo, 'para', e.valor_novo, 'texto', e.texto) order by e.aconteceu_em, e.registrado_em)
      from public.gestao_chamado_eventos e where e.chamado_id = c.id), '[]'::jsonb),
    'ficha', public.gestao_chamado_ficha_interna(c.cliente_id));
end $function$

