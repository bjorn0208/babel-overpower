
-- 1. channels: INSERT policy para usuarios autenticados
CREATE POLICY "user_insert_own_channel" ON channels
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    OR user_id = (SELECT parent_user_id FROM profiles WHERE id = auth.uid())
  );

-- 2. channels: UPDATE policy para usuarios autenticados
CREATE POLICY "user_update_own_channel" ON channels
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() 
    OR user_id = (SELECT parent_user_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() 
    OR user_id = (SELECT parent_user_id FROM profiles WHERE id = auth.uid())
  );

-- 3. conversations: DELETE policy para usuarios autenticados
CREATE POLICY "user_delete_own_conversations" ON conversations
  FOR DELETE TO authenticated
  USING (
    tenant_id = auth.uid()
    OR tenant_id IN (
      SELECT parent_user_id FROM profiles 
      WHERE id = auth.uid() AND parent_user_id IS NOT NULL
    )
  );

-- 4. messages: CASCADE DELETE quando conversa é deletada
ALTER TABLE messages DROP CONSTRAINT messages_conversation_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey 
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

;
