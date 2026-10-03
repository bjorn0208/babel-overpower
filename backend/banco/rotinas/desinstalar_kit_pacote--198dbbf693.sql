CREATE OR REPLACE FUNCTION public.desinstalar_kit_pacote(p_pacote_id uuid, p_agente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid;
begin
  select user_id into v_tenant from public.agentes_usuario where id = p_agente_id;
  if v_tenant is null then return jsonb_build_object('ok', false); end if;
  -- Outro agente do mesmo tenant ainda com o pacote ligado → itens do tenant ficam.
  update public.cargos set ativo = false where agente_id = p_agente_id and pacote_origem_id = p_pacote_id;
  -- Identidade: remove só o que ainda é exatamente o texto do kit (o tom fica: não dá pra saber se era do kit).
  update public.agentes_usuario a
     set identidade = a.identidade - (select coalesce(array_agg(f), '{}'::text[]) from unnest(array['personalidade', 'persona']) f
                                        where a.identidade->>f is not null
                                          and a.identidade->>f = (select k.kit->'identidade'->>f from public.pacotes_conhecimento_kit k where k.pacote_id = p_pacote_id))
   where a.id = p_agente_id;
  if not exists (select 1 from public.pacotes_conhecimento_ativacao a where a.pacote_id = p_pacote_id and a.tenant_id = v_tenant and a.ligado and a.agente_id <> p_agente_id) then
    update public.produtos set ativo = false where user_id = v_tenant and pacote_origem_id = p_pacote_id;
    update public.blocos_gatilho set ativo = false where tenant_id = v_tenant and pacote_origem_id = p_pacote_id;
    update public.anti_padroes set ativo = false where tenant_id = v_tenant and pacote_origem_id = p_pacote_id;
    update public.blocos_humanizacao set ativo = false where tenant_id = v_tenant and pacote_origem_id = p_pacote_id;
    update public.blocos_procedurais set ativo = false where tenant_id = v_tenant and pacote_origem_id = p_pacote_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$

