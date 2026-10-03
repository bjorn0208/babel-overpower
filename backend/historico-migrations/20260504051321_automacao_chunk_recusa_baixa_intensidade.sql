-- Migration: automacao_chunk_recusa_baixa_intensidade
-- Fase 2 do projeto RAG-FIRST automacoes temporais.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.automacao_chunks'::regclass
      AND conname = 'automacao_chunks_cenario_check'
  ) THEN
    ALTER TABLE public.automacao_chunks
      DROP CONSTRAINT automacao_chunks_cenario_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.automacao_chunks'::regclass
      AND conname = 'automacao_chunks_cenario_check'
  ) THEN
    ALTER TABLE public.automacao_chunks
      ADD CONSTRAINT automacao_chunks_cenario_check
      CHECK (cenario IN (
        'silencio_pos_fase',
        'nao_assinou_contrato',
        'nao_enviou_comprovante',
        'nao_respondeu_proposta',
        'despedida_sem_data',
        'recusa_baixa_intensidade',
        'qualquer'
      ));
  END IF;
END $$;

INSERT INTO public.automacao_chunks (
  nome, descricao, cenario, escopo, payload, condicao_extra, ativo
)
SELECT
  'retomada_recusa_branda',
  'Lead disse "agora não", "depois eu vejo" ou "vou pensar" — respeite a decisão sem insistir. Volte naturalmente em 7-15 dias dependendo do tom da recusa. Sem cobrança, sem pressão. Pergunte se algo mudou ou se ele quer que mande mais info.',
  'recusa_baixa_intensidade',
  'global',
  jsonb_build_object(
    'tom', 'respeitoso_paciente',
    'angulo', 'reabertura_leve_pos_recusa',
    'evitar', jsonb_build_array('"você prometeu"', 'cobrança', 'pressão', 'desconto reativo'),
    'assunto', 'se algo mudou desde nossa última conversa ou se quer ver mais info',
    'exemplos_abertura', jsonb_build_array(
      'oi! tudo bem?',
      'passando aqui só pra saber',
      'lembrei de você'
    )
  ),
  jsonb_build_object('janela_dias_min', 7, 'janela_dias_max', 15),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.automacao_chunks
  WHERE nome = 'retomada_recusa_branda'
    AND cenario = 'recusa_baixa_intensidade'
    AND escopo = 'global'
);
;
