-- Quantos prêmios/ganhadores o dono quiser: rifas ganham `premios_extras`
-- (lista de textos: 2º, 3º…) e o sorteio passa a tirar 1 número por prêmio,
-- gravando a lista completa em `resultado_sorteio`. Compatível com o legado:
-- numero_sorteado/ganhador_* continuam recebendo o 1º prêmio.
-- Down: drop das colunas + restaurar sortear_rifa/obter_rifa_por_token anteriores.

ALTER TABLE public.rifas ADD COLUMN IF NOT EXISTS premios_extras jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rifas ADD COLUMN IF NOT EXISTS resultado_sorteio jsonb;

-- Assinatura muda (novo param array) — DROP evita ambiguidade de overload no PostgREST.
DROP FUNCTION IF EXISTS public.sortear_rifa(uuid, integer);

CREATE OR REPLACE FUNCTION public.sortear_rifa(p_rifa uuid, p_numero_manual integer DEFAULT NULL::integer, p_numeros_manuais integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_r public.rifas%rowtype;
  v_premios text[];
  v_numeros integer[];
  v_qtd integer;
  v_numero integer;
  v_ped public.pedidos_rifa%rowtype;
  v_resultado jsonb := '[]'::jsonb;
  v_item jsonb;
  i integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_r from public.rifas
  where id = p_rifa and tenant_id = v_uid and deleted_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;
  if v_r.status = 'sorteada' then
    return jsonb_build_object('ok', false, 'erro', 'rifa_ja_sorteada');
  end if;

  -- lista de prêmios: principal (1º) + extras na ordem cadastrada
  select array[v_r.premio_principal] || coalesce(array_agg(e.value #>> '{}' order by e.ordinality), '{}')
    into v_premios
  from jsonb_array_elements(coalesce(v_r.premios_extras, '[]'::jsonb)) with ordinality e;
  v_qtd := coalesce(array_length(v_premios, 1), 1);

  if p_numeros_manuais is not null and array_length(p_numeros_manuais, 1) > 0 then
    -- resultado externo com 1 número por prêmio, na ordem
    if array_length(p_numeros_manuais, 1) <> v_qtd then
      return jsonb_build_object('ok', false, 'erro',
        'informar_um_numero_por_premio (' || v_qtd || ' prêmios)');
    end if;
    if exists (select 1 from unnest(p_numeros_manuais) n where n < 1 or n > v_r.total_numeros) then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    if (select count(distinct n) from unnest(p_numeros_manuais) n) <> v_qtd then
      return jsonb_build_object('ok', false, 'erro', 'numeros_repetidos');
    end if;
    v_numeros := p_numeros_manuais;
  elsif p_numero_manual is not null then
    -- legado: 1 número manual só serve quando a rifa tem 1 prêmio
    if v_qtd > 1 then
      return jsonb_build_object('ok', false, 'erro',
        'informar_um_numero_por_premio (' || v_qtd || ' prêmios)');
    end if;
    if p_numero_manual < 1 or p_numero_manual > v_r.total_numeros then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    v_numeros := array[p_numero_manual];
  else
    -- sorteio da plataforma: aleatórios distintos entre números PAGOS
    select array_agg(numero) into v_numeros
    from (
      select numero from public.numeros_rifa
      where rifa_id = v_r.id and status = 'pago'
      order by random() limit v_qtd
    ) s;
    if v_numeros is null then
      return jsonb_build_object('ok', false, 'erro', 'sem_numeros_pagos');
    end if;
    if array_length(v_numeros, 1) < v_qtd then
      return jsonb_build_object('ok', false, 'erro',
        'pagos_insuficientes (' || array_length(v_numeros, 1) || ' pagos pra ' || v_qtd || ' prêmios)');
    end if;
  end if;

  for i in 1..v_qtd loop
    v_numero := v_numeros[i];
    v_ped := null;
    select p.* into v_ped
    from public.numeros_rifa nr
    join public.pedidos_rifa p on p.id = nr.pedido_id
    where nr.rifa_id = v_r.id and nr.numero = v_numero and nr.status = 'pago';

    v_item := jsonb_build_object(
      'ordem', i,
      'premio', v_premios[i],
      'numero', v_numero,
      'ganhador_nome', v_ped.nome,
      'ganhador_phone', v_ped.phone,
      'sem_ganhador', v_ped.id is null
    );
    v_resultado := v_resultado || jsonb_build_array(v_item);
  end loop;

  update public.rifas
  set status = 'sorteada',
      numero_sorteado = v_numeros[1],
      ganhador_nome = v_resultado->0->>'ganhador_nome',
      ganhador_phone = v_resultado->0->>'ganhador_phone',
      resultado_sorteio = v_resultado,
      sorteada_em = now(), updated_at = now()
  where id = v_r.id;

  return jsonb_build_object(
    'ok', true,
    'numero_sorteado', v_numeros[1],
    'ganhador_nome', v_resultado->0->>'ganhador_nome',
    'ganhador_phone', v_resultado->0->>'ganhador_phone',
    'sem_ganhador', (v_resultado->0->>'sem_ganhador')::boolean,
    'resultado', v_resultado
  );
end;
$function$;

-- Função de dono: anon não executa (DROP+CREATE reseta grants — reaplicar)
REVOKE EXECUTE ON FUNCTION public.sortear_rifa(uuid, integer, integer[]) FROM anon;
;
