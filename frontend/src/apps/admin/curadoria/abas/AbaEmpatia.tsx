// @ts-nocheck
// Aba 6 — Empatia
// Governa humor e afeto. Mapeia 19 emoções → afeto via mapa_emocao_afeto.
// Exibe top leads por estado afetivo via estado_afetivo_lead.

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useEstadoAfetivo } from "../dados/use-estado-afetivo";
import { useMapaEmocaoAfeto } from "../dados/use-mapa-emocao-afeto";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── tipos locais ────────────────────────────────────────────────────────────

interface MapaEmocao {
  emocao: string;
  afeto: -1 | 0 | 1;
}

interface LeadHumor {
  id: string;
  nome: string;
  telefone: string;
  valencia: number;
  ativacao: number;
  confianca: number;
}

// ─── sub-componente: card de top leads por humor ──────────────────────────────

function CardHumor({
  titulo,
  leads,
  cor,
}: {
  titulo: string;
  leads: LeadHumor[];
  cor: string;
}) {
  return (
    <div className="os-card p-3">
      <div className="tiny uppercase text-txt3 mb-2 row gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: `var(--os-${cor})` }}
        />
        {titulo}
      </div>
      {leads.length === 0 ? (
        <div className="muted tiny">Nenhum lead</div>
      ) : (
        <div className="space-y-1.5">
          {leads.slice(0, 5).map((l) => (
            <div key={l.id} className="row gap-2 small rounded px-2 py-1" style={{ background: "var(--os-fundo)" }}>
              <div className="flex-1 min-w-0">
                <div className="truncate">{l.nome || l.telefone || "—"}</div>
                <div className="tiny muted mono tabular-nums">
                  val: {l.valencia.toFixed(2)} · atv: {l.ativacao.toFixed(2)}
                </div>
              </div>
              <div
                className="mono tabular-nums small font-medium shrink-0"
                style={{ color: `var(--os-${cor})` }}
              >
                {l.valencia > 0 ? "+" : ""}
                {l.valencia.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── heatmap REAL de mudanças de humor (7d × 24h) ────────────────────────────

function HeatmapHumor({ celulas }: { celulas: { dia_semana: number; hora: number; qtd: number; valencia_media: number }[] }) {
  // DOW Postgres: 0=domingo … 6=sábado
  const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  // mapeia (dia,hora) → célula
  const mapa = new Map<string, { qtd: number; valencia_media: number }>();
  for (const c of celulas) mapa.set(`${c.dia_semana}-${c.hora}`, c);
  const maxQtd = Math.max(1, ...celulas.map((c) => c.qtd));

  return (
    <div className="os-card p-4">
      <div className="row mb-3">
        <div className="tiny uppercase text-txt3 tracking-wide">
          Histórico de mudanças de humor · últimos 7d
        </div>
        <span className="mono tiny muted">vw_heatmap_humor_7d · banco real</span>
      </div>
      <div className="flex gap-1 items-stretch" style={{ height: 110 }}>
        <div className="flex flex-col justify-around tiny muted mono shrink-0" style={{ width: 28 }}>
          {DIAS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="grid gap-px flex-1" style={{ gridTemplateRows: "repeat(7, 1fr)", gridTemplateColumns: "repeat(24, 1fr)" }}>
          {Array.from({ length: 7 * 24 }, (_, i) => {
            const dow = Math.floor(i / 24);
            const hr = i % 24;
            const c = mapa.get(`${dow}-${hr}`);
            const qtd = c?.qtd ?? 0;
            const val = c?.valencia_media ?? 0;
            const cor = qtd === 0 ? "oklch(0.32 0.01 240)" : val > 0.1 ? "oklch(0.72 0.18 145)" : val < -0.1 ? "oklch(0.65 0.20 25)" : "oklch(0.65 0.10 220)";
            const op = qtd === 0 ? 0.15 : Math.min(1, 0.3 + (qtd / maxQtd) * 0.7);
            return (
              <div
                key={i}
                className="rounded-sm"
                style={{ background: cor, opacity: op }}
                title={qtd > 0 ? `${DIAS[dow]} ${hr}h · ${qtd} mudanças · val ${val.toFixed(2)}` : `${DIAS[dow]} ${hr}h · sem dados`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex justify-between tiny muted mono mt-2" style={{ paddingLeft: 28 }}>
        {[0, 6, 12, 18, 23].map((h) => <span key={h}>{String(h).padStart(2,"0")}h</span>)}
      </div>
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaEmpatia() {
  const tenant = useTenantImpersonado();
  const { topPositivo, topNegativo, carregando } = useEstadoAfetivo(
    tenant.id === TENANT_UNIVERSO.id ? null : tenant.id
  );
  const mapaReal = useMapaEmocaoAfeto();
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  function afetoDiscreto(v: number): -1 | 0 | 1 {
    if (v > 0.2) return 1;
    if (v < -0.2) return -1;
    return 0;
  }

  async function trocarAfeto(emocao: string, novo: -1 | 0 | 1) {
    setSalvandoId(emocao);
    // converte afeto discreto → valencia contínua (mantém ativacao)
    const valencia = novo === 0 ? 0 : (novo as number) * 0.5;
    try {
      await mapaReal.salvar(emocao, { valencia });
    } catch (e: any) {
      console.error("[AbaEmpatia] erro salvar:", e?.message);
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3" style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }}>Empatia</div>
          <div className="small muted mt-0.5" style={{ opacity: 0.7 }}>
            19 emoções → valência/ativação · top leads por humor · heatmap 7d · banco real
          </div>
        </div>
        <span className="muted tiny mono">mapa_emocao_afeto</span>
      </div>

      {/* conteúdo */}
      <div className="grid gap-4 p-5 overflow-auto flex-1" style={{ gridTemplateColumns: "1fr 320px" }}>
        {/* mapa emoção → afeto */}
        <div className="space-y-4">
          <div className="os-card p-4">
            <div className="tiny uppercase text-txt3 tracking-wide mb-3">
              Mapa emoção → afeto · {mapaReal.emocoes.length} emoções · salva ao clicar
            </div>
            {mapaReal.status === "carregando" ? (
              <div className="muted small">carregando…</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mapaReal.emocoes.map((e) => {
                  const afeto = afetoDiscreto(Number(e.valencia));
                  const salvando = salvandoId === e.emocao;
                  return (
                    <div
                      key={e.emocao}
                      className="row gap-2 rounded-lg px-3 py-2"
                      style={{ background: "var(--os-fundo)", border: "1px solid var(--os-borda)", opacity: salvando ? 0.55 : 1 }}
                    >
                      <div className="small flex-1 capitalize">
                        {e.emocao.replace(/_/g, " ")}
                      </div>
                      <div
                        className="flex rounded overflow-hidden tiny mono"
                        style={{ background: "var(--os-painel)", border: "1px solid var(--os-borda)" }}
                      >
                        {([
                          { v: -1 as const, l: "−1", cor: "var(--os-perigo)" },
                          { v: 0 as const, l: "0", cor: "var(--os-txt2)" },
                          { v: 1 as const, l: "+1", cor: "var(--os-acento-1)" },
                        ] as { v: -1 | 0 | 1; l: string; cor: string }[]).map((opt) => (
                          <button
                            key={opt.v}
                            onClick={() => trocarAfeto(e.emocao, opt.v)}
                            disabled={salvando}
                            className="px-2 py-1 transition-colors"
                            style={
                              afeto === opt.v
                                ? { background: "var(--os-painel2)", color: opt.cor, fontWeight: 600 }
                                : { color: "var(--os-txt3)" }
                            }
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* heatmap REAL */}
          <HeatmapHumor celulas={mapaReal.heatmap} />
        </div>

        {/* coluna direita — top leads */}
        <div className="space-y-3">
          {carregando ? (
            <div className="muted small">Carregando estados afetivos…</div>
          ) : (
            <>
              <CardHumor titulo="Top positivo" leads={topPositivo} cor="acento-1" />
              <CardHumor titulo="Top negativo" leads={topNegativo} cor="perigo" />
            </>
          )}

          {/* legenda */}
          <div className="os-card p-3 space-y-1.5">
            <div className="tiny uppercase text-txt3">Legenda</div>
            <div className="tiny muted space-y-1">
              <div><strong>valência</strong> — quão positivo/negativo o estado emocional (-1 a +1)</div>
              <div><strong>ativação</strong> — quão intenso/arousal (0 a 1)</div>
              <div><strong>confiança</strong> — grau de confiança na relação com o agente (0 a 1)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
