// @ts-nocheck
/**
 * AbaConversa — dossiê de lead com busca por telefone/nome/email.
 * Banco real: leads, fichas_lead, memoria_lead, crenca_conversa, estado_afetivo_lead.
 * Sem tenant impersonado = empty state "selecione um tenant".
 */

import { useEffect, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { supabase } from "@/integrations/supabase/client";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useLeadsBusca } from "../dados/use-leads-busca";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── tipos internos ──────────────────────────────────────────────────────────

interface Memoria {
  id: string;
  conteudo: string;
  tipo: string;
  confianca: number | null;
  criado_em: string;
}

interface Crenca {
  id: string;
  resumo: string | null;
  humor_da_relacao: string | null;
  criado_em: string;
}

interface EstadoAfetivo {
  valencia: number;
  ativacao: number;
  confianca: number;
}

interface DossieData {
  status: "carregando" | "ok" | "erro";
  ficha: Record<string, unknown> | null;
  memorias: Memoria[];
  crenca: Crenca | null;
  estado: EstadoAfetivo | null;
}

// ─── hook dossie ─────────────────────────────────────────────────────────────

function useDossie(leadId: string | null) {
  const [dossie, setDossie] = useState<DossieData>({
    status: "carregando",
    ficha: null,
    memorias: [],
    crenca: null,
    estado: null,
  });

  useEffect(() => {
    if (!leadId) {
      setDossie({ status: "ok", ficha: null, memorias: [], crenca: null, estado: null });
      return;
    }
    let ativo = true;
    setDossie((d) => ({ ...d, status: "carregando" }));

    async function carregar() {
      try {
        const [fichaRes, memRes, crencaRes, estadoRes] = await Promise.all([
          (supabase as any).from("fichas_lead").select("dados_capturados").eq("lead_id", leadId).maybeSingle(),
          (supabase as any).from("memoria_lead").select("id, conteudo, tipo, confianca, criado_em").eq("lead_id", leadId).order("criado_em", { ascending: false }).limit(20),
          (supabase as any).from("crenca_conversa").select("id, resumo, humor_da_relacao, criado_em").eq("lead_id", leadId).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
          (supabase as any).from("estado_afetivo_lead").select("valencia, ativacao, confianca").eq("lead_id", leadId).maybeSingle(),
        ]);

        if (!ativo) return;

        setDossie({
          status: "ok",
          ficha: fichaRes.data?.dados_capturados ?? null,
          memorias: (memRes.data ?? []) as Memoria[],
          crenca: crencaRes.data ?? null,
          estado: estadoRes.data ?? null,
        });
      } catch (err: any) {
        if (!ativo) return;
        console.warn("[useDossie] erro:", err?.message);
        setDossie((d) => ({ ...d, status: "erro" }));
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [leadId]);

  return dossie;
}

// ─── sub-componentes ─────────────────────────────────────────────────────────

function BarraAfeto({ label, v, signed }: { label: string; v: number; signed?: boolean }) {
  const pct = signed ? ((v + 1) / 2) * 100 : v * 100;
  const cor = signed
    ? v > 0.2 ? "oklch(0.72 0.18 145)" : v < -0.2 ? "oklch(0.65 0.20 25)" : "oklch(0.72 0.14 220)"
    : "oklch(0.72 0.14 220)";
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
        <span className="mono muted tiny">{label}</span>
        <span className="mono" style={{ fontSize: 11 }}>{v.toFixed(2)}</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 99 }} />
      </div>
    </div>
  );
}

