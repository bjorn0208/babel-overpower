-- ============================================================================
-- Fechamento — Tabela recursos_ativacao_curadoria (Theus liga/desliga via UI)
-- Controla custo LLM exibindo nome PT-BR comercial + estimativa de custo mensal
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.recursos_ativacao_curadoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_recurso text NOT NULL UNIQUE,
  nome_comercial text NOT NULL,
  descricao_curta text NOT NULL,
  descricao_longa text,
  categoria text NOT NULL 
    CHECK (categoria IN ('motor','sono','aprendizado','cross_nicho','qualidade','fosso')),
  tipo text NOT NULL 
    CHECK (tipo IN ('cron','feature_motor','feature_ui','funcao_sql')),
  cron_nome text,
  edge_function text,
  custo_estimado_mes_brl numeric(10,2) NOT NULL DEFAULT 0.0,
  dependencias_chaves text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pausado'
    CHECK (status IN ('ativo','pausado','bloqueado')),
  motivo_bloqueio text,
  ativo boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 50,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.recursos_ativacao_curadoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recursos_curad_admin ON public.recursos_ativacao_curadoria;
CREATE POLICY recursos_curad_admin ON public.recursos_ativacao_curadoria
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')));

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_recursos_curad_atualizado()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_recursos_curad_atualizado ON public.recursos_ativacao_curadoria;
CREATE TRIGGER trg_recursos_curad_atualizado
  BEFORE UPDATE ON public.recursos_ativacao_curadoria
  FOR EACH ROW EXECUTE FUNCTION public.tg_recursos_curad_atualizado();

-- Seeds dos 11 recursos governáveis (com nome comercial pt-BR)
INSERT INTO public.recursos_ativacao_curadoria 
  (chave_recurso, nome_comercial, descricao_curta, descricao_longa, categoria, tipo, cron_nome, edge_function, custo_estimado_mes_brl, dependencias_chaves, status, ordem)
VALUES
  ('motor_le_config', 
   'Motor lê configurações vivas',
   'Permite editar prompts e modelos pela Curadoria sem precisar deployar',
   'O motor consulta a tabela config_chamadas_llm antes de cada chamada LLM. Você muda prompt/modelo/temperatura na UI e em ≤60s o motor já usa o novo. Custo zero adicional — só substitui hardcoded.',
   'motor', 'feature_motor', NULL, NULL, 0.00, '{}', 'ativo', 10),

  ('gavetas_11_religadas',
   '11 gavetas de conhecimento',
   'Síntese consulta as 11 gavetas RAG do tenant a cada turno',
   'Regras operacionais, anti-padrões, humanização, variações, gatilhos, procedimentos, meta-controle, prova social, ação-pausa, técnicas de persuasão e emoções situacionais. Editável por gaveta (piso/quantidade) na aba Chamadas LLM.',
   'motor', 'feature_motor', NULL, NULL, 30.00, '{motor_le_config}', 'ativo', 20),

  ('memoria_objetivos_conversa',
   'Memória de objetivos da conversa',
   'Agente lembra entre turnos o que o lead pediu pra acompanhar',
   'Goal Stack — pilha de objetivos abertos por conversa. Porteiro detecta automaticamente quando lead abre objetivo (cachorro sumiu, cotação pendente etc.) e quando ele é atendido. Aparece na aba Aprendizado do dossiê.',
   'motor', 'feature_motor', NULL, NULL, 5.00, '{motor_le_config}', 'ativo', 30),

  ('perfil_empresa_no_prompt',
   'Perfil destilado da empresa no prompt',
   'Síntese vê padrões da empresa do tenant a cada turno',
   'Tag <perfil_empresa> com segmento, ticket médio, taxa conversão, top objeções, argumentos ganhadores etc. Lê de perfil_empresa. Sem custo runtime adicional (1 SELECT cacheado).',
   'fosso', 'feature_motor', NULL, NULL, 0.00, '{motor_le_config}', 'ativo', 40),

  ('destilacao_perfil_empresa_ia',
   'Destilação do perfil da empresa via IA Mentor',
   'IA analisa leads e descobre padrões da empresa (top objeções, argumentos ganhadores)',
   'Roda 1×/semana. Para cada tenant pega últimos 30 leads com desfecho + memórias e chama LLM Mentor (gemini-2.5-pro) pra destilar padrões qualitativos. Resultado vai pro <perfil_empresa> no prompt da Síntese.',
   'aprendizado', 'cron', 'cron-destilar-perfil-empresa-llm', 'cron-destilar-perfil-empresa-llm', 50.00, '{perfil_empresa_no_prompt}', 'pausado', 50),

  ('sono_do_agente',
   'Sono do agente',
   'Toda noite o agente gera propostas de aprendizado novas',
   'Cron noturno itera conversas recentes e gera propostas em propostas_aprendizado. Você aprova/rejeita na bandeja. Cada proposta aprovada vira bloco curado (ou regra nova).',
   'sono', 'cron', 'cron-sono-do-agente', 'cron-sono-do-agente', 80.00, '{}', 'pausado', 60),

  ('promocao_cross_nicho',
   'Promoção entre nichos (cross-nicho)',
   'Bloco que funciona em ≥3 tenants do mesmo nicho vira proposta de bloco do nicho',
   'Cron semanal detecta blocos canônicos repetidos em ≥3 tenants do mesmo nicho. Gera candidato em candidatos_bloco pra aprovação humana. Permite que o conhecimento de um tenant melhore os outros do mesmo nicho.',
   'cross_nicho', 'cron', 'cron-promover-blocos-cross-nicho', NULL, 0.00, '{}', 'bloqueado', 70),

  ('analise_causa_efeito',
   'Análise mensal de causa-efeito',
   'Descobre o que faz lead converter de verdade',
   'Job mensal (X-Learner simplificado). Compara leads convertidos vs perdidos por ferramenta/sequência usada. Atualiza perfil_empresa.argumentos_ganhadores com efeito + intervalo de confiança.',
   'aprendizado', 'cron', 'cron-analise-causa-efeito', NULL, 20.00, '{perfil_empresa_no_prompt}', 'pausado', 80),

  ('auto_ajuste_pesos_gavetas',
   'Auto-ajuste dos pesos das gavetas',
   'Gavetas que funcionam ganham mais espaço no prompt automaticamente',
   'G10 — feedback loop fechado. Cada gaveta tem peso. Quando lead converte, gavetas usadas na resposta ganham +1; quando perde, -1. Pesos viram piso/top_n efetivos. RISCO: pode amplificar viés — desliga com 1 clique se piorar.',
   'aprendizado', 'feature_motor', NULL, NULL, 0.00, '{motor_le_config,gavetas_11_religadas}', 'pausado', 90),

  ('comparativo_nicho',
   'Comparativo do nicho',
   'Compara métricas anônimas do seu nicho com a média do mercado',
   'B5 — Cron mensal agrega métricas de ≥10 tenants do mesmo nicho com k-anonimato + ruído ε-DP. Publicado em comparativo_nicho. BLOQUEADO: depende de parecer LGPD aprovado e backfill profiles.nicho_id antes de ligar.',
   'cross_nicho', 'cron', 'cron-agregar-comparativo-nicho', NULL, 0.00, '{}', 'bloqueado', 100),

  ('detec_duplicatas_leads',
   'Detecção automática de leads duplicados',
   'Sistema sugere mesclar leads do mesmo número/nome similar',
   'B2 — Cron semanal escaneia leads via telefone normalizado + nome similar >70%. Cria propostas de merge na Curadoria. Você aprova/rejeita. V2 com LLM decidindo automaticamente fica pra depois.',
   'qualidade', 'cron', 'cron-detectar-leads-duplicados', NULL, 0.00, '{}', 'pausado', 110)
