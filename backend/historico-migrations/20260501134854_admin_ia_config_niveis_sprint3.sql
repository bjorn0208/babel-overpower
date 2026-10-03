-- Sprint 3 · coluna niveis em admin_ia_config + default cravado

ALTER TABLE public.admin_ia_config
  ADD COLUMN IF NOT EXISTS niveis jsonb DEFAULT '[
    {
      "id": 1,
      "nome": "Padrão",
      "limite_iter": 10,
      "modelo_executor": "google/gemini-2.5-flash",
      "max_custo_usd": 0.10
    },
    {
      "id": 2,
      "nome": "Estendido",
      "limite_iter": 30,
      "modelo_executor": "google/gemini-2.5-flash",
      "max_custo_usd": 0.30,
      "requer_aprovacao": true
    },
    {
      "id": 3,
      "nome": "Profundo",
      "limite_iter": 100,
      "modelo_executor": "anthropic/claude-sonnet-4.5",
      "max_custo_usd": 1.50,
      "requer_aprovacao": true
    }
  ]'::jsonb;

COMMENT ON COLUMN public.admin_ia_config.niveis IS
  'Sprint 3 · níveis de pensamento prolongado configuráveis. Edge respeita limite_iter e pausa pedindo permissão antes de subir nível.';

-- Garante que a row singleton tem o default
UPDATE public.admin_ia_config
SET niveis = '[
  {"id": 1, "nome": "Padrão", "limite_iter": 10, "modelo_executor": "google/gemini-2.5-flash", "max_custo_usd": 0.10},
  {"id": 2, "nome": "Estendido", "limite_iter": 30, "modelo_executor": "google/gemini-2.5-flash", "max_custo_usd": 0.30, "requer_aprovacao": true},
  {"id": 3, "nome": "Profundo", "limite_iter": 100, "modelo_executor": "anthropic/claude-sonnet-4.5", "max_custo_usd": 1.50, "requer_aprovacao": true}
]'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000001' AND niveis IS NULL;
;
