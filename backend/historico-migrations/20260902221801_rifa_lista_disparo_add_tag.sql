-- Base pro sistema de permissão de disparo por tag (Theus 2026-09-02): vai
-- importar CSV de clientes do Fabrício, contatos marcados (final "z" no
-- identificador da linha) recebem tag de "pode interagir" — só esses entram
-- na lista. rifa_lista_disparo já é a allow-list lida pelo gate
-- apenas_leads_disparados no webhook; só falta o rótulo pra gestão/controle.
ALTER TABLE public.rifa_lista_disparo
  ADD COLUMN IF NOT EXISTS tag text;

COMMENT ON COLUMN public.rifa_lista_disparo.tag IS
  'Rótulo de identificação do lote/grupo de contatos permitidos (ex: import CSV de clientes do Fabrício). Null = legado, sem tag.';

;
