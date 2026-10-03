// @ts-nocheck
/* eslint-disable */
/**
 * NovoCargoModal — F5 commandbar 2026-05-27.
 *
 * Modal de criação de cargo do tenant. Pede nome + tipologia + canal_atuacao +
 * lista de tools (checkbox sobre `ferramentas_dinamicas` globais).
 *
 * Tipologia "mentor" / "admin" ficam fora: Mentor tem app dedicado (F3) e
 * Admin só existe escopo='global' (RLS F1 esconde do tenant).
 *
 * Ao criar: INSERT cargos + INSERT cargo_ferramentas em batch. Retorna o cargo
 * novo (com id) via onCriado pra o pai dar setSel.
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

const TIPOLOGIAS = [
  { v: 'atendimento', label: 'Atendimento', dica: 'Triagem inicial · primeiro contato' },
  { v: 'face_cliente', label: 'Face-cliente', dica: 'Vendedor · pós-venda · jurídico · financeiro · etc' },
];

const CANAIS = [
  { v: 'externo', label: 'Externo (WhatsApp / lead)' },
  { v: 'interno', label: 'Interno (workbench / commandbar)' },
  { v: 'ambos',   label: 'Ambos' },
];

export function NovoCargoModal({
  tenantId,
  onFechar,
  onCriado,
  // F4 2026-05-27: admin pode criar cargo escopo='global' OU 'nicho'.
  // Default 'tenant' preserva comportamento original (UserCargos do usuário).
  escopo = 'tenant',
  nichoId = null,
  // F4: admin pode escolher tipologia 'mentor' (catálogo global do Mentor).
  permitirMentor = false,
}) {
  const TIPOLOGIAS_DISP = permitirMentor
    ? [...TIPOLOGIAS, { v: 'mentor', label: 'Mentor', dica: 'Catálogo do commandbar (interno)' }]
    : TIPOLOGIAS;
  const [nome, setNome] = useState('');
  const [tipologia, setTipologia] = useState('face_cliente');
  const [canal, setCanal] = useState(escopo === 'tenant' ? 'externo' : 'externo');
  const [objetivo, setObjetivo] = useState('');
  const [tools, setTools] = useState([]); // ferramentas_dinamicas
  const [marcadas, setMarcadas] = useState(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const t = useToast();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data, error } = await sb.from('ferramentas_dinamicas')
        .select('id, nome_tool, descricao, escopo')
        .eq('ativo', true)
        .order('nome_tool', { ascending: true });
      if (error) throw error;
      setTools(data ?? []);
    } catch (e) {
      t.error('Falha ao carregar tools: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Fecha com ESC
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onFechar?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);

  const toggleTool = (id) => {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const criar = async () => {
    const n = nome.trim();
    if (!n) { t.error('Nome é obrigatório'); return; }
    if (escopo === 'tenant' && !tenantId) { t.error('Usuário não identificado'); return; }
    if (escopo === 'nicho' && !nichoId) { t.error('nichoId obrigatório pra cargo de nicho'); return; }
    setSalvando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      // 1. INSERT cargo — escopo controla tenant_id/nicho_id
      const row = {
        escopo, tipologia, nome: n,
        objetivo_principal: objetivo || `Cargo ${n}`,
        regras_livres: '', campos_rastreio: [],
        canal_atuacao: canal, ativo: true, ordem: 99,
      };
      if (escopo === 'tenant') row.tenant_id = tenantId;
      if (escopo === 'nicho') row.nicho_id = nichoId;
      const { data: novo, error: e1 } = await sb.from('cargos').insert(row)
      .select('id,nome,ordem,tipologia,escopo,ativo,canal_atuacao,objetivo_principal,regras_livres,campos_rastreio,tenant_id')
      .single();
      if (e1) throw e1;
      // 2. INSERT cargo_ferramentas em batch
      if (marcadas.size > 0) {
        const linhas = Array.from(marcadas).map((ferramenta_id, i) => ({
          cargo_id: novo.id, ferramenta_id, obrigatoria: false, ordem: i,
        }));
        const { error: e2 } = await sb.from('cargo_ferramentas').insert(linhas);
        if (e2) throw e2;
      }
      onCriado?.(novo);
    } catch (e) {
      t.error('Falha ao criar cargo: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar?.(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: 'rgba(20,18,32,.96)', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.45)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="plus" size={14} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>Novo cargo</div>
          <button onClick={onFechar} className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14 }}>
          <div>
            <label className="muted small" style={{ display: 'block', marginBottom: 6 }}>Nome</label>
            <input
              className="input" value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Vendedor, Jurídico, Pós-venda" autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label className="muted small" style={{ display: 'block', marginBottom: 6 }}>Tipologia</label>
              <select className="input" value={tipologia} onChange={(e) => setTipologia(e.target.value)}>
                {TIPOLOGIAS_DISP.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
              <div className="muted tiny" style={{ marginTop: 4 }}>
                {TIPOLOGIAS_DISP.find((t) => t.v === tipologia)?.dica}
              </div>
            </div>
            <div>
              <label className="muted small" style={{ display: 'block', marginBottom: 6 }}>Canal de atuação</label>
              <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
                {CANAIS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="muted small" style={{ display: 'block', marginBottom: 6 }}>Objetivo principal (opcional)</label>
            <textarea
              className="input" rows={2}
              value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Em 1-2 frases: pra que esse cargo existe?"
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="muted small">Tools disponíveis ({marcadas.size} marcadas)</label>
              <span className="muted tiny">{tools.length} no catálogo</span>
            </div>
            {carregando ? (
              <div className="muted small" style={{ padding: 12 }}>Carregando tools…</div>
            ) : (
              <div style={{
                display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto',
                background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 10, padding: 8,
              }}>
                {tools.map((tool) => {
                  const on = marcadas.has(tool.id);
                  return (
                    <label
                      key={tool.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                        background: on ? 'rgba(98,196,142,.08)' : 'transparent',
                        border: '1px solid ' + (on ? 'rgba(98,196,142,.3)' : 'rgba(255,255,255,.04)'),
                        borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleTool(tool.id)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{tool.nome_tool}</div>
                        {tool.descricao && (
                          <div className="muted tiny" style={{ marginTop: 2, lineHeight: 1.4 }}>{tool.descricao}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,.08)',
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end',
        }}>
          <button onClick={onFechar} className="btn btn-ghost" disabled={salvando}>Cancelar</button>
          <button onClick={criar} className="btn btn-primary" disabled={salvando || !nome.trim()}>
            <Icon name="check" size={13} /> {salvando ? 'Criando…' : 'Criar cargo'}
          </button>
        </div>
      </div>
    </div>
  );
}
