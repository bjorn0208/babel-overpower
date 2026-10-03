-- Primeiro aplicativo do catálogo: Textos.
-- Editor de arquivos visual estilo WordPress (design próprio). Grátis pra validar fluxo.

INSERT INTO public.loja_aplicativos (slug, nome, descricao, icone, categoria, preco_mensal, is_active, ordem)
VALUES (
  'textos',
  'Textos',
  'Editor visual de documentos. Escreva textos formatados e organize tudo num só lugar.',
  'fileText',
  'produtividade',
  NULL,
  true,
  1
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  icone = EXCLUDED.icone,
  categoria = EXCLUDED.categoria,
  is_active = EXCLUDED.is_active;

;
