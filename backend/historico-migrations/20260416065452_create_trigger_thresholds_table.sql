-- trigger_thresholds: cada ação tem score mínimo pra disparar via Cohere rerank.
-- Antes era hardcoded em retrieve-router.ts. Agora editável pelo platform_admin.
-- acao='_default' é o fallback pra ações não listadas (escalar_humano, opt_out_total, etc).

CREATE TABLE IF NOT EXISTS public.trigger_thresholds (
  acao text PRIMARY KEY,
  threshold numeric(4,3) NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
  descricao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.trigger_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_select_trigger_thresholds" ON public.trigger_thresholds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.system_role = 'platform_admin'
    )
  );

CREATE POLICY "platform_admin_all_trigger_thresholds" ON public.trigger_thresholds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.system_role = 'platform_admin'
    )
  );

-- Seed com valores atuais + novos pra fase-movement (mais permissivos).
INSERT INTO public.trigger_thresholds (acao, threshold, descricao) VALUES
  ('_default', 0.45, 'Fallback pra ações irreversíveis (escalar_humano, opt_out_total, marcar_desistencia)'),
  ('criar_scheduled_action_callback', 0.15, 'Lead pede retorno depois — "me chama amanhã"'),
  ('criar_scheduled_action_pagamento', 0.15, 'Lead agenda pagamento — "pago sexta"'),
  ('marca_recusa_baixa', 0.20, 'Sinal fraco de recusa/objeção'),
  ('aguardar_midia_ou_validar', 0.20, 'Lead diz que vai mandar comprovante'),
  ('buscar_knowledge_empresa_enviar', 0.25, 'Pergunta sobre empresa — força busca knowledge'),
  ('gerar_contrato', 0.35, 'Lead quer fechar — envia link do contrato'),
  ('mover_para_qualificacao', 0.15, 'Fase movement — reversível, permissivo'),
  ('mover_para_apresentacao', 0.15, 'Fase movement — reversível, permissivo'),
  ('mover_para_negociacao', 0.20, 'Fase movement — lead quer valor'),
  ('mover_para_fechado', 0.25, 'Fase movement — lead confirma fechamento'),
  ('marcar_cumprimentou', 0.15, 'Flag — lead já se apresentou'),
  ('marcar_produto_apresentado', 0.15, 'Flag — agente já explicou produto'),
  ('marcar_valores_apresentados', 0.15, 'Flag — agente já passou valores')
ON CONFLICT (acao) DO NOTHING;

COMMENT ON TABLE public.trigger_thresholds IS
'Score mínimo (Cohere rerank) pra cada ação trigger disparar. Editável via PromptViewer (platform_admin). Cache 30s no edge function.';
;
