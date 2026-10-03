alter table public.rifas_config_tenant
  add column if not exists bom_dia_mensagem_saudacao text,
  add column if not exists bom_dia_mensagem_followup text,
  add column if not exists bom_dia_midia_saudacao_url text,
  add column if not exists bom_dia_midia_followup_url text;

;
