-- Buckets do Storage (o dump do schema não traz storage.buckets). Visibilidade conforme historico-migrations;
-- os sem registro no histórico ficam privados. Idempotente.
insert into storage.buckets (id, name, public) values
 ('admin-ia-uploads','admin-ia-uploads',false),('agent-files','agent-files',false),('anexos-chat','anexos-chat',false),('avatars','avatars',true),
 ('chat-attachments','chat-attachments',false),('client-documents','client-documents',false),('comprovantes','comprovantes',false),('consultas-anexos','consultas-anexos',true),
 ('contract-signatures','contract-signatures',true),('curadoria-arquivos','curadoria-arquivos',false),('disparo-lead-midias','disparo-lead-midias',false),('documentos-cliente','documentos-cliente',false),
 ('financeiro','financeiro',false),('indicacao-assets','indicacao-assets',true),('logos','logos',true),('marketing-posts','marketing-posts',true),('mestre-anexos','mestre-anexos',false),
 ('notification-sounds','notification-sounds',false),('payment-proofs','payment-proofs',false),('produto-midias','produto-midias',true),('profile-photos','profile-photos',true),
 ('reino','reino',false),('rifas-anexos','rifas-anexos',true)
on conflict (id) do nothing;
