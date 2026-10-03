// @ts-nocheck
/* eslint-disable */
/**
 * App Financeiro — pedidos e saques pendentes REAIS do Supabase.
 * Pedidos: aprovar (status='aprovado' → trigger ativa assinatura) / recusar / ver comprovante.
 * Saques: pagar (status='pago') / recusar (RPC recusar_saque → estorna saldo).
 */
import { useState, useEffect } from 'react';
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import { ModalComprovante } from './ModalComprovante';

export function Financeiro() {
  const t = useToast();
  const [pedidos, setPedidos] = useState([]);
  const [saques, setSaques] = useState([]);
  const [tab, setTab] = useState('pedidos');
  useAbaAlvo("financeiro", (v) => setTab(v));
  const [verPedido, setVerPedido] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    try {
      const { data: pedidosRaw, error: errPedidos } = await supabase
        .from('pedidos_compra')
        .select('id,user_id,tipo,item_nome,item_preco,comprovante_url,status,created_at')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });

      if (errPedidos) throw errPedidos;

      const { data: saquesRaw, error: errSaques } = await supabase
        .from('multinivel_saques')
        .select('id,user_id,valor,chave_pix,status,created_at')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });

      if (errSaques) throw errSaques;

      // Enriquecer com nome+email do profiles (1 query)
      const userIds = [
        ...new Set([
          ...(pedidosRaw ?? []).map(p => p.user_id),
          ...(saquesRaw ?? []).map(s => s.user_id),
        ].filter(Boolean)),
      ];

      let profilesMap = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id,full_name,email')
          .in('id', userIds);
        (profs ?? []).forEach(p => { profilesMap[p.id] = p; });
      }

      const enriquecer = (item) => ({
        ...item,
        nome_tenant: profilesMap[item.user_id]?.full_name ?? item.user_id,
        email_tenant: profilesMap[item.user_id]?.email ?? '',
      });

      setPedidos((pedidosRaw ?? []).map(enriquecer));
      setSaques((saquesRaw ?? []).map(enriquecer));
    } catch (e) {
      console.error('[Financeiro] carregarDados:', e);
      t.error('Erro ao carregar dados financeiros.');
    } finally {
      setCarregando(false);
    }
  }

  async function aprovar(p) {
    const { error } = await supabase
      .from('pedidos_compra')
      .update({ status: 'aprovado' })
      .eq('id', p.id);
    if (error) { t.error('Erro ao aprovar pedido.'); return; }
    setPedidos(xs => xs.filter(x => x.id !== p.id));
    t.success(`Pedido aprovado · assinatura de ${p.nome_tenant} ativada`);
  }

  async function recusar(p) {
    const { error } = await supabase
      .from('pedidos_compra')
      .update({ status: 'recusado' })
      .eq('id', p.id);
    if (error) { t.error('Erro ao recusar pedido.'); return; }
    setPedidos(xs => xs.filter(x => x.id !== p.id));
    t.error(`Pedido recusado · ${p.nome_tenant} notificado`);
  }

  async function pagarSaque(s) {
    const { error } = await supabase
      .from('multinivel_saques')
      .update({ status: 'pago' })
      .eq('id', s.id);
    if (error) { t.error('Erro ao registrar pagamento.'); return; }
    setSaques(xs => xs.filter(x => x.id !== s.id));
    t.success(`Saque pago · R$ ${Number(s.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }

  async function recusarSaque(s) {
    const { error } = await supabase.rpc('recusar_saque', { p_saque_id: s.id });
    if (error) { t.error('Erro ao recusar saque.'); return; }
    setSaques(xs => xs.filter(x => x.id !== s.id));
    t.error(`Saque recusado · saldo estornado para ${s.nome_tenant}`);
  }

  const fmtData = (iso) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  const fmtBRL = (v) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalPendente = pedidos.reduce((s, x) => s + Number(x.item_preco ?? 0), 0);

  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="h1">Financeiro</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {pedidos.length} pedidos pendentes · {saques.length} saques · {fmtBRL(totalPendente)} a aprovar
          </div>
        </div>
        <div className="tabs">
          <span className={`tab ${tab === 'pedidos' ? 'tab-on' : ''}`} onClick={() => setTab('pedidos')}>
            <Icon name="wallet" size={12} /> Pedidos <span className="chip">{pedidos.length}</span>
          </span>
          <span className={`tab ${tab === 'saques' ? 'tab-on' : ''}`} onClick={() => setTab('saques')}>
            <Icon name="download" size={12} /> Saques <span className="chip">{saques.length}</span>
          </span>
        </div>
      </div>

      {carregando && (
        <div className="os-card center" style={{ padding: 60 }}>
          <div className="muted">Carregando…</div>
        </div>
      )}

      {!carregando && (
        <div className="col gap-3">
          {tab === 'pedidos' && pedidos.map((p) => (
            <div key={p.id} className="os-card row gap-3" style={{ padding: 16, alignItems: 'center' }}>
              <div className="avatar" style={{ width: 42, height: 42, fontSize: 14 }}>
                {(p.nome_tenant?.[0] ?? '?').toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div className="row gap-2" style={{ marginBottom: 2 }}>
                  <div className="h3" style={{ fontSize: 14 }}>{p.nome_tenant}</div>
                  <span className="badge badge-info">{p.tipo}</span>
                </div>
                <div className="muted small">{p.item_nome}</div>
                <div className="muted tiny mono" style={{ marginTop: 2 }}>{fmtData(p.created_at)}</div>
              </div>
              <div className="col" style={{ textAlign: 'right' }}>
                <div className="kpi-num" style={{ fontSize: 20 }}>{fmtBRL(p.item_preco)}</div>
                <div className="tiny muted">a aprovar</div>
              </div>
              <div className="row gap-2">
                <button className="btn btn-sm" onClick={() => setVerPedido(p)}>
                  <Icon name="eye" size={12} /> Comprovante
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => recusar(p)}
                  style={{ color: 'oklch(0.82 0.20 25)' }}
                >
                  Recusar
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => aprovar(p)}>
                  <Icon name="check" size={12} /> Aprovar
                </button>
              </div>
            </div>
          ))}

          {tab === 'pedidos' && pedidos.length === 0 && (
            <div className="os-card center" style={{ padding: 60, flexDirection: 'column' }}>
              <Icon name="check" size={36} stroke="oklch(0.72 0.18 145)" />
              <div className="h2" style={{ marginTop: 12 }}>Nada pendente</div>
              <div className="muted">Você aprovou tudo. Bom trabalho.</div>
            </div>
          )}

          {tab === 'saques' && saques.map(s => (
            <div key={s.id} className="os-card row gap-3" style={{ padding: 16, alignItems: 'center' }}>
              <div className="avatar" style={{ width: 42, height: 42, fontSize: 14 }}>
                {(s.nome_tenant?.[0] ?? '?').toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div className="h3" style={{ fontSize: 14 }}>{s.nome_tenant}</div>
                <div className="muted small mono">{s.chave_pix}</div>
                <div className="muted tiny mono">{fmtData(s.created_at)}</div>
              </div>
              <div className="col" style={{ textAlign: 'right' }}>
                <div className="kpi-num" style={{ fontSize: 20 }}>{fmtBRL(s.valor)}</div>
                <div className="tiny muted">solicitado</div>
              </div>
              <div className="row gap-2">
                <button className="btn btn-sm" onClick={() => recusarSaque(s)}>Recusar</button>
                <button className="btn btn-primary btn-sm" onClick={() => pagarSaque(s)}>
                  <Icon name="check" size={12} /> Pagar
                </button>
              </div>
            </div>
          ))}

          {tab === 'saques' && saques.length === 0 && (
            <div className="os-card center" style={{ padding: 60, flexDirection: 'column' }}>
              <Icon name="check" size={36} stroke="oklch(0.72 0.18 145)" />
              <div className="h2" style={{ marginTop: 12 }}>Sem saques pendentes</div>
            </div>
          )}
        </div>
      )}

      {verPedido && (
        <ModalComprovante pedido={verPedido} onClose={() => setVerPedido(null)} />
      )}
    </div>
  );
}
