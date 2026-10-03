
-- ============================================================
-- 012 CAPTURE_TYPE_DEFINITIONS
-- ============================================================

CREATE TABLE capture_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  extraction_rules JSONB NOT NULL,
  validation_rules JSONB NOT NULL,
  confirmation_template TEXT NOT NULL,
  error_messages JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE capture_type_definitions IS 'Tipos de captura com 3 portoes: extracao, validacao, confirmacao.';

INSERT INTO capture_type_definitions (type_slug, name, description, extraction_rules, validation_rules, confirmation_template, error_messages) VALUES
  ('full_name', 'Nome Completo', 'Captura nome completo (minimo 2 palavras)',
    '{"min_words": 2, "max_words": 6, "regex": "^[A-Za-zÀ-ÿ\\s]+$"}'::jsonb,
    '{"min_length": 5, "max_length": 100}'::jsonb,
    'Seu nome e {value}, correto?',
    '{"extraction_failed": "Nao consegui entender seu nome. Pode digitar seu nome completo?", "validation_failed": "O nome parece incompleto. Pode digitar nome e sobrenome?"}'::jsonb),
  ('phone', 'Telefone', 'Captura telefone brasileiro',
    '{"regex": "\\(?\\d{2}\\)?\\s?\\d{4,5}[-\\s]?\\d{4}", "normalize": "only_digits", "add_country_code": true}'::jsonb,
    '{"min_digits": 10, "max_digits": 13}'::jsonb,
    'Seu telefone e {value}, correto?',
    '{"extraction_failed": "Nao encontrei um numero de telefone. Pode digitar com DDD?", "validation_failed": "Numero invalido. Digite com DDD, ex: (11) 99999-0000"}'::jsonb),
  ('email', 'Email', 'Captura endereco de email',
    '{"regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"}'::jsonb,
    '{"check_format": true}'::jsonb,
    'Seu email e {value}, correto?',
    '{"extraction_failed": "Nao encontrei um email. Pode digitar novamente?", "validation_failed": "Email invalido. Verifique e tente novamente."}'::jsonb),
  ('cpf', 'CPF', 'Captura e valida CPF brasileiro',
    '{"regex": "\\d{3}\\.?\\d{3}\\.?\\d{3}[-.]?\\d{2}", "normalize": "only_digits"}'::jsonb,
    '{"exact_digits": 11, "check_verifier_digits": true}'::jsonb,
    'Seu CPF e {value}, correto?',
    '{"extraction_failed": "Nao encontrei um CPF. Pode digitar os 11 digitos?", "validation_failed": "CPF invalido. Verifique os numeros e tente novamente."}'::jsonb),
  ('cnpj', 'CNPJ', 'Captura e valida CNPJ brasileiro',
    '{"regex": "\\d{2}\\.?\\d{3}\\.?\\d{3}/?\\d{4}[-.]?\\d{2}", "normalize": "only_digits"}'::jsonb,
    '{"exact_digits": 14, "check_verifier_digits": true}'::jsonb,
    'Seu CNPJ e {value}, correto?',
    '{"extraction_failed": "Nao encontrei um CNPJ. Pode digitar os 14 digitos?", "validation_failed": "CNPJ invalido. Verifique os numeros."}'::jsonb),
  ('birthdate', 'Data de Nascimento', 'Captura data no formato brasileiro',
    '{"regex": "\\d{2}[/.-]\\d{2}[/.-]\\d{4}", "format": "DD/MM/YYYY"}'::jsonb,
    '{"min_age": 0, "max_age": 120}'::jsonb,
    'Sua data de nascimento e {value}, correto?',
    '{"extraction_failed": "Nao entendi a data. Use o formato DD/MM/AAAA.", "validation_failed": "Data invalida. Verifique dia, mes e ano."}'::jsonb),
  ('address', 'Endereco', 'Captura endereco completo',
    '{"min_words": 3}'::jsonb,
    '{"min_length": 10}'::jsonb,
    'Seu endereco e {value}, correto?',
    '{"extraction_failed": "Pode informar seu endereco completo? (rua, numero, bairro, cidade)", "validation_failed": "Endereco parece incompleto."}'::jsonb),
  ('monetary_value', 'Valor Monetario', 'Captura valor em reais',
    '{"regex": "R?\\$?\\s?\\d{1,3}(\\.\\d{3})*(,\\d{2})?", "normalize": "decimal"}'::jsonb,
    '{"min_value": 0}'::jsonb,
    'O valor e R$ {value}, correto?',
    '{"extraction_failed": "Nao encontrei um valor. Pode digitar? Ex: R$ 150,00", "validation_failed": "Valor invalido."}'::jsonb),
  ('free_text', 'Texto Livre', 'Captura qualquer texto',
    '{"min_length": 1}'::jsonb,
    '{"max_length": 2000}'::jsonb,
    '{value} — correto?',
    '{"extraction_failed": "Pode digitar novamente?", "validation_failed": "Texto muito longo."}'::jsonb),
  ('choice', 'Escolha', 'Captura opcao entre alternativas pre-definidas',
    '{"match_type": "fuzzy", "options_from_config": true}'::jsonb,
    '{"must_match_option": true}'::jsonb,
    'Voce escolheu {value}, correto?',
    '{"extraction_failed": "Nao entendi sua escolha. Selecione uma das opcoes.", "validation_failed": "Opcao invalida."}'::jsonb);

;
