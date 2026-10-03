-- Ao JUNTAR números num pedido aberto, a RPC devolvia `v_pedido.expira_em` — o valor lido
-- ANTES do UPDATE que renova o prazo. O agente falava a hora velha (às vezes já passada) e o
-- lead achava que a reserva ia morrer em minutos. Agora o retorno lê o prazo gravado.
-- Δ 2026-09-08 (Fase 3 do plano de Rifas). Só o bloco final de retorno muda.

create or replace function public.reservar_numeros_rifa_publico(
  p_token uuid, p_nome text, p_phone text, p_qtd integer default null,
  p_numeros integer[] default null, p_lead_id uuid default null,
  p_conversa_id uuid default null, p_origem text default 'link',
  p_utm jsonb default null, p_sem_expiracao boolean default false,
  p_fiado boolean default false, p_pedido_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r public.rifas%rowtype;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_phone text := public.normalizar_telefone_brasil(p_phone);
  v_fixo boolean := false;
  v_min integer;
  v_max integer;
  v_qtd integer;
  v_numeros integer[];
  v_pedido public.pedidos_rifa%rowtype;
  v_pedido_existente public.pedidos_rifa%rowtype;
  v_juntando boolean := false;
  v_qtd_existente integer := 0;
  v_valor integer := 0;
  v_restante integer;
  v_promo record;
  v_faltam integer;
  v_inseridos integer;
  v_livres integer;
  v_ocupados integer[];
  v_pix text;
  v_reservados integer[];
  v_expira timestamptz;
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

  -- Pedido aberto pra juntar (Δ 2026-08-28): comprador já reservado
  -- (06,15...) pega mais números — soma no MESMO pedido em vez de criar
  -- outro token/PIX separado. Token é o segredo; rifa+status batendo evita
  -- juntar num pedido fechado/de outra rifa.
  if p_pedido_token is not null then
    select * into v_pedido_existente from public.pedidos_rifa
    where chave_publica = p_pedido_token
      and rifa_id = v_r.id
      and status in ('reservado', 'aguardando_validacao');
    if found then
      v_juntando := true;
      v_qtd_existente := coalesce(v_pedido_existente.qtd_numeros, 0);
    end if;
  end if;

  -- faixa da cartela: 0..total-1 (desde zero) ou 1..total (legado)
  v_min := case when v_r.numeracao_desde_zero then 0 else 1 end;
  v_max := v_min + v_r.total_numeros - 1;

  -- Reserva sem prazo: número fixo do dono OU fiado liberado pelo dono na rifa.
  v_fixo := (coalesce(p_sem_expiracao, false) and (select auth.uid()) = v_r.tenant_id)
         or (coalesce(p_fiado, false) and v_r.aceita_fiado);
  if coalesce(p_fiado, false) and not v_r.aceita_fiado then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_aceita_fiado');
  end if;

  -- números escolhidos a dedo: valida faixa e duplicata; qtd vem do array
  if p_numeros is not null and array_length(p_numeros, 1) > 0 then
    select array_agg(distinct n) into v_numeros from unnest(p_numeros) n;
    if exists (select 1 from unnest(v_numeros) n where n < v_min or n > v_max) then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    v_qtd := array_length(v_numeros, 1);
  else
    v_qtd := coalesce(p_qtd, 0);
  end if;

  if v_qtd < 1 or (v_qtd_existente + v_qtd) > v_r.max_numeros_por_pedido then
    return jsonb_build_object('ok', false, 'erro',
      'quantidade_invalida (mín 1, máx ' || v_r.max_numeros_por_pedido ||
      case when v_juntando then ' no total do pedido' else '' end || ')');
  end if;

  if v_juntando then
    v_pedido := v_pedido_existente;
  else
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
      v_qtd, '{}', v_valor, 'reservado',
      case when v_fixo then null else now() + make_interval(mins => v_r.minutos_reserva) end,
      p_utm
    ) returning * into v_pedido;
  end if;

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
        from generate_series(v_min, v_max) gs
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
        from generate_series(v_min, v_max) gs
        where not exists (
          select 1 from public.numeros_rifa nr
          where nr.rifa_id = v_r.id and nr.numero = gs
        );
        exit when v_livres = 0;
      end if;
    end loop;
    if v_faltam > 0 then
      raise exception 'NUMEROS_INSUFICIENTES: só restam % números disponíveis',
        (select count(*) from generate_series(v_min, v_max) gs
         where not exists (select 1 from public.numeros_rifa nr
                           where nr.rifa_id = v_r.id and nr.numero = gs));
    end if;
  end if;

  select array_agg(numero order by numero) into v_reservados
  from public.numeros_rifa where pedido_id = v_pedido.id;

  if v_juntando then
    -- repreça o pedido INTEIRO (existente + novos) — pacotes promocionais
    -- são por quantidade total, não por lote isolado.
    v_valor := 0;
    v_restante := array_length(v_reservados, 1);
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

    update public.pedidos_rifa set
      numeros = v_reservados,
      qtd_numeros = array_length(v_reservados, 1),
      valor_centavos = v_valor,
      -- pedido fixo (sem prazo) continua sem prazo; senão dá fôlego novo
      -- pro comprador pagar TUDO junto, não só o lote que acabou de somar.
      expira_em = case when v_pedido.expira_em is null then null
                        else now() + make_interval(mins => v_r.minutos_reserva) end,
      updated_at = now()
    where id = v_pedido.id
    -- Δ 2026-09-08: sem isto o retorno levava o prazo ANTIGO (v_pedido foi lido antes do
    -- UPDATE) e o agente anunciava uma hora que às vezes já tinha passado.
    returning expira_em into v_expira;
  else
    update public.pedidos_rifa set numeros = v_reservados, updated_at = now()
    where id = v_pedido.id
    returning expira_em into v_expira;
  end if;

  select coalesce(rc.chave_pix, p.chave_pix) into v_pix
  from public.profiles p
  left join public.rifas_config_tenant rc on rc.tenant_id = p.id
  where p.id = v_r.tenant_id;

  return jsonb_build_object(
    'ok', true,
    'pedido_token', v_pedido.chave_publica,
    'numeros', to_jsonb(v_reservados),
    'qtd', array_length(v_reservados, 1),
    'valor_centavos', v_valor,
    'chave_pix', v_pix,
    'expira_em', v_expira,
    'numero_fixo', v_fixo,
    'rifa_titulo', v_r.titulo,
    'juntou_pedido', v_juntando
  );
end;
$function$;
;
