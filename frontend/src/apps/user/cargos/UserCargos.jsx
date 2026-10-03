// @ts-nocheck
/* eslint-disable */
/**
 * App UserCargos — extraído de bundle.jsx (era L4285-L4429).
 * Tela do Tijolo 1: cargos RAG-first (bússola, prancheta, regras livres). ← PRESERVADO
 * Tijolo 2: criar cargo, toggle ativar/desativar, seletor canal_atuacao, ferramentas.
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

// Painel de ferramentas do cargo — extraído pra controlar tamanho do arquivo pai
import { PainelFerramentas } from './PainelFerramentas';
// F5 2026-05-27: modal de criar cargo com seletor de tools
import { NovoCargoModal } from './NovoCargoModal';

export function UserCargos({ asAdmin }) {
  // RAG-first: cargos vêm do banco (RLS isola o tenant). Zero mock, zero hardcode.
  const [cargos, setCargos] = useState([]);
  const [sel, setSel] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  // F5 2026-05-27: controla modal de "+ Novo cargo"
  const [modalAberto, setModalAberto] = useState(false);
  const t = useToast();

  // campos_rastreio em produção é heterogêneo: array de strings OU de objetos.
  const normalizarCampos = (cr) => (Array.isArray(cr) ? cr : []).map((c) =>
    typeof c === 'string'
      ? { chave: c, descricao: '', obrigatorio: false }
      : { chave: c?.chave ?? c?.nome ?? '', descricao: c?.descricao ?? '', obrigatorio: !!c?.obrigatorio });

  // Carrega TODOS os cargos do tenant (ativo e inativo) pra permitir reativar.
  // Cargos globais/nicho são visíveis mas não editáveis pelo tenant.
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      // Obtém tenant_id do user logado (necessário pra criar cargos com RLS correta)
      const { data: u } = await sb.auth.getUser();
      const uid = u?.user?.id ?? null;
      setTenantId(uid);

      // RPC cargos_visiveis_tenant resolve os 3 escopos sem duplicar (global nao substituido + nicho + tenant).
      // p_incluir_inativos=true pra permitir reativar.
      const { data, error } = await sb.rpc('cargos_visiveis_tenant', { p_incluir_inativos: true });
      if (error) throw error;
      // F1 cargos/commandbar 2026-05-27: Mentor vira app dedicado (F3), sai da aba Cargos
      // do agente. Cargo Admin já não aparece (RLS + filtro na RPC cargos_visiveis_tenant).
      const lista = (data ?? [])
        .filter((c) => c.tipologia !== 'mentor')
        .map((c) => ({
        ...c,
        objetivo_principal: c.objetivo_principal ?? '',
        regras_livres: c.regras_livres ?? '',
        canal_atuacao: c.canal_atuacao ?? 'ambos',
        campos_rastreio: normalizarCampos(c.campos_rastreio),
      }));
      setCargos(lista);
      setSel((prev) => prev ?? lista.find((c) => c.ativo)?.id ?? lista[0]?.id ?? null);
    } catch (e) {
      t.error('Não consegui carregar os cargos: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const cargo = cargos.find((c) => c.id === sel) ?? null;
  const upd = (patch) => setCargos((xs) => xs.map((c) => c.id === sel ? { ...c, ...patch } : c));
  const updCampo = (i, patch) => upd({ campos_rastreio: cargo.campos_rastreio.map((c, j) => j === i ? { ...c, ...patch } : c) });
  const addCampo = () => upd({ campos_rastreio: [...cargo.campos_rastreio, { chave: '', descricao: '', obrigatorio: false }] });
  const delCampo = (i) => upd({ campos_rastreio: cargo.campos_rastreio.filter((_, j) => j !== i) });

  // Salvar — inclui canal_atuacao (Tijolo 2 item 3)
  const salvar = async () => {
    if (!cargo) return;
    setSalvando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      // `.select()` + checagem de linhas: cargo herdado (global/nicho) não tem
      // policy de escrita do tenant — afeta 0 linhas sem erro. Não fingir "salvo".
      const { data, error } = await sb.from('cargos').update({
        nome: cargo.nome,
        ordem: cargo.ordem,
        objetivo_principal: cargo.objetivo_principal,
        regras_livres: cargo.regras_livres,
        campos_rastreio: cargo.campos_rastreio,
        canal_atuacao: cargo.canal_atuacao,  // Tijolo 2
      }).eq('id', cargo.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { t.error('Não foi possível salvar: cargo herdado é só leitura.'); return; }
      t.success(`Cargo ${cargo.nome} salvo · próxima conversa já usa as novas regras`);
    } catch (e) {
      t.error('Falha ao salvar: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  // Tijolo 2 — Item 1: criar novo cargo
  const criarCargo = async () => {
    if (!tenantId) { t.error('Usuário não identificado'); return; }
    setCriando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const maxOrdem = cargos.reduce((m, c) => Math.max(m, c.ordem ?? 0), 0);
      const { data, error } = await sb.from('cargos').insert({
        nome: 'Novo cargo',
        tipologia: 'atendimento',
        escopo: 'tenant',
        tenant_id: tenantId,
        canal_atuacao: 'ambos',
        ativo: true,
        ordem: maxOrdem + 1,
        objetivo_principal: '',
        regras_livres: '',
        campos_rastreio: [],
      }).select('id,nome,ordem,tipologia,escopo,ativo,canal_atuacao,objetivo_principal,regras_livres,campos_rastreio,tenant_id').single();
      if (error) throw error;
      const novo = { ...data, campos_rastreio: normalizarCampos(data.campos_rastreio), canal_atuacao: data.canal_atuacao ?? 'ambos' };
      setCargos((xs) => [...xs, novo]);
      setSel(novo.id);
      t.success('Cargo criado · edite e salve');
    } catch (e) {
      t.error('Falha ao criar cargo: ' + (e?.message ?? e));
    } finally {
      setCriando(false);
    }
  };

  // Tijolo 2 — Item 2: toggle ativo/inativo
  const toggleAtivo = async (c) => {
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data, error } = await sb.from('cargos').update({ ativo: !c.ativo }).eq('id', c.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { t.error('Não foi possível alterar: cargo herdado é só leitura.'); return; }
      setCargos((xs) => xs.map((x) => x.id === c.id ? { ...x, ativo: !c.ativo } : x));
      t.success(c.ativo ? `${c.nome} desativado` : `${c.nome} reativado`);
    } catch (e) {
      t.error('Falha ao alterar status: ' + (e?.message ?? e));
    }
  };

  const iconeTipologia = (tip) =>
    tip === 'atendimento' ? 'message' : tip === 'mentor' ? 'compass' : tip === 'admin' ? 'settings' : 'briefcase';

  const labelCanal = (v) =>
    v === 'interno' ? 'Interno (só dono/workbench)' : v === 'externo' ? 'Externo (lead/cliente/WhatsApp)' : 'Ambos';

  if (carregando) return <div style={{ padding: 22 }} className="muted">Carregando cargos…</div>;

  return (
    <div style={{ padding: 22 }}>
      {!asAdmin && (
        <div style={{ marginBottom: 18 }}>
          <div className="h2">Agente · Cargos</div>
          <div className="muted small">Bússola, prancheta e regras livres — direto do banco (RAG-first).</div>
        </div>
      )}

      {/* Barra de cargos + botão Novo (F5 + reforço visual 07:36 BRT) */}
      <div className="row gap-2" style={{ marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {cargos.map((c) => {
          const eGlobal = c.escopo === 'global';
          const eNicho  = c.escopo === 'nicho';
          const eTenant = c.escopo === 'tenant';
          // Paleta por escopo: cor de fundo/borda forte no card inteiro.
          const paleta = eGlobal
            ? { bg: 'rgba(180,130,255,.10)', border: 'rgba(180,130,255,.4)', fg: '#c9a8ff', label: 'GLOBAL' }
            : eNicho
              ? { bg: 'rgba(126,189,255,.10)', border: 'rgba(126,189,255,.4)', fg: '#7ebdff', label: 'NICHO' }
              : { bg: 'rgba(98,196,142,.10)', border: 'rgba(98,196,142,.4)', fg: '#9ce0b6', label: 'SEU' };
          const ativo = sel === c.id;
          return (
            <span
              key={c.id}
              onClick={() => setSel(c.id)}
              title={c.ativo ? `${c.nome} · ${paleta.label}` : `${c.nome} · ${paleta.label} · INATIVO`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px 8px 10px', cursor: 'pointer',
                borderRadius: 10,
                background: c.ativo ? paleta.bg : 'rgba(255,255,255,.02)',
                border: '1px solid ' + (ativo ? paleta.fg : (c.ativo ? paleta.border : 'rgba(255,255,255,.08)')),
                boxShadow: ativo ? `0 0 0 2px ${paleta.bg}` : 'none',
                opacity: c.ativo ? 1 : 0.7,
                color: c.ativo ? 'inherit' : 'var(--txt-3)',
                transition: 'all .18s',
                fontWeight: ativo ? 600 : 500,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: c.ativo ? paleta.fg : 'rgba(255,80,80,.6)',
                boxShadow: c.ativo ? `0 0 6px ${paleta.fg}` : 'none',
              }} />
              <Icon name={iconeTipologia(c.tipologia)} size={12} />
              <span>{c.nome}</span>
              <span style={{
                marginLeft: 4, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(0,0,0,.25)', color: paleta.fg,
                fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
              }}>{paleta.label}</span>
              {!c.ativo && (
                <span style={{
                  marginLeft: 4, padding: '1px 6px', borderRadius: 4,
                  background: 'rgba(255,80,80,.18)', color: '#ff9c9c',
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
                }}>OFF</span>
              )}
            </span>
          );
        })}
        <button className="btn btn-sm" onClick={() => setModalAberto(true)} style={{ marginLeft: 'auto' }}>
          <Icon name="plus" size={12} /> Novo cargo
        </button>
      </div>

      {modalAberto && (
        <NovoCargoModal
          tenantId={tenantId}
          onFechar={() => setModalAberto(false)}
          onCriado={(novoCargo) => {
            const normalizado = {
              ...novoCargo,
              campos_rastreio: normalizarCampos(novoCargo.campos_rastreio),
              canal_atuacao: novoCargo.canal_atuacao ?? 'ambos',
              objetivo_principal: novoCargo.objetivo_principal ?? '',
              regras_livres: novoCargo.regras_livres ?? '',
            };
            setCargos((xs) => [...xs, normalizado]);
            setSel(normalizado.id);
            setModalAberto(false);
            t.success(`Cargo "${normalizado.nome}" criado · edite a bússola e salve`);
          }}
        />
      )}

      {/* Sem cargos: mensagem orientativa */}
      {cargos.length === 0 && (
        <div className="muted" style={{ padding: 22 }}>Nenhum cargo neste tenant. Clique em "Novo cargo" para começar.</div>
      )}

      {cargo && (
        <div className="os-card" style={{ padding: 22 }}>
          {/* F5: cargos global/nicho são read-only pro tenant comum.
              Quem quiser customizar cria um cargo próprio via "+ Novo cargo"
              (RLS já bloqueia UPDATE no banco — aqui só desabilita a UI). */}
          {cargo.escopo !== 'tenant' && (
            <div style={{
              marginBottom: 14, padding: '10px 14px',
              background: 'rgba(180,130,255,.08)', border: '1px solid rgba(180,130,255,.22)',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
            }}>
              <Icon name="lock" size={12} />
              <span>
                Cargo {cargo.escopo === 'global' ? 'padrão (global)' : 'do nicho'}. Só leitura — clique em
                <strong> + Novo cargo </strong> pra criar um seu e customizar.
              </span>
            </div>
          )}
          {(() => { /* helper local pra desabilitar inputs de não-tenant */ return null; })()}
          {/* Nome do cargo (editável só se for do tenant) */}
          <div className="row gap-2" style={{ marginBottom: 16, alignItems: 'center' }}>
            <input
              className="input"
              style={{ fontWeight: 600, fontSize: 15, maxWidth: 280 }}
              value={cargo.nome}
              onChange={(e) => upd({ nome: e.target.value })}
              placeholder="Nome do cargo"
              disabled={cargo.escopo !== 'tenant'}
            />
            {/* Tijolo 2 — Item 2: toggle ativo/inativo */}
            <button
              className={`btn btn-sm ${cargo.ativo ? 'btn-ghost' : ''}`}
              style={cargo.ativo ? {} : { color: 'oklch(0.82 0.20 25)' }}
              onClick={() => toggleAtivo(cargo)}
              title={cargo.ativo ? 'Desativar cargo' : 'Reativar cargo'}
            >
              <Icon name={cargo.ativo ? 'check' : 'square'} size={14} />
              {cargo.ativo ? 'Ativo' : 'Inativo'}
            </button>

            {/* Tijolo 2 — Item 3: seletor canal_atuacao */}
            <div className="row gap-1" style={{ marginLeft: 'auto', alignItems: 'center' }}>
              <Icon name="sliders" size={12} stroke="var(--txt-2)" />
              <select
                className="input"
                style={{ fontSize: 13, paddingTop: 6, paddingBottom: 6, minWidth: 240 }}
                value={cargo.canal_atuacao ?? 'ambos'}
                onChange={(e) => upd({ canal_atuacao: e.target.value })}
              >
                <option value="interno">Interno (só dono/workbench)</option>
                <option value="externo">Externo (lead/cliente/WhatsApp)</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
          </div>

          <div className="row gap-2" style={{ marginBottom: 6 }}>
            <Icon name="compass" size={14} stroke="var(--os-acento-1)" />
            <span className="title-section">Bússola · objetivo principal</span>
          </div>
          <textarea className="input" value={cargo.objetivo_principal} onChange={(e) => upd({ objetivo_principal: e.target.value })} rows={3} placeholder="Objetivo principal deste cargo" disabled={cargo.escopo !== 'tenant'} />

          <div className="hr" style={{ margin: '24px 0' }}></div>

          <div className="row gap-2" style={{ marginBottom: 10 }}>
            <Icon name="clipboard" size={14} stroke="var(--os-acento-2)" />
            <span className="title-section">Prancheta · campos a rastrear no lead</span>
            <div className="flex-1" />
            <button className="btn btn-sm" onClick={addCampo}><Icon name="plus" size={12} /> Campo</button>
          </div>
          <div className="col gap-2">
            {cargo.campos_rastreio.map((cp, i) => (
              <div key={i} className="prancheta-row">
                <input className="input mono" value={cp.chave} onChange={(e) => updCampo(i, { chave: e.target.value })} placeholder="chave" />
                <input className="input" value={cp.descricao} onChange={(e) => updCampo(i, { descricao: e.target.value })} placeholder="o que é" />
                <div className="row gap-2">
                  <span className={`chk ${cp.obrigatorio ? 'on' : ''}`} onClick={() => updCampo(i, { obrigatorio: !cp.obrigatorio })}>
                    {cp.obrigatorio && <Icon name="check" size={11} stroke="white" />}
                  </span>
                  <span className="muted small">Obrigatório</span>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delCampo(i)}>
                  <Icon name="trash" size={12} stroke="oklch(0.82 0.20 25)" />
                </button>
              </div>
            ))}
          </div>

          <div className="hr" style={{ margin: '24px 0' }}></div>

          <div className="row gap-2" style={{ marginBottom: 10 }}>
            <Icon name="edit" size={14} stroke="var(--txt-2)" />
            <span className="title-section">Regras livres (entram no prompt)</span>
          </div>
          <textarea className="input" rows={3} value={cargo.regras_livres} onChange={(e) => upd({ regras_livres: e.target.value })} placeholder="Regras curtas que entram no prompt deste cargo" disabled={cargo.escopo !== 'tenant'} />

          <div className="row gap-2" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              disabled={salvando || cargo.escopo !== 'tenant'}
              onClick={salvar}
              title={cargo.escopo !== 'tenant' ? 'Cargo herdado é só leitura' : ''}
            >
              <Icon name="check" size={13} /> {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}

      {/* Tijolo 2 — Item 4: painel de ferramentas (sub-componente para não estourar 300 linhas) */}
      {cargo && tenantId && (
        <PainelFerramentas cargoId={cargo.id} tenantId={tenantId} cargoNome={cargo.nome} />
      )}
    </div>
  );
}
