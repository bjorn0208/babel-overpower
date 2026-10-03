UPDATE public.modelos_llm SET is_default = false WHERE is_default = true;
UPDATE public.modelos_llm SET is_default = true WHERE id = 'ec7341d6-46eb-4209-82a2-75bb6c9e4ec4';
;
