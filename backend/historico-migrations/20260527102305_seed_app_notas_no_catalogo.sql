-- Segundo app do catálogo: Notas.
-- Recursos: data/hora, checks, post-it físico no Desktop, concluir/arquivar.

INSERT INTO public.loja_aplicativos (slug, nome, descricao, icone, categoria, preco_mensal, is_active, ordem)
VALUES (
  'notas',
  'Notas',
  'Notas rápidas com data, checks e post-its físicos que você crava no Desktop.',
  'note',
  'produtividade',
  NULL,
  true,
  2
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  icone = EXCLUDED.icone,
  categoria = EXCLUDED.categoria,
  is_active = EXCLUDED.is_active,
  ordem = EXCLUDED.ordem;

;
