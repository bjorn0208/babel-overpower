CREATE OR REPLACE FUNCTION public.extrair_pii_lead(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_tags      text[];
  v_tag       text;
  v_chave     text;
  v_valor     text;
  v_digitos   text;
  v_cpf       text := NULL;
  v_cnpj      text := NULL;
  v_novas     text[] := '{}';
  v_mascarado text;
BEGIN
  SELECT tenant_id, COALESCE(tags, '{}')
  INTO v_tenant_id, v_tags
  FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  FOREACH v_tag IN ARRAY v_tags LOOP
    v_chave := split_part(v_tag, ':', 1);
    v_valor := substring(v_tag from position(':' in v_tag) + 1);
    v_digitos := regexp_replace(v_valor, '\D', '', 'g');

    IF v_chave IN ('cpf', 'documento_pessoal') AND length(v_digitos) = 11 THEN
      v_cpf := COALESCE(v_cpf, v_digitos);
      v_mascarado := public.mascarar_cpf(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSIF v_chave = 'cnpj' AND length(v_digitos) = 14 THEN
      v_cnpj := COALESCE(v_cnpj, v_digitos);
      v_mascarado := public.mascarar_cnpj(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSIF v_chave = 'documento' AND length(v_digitos) = 11 THEN
      v_cpf := COALESCE(v_cpf, v_digitos);
      v_mascarado := public.mascarar_cpf(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSIF v_chave = 'documento' AND length(v_digitos) = 14 THEN
      v_cnpj := COALESCE(v_cnpj, v_digitos);
      v_mascarado := public.mascarar_cnpj(v_digitos);
      v_novas := array_append(v_novas, v_chave || ':' || v_mascarado);

    ELSE
      v_novas := array_append(v_novas, v_tag);
    END IF;
  END LOOP;

  IF v_cpf IS NOT NULL OR v_cnpj IS NOT NULL THEN
    INSERT INTO public.cofre_pii_lead (lead_id, tenant_id, cpf_real, cnpj_real, cpf_masked, cnpj_masked)
    VALUES (
      p_lead_id, v_tenant_id, v_cpf, v_cnpj,
      CASE WHEN v_cpf IS NOT NULL THEN public.mascarar_cpf(v_cpf) END,
      CASE WHEN v_cnpj IS NOT NULL THEN public.mascarar_cnpj(v_cnpj) END
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      cpf_real    = COALESCE(EXCLUDED.cpf_real,   public.cofre_pii_lead.cpf_real),
      cnpj_real   = COALESCE(EXCLUDED.cnpj_real,  public.cofre_pii_lead.cnpj_real),
      cpf_masked  = COALESCE(EXCLUDED.cpf_masked,  public.cofre_pii_lead.cpf_masked),
      cnpj_masked = COALESCE(EXCLUDED.cnpj_masked, public.cofre_pii_lead.cnpj_masked),
      updated_at  = now();

    UPDATE public.leads SET tags = v_novas WHERE id = p_lead_id;
  END IF;
END;
$function$

