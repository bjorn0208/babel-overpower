ALTER TABLE public.produtos
  DROP COLUMN IF EXISTS preco,
  DROP COLUMN IF EXISTS descricao,
  DROP COLUMN IF EXISTS valor_entrada,
  DROP COLUMN IF EXISTS num_parcelas,
  DROP COLUMN IF EXISTS valor_parcela,
  DROP COLUMN IF EXISTS max_parcelas_sem_juros,
  DROP COLUMN IF EXISTS max_parcelas_com_juros,
  DROP COLUMN IF EXISTS parcelas_juros_a_partir,
  DROP COLUMN IF EXISTS taxa_juros,
  DROP COLUMN IF EXISTS pagamento_a_vista,
  DROP COLUMN IF EXISTS pagamento_parcelado,
  DROP COLUMN IF EXISTS chave_pix,
  DROP COLUMN IF EXISTS link_pagamento,
  DROP COLUMN IF EXISTS criterios_qualificacao;
;
