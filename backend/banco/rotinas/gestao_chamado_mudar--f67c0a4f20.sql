CREATE OR REPLACE FUNCTION public.gestao_chamado_mudar(p_chamado uuid, p_mudancas jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.gestao_chamados;
  v_chaves text[] := array(select jsonb_object_keys(coalesce(p_mudancas, '{}'::jsonb)) order by 1);
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_status text;
  v_fechado boolean;
  v_suporte boolean := public.gestao_tem_papel(array['suporte']::text[]);
  v_depois public.gestao_chamados;
begin
  select * into c from public.gestao_chamados where id = p_chamado and deleted_at is null for update;
  if c.id is null then raise exception 'gestao: chamado não encontrado' using errcode = '22023'; end if;
  if cardinality(v_chaves) = 0 or exists (select 1 from unnest(v_chaves) k where k not in ('status','responsavel','prioridade','categoria','causa','solucao','resultado')) then
    raise exception 'gestao: campo que não pode ser mudado aqui' using errcode = '22023';
  end if;
  v_status := coalesce(p_mudancas->>'status', c.status);
  v_fechado := c.status in ('resolvido', 'nao_resolvido');
  if not v_suporte and not public.gestao_tem_papel(array['programador']::text[]) then
    raise exception 'gestao: sem permissão para mudar este chamado' using errcode = '42501';
  end if;
  if not v_suporte then
    if not (public.gestao_tem_papel(array['programador']::text[]) and c.passou_pd and c.status = 'aguardando_equipe'
            and v_chaves = array['status'] and v_status = 'andamento') then
      raise exception 'gestao: o P&D só pode devolver o chamado ao Suporte' using errcode = '42501';
    end if;
  end if;
  if v_fechado and not (v_chaves = array['status'] and v_status in ('aberto', 'andamento')) then
    raise exception 'gestao: chamado fechado; use Reabrir' using errcode = '22023';
  end if;
  if v_motivo is null and v_status is distinct from c.status and (v_fechado or v_status = 'aguardando_equipe' or c.status = 'aguardando_equipe')
     and v_status not in ('resolvido', 'nao_resolvido') then
    raise exception 'gestao: informe o motivo' using errcode = '22023';
  end if;
  v_depois := c;
  v_depois.status := v_status;
  if p_mudancas ? 'responsavel' then v_depois.responsavel := nullif(btrim(coalesce(p_mudancas->>'responsavel', '')), ''); end if;
  if p_mudancas ? 'prioridade' then v_depois.prioridade := p_mudancas->>'prioridade'; end if;
  if p_mudancas ? 'categoria' then v_depois.categoria := p_mudancas->>'categoria'; end if;
  if p_mudancas ? 'causa' then v_depois.causa := nullif(btrim(coalesce(p_mudancas->>'causa', '')), ''); end if;
  if p_mudancas ? 'solucao' then v_depois.solucao := nullif(btrim(coalesce(p_mudancas->>'solucao', '')), ''); end if;
  if p_mudancas ? 'resultado' then v_depois.resultado := nullif(btrim(coalesce(p_mudancas->>'resultado', '')), ''); end if;
  if v_status = 'resolvido' and (v_depois.causa is null or v_depois.solucao is null or v_depois.resultado is null) then
    raise exception 'gestao: para resolver, preencha causa, solução e resultado' using errcode = '22023';
  end if;
  if v_status = 'nao_resolvido' and v_depois.resultado is null then
    raise exception 'gestao: para fechar como não resolvido, escreva a justificativa' using errcode = '22023';
  end if;
  if v_depois.status is not distinct from c.status and v_depois.responsavel is not distinct from c.responsavel
     and v_depois.prioridade is not distinct from c.prioridade and v_depois.categoria is not distinct from c.categoria
     and v_depois.causa is not distinct from c.causa and v_depois.solucao is not distinct from c.solucao
     and v_depois.resultado is not distinct from c.resultado then
    raise exception 'gestao: nada mudou' using errcode = '22023';
  end if;
  perform set_config('gestao.chamado_motivo', coalesce(v_motivo, ''), true);
  update public.gestao_chamados set status = v_depois.status, responsavel = v_depois.responsavel, prioridade = v_depois.prioridade,
    categoria = v_depois.categoria, causa = v_depois.causa, solucao = v_depois.solucao, resultado = v_depois.resultado
  where id = c.id;
  perform set_config('gestao.chamado_motivo', '', true);
end $function$

