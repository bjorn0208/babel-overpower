-- Vigia de canal Z-API — auto-cura dos callbacks + alerta de canal mudo.
--
-- Por quê: a Babel nunca configurou os callbacks da Z-API. O único PUT que existia
-- (`ensureReceivedByMe`, em webhook/helpers.ts) roda DENTRO do webhook — ovo e galinha:
-- canal cujo callback aponta pra fora nunca recebe webhook, logo nunca se conserta.
-- Cravar na mão era passo manual e já falhou 4x: Carlos (2026-06-02), Fabricio
-- (2026-08-20), Tríade (2026-08-31) e Otmar (2026-09-04) — este último passou 3 dias
-- entregando toda mensagem de lead na plataforma ANTERIOR do cliente.
--
-- Esta migration liga a edge `vigia-canais-zapi` em dois gatilhos:
--   1. trigger em `canais` — canal novo/reativado é conferido em segundos, sem depender
--      de qual UI o criou (o frontend não precisa saber de nada disso);
--   2. cron horário — pega deriva de config, instância caída e plano vencido.
--
-- Idempotente: pode rodar de novo sem estragar nada.

create or replace function public.disparar_vigia_canais_zapi(p_canal_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
  v_req   bigint;
begin
  select decrypted_secret into v_chave
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if v_chave is null then
    raise warning 'disparar_vigia_canais_zapi: service_role_key ausente no vault — vigia não disparado';
    return null;
  end if;

  select net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/vigia-canais-zapi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave
    ),
    body := case
              when p_canal_id is null then '{}'::jsonb
              else jsonb_build_object('canal_id', p_canal_id)
            end,
    timeout_milliseconds := 300000
  ) into v_req;

  return v_req;
end $$;

comment on function public.disparar_vigia_canais_zapi(uuid) is
  'Chama a edge vigia-canais-zapi via pg_net. Sem argumento = varredura completa (cron); com canal_id = confere só aquele canal (trigger de canais).';

create or replace function public.tg_canais_conferir_zapi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'whatsapp'
     and new.is_active
     and coalesce(new.zapi_instance_id, '') <> ''
     and coalesce(new.zapi_token, '') <> ''
  then
    perform public.disparar_vigia_canais_zapi(new.id);
  end if;
  return null;
end $$;

comment on function public.tg_canais_conferir_zapi() is
  'AFTER trigger de canais: manda o vigia conferir/cravar os callbacks da Z-API do canal recem-criado ou reativado.';

drop trigger if exists canais_conferir_zapi on public.canais;

create trigger canais_conferir_zapi
after insert or update of zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, is_active
on public.canais
for each row
execute function public.tg_canais_conferir_zapi();
;
