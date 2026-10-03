-- Gate de permissão nas RPCs de escrita do Mentor + sanitização anti-vazamento
-- (Dominic, 25/08/2026). Testado no espelho local, incluindo o exemplo real
-- de vazamento relatado. Detalhes no arquivo homônimo do repo.

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'atualizar_dados_escrita_nucleo'
  ) then
    alter function public.atualizar_dados_escrita(uuid, text, boolean)
      rename to atualizar_dados_escrita_nucleo;
  end if;
end $$;

create or replace function public.atualizar_dados_escrita(
  p_owner uuid, p_sql text, p_confirmar_em_massa boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (
    select 1 from public.profiles pr
    where pr.id = p_owner
      and pr.parent_user_id is not null
      and coalesce(pr.system_role, '') <> 'platform_admin'
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'sem_permissao: alterar dados da conta é privilégio do dono. Peça ao titular.');
  end if;
  return public.atualizar_dados_escrita_nucleo(p_owner, p_sql, p_confirmar_em_massa);
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'preparar_exclusao_dados_nucleo'
  ) then
    alter function public.preparar_exclusao_dados(uuid, uuid, text)
      rename to preparar_exclusao_dados_nucleo;
  end if;
end $$;

create or replace function public.preparar_exclusao_dados(
  p_owner uuid, p_conversa uuid, p_sql text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (
    select 1 from public.profiles pr
    where pr.id = p_owner
      and pr.parent_user_id is not null
      and coalesce(pr.system_role, '') <> 'platform_admin'
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'sem_permissao: excluir dados da conta é privilégio do dono. Peça ao titular.');
  end if;
  return public.preparar_exclusao_dados_nucleo(p_owner, p_conversa, p_sql);
end;
$$;

create or replace function public.fn_sanitizar_resposta_mentor()
returns trigger
language plpgsql
as $$
declare
  v text;
begin
  if new.papel <> 'assistant' or new.conteudo is null or new.conteudo = '' then
    return new;
  end if;
  v := new.conteudo;
  v := regexp_replace(v, '\s*isso responde [àa] pergunta\.?', '', 'gi');
  v := regexp_replace(v, '^.*posso ignorar( silenciosamente)?.*$', '', 'gin');
  v := regexp_replace(v, '^\s*o prompt (de |do )?sistema (diz|pede|manda).*$', '', 'gin');
  v := regexp_replace(v, '^\s*portanto: ["“].*$', '', 'gin');
  v := regexp_replace(v, '^\s*conforme (o prompt|as regras|as instru[cç][oõ]es).*$', '', 'gin');
  v := regexp_replace(v, '^.*obedi[êe]ncia cega.*$', '', 'gin');
  v := regexp_replace(v, '^\s*(o|a) (kpi|tool|ferramenta|consulta) (foi|j[áa] foi) (chamad|execut|realizad).*$', '', 'gin');
  v := regexp_replace(v, '^\s*(devo|vou) (responder|entregar|seguir|passar) (exatamente|s[óo]|apenas|somente).*$', '', 'gin');
  v := regexp_replace(v, E'\n{3,}', E'\n\n', 'g');
  v := btrim(v);
  if v <> '' then
    new.conteudo := v;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sanitizar_resposta_mentor on public.mentor_mensagens;
create trigger trg_sanitizar_resposta_mentor
  before insert on public.mentor_mensagens
  for each row execute function public.fn_sanitizar_resposta_mentor();
;
