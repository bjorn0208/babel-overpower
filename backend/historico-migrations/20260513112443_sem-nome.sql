ALTER TABLE public.branding_sistema
  ADD COLUMN IF NOT EXISTS mensagem_login_titulo text,
  ADD COLUMN IF NOT EXISTS mensagem_login_sub text,
  ADD COLUMN IF NOT EXISTS login_form_titulo text,
  ADD COLUMN IF NOT EXISTS login_form_subtitulo text,
  ADD COLUMN IF NOT EXISTS login_copyright text,
  ADD COLUMN IF NOT EXISTS login_features jsonb DEFAULT '[]'::jsonb;

UPDATE public.branding_sistema
SET
  mensagem_login_titulo = COALESCE(mensagem_login_titulo, 'O sistema operacional do seu atendimento.'),
  mensagem_login_sub    = COALESCE(mensagem_login_sub, 'Agentes IA, curadoria viva e governança — em uma única superfície.'),
  login_form_titulo     = COALESCE(login_form_titulo, 'Entre na sua conta'),
  login_form_subtitulo  = COALESCE(login_form_subtitulo, ''),
  login_copyright       = COALESCE(login_copyright, '© 2026 · todos os direitos reservados'),
  login_features        = COALESCE(login_features, '[
    {"icone":"bot",   "titulo":"Agentes IA 24/7", "subtitulo":"Atendem WhatsApp, qualificam e fecham."},
    {"icone":"brain", "titulo":"LLM-OS curado",   "subtitulo":"Você cura o cérebro em tempo real."},
    {"icone":"spark", "titulo":"Gen UI nativo",   "subtitulo":"A interface se gera com seus dados."}
  ]'::jsonb)
WHERE ativo = true;
;
