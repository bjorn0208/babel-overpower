// @ts-nocheck
/* eslint-disable */
/**
 * PainelFerramentas — Tijolo 2 Item 4.
 * Lista ferramentas_dinamicas disponíveis (plataforma + do tenant) e permite
 * vincular/desvincular via cargo_ferramentas para o cargo selecionado.
 *
 * Extraído de UserCargos.jsx para manter ambos os arquivos abaixo de 300 linhas.
 * Schema confirmado via types.ts:
 *   ferramentas_dinamicas: id, nome_tool, descricao, escopo, precisa_aprovacao, tenant_id, ativo
 *   cargo_ferramentas: cargo_id, ferramenta_id, obrigatoria, ordem, criado_em
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

export function PainelFerramentas({ cargoId, tenantId, cargoNome }) {
  const [catalogo, setCatalogo] = useState([]);       // todas as ferramentas disponíveis
  const [vinculadas, setVinculadas] = useState(new Set()); // ferramenta_ids vinculadas ao cargo atual
  const [carregando, setCarregando] = useState(true);
  const [toggling, setToggling] = useState(null);     // ferramenta_id sendo alterada
  const t = useToast();

  const carregar = useCallback(async () => {
    if (!cargoId) return;
    setCarregando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;

      // Catálogo: ferramentas globais (tenant_id null) + do próprio tenant
      // (admin passa tenantId=null e vê só globais — comportamento esperado pra cargo do catálogo)
      let q = sb.from('ferramentas_dinamicas')
        .select('id, nome_tool, descricao, escopo, precisa_aprovacao, tenant_id')
        .eq('ativo', true)
        .order('nome_tool', { ascending: true });
      if (tenantId) q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      else q = q.is('tenant_id', null);
      const { data: dFerr, error: eFerr } = await q;
      if (eFerr) throw eFerr;
      setCatalogo(dFerr ?? []);

      // Ferramentas já vinculadas a este cargo
      const { data: dVinc, error: eVinc } = await sb
        .from('cargo_ferramentas')
        .select('ferramenta_id')
        .eq('cargo_id', cargoId);
      if (eVinc) throw eVinc;
      setVinculadas(new Set((dVinc ?? []).map((v) => v.ferramenta_id)));
    } catch (e) {
      t.error('Falha ao carregar ferramentas: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, [cargoId, tenantId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const toggleFerramenta = async (ferramentaId, marcar) => {
    setToggling(ferramentaId);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      if (marcar) {
        const proxOrdem = vinculadas.size;
        // `.select()` + checagem: cargo herdado (global/nicho) sem policy de
        // escrita do tenant afeta 0 linhas sem erro — não fingir "vinculada".
        const { data, error } = await sb
          .from('cargo_ferramentas')
          .insert({ cargo_id: cargoId, ferramenta_id: ferramentaId, ordem: proxOrdem, obrigatoria: false })
          .select('ferramenta_id');
        if (error) throw error;
        if (!data || data.length === 0) { t.error('Não foi possível vincular: cargo herdado é só leitura.'); return; }
        setVinculadas((prev) => { const s = new Set(prev); s.add(ferramentaId); return s; });
        t.success('Ferramenta vinculada ao cargo');
      } else {
        const { data, error } = await sb
          .from('cargo_ferramentas')
          .delete()
          .eq('cargo_id', cargoId)
          .eq('ferramenta_id', ferramentaId)
          .select('ferramenta_id');
        if (error) throw error;
        if (!data || data.length === 0) { t.error('Não foi possível desvincular: cargo herdado é só leitura.'); return; }
        setVinculadas((prev) => { const s = new Set(prev); s.delete(ferramentaId); return s; });
        t.info('Ferramenta desvinculada');
      }
    } catch (e) {
      t.error('Falha ao alterar ferramenta: ' + (e?.message ?? e));
    } finally {
      setToggling(null);
    }
  };

  const escopoLabel = (e) =>
    e === 'global' ? 'Plataforma' : e === 'nicho' ? 'Nicho' : 'Tenant';

  return (
    <div className="os-card" style={{ padding: 22, marginTop: 16 }}>
      <div className="row gap-2" style={{ marginBottom: 14 }}>
        <Icon name="spark" size={14} stroke="var(--os-acento-2)" />
        <span className="title-section">Ferramentas do cargo · {cargoNome}</span>
        {carregando && <span className="muted small" style={{ marginLeft: 8 }}>carregando…</span>}
        {!carregando && (
          <span className="muted small" style={{ marginLeft: 8 }}>
            {vinculadas.size} de {catalogo.length} vinculada{vinculadas.size !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!carregando && catalogo.length === 0 && (
        <div className="muted small">Nenhuma ferramenta disponível para este tenant.</div>
      )}

      {!carregando && catalogo.length > 0 && (
        <div className="col gap-2">
          {catalogo.map((f) => {
            const ativa = vinculadas.has(f.id);
            const emAndamento = toggling === f.id;
            return (
              <div
                key={f.id}
                className="row gap-2"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: ativa ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: `1px solid ${ativa ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
                  alignItems: 'center',
                  opacity: emAndamento ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {/* Checkbox de vínculo */}
                <span
                  className={`chk ${ativa ? 'on' : ''}`}
                  onClick={() => !emAndamento && toggleFerramenta(f.id, !ativa)}
                  style={{ cursor: emAndamento ? 'wait' : 'pointer', flexShrink: 0 }}
                >
                  {ativa && <Icon name="check" size={11} stroke="white" />}
                </span>

                {/* Info da ferramenta */}
                <div className="col" style={{ flex: 1, gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{f.nome_tool}</span>
                  <span className="muted small">{f.descricao}</span>
                </div>

                {/* Badges de escopo + aprovação */}
                <div className="row gap-1" style={{ flexShrink: 0 }}>
                  <span
                    className="muted small"
                    style={{
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: 'rgba(255,255,255,0.06)',
                      fontSize: 11,
                    }}
                  >
                    {escopoLabel(f.escopo)}
                  </span>
                  {f.precisa_aprovacao && (
                    <span
                      className="muted small"
                      style={{
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: 'rgba(255,200,0,0.10)',
                        color: 'oklch(0.85 0.15 85)',
                        fontSize: 11,
                      }}
                    >
                      aprovação
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
