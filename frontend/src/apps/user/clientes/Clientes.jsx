// @ts-nocheck
/* eslint-disable */
/**
 * App Clientes — extraído de bundle.jsx (era L4926-L5049).
 * Lista de clientes convertidos com painel lateral de detalhes.
 * Consome window.RAGENTIC_DATA.CLIENTES (ou LEADS como fallback).
 */
import { useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

export function Clientes() {
  const t = useToast();
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);
  // Modal "Novo cliente": null = fechado; objeto = campos digitados.
  const [novo, setNovo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState(false);

  // PR-12: prefere clientes reais; cai pra leads se ainda não houver clientes.
  const cores = ['#7c5ce0', '#3ac9a0', '#c93a8a', '#a96adb', '#e0a23a', '#5b8bea', '#3aa6c9', '#c97a3a'];
  // window.RAGENTIC_DATA pode não ter sido injetado — optional chaining evita crash.
  const fonteReal = window.RAGENTIC_DATA?.CLIENTES || [];
  // Estado local: cliente criado agora aparece na lista sem recarregar o bundle.
  const [fonteLocal, setFonteLocal] = useState(fonteReal.length ? fonteReal : (window.RAGENTIC_DATA?.LEADS || []));

  const criarCliente = async () => {
    const nome = (novo?.nome || '').trim();
    const telefone = (novo?.telefone || '').trim();
    if (!nome || !telefone) { t.error('Nome e telefone são obrigatórios.'); return; }
    setSalvando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: u } = await sb.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('Sem sessão — entre de novo.');
      const insert = { nome, telefone, owner_id: uid, fonte: 'manual' };
      const email = (novo?.email || '').trim();
      if (email) insert.email = email;
      const { data, error } = await sb.from('clientes').insert(insert).select('id, criado_em').single();
      if (error) throw error;
      const clienteNovo = {
        id: data.id,
        nome,
        avatar: nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
        email,
        phone: telefone,
        fonte: 'manual',
        tags: [],
        dados: {},
        criado: (data.criado_em || '').slice(0, 10),
      };
      setFonteLocal((f) => [clienteNovo, ...f]);
      try {
        const W = window.RAGENTIC_DATA;
        if (W) W.CLIENTES = [clienteNovo, ...(W.CLIENTES || [])];
      } catch (_) { /* cache do bundle é enriquecimento */ }
      t.success(`Cliente "${nome}" criado.`);
      setNovo(null);
    } catch (e) {
      t.error('Falha ao criar cliente: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  const clientes = fonteLocal.map((l, i) => ({
    id: l.id,
    nome: l.nome,
    avatar: l.avatar,
    cor: cores[i % cores.length],
    // Sem e-mail real → string vazia (a UI mostra "sem e-mail"). Antes fabricava
    // um `nome@—` falso que parecia dado real.
    email: l.email || (l.dados?.email) || '',
    phone: l.phone || l.telefone || '',
    plano: l.produto || l.dados?.plano || 'Sem plano',
    contratos: l.dados?.contratos || 0,
    ltv: l.pontuacao || l.dados?.ltv || 0,
    status: l.hot ? 'ativo' : (l.fase === 'cancelado' ? 'cancelado' : 'ativo'),
    ultima_conversa: l.created || l.criado || '—',
    tags: l.tags || [],
  }));
  const filtered = clientes.filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.email.toLowerCase().includes(busca.toLowerCase()));
  const totalLtv = clientes.reduce((s, c) => s + (c.ltv || 0), 0);
  const ativos = clientes.filter(c => c.status === 'ativo').length;

  const exportarClientes = async () => {
    if (exportando || filtered.length === 0) return;
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const linhas = filtered.map(c => ({
        Nome: c.nome,
        Email: c.email,
        Telefone: c.phone,
        Plano: c.plano,
        Contratos: c.contratos,
        LTV: c.ltv,
        Status: c.status,
        'Última conversa': c.ultima_conversa,
        Tags: c.tags.join(', '),
      }));
      const planilha = XLSX.utils.json_to_sheet(linhas);
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, planilha, 'Clientes');
      const data = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(livro, `clientes-${data}.xlsx`);
      t.success(`${linhas.length} cliente(s) exportado(s).`);
    } catch (e) {
      t.error('Falha ao exportar: ' + (e?.message ?? e));
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="row gap-3" style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
        <div>
          <div className="h2">Clientes</div>
          <div className="muted small">{clientes.length} clientes · {ativos} ativos · LTV total R$ {totalLtv.toLocaleString('pt-BR')}</div>
        </div>
        <div className="flex-1"></div>
        <input className="input" placeholder="Buscar por nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: 280 }} />
        <button className="btn" onClick={() => void exportarClientes()} disabled={exportando}>
          <Icon name="download" size={13} /> {exportando ? 'Exportando…' : 'Exportar XLS'}
        </button>
        <button className="btn btn-primary" onClick={() => setNovo({ nome: '', telefone: '', email: '' })}>
          <Icon name="plus" size={13} /> Novo cliente
        </button>
      </div>

      <div className="row gap-3" style={{ padding: '14px 18px 0' }}>
        <div className="os-card flex-1" style={{ padding: 14 }}><div className="muted small">Clientes ativos</div><div className="kpi-num os-aurora-text" style={{ fontSize: 22 }}>{ativos}</div></div>
        <div className="os-card flex-1" style={{ padding: 14 }}><div className="muted small">Ticket médio</div><div className="kpi-num" style={{ fontSize: 22 }}>R$ {(clientes.length ? Math.round(totalLtv / clientes.length) : 0).toLocaleString('pt-BR')}</div></div>
        <div className="os-card flex-1" style={{ padding: 14 }}><div className="muted small">LTV total</div><div className="kpi-num" style={{ fontSize: 22 }}>R$ {totalLtv.toLocaleString('pt-BR')}</div></div>
        <div className="os-card flex-1" style={{ padding: 14 }}><div className="muted small">Inadimplentes</div><div className="kpi-num" style={{ fontSize: 22, color: 'oklch(0.82 0.20 25)' }}>{clientes.filter(c => c.status === 'inadimplente').length}</div></div>
      </div>

      <div className="flex-1 scroll" style={{ overflowY: 'auto', padding: 18 }}>
        <div className="os-card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 50 }}></th><th>Cliente</th><th>Plano</th><th>Contratos</th><th>LTV</th><th>Status</th><th>Última conversa</th><th>Tags</th><th></th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setAberto(c)}>
                  <td><div className="avatar" style={{ background: c.cor, width: 32, height: 32 }}>{c.avatar}</div></td>
                  <td><div className="h3" style={{ fontSize: 13 }}>{c.nome}</div><div className="muted tiny mono">{c.email || 'sem e-mail'}</div></td>
                  <td><span className="badge badge-info">{c.plano}</span></td>
                  <td className="mono">{c.contratos}</td>
                  <td className="mono">R$ {c.ltv.toLocaleString('pt-BR')}</td>
                  <td>
                    <span className={`badge ${c.status === 'ativo' ? 'badge-success' : c.status === 'inadimplente' ? 'badge-warn' : 'badge-err'}`}>
                      <span className={`dot dot-${c.status === 'ativo' ? 'on' : c.status === 'inadimplente' ? 'warn' : 'off'}`}></span>
                      {c.status}
                    </span>
                  </td>
                  <td className="muted small mono">{c.ultima_conversa}</td>
                  <td>{c.tags.slice(0, 2).map(tag => <span key={tag} className="chip" style={{ fontSize: 9, marginRight: 4 }}>#{tag}</span>)}</td>
                  <td><button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); }}><Icon name="more" size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {novo && (
        <>
          <div className="modal-backdrop" onClick={() => !salvando && setNovo(null)} style={{ background: 'rgba(5,3,12,0.45)' }}></div>
          <div className="os-vidro-forte" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 380, zIndex: 96, padding: 20, borderRadius: 14,
            background: 'oklch(0.13 0.03 264 / 0.97)', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <div className="h2" style={{ fontSize: 16 }}>Novo cliente</div>
              <div className="flex-1"></div>
              <button className="btn btn-ghost btn-icon" onClick={() => setNovo(null)} disabled={salvando} aria-label="Fechar"><Icon name="x" size={14} /></button>
            </div>
            <input className="input" placeholder="Nome *" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} autoFocus />
            <input className="input" placeholder="Telefone (com DDD) *" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            <input className="input" placeholder="E-mail (opcional)" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setNovo(null)} disabled={salvando}>Cancelar</button>
              <button className="btn btn-primary" onClick={criarCliente} disabled={salvando}>
                {salvando ? 'Criando…' : 'Criar cliente'}
              </button>
            </div>
          </div>
        </>
      )}

      {aberto && (
        <>
          <div className="modal-backdrop" onClick={() => setAberto(null)} style={{ background: 'rgba(5,3,12,0.35)' }}></div>
          <div className="os-vidro-forte" style={{
            position: 'fixed', right: 0, top: 0, height: '100%', width: 420, zIndex: 95,
            background: 'oklch(0.13 0.03 264 / 0.97)', borderRadius: 0, borderLeft: '1px solid var(--os-vidro-borda-forte)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div className="row gap-3" style={{ padding: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="avatar" style={{ background: aberto.cor, width: 44, height: 44 }}>{aberto.avatar}</div>
              <div style={{ flex: 1 }}>
                <div className="h2" style={{ fontSize: 18 }}>{aberto.nome}</div>
                <div className="muted small mono">{aberto.email || 'sem e-mail'}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setAberto(null)}><Icon name="x" size={14} /></button>
            </div>
            <div className="flex-1 scroll" style={{ overflowY: 'auto', padding: 18 }}>
              <div className="row gap-3" style={{ marginBottom: 16 }}>
                <div className="os-card flex-1" style={{ padding: 12 }}><div className="muted tiny">LTV</div><div className="kpi-num">R$ {aberto.ltv.toLocaleString('pt-BR')}</div></div>
                <div className="os-card flex-1" style={{ padding: 12 }}><div className="muted tiny">Contratos</div><div className="kpi-num">{aberto.contratos}</div></div>
              </div>
              <div className="title-section" style={{ marginBottom: 8 }}>Plano</div>
              <div className="os-card" style={{ padding: 14, marginBottom: 14 }}>
                <div className="h3 os-aurora-text">{aberto.plano}</div>
                {/* Antes dizia "Renovação automática · ativa" (fabricado). Mostra o
                    status real derivado dos dados. */}
                <div className="muted small">Status: {aberto.status}</div>
              </div>
              <div className="title-section" style={{ marginBottom: 8 }}>Contato</div>
              <div className="os-card col gap-2" style={{ padding: 14, marginBottom: 14 }}>
                <div className="row gap-2"><Icon name="message" size={12} stroke="var(--txt-3)" /><span className="small mono">{aberto.phone}</span></div>
                <div className="row gap-2"><Icon name="file" size={12} stroke="var(--txt-3)" /><span className="small mono">{aberto.email || 'sem e-mail'}</span></div>
              </div>
              <div className="title-section" style={{ marginBottom: 8 }}>Histórico recente</div>
              {/* Antes exibia eventos FABRICADOS ("Contrato assinado · 10d",
                  "Pagamento recebido · 30d") como se fossem reais. Enquanto não há
                  fonte real de histórico, mostra só a última conversa (dado real) ou
                  um estado vazio honesto. */}
              <div className="col gap-2" style={{ marginBottom: 14 }}>
                {aberto.ultima_conversa && aberto.ultima_conversa !== '—' ? (
                  <div className="os-card" style={{ padding: 12 }}><div className="row gap-2"><Icon name="message" size={12} stroke="var(--os-acento-1)" /><span className="small">Última conversa</span><span className="muted tiny mono" style={{ marginLeft: 'auto' }}>{aberto.ultima_conversa}</span></div></div>
                ) : (
                  <div className="os-card" style={{ padding: 12 }}><span className="muted small">Sem histórico ainda</span></div>
                )}
              </div>
              <div className="row gap-2">
                <button className="btn flex-1"><Icon name="message" size={12} /> Conversar</button>
                <button className="btn flex-1"><Icon name="file" size={12} /> Novo contrato</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
