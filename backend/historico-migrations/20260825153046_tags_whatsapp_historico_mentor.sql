-- Tags estilo WhatsApp no histórico do Mentor (pedido do Dominic, 2026-08-25).
--
-- Cada mensagem de mentor_mensagens ganha um array `tags` preenchido por
-- trigger no INSERT a partir de regras declarativas (mentor_tag_regras:
-- tag → regex). Organização interna: as regras vivem no banco (uma fonte de
-- verdade pra todas as vias — agente-mestre-chat, ragentic e a via rápida),
-- e a recuperação por tag usa índice GIN (&&) em vez de ILIKE varrendo texto.
-- O frontend espelha as mesmas regras pra etiquetagem visual interna
-- (frontend/src/os/mentor-antecipacao/tags-historico.js — manter em sincronia).

create table if not exists public.mentor_tag_regras (
  tag text primary key,
  padrao text not null, -- regex case-insensitive aplicada ao conteúdo da mensagem
  criado_em timestamptz not null default now()
);

comment on table public.mentor_tag_regras is
  'Regras declarativas de etiquetagem do histórico do Mentor (tag → regex). Fonte única: trigger no INSERT + busca por tag na via rápida + espelho no cliente.';

-- Só o backend enxerga as regras (leitura no cliente é via espelho estático).
alter table public.mentor_tag_regras enable row level security;

insert into public.mentor_tag_regras (tag, padrao) values
  ('comercial',  'venda|vendas|meta|metas|desconto|proposta|or[cç]amento comercial|fechar|fechamento|negocia|pre[cç]o|plano (pro|b[aá]sico|premium)'),
  ('financeiro', 'or[cç]amento|custo|custos|pagamento|pagamentos|boleto|pix|fatura|caixa|cobran[cç]a|reembolso|r\$ ?[0-9]'),
  ('campanha',   'campanha|tr[aá]fego|an[uú]ncio|marketing|instagram|facebook|divulga'),
  ('leads',      'lead|leads|prospec[cç]|funil|convers[aã]o'),
  ('clientes',   'cliente|clientes|carteira'),
  ('rifas',      'rifa|rifas|sorteio|cartela|bilhete|n[uú]meros? da sorte'),
  ('agenda',     'agenda|reuni[aã]o|reuni[oõ]es|compromisso|hor[aá]rio|agendamento|remarcar'),
  ('equipe',     'equipe|time|funcion[aá]rio|colaborador|contrata[cç]|respons[aá]vel'),
  ('produto',    'produto|produtos|estoque|cat[aá]logo|item|itens'),
  ('contrato',   'contrato|contratos|cl[aá]usula|assinatura|renova[cç]'),
  ('whatsapp',   'whatsapp|zap|mensagen|disparo|status do (chip|whats)|z-?api'),
  ('suporte',    'erro|bug|problema|falha|n[aã]o funciona|travou|quebrou'),
  ('relatorio',  'relat[oó]rio|resumo|panorama|dashboard|indicador|m[eé]trica')
on conflict (tag) do update set padrao = excluded.padrao;

alter table public.mentor_mensagens
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_mentor_mensagens_tags
  on public.mentor_mensagens using gin (tags);

-- Etiquetador: devolve as tags cujo regex casa com o texto.
create or replace function public.fn_tags_do_texto(p_texto text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(tag order by tag), '{}')
  from public.mentor_tag_regras
  where p_texto ~* padrao
$$;

create or replace function public.fn_tag_mentor_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tags := public.fn_tags_do_texto(coalesce(new.conteudo, ''));
  return new;
end
$$;

drop trigger if exists trg_tag_mentor_mensagem on public.mentor_mensagens;
create trigger trg_tag_mentor_mensagem
  before insert on public.mentor_mensagens
  for each row execute function public.fn_tag_mentor_mensagem();

-- Backfill: etiqueta todo o histórico existente.
update public.mentor_mensagens
set tags = public.fn_tags_do_texto(conteudo)
where conteudo is not null and conteudo <> '';
;
