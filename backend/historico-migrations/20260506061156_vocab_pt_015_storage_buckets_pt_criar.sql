
-- Migration 15 — Criar buckets PT (sem deletar velhos)
-- Janela 365 dias até drop dos velhos. Frontend gradualmente usa novos via helper fallback.

DO $$
DECLARE
  pair JSONB;
  v_velho TEXT;
  v_novo TEXT;
  v_bucket RECORD;
  v_count INT := 0;
  mapeamento JSONB := '[
    ["agent-files","arquivos-agente"],
    ["attachments","anexos"],
    ["chat-attachments","anexos-chat"],
    ["client-documents","documentos-cliente"],
    ["contract-signatures","assinaturas-contrato"],
    ["notification-sounds","sons-notificacao"],
    ["payment-proofs","comprovantes-pagamento"],
    ["profile-photos","fotos-perfil"],
    ["admin-ia-uploads","admin-ia-arquivos"],
    ["indicacao-assets","arquivos-indicacao"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_velho := pair->>0;
    v_novo := pair->>1;
    
    -- Skip se novo já existe
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE name = v_novo) THEN
      CONTINUE;
    END IF;
    
    -- Pegar config do velho
    SELECT * INTO v_bucket FROM storage.buckets WHERE name = v_velho;
    
    IF FOUND THEN
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, owner_id, created_at, updated_at)
      VALUES (
        v_novo,
        v_novo,
        v_bucket.public,
        v_bucket.file_size_limit,
        v_bucket.allowed_mime_types,
        v_bucket.owner_id,
        now(),
        now()
      );
      v_count := v_count + 1;
      RAISE NOTICE 'Bucket criado: % (espelho de %)', v_novo, v_velho;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total buckets PT criados: %', v_count;
END $$;

;