function DossieView({ lead, dossie }: { lead: any; dossie: DossieData }) {
  if (dossie.status === "carregando") {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        {[120, 80, 160].map((h, i) => (
          <div key={i} className="os-card" style={{ height: h, animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  const fichaEntries = dossie.ficha ? Object.entries(dossie.ficha).slice(0, 12) : [];
  const memorias = dossie.memorias;

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header lead */}
      <div className="os-card" style={{ padding: 14 }}>
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <div className="row center" style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,var(--os-acento-1-soft),var(--os-acento-2-soft))", flexShrink: 0, fontWeight: 700, fontSize: 15 }}>
            {(lead.nome ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{lead.nome ?? "—"}</div>
            <div className="muted tiny mono">{lead.telefone ?? "sem telefone"} · {lead.email ?? "sem e-mail"}</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 10 }}>{lead.pipeline_stage ?? lead.desfecho ?? "em_aberto"}</span>
        </div>
      </div>

      {/* Grid ficha + afeto + crença */}
      <div style={{ display: "grid", gridTemplateColumns: "5fr 3fr 4fr", gap: 12 }}>
        {/* Ficha */}
        <div className="os-card" style={{ padding: 12 }}>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Ficha</div>
          {fichaEntries.length === 0 ? (
            <div className="muted small">Sem dados capturados.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {fichaEntries.map(([k, v]) => (
                <div key={k} className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                  <span className="mono muted" style={{ fontSize: 11 }}>{k}</span>
                  <span style={{ maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado afetivo */}
        <div className="os-card" style={{ padding: 12 }}>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Estado afetivo</div>
          {dossie.estado ? (
            <>
              <BarraAfeto label="valência" v={dossie.estado.valencia} signed />
              <BarraAfeto label="ativação" v={dossie.estado.ativacao} />
              <BarraAfeto label="confiança" v={dossie.estado.confianca} />
            </>
          ) : (
            <div className="muted small">Sem estado afetivo registrado.</div>
          )}
        </div>

        {/* Crença */}
        <div className="os-card" style={{ padding: 12 }}>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Crença atual</div>
          {dossie.crenca ? (
            <>
              <div className="small" style={{ lineHeight: 1.55, color: "var(--txt-2)" }}>{dossie.crenca.resumo ?? "Sem resumo."}</div>
              {dossie.crenca.humor_da_relacao && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <span className="muted">humor da relação: </span>
                  <span style={{ color: "oklch(0.72 0.18 145)", fontWeight: 500 }}>{dossie.crenca.humor_da_relacao}</span>
                </div>
              )}
            </>
          ) : (
            <div className="muted small">Sem crença registrada.</div>
          )}
        </div>
      </div>

      {/* Memórias */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {["longa", "curta"].map((tipo) => {
          const lista = memorias.filter((m) => m.tipo === tipo || (tipo === "longa" && m.tipo === "episodica") || (tipo === "curta" && !["longa","episodica"].includes(m.tipo)));
          return (
            <div key={tipo} className="os-card" style={{ padding: 12 }}>
              <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Memórias {tipo === "longa" ? "longas" : "curtas"} · {lista.length}
              </div>
              {lista.length === 0 ? (
                <div className="muted small">Sem memórias.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {lista.map((m) => (
                    <div key={m.id} className="os-card" style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{m.conteudo}</div>
                      <div className="row gap-3 muted tiny mono" style={{ marginTop: 4 }}>
                        <span>{new Date(m.criado_em).toLocaleDateString("pt-BR")}</span>
                        {m.confianca != null && <span>confiança {(m.confianca * 100).toFixed(0)}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export function AbaConversa() {
  const tenant = useTenantImpersonado();
  const ehUniverso = tenant.id === TENANT_UNIVERSO.id;
  const [busca, setBusca] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);

  const { status, leads } = useLeadsBusca(ehUniverso ? null : tenant.id, busca);
  const leadSel = leads.find((l) => l.id === leadId) ?? null;
  const dossie = useDossie(leadId);

  if (ehUniverso) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40 }}>
        <div className="os-card row center" style={{ width: 64, height: 64, borderRadius: 18 }}>
          <Icon name="users" size={26} />
        </div>
        <div className="h3">Selecione um tenant</div>
        <div className="muted small" style={{ textAlign: "center", maxWidth: 320 }}>
          Use o seletor na topbar para impersonar um tenant. Aí você busca leads pelo telefone ou nome.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Coluna busca */}
      <div style={{ width: 260, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="row gap-2 os-card" style={{ padding: "6px 10px" }}>
            <Icon name="search" size={13} />
            <input
              className="input"
              style={{ border: "none", background: "transparent", flex: 1, fontSize: 12, height: 22 }}
              placeholder="telefone, nome, e-mail…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {status === "carregando" && (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {[1,2,3].map((i) => <div key={i} style={{ height: 52, background: "rgba(255,255,255,0.03)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />)}
            </div>
          )}
          {status === "ok" && leads.length === 0 && (
            <div style={{ padding: 20, textAlign: "center" }}>
              <div className="muted small">Nenhum lead encontrado.</div>
            </div>
          )}
          {status === "ok" && leads.map((l) => {
            const sel = l.id === leadId;
            return (
              <button key={l.id} onClick={() => setLeadId(l.id)}
                style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: sel ? "rgba(255,255,255,0.06)" : "transparent", cursor: "pointer" }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{l.nome ?? "—"}</span>
                  <span className="badge badge-info" style={{ fontSize: 9 }}>{l.pipeline_stage ?? l.desfecho ?? "—"}</span>
                </div>
                <div className="mono muted tiny">{l.telefone ?? "sem telefone"}</div>
                {l.total_mensagens != null && (
                  <div className="muted tiny" style={{ marginTop: 2 }}>{l.total_mensagens} mensagens</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dossiê */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {!leadSel ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <Icon name="search" size={24} />
            <div className="h3 muted">Busque um lead</div>
            <div className="muted small">O dossiê completo aparece aqui.</div>
          </div>
        ) : (
          <DossieView lead={leadSel} dossie={dossie} />
        )}
      </div>
    </div>
  );
}
