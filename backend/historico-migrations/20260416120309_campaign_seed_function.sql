CREATE OR REPLACE FUNCTION public.seed_campaign_phases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_phases jsonb;
BEGIN
  v_phases := CASE NEW.type
    WHEN 'divulgacao' THEN '[
      {"slug":"aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","order_index":1,"is_final_positive":false},
      {"slug":"respondeu","order_index":2,"is_final_positive":false},
      {"slug":"engajou","order_index":3,"is_final_positive":true}
    ]'::jsonb
    WHEN 'venda' THEN '[
      {"slug":"aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","order_index":1,"is_final_positive":false},
      {"slug":"interessado","order_index":2,"is_final_positive":false},
      {"slug":"negociando","order_index":3,"is_final_positive":false},
      {"slug":"comprou","order_index":4,"is_final_positive":true}
    ]'::jsonb
    WHEN 'pos_venda' THEN '[
      {"slug":"aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","order_index":1,"is_final_positive":false},
      {"slug":"respondeu","order_index":2,"is_final_positive":false},
      {"slug":"recomprou","order_index":3,"is_final_positive":true}
    ]'::jsonb
    WHEN 'cobranca' THEN '[
      {"slug":"aguardando","order_index":0,"is_final_positive":false},
      {"slug":"tentativa","order_index":1,"is_final_positive":false},
      {"slug":"negociando","order_index":2,"is_final_positive":false},
      {"slug":"pagou","order_index":3,"is_final_positive":true}
    ]'::jsonb
    WHEN 'agendamento' THEN '[
      {"slug":"aguardando","order_index":0,"is_final_positive":false},
      {"slug":"abordado","order_index":1,"is_final_positive":false},
      {"slug":"negociando_horario","order_index":2,"is_final_positive":false},
      {"slug":"agendado","order_index":3,"is_final_positive":true}
    ]'::jsonb
  END;

  INSERT INTO public.campaign_phases (campaign_id, slug, order_index, is_final_positive)
  SELECT NEW.id, p->>'slug', (p->>'order_index')::int, (p->>'is_final_positive')::bool
  FROM jsonb_array_elements(v_phases) p;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_seed_phases ON public.campaigns;
CREATE TRIGGER campaigns_seed_phases
  AFTER INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_campaign_phases();
;
