-- Onda 5 (2026-05-14): Vendedor 4 fases (Companion 12) — seed 3 tools
-- gerenciar_carrinho · funil_de_vendas · marcar_contrato_assinado

INSERT INTO public.ferramentas_dinamicas (
  nome_tool, descricao, endpoint_url, metodo, schema_zod,
  escopo, dominio_allowlist, precisa_aprovacao, ativo, tenant_id
)
SELECT v.nome, v.descricao, v.endpoint, 'POST', v.schema::jsonb,
  'global'::escopo_ragentic, 'internal', false, true, NULL
FROM (VALUES
  ('gerenciar_carrinho',
   'Adiciona/remove/lista produtos no carrinho da conversa. Use quando lead está fechando compra: acao=adicionar (precisa produto_id + quantidade) | remover (produto_id) | listar. Lê do catálogo público.produtos do tenant. Soft-check duplicata.',
   'internal://gerenciar_carrinho',
   '{"type":"object","required":["acao"],"properties":{"acao":{"type":"string","enum":["adicionar","remover","listar"]},"produto_id":{"type":"string","description":"UUID do produto"},"quantidade":{"type":"integer","minimum":1,"default":1}}}'),
  ('funil_de_vendas',
   'Mostra funil de vendas dos últimos N dias (interesse → negociação → proposto → ganho). Tool UI: renderiza componente glassmorphism com KPIs por produto. Use quando dono pede análise comercial.',
   'internal://funil_de_vendas',
   '{"type":"object","properties":{"dias":{"type":"integer","default":30,"minimum":1,"maximum":365}}}'),
  ('marcar_contrato_assinado',
   'Marca contrato como assinado. UPDATE contratos.status=''assinado''. Use após confirmação visual do lead. Idempotente (não falha se já assinado).',
   'internal://marcar_contrato_assinado',
   '{"type":"object","required":["contrato_id"],"properties":{"contrato_id":{"type":"string","description":"UUID do contrato"}}}')
) AS v(nome, descricao, endpoint, schema)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ferramentas_dinamicas f WHERE f.nome_tool = v.nome
);

-- Vincula as 3 tools aos cargos face_cliente + mentor + atendimento (vendedor, financeiro, gerente, etc).
INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
SELECT c.id, f.id, false, 20
FROM public.cargos c
CROSS JOIN public.ferramentas_dinamicas f
WHERE f.nome_tool IN ('gerenciar_carrinho','funil_de_vendas','marcar_contrato_assinado')
  AND c.ativo = true
  AND c.tipologia IN ('atendimento','face_cliente','mentor')
  AND NOT EXISTS (
    SELECT 1 FROM public.cargo_ferramentas cf
    WHERE cf.cargo_id = c.id AND cf.ferramenta_id = f.id
  );
;
