CREATE TABLE IF NOT EXISTS public.campaign_trigger_phase_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type text NOT NULL CHECK (campaign_type IN ('divulgacao','venda','pos_venda','cobranca','agendamento')),
  trigger_name text NOT NULL,
  target_phase text NOT NULL,
  target_state text NOT NULL DEFAULT 'ativo' CHECK (target_state IN ('ativo','fechado','desistente')),
  exit_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_type, trigger_name)
);

ALTER TABLE public.campaign_trigger_phase_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctpm_read_all" ON public.campaign_trigger_phase_map
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ctpm_type_trigger ON public.campaign_trigger_phase_map(campaign_type, trigger_name);

INSERT INTO public.campaign_trigger_phase_map (campaign_type, trigger_name, target_phase, target_state, exit_reason) VALUES
  ('divulgacao', 'aceitou_proposta', 'engajou', 'fechado', 'convertido'),
  ('divulgacao', 'opt_out_total', 'aguardando', 'desistente', 'opt_out'),
  ('divulgacao', 'marcar_desistencia', 'aguardando', 'desistente', 'recusa'),
  ('divulgacao', 'marca_recusa_baixa', 'aguardando', 'desistente', 'recusa'),
  ('venda', 'mover_para_negociacao', 'interessado', 'ativo', NULL),
  ('venda', 'aceitou_proposta', 'comprou', 'fechado', 'convertido'),
  ('venda', 'gerar_contrato', 'comprou', 'fechado', 'convertido'),
  ('venda', 'opt_out_total', 'aguardando', 'desistente', 'opt_out'),
  ('venda', 'marcar_desistencia', 'aguardando', 'desistente', 'recusa'),
  ('venda', 'marca_recusa_baixa', 'aguardando', 'desistente', 'recusa'),
  ('pos_venda', 'aceitou_proposta', 'recomprou', 'fechado', 'convertido'),
  ('pos_venda', 'opt_out_total', 'aguardando', 'desistente', 'opt_out'),
  ('pos_venda', 'marcar_desistencia', 'aguardando', 'desistente', 'recusa'),
  ('pos_venda', 'marca_recusa_baixa', 'aguardando', 'desistente', 'recusa'),
  ('cobranca', 'aguardar_midia_ou_validar', 'negociando', 'ativo', NULL),
  ('cobranca', 'criar_scheduled_action_pagamento', 'negociando', 'ativo', NULL),
  ('cobranca', 'aceitou_proposta', 'pagou', 'fechado', 'convertido'),
  ('cobranca', 'opt_out_total', 'aguardando', 'desistente', 'opt_out'),
  ('agendamento', 'criar_scheduled_action_callback', 'negociando_horario', 'ativo', NULL),
  ('agendamento', 'aceitou_proposta', 'agendado', 'fechado', 'convertido'),
  ('agendamento', 'opt_out_total', 'aguardando', 'desistente', 'opt_out'),
  ('agendamento', 'marcar_desistencia', 'aguardando', 'desistente', 'recusa')
ON CONFLICT (campaign_type, trigger_name) DO NOTHING;
;
