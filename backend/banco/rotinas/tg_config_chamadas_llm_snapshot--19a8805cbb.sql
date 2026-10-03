CREATE OR REPLACE FUNCTION public.tg_config_chamadas_llm_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.historico_config_chamadas_llm
    (chave, versao, modelo, temperatura, max_tokens, prompt_template, itens_produzidos,
     escopo, nicho_id, tenant_id, custo_teto_diario, notas, posicao, schedule, json_mode,
     alterado_em, alterado_por)
  VALUES
    (OLD.chave, OLD.versao, OLD.modelo, OLD.temperatura, OLD.max_tokens, OLD.prompt_template, OLD.itens_produzidos,
     OLD.escopo, OLD.nicho_id, OLD.tenant_id, OLD.custo_teto_diario, OLD.notas, OLD.posicao, OLD.schedule, OLD.json_mode,
     now(), NEW.atualizado_por);
  RETURN NEW;
END;
$function$

