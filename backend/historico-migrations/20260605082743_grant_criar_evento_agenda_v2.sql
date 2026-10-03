REVOKE ALL ON FUNCTION public.criar_evento_agenda(text, timestamptz, text, timestamptz, text, boolean, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_evento_agenda(text, timestamptz, text, timestamptz, text, boolean, text, jsonb, boolean) TO authenticated;
;
