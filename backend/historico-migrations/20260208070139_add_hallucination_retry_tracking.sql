
-- Adicionar campo para rastrear alucinações consecutivas no lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consecutive_hallucinations INTEGER NOT NULL DEFAULT 0;

-- Atualizar verification_responses com respostas mais naturais (tipo "repete pra mim")
UPDATE verification_responses SET
  response_informal = 'Hmm, me repete isso de outra forma pra eu ter certeza que entendi direito? Quero te passar a informacao certinha!',
  follow_up_informal = NULL
WHERE trigger_type = 'price_hallucination';

UPDATE verification_responses SET
  response_informal = 'Desculpa, acho que nao entendi bem. Pode me explicar de novo o que voce precisa? Quero te ajudar direitinho!',
  follow_up_informal = NULL
WHERE trigger_type = 'product_hallucination';

UPDATE verification_responses SET
  response_informal = 'Hmm, me fala de novo pra eu ter certeza que entendi? E que quero trazer a informacao certa pra voce!',
  follow_up_informal = NULL
WHERE trigger_type = 'info_hallucination';

UPDATE verification_responses SET
  response_informal = 'Pode me repetir isso de outra forma? Quero ter certeza que vou te responder certinho!',
  follow_up_informal = NULL
WHERE trigger_type = 'general_uncertainty';

;
