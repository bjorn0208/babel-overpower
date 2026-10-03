CREATE OR REPLACE FUNCTION public.integracao_provisionar_conta(p_user_id uuid, p_nicho_id uuid, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tmpl record;
  novo_produto_id uuid;
  _dias int := coalesce(nullif(p_dados->>'dias_degustacao','')::int, 7);
  _apps int := 0;
begin
  if p_user_id is null then raise exception 'p_user_id obrigatório'; end if;

  -- perfil: dados + modo degustação (expira sozinho se não confirmar)
  update public.profiles set
    nicho_id       = coalesce(p_nicho_id, nicho_id),
    phone          = coalesce(nullif(p_dados->>'phone',''), phone),
    document       = coalesce(nullif(p_dados->>'document',''), document),
    tipo_pessoa    = coalesce(nullif(p_dados->>'tipo_pessoa',''), tipo_pessoa),
    cnpj           = coalesce(nullif(p_dados->>'cnpj',''), cnpj),
    razao_social   = coalesce(nullif(p_dados->>'razao_social',''), razao_social),
    account_status = 'pendente',
    metadata       = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'origem', 'babel-central',
      'degustacao_ate', (now() + make_interval(days => _dias))::text
    )
  where id = p_user_id;
  if not found then raise exception 'profile % não existe', p_user_id; end if;

  -- clone dos produtos-modelo do nicho (o gatilho de AFTER INSERT não roda
  -- aqui porque o nicho chega depois do INSERT — espelho fiel da função
  -- copiar_templates_produto_para_novo_tenant)
  if p_nicho_id is not null then
    for tmpl in
      select * from public.produto_templates
      where nicho_id = p_nicho_id and ativo = true
    loop
      insert into public.produtos (user_id, nome, prazo_entrega, garantia)
      values (p_user_id, tmpl.nome, tmpl.prazo_entrega, tmpl.garantia)
      returning id into novo_produto_id;

      insert into public.produto_conhecimento (produto_id, tipo, titulo, conteudo, ordem)
      select novo_produto_id, tipo, titulo, conteudo, ordem
      from public.produto_template_conhecimento
      where produto_template_id = tmpl.id order by ordem nulls last;

      insert into public.produto_midias (produto_id, arquivo_url, arquivo_nome, arquivo_tipo, descricao, ordem)
      select novo_produto_id, arquivo_url, arquivo_nome, arquivo_tipo, descricao, ordem
      from public.produto_template_midias
      where produto_template_id = tmpl.id order by ordem nulls last;
    end loop;
  end if;

  -- empresa (marca viva dos links públicos e alimento do RAG)
  insert into public.empresas (user_id, nome, cnpj, descricao)
  values (
    p_user_id,
    coalesce(nullif(p_dados->>'empresa_nome',''), 'Minha empresa'),
    nullif(p_dados->>'cnpj',''),
    nullif(p_dados->>'empresa_descricao','')
  )
  on conflict (user_id) do update
    set nome      = excluded.nome,
        cnpj      = coalesce(excluded.cnpj, public.empresas.cnpj),
        descricao = coalesce(excluded.descricao, public.empresas.descricao);

  -- apps do dia 1 (além dos de sistema): agenda, mentor, notas
  insert into public.aplicativos_instalados (user_id, aplicativo_id, aplicativo_slug)
  select p_user_id, la.id, la.slug
  from public.loja_aplicativos la
  where la.slug in ('agenda', 'mentor', 'notas')
  on conflict (user_id, aplicativo_id) do nothing;
  get diagnostics _apps = row_count;

  -- agente com nome (nasce vazio e inútil sem isso)
  update public.agentes
     set nome_agente = coalesce(nullif(p_dados->>'nome_agente',''), 'Bel')
   where user_id = p_user_id and coalesce(nome_agente,'') = '';

  return jsonb_build_object('ok', true, 'apps_instalados', _apps);
end;
$function$

