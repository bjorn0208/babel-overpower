-- Complemento do fix de upsert no rifas-anexos: x-upsert usa
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING, que também exige SELECT
-- (e o caminho de sobrescrita, DELETE). Bucket já é público via CDN —
-- liberar SELECT via RLS não muda a exposição.
create policy "rifas_anon_select" on storage.objects
  for select to anon
  using (bucket_id = 'rifas-anexos');

create policy "rifas_authenticated_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'rifas-anexos');

create policy "rifas_anon_delete" on storage.objects
  for delete to anon
  using (bucket_id = 'rifas-anexos');

create policy "rifas_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'rifas-anexos');
;
