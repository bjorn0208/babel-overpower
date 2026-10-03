CREATE OR REPLACE FUNCTION public.gestao_publico_registrar_indicacao(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_sub text := nullif(btrim(p ->> 'submissionId'), ''); v_id uuid; v_ind uuid; v_dia date;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'gestao: corpo invalido' using errcode = '22023'; end if;
  if v_sub is null or length(v_sub) > 100 or coalesce(btrim(p ->> 'leadName'), '') = '' or length(p ->> 'leadName') > 200
     or coalesce(btrim(p ->> 'leadWhatsapp'), '') = '' or length(p ->> 'leadWhatsapp') > 40 or coalesce(btrim(p ->> 'consentText'), '') = '' or length(p ->> 'consentText') > 4000
     or (coalesce(p ->> 'localDate', '') <> '' and p ->> 'localDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'gestao: campos obrigatorios ausentes ou invalidos' using errcode = '22023'; end if;
  select id into v_id from public.gestao_indicacoes where submission_id = v_sub;
  if v_id is not null then return jsonb_build_object('ok', true, 'duplicado', true, 'id', v_id); end if;
  v_dia := coalesce(nullif(p ->> 'localDate', '')::date, (now() at time zone 'America/Sao_Paulo')::date);
  select id into v_ind from public.gestao_indicadores where upper(codigo) = upper(btrim(p ->> 'referrerCode')) and deleted_at is null order by criado_em limit 1;
  insert into public.gestao_indicacoes (indicador_id, referrer_name, referrer_code, lead_nome, lead_whatsapp, nicho, status, origem, data_indicacao, submission_id, consentimento_texto, consentimento_em)
  values (v_ind, left(btrim(p ->> 'referrerName'), 200), upper(left(btrim(p ->> 'referrerCode'), 60)), btrim(p ->> 'leadName'), btrim(p ->> 'leadWhatsapp'), left(p ->> 'niche', 120),
          'novo', 'pagina', v_dia, v_sub, p ->> 'consentText', now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'duplicado', false, 'id', v_id, 'indicadorEncontrado', v_ind is not null);
exception when unique_violation then
  select id into v_id from public.gestao_indicacoes where submission_id = v_sub;
  return jsonb_build_object('ok', true, 'duplicado', true, 'id', v_id);
end $function$

