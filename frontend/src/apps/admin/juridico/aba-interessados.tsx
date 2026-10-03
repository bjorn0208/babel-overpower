// @ts-nocheck
/**
 * Aba Interessados (admin Jurídico) — leads de `juridico_interesses`.
 * Pipeline de status: novo → contatado → fechado | descartado.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const STATUS = [
  { id: 'novo', rotulo: 'Novo' },
  { id: 'contatado', rotulo: 'Contatado' },
  { id: 'fechado', rotulo: 'Fechado' },
  { id: 'descartado', rotulo: 'Descartado' },
];

const fmtData = (iso) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export function AbaInteressados() {
  const t = useToast();
  const [interesses, setInteresses] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => { void carregar(); }, []);

  async function carregar() {
    const { data, error } = await supabase
      .from('juridico_interesses')
      .select('id, status, observacao, created_at, servico:juridico_servicos(nome), perfil:profiles(full_name, email, phone)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[AbaInteressados] carregar:', error);
      t.error('Erro ao carregar interessados.');
      setInteresses([]);
      return;
    }
    setInteresses(data ?? []);
  }

  async function mudarStatus(item, status) {
    const { error } = await supabase
      .from('juridico_interesses')
      .update({ status })
      .eq('id', item.id);
    if (error) {
      console.error('[AbaInteressados] mudarStatus:', error);
      t.error('Erro ao atualizar status.');
      return;
    }
    setInteresses((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
  }

  const lista = useMemo(
    () => (interesses ?? []).filter((i) => filtro === 'todos' || i.status === filtro),
    [interesses, filtro],
  );

  if (interesses === null) {
    return <div className="os-card center" style={{ padding: 60 }}><div className="muted">Carregando…</div></div>;
  }

  return (
    <div className="col gap-3">
      <div className="row gap-2" style={{ alignItems: 'center' }}>
        <span className={`tab ${filtro === 'todos' ? 'tab-on' : ''}`} onClick={() => setFiltro('todos')}>
          Todos ({interesses.length})
        </span>
        {STATUS.map((s) => (
          <span key={s.id} className={`tab ${filtro === s.id ? 'tab-on' : ''}`} onClick={() => setFiltro(s.id)}>
            {s.rotulo} ({interesses.filter((i) => i.status === s.id).length})
          </span>
        ))}
      </div>

      {lista.length === 0 && (
        <div className="os-card center" style={{ padding: 60 }}>
          <Icon name="users" size={36} stroke="var(--txt-3)" />
          <div className="h3" style={{ marginTop: 12 }}>Nenhum interessado aqui</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Quando um tenant clicar em "Tenho interesse", aparece nessa lista.
          </div>
        </div>
      )}

      <div className="col gap-2">
        {lista.map((i) => (
          <div key={i.id} className="os-card row gap-3" style={{ padding: 14, alignItems: 'center' }}>
            <div
              className="center"
              style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Icon name="userCheck" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3" style={{ fontSize: 14 }}>
                {i.perfil?.full_name || i.perfil?.email || 'Tenant sem nome'}
              </div>
              <div className="muted small" style={{ marginTop: 2 }}>
                {i.servico?.nome || 'Serviço removido'} · {fmtData(i.created_at)}
                {i.perfil?.phone ? ` · ${i.perfil.phone}` : ''}
                {i.perfil?.email ? ` · ${i.perfil.email}` : ''}
              </div>
              {i.observacao && <div className="muted small" style={{ marginTop: 2 }}>“{i.observacao}”</div>}
            </div>
            <select
              className="input"
              style={{ width: 140 }}
              value={i.status}
              onChange={(e) => mudarStatus(i, e.target.value)}
            >
              {STATUS.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
