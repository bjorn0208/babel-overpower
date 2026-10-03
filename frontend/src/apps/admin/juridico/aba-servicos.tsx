// @ts-nocheck
/**
 * Aba Serviços (admin Jurídico) — CRUD de `juridico_servicos`.
 * Excluir = soft delete (deleted_at). preco vazio = "Sob consulta".
 */
import { useEffect, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const fmtPreco = (preco) =>
  preco == null
    ? 'Sob consulta'
    : Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FORM_VAZIO = { id: null, nome: '', descricao: '', preco: '', ordem: 0, is_active: true };

export function AbaServicos() {
  const t = useToast();
  const [servicos, setServicos] = useState(null);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { void carregar(); }, []);

  async function carregar() {
    const { data, error } = await supabase
      .from('juridico_servicos')
      .select('id, nome, descricao, preco, ordem, is_active')
      .is('deleted_at', null)
      .order('ordem');
    if (error) {
      console.error('[AbaServicos] carregar:', error);
      t.error('Erro ao carregar serviços.');
      setServicos([]);
      return;
    }
    setServicos(data ?? []);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      t.error('Nome do serviço é obrigatório.');
      return;
    }
    setSalvando(true);
    const carga = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim(),
      preco: form.preco === '' ? null : Number(form.preco),
      ordem: Number(form.ordem) || 0,
      is_active: form.is_active,
    };
    const q = form.id
      ? supabase.from('juridico_servicos').update(carga).eq('id', form.id)
      : supabase.from('juridico_servicos').insert(carga);
    const { error } = await q;
    setSalvando(false);
    if (error) {
      console.error('[AbaServicos] salvar:', error);
      t.error('Erro ao salvar serviço.');
      return;
    }
    t.success(form.id ? 'Serviço atualizado' : 'Serviço criado');
    setForm(null);
    void carregar();
  }

  async function alternarAtivo(s) {
    const { error } = await supabase
      .from('juridico_servicos')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);
    if (error) {
      console.error('[AbaServicos] alternarAtivo:', error);
      t.error('Erro ao atualizar serviço.');
      return;
    }
    void carregar();
  }

  async function excluir(s) {
    if (!window.confirm(`Excluir "${s.nome}"?\nSome da vitrine dos tenants (soft delete).`)) return;
    const { error } = await supabase
      .from('juridico_servicos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', s.id);
    if (error) {
      console.error('[AbaServicos] excluir:', error);
      t.error('Erro ao excluir serviço.');
      return;
    }
    t.success('Serviço excluído');
    void carregar();
  }

  if (servicos === null) {
    return <div className="os-card center" style={{ padding: 60 }}><div className="muted">Carregando…</div></div>;
  }

  return (
    <div className="col gap-3">
      <div className="row">
        <div className="muted small">{servicos.length} serviço(s) no catálogo.</div>
        <div className="flex-1" />
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...FORM_VAZIO, ordem: servicos.length + 1 })}>
          <Icon name="plus" size={12} /> Novo serviço
        </button>
      </div>

      {servicos.length === 0 && (
        <div className="os-card center" style={{ padding: 60 }}>
          <Icon name="briefcase" size={36} stroke="var(--txt-3)" />
          <div className="h3" style={{ marginTop: 12 }}>Nenhum serviço cadastrado</div>
          <div className="muted small" style={{ marginTop: 4 }}>Crie o primeiro em "Novo serviço".</div>
        </div>
      )}

      <div className="col gap-2">
        {servicos.map((s) => (
          <div key={s.id} className="os-card row gap-3" style={{ padding: 14, alignItems: 'center', opacity: s.is_active ? 1 : 0.55 }}>
            <div
              className="center"
              style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Icon name="briefcase" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3" style={{ fontSize: 14 }}>{s.nome}</div>
              <div className="muted small" style={{ marginTop: 2 }}>{s.descricao || 'Sem descrição'}</div>
            </div>
            <div className="kpi-num os-aurora-text" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{fmtPreco(s.preco)}</div>
            <button className="btn btn-sm" onClick={() => alternarAtivo(s)}>
              {s.is_active ? 'Ativo' : 'Inativo'}
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setForm({ ...s, preco: s.preco ?? '' })}>
              <Icon name="edit" size={14} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => excluir(s)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>

      {form && (
        <>
          <div className="modal-backdrop" onClick={() => setForm(null)} />
          <div className="modal">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="h2">{form.id ? 'Editar serviço' : 'Novo serviço'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setForm(null)}>
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="col gap-2">
              <div>
                <label className="label">Nome</label>
                <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
              <div className="row gap-2">
                <div className="flex-1">
                  <label className="label">Preço (R$) — vazio = sob consulta</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.preco}
                    onChange={(e) => setForm({ ...form, preco: e.target.value })}
                  />
                </div>
                <div style={{ width: 110 }}>
                  <label className="label">Ordem</label>
                  <input
                    className="input"
                    type="number"
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: e.target.value })}
                  />
                </div>
              </div>
              <label className="row gap-2" style={{ alignItems: 'center', cursor: 'pointer', marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span className="small">Ativo (visível na vitrine dos tenants)</span>
              </label>
            </div>

            <div className="row gap-2" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setForm(null)} disabled={salvando}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                <Icon name="check" size={13} /> {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
