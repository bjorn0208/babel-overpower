-- Mapeamento real das categorias (descobertas: produto/fluxo/empresa/atendimento/processo/identidade)
UPDATE public.knowledge_chunks SET tipo =
  CASE category
    WHEN 'produto' THEN 'pitch'
    WHEN 'empresa' THEN 'pitch'
    WHEN 'identidade' THEN 'pitch'
    WHEN 'fluxo' THEN 'processo'
    WHEN 'atendimento' THEN 'processo'
    WHEN 'processo' THEN 'processo'
    WHEN 'preco' THEN 'oferta'
    WHEN 'pagamento' THEN 'instrucao_pagamento'
    WHEN 'faq' THEN 'resposta_factual'
    WHEN 'objecao' THEN 'resposta_factual'
    WHEN 'conhecimento' THEN 'pitch'
    ELSE 'resposta_factual'
  END;
;