ON CONFLICT (chave_recurso) DO NOTHING;

-- Setar bloqueios
UPDATE public.recursos_ativacao_curadoria SET motivo_bloqueio = 'Parecer LGPD jurídico ainda não foi aprovado. Backfill profiles.nicho_id também pendente.'
WHERE chave_recurso = 'comparativo_nicho';
UPDATE public.recursos_ativacao_curadoria SET motivo_bloqueio = 'Depende de profiles.nicho_id preenchido (hoje 44/44 nulo) E parecer LGPD.'
WHERE chave_recurso = 'promocao_cross_nicho';

-- RPC ativar/pausar recurso
CREATE OR REPLACE FUNCTION public.ativar_recurso_curadoria(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_rec public.recursos_ativacao_curadoria;
  v_dep text;
  v_dep_ativo boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;
  SELECT * INTO v_rec FROM public.recursos_ativacao_curadoria WHERE chave_recurso = p_chave;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'recurso desconhecido'); END IF;
  IF v_rec.status = 'bloqueado' THEN 
    RETURN jsonb_build_object('ok', false, 'erro', 'recurso bloqueado', 'motivo', v_rec.motivo_bloqueio);
  END IF;
  -- Checar dependências
  FOREACH v_dep IN ARRAY v_rec.dependencias_chaves LOOP
    SELECT ativo INTO v_dep_ativo FROM public.recursos_ativacao_curadoria WHERE chave_recurso = v_dep;
    IF NOT v_dep_ativo THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'dependencia inativa', 'dependencia', v_dep);
    END IF;
  END LOOP;

  UPDATE public.recursos_ativacao_curadoria 
  SET status = 'ativo', ativo = true, atualizado_por = (SELECT auth.uid())
  WHERE chave_recurso = p_chave;

  RETURN jsonb_build_object('ok', true, 'msg', 'recurso ativado', 'aviso', 
    CASE WHEN v_rec.tipo = 'cron' THEN 'Cron pg_cron precisa ser agendado manualmente após esta ativação.'
         ELSE 'Ativação imediata.'
    END);
END;
$$;

CREATE OR REPLACE FUNCTION public.pausar_recurso_curadoria(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;
  UPDATE public.recursos_ativacao_curadoria 
  SET status = 'pausado', ativo = false, atualizado_por = (SELECT auth.uid())
  WHERE chave_recurso = p_chave AND status <> 'bloqueado';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'recurso bloqueado ou inexistente'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ativar_recurso_curadoria TO authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_recurso_curadoria TO authenticated;

-- Ativar de cara os recursos sem custo (já estão deployados)
UPDATE public.recursos_ativacao_curadoria 
SET status = 'ativo', ativo = true
WHERE chave_recurso IN ('motor_le_config', 'gavetas_11_religadas', 'memoria_objetivos_conversa', 'perfil_empresa_no_prompt');

;
