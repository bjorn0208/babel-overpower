-- Bucket público pras imagens de post geradas pelo app Marketing (tool gerar_imagem_post do cargo Mentor).
-- Path convention: marketing-posts/{user_id}/{yyyy_mm}/{uuid}.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-posts', 'marketing-posts', true, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Leitura pública (posts são feitos pra ir pra redes sociais).
drop policy if exists "marketing_posts_select_public" on storage.objects;
create policy "marketing_posts_select_public" on storage.objects
  for select to public
  using (bucket_id = 'marketing-posts');

-- Usuário grava/apaga só no próprio prefixo (primeiro segmento do path = user_id).
drop policy if exists "marketing_posts_insert_own" on storage.objects;
create policy "marketing_posts_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'marketing-posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "marketing_posts_delete_own" on storage.objects;
create policy "marketing_posts_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'marketing-posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- service_role (tool do Mentor grava via edge) tem acesso total ao bucket.
drop policy if exists "marketing_posts_service_full" on storage.objects;
create policy "marketing_posts_service_full" on storage.objects
  for all to service_role
  using (bucket_id = 'marketing-posts')
  with check (bucket_id = 'marketing-posts');
;
