create table if not exists public.alertas_operacao (
  id         uuid primary key default gen_random_uuid(),
  tipo       text        not null,
  severidade text        not null default 'alerta',
  resumo     text        not null,
  detalhes   jsonb       not null default '{}'::jsonb,
  criado_em  timestamptz not null default now(),
  visto_em   timestamptz
);

create index if not exists idx_alertas_operacao_aberto
  on public.alertas_operacao (criado_em desc) where visto_em is null;

alter table public.alertas_operacao enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'alertas_operacao'
       and policyname = 'alertas_operacao_admin'
  ) then
    create policy alertas_operacao_admin on public.alertas_operacao
      for all to authenticated
      using (exists (
        select 1 from public.profiles p
         where p.id = auth.uid() and p.system_role = 'platform_admin'
      ))
      with check (exists (
        select 1 from public.profiles p
         where p.id = auth.uid() and p.system_role = 'platform_admin'
      ));
  end if;
end $$;

create or replace view public.vw_bolhas_barradas as
select
  date_trunc('day', c.created_at)::date as dia,
  c.error_reason,
  c.tenant_id,
  p.full_name as tenant,
  count(*) as bolhas,
  max(c.created_at) as ultima,
  (array_agg(left(c.content, 160) order by c.created_at desc))[1] as exemplo
from public.caixa_saida_mensagens c
left join public.profiles p on p.id = c.tenant_id
where c.error_reason in ('link_contrato_fantasma', 'placeholder_nao_resolvido')
  and c.created_at > now() - interval '7 days'
group by 1, 2, 3, 4
order by 1 desc, bolhas desc;

create or replace function public.vigia_bolhas_barradas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total   integer;
  v_detalhe jsonb;
begin
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'tenant', coalesce(p.full_name, c.tenant_id::text),
           'motivo', c.error_reason,
           'conteudo', left(c.content, 200),
           'quando', c.created_at
         ) order by c.created_at desc), '[]'::jsonb)
    into v_total, v_detalhe
    from public.caixa_saida_mensagens c
    left join public.profiles p on p.id = c.tenant_id
   where c.error_reason in ('link_contrato_fantasma', 'placeholder_nao_resolvido')
     and c.created_at > now() - interval '24 hours';

  if v_total = 0 then
    return 0;
  end if;

  insert into public.alertas_operacao (tipo, severidade, resumo, detalhes)
  values (
    'bolha_barrada',
    case when v_total >= 5 then 'critico' else 'alerta' end,
    v_total || ' bolha(s) barradas nas últimas 24h por link de contrato inventado ou placeholder não resolvido',
    jsonb_build_object('total', v_total, 'ocorrencias', v_detalhe)
  );

  return v_total;
end $$;

comment on function public.vigia_bolhas_barradas() is
  'Abre alerta em alertas_operacao quando o motor barrou bolhas nas ultimas 24h. Agendado por pg_cron (vigia-bolhas-barradas, 12:00 UTC = 09:00 BRT).';
;
