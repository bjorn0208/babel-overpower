
insert into public.ferramentas_dinamicas (id, escopo, tenant_id, nome_tool, descricao, schema_zod, endpoint_url, metodo, dominio_allowlist, precisa_aprovacao, ativo)
values
  (gen_random_uuid(),'global',null,'transferir_humano','Transfere a conversa para um atendente humano com motivo opcional.','{"type":"object","properties":{"motivo":{"type":"string"}}}'::jsonb,'internal://transferir_humano','POST','internal',false,true),
  (gen_random_uuid(),'global',null,'enviar_link_contrato','Gera e envia o link assinável de contrato para o lead atual.','{"type":"object","properties":{"contrato_id":{"type":"string"},"canal":{"type":"string","enum":["whatsapp","email"]}}}'::jsonb,'internal://enviar_link_contrato','POST','internal',false,true),
  (gen_random_uuid(),'global',null,'query_leads_filtro','Consulta leads do tenant aplicando filtros estruturados (somente admin).','{"type":"object","properties":{"filtros":{"type":"object"},"limite":{"type":"integer"}}}'::jsonb,'internal://query_leads_filtro','POST','internal',false,true),
  (gen_random_uuid(),'global',null,'agendar_compromisso','Cria um compromisso na agenda do lead.','{"type":"object","properties":{"quando":{"type":"string","format":"date-time"},"titulo":{"type":"string"}}}'::jsonb,'internal://agendar_compromisso','POST','internal',false,true),
  (gen_random_uuid(),'global',null,'escalar_supervisor','Escala o caso para supervisão interna sem trocar de canal.','{"type":"object","properties":{"motivo":{"type":"string"}}}'::jsonb,'internal://escalar_supervisor','POST','internal',false,true)
on conflict do nothing;

insert into public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
select c.id, f.id, false, 100
from public.cargos c cross join public.ferramentas_dinamicas f
where c.escopo='global' and f.escopo='global'
  and f.nome_tool in ('transferir_humano','escalar_supervisor')
  and c.tipologia in ('atendimento','face_cliente')
on conflict do nothing;

insert into public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
select c.id, f.id, false, 10
from public.cargos c cross join public.ferramentas_dinamicas f
where c.escopo='global' and f.escopo='global'
  and lower(c.nome)='vendedor'
  and f.nome_tool in ('enviar_link_contrato','agendar_compromisso')
on conflict do nothing;

insert into public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
select c.id, f.id, true, 1
from public.cargos c cross join public.ferramentas_dinamicas f
where c.escopo='global' and f.escopo='global'
  and c.tipologia='admin'
  and f.nome_tool='query_leads_filtro'
on conflict do nothing;

;
