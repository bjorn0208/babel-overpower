CREATE OR REPLACE FUNCTION public.gestao_implementacao_dos_clientes()
 RETURNS TABLE(cliente_id uuid, impl_id uuid, status text, enviado_em timestamp with time zone, concluido_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- artefato impAtivaDoCliente: a implementação aberta; se não houver, a última concluída
  select distinct on (i.cliente_id) i.cliente_id, i.id, i.status, i.enviado_em, i.concluido_em
    from public.gestao_implementacoes i
   where i.deleted_at is null and i.cliente_id is not null
     and public.gestao_tem_papel(array['financeiro','comercial','implementacao','programador','suporte']::text[])
   order by i.cliente_id, (i.status = 'concluida'), i.enviado_em desc nulls last $function$

