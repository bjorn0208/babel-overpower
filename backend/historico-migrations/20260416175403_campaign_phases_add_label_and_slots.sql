-- 1. Novas colunas
ALTER TABLE public.campaign_phases
ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS slots_obrigatorios text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.campaign_phases.label IS
  'Nome legível da fase (exibido na esteira). Default vem do slug no seed_campaign_phases.';
COMMENT ON COLUMN public.campaign_phases.slots_obrigatorios IS
  'Slugs de slots que precisam estar presentes em lead_cards.dados_capturados pra avançar pra próxima fase.';

-- 2. Atualizar seed_campaign_phases com labels + esteiras enriquecidas
CREATE OR REPLACE FUNCTION public.seed_campaign_phases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_phases jsonb;
BEGIN
  v_phases := CASE NEW.type
    WHEN 'divulgacao' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"respondeu","label":"Respondeu","order_index":2,"is_final_positive":false},
      {"slug":"pediu_info","label":"Pediu info","order_index":3,"is_final_positive":false},
      {"slug":"engajou","label":"Engajou","order_index":4,"is_final_positive":true}
    ]'::jsonb
    WHEN 'venda' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"interessado","label":"Interessado","order_index":2,"is_final_positive":false},
      {"slug":"com_objecao","label":"Com objeção","order_index":3,"is_final_positive":false},
      {"slug":"negociando","label":"Negociando","order_index":4,"is_final_positive":false},
      {"slug":"comprou","label":"Comprou","order_index":5,"is_final_positive":true}
    ]'::jsonb
    WHEN 'pos_venda' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"respondeu","label":"Respondeu","order_index":2,"is_final_positive":false},
      {"slug":"recomprou","label":"Recomprou","order_index":3,"is_final_positive":true}
    ]'::jsonb
    WHEN 'cobranca' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"tentativa","label":"Tentativa","order_index":1,"is_final_positive":false},
      {"slug":"negociando","label":"Negociando","order_index":2,"is_final_positive":false},
      {"slug":"comprovante_enviado","label":"Comprovante enviado","order_index":3,"is_final_positive":false},
      {"slug":"pagou","label":"Pagou","order_index":4,"is_final_positive":true}
    ]'::jsonb
    WHEN 'agendamento' THEN '[
      {"slug":"aguardando","label":"Aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","label":"Abordado","order_index":1,"is_final_positive":false},
      {"slug":"negociando_horario","label":"Negociando horário","order_index":2,"is_final_positive":false},
      {"slug":"agendado","label":"Agendado","order_index":3,"is_final_positive":false},
      {"slug":"compareceu","label":"Compareceu","order_index":4,"is_final_positive":true}
    ]'::jsonb
  END;

  INSERT INTO public.campaign_phases (campaign_id, slug, label, order_index, is_final_positive)
  SELECT NEW.id, p->>'slug', p->>'label', (p->>'order_index')::int, (p->>'is_final_positive')::bool
  FROM jsonb_array_elements(v_phases) p;

  RETURN NEW;
END;
$function$;

-- 3. Backfill label pra phases existentes com label vazio (snake_case -> "Snake Case")
UPDATE public.campaign_phases
SET label = initcap(replace(slug, '_', ' '))
WHERE label = '';
;
