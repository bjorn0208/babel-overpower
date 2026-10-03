-- Corrige advisor public_bucket_allows_listing: o bucket é public=true, então a leitura
-- por URL pública (/object/public/...) já funciona SEM policy. A policy SELECT broad só
-- permitia LISTAR todos os objetos de todos os tenants via API — vazamento. Troca por
-- SELECT restrito ao dono do path (primeiro segmento = user_id), o que isola tenants e
-- ainda habilita a galeria "minhas imagens" do próprio usuário.
drop policy if exists "marketing_posts_select_public" on storage.objects;

create policy "marketing_posts_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'marketing-posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
;
