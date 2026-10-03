// @ts-nocheck
/**
 * AbaCerebro — visualizador em tempo real do motor ragentic-processar-inline.
 * Onda 4: 100% REAL — vw_cerebro_kpis_1h + vw_cerebro_turnos_recentes (traces).
 */

import { useMemo, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useCerebroReal } from "../dados/use-cerebro-real";

// ─── sub-componentes ─────────────────────────────────────────────────────────

function GraficoLinha({ dados }: { dados: number[] }) {
  const max = Math.max(...dados);
  const w = 1080, h = 80;
  const step = w / (dados.length - 1);
  const path = dados.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (v / max) * h}`).join(" ");
  const fill = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width="100%" height={h + 14} viewBox={`0 0 ${w} ${h + 14}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad-custo-cerebro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#grad-custo-cerebro)" />
      <path d={path} stroke="oklch(0.72 0.18 145)" strokeWidth="1.6" fill="none" />
      {dados.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * h} r="1.6" fill="oklch(0.72 0.18 145)" />
      ))}
      {Array.from({ length: 25 }).map((_, i) =>
        i % 6 === 0 ? (
          <text key={i} x={i * step} y={h + 12} textAnchor={i === 0 ? "start" : i === 24 ? "end" : "middle"} fontSize="9" fill="oklch(0.55 0.01 240)" fontFamily="monospace">
            {String(i).padStart(2, "0")}h
          </text>
        ) : null,
      )}
    </svg>
  );
}

function BadgeStatus({ status }: { status: string }) {
  if (status === "sucesso" || status === "ok") return <span className="badge badge-success" style={{ fontSize: 10 }}>ok</span>;
  if (status === "erro" || status === "falhou") return <span className="badge badge-err" style={{ fontSize: 10 }}>erro</span>;
  return <span className="badge" style={{ fontSize: 10 }}>{status}</span>;
}

