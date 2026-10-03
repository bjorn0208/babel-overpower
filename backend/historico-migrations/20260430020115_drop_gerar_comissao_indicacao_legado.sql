-- Função+trigger antigo apontavam pra leads.indicacao_campanha_id e indicacao_campanhas/indicacao_comissoes (já dropadas)
DROP TRIGGER IF EXISTS trg_gerar_comissao_indicacao ON public.leads;
DROP FUNCTION IF EXISTS public.gerar_comissao_indicacao();
;
