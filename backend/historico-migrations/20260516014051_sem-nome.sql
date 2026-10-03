CREATE POLICY user_insert_own_leads ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT auth.uid())
  OR tenant_id IN (
    SELECT profiles.parent_user_id FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.parent_user_id IS NOT NULL
  )
);
;
