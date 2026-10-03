// @ts-nocheck
/* eslint-disable */
/**
 * AppCargosAdmin — F4 commandbar 2026-05-27.
 *
 * App admin (lado='admin') pra construir cargos GLOBAL e por NICHO da
 * plataforma. Platform_admin gerencia o catálogo base; tenants herdam via
 * RPC `cargos_visiveis_tenant` (F1) e podem criar próprios via UserCargos.
 *
 * Stack:
 *  - Tabs por escopo (Globais / Nichos)
 *  - Filtro por nicho quando tab='nicho'
 *  - Lista vertical de cargos do escopo selecionado
 *  - Click em card → painel direito edita (nome, tipologia, canal_atuacao,
 *    objetivo_principal, regras_livres, ordem, ativo)
 *  - Reuso de PainelFerramentas (vínculo cargo_ferramentas) e NovoCargoModal
 *    (prop escopo='global'|'nicho')
 *
 * Permissão: depende de RLS `cargos_admin_lista` (eh_admin_plataforma()) pra
 * SELECT, e `cargos_tenant_gerencia`/`cargos_admin_globais` pra mutação. A
 * última está quebrada pelo bug `eh_super_admin`; UPDATE/INSERT via UI vai
 * funcionar pelas policies de ALL que sobreviveram OU será bloqueado com 42501
 * (toast erro) até fixarmos eh_super_admin.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { Icon, useToast } from '@/bundle/bundle-shared';
import { PainelFerramentas } from '@/apps/user/cargos/PainelFerramentas';
import { NovoCargoModal } from '@/apps/user/cargos/NovoCargoModal';

const ESCOPOS = [
  { v: 'global', label: 'Globais', cor: '#c9a8ff' },
  { v: 'nicho',  label: 'Nichos',  cor: '#7ebdff' },
];

export function AppCargosAdmin() {
  const [tab, setTab] = useState('global');
  useAbaAlvo("cargos-admin", (v) => setTab(v));
  const [cargos, setCargos] = useState([]);
  const [nichos, setNichos] = useState([]);
  const [nichoSel, setNichoSel] = useState(null);
  const [selId, setSelId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const t = useToast();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const [cR, nR] = await Promise.all([
        sb.from('cargos')
          .select('id, nome, escopo, tipologia, ativo, ordem, tenant_id, nicho_id, canal_atuacao, objetivo_principal, regras_livres, campos_rastreio, modelo_llm_padrao, substitui_global_id')
          .in('escopo', ['global', 'nicho'])
          .order('escopo', { ascending: true })
          .order('ordem', { ascending: true })
          .order('nome', { ascending: true }),
        sb.from('nichos').select('id, slug, nome').order('nome', { ascending: true }),
      ]);
      if (cR.error) throw cR.error;
      if (nR.error) console.warn('Nichos:', nR.error.message);
      setCargos(cR.data ?? []);
      setNichos(nR.data ?? []);
    } catch (e) {
      t.error('Falha ao carregar cargos: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // filtra cargos por tab + nicho selecionado
  const lista = useMemo(() => {
    let base = cargos.filter((c) => c.escopo === tab);
    if (tab === 'nicho' && nichoSel) base = base.filter((c) => c.nicho_id === nichoSel);
    return base;
  }, [cargos, tab, nichoSel]);

  const sel = useMemo(() => cargos.find((c) => c.id === selId) ?? null, [cargos, selId]);

  const upd = (patch) => setCargos((xs) => xs.map((c) => c.id === selId ? { ...c, ...patch } : c));

  const salvar = async () => {
    if (!sel) return;
    setSalvando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      // `.select()` + checagem de linhas: cargo global/nicho sem policy de escrita
      // deste usuário afeta 0 linhas sem erro — não mentir "salvo".
      const { data, error } = await sb.from('cargos').update({
        nome: sel.nome, tipologia: sel.tipologia, canal_atuacao: sel.canal_atuacao,
        objetivo_principal: sel.objetivo_principal, regras_livres: sel.regras_livres,
        ordem: sel.ordem ?? 0, modelo_llm_padrao: sel.modelo_llm_padrao,
      }).eq('id', sel.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { t.error('Não foi possível salvar: sem permissão de escrita neste cargo.'); return; }
      t.success(`Cargo "${sel.nome}" salvo`);
    } catch (e) {
      t.error('Falha ao salvar: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async () => {
    if (!sel) return;
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data, error } = await sb.from('cargos').update({ ativo: !sel.ativo }).eq('id', sel.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { t.error('Não foi possível alterar: sem permissão de escrita neste cargo.'); return; }
      upd({ ativo: !sel.ativo });
      t.success(sel.ativo ? `${sel.nome} desativado` : `${sel.nome} reativado`);
    } catch (e) { t.error('Falha: ' + (e?.message ?? e)); }
  };

  if (carregando) return <div style={{ padding: 22 }} className="muted">Carregando cargos…</div>;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* SIDEBAR esquerda — lista */}
      <div style={{
        flex: '0 0 320px', borderRight: '1px solid rgba(255,255,255,.08)',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div className="h2" style={{ marginBottom: 4 }}>Cargos da plataforma</div>
          <div className="muted small">Catálogo base — herdado por todos os tenants.</div>
        </div>

        {/* Tabs */}
        <div className="row gap-1" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          {ESCOPOS.map((e) => (
            <span
              key={e.v}
              className={`tab ${tab === e.v ? 'tab-on' : ''}`}
              onClick={() => { setTab(e.v); setSelId(null); }}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: e.cor, marginRight: 6 }} />
              {e.label}
            </span>
          ))}
          <button onClick={() => setModalAberto(true)} className="btn btn-sm" style={{ marginLeft: 'auto' }}>
            <Icon name="plus" size={12} /> Novo
          </button>
        </div>

        {/* Filtro nicho */}
        {tab === 'nicho' && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <select
              className="input" value={nichoSel ?? ''} onChange={(e) => setNichoSel(e.target.value || null)}
              style={{ fontSize: 12, width: '100%' }}
            >
              <option value="">Todos os nichos</option>
              {nichos.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
            </select>
          </div>
        )}

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {lista.length === 0 && (
            <div className="muted small" style={{ padding: 20, textAlign: 'center' }}>
              Nenhum cargo {tab === 'global' ? 'global' : 'de nicho'} ainda. Clique em "Novo".
            </div>
          )}
          {lista.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelId(c.id)}
              style={{
                padding: '10px 12px', marginBottom: 4, cursor: 'pointer',
                background: selId === c.id ? 'rgba(98,196,142,.08)' : 'transparent',
                border: '1px solid ' + (selId === c.id ? 'rgba(98,196,142,.3)' : 'rgba(255,255,255,.04)'),
                borderRadius: 8, opacity: c.ativo ? 1 : 0.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</span>
                {!c.ativo && <span className="muted tiny">off</span>}
              </div>
              <div className="muted tiny" style={{ marginTop: 2 }}>
                {c.tipologia} · {c.canal_atuacao}
                {c.nicho_id && nichos.find((n) => n.id === c.nicho_id) && ` · ${nichos.find((n) => n.id === c.nicho_id).nome}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PAINEL direito — edição */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 22, minHeight: 0 }}>
        {!sel ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
            color: 'var(--txt-3)', flexDirection: 'column', gap: 10,
          }}>
            <Icon name="briefcase" size={32} />
            <div className="muted small">Selecione um cargo à esquerda pra editar.</div>
          </div>
        ) : (
          <div className="os-card" style={{ padding: 22, maxWidth: 880 }}>
            {/* Header */}
            <div className="row gap-2" style={{ marginBottom: 16, alignItems: 'center' }}>
              <input className="input" style={{ fontWeight: 600, fontSize: 15, maxWidth: 320 }}
                value={sel.nome} onChange={(e) => upd({ nome: e.target.value })} placeholder="Nome do cargo" />
              <button
                className={`btn btn-sm ${sel.ativo ? 'btn-ghost' : ''}`}
                style={sel.ativo ? {} : { color: 'oklch(0.82 0.20 25)' }}
                onClick={toggleAtivo}
              >
                <Icon name={sel.ativo ? 'check' : 'square'} size={13} />
                {sel.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <span style={{
                marginLeft: 'auto', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: sel.escopo === 'global' ? 'rgba(201,168,255,.15)' : 'rgba(126,189,255,.15)',
                color: sel.escopo === 'global' ? '#c9a8ff' : '#7ebdff',
              }}>{sel.escopo}</span>
            </div>

            {/* Tipologia + canal + ordem */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="muted tiny" style={{ display: 'block', marginBottom: 4 }}>Tipologia</label>
                <select className="input" value={sel.tipologia} onChange={(e) => upd({ tipologia: e.target.value })}>
                  <option value="atendimento">Atendimento</option>
                  <option value="face_cliente">Face-cliente</option>
                  <option value="mentor">Mentor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="muted tiny" style={{ display: 'block', marginBottom: 4 }}>Canal</label>
                <select className="input" value={sel.canal_atuacao ?? 'ambos'} onChange={(e) => upd({ canal_atuacao: e.target.value })}>
                  <option value="interno">Interno</option>
                  <option value="externo">Externo</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
              <div>
                <label className="muted tiny" style={{ display: 'block', marginBottom: 4 }}>Ordem</label>
                <input className="input" type="number" value={sel.ordem ?? 0} onChange={(e) => upd({ ordem: Number(e.target.value) || 0 })} />
              </div>
            </div>

            {/* Bússola */}
            <div className="row gap-2" style={{ marginBottom: 6 }}>
              <Icon name="compass" size={14} stroke="var(--os-acento-1)" />
              <span className="title-section">Bússola · objetivo principal</span>
            </div>
            <textarea className="input" rows={3} value={sel.objetivo_principal ?? ''}
              onChange={(e) => upd({ objetivo_principal: e.target.value })}
              placeholder="Pra que esse cargo existe?" />

            {/* Regras */}
            <div className="row gap-2" style={{ marginTop: 16, marginBottom: 6 }}>
              <Icon name="edit" size={14} stroke="var(--txt-2)" />
              <span className="title-section">Regras livres (entram no prompt)</span>
            </div>
            <textarea className="input" rows={3} value={sel.regras_livres ?? ''}
              onChange={(e) => upd({ regras_livres: e.target.value })}
              placeholder="Regras curtas que entram no prompt deste cargo" />

            {/* Modelo LLM */}
            <div className="row gap-2" style={{ marginTop: 16, marginBottom: 6 }}>
              <Icon name="sliders" size={14} stroke="var(--txt-2)" />
              <span className="title-section">Modelo LLM (opcional)</span>
            </div>
            <input className="input" value={sel.modelo_llm_padrao ?? ''}
              onChange={(e) => upd({ modelo_llm_padrao: e.target.value })}
              placeholder="ex: google/gemini-2.5-pro" />

            {/* Salvar */}
            <div className="row gap-2" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" disabled={salvando} onClick={salvar}>
                <Icon name="check" size={13} /> {salvando ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>

            {/* Painel de ferramentas (reuso) */}
            <PainelFerramentas cargoId={sel.id} tenantId={null} cargoNome={sel.nome} />
          </div>
        )}
      </div>

      {modalAberto && (
        <NovoCargoModal
          escopo={tab}
          nichoId={tab === 'nicho' ? nichoSel : null}
          tenantId={null}
          permitirMentor={true}
          onFechar={() => setModalAberto(false)}
          onCriado={(novo) => {
            setCargos((xs) => [...xs, novo]);
            setSelId(novo.id);
            setModalAberto(false);
            t.success(`Cargo "${novo.nome}" criado · edite e salve`);
          }}
        />
      )}
    </div>
  );
}