function DetalhesTurno({ turno, onFechar }: { turno: any; onFechar: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onFechar}>
      <div className="os-card" style={{ width: 680, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="h3">Trace · <span style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.7 }}>{turno.id?.slice(0, 8)}</span> · <span style={{ fontSize: 12, opacity: 0.7 }}>{turno.modelo_llm}</span></span>
          <button className="btn btn-ghost btn-sm" onClick={onFechar}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[
              { l: "tokens in", v: (turno.custo_tokens_in ?? 0).toLocaleString("pt-BR") },
              { l: "tokens out", v: String(turno.custo_tokens_out ?? 0) },
              { l: "latência", v: turno.latencia_ms ? `${turno.latencia_ms}ms` : "—" },
              { l: "custo est.", v: turno.custo_usd_estimado ? `$${Number(turno.custo_usd_estimado).toFixed(5)}` : "—" },
            ].map(({ l, v }) => (
              <div key={l} className="os-card" style={{ padding: 8 }}>
                <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                <div className="mono" style={{ marginTop: 2, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
          {turno.confianca != null && (
            <div>
              <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Confiança</div>
              <div className="mono">{(Number(turno.confianca) * 100).toFixed(1)}%</div>
            </div>
          )}
          <div>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Tipo</div>
            <span className="badge badge-info" style={{ fontSize: 10 }}>{turno.tipo ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export function AbaCerebro() {
  const [janela, setJanela] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [turnoSel, setTurnoSel] = useState<any | null>(null);
  const { status, kpis, turnos, erro, refetch } = useCerebroReal();

  // série de custo por hora a partir dos turnos (últimas 24h)
  const CUSTO_SERIE = useMemo(() => {
    if (turnos.length === 0) return Array(24).fill(0);
    const buckets = Array(24).fill(0);
    const agora = Date.now();
    for (const t of turnos) {
      const d = new Date(t.criado_em).getTime();
      const horasAtras = Math.floor((agora - d) / (60 * 60 * 1000));
      if (horasAtras >= 0 && horasAtras < 24) {
        buckets[23 - horasAtras] += Number(t.custo_usd_estimado ?? 0);
      }
    }
    return buckets;
  }, [turnos]);

  const KPIS = [
    { titulo: "Turnos / hora", valor: kpis ? String(kpis.turnos_hora) : "—", positivo: true },
    { titulo: "Latência p50", valor: kpis ? `${(kpis.latencia_p50_ms / 1000).toFixed(2)}s` : "—", positivo: true },
    { titulo: "Latência p95", valor: kpis ? `${(kpis.latencia_p95_ms / 1000).toFixed(2)}s` : "—", positivo: kpis ? kpis.latencia_p95_ms < 5000 : true },
    { titulo: "Custo última h", valor: kpis ? `$${Number(kpis.custo_hora_usd).toFixed(2)}` : "—", positivo: true },
  ];

  const custo24h = CUSTO_SERIE.reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Cabeçalho */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="h1" style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.2 }}>
            Cérebro
            {status === "ok" && (
              <span className="badge badge-info" style={{ fontSize: 10, verticalAlign: "middle", marginLeft: 8 }}>{turnos.length} turnos · {janela}</span>
            )}
          </div>
          <div className="muted small" style={{ marginTop: 4, opacity: 0.7 }}>
            Últimos traces do motor ragentic-processar-inline · banco real
          </div>
        </div>
        <div className="row gap-2">
          <div className="row" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}>
            {(["1h","24h","7d","30d"] as const).map((j) => (
              <button key={j} onClick={() => setJanela(j)} className="btn btn-ghost btn-sm"
                style={{ borderRadius: 0, background: janela === j ? "rgba(255,255,255,0.08)" : "transparent", fontFamily: "monospace", fontSize: 11 }}>
                {j}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs reais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {KPIS.map(({ titulo, valor }) => (
          <div key={titulo} className="os-card" style={{ padding: 12 }}>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{titulo}</div>
            <div className="row gap-2" style={{ alignItems: "baseline", marginTop: 4 }}>
              <span className="kpi-num" style={{ fontSize: 20 }}>{valor}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico custo — REAL */}
      <div className="os-card" style={{ padding: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, alignItems: "flex-end" }}>
          <div>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Custo · últimas 24h (estimado por modelo)</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>${custo24h.toFixed(2)}</div>
          </div>
          <span className="muted tiny mono">traces · {turnos.length} amostras</span>
        </div>
        {status === "carregando" ? (
          <div style={{ height: 80, background: "rgba(255,255,255,0.03)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
        ) : (
          <GraficoLinha dados={CUSTO_SERIE.map((v) => Math.max(0.001, v))} />
        )}
      </div>

      {status === "erro" && (
        <div className="os-card" style={{ padding: "10px 14px", background: "oklch(0.65 0.24 25 / 0.10)", border: "1px solid oklch(0.65 0.24 25 / 0.3)", borderRadius: 10 }}>
          <div className="row gap-2">
            <Icon name="alert" size={13} />
            <span className="small" style={{ color: "oklch(0.82 0.20 25)", flex: 1 }}>erro: {erro}</span>
            <button className="btn btn-ghost btn-sm" onClick={refetch}>tentar de novo</button>
          </div>
        </div>
      )}

      {/* Tabela de turnos — REAL */}
      <div className="os-card" style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["hora","lead","cargo","modelo","tipo","in","out","ms","$","conf"].map((h) => (
                  <th key={h} className="muted tiny mono" style={{ padding: "6px 10px", textAlign: ["in","out","ms","$","conf"].includes(h) ? "right" : "left", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status === "carregando" && (
                <tr><td colSpan={10} className="muted small" style={{ padding: 20, textAlign: "center" }}>carregando traces…</td></tr>
              )}
              {status === "ok" && turnos.length === 0 && (
                <tr><td colSpan={10} className="muted small" style={{ padding: 20, textAlign: "center" }}>sem traces nas últimas 24h</td></tr>
              )}
              {status === "ok" && turnos.map((t, i) => {
                const hora = new Date(t.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const modelo = t.modelo_llm?.split("/").slice(-1)[0] ?? "—";
                return (
                  <tr key={t.id}
                    style={{ borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer" }}
                    onClick={() => setTurnoSel(t)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td className="mono" style={{ padding: "6px 10px", whiteSpace: "nowrap", color: "var(--txt-3)" }}>{hora}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{t.lead_nome ?? (t.lead_id ? t.lead_id.slice(0, 8) : "—")}</td>
                    <td style={{ padding: "6px 10px" }}>{t.cargo_nome ? <span className="badge" style={{ fontSize: 10 }}>{t.cargo_nome}</span> : <span className="muted tiny">—</span>}</td>
                    <td className="mono" style={{ padding: "6px 10px", fontSize: 11, color: "oklch(0.72 0.14 220)", whiteSpace: "nowrap" }}>{modelo}</td>
                    <td style={{ padding: "6px 10px" }}><span className="badge badge-info" style={{ fontSize: 9 }}>{t.tipo ?? "—"}</span></td>
                    <td className="mono" style={{ padding: "6px 10px", textAlign: "right", color: "var(--txt-3)" }}>{(t.custo_tokens_in ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="mono" style={{ padding: "6px 10px", textAlign: "right", color: "var(--txt-3)" }}>{t.custo_tokens_out ?? 0}</td>
                    <td className="mono" style={{ padding: "6px 10px", textAlign: "right", color: t.latencia_ms && t.latencia_ms > 2500 ? "oklch(0.78 0.17 80)" : "var(--txt-3)" }}>{t.latencia_ms ?? "—"}</td>
                    <td className="mono" style={{ padding: "6px 10px", textAlign: "right" }}>{t.custo_usd_estimado ? `$${Number(t.custo_usd_estimado).toFixed(4)}` : "—"}</td>
                    <td className="mono" style={{ padding: "6px 10px", textAlign: "right", color: "var(--txt-3)" }}>{t.confianca != null ? `${(Number(t.confianca) * 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {turnoSel && <DetalhesTurno turno={turnoSel} onFechar={() => setTurnoSel(null)} />}
    </div>
  );
}
