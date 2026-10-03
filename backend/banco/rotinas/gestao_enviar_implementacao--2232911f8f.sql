CREATE OR REPLACE FUNCTION public.gestao_enviar_implementacao(p_cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cli record; v_por text; v_id uuid;
begin
  if not public.gestao_tem_papel(array['financeiro','comercial']::text[]) then
    raise exception 'gestao: sem permissao para enviar cliente a implementacao' using errcode = '42501'; end if;
  if p_cliente_id is null then raise exception 'gestao: cliente obrigatorio' using errcode = '22023'; end if;
  -- um envio por vez para o mesmo cliente (dois cliques ao mesmo tempo não criam duas implementações)
  perform pg_advisory_xact_lock(hashtext('gestao_enviar_implementacao:' || p_cliente_id::text));
  select id, nome, implementador into v_cli from public.gestao_clientes where id = p_cliente_id and deleted_at is null;
  if not found then raise exception 'gestao: cliente nao encontrado' using errcode = '22023'; end if;
  if exists (select 1 from public.gestao_implementacoes
              where cliente_id = p_cliente_id and deleted_at is null and status is distinct from 'concluida') then
    raise exception 'gestao: % ja esta na implementacao', v_cli.nome using errcode = '22023'; end if;
  -- quem enviou: o nome do perfil de quem está logado (o mesmo que o app mostra), nunca um texto vindo do navegador
  select nullif(btrim(p.full_name), '') into v_por from public.profiles p where p.id = (select auth.uid()) and p.deleted_at is null;
  insert into public.gestao_implementacoes (cliente_id, cliente_nome, status, enviado_em, responsavel, tentativas, dias, extras)
  values (v_cli.id, v_cli.nome, 'aguardando', now(), nullif(btrim(coalesce(v_cli.implementador, '')), ''), '[]'::jsonb, '{}'::jsonb,
          jsonb_build_object('encaminhamentos', jsonb_build_array(
            jsonb_build_object('em', now(), 'de', 'clientes', 'para', 'implementacao', 'por', v_por))))
  returning id into v_id;
  return v_id;
end $function$

