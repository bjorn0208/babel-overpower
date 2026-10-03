CREATE OR REPLACE FUNCTION public.gestao_chamado_antes_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.numero <> old.numero or new.cliente_id <> old.cliente_id or new.aberto_em <> old.aberto_em or new.importado <> old.importado then
    raise exception 'gestao: número, cliente, abertura e origem do chamado não mudam' using errcode = '22023';
  end if;
  new.atualizado_em := now();
  new.passou_pd := old.passou_pd or new.passou_pd;
  if new.status is distinct from old.status then
    new.status_desde := now();
    if new.status = 'aguardando_equipe' then new.passou_pd := true; end if;
    if new.status in ('resolvido', 'nao_resolvido') then new.resolvido_em := now(); else new.resolvido_em := null; end if;
    -- reaberto: causa/solução/resultado antigos saem do chamado (continuam no evento de fechamento); o próximo fechamento pede tudo de novo
    if old.status in ('resolvido', 'nao_resolvido') and new.status not in ('resolvido', 'nao_resolvido') then
      new.causa := null; new.solucao := null; new.resultado := null;
    end if;
  end if;
  return new;
end $function$

