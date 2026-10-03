-- Onda Q (2026-05-14 04:10 BRT)
-- Carol da Excellence Soluções (agente 666d7fe1-...) tem 5 cargos TENANT ricos cravados
-- mas a tabela agente_cargo aponta pros 5 GLOBAIS pobres. Esse fix re-vincula.
-- Idempotente: só atualiza se ainda apontar pro global.

-- Atendimento: global d9de9a5f → tenant eee5bbf7 (mesma bússola, mas tenant ainda permite Curadoria editar)
UPDATE public.agente_cargo
SET cargo_id = 'eee5bbf7-6a56-449b-816d-8db4d06d5e74'
WHERE agente_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
  AND cargo_id = 'd9de9a5f-b475-4d07-8c57-cc212497d4a3';

-- Vendedor: global 5c0aabab (4 campos pobres) → tenant 7216a602 (7 campos + 1468 chars regras Excellence)
UPDATE public.agente_cargo
SET cargo_id = '7216a602-a620-41d6-a737-9eedbc2333c6'
WHERE agente_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
  AND cargo_id = '5c0aabab-07d1-474a-9934-dac3169d0083';

-- Mentor: global 0a1f7a8f → tenant 67d3f88f
UPDATE public.agente_cargo
SET cargo_id = '67d3f88f-9bcb-4c95-a51d-c1434281204d'
WHERE agente_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
  AND cargo_id = '0a1f7a8f-342f-4e37-be85-00d7f41e2932';

-- Financeiro: global 4689fcad → tenant 0e056ba6
UPDATE public.agente_cargo
SET cargo_id = '0e056ba6-d1eb-4f0e-a9f0-18f6a4a0d297'
WHERE agente_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
  AND cargo_id = '4689fcad-2d50-42d4-8403-939d3e815aad';

-- Suporte: global 87e0b285 → tenant 9fe720b2
UPDATE public.agente_cargo
SET cargo_id = '9fe720b2-2ffd-4779-96b3-60b3741ec75d'
WHERE agente_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'
  AND cargo_id = '87e0b285-deec-4023-9c25-42c1767fcfa6';

-- Admin: global 09774af5 — Diego não tem versão TENANT. Manter global (não edita).
;
