CREATE OR REPLACE FUNCTION public.gestao_definir_acesso_membro(p_membro uuid, p_papeis text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_eu uuid := (select auth.uid());
  v_m record;
  v_nome text;
  v_papeis text[];
  v_area text;
  v_equipe jsonb;
  v_pessoas jsonb;
  v_membros jsonb;
  v_reg jsonb;
  v_pessoa text;
  v_func uuid;
  v_outro text;
  v_tinha_sup boolean;
  v_ganhou boolean;
  v_perdeu boolean;
  v_mudou boolean;
begin
  if v_eu is null or not public.gestao_eh_admin() then
    raise exception 'gestao: so o administrador da Gestao define as funcoes da equipe' using errcode = '42501'; end if;
  if p_membro is null then raise exception 'gestao: membro obrigatorio' using errcode = '22023'; end if;
  if p_membro = v_eu then raise exception 'gestao: use a aba Acessos para mudar o proprio acesso' using errcode = '22023'; end if;
  select id, full_name, apelido, email, parent_user_id into v_m from public.profiles where id = p_membro and deleted_at is null;
  if not found then raise exception 'gestao: membro nao encontrado' using errcode = '22023'; end if;
  -- só membro da PRÓPRIA equipe (ou o dono da plataforma, que administra tudo)
  if v_m.parent_user_id is distinct from v_eu
     and not exists (select 1 from public.profiles p where p.id = v_eu and p.system_role = 'platform_admin' and p.deleted_at is null) then
    raise exception 'gestao: essa pessoa nao e da sua equipe' using errcode = '42501'; end if;

  v_papeis := array(select distinct x from unnest(coalesce(p_papeis, '{}'::text[])) x where x is not null order by x);
  if not (v_papeis <@ array['admin','financeiro','comercial','implementacao','programador','suporte']::text[]) then
    raise exception 'gestao: funcao desconhecida' using errcode = '22023'; end if;
  v_nome := coalesce(nullif(btrim(v_m.full_name), ''), nullif(btrim(v_m.apelido), ''), v_m.email, 'Membro');
  if length(v_nome) > 120 then v_nome := left(v_nome, 120); end if;
  -- E-1 (Serjão, rodada 3): quem JÁ tem acesso mantém o "no time como" que já tinha (os atendimentos estão gravados com
  -- esse nome). O nome do perfil só vale para quem nunca teve acesso.
  select nullif(btrim(pessoa), '') into v_pessoa from public.gestao_acessos where id = p_membro;
  v_pessoa := coalesce(v_pessoa, v_nome);
  -- E-3 (Serjão, rodada 4): o rodízio só muda quando o papel Suporte MUDA de fato (a tela manda todas as funções
  -- a cada edição). Guardar se ele já tinha Suporte ANTES de gravar.
  select 'suporte' = any (papeis) into v_tinha_sup from public.gestao_acessos where id = p_membro and deleted_at is null;
  v_tinha_sup := coalesce(v_tinha_sup, false);

  -- 1. o acesso
  if cardinality(v_papeis) = 0 then
    update public.gestao_acessos set deleted_at = now() where id = p_membro and deleted_at is null;
  else
    insert into public.gestao_acessos (id, papeis, pessoa, por_id)
    values (p_membro, v_papeis, v_pessoa, v_eu)
    on conflict (id) do update set papeis = excluded.papeis, pessoa = excluded.pessoa, por_id = excluded.por_id, deleted_at = null;
  end if;

  -- 2. a lista da área: Implementação e P&D são funcionários, ligados ao membro por extras.membro_id.
  --    E-1: se já existe um funcionário da área com esse nome e sem ligação, LIGA esse (não cria um segundo).
  --    O nome do funcionário nunca é trocado aqui.
  foreach v_area in array array['implementacao','programador'] loop
    if v_area = any (v_papeis) then
      update public.gestao_funcionarios set ativo = true, deleted_at = null
       where area = v_area and extras ->> 'membro_id' = p_membro::text;
      if not found then
        select id into v_func from public.gestao_funcionarios
         where area = v_area and nome = v_pessoa and coalesce(extras ->> 'membro_id', '') = ''
         order by (deleted_at is null) desc, criado_em limit 1;
        if v_func is not null then
          update public.gestao_funcionarios set ativo = true, deleted_at = null,
                 extras = extras || jsonb_build_object('membro_id', p_membro::text)
           where id = v_func;
        else
          insert into public.gestao_funcionarios (nome, area, ativo, extras)
          values (v_pessoa, v_area, true, jsonb_build_object('membro_id', p_membro::text));
        end if;
        v_func := null;
      end if;
    else
      update public.gestao_funcionarios set ativo = false
       where area = v_area and extras ->> 'membro_id' = p_membro::text and ativo is distinct from false;
    end if;
  end loop;

  -- 3. Suporte: a equipe do rodízio (gestao_config 'equipe' → {"pessoas": [...]}).
  --    E-2 (Serjão, rodada 3): nada por nome solto. Cada membro fica registrado em valor.membros[id] = {nome, adicionado};
  --    "adicionado" = foi esta função que pôs o nome no rodízio. Ao tirar, só sai o nome que ela mesma pôs e que nenhum
  --    outro membro registrado usa. Nome cadastrado à mão nunca é tirado daqui.
  select valor into v_equipe from public.gestao_config where chave = 'equipe' and deleted_at is null;
  v_equipe := coalesce(v_equipe, '{}'::jsonb);
  v_pessoas := case when jsonb_typeof(v_equipe -> 'pessoas') = 'array' then v_equipe -> 'pessoas' else '[]'::jsonb end;
  v_membros := case when jsonb_typeof(v_equipe -> 'membros') = 'object' then v_equipe -> 'membros' else '{}'::jsonb end;
  v_reg := v_membros -> (p_membro::text);
  v_ganhou := ('suporte' = any (v_papeis)) and not v_tinha_sup;
  v_perdeu := v_tinha_sup and not ('suporte' = any (v_papeis));
  v_mudou := false;
  -- SAÍDA: quando PERDEU o Suporte agora, e também quando GANHOU mas havia um registro velho (E-4, Serjão rodada 5:
  -- o Suporte tinha sido tirado pela aba Acessos, sem passar por aqui). O registro velho sai com a regra de sempre.
  if v_reg is not null and (v_perdeu or v_ganhou) then
    if (v_reg ->> 'adicionado')::boolean then
      -- outro membro registrado com o mesmo nome? ele herda o "adicionado" (o nome fica, e sai quando ele sair)
      select m.key into v_outro from jsonb_each(v_membros) m
       where m.key <> p_membro::text and m.value -> 'nome' = v_reg -> 'nome' limit 1;
      if v_outro is not null then
        v_membros := jsonb_set(v_membros, array[v_outro, 'adicionado'], 'true'::jsonb);
      else
        v_pessoas := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_pessoas) e where e <> v_reg -> 'nome');
      end if;
    end if;
    v_membros := v_membros - (p_membro::text);
    v_mudou := true;
  end if;
  -- ENTRADA: GANHOU Suporte agora → registra com o "no time como" ATUAL.
  if v_ganhou then
    if v_pessoas @> to_jsonb(v_pessoa) then
      v_membros := v_membros || jsonb_build_object(p_membro::text, jsonb_build_object('nome', v_pessoa, 'adicionado', false));
    else
      v_pessoas := v_pessoas || to_jsonb(v_pessoa);
      v_membros := v_membros || jsonb_build_object(p_membro::text, jsonb_build_object('nome', v_pessoa, 'adicionado', true));
    end if;
    v_mudou := true;
  end if;
  -- continua com Suporte, ou continua sem: o rodízio NÃO é tocado (quem o dono tirou à mão, fica fora)
  if not v_mudou then v_equipe := null; end if;
  if v_equipe is not null then
    insert into public.gestao_config (chave, valor)
    values ('equipe', v_equipe || jsonb_build_object('pessoas', v_pessoas, 'membros', v_membros))
    on conflict (chave) do update set valor = excluded.valor, deleted_at = null;
  end if;
end $function$

