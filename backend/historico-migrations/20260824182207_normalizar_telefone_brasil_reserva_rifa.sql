-- Comprador da rifa não recebia a notificação: telefone salvo sem DDI 55
-- (a Z-API aceita o envio e a mensagem morre). Helper único de normalização
-- + RPC de reserva passa a gravar sempre em formato internacional.
-- Down: drop function normalizar_telefone_brasil + restaurar RPC anterior (regexp_replace simples).

CREATE OR REPLACE FUNCTION public.normalizar_telefone_brasil(p_bruto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v text := regexp_replace(coalesce(p_bruto, ''), '\D', '', 'g');
begin
  -- tira zeros à esquerda (ex: 011 94xxx)
  v := regexp_replace(v, '^0+', '');
  -- já veio com DDI 55 + DDD + número (12–13 dígitos)
  if v ~ '^55\d{10,11}$' then
    return v;
  end if;
  -- DDD + número (10–11 dígitos) → adiciona DDI
  if v ~ '^\d{10,11}$' then
    return '55' || v;
  end if;
  -- qualquer outra coisa é lixo — quem chama decide o que fazer
  return null;
end;
$$;

COMMENT ON FUNCTION public.normalizar_telefone_brasil(text) IS
  'Normaliza telefone BR pro formato internacional (55 + DDD + número). Devolve NULL se não reconhecer.';

-- RPC de reserva: grava sempre normalizado; rejeita telefone irreconhecível.
-- Corpo idêntico ao anterior, exceto a linha do v_phone e a validação.
CREATE OR REPLACE FUNCTION public.reservar_numeros_rifa_publico(p_token uuid, p_nome text, p_phone text, p_qtd integer DEFAULT NULL::integer, p_numeros integer[] DEFAULT NULL::integer[], p_lead_id uuid DEFAULT NULL::uuid, p_conversa_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'link'::text, p_utm jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r public.rifas%rowtype;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_phone text := public.normalizar_telefone_brasil(p_phone);
  v_qtd integer;
  v_numeros integer[];
  v_pedido public.pedidos_rifa%rowtype;
  v_valor integer := 0;
  v_restante integer;
  v_promo record;
  v_faltam integer;
  v_inseridos integer;
  v_livres integer;
  v_ocupados integer[];
  v_pix text;
  v_reservados integer[];
begin
  if v_nome is null then
    return jsonb_build_object('ok', false, 'erro', 'nome_obrigatorio');
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'erro', 'phone_invalido');
  end if;

  perform public.verificar_limite_taxa_publico(v_phone, 'rifa_reserva', 30);

  select * into v_r from public.rifas
  where chave_publica = p_token and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;
  if v_r.status <> 'ativa' then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_esta_ativa');
  end if;

  -- números escolhidos a dedo: valida faixa e duplicata; qtd vem do array
  if p_numeros is not null and array_length(p_numeros, 1) > 0 then
    select array_agg(distinct n) into v_numeros from unnest(p_numeros) n;
    if exists (select 1 from unnest(v_numeros) n where n < 1 or n > v_r.total_numeros) then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    v_qtd := array_length(v_numeros, 1);
  else
    v_qtd := coalesce(p_qtd, 0);
  end if;

  if v_qtd < 1 or v_qtd > v_r.max_numeros_por_pedido then
    return jsonb_build_object('ok', false, 'erro',
      'quantidade_invalida (mín 1, máx ' || v_r.max_numeros_por_pedido || ')');
  end if;

  -- valor: pacotes promocionais gulosos (maior primeiro) + resto no preço unitário
  v_restante := v_qtd;
  for v_promo in
    select (c->>'qtd')::int as q, (c->>'preco_total_centavos')::int as p
    from jsonb_array_elements(v_r.promocoes) c
    where (c->>'qtd')::int > 0 and (c->>'preco_total_centavos')::int > 0
    order by (c->>'qtd')::int desc
  loop
    while v_restante >= v_promo.q loop
      v_valor := v_valor + v_promo.p;
      v_restante := v_restante - v_promo.q;
    end loop;
  end loop;
  v_valor := v_valor + v_restante * v_r.preco_numero_centavos;

  insert into public.pedidos_rifa (
    rifa_id, tenant_id, nome, phone, lead_id, conversa_id, origem,
    qtd_numeros, numeros, valor_centavos, status, expira_em, utm
  ) values (
    v_r.id, v_r.tenant_id, v_nome, v_phone, p_lead_id, p_conversa_id,
    case when p_origem in ('link','agente','manual') then p_origem else 'link' end,
    v_qtd, '{}', v_valor, 'reservado', now() + make_interval(mins => v_r.minutos_reserva),
    p_utm
  ) returning * into v_pedido;

  if v_numeros is not null then
    -- manual: tudo-ou-nada
    insert into public.numeros_rifa (rifa_id, tenant_id, pedido_id, numero, status)
    select v_r.id, v_r.tenant_id, v_pedido.id, n, 'reservado' from unnest(v_numeros) n
    on conflict (rifa_id, numero) do nothing;
    get diagnostics v_inseridos = row_count;
    if v_inseridos < v_qtd then
      select array_agg(n order by n) into v_ocupados
      from unnest(v_numeros) n
      where not exists (
        select 1 from public.numeros_rifa nr
        where nr.rifa_id = v_r.id and nr.numero = n and nr.pedido_id = v_pedido.id
      );
      raise exception 'NUMEROS_OCUPADOS:%', array_to_string(v_ocupados, ',');
    end if;
  else
    -- aleatório: loop curto com re-sorteio dos que colidirem
    v_faltam := v_qtd;
    for i in 1..6 loop
      exit when v_faltam <= 0;
      with candidatos as (
        select gs as numero
        from generate_series(1, v_r.total_numeros) gs
        where not exists (
          select 1 from public.numeros_rifa nr
          where nr.rifa_id = v_r.id and nr.numero = gs
        )
        order by random()
        limit v_faltam
      ), ins as (
        insert into public.numeros_rifa (rifa_id, tenant_id, pedido_id, numero, status)
        select v_r.id, v_r.tenant_id, v_pedido.id, numero, 'reservado' from candidatos
        on conflict (rifa_id, numero) do nothing
        returning numero
      )
      select count(*) into v_inseridos from ins;
      v_faltam := v_faltam - v_inseridos;
      if v_inseridos = 0 then
        select count(*) into v_livres
        from generate_series(1, v_r.total_numeros) gs
        where not exists (
          select 1 from public.numeros_rifa nr
          where nr.rifa_id = v_r.id and nr.numero = gs
        );
        exit when v_livres = 0;
      end if;
    end loop;
    if v_faltam > 0 then
      raise exception 'NUMEROS_INSUFICIENTES: só restam % números disponíveis',
        (select count(*) from generate_series(1, v_r.total_numeros) gs
         where not exists (select 1 from public.numeros_rifa nr
                           where nr.rifa_id = v_r.id and nr.numero = gs));
    end if;
  end if;

  select array_agg(numero order by numero) into v_reservados
  from public.numeros_rifa where pedido_id = v_pedido.id;

  update public.pedidos_rifa set numeros = v_reservados, updated_at = now()
  where id = v_pedido.id;

  select coalesce(rc.chave_pix, p.chave_pix) into v_pix
  from public.profiles p
  left join public.rifas_config_tenant rc on rc.tenant_id = p.id
  where p.id = v_r.tenant_id;

  return jsonb_build_object(
    'ok', true,
    'pedido_token', v_pedido.chave_publica,
    'numeros', to_jsonb(v_reservados),
    'qtd', v_qtd,
    'valor_centavos', v_valor,
    'chave_pix', v_pix,
    'expira_em', v_pedido.expira_em,
    'rifa_titulo', v_r.titulo
  );
end;
$function$;
;
