CREATE OR REPLACE FUNCTION public.gestao_publico_registrar_venda(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_sub text := nullif(btrim(p ->> 'submissionId'), ''); v_id uuid; v_arq jsonb := p -> 'arquivo'; v_cent numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'gestao: corpo invalido' using errcode = '22023'; end if;
  if v_sub is null or length(v_sub) > 100 or coalesce(btrim(p ->> 'clientName'), '') = '' or length(p ->> 'clientName') > 200
     or coalesce(btrim(p ->> 'sellerName'), '') = '' or length(p ->> 'sellerName') > 200 or coalesce(btrim(p ->> 'consentText'), '') = '' or length(p ->> 'consentText') > 4000
     or coalesce(p ->> 'saleDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p ->> 'setupCentavos', '') !~ '^[0-9]{1,10}$' then
    raise exception 'gestao: campos obrigatorios ausentes ou invalidos' using errcode = '22023'; end if;
  select id into v_id from public.gestao_vendas where submission_id = v_sub;
  if v_id is not null then return jsonb_build_object('ok', true, 'duplicado', true, 'id', v_id); end if;
  v_cent := (p ->> 'setupCentavos')::numeric / 100;
  if v_arq is not null and jsonb_typeof(v_arq) = 'object' then
    insert into public.gestao_arquivos (id, nome_original, tipo, tamanho, sha256) values ((v_arq ->> 'id')::uuid, v_arq ->> 'nome', v_arq ->> 'tipo', (v_arq ->> 'tamanho')::bigint, v_arq ->> 'sha256')
      on conflict (id) do nothing;
  end if;
  insert into public.gestao_vendas (vendedor_nome, data_venda, plano, setup, cliente_nome, empresa, nicho, whatsapp, email, status, origem, comprovante, submission_id, consentimento_texto, consentimento_em)
  values (btrim(p ->> 'sellerName'), (p ->> 'saleDate')::date, left(p ->> 'plan', 60), v_cent, btrim(p ->> 'clientName'), left(p ->> 'companyName', 200), left(p ->> 'niche', 120),
          left(p ->> 'whatsapp', 40), left(p ->> 'email', 200), 'pendente', 'pagina',
          case when v_arq is not null and jsonb_typeof(v_arq) = 'object' then jsonb_build_object('id', v_arq ->> 'id', 'contentType', v_arq ->> 'tipo', 'sizeBytes', (v_arq ->> 'tamanho')::bigint) end,
          v_sub, p ->> 'consentText', now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'duplicado', false, 'id', v_id);
exception when unique_violation then
  select id into v_id from public.gestao_vendas where submission_id = v_sub;
  return jsonb_build_object('ok', true, 'duplicado', true, 'id', v_id);
end $function$

