CREATE INDEX idx_profiles_referred_by ON public.profiles USING btree (referred_by) WHERE (referred_by IS NOT NULL);
;
