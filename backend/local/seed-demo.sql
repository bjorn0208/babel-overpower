-- Seed de demonstração para usuario@babel.local (tenant = id do usuário). Idempotente.
-- Uso: psql -f seed-demo.sql   (somente banco LOCAL)
begin;
\set t '''252e30e8-894c-4854-bb93-9152f2364857'''
update profiles set full_name = coalesce(full_name,'Dominic'), email = coalesce(email,'usuario@babel.local') where id = :t;

delete from leads where tenant_id = :t and id::text like 'dddd0000-%';
delete from clientes where owner_id = :t and id::text like 'dddd0000-%';
delete from eventos_agenda where tenant_id = :t and id::text like 'dddd0000-%';

insert into leads (id, tenant_id, name, phone, canal_externo, location, tags, valor_conversao, temperatura_lead, dados_ficha) values
 ('dddd0000-0000-0000-0000-000000000417', :t, 'Carla Mendes',  '5519990000417', 'WhatsApp',  'cliente', '{lojista,"Rio Claro"}', 21400, 'quente', '{"codigo":"#0417","tok":"ciano","word":"pede você","compras":6,"paga":"em dia","mem":["Compra a cada 45 dias, sempre no fim do mês","Prefere Pix; não gosta de boleto"]}'),
 ('dddd0000-0000-0000-0000-000000000588', :t, 'Rafael Souza',  '5519990000588', 'WhatsApp',  'cliente', '{"cliente final",Campinas}', 2400, 'morno', '{"codigo":"#0588","tok":"ciano","word":"pede sua validação","compras":1,"paga":"em 3×","mem":["Primeira compra · vestido Íris sob medida"]}'),
 ('dddd0000-0000-0000-0000-000000000231', :t, 'Joana Alves',   '5519990000231', 'WhatsApp',  'cliente', '{lojista,Limeira}', 6100, 'quente', '{"codigo":"#0231","tok":"ouro","word":"dinheiro entrou","compras":9,"paga":"sem cobrança","mem":["Paga sem precisar de cobrança"]}'),
 ('dddd0000-0000-0000-0000-000000000114', :t, 'Bruno Lima',    '5519990000114', 'Instagram', 'cliente', '{lojista,Piracicaba}', 9800, 'frio', '{"codigo":"#0114","tok":"lua","word":"cadê?","compras":11,"paga":"atrasou 8 dias","mem":["Comprava a cada 30 dias · última em 02/jul"]}'),
 ('dddd0000-0000-0000-0000-000000000602', :t, 'Marina Freitas','5519990000602', 'Instagram', 'atendimento', '{"cliente final"}', 620, 'morno', '{"codigo":"#0602","tok":"mute","word":"a Aurora respondeu","compras":1,"paga":"cartão","mem":[]}'),
 ('dddd0000-0000-0000-0000-000000000290', :t, 'Lojinha Sol',   '5519990000290', 'WhatsApp',  'atendimento', '{lojista,Americana}', 4300, 'morno', '{"codigo":"#0290","tok":"mute","word":"a Aurora respondeu","compras":3,"paga":"em dia","mem":[]}');

insert into conversas (id, tenant_id, lead_id, phone, channel, status, titulo, agent_enabled, updated_at)
select ('dddd0000-0000-0000-0001-'||right(l.id::text,12))::uuid, :t, l.id, l.phone, lower(l.canal_externo),
       case when l.name in ('Carla Mendes','Rafael Souza') then 'humano' else 'ativa' end,
       c.sub, true, now() - c.idade
from leads l join (values
 ('Carla Mendes','desconto de 10% · há 12 h', interval '12 hours'),
 ('Rafael Souza','contrato assinado · R$ 2.400', interval '13 hours'),
 ('Joana Alves','R$ 612,00 · confirmado pelo banco', interval '1 hour'),
 ('Bruno Lima','comprava todo mês e não comprou', interval '1 day'),
 ('Marina Freitas','tabela de preços · Instagram', interval '3 hours'),
 ('Lojinha Sol','prazo 15 dias · WhatsApp', interval '5 hours')) c(nome,sub,idade) on c.nome = l.name
