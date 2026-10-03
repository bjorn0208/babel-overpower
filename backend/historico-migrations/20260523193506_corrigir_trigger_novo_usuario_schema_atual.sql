CREATE OR REPLACE FUNCTION public.processar_novo_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_parent_user_id uuid := NULL;
  v_convidado_por text := new.raw_user_meta_data->>'convidado_por';
BEGIN
  -- Membro de equipe: parent_user_id vem do metadata, validado contra um tenant real.
  IF v_convidado_por IS NOT NULL AND v_convidado_por <> '' THEN
    BEGIN
      SELECT p.id INTO v_parent_user_id
      FROM public.profiles p
      WHERE p.id = v_convidado_por::uuid AND p.parent_user_id IS NULL
      LIMIT 1;
    EXCEPTION WHEN invalid_text_representation THEN
      v_parent_user_id := NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, parent_user_id)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    v_parent_user_id
  );

  -- Agente próprio só pra tenant (membro de equipe não tem agente).
  IF v_parent_user_id IS NULL THEN
    INSERT INTO public.agentes (user_id, nome_agente) VALUES (new.id, '');
  END IF;

  RETURN new;
END;
$function$;
;
