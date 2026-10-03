
-- ============================================================
-- MIGRATION: Proteção completa anti-alucinação + novos padrões
-- ============================================================

-- 1. Tabela verification_responses (respostas humanizadas)
CREATE TABLE IF NOT EXISTS verification_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL UNIQUE,
  response_formal TEXT NOT NULL,
  response_informal TEXT NOT NULL,
  follow_up_formal TEXT,
  follow_up_informal TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE verification_responses IS 'Respostas humanizadas para substituir alucinacoes detectadas.';

ALTER TABLE verification_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verification_responses_select" ON verification_responses
  FOR SELECT TO authenticated USING (true);

-- Seed: respostas humanizadas por tipo de alucinação
INSERT INTO verification_responses (trigger_type, response_formal, response_informal, follow_up_formal, follow_up_informal) VALUES
  ('price_hallucination',
   'Deixe-me verificar essa informacao de preco para voce. Posso te passar os valores corretos em instantes.',
   'Opa, deixa eu confirmar isso direitinho! Nao quero te passar um valor errado.',
   'Para informacoes precisas de valores, recomendo entrar em contato com nossa equipe.',
   'Melhor confirmar com a equipe pra te dar o preco certinho!'),
  ('product_hallucination',
   'Deixe-me verificar a disponibilidade e detalhes desse servico para voce.',
   'Hmm, deixa eu checar isso pra voce! Quero ter certeza antes de confirmar.',
   'Nosso time pode te dar mais detalhes sobre esse servico.',
   'Fala com a equipe que eles te explicam tudinho!'),
  ('info_hallucination',
   'Deixe-me confirmar essa informacao para garantir que esta correta.',
   'Epa, deixa eu verificar isso antes de te falar! Nao quero passar informacao errada.',
   'Para informacoes mais detalhadas, nossa equipe pode ajudar.',
   'Melhor checar com a equipe pra te dar a info certinha!'),
  ('general_uncertainty',
   'Para garantir que vou te dar a informacao correta, vou verificar isso com mais cuidado.',
   'Hmm, essa eu preciso verificar melhor pra nao te falar besteira!',
   'Recomendo entrar em contato com nossa equipe para informacoes mais detalhadas.',
   'Fala com a equipe que eles vao saber te ajudar melhor nisso!');

-- 2. Novos padrões de segurança INPUT (mais proteções)
INSERT INTO security_patterns (name, category, direction, detection_rules, action_on_match, severity, response_message) VALUES
  -- Abuso/linguagem ofensiva
  ('Abuso - Linguagem Ofensiva', 'abuse', 'input',
   '{"keywords": ["idiota", "burro", "inutil", "lixo", "merda", "porra", "caralho", "vtnc", "vai se foder", "fdp"], "case_sensitive": false}'::jsonb,
   'flag', 'medium',
   'Entendo que voce pode estar frustrado. Estou aqui para ajudar! Como posso te auxiliar?'),

  -- Spam repetitivo
  ('Spam - Mensagens Repetitivas', 'spam', 'input',
   '{"keywords": ["oi oi oi", "responde responde", "alo alo alo", "oiiiiii", "????", "!!!!!"], "case_sensitive": false}'::jsonb,
   'flag', 'low',
   'Estou aqui! Como posso te ajudar?'),

  -- SQL Injection
  ('SQL Injection', 'data_extraction', 'input',
   '{"keywords": ["select * from", "drop table", "union select", "1=1", "or 1=1", "delete from", "insert into", "update set"], "case_sensitive": false}'::jsonb,
   'block', 'critical',
   'Desculpe, nao entendi sua solicitacao. Pode reformular?'),

  -- XSS
  ('XSS Injection', 'data_extraction', 'input',
   '{"keywords": ["<script>", "javascript:", "onerror=", "onload=", "eval(", "document.cookie"], "case_sensitive": false}'::jsonb,
   'block', 'critical',
   'Desculpe, nao entendi sua solicitacao. Pode reformular?'),

  -- Extração de credenciais
  ('Extracao de Credenciais', 'data_extraction', 'input',
   '{"keywords": ["api key", "access token", "secret key", "private key", "jwt token", "bearer token", "service role", "supabase key"], "case_sensitive": false}'::jsonb,
   'block', 'critical',
   'Informacoes de seguranca sao confidenciais e nao podem ser compartilhadas.'),

  -- Manipulação comercial
  ('Manipulacao Comercial', 'commercial_manipulation', 'input',
   '{"keywords": ["100% de desconto", "gratis total", "zera minha divida", "apaga meu nome", "limpa de graca", "sem pagar nada"], "case_sensitive": false}'::jsonb,
   'flag', 'low',
   'Nao tenho autoridade para oferecer descontos ou servicos gratuitos. Posso explicar nossos planos e servicos!');

-- 3. Mudar os padrões de OUTPUT hallucination de flag para block
UPDATE security_patterns 
SET action_on_match = 'block',
    response_message = 'Preciso verificar essa informacao com mais cuidado antes de confirmar. Entre em contato com nossa equipe para detalhes precisos.'
WHERE category = 'hallucination' 
  AND direction = 'output';

-- 4. Mudar "Manipulation - Sensitive Data" de flag para block
UPDATE security_patterns
SET action_on_match = 'block',
    response_message = 'Informacoes sensiveis como senhas e chaves de API nao podem ser compartilhadas por aqui. Posso ajudar com outra coisa?'
WHERE name = 'Manipulation - Sensitive Data Request';

;
