// @ts-nocheck
/* eslint-disable */
/**
 * App Sócio Comercial — extraído de bundle.jsx (era L3213-L3327).
 * Configuração de comissões por nível da rede de afiliados.
 * Consome window.RAGENTIC_HOOKS (operações assíncronas de multinível).
 * Abas: Comissões (configuração de níveis + KPIs) | Rede (sócios ativos).
 */
import { useState, useEffect, useRef } from 'react';
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { Icon, useToast } from '@/bundle/bundle-shared';
import { AbaRedeSocios } from './AbaRedeSocios';
import { supabase } from '@/integrations/supabase/client';

export function SocioComercial() {
  const t = useToast();
  const [aba, setAba] = useState('comissoes');
  useAbaAlvo("socio-comercial", (v) => setAba(v));
  const [list, setList] = useState([]);
  const [kpis, setKpis] = useState({ socios_ativos: 0, a_pagar_mes: 0, convertidos: 0 });
  const [refCode, setRefCode] = useState('');
  // Espelho da lista pra o persist debouncado ler o estado fresco sem side-effect
  // dentro do updater. persistTimers: timer de debounce por id.
  const listRef = useRef([]);
  useEffect(() => { listRef.current = list; }, [list]);
  const persistTimers = useRef({});
  useEffect(() => () => {
    for (const tmr of Object.values(persistTimers.current)) clearTimeout(tmr);
  }, []);

  const recarregar = async () => {
    const H = window.RAGENTIC_HOOKS;
    if (!H?.multinivelListarNiveis) return;
    const [niveis, k] = await Promise.all([H.multinivelListarNiveis(), H.multinivelKpis()]);
    setList((niveis || []).map(n => ({
      id: n.id, nivel: n.nivel, tipo_produto: n.tipo_produto, tipo_valor: n.tipo_valor,
      valor: Number(n.valor), ativo: !!n.is_active, descricao: n.descricao || '',
    })));
    setKpis(k);
  };
  useEffect(() => { recarregar(); }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid || !vivo) return;
      const { data: p } = await supabase.from('profiles').select('referral_code').eq('id', uid).maybeSingle();
      if (vivo && p?.referral_code) setRefCode(p.referral_code);
    })();
    return () => { vivo = false; };
  }, []);

  const linkCadastro = `${window.location.origin}/cadastro?ref=${refCode}`;
  const copiarLink = () => { navigator.clipboard.writeText(linkCadastro); t.success('Link copiado'); };

  const persist = async (registro) => {
    const H = window.RAGENTIC_HOOKS;
    const r = await H?.multinivelSalvarNivel?.({
      id: registro.id?.startsWith('novo-') ? undefined : registro.id,
      nivel: registro.nivel, tipo_produto: registro.tipo_produto, tipo_valor: registro.tipo_valor,
      valor: registro.valor, descricao: registro.descricao, is_active: registro.ativo,
    });
    if (r?.erro) { t.error('Falha ao salvar: ' + r.erro); return; }
    if (r?.id && registro.id?.startsWith('novo-')) {
      setList(xs => xs.map(x => x.id === registro.id ? { ...x, id: r.id } : x));
    }
  };
  const upd = (id, patch) => {
    // Updater PURO — sem side-effect (persist ficava aqui dentro e o StrictMode,
    // que roda o updater 2x, disparava upsert duplicado; e como corria a cada
    // tecla, era um upsert por caractere).
    setList(xs => xs.map(x => x.id === id ? { ...x, ...patch } : x));
    if (id.startsWith('novo-')) return; // ainda não existe no banco; add() insere
    // Debounce por id, FORA do updater: 1 upsert por pausa de digitação. Lê o
    // estado fresco via listRef (atualizado no effect).
    const timers = persistTimers.current;
    if (timers[id]) clearTimeout(timers[id]);
    timers[id] = setTimeout(() => {
      delete timers[id];
      const item = listRef.current.find(x => x.id === id);
      if (item) persist(item);
    }, 500);
  };
  const add = async () => {
    const novo = { id: 'novo-' + Math.random().toString(36).slice(2, 7), nivel: 1, tipo_produto: 'plano', tipo_valor: 'percentual', valor: 10, ativo: true, descricao: 'Novo nível' };
    setList(xs => [...xs, novo]);
    await persist(novo);
  };
  const del = async (id) => {
    setList(xs => xs.filter(x => x.id !== id));
    if (!id.startsWith('novo-')) {
      const r = await window.RAGENTIC_HOOKS?.multinivelRemoverNivel?.(id);
      if (r?.erro) { t.error('Falha ao remover: ' + r.erro); recarregar(); return; }
    }
    t.info('Nível removido');
  };

  const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="h1">Sócio Comercial</div>
          <div className="muted small" style={{ marginTop: 4 }}>Configuração da rede de afiliados — comissões por nível e tipo de produto.</div>
        </div>
        {aba === 'comissoes' && (
          <button className="btn btn-primary" onClick={add}><Icon name="plus" size={13} /> Adicionar nível</button>
        )}
      </div>

      {/* Link público de cadastro — admin envia pra captar usuário vinculado a ele */}
      <div className="os-card col gap-2" style={{ padding: 14, marginBottom: 16 }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>🔗</span>
          <span className="small" style={{ fontWeight: 600 }}>Link público de cadastro</span>
        </div>
        <div className="muted tiny">Envie este link para cadastrar um novo usuário vinculado a você.</div>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <input className="input mono" readOnly value={linkCadastro} style={{ flex: 1, fontSize: 11, opacity: 0.75 }} />
          <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={copiarLink}>Copiar</button>
        </div>
      </div>

      {/* Abas */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <span className={`tab ${aba === 'comissoes' ? 'tab-on' : ''}`} onClick={() => setAba('comissoes')}>Comissões</span>
        <span className={`tab ${aba === 'rede' ? 'tab-on' : ''}`} onClick={() => setAba('rede')}>Rede</span>
      </div>

      {/* Aba Comissões */}
      {aba === 'comissoes' && (
        <>
          <div className="row gap-3" style={{ marginBottom: 16 }}>
            <div className="os-card" style={{ padding: 14, flex: 1 }}>
              <div className="muted small">Sócios ativos</div>
              <div className="kpi-num" style={{ fontSize: 24, marginTop: 2 }}>{kpis.socios_ativos}</div>
            </div>
            <div className="os-card" style={{ padding: 14, flex: 1 }}>
              <div className="muted small">Comissões a pagar (mês)</div>
              <div className="kpi-num" style={{ fontSize: 24, marginTop: 2 }}>{fmtBRL(kpis.a_pagar_mes)}</div>
            </div>
            <div className="os-card" style={{ padding: 14, flex: 1 }}>
              <div className="muted small">Tenants convertidos</div>
              <div className="kpi-num" style={{ fontSize: 24, marginTop: 2 }}>{kpis.convertidos}</div>
            </div>
          </div>

          <div className="col gap-2">
            {list.map(c => (
              <div key={c.id} className="os-card row gap-3" style={{ padding: 14, alignItems: 'center' }}>
                <div className="row center" style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))', flexDirection: 'column' }}>
                  <div className="tiny muted">Nível</div>
                  <div className="kpi-num" style={{ fontSize: 18 }}>{c.nivel}</div>
                </div>
                <div className="col gap-2" style={{ flex: 1 }}>
                  <input className="input" placeholder="Descrição" value={c.descricao} onChange={(e) => upd(c.id, { descricao: e.target.value })} style={{ background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, padding: 0, height: 24 }} />
                  <div className="row gap-2">
                    <select className="input" value={c.tipo_produto} onChange={(e) => upd(c.id, { tipo_produto: e.target.value })} style={{ width: 160, height: 30 }}>
                      <option value="plano" style={{ background: '#1a1530' }}>Plano (mensalidade)</option>
                      <option value="implantacao" style={{ background: '#1a1530' }}>Implantação</option>
                      <option value="pacote_extra" style={{ background: '#1a1530' }}>Pacote extra</option>
                      <option value="plus" style={{ background: '#1a1530' }}>Plus / Sócio</option>
                    </select>
                    <select className="input" value={c.tipo_valor} onChange={(e) => upd(c.id, { tipo_valor: e.target.value })} style={{ width: 130, height: 30 }}>
                      <option value="percentual" style={{ background: '#1a1530' }}>Percentual</option>
                      <option value="fixo" style={{ background: '#1a1530' }}>Valor fixo</option>
                    </select>
                  </div>
                </div>
                <div className="col" style={{ width: 110 }}>
                  <label className="label tiny">Valor</label>
                  <div className="row gap-1">
                    <input className="input mono" type="number" value={c.valor} onChange={(e) => upd(c.id, { valor: +e.target.value })} style={{ height: 30 }} />
                    <span className="muted small" style={{ alignSelf: 'center' }}>{c.tipo_valor === 'percentual' ? '%' : 'R$'}</span>
                  </div>
                </div>
                <div className={`switch ${c.ativo ? 'on' : ''}`} onClick={() => upd(c.id, { ativo: !c.ativo })}><i></i></div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => del(c.id)}><Icon name="trash" size={13} stroke="oklch(0.82 0.20 25)" /></button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Aba Rede */}
      {aba === 'rede' && <AbaRedeSocios />}
    </div>
  );
}
