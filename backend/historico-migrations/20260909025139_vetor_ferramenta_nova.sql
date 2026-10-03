create or replace function public.enfileirar_vetor_ferramenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text;
begin
  v_texto := trim(coalesce(new.nome_tool, '') || ' ' || coalesce(new.descricao, ''));
  if v_texto <> '' then
    perform pgmq.send(
      'embedding_jobs',
      jsonb_build_object('table', 'ferramentas_dinamicas', 'row_id', new.id, 'text', v_texto)
    );
  end if;
  return null;
end;
$$;

comment on function public.enfileirar_vetor_ferramenta() is
  'Enfileira a ferramenta na fila de embedding sempre que nasce ou muda de descrição. Sem vetor, o corte semântico do catálogo não consegue podá-la e ela vai pro modelo em todo turno.';

drop trigger if exists trg_vetor_ferramenta_nova on public.ferramentas_dinamicas;
create trigger trg_vetor_ferramenta_nova
  after insert or update of nome_tool, descricao on public.ferramentas_dinamicas
  for each row
  execute function public.enfileirar_vetor_ferramenta();
;
