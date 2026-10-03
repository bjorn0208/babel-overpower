-- Adiciona flag de modelo padrão global em modelos_llm
ALTER TABLE public.modelos_llm
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Garante que existe no máximo um modelo marcado como padrão
CREATE UNIQUE INDEX IF NOT EXISTS modelos_llm_unico_padrao
  ON public.modelos_llm ((is_default))
  WHERE is_default = true;

-- RPC para o admin definir o modelo padrão de forma atômica
CREATE OR REPLACE FUNCTION public.definir_modelo_padrao(p_modelo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  UPDATE public.modelos_llm SET is_default = false WHERE is_default = true;
  UPDATE public.modelos_llm SET is_default = true, is_active = true WHERE id = p_modelo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_modelo_padrao(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.definir_modelo_padrao(uuid) TO authenticated;
;
