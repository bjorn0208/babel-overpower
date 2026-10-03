alter table public.memoria_dono
  add column if not exists vetor_semantico extensions.halfvec(1024),
  add column if not exists embedding_status text not null default 'pendente',
  add column if not exists relevancia text not null default 'media',
  add column if not exists vezes_evocado integer not null default 0,
  add column if not exists ultima_evocacao_em timestamptz,
  add column if not exists valido_ate timestamptz;

create index if not exists memoria_dono_vetor_hnsw
  on public.memoria_dono using hnsw (vetor_semantico extensions.halfvec_cosine_ops);
create index if not exists memoria_dono_owner_ativa_idx
  on public.memoria_dono (owner_id) where ativa;

create or replace function public.aplicar_vetores_lote(p_tabela text, p_ids uuid[], p_vetores text[])
 returns integer language plpgsql security definer set search_path to ''
as $function$
DECLARE
  n integer := 0;
  tem_status boolean;
BEGIN
  IF p_tabela NOT IN (
    'blocos_comportamento','blocos_gatilho','blocos_humanizacao','memoria_lead','lead_memory_fatos',
    'perguntas_sem_resposta','blocos_conhecimento','blocos_variacao','blocos_meta','memoria_episodica',
    'blocos_procedurais','emocao_blocos','prova_social_blocos','anti_padroes','diretriz_bolha_blocos',
    'manipulacao_blocos','agente_identidade','regras_operacionais_blocos','pivots_categoria_intent',
    'acao_pausa_blocos','automacao_blocos','admin_ia_blocos','admin_ia_memoria','fase_requisitos',
    'candidatos_tag','ferramentas_dinamicas','pacotes_conhecimento_blocos','memoria_dono'
  ) THEN
    RAISE EXCEPTION 'tabela nao permitida: %', p_tabela;
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL
     OR array_length(p_ids,1) <> array_length(p_vetores,1) THEN
    RETURN 0;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=p_tabela AND column_name='embedding_status'
  ) INTO tem_status;
  IF tem_status THEN
    EXECUTE format(
      'UPDATE public.%I AS t SET vetor_semantico = v.vec::extensions.halfvec, embedding_status = ''pronto'' '
      'FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS vec) AS v WHERE t.id = v.id',
      p_tabela
    ) USING p_ids, p_vetores;
  ELSE
    EXECUTE format(
      'UPDATE public.%I AS t SET vetor_semantico = v.vec::extensions.halfvec '
      'FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS vec) AS v WHERE t.id = v.id',
      p_tabela
    ) USING p_ids, p_vetores;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

create or replace function public.tg_memoria_dono_enfileirar_vetor()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.fato is not distinct from old.fato then
    return new;
  end if;
  if new.fato is not null and trim(new.fato) <> '' then
    perform pgmq.send('embedding_jobs', jsonb_build_object('table', 'memoria_dono', 'row_id', new.id,
      'text', trim(coalesce(new.categoria, '') || ' — ' || new.fato)));
    new.embedding_status := 'pendente';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_memoria_dono_vetor_ins on public.memoria_dono;
create trigger trg_memoria_dono_vetor_ins before insert on public.memoria_dono
  for each row execute function public.tg_memoria_dono_enfileirar_vetor();
drop trigger if exists trg_memoria_dono_vetor_upd on public.memoria_dono;
create trigger trg_memoria_dono_vetor_upd before update of fato on public.memoria_dono
  for each row execute function public.tg_memoria_dono_enfileirar_vetor();

create or replace function public.buscar_memoria_dono(
  p_owner_id uuid, p_query_embedding extensions.halfvec, p_match_count integer default 30
)
returns table (
  id uuid, fato text, categoria text, relevancia text, vezes_evocado integer,
  ultima_evocacao_em timestamptz, criado_em timestamptz, valido_ate timestamptz, score double precision
)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.fato, m.categoria, m.relevancia, m.vezes_evocado, m.ultima_evocacao_em, m.criado_em, m.valido_ate,
         (1 - (m.vetor_semantico operator(extensions.<=>) p_query_embedding))::double precision as score
    from public.memoria_dono m
   where m.owner_id = p_owner_id and m.ativa
     and m.vetor_semantico is not null
     and (m.valido_ate is null or m.valido_ate > now())
   order by m.vetor_semantico operator(extensions.<=>) p_query_embedding
   limit greatest(1, least(coalesce(p_match_count, 30), 100));
$$;
revoke all on function public.buscar_memoria_dono(uuid, extensions.halfvec, integer) from public, anon;
grant execute on function public.buscar_memoria_dono(uuid, extensions.halfvec, integer) to authenticated, service_role;

create or replace function public.evocar_memoria_dono(p_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.memoria_dono
     set vezes_evocado = vezes_evocado + 1, ultima_evocacao_em = now()
   where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.evocar_memoria_dono(uuid[]) from public, anon;
grant execute on function public.evocar_memoria_dono(uuid[]) to authenticated, service_role;

select count(*) from (
  select pgmq.send('embedding_jobs', jsonb_build_object('table', 'memoria_dono', 'row_id', id,
           'text', trim(coalesce(categoria, '') || ' — ' || fato)))
    from public.memoria_dono where ativa and vetor_semantico is null
) s;
;