where l.tenant_id = :t and l.id::text like 'dddd0000-%';

insert into mensagens (conversation_id, role, content, created_at)
select ('dddd0000-0000-0000-0001-'||m.cod)::uuid, m.role, m.txt, now() - m.idade from (values
 ('000000000417','user','Oi Aurora! Tudo bem? Quero repor o estoque pra outubro.', interval '13 hours'),
 ('000000000417','assistant','Que bom, Carla! O Conjunto Flora está com 40 peças prontas. Separo pra você?', interval '12 hours 59 min'),
 ('000000000417','user','Oi Aurora! Consegue 10% nas 40 peças do pedido?', interval '12 hours 58 min'),
 ('000000000417','assistant','Oi, Carla! Vou conferir com a Carolina e te respondo em até 1 h, tá?', interval '12 hours 57 min'),
 ('000000000588','user','Assinei o contrato, chegou aí?', interval '13 hours 2 min'),
 ('000000000588','assistant','Chegou! Selfie, documento e assinatura conferidos. O Dominic valida hoje e eu te aviso.', interval '13 hours 1 min'),
 ('000000000231','user','Pix feito!', interval '62 min'),
 ('000000000231','assistant','Recebido, Joana. Obrigada! As 6 peças saem quinta.', interval '60 min'),
 ('000000000114','assistant','Oi, Bruno! Chegou a coleção de primavera. Quer que eu separe os tamanhos de sempre?', interval '1 day'),
 ('000000000602','user','Quanto custa a saia Dália?', interval '3 hours 1 min'),
 ('000000000602','assistant','R$ 240,00 à vista ou 3× de R$ 80. Tenho do 36 ao 44. Qual o seu?', interval '3 hours'),
 ('000000000290','user','Sob medida demora quanto?', interval '5 hours 1 min'),
 ('000000000290','assistant','15 dias a partir da prova. Quer marcar? Tenho quinta 14:30.', interval '5 hours')) m(cod,role,txt,idade);

insert into clientes (id, owner_id, nome, telefone, fonte, tags, dados) values
 ('dddd0000-0000-0000-0002-000000000114', :t, 'Bruno Lima · #0114',     '5519990000114', 'Instagram', '{lojista}', '{"ultima":"02/jul","freq":"a cada 30 dias","total":"R$ 9.800","word":"cadê?","tok":"lua","flag":"cade"}'),
 ('dddd0000-0000-0000-0002-000000000417', :t, 'Carla Mendes · #0417',   '5519990000417', 'WhatsApp',  '{lojista}', '{"ultima":"12/ago","freq":"a cada 45 dias","total":"R$ 21.400","word":"pede você","tok":"ciano","flag":""}'),
 ('dddd0000-0000-0000-0002-000000000231', :t, 'Joana Alves · #0231',    '5519990000231', 'WhatsApp',  '{lojista}', '{"ultima":"ontem","freq":"a cada 30 dias","total":"R$ 6.100","word":"dinheiro entrou","tok":"ouro","flag":""}'),
 ('dddd0000-0000-0000-0002-000000000290', :t, 'Lojinha Sol · #0290',    '5519990000290', 'WhatsApp',  '{lojista}', '{"ultima":"20/set","freq":"a cada 60 dias","total":"R$ 4.300","word":"","tok":"","flag":"novo"}'),
 ('dddd0000-0000-0000-0002-000000000602', :t, 'Marina Freitas · #0602', '5519990000602', 'Instagram', '{}',        '{"ultima":"21/set","freq":"primeira compra","total":"R$ 620","word":"","tok":"","flag":"novo"}'),
 ('dddd0000-0000-0000-0002-000000000355', :t, 'Paula Reis · #0355',     '5519990000355', 'WhatsApp',  '{lojista}', '{"ultima":"15/jun","freq":"a cada 30 dias","total":"R$ 7.200","word":"cadê?","tok":"lua","flag":"cade"}'),
 ('dddd0000-0000-0000-0002-000000000588', :t, 'Rafael Souza · #0588',   '5519990000588', 'WhatsApp',  '{}',        '{"ultima":"ontem","freq":"primeira compra","total":"R$ 2.400","word":"pede sua validação","tok":"ciano","flag":"novo"}');

