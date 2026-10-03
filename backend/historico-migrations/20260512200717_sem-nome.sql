UPDATE public.branding_sistema b
   SET logo_url     = COALESCE(b.logo_url,     (SELECT logo_url FROM public.config_plataforma LIMIT 1)),
       favicon_url  = COALESCE(b.favicon_url,  (SELECT favicon_url FROM public.config_plataforma LIMIT 1)),
       atualizado_em = now()
 WHERE ativo = true;
;
