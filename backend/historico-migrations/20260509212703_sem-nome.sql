
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_authenticated_read" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_authenticated_write" ON realtime.messages;

CREATE POLICY "realtime_authenticated_read" ON realtime.messages
FOR SELECT TO authenticated, anon
USING (true);

CREATE POLICY "realtime_authenticated_write" ON realtime.messages
FOR INSERT TO authenticated, anon
WITH CHECK (true);

;
