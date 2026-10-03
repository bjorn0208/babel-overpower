CREATE OR REPLACE FUNCTION public.instalar_kit_pacote(p_pacote_id uuid, p_agente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kit jsonb; v_tenant uuid; v_agente text; v_empresa text; v_pix text;
  v_chave text; v_titular text; r jsonb; v_id uuid; v_cargo uuid; v_f text;
  v_rel jsonb := jsonb_build_object('instalado', '[]'::jsonb, 'reativado', '[]'::jsonb, 'pulado', '[]'::jsonb);
  v_tem_catalogo boolean;
begin
  select kit into v_kit from public.pacotes_conhecimento_kit where pacote_id = p_pacote_id and ativo;
  if v_kit is null then return jsonb_build_object('ok', false, 'motivo', 'pacote sem kit ativo'); end if;
  select a.user_id, coalesce(nullif(a.nome_agente, ''), a.identidade->>'nome', 'a equipe')
    into v_tenant, v_agente from public.agentes_usuario a where a.id = p_agente_id;
  if v_tenant is null then return jsonb_build_object('ok', false, 'motivo', 'agente não encontrado'); end if;
  if not public.pacote_liberado_para_tenant(p_pacote_id, v_tenant) then
    return jsonb_build_object('ok', false, 'motivo', 'pacote não liberado para o tenant');
  end if;
  select coalesce((select e.nome from public.empresas e where e.user_id = v_tenant order by e.created_at limit 1),
                  nullif(p.razao_social, ''), p.full_name, 'a empresa'),
         nullif(trim(p.chave_pix), ''), coalesce(nullif(p.razao_social, ''), p.full_name)
    into v_empresa, v_chave, v_titular from public.profiles p where p.id = v_tenant;
  v_pix := case when v_chave is not null
    then 'chave Pix ' || v_chave || coalesce(' — titular ' || v_titular, '')
    else '[a empresa ainda não cadastrou a chave Pix: NÃO invente chave — diga que a equipe envia os dados de pagamento e use enviar_para_financeiro]' end;

  -- Produtos: só em tenant SEM catálogo próprio (não duplica o que o dono já vende).
  select exists (select 1 from public.produtos x where x.user_id = v_tenant and coalesce(x.ativo, true)
                 and x.pacote_origem_id is distinct from p_pacote_id) into v_tem_catalogo;
  for r in select * from jsonb_array_elements((case when jsonb_typeof(v_kit->'produtos') = 'array' then v_kit->'produtos' else '[]'::jsonb end)) loop
    select id into v_id from public.produtos where user_id = v_tenant and pacote_origem_id = p_pacote_id and slug = r->>'slug';
    if v_id is not null then
      update public.produtos set ativo = true where id = v_id;
      v_rel := jsonb_set(v_rel, '{reativado}', (v_rel->'reativado') || to_jsonb('produto: ' || (r->>'nome')));
    elsif v_tem_catalogo then
      v_rel := jsonb_set(v_rel, '{pulado}', (v_rel->'pulado') || to_jsonb('produto: ' || (r->>'nome') || ' (tenant já tem catálogo próprio)'));
    else
      insert into public.produtos (user_id, nome, slug, descricao_curta, preco_centavos, entrada_centavos, max_parcelas,
                                   prazo_entrega, garantia, palavras_chave, ativo, metadata, pacote_origem_id)
      values (v_tenant, r->>'nome', r->>'slug', r->>'descricao_curta', (r->>'preco_centavos')::int, 0, 1,
              r->>'prazo_entrega', r->>'garantia',
              array(select jsonb_array_elements_text((case when jsonb_typeof(r->'palavras_chave') = 'array' then r->'palavras_chave' else '[]'::jsonb end))), true,
              jsonb_build_object('sem_contrato', true, 'origem', 'kit_pacote'), p_pacote_id);
      v_rel := jsonb_set(v_rel, '{instalado}', (v_rel->'instalado') || to_jsonb('produto: ' || (r->>'nome')));
    end if;
  end loop;

  -- Cargos (+ diretrizes + ferramentas): pula se o agente já tem cargo próprio com o mesmo nome.
  for r in select * from jsonb_array_elements((case when jsonb_typeof(v_kit->'cargos') = 'array' then v_kit->'cargos' else '[]'::jsonb end)) loop
    select id into v_cargo from public.cargos where agente_id = p_agente_id and pacote_origem_id = p_pacote_id and nome = r->>'nome';
    if v_cargo is not null then
      update public.cargos set ativo = true where id = v_cargo;
      v_rel := jsonb_set(v_rel, '{reativado}', (v_rel->'reativado') || to_jsonb('cargo: ' || (r->>'nome')));
      continue;
    end if;
    if exists (select 1 from public.cargos c where c.agente_id = p_agente_id and c.ativo and lower(c.nome) = lower(r->>'nome')) then
      v_rel := jsonb_set(v_rel, '{pulado}', (v_rel->'pulado') || to_jsonb('cargo: ' || (r->>'nome') || ' (agente já tem um próprio)'));
      continue;
    end if;
    insert into public.cargos (escopo, tenant_id, agente_id, nome, tipologia, canal_atuacao, objetivo_principal,
                               campos_rastreio, modelo_llm_padrao, ativo, ordem, regras_livres, pacote_origem_id)
    values ('tenant', v_tenant, p_agente_id, r->>'nome', (r->>'tipologia')::public.cargo_tipologia, coalesce(r->>'canal_atuacao', 'externo'),
            public._kit_txt(r->>'objetivo_principal', v_agente, v_empresa, v_pix),
            (case when jsonb_typeof(r->'campos_rastreio') = 'array' then r->'campos_rastreio' else '[]'::jsonb end), r->>'modelo_llm_padrao', true, coalesce((r->>'ordem')::int, 0),
            public._kit_txt(r->>'regras_livres', v_agente, v_empresa, v_pix), p_pacote_id)
    returning id into v_cargo;
    insert into public.cargo_diretrizes (cargo_id, ordem, titulo, descricao, ativo)
    select v_cargo, coalesce((d->>'ordem')::int, 0), public._kit_txt(d->>'titulo', v_agente, v_empresa, v_pix),
           public._kit_txt(d->>'descricao', v_agente, v_empresa, v_pix), true
      from jsonb_array_elements((case when jsonb_typeof(r->'diretrizes') = 'array' then r->'diretrizes' else '[]'::jsonb end)) d;
    insert into public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
    select v_cargo, f.id, false, t.ord::int
      from jsonb_array_elements_text((case when jsonb_typeof(r->'ferramentas') = 'array' then r->'ferramentas' else '[]'::jsonb end)) with ordinality t(nome, ord)
      join lateral (select fd.id from public.ferramentas_dinamicas fd where fd.nome_tool = t.nome and fd.ativo
                    order by (fd.tenant_id is null) desc limit 1) f on true
    on conflict do nothing;
    v_rel := jsonb_set(v_rel, '{instalado}', (v_rel->'instalado') || to_jsonb('cargo: ' || (r->>'nome')));
  end loop;

  -- Gatilhos
  for r in select * from jsonb_array_elements((case when jsonb_typeof(v_kit->'gatilhos') = 'array' then v_kit->'gatilhos' else '[]'::jsonb end)) loop
    select id into v_id from public.blocos_gatilho where tenant_id = v_tenant and pacote_origem_id = p_pacote_id and nome_trigger = r->>'nome_trigger';
    if v_id is not null then update public.blocos_gatilho set ativo = true where id = v_id; continue; end if;
    if exists (select 1 from public.blocos_gatilho g where g.tenant_id = v_tenant and g.ativo and g.deleted_at is null and g.nome_trigger = r->>'nome_trigger') then
      v_rel := jsonb_set(v_rel, '{pulado}', (v_rel->'pulado') || to_jsonb('gatilho: ' || (r->>'nome_trigger') || ' (já existe)'));
      continue;
    end if;
    insert into public.blocos_gatilho (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, tenant_id, ativo,
      categoria, subcategoria, condicao_tipo, tempo_aguardar_minutos, fase_aplicavel, tipo_campanha, objetivo_campanha, cargo_id, pacote_origem_id)
    values (r->>'nome_trigger', public._kit_txt(r->>'exemplo_frase', v_agente, v_empresa, v_pix),
      public._kit_txt(r->>'acao_disparada', v_agente, v_empresa, v_pix),
      case when r->'acao_payload' is null or r->'acao_payload' = 'null' then null
           else public._kit_txt((r->'acao_payload')::text, v_agente, v_empresa, v_pix)::jsonb end,
      'tenant', v_tenant, true, r->>'categoria', r->>'subcategoria', r->>'condicao_tipo',
      (r->>'tempo_aguardar_minutos')::int, r->>'fase_aplicavel', r->>'tipo_campanha', r->>'objetivo_campanha',
      (select c.id from public.cargos c where c.agente_id = p_agente_id and c.ativo and c.nome = r->>'cargo_nome' limit 1),
      p_pacote_id);
  end loop;
  v_rel := jsonb_set(v_rel, '{instalado}', (v_rel->'instalado') || to_jsonb('gatilhos: ' ||
    (select count(*) from public.blocos_gatilho where tenant_id = v_tenant and pacote_origem_id = p_pacote_id and ativo)));

  -- Anti-padrões
  for r in select * from jsonb_array_elements((case when jsonb_typeof(v_kit->'anti_padroes') = 'array' then v_kit->'anti_padroes' else '[]'::jsonb end)) loop
    select id into v_id from public.anti_padroes where tenant_id = v_tenant and pacote_origem_id = p_pacote_id and md5(situacao) = md5(public._kit_txt(r->>'situacao', v_agente, v_empresa, v_pix));
    if v_id is not null then update public.anti_padroes set ativo = true where id = v_id; continue; end if;
    insert into public.anti_padroes (escopo, tenant_id, situacao, acao_correta, por_que, contexto_que_disparou, origem, tipo_campanha, ativo, pacote_origem_id)
    values ('tenant', v_tenant, public._kit_txt(r->>'situacao', v_agente, v_empresa, v_pix),
      public._kit_txt(r->>'acao_correta', v_agente, v_empresa, v_pix), public._kit_txt(r->>'por_que', v_agente, v_empresa, v_pix),
      r->>'contexto_que_disparou', 'admin_curadoria', r->>'tipo_campanha', true, p_pacote_id);
  end loop;

  -- Humanização
  for r in select * from jsonb_array_elements((case when jsonb_typeof(v_kit->'humanizacao') = 'array' then v_kit->'humanizacao' else '[]'::jsonb end)) loop
    select id into v_id from public.blocos_humanizacao where tenant_id = v_tenant and pacote_origem_id = p_pacote_id and md5(regra) = md5(public._kit_txt(r->>'regra', v_agente, v_empresa, v_pix));
    if v_id is not null then update public.blocos_humanizacao set ativo = true where id = v_id; continue; end if;
    insert into public.blocos_humanizacao (categoria, subcategoria, regra, exemplos_bons, exemplos_ruins, contexto_uso, quando_nao_usar,
      tags_persona, escopo, tenant_id, prioridade, ativo, tipo_campanha, objetivo_campanha, cargo_id, pacote_origem_id)
    select r->>'categoria', r->>'subcategoria', public._kit_txt(r->>'regra', v_agente, v_empresa, v_pix),
      case when jsonb_typeof(r->'exemplos_bons') = 'array' then array(select public._kit_txt(x, v_agente, v_empresa, v_pix) from jsonb_array_elements_text(r->'exemplos_bons') x) end,
      case when jsonb_typeof(r->'exemplos_ruins') = 'array' then array(select public._kit_txt(x, v_agente, v_empresa, v_pix) from jsonb_array_elements_text(r->'exemplos_ruins') x) end,
      public._kit_txt(r->>'contexto_uso', v_agente, v_empresa, v_pix), public._kit_txt(r->>'quando_nao_usar', v_agente, v_empresa, v_pix),
      case when jsonb_typeof(r->'tags_persona') = 'array' then array(select jsonb_array_elements_text(r->'tags_persona')) end,
      'tenant', v_tenant, (r->>'prioridade')::int, true, r->>'tipo_campanha', r->>'objetivo_campanha',
      (select c.id from public.cargos c where c.agente_id = p_agente_id and c.ativo and c.nome = r->>'cargo_nome' limit 1), p_pacote_id;
  end loop;

  -- Procedimentos
  for r in select * from jsonb_array_elements((case when jsonb_typeof(v_kit->'procedimentos') = 'array' then v_kit->'procedimentos' else '[]'::jsonb end)) loop
    select id into v_id from public.blocos_procedurais where tenant_id = v_tenant and pacote_origem_id = p_pacote_id and nome_procedimento = r->>'nome_procedimento';
    if v_id is not null then update public.blocos_procedurais set ativo = true where id = v_id; continue; end if;
    insert into public.blocos_procedurais (escopo, tenant_id, nome_procedimento, passos, citacao_kb, imutavel, ativo, prioridade, cargo_id, pacote_origem_id)
    values ('tenant', v_tenant, r->>'nome_procedimento',
      public._kit_txt((case when jsonb_typeof(r->'passos') in ('array','object') then r->'passos' else '[]'::jsonb end)::text, v_agente, v_empresa, v_pix)::jsonb,
      r->>'citacao_kb', coalesce((r->>'imutavel')::boolean, false), true, (r->>'prioridade')::int,
      (select c.id from public.cargos c where c.agente_id = p_agente_id and c.ativo and c.nome = r->>'cargo_nome' limit 1), p_pacote_id);
  end loop;

  -- Identidade (2026-09-18): personalidade, persona e tom de voz do agente de origem. Entram no topo
  -- de TODO turno (blocoIdentidade: "Você é {nome}, {cargo}. {personalidade} Tom de voz: {tom}.").
  -- Só preenche o que o agente de destino tem VAZIO — nome e cargo seguem os do tenant.
  if jsonb_typeof(v_kit->'identidade') = 'object' then
    for v_f in select unnest(array['personalidade', 'persona']) loop
      if coalesce(v_kit->'identidade'->>v_f, '') <> '' then
        if exists (select 1 from public.agentes_usuario a where a.id = p_agente_id and coalesce(trim(a.identidade->>v_f), '') = '') then
          update public.agentes_usuario
             set identidade = coalesce(identidade, '{}'::jsonb) || jsonb_build_object(v_f, public._kit_txt(v_kit->'identidade'->>v_f, v_agente, v_empresa, v_pix))
           where id = p_agente_id;
          v_rel := jsonb_set(v_rel, '{instalado}', (v_rel->'instalado') || to_jsonb('identidade: ' || v_f));
        else
          v_rel := jsonb_set(v_rel, '{pulado}', (v_rel->'pulado') || to_jsonb('identidade: ' || v_f || ' (agente já tem)'));
        end if;
      end if;
    end loop;
    if coalesce(v_kit->'identidade'->>'tom_agente', '') <> '' then
      if exists (select 1 from public.agentes_usuario a where a.id = p_agente_id and coalesce(a.tom_agente, '') = '') then
        update public.agentes_usuario set tom_agente = v_kit->'identidade'->>'tom_agente' where id = p_agente_id;
        v_rel := jsonb_set(v_rel, '{instalado}', (v_rel->'instalado') || to_jsonb('tom de voz: ' || (v_kit->'identidade'->>'tom_agente')));
      else
        v_rel := jsonb_set(v_rel, '{pulado}', (v_rel->'pulado') || to_jsonb('tom de voz (agente já tem)'::text));
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'tenant', v_tenant, 'agente', v_agente, 'empresa', v_empresa,
                            'pix_cadastrado', v_chave is not null) || v_rel;
end;
$function$

