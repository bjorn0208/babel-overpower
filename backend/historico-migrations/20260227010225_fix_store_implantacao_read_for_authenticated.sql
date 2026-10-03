-- Authenticated (non-admin) users need to read active implantacao
-- for the registration page (/cadastro?ref=...) and store page
CREATE POLICY "user_read_active_implantacao"
  ON store_implantacao FOR SELECT
  TO authenticated
  USING (is_active = true);
;