insert into eventos_agenda (id, tenant_id, criado_por, titulo, descricao, tipo, inicio_em, fim_em, status, origem) values
 ('dddd0000-0000-0000-0003-000000000001', :t, :t, 'Prova · Carla Mendes · 40 peças', 'agência', 'compromisso', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '9 hours', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '10 hours', 'pendente', 'manual'),
 ('dddd0000-0000-0000-0003-000000000002', :t, :t, 'Entrega · Rafael Souza · vestido Íris', 'Campinas', 'lembrete', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '10 hours 30 min', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '11 hours', 'pendente', 'agente'),
 ('dddd0000-0000-0000-0003-000000000003', :t, :t, 'Medidas · Paula Reis', 'agência', 'compromisso', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '13 hours', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '13 hours 45 min', 'pendente', 'manual'),
 ('dddd0000-0000-0000-0003-000000000004', :t, :t, 'Retirada · Lojinha Sol · 12 peças', 'loja', 'compromisso', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '14 hours 30 min', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '15 hours', 'pendente', 'manual'),
 ('dddd0000-0000-0000-0003-000000000005', :t, :t, 'Ligação · Bruno Lima · sumiu', 'a Aurora lembra você', 'lembrete', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '16 hours', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '16 hours 30 min', 'pendente', 'agente');

-- contratos e contas a receber (Contratos / Financeiro)
delete from contas_a_receber where tenant_id = :t and descricao like '%(demo)%';
delete from contratos where tenant_id = :t and titulo like '%(demo)%';
insert into contratos (tenant_id, conversa_id, lead_id, nome_template, titulo, status, origem, dados_pagamento, assinado_em, url_selfie, url_documento, url_assinatura)
select :t, ('dddd0000-0000-0000-0001-'||right(l.id::text,12))::uuid, l.id, c.modelo, c.modelo||' · '||l.name||' (demo)', c.st, 'manual_template', jsonb_build_object('valor',c.val,'parcelas',c.parc),
       case when c.st in ('assinado','aguardando_validacao') then now() - c.idade end, 'x', 'x', 'x'
from leads l join (values ('Rafael Souza','Venda parcelada','aguardando_validacao',2400,3,interval '13 hours'),('Carla Mendes','Lojista','assinado',3900,1,interval '50 days'),('Lojinha Sol','Lojista','assinado',4300,2,interval '12 days')) c(nome,modelo,st,val,parc,idade) on c.nome=l.name
where l.tenant_id = :t and l.id::text like 'dddd0000-%';
insert into contas_a_receber (tenant_id, lead_id, descricao, valor, vencimento, status, recebida_em, origem)
select :t, l.id, r.descr||' (demo)', r.val, current_date + r.dias, r.st, case when r.st='recebida' then now() - (r.rec||' days')::interval end, 'manual'
from leads l join (values ('Marina Freitas','saldo · Saia Dália',300,0,'pendente',0),('Lojinha Sol','parcela 1/2 · 12 peças',400,0,'pendente',0),('Bruno Lima','parcela 2/2',950,-12,'pendente',0),
  ('Rafael Souza','parcela 1/3 · vestido Íris',800,3,'pendente',0),('Joana Alves','6 peças',612,0,'recebida',0),('Lojinha Sol','pedido 12 peças',1430,-1,'recebida',1),('Marina Freitas','Saia Dália',620,-1,'recebida',1),('Carla Mendes','reposição',3900,-20,'recebida',20)) r(nome,descr,val,dias,st,rec) on r.nome=l.name
where l.tenant_id = :t and l.id::text like 'dddd0000-%';
commit;
