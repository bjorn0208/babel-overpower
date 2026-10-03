-- O texto embedado de blocos_conhecimento é `title || ' ' || content`
-- (ver public.enfileirar_tarefa_embedding), mas o trigger de UPDATE só observava
-- `content`. Editar SÓ o título deixava o bloco com vetor velho para sempre —
-- e, quando alguém marcava embedding_status='pendente' na mão, o status ficava
-- travado em 'pendente' porque nenhuma tarefa era enfileirada.
-- Encontrado em 2026-09-04: 5 blocos da Tríade parados havia 26h por isso.
drop trigger if exists trg_enqueue_embedding_conhecimento_upd on public.blocos_conhecimento;

create trigger trg_enqueue_embedding_conhecimento_upd
  before update of content, title on public.blocos_conhecimento
  for each row
  when (
    old.content is distinct from new.content
    or old.title is distinct from new.title
  )
  execute function public.enfileirar_tarefa_embedding();
;
