// @ts-nocheck
/* eslint-disable */
/**
 * App admin "Aplicativos" — catálogo de aplicativos instaláveis da plataforma.
 * CRUD direto da tabela loja_aplicativos via window.RAGENTIC_HOOKS.lojaListar/Salvar/Remover.
 * preco_mensal NULL = grátis. Slug bate com o slug do bundle.jsx pra app aparecer no Launchpad/Spotlight.
 */
import { useState, useEffect } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const ICONES_SUGERIDOS = [
  'fileText', 'edit', 'pencil', 'bookOpen', 'note',
  'image', 'video', 'music', 'mic',
  'calculator', 'calendar', 'clock', 'timer',
  'globe', 'mail', 'phone', 'map',
  'briefcase', 'package', 'shoppingBag', 'tag',
  'star', 'heart', 'bookmark', 'flag',
  'database', 'server', 'cloud', 'shield',
  'grid', 'layers', 'box', 'puzzle',
];

const CATEGORIAS = [
  { id: 'produtividade', nome: 'Produtividade' },
  { id: 'criativo', nome: 'Criativo' },
  { id: 'comunicacao', nome: 'Comunicação' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'utilidades', nome: 'Utilidades' },
  { id: 'geral', nome: 'Geral' },
];

export function AppAplicativosAdmin() {
  const t = useToast();
  const [lista, setLista] = useState(null);
  const [edicao, setEdicao] = useState(null);
  const [nichos, setNichos] = useState([]);
  const [nichoSel, setNichoSel] = useState(new Set()); // nicho_ids vinculados ao app em edição
  const [modoNicho, setModoNicho] = useState('todos'); // 'todos' = global | 'especificos'

  const recarregar = async () => {
    const r = await window.RAGENTIC_HOOKS?.lojaListar?.('loja_aplicativos');
    setLista(r || []);
  };
  useEffect(() => { recarregar(); }, []);

  // Nichos ativos pro seletor do modal (carrega uma vez).
  useEffect(() => {
    supabase.from('nichos').select('id, slug, nome_exibicao').eq('ativo', true)
      .order('nome_exibicao', { ascending: true })
      .then(({ data }) => setNichos(data || []));
  }, []);

  // Ao abrir a edição de um app existente, puxa os vínculos de nicho. Sem vínculo = global.
  useEffect(() => {
    if (!edicao?.id) { setModoNicho('todos'); setNichoSel(new Set()); return; }
    supabase.from('aplicativos_nicho').select('nicho_id').eq('aplicativo_id', edicao.id)
      .then(({ data }) => {
        const ids = new Set((data || []).map((r) => r.nicho_id));
        setNichoSel(ids);
        setModoNicho(ids.size > 0 ? 'especificos' : 'todos');
      });
  }, [edicao?.id]);

  // Regra da exceção: global = nenhuma linha; específico = exatamente os nichos marcados.
  const sincronizarNichos = async (appId) => {
    await supabase.from('aplicativos_nicho').delete().eq('aplicativo_id', appId);
    if (modoNicho === 'especificos' && nichoSel.size > 0) {
      const linhas = Array.from(nichoSel).map((nicho_id) => ({ aplicativo_id: appId, nicho_id }));
      await supabase.from('aplicativos_nicho').insert(linhas);
    }
  };

  const toggleNicho = (id) => {
    setNichoSel((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const novo = () => setEdicao({
    slug: '',
    nome: '',
    descricao: '',
    icone: 'grid',
    categoria: 'geral',
    preco_mensal: null,
    ordem: (lista?.length || 0) + 1,
    is_active: true,
  });

  const salvar = async () => {
    if (!edicao.slug?.trim() || !edicao.nome?.trim()) {
      t.error('Slug e nome são obrigatórios.');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(edicao.slug)) {
      t.error('Slug só pode ter letras minúsculas, números e hífen.');
      return;
    }
    const r = await window.RAGENTIC_HOOKS?.lojaSalvar?.('loja_aplicativos', edicao);
    if (r?.erro) { t.error('Falha: ' + r.erro); return; }
    if (r?.id) { await sincronizarNichos(r.id); }
    t.success('Aplicativo salvo');
    setEdicao(null);
    recarregar();
  };

  const remover = async (id, nome) => {
    if (!window.confirm(`Remover o aplicativo "${nome}" do catálogo?\nUsuários que já instalaram perderão acesso.`)) return;
    const r = await window.RAGENTIC_HOOKS?.lojaRemover?.('loja_aplicativos', id);
    if (r?.erro) { t.error('Falha: ' + r.erro); return; }
    t.success('Aplicativo removido');
    recarregar();
  };

  const fmtPreco = (preco) =>
    preco == null
      ? 'Grátis'
      : Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/mês';

  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14, alignItems: 'flex-start' }}>
        <div>
          <div className="h1">Aplicativos</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Catálogo de apps instaláveis. Aparecem na aba "Aplicativos" do app Loja dos tenants.
          </div>
        </div>
        <button className="btn btn-primary" onClick={novo}>
          <Icon name="plus" size={13} /> Novo aplicativo
        </button>
      </div>

      {lista === null && <div className="muted" style={{ padding: 24 }}>Carregando…</div>}
      {lista !== null && lista.length === 0 && (
        <div className="os-card center" style={{ padding: 60 }}>
          <Icon name="package" size={40} stroke="var(--txt-3)" />
          <div className="h3" style={{ marginTop: 14 }}>Nenhum aplicativo no catálogo</div>
          <div className="muted small" style={{ marginTop: 6 }}>Clique em "Novo aplicativo" pra cadastrar o primeiro.</div>
        </div>
      )}

      {lista !== null && lista.length > 0 && (
        <div className="col gap-2">
          {lista.map((a) => (
            <div key={a.id} className="os-card row gap-3" style={{ padding: 14, alignItems: 'center' }}>
              <div
                className="center"
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Icon name={a.icone || 'grid'} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row gap-2" style={{ alignItems: 'center' }}>
                  <div className="h3" style={{ fontSize: 14 }}>{a.nome}</div>
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.06)' }}>{a.slug}</span>
                  {a.is_active === false && <span className="badge badge-err">inativo</span>}
                  <span className="badge badge-info">{a.categoria || 'geral'}</span>
                </div>
                {a.descricao && <div className="muted small" style={{ marginTop: 4 }}>{a.descricao}</div>}
              </div>
              <div className="kpi-num os-aurora-text" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
                {fmtPreco(a.preco_mensal)}
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEdicao(a)} title="Editar">
                <Icon name="edit" size={13} />
              </button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remover(a.id, a.nome)} title="Remover">
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {edicao && (
        <>
          <div className="modal-backdrop" onClick={() => setEdicao(null)}></div>
          <div className="modal" style={{ width: 620, maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="h2">{edicao.id ? 'Editar aplicativo' : 'Novo aplicativo'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEdicao(null)}>
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="col gap-3">
              <div className="row gap-3">
                <div style={{ flex: 2 }}>
                  <label className="label">Nome</label>
                  <input
                    className="input"
                    value={edicao.nome || ''}
                    onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                    placeholder="Ex: Textos"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">Slug</label>
                  <input
                    className="input mono"
                    value={edicao.slug || ''}
                    onChange={(e) => setEdicao({ ...edicao, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="textos"
                    disabled={!!edicao.id}
                  />
                  {edicao.id && <div className="muted small" style={{ marginTop: 4 }}>Slug não pode ser alterado.</div>}
                </div>
              </div>

              <div>
                <label className="label">Descrição</label>
                <textarea
                  className="input"
                  rows={3}
                  value={edicao.descricao || ''}
                  onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })}
                  placeholder="O que o app faz e por que instalar?"
                />
              </div>

              <div>
                <label className="label">Ícone</label>
                <div className="row gap-2" style={{ flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto', padding: 6, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                  {ICONES_SUGERIDOS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      className="btn btn-icon"
                      onClick={() => setEdicao({ ...edicao, icone: ic })}
                      title={ic}
                      style={{
                        width: 38, height: 38,
                        background: edicao.icone === ic ? 'var(--os-acento-1)' : 'rgba(255,255,255,0.03)',
                        border: edicao.icone === ic ? '1px solid var(--os-acento-1)' : '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <Icon name={ic} size={16} />
                    </button>
                  ))}
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  Selecionado: <span className="mono">{edicao.icone}</span>
                </div>
              </div>

              <div className="row gap-3">
                <div style={{ flex: 1 }}>
                  <label className="label">Categoria</label>
                  <select
                    className="input"
                    value={edicao.categoria || 'geral'}
                    onChange={(e) => setEdicao({ ...edicao, categoria: e.target.value })}
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.id} value={c.id} style={{ background: '#1a1530' }}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 140 }}>
                  <label className="label">Ordem</label>
                  <input
                    className="input mono"
                    type="number"
                    value={edicao.ordem ?? 0}
                    onChange={(e) => setEdicao({ ...edicao, ordem: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="label">Preço mensal</label>
                <div className="row gap-2" style={{ alignItems: 'center' }}>
                  <label className="row gap-2" style={{ cursor: 'pointer', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={edicao.preco_mensal == null}
                      onChange={(e) => setEdicao({ ...edicao, preco_mensal: e.target.checked ? null : 0 })}
                    />
                    <span>Grátis</span>
                  </label>
                  {edicao.preco_mensal != null && (
                    <input
                      className="input mono"
                      type="number"
                      step="0.01"
                      min="0"
                      value={edicao.preco_mensal}
                      onChange={(e) => setEdicao({ ...edicao, preco_mensal: Number(e.target.value) })}
                      style={{ flex: 1 }}
                      placeholder="0,00"
                    />
                  )}
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  App pago usa o mesmo fluxo de pagamento dos planos: PIX + comprovante.
                </div>
              </div>

              <div>
                <label className="label">Disponível em</label>
                <div className="row gap-3" style={{ marginBottom: 8 }}>
                  <label className="row gap-2" style={{ cursor: 'pointer', alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="modo-nicho"
                      checked={modoNicho === 'todos'}
                      onChange={() => setModoNicho('todos')}
                    />
                    <span>Todos os nichos (global)</span>
                  </label>
                  <label className="row gap-2" style={{ cursor: 'pointer', alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="modo-nicho"
                      checked={modoNicho === 'especificos'}
                      onChange={() => setModoNicho('especificos')}
                    />
                    <span>Nichos específicos</span>
                  </label>
                </div>
                {modoNicho === 'especificos' && (
                  <div
                    className="col gap-1"
                    style={{ padding: 8, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}
                  >
                    {nichos.length === 0 && <div className="muted small">Nenhum nicho ativo cadastrado.</div>}
                    {nichos.map((n) => (
                      <label key={n.id} className="row gap-2" style={{ cursor: 'pointer', alignItems: 'center' }}>
                        <input type="checkbox" checked={nichoSel.has(n.id)} onChange={() => toggleNicho(n.id)} />
                        <span>{n.nome_exibicao || n.slug}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="muted small" style={{ marginTop: 4 }}>
                  Global aparece pra todos os tenants. Específico só aparece pros tenants do(s) nicho(s) marcado(s) — ex: Consulta só no limpa-nome.
                </div>
              </div>

              <label className="row gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={edicao.is_active !== false}
                  onChange={(e) => setEdicao({ ...edicao, is_active: e.target.checked })}
                />
                <span>Ativo (aparece pros tenants instalarem)</span>
              </label>
            </div>

            <div className="row gap-2" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEdicao(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar}>
                <Icon name="check" size={13} /> Salvar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
