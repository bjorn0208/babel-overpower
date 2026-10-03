-- Disparo manual por números digitados (Mentor de Disparo) — botão próprio,
-- independente de lista/critério. Números podem não corresponder a lead
-- nenhum na base (mesmo padrão do app Rifas: rifa_lista_disparo aceita
-- contato solto). Guardamos telefone+nome direto no disparo em vez de criar
-- lead fantasma — envio via processar-disparos-lead loga em
-- disparos_lead_envios com lead_id NULL (coluna já era nullable).

ALTER TABLE public.disparos_lead
  ADD COLUMN IF NOT EXISTS contatos_manuais jsonb;

COMMENT ON COLUMN public.disparos_lead.contatos_manuais IS
  'Array [{telefone, nome}] pra disparo manual por número digitado — alternativa a contatos_ids (leads) e lista_disparo_id (critério). Não gera lead novo.';

;
