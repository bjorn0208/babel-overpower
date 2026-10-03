-- Onda 4 (2026-05-14): Handoff explícito 3 tools (Companion 12)
-- LLM chama explicitamente quando precisa trocar de cargo em fluxos críticos (jurídico/financeiro/pós-venda).
-- Princípio Companion 12: explícito onde tem dinheiro, implícito onde não tem.

INSERT INTO public.ferramentas_dinamicas (
  nome_tool, descricao, endpoint_url, metodo, schema_zod,
  escopo, dominio_allowlist, precisa_aprovacao, ativo, tenant_id
)
SELECT v.nome, v.descricao, v.endpoint, 'POST',
  jsonb_build_object(
    'type','object',
    'properties', jsonb_build_object(
      'motivo', jsonb_build_object('type','string','description','Motivo curto da transferência (opcional). Ex: "lead aceitou proposta, vai assinar contrato"')
    )
  ),
  'global'::escopo_ragentic, 'internal', false, true, NULL
FROM (VALUES
  ('enviar_para_juridico',
   'Transfere a conversa pro cargo Jurídico do tenant. Use SOMENTE quando lead aceitou proposta e vai assinar contrato (não use pra dúvidas jurídicas gerais). Atualiza cargo_ativo_id e registra trace de auditoria.',
   'internal://enviar_para_juridico'),
  ('enviar_para_financeiro',
   'Transfere a conversa pro cargo Financeiro do tenant. Use quando: lead vai pagar, mandou comprovante, atrasou pagamento, ou tem dúvida sobre boleto/PIX/parcela. Atualiza cargo_ativo_id e registra trace de auditoria.',
   'internal://enviar_para_financeiro'),
  ('enviar_para_pos_venda',
   'Transfere a conversa pro cargo Pós-venda (Suporte) do tenant. Use após contrato assinado + pagamento confirmado, quando lead precisa de acompanhamento, dúvida operacional, garantia ou reclamação. Atualiza cargo_ativo_id e registra trace de auditoria.',
   'internal://enviar_para_pos_venda')
) AS v(nome, descricao, endpoint)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ferramentas_dinamicas f WHERE f.nome_tool = v.nome
);

-- Vincula handoff aos cargos que originam (atendimento + vendedor + mentor).
INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
SELECT c.id, f.id, false, 10
FROM public.cargos c
CROSS JOIN public.ferramentas_dinamicas f
WHERE f.nome_tool IN ('enviar_para_juridico','enviar_para_financeiro','enviar_para_pos_venda')
  AND c.ativo = true
  AND c.tipologia IN ('atendimento','face_cliente','mentor')
  AND NOT EXISTS (
    SELECT 1 FROM public.cargo_ferramentas cf
    WHERE cf.cargo_id = c.id AND cf.ferramenta_id = f.id
  );
;
