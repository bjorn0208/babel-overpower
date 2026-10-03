-- Adiciona coluna regras_livres pra cargos (texto longo que entra no system prompt do cargo)
ALTER TABLE public.cargos
ADD COLUMN IF NOT EXISTS regras_livres TEXT NULL;

COMMENT ON COLUMN public.cargos.regras_livres IS
  'Texto livre cravado pelo dono do agente que entra no system prompt da síntese. Ex: FLUXO CRAVADO de 5 fases, proibições absolutas, gatilhos de interrupção. NULL = sem regras extras.';

-- campos_rastreio: jsonb já aceita formato {chave,descricao,obrigatorio} — sem ALTER necessário.
-- Comentário documentando o formato esperado.
COMMENT ON COLUMN public.cargos.campos_rastreio IS
  'Array jsonb de objetos no formato [{"chave":"nome_lead","descricao":"...","obrigatorio":true}, ...]. Cada item é um campo que o agente desse cargo rastreia na Prancheta do lead.';
;
