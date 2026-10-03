
-- Migration 14 — CHECK duplo (aceita EN+PT) — etapa segura sem UPDATE de dados ainda
-- Permite que edges/frontend continuem escrevendo EN durante janela de transição

-- 1. campanhas
ALTER TABLE public.campanhas DROP CONSTRAINT IF EXISTS campanhas_status_check;
ALTER TABLE public.campanhas ADD CONSTRAINT campanhas_status_check
  CHECK (status = ANY (ARRAY[
    'draft','active','paused','finished',
    'rascunho','ativa','pausada','finalizada'
  ]));

-- 2. assinaturas_usuario
ALTER TABLE public.assinaturas_usuario DROP CONSTRAINT IF EXISTS assinaturas_usuario_status_check;
ALTER TABLE public.assinaturas_usuario ADD CONSTRAINT assinaturas_usuario_status_check
  CHECK (status = ANY (ARRAY[
    'active','expired','cancelled','suspended',
    'ativa','expirada','cancelada','suspensa'
  ]));

-- 3. caixa_saida_mensagens
ALTER TABLE public.caixa_saida_mensagens DROP CONSTRAINT IF EXISTS caixa_saida_mensagens_status_check;
ALTER TABLE public.caixa_saida_mensagens ADD CONSTRAINT caixa_saida_mensagens_status_check
  CHECK (status = ANY (ARRAY[
    'pending','processing','sent','failed','superseded',
    'pendente','processando','enviada','falhou','substituida'
  ]));

-- 4. candidatos_bloco
ALTER TABLE public.candidatos_bloco DROP CONSTRAINT IF EXISTS candidatos_bloco_status_check;
ALTER TABLE public.candidatos_bloco ADD CONSTRAINT candidatos_bloco_status_check
  CHECK (status = ANY (ARRAY[
    'pending','approved','rejected','promoted',
    'pendente','aprovado','rejeitado','promovido'
  ]));

-- 5. candidatos_tag
ALTER TABLE public.candidatos_tag DROP CONSTRAINT IF EXISTS candidatos_tag_status_check;
ALTER TABLE public.candidatos_tag ADD CONSTRAINT candidatos_tag_status_check
  CHECK (status = ANY (ARRAY[
    'pending','approved','rejected','promoted',
    'pendente','aprovado','rejeitado','promovido'
  ]));

-- 6. sugestoes_fusao_tag
ALTER TABLE public.sugestoes_fusao_tag DROP CONSTRAINT IF EXISTS sugestoes_fusao_tag_status_check;
ALTER TABLE public.sugestoes_fusao_tag ADD CONSTRAINT sugestoes_fusao_tag_status_check
  CHECK (status = ANY (ARRAY[
    'pending','approved','rejected',
    'pendente','aprovado','rejeitado'
  ]));

-- 7. BUG FIX — candidatos_bloco.promoted_bloco_table referencia tabelas MORTAS no CHECK
ALTER TABLE public.candidatos_bloco DROP CONSTRAINT IF EXISTS chunk_candidates_promoted_chunk_table_check;
ALTER TABLE public.candidatos_bloco ADD CONSTRAINT candidatos_bloco_promoted_table_check
  CHECK (
    promoted_bloco_table IS NULL 
    OR promoted_bloco_table = ANY (ARRAY[
      'blocos_conhecimento','blocos_comportamento','blocos_gatilho',
      'blocos_humanizacao','blocos_variacao','blocos_meta',
      'knowledge_chunks','behavior_chunks','trigger_chunks',
      'human_chunks','variation_chunks','meta_chunks'
    ])
  );

-- 8. contratos.payment_position (before_sign/after_sign) — adiciona PT
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contracts_payment_position_check;
ALTER TABLE public.contratos ADD CONSTRAINT contratos_payment_position_check
  CHECK (
    payment_position IS NULL
    OR payment_position = ANY (ARRAY[
      'before_sign','after_sign',
      'antes_assinatura','depois_assinatura'
    ])
  );

;
