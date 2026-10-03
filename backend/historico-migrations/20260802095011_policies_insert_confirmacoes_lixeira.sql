-- As RPCs de exclusão rodam como consultor_dados_ro (sem BYPASSRLS) com as
-- claims do dono — logo precisam de policy de INSERT nas duas tabelas de
-- controle. WITH CHECK amarra a linha ao próprio dono.
set lock_timeout = '2s';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='confirmacoes_exclusao' and policyname='dono_grava_confirmacoes') then
    create policy "dono_grava_confirmacoes" on public.confirmacoes_exclusao
      for insert to authenticated with check (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='confirmacoes_exclusao' and policyname='dono_marca_confirmacao_usada') then
    create policy "dono_marca_confirmacao_usada" on public.confirmacoes_exclusao
      for update to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='lixeira_exclusoes' and policyname='dono_grava_lixeira') then
    create policy "dono_grava_lixeira" on public.lixeira_exclusoes
      for insert to authenticated with check (owner_id = (select auth.uid()));
  end if;
end $$;
;
