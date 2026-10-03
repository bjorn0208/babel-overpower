-- Uploads com upsert:true (x-upsert) no bucket rifas-anexos exigem policy de
-- UPDATE além do INSERT — sem ela o Storage devolve "new row violates RLS"
-- (incidente 2026-08-20: salvar arte na aba Imagens e comprovantes da página
-- pública). Espelha o par de INSERT existente (anon + authenticated).
create policy "rifas_anon_update" on storage.objects
  for update to anon
  using (bucket_id = 'rifas-anexos')
  with check (bucket_id = 'rifas-anexos');

create policy "rifas_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'rifas-anexos')
  with check (bucket_id = 'rifas-anexos');
;
