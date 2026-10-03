-- Fix: a função roda como consultor_dados_ro (RLS aplica). O SELECT do bilhete
-- e a checagem em mentor_mensagens precisam das claims do dono JÁ setadas —
-- antes, o set_config vinha depois e a própria função não enxergava o bilhete.
set lock_timeout = '2s';
set statement_timeout = '60s';

create or replace function public.confirmar_exclusao_dados(
  p_owner uuid,
  p_conversa uuid,
  p_bilhete uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conf record;
  v_where text;
  v_backup jsonb;
  v_total integer;
begin
  perform set_config('search_path', 'public', true);
  perform set_config('statement_timeout', '15000', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  select * into v_conf from public.confirmacoes_exclusao
  where id = p_bilhete and owner_id = p_owner and conversa_id = p_conversa;
  if v_conf is null then
    return jsonb_build_object('ok', false, 'erro', 'bilhete não encontrado — prepare a exclusão de novo');
  end if;
  if v_conf.usado_em is not null then
    return jsonb_build_object('ok', false, 'erro', 'esse bilhete já foi usado');
  end if;
  if v_conf.criado_em < now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'erro', 'bilhete expirado (30 min) — prepare de novo');
  end if;

  -- Gate dos 2 turnos: precisa existir fala NOVA do usuário depois do preparo.
  if not exists (
    select 1 from public.mentor_mensagens m
    where m.conversa_id = p_conversa and m.papel = 'user' and m.criado_em > v_conf.criado_em
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'ainda não houve confirmação do usuário. Mostre o que será excluído e espere ele responder — só então confirme.');
  end if;

  v_where := (regexp_match(v_conf.comando, '\ywhere\y(.*)$', 'i'))[1];

  begin
    -- Backup antes de sumir (lixeira invisível ao sistema, resgate 30 dias).
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from public.%I where %s) t',
                   v_conf.tabela, v_where) into v_backup;
    execute format(
      'with _r as (delete from public.%I where %s returning *) select count(*) from _r',
      v_conf.tabela, v_where
    ) into v_total;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'falha ao excluir: ' || sqlerrm);
  end;

  insert into public.lixeira_exclusoes (owner_id, tabela, linha, comando)
  select p_owner, v_conf.tabela, l, v_conf.comando
  from jsonb_array_elements(coalesce(v_backup, '[]'::jsonb)) l;

  update public.confirmacoes_exclusao set usado_em = now() where id = p_bilhete;

  return jsonb_build_object('ok', true, 'etapa', 'excluido',
    'tabela', v_conf.tabela, 'linhas_excluidas', v_total);
end;
$$;

grant usage, create on schema public to consultor_dados_ro;
alter function public.confirmar_exclusao_dados(uuid, uuid, uuid) owner to consultor_dados_ro;
revoke create on schema public from consultor_dados_ro;
revoke all on function public.confirmar_exclusao_dados(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_exclusao_dados(uuid, uuid, uuid) to service_role;
;
