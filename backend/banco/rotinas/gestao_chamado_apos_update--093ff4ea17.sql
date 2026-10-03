CREATE OR REPLACE FUNCTION public.gestao_chamado_apos_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('gestao.chamado_motivo', true), '')), '');
  v_tipo text;
  v_texto text;
begin
  if new.status is distinct from old.status then
    v_tipo := case
      when new.status = 'aguardando_equipe' then 'escalonamento'
      when new.status in ('resolvido', 'nao_resolvido') then 'fechamento'
      when old.status in ('resolvido', 'nao_resolvido') then 'reabertura'
      when old.status = 'aguardando_equipe' then 'devolucao'
      else 'status' end;
    v_texto := case
      when new.status = 'resolvido' then concat_ws(E'\n', 'Causa: ' || new.causa, 'Solução: ' || new.solucao, 'Resultado: ' || new.resultado, v_motivo)
      when new.status = 'nao_resolvido' then concat_ws(E'\n', 'Justificativa: ' || new.resultado, v_motivo)
      else v_motivo end;
    insert into public.gestao_chamado_eventos (chamado_id, tipo, valor_antigo, valor_novo, texto) values (new.id, v_tipo, old.status, new.status, v_texto);
  end if;
  if new.responsavel is distinct from old.responsavel then
    insert into public.gestao_chamado_eventos (chamado_id, tipo, valor_antigo, valor_novo, texto) values (new.id, 'responsavel', old.responsavel, new.responsavel, v_motivo);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into public.gestao_chamado_eventos (chamado_id, tipo, valor_antigo, valor_novo, texto) values (new.id, 'prioridade', old.prioridade, new.prioridade, v_motivo);
  end if;
  if new.categoria is distinct from old.categoria then
    insert into public.gestao_chamado_eventos (chamado_id, tipo, valor_antigo, valor_novo, texto) values (new.id, 'categoria', old.categoria, new.categoria, v_motivo);
  end if;
  return null;
end $function$

