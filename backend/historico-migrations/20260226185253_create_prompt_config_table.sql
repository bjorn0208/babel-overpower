
-- Tabela para armazenar prompts e mensagens do sistema
CREATE TABLE prompt_config (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE prompt_config ENABLE ROW LEVEL SECURITY;

-- Admin full CRUD
CREATE POLICY "admin_prompt_config" ON prompt_config
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Service role (edge functions)
CREATE POLICY "srv_prompt_config" ON prompt_config
  FOR SELECT USING (true);

-- Seed com valores atuais
INSERT INTO prompt_config (key, content, description) VALUES
(
  'regras_absolutas',
  '[REGRAS — OBRIGATORIAS]
1. Sua UNICA fonte de informacao e a secao [CONHECIMENTO]. Fora dela, voce NAO sabe NADA.
2. PROIBIDO inventar precos, valores, prazos, percentuais, condicoes de pagamento ou qualquer dado numerico. Se o [CONHECIMENTO] nao contem o dado, responda: "Vou verificar essa informacao e te retorno."
3. Se o cliente perguntar algo que NAO esta no [CONHECIMENTO], diga EXATAMENTE: "Nao tenho essa informacao agora, vou verificar e te retorno." Nunca invente, nunca deduza, nunca aproxime.
4. Se o conhecimento contiver "PROIBIDO usar" ou "PROIBIDO dizer" seguido de termos, voce JAMAIS deve usar esses termos. Repita apenas o que o conhecimento AFIRMA, nunca o que ele proibe.
5. ANTES de responder qualquer pergunta sobre preco/valor/parcela/desconto, VERIFIQUE se essa informacao existe LITERALMENTE no [CONHECIMENTO]. Se nao existe = "Vou verificar e te retorno."',
  'Regras obrigatorias do agente LLM'
),
(
  'formato_json',
  '[JSON — FORMATO OBRIGATORIO]
Responda APENAS com JSON valido neste formato:
{"mensagens":["sua resposta real aqui"],"dados_capturados":{},"resumo_atualizado":""}
IMPORTANTE: o array "mensagens" deve conter suas respostas REAIS ao cliente, NUNCA placeholders como "msg".
dados_capturados: use nomes em snake_case. So inclua campos que voce capturou nesta mensagem.',
  'Formato JSON obrigatorio da resposta do LLM'
),
(
  'msg_fallback',
  'Desculpe, tive um problema. Pode repetir?',
  'Mensagem quando LLM falha ou retorna vazio'
),
(
  'msg_rate_limit',
  'Rate limit excedido',
  'Erro quando rate limit atingido'
),
(
  'msg_plano_inativo',
  'Plano inativo ou expirado',
  'Erro quando plano do tenant esta inativo'
),
(
  'msg_limite_conversas',
  'Limite de conversas atingido',
  'Erro quando acabam as conversas do plano'
),
(
  'msg_fora_horario',
  'Estamos fora do horario de atendimento.',
  'Mensagem quando fora do horario configurado'
),
(
  'msg_transferido_humano',
  'Atendimento transferido para um humano.',
  'Mensagem quando agente desabilitado na conversa'
),
(
  'msg_espera',
  'Recebi sua mensagem. Vou te responder em breve.',
  'Mensagem durante bloco de espera'
),
(
  'msg_sem_agente',
  'Configure seu agente na aba Agente para comecar a usar.',
  'Frontend: usuario sem agente configurado'
),
(
  'msg_sem_plano',
  'Voce nao possui um plano ativo. Atualize o plano para eu poder responder.',
  'Frontend: usuario sem plano ativo'
),
(
  'msg_sem_conversas',
  'Suas conversas acabaram. Atualize o plano para eu poder responder.',
  'Frontend: conversas esgotadas'
),
(
  'msg_api_desativada',
  'API LLM desativada pelo administrador',
  'Erro quando provider LLM esta desativado'
),
(
  'msg_api_sem_key',
  'API key nao configurada',
  'Erro quando API key nao esta configurada'
);

;
