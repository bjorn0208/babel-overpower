CREATE TABLE IF NOT EXISTS public.variation_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_variation text NOT NULL UNIQUE,
  instrucao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.variation_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_variation" ON public.variation_chunks;
CREATE POLICY "auth_read_variation" ON public.variation_chunks
  FOR SELECT TO authenticated USING (ativo = true);

DROP POLICY IF EXISTS "service_role_all_variation" ON public.variation_chunks;
CREATE POLICY "service_role_all_variation" ON public.variation_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.variation_chunks (nome_variation, instrucao) VALUES
  ('mesma_abertura', 'Você já abriu turnos anteriores com mesma palavra/expressão. Comece diferente: pergunta direta, conector "Então...", ou ir direto ao ponto.'),
  ('mesma_estrutura', 'Você já usou essa estrutura (validação→argumento→pergunta) recentemente. Inverta: pergunta primeiro, depois explique.'),
  ('mesmo_argumento_central', 'Você já usou esse argumento 2 vezes recentes. Outros ângulos: tempo, prova social, comparação com não-fazer-nada, conquista futura.'),
  ('mesma_chamada_acao', 'Você já fez a mesma chamada de ação. Varia: "que tal começarmos por...", "topa eu mandar?", "faz sentido?", "topo isso?"'),
  ('mesmo_topico_geral', 'Você já abordou esse tópico nas últimas mensagens. Recue, mude de assunto, ou devolva controle pro lead.')
ON CONFLICT (nome_variation) DO NOTHING;
;
