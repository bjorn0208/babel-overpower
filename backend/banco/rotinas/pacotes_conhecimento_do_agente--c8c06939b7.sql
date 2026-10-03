CREATE OR REPLACE FUNCTION public.pacotes_conhecimento_do_agente(p_agente_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH ligados AS (
    SELECT pc.id, pc.nome, pc.ordem
    FROM public.pacotes_conhecimento_ativacao pa
    JOIN public.pacotes_conhecimento pc ON pc.id = pa.pacote_id
    WHERE pa.agente_id = p_agente_id
      AND pa.ligado = true
      AND public.pacote_liberado_para_tenant(pc.id, pa.tenant_id)
  )
  SELECT jsonb_build_object(
    'pacotes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome) ORDER BY l.ordem, l.nome) FROM ligados l), '[]'::jsonb),
    -- o motor só gasta embedding na busca por relevância se houver bloco desse modo
    'tem_relevancia', EXISTS (
      SELECT 1 FROM ligados l JOIN public.pacotes_conhecimento_blocos b ON b.pacote_id = l.id
      WHERE b.modo = 'relevancia' AND b.ativo = true AND b.deleted_at IS NULL
    ),
    'fixos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', b.id, 'pacote_id', l.id, 'pacote_nome', l.nome,
               'titulo', b.titulo, 'conteudo', b.conteudo, 'category', b.category)
             ORDER BY l.ordem, l.nome, b.ordem, b.created_at)
      FROM ligados l
      JOIN public.pacotes_conhecimento_blocos b ON b.pacote_id = l.id
      WHERE b.modo = 'sempre' AND b.ativo = true AND b.deleted_at IS NULL
    ), '[]'::jsonb)
  );
$function$

