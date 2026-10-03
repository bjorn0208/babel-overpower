CREATE OR REPLACE FUNCTION public.reservar_orcamento_porteiro(p_ip text, p_custo_centesimos integer DEFAULT 1, p_cap_ip integer DEFAULT 500, p_cap_global integer DEFAULT 200000)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_data date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_gasto_ip integer;
  v_gasto_global integer;
BEGIN
  INSERT INTO public.orcamento_porteiro_diario (data, escopo, identificador, gasto_centesimos, tentativas)
  VALUES (v_data, 'ip', p_ip, p_custo_centesimos, 1)
  ON CONFLICT (data, escopo, identificador) DO UPDATE
    SET gasto_centesimos = public.orcamento_porteiro_diario.gasto_centesimos + EXCLUDED.gasto_centesimos,
        tentativas = public.orcamento_porteiro_diario.tentativas + 1,
        atualizado_em = now()
  RETURNING gasto_centesimos INTO v_gasto_ip;

  INSERT INTO public.orcamento_porteiro_diario (data, escopo, identificador, gasto_centesimos, tentativas)
  VALUES (v_data, 'global', 'global', p_custo_centesimos, 1)
  ON CONFLICT (data, escopo, identificador) DO UPDATE
    SET gasto_centesimos = public.orcamento_porteiro_diario.gasto_centesimos + EXCLUDED.gasto_centesimos,
        tentativas = public.orcamento_porteiro_diario.tentativas + 1,
        atualizado_em = now()
  RETURNING gasto_centesimos INTO v_gasto_global;

  RETURN v_gasto_ip <= p_cap_ip AND v_gasto_global <= p_cap_global;
END;
$function$

