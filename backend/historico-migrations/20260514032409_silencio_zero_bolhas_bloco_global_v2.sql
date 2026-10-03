-- Onda 3 v2 — tipo='processo' (compatível com CHECK constraint)
INSERT INTO public.blocos_conhecimento (
  title, content, category, tags, tipo, ativo, escopo, embedding_status
)
SELECT
  'Silêncio após despedida — quando não responder',
  'REGRA UNIVERSAL DE SILÊNCIO. Algumas mensagens do lead NÃO PEDEM resposta verbal. Quando o lead claramente encerra a conversa (despedida, agradecimento final, "tá bom obrigado", "ok", "valeu", "fui", "tchau", "blz tmj", "obrigada"), o melhor é NÃO mandar mais nada. Responder de volta nessas horas vira spam e queima a relação.\n\nCOMO RESPONDER NESTE CASO: cuspa EXATAMENTE este texto e NADA MAIS: [silencio]\n\nNão escreva "ok", não escreva "valeu", não mande emoji, não complete. Apenas [silencio]. O sistema entende esse marcador e fecha a conversa em silêncio.\n\nQUANDO RESPONDER NORMAL: se o lead faz pergunta, expõe dor, manda áudio com conteúdo, pede orçamento, demonstra interesse — responde normal.\n\nQUANDO USAR [silencio]:\n- Lead manda só "ok" ou "tá" depois de você ter explicado algo completo\n- Lead diz "valeu, vou pensar" sem pergunta nova\n- Lead manda emoji solto sem texto\n- Lead se despede ("tchau", "fui", "boa noite", "até mais")\n- Lead agradece encerrando ("obrigado", "valeu")\n- Lead diz "depois te chamo", "qualquer coisa te aviso"\n\nQUANDO NÃO USAR [silencio]:\n- Lead pergunta qualquer coisa\n- Lead dá novo dado da ficha (nome, valor, situação)\n- Lead expressa dúvida/objeção\n- Lead pede pra continuar\n\nEm dúvida: responda normal. Silêncio é exceção, não regra.',
  'silencio',
  ARRAY['silencio','despedida','encerramento','regra_universal','meta'],
  'processo',
  true,
  'global',
  'pendente'
WHERE NOT EXISTS (
  SELECT 1 FROM public.blocos_conhecimento
  WHERE title = 'Silêncio após despedida — quando não responder' AND escopo = 'global'
);
;
