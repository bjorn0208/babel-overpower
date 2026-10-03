CREATE OR REPLACE FUNCTION public.publico_obter_perfil(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid;
  v_profile jsonb;
  v_empresa jsonb;
  v_services jsonb;
  v_gallery jsonb;
  v_testimonials jsonb;
BEGIN
  SELECT pp.user_id INTO v_user_id
  FROM perfil_publico pp
  WHERE pp.slug = p_slug AND pp.is_active = true;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(pp) INTO v_profile
  FROM perfil_publico pp WHERE pp.user_id = v_user_id;

  SELECT jsonb_build_object(
    'nome', e.nome,
    'descricao', e.descricao,
    'endereco', e.endereco,
    'bairro', e.bairro,
    'cidade', e.cidade,
    'estado', e.estado,
    'cep', e.cep,
    'instagram', e.instagram,
    'facebook', e.facebook,
    'tiktok', e.tiktok,
    'whatsapp', e.whatsapp,
    'youtube', e.youtube,
    'site', e.site,
    'logo_url', e.logo_url,
    'banner_url', e.banner_url
  ) INTO v_empresa
  FROM empresas e WHERE e.user_id = v_user_id LIMIT 1;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id, 'nome', s.nome, 'descricao', s.descricao,
      'foto_url', s.foto_url, 'preco_text', s.preco_text, 'ordem', s.ordem
    ) ORDER BY s.ordem
  ), '[]'::jsonb) INTO v_services
  FROM servicos_publicos s WHERE s.user_id = v_user_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id, 'titulo', g.titulo, 'descricao', g.descricao,
      'foto_url', g.foto_url, 'ordem', g.ordem
    ) ORDER BY g.ordem
  ), '[]'::jsonb) INTO v_gallery
  FROM galeria_publica g WHERE g.user_id = v_user_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'autor_nome', t.autor_nome, 'autor_foto_url', t.autor_foto_url,
      'texto', t.texto, 'nota', t.nota, 'created_at', t.created_at
    ) ORDER BY t.created_at DESC
  ), '[]'::jsonb) INTO v_testimonials
  FROM depoimentos_publicos t
  WHERE t.user_id = v_user_id AND t.aprovado = true;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'empresa', v_empresa,
    'services', v_services,
    'gallery', v_gallery,
    'testimonials', v_testimonials,
    'user_id', v_user_id
  );
END;
$function$

