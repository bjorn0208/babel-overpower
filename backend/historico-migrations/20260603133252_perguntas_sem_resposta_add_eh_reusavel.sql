ALTER TABLE public.perguntas_sem_resposta
  ADD COLUMN IF NOT EXISTS eh_reusavel boolean;

COMMENT ON COLUMN public.perguntas_sem_resposta.eh_reusavel IS
  'F3 2026-06-03: a resposta do dono serve a outros leads (true -> vira bloco) ou e especifica deste lead (false -> entregue, nao vira bloco). null = ainda nao avaliada / legado.';
;
