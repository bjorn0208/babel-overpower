-- Motor ragentic: rifa_painel_agente quebrava sempre que havia rifa ativa
-- (chamada por ragentic-processar-inline e ragentic-tick — AUDITORIA-BACK B-05):
--   ERROR: subquery uses ungrouped column "p.nome" from outer query
-- O "top compradores" agrupa por coalesce(phone, 'nome:'||nome), mas a subquery
-- correlacionada referencia p.nome solto. Correção: calcular a chave numa
-- derivada e agrupar/correlacionar por ela. Mesmo resultado, só passa a compilar.
-- Tolerante: só reescreve se a função existir e o trecho original for encontrado.
do $$
declare
  v_oid  oid;
  v_def  text;
  v_novo text;
begin
  select p.oid into v_oid
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'rifa_painel_agente';
  if v_oid is null then
    raise notice 'rifa_painel_agente não existe — nada a fazer';
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('group by p.chave, p.phone' in v_def) > 0 then
    raise notice 'rifa_painel_agente já corrigida — nada a fazer';
    return;
  end if;

  v_novo := replace(v_def,
    $o$coalesce(p2.phone, 'nome:' || p2.nome) = coalesce(p.phone, 'nome:' || p.nome)$o$,
    $n$coalesce(p2.phone, 'nome:' || p2.nome) = p.chave$n$);

  v_novo := regexp_replace(v_novo,
    $o$from public\.pedidos_rifa p\s+where p\.rifa_id = v_r\.id and p\.status = 'pago'\s+group by coalesce\(p\.phone, 'nome:' \|\| p\.nome\), p\.phone$o$,
    $n$from (select pr.*, coalesce(pr.phone, 'nome:' || pr.nome) as chave
          from public.pedidos_rifa pr
          where pr.rifa_id = v_r.id and pr.status = 'pago') p
    group by p.chave, p.phone$n$);

  if v_novo = v_def or position('p.chave' in v_novo) = 0
     or position($x$group by coalesce(p.phone$x$ in v_novo) > 0 then
    raise exception 'rifa_painel_agente: trecho original não encontrado (já corrigida ou mudou) — revisar à mão';
  end if;

  execute v_novo;
end $$;
