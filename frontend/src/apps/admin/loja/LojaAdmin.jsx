import { useState, useEffect } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

function LojaTab({ tabela, tipo }) {
  const t = useToast();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null); // registro em edição (ou novo)
  const [modelos, setModelos] = useState([]);
  const recarregar = async () => {
    const r = await window.RAGENTIC_HOOKS?.lojaListar?.(tabela);
    setList(r || []);
  };
  useEffect(() => { recarregar(); }, [tabela]);
  useEffect(() => {
    if (tipo === 'plano') {
      window.RAGENTIC_HOOKS?.modelosLlm?.().then((m) => setModelos(m || []));
    }
  }, [tipo]);

  const novo = () => {
    if (tipo === 'plano')        setEdit({ nome:'', descricao:'', preco_mensal:0, max_conversas:0, max_ciclos_por_conversa:4, dias_expiracao:30, max_storage_mb:0, modelo_llm_id:null, ordem:(list?.length||0)+1, is_active:true });
    else if (tipo === 'pacote')  setEdit({ nome:'', descricao:'', conversas:0, preco:0, is_active:true });
    else if (tipo === 'implantacao') setEdit({ nome:'', descricao:'', preco:0, is_active:true });
    else                         setEdit({ nome:'', descricao:'', preco:0, is_active:true });
  };
  const salvar = async () => {
    const r = await window.RAGENTIC_HOOKS?.lojaSalvar?.(tabela, edit);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    t.success('Salvo');
    setEdit(null);
    recarregar();
  };
  const remover = async (id) => {
    if (!window.confirm('Remover definitivamente?')) return;
    const r = await window.RAGENTIC_HOOKS?.lojaRemover?.(tabela, id);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    t.success('Removido');
    recarregar();
  };

  if (list === null) return <div className="muted" style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div className="col gap-3">
      <div className="row" style={{ justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={novo}><Icon name="plus" size={13}/> Novo</button>
      </div>
      {!list.length && <div className="muted small" style={{ padding: 16 }}>Nada cadastrado.</div>}
      <div className="col gap-2">
        {list.map((p) => (
          <div key={p.id} className="os-card row gap-3" style={{ padding: 14, alignItems:'center' }}>
            <div style={{ flex: 1 }}>
              <div className="row gap-2">
                <div className="h3" style={{ fontSize: 14 }}>{p.nome}</div>
                {p.is_active === false && <span className="badge badge-err">inativo</span>}
                {tipo === 'plano' && <span className="badge badge-info">{p.max_conversas} conv · {p.dias_expiracao}d</span>}
                {tipo === 'pacote' && <span className="badge badge-info">+{p.conversas} conversas</span>}
              </div>
              <div className="muted small">{p.descricao || '—'}</div>
            </div>
            <div className="kpi-num os-aurora-text" style={{ fontSize: 18 }}>
              R$ {Number(p.preco_mensal ?? p.preco ?? 0).toLocaleString('pt-BR')}
              {tipo === 'plano' && <span className="muted small">/mês</span>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEdit(p)} title="Editar"><Icon name="edit" size={13}/></button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remover(p.id)} title="Remover"><Icon name="x" size={13}/></button>
          </div>
        ))}
      </div>

      {edit && (
        <>
          <div className="modal-backdrop" onClick={() => setEdit(null)}></div>
          <div className="modal" style={{ width: 600, maxHeight: '88vh', overflowY:'auto' }}>
            <div className="row" style={{ justifyContent:'space-between', marginBottom: 12 }}>
              <div className="h2">{edit.id ? 'Editar' : 'Novo'} · {tipo}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEdit(null)}><Icon name="x" size={14}/></button>
            </div>
            <div className="col gap-3">
              <div><label className="label">Nome</label>
                <input className="input" value={edit.nome || ''} onChange={(e) => setEdit({...edit, nome:e.target.value})} /></div>
              <div><label className="label">Descrição</label>
                <textarea className="input" rows={3} value={edit.descricao || ''} onChange={(e) => setEdit({...edit, descricao:e.target.value})} /></div>

              {tipo === 'plano' && (
                <>
                  <div className="row gap-3">
                    <div style={{ flex:1 }}><label className="label">Preço mensal (R$)</label>
                      <input className="input mono" type="number" step="0.01" value={edit.preco_mensal || 0} onChange={(e) => setEdit({...edit, preco_mensal:Number(e.target.value)})} /></div>
                    <div style={{ flex:1 }}><label className="label">Max conversas</label>
                      <input className="input mono" type="number" value={edit.max_conversas || 0} onChange={(e) => setEdit({...edit, max_conversas:Number(e.target.value)})} /></div>
                  </div>
                  <div className="row gap-3">
                    <div style={{ flex:1 }}><label className="label">Max ciclos/conversa</label>
                      <input className="input mono" type="number" value={edit.max_ciclos_por_conversa || 0} onChange={(e) => setEdit({...edit, max_ciclos_por_conversa:Number(e.target.value)})} /></div>
                    <div style={{ flex:1 }}><label className="label">Dias até expirar</label>
                      <input className="input mono" type="number" value={edit.dias_expiracao || 0} onChange={(e) => setEdit({...edit, dias_expiracao:Number(e.target.value)})} /></div>
                    <div style={{ flex:1 }}><label className="label">Storage (MB)</label>
                      <input className="input mono" type="number" value={edit.max_storage_mb || 0} onChange={(e) => setEdit({...edit, max_storage_mb:Number(e.target.value)})} /></div>
                  </div>
                  <div className="row gap-3">
                    <div style={{ flex:1 }}><label className="label">Modelo LLM</label>
                      <select className="input" value={edit.modelo_llm_id || ''} onChange={(e) => setEdit({...edit, modelo_llm_id: e.target.value || null})}>
                        <option value="" style={{ background:'#1a1530' }}>— nenhum —</option>
                        {modelos.map((m) => <option key={m.id} value={m.id} style={{ background:'#1a1530' }}>{m.nome}</option>)}
                      </select></div>
                    <div style={{ width: 120 }}><label className="label">Ordem</label>
                      <input className="input mono" type="number" value={edit.ordem || 0} onChange={(e) => setEdit({...edit, ordem:Number(e.target.value)})} /></div>
                  </div>
                </>
              )}

              {tipo === 'pacote' && (
                <div className="row gap-3">
                  <div style={{ flex:1 }}><label className="label">Conversas extras</label>
                    <input className="input mono" type="number" value={edit.conversas || 0} onChange={(e) => setEdit({...edit, conversas:Number(e.target.value)})} /></div>
                  <div style={{ flex:1 }}><label className="label">Preço (R$)</label>
                    <input className="input mono" type="number" step="0.01" value={edit.preco || 0} onChange={(e) => setEdit({...edit, preco:Number(e.target.value)})} /></div>
                </div>
              )}

              {(tipo === 'implantacao' || tipo === 'plus') && (
                <div><label className="label">Preço (R$)</label>
                  <input className="input mono" type="number" step="0.01" value={edit.preco || 0} onChange={(e) => setEdit({...edit, preco:Number(e.target.value)})} /></div>
              )}

              <label className="row gap-2" style={{ cursor:'pointer' }}>
                <input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({...edit, is_active:e.target.checked})} />
                <span>Ativo</span>
              </label>
            </div>
            <div className="row gap-2" style={{ marginTop: 18, justifyContent:'flex-end' }}>
              <button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar}><Icon name="check" size={13}/> Salvar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function LojaAdmin() {
  const [tab, setTab] = useState('planos');
  const tabs = [
    ['planos', 'Planos', 'package'],
    ['pacotes', 'Pacotes Extras', 'plus'],
    ['implantacao', 'Implantação', 'briefcase'],
    ['plus', 'Sócio Comercial', 'star'],
  ];
  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent:'space-between', marginBottom: 14 }}>
        <div>
          <div className="h1">Loja · Admin</div>
          <div className="muted small" style={{ marginTop: 4 }}>Preços e ofertas que aparecem para os tenants.</div>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {tabs.map(([k, l, ic]) => (
          <span key={k} className={`tab ${tab===k?'tab-on':''}`} onClick={() => setTab(k)}><Icon name={ic} size={12}/> {l}</span>
        ))}
      </div>
      {tab === 'planos' && <LojaTab tabela="loja_planos" tipo="plano" />}
      {tab === 'pacotes' && <LojaTab tabela="loja_pacotes_extra" tipo="pacote" />}
      {tab === 'implantacao' && <LojaTab tabela="loja_implantacao" tipo="implantacao" />}
      {tab === 'plus' && <LojaTab tabela="loja_plus" tipo="plus" />}
    </div>
  );
}
