-- Onda 1 (lado banco): medidor de completude do cadastro da empresa + cobrança
-- semanal via notificações (OS já exibe). Onboarding visual fica pro pós-Tijolo-0.

-- 1. Medidor: 10 critérios de mesmo peso → pontuacao 0-100 + lista do que falta.
CREATE OR REPLACE FUNCTION public.completude_empresa(p_tenant_id uuid)
RETURNS TABLE(pontuacao int, faltantes text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.empresas%ROWTYPE;
  v_pontos int := 0;
  v_faltas text[] := '{}';
  v_tem_produto boolean;
  v_tem_conhecimento boolean;
BEGIN
  SELECT * INTO e FROM public.empresas WHERE user_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, ARRAY['cadastro da empresa inteiro']::text[];
    RETURN;
  END IF;

  IF COALESCE(trim(e.nome), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'nome'; END IF;
  IF COALESCE(trim(e.descricao), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'descrição'; END IF;
  IF COALESCE(trim(e.missao), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'missão'; END IF;
  IF COALESCE(trim(e.valores), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'valores'; END IF;
  IF e.horario_funcionamento IS NOT NULL THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'horário de funcionamento'; END IF;
  IF COALESCE(trim(e.cidade), '') <> '' OR COALESCE(trim(e.endereco), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'endereço/cidade'; END IF;
  IF COALESCE(trim(e.instagram), '') <> '' OR COALESCE(trim(e.site), '') <> ''
     OR COALESCE(trim(e.facebook), '') <> '' OR COALESCE(trim(e.whatsapp), '') <> '' THEN
    v_pontos := v_pontos + 1;
  ELSE v_faltas := v_faltas || 'rede social ou site'; END IF;
  IF COALESCE(trim(e.logo_url), '') <> '' THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'logo'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.produtos p WHERE p.user_id = p_tenant_id AND p.ativo) INTO v_tem_produto;
  IF v_tem_produto THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'pelo menos 1 produto ativo'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.produto_conhecimento pc
    JOIN public.produtos p ON p.id = pc.produto_id
    WHERE p.user_id = p_tenant_id
  ) INTO v_tem_conhecimento;
  IF v_tem_conhecimento THEN v_pontos := v_pontos + 1; ELSE v_faltas := v_faltas || 'conhecimento de produto'; END IF;

  RETURN QUERY SELECT v_pontos * 10, v_faltas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.completude_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completude_empresa(uuid) TO authenticated;

-- 2. Cobrança semanal: tenant com agente e cadastro < 80% ganha notificação
--    (dedup: pula quem já tem notificação do tipo não lida ou criada há < 6 dias).
CREATE OR REPLACE FUNCTION public.notificar_empresas_incompletas()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_pontuacao int;
  v_faltantes text[];
  v_criadas int := 0;
BEGIN
  FOR v_tenant IN SELECT DISTINCT au.user_id FROM public.agentes_usuario au LOOP
    SELECT c.pontuacao, c.faltantes INTO v_pontuacao, v_faltantes
    FROM public.completude_empresa(v_tenant) c;

    CONTINUE WHEN v_pontuacao >= 80;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notificacoes n
      WHERE n.user_id = v_tenant
        AND n.tipo = 'empresa_incompleta'
        AND (n.lida = false OR n.created_at > now() - interval '6 days')
    );

    INSERT INTO public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
    VALUES (
      v_tenant,
      'empresa_incompleta',
      'building-2',
      'Cadastro da empresa em ' || v_pontuacao || '%',
      'Seu agente vende melhor quando conhece a empresa. Falta: ' || array_to_string(v_faltantes, ', ') || '.',
      '/empresa',
      'Completar cadastro'
    );
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notificar_empresas_incompletas() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificar-empresas-incompletas') THEN
    PERFORM cron.unschedule('notificar-empresas-incompletas');
  END IF;
END
$do$;

SELECT cron.schedule(
  'notificar-empresas-incompletas',
  '0 12 * * 1',
  'SELECT public.notificar_empresas_incompletas();'
);
;
