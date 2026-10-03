CREATE OR REPLACE FUNCTION public.disparar_vigia_canais_zapi(p_canal_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$

