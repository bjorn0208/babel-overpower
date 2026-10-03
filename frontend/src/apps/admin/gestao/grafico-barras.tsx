/**
 * Gráfico de barras empilhadas (faturamento e previsão, tokens, leads, setup a receber).
 * SVG puro, sem biblioteca — mesmo modo de MiniChart (bundle/bundle-shared.jsx:207-227): viewBox própria,
 * cores dos tokens do OS (var(--os-acento-1/2)), números em mono (bundle.css:361 `.kpi-num`).
 * Barra sólida = recebido; hachurada = previsto (como o original, financeiro.html:586-632).
 * A escala e os segmentos vêm de calculos.ts (provados contra o original).
 */

import { useMemo, useState } from "react";
import { escalaEixo, type Barra, type TipoBarra } from "./calculos";
import { abreviar, formatBRL } from "./tipos";

const COR: Record<TipoBarra, string> = {
  mensalidade: "var(--os-acento-1)", // artefato :15 --bar-mens (azul)
  setup: "var(--os-acento-2)", // artefato :15 --bar-setup (roxo)
};

const MONO = "'JetBrains Mono', ui-monospace, monospace"; // bundle.css:79

export function Amostra({ tipo, previsto }: { tipo: TipoBarra; previsto?: boolean }) {
  const cor = COR[tipo];
  return (
    <i
      aria-hidden
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: 3,
        border: `1px solid ${cor}`,
        background: previsto
          ? `repeating-linear-gradient(45deg, ${cor} 0 3px, transparent 3px 6px)`
          : cor,
      }}
    />
  );
}

export function GraficoBarras({
  barras,
  id,
  aria,
  altura = 230,
  larguraPorBarra = 64,
  larguraMaxBarra = 34,
  larguraMinima = 520,
  formatoTotal = abreviar,
  formatoDica = (v: number) => formatBRL(v),
  dicaCompleta,
}: {
  barras: Barra[];
  /** Único por gráfico na tela (id do padrão SVG). */
  id: string;
  aria: string;
  altura?: number;
  larguraPorBarra?: number;
  larguraMaxBarra?: number;
  larguraMinima?: number;
  formatoTotal?: (v: number) => string;
  formatoDica?: (v: number) => string;
  /**
   * Dica flutuante do artefato (hoverChart, :3094-3115): título da barra (ex.: o mês por extenso), TODOS os
   * segmentos — mesmo os zerados — e a linha "Total". Sem esta prop, fica a dica nativa (`<title>`).
   */
  dicaCompleta?: { titulo: (i: number) => string };
}) {
  const [sobre, setSobre] = useState<number | null>(null);
  const g = useMemo(() => {
    const n = barras.length;
    const W = Math.max(larguraMinima, n * larguraPorBarra);
    const padB = 30;
    const padL = 46;
    const padT = 14;
    const plotH = altura - padB - padT;
    const slot = (W - padL - 10) / n;
    const bw = Math.min(larguraMaxBarra, slot * 0.62);
    const eixo = escalaEixo(Math.max(0, ...barras.map((b) => b.total)));
    return { n, W, padB, padL, padT, plotH, slot, bw, eixo };
  }, [barras, altura, larguraPorBarra, larguraMaxBarra, larguraMinima]);

  const rotuloTipo = (t: TipoBarra, previsto: boolean) =>
    `${t === "mensalidade" ? "Mensalidade" : "Setup"} ${previsto ? "prevista" : "recebida"}`;

  const barraSobre = sobre !== null ? barras[sobre] : null;
  return (
    <div style={{ overflowX: "auto", position: "relative" }}>
      {dicaCompleta && barraSobre && sobre !== null && (
        <div
          className="os-vidro-forte"
          role="status"
          style={{
            position: "absolute",
            top: 8,
            left: Math.max(4, Math.min(g.padL + g.slot * sobre + g.slot / 2 - 95, g.W - 196)),
            width: 190,
            padding: "8px 10px",
            borderRadius: 10,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <div className="small" style={{ fontWeight: 600, marginBottom: 4, textTransform: "capitalize" }}>
            {dicaCompleta.titulo(sobre)}
          </div>
          {barraSobre.segmentos.map((s, k) => (
            <div key={k} className="row tiny" style={{ justifyContent: "space-between", gap: 8, marginTop: 2 }}>
              <span className="row gap-1">
                <Amostra tipo={s.tipo} previsto={s.previsto} /> {rotuloTipo(s.tipo, s.previsto)}
              </span>
              <span className="mono">{formatoDica(s.valor)}</span>
            </div>
          ))}
          <div
            className="row tiny"
            style={{
              justifyContent: "space-between",
              marginTop: 6,
              paddingTop: 4,
              borderTop: "1px solid var(--os-vidro-borda)",
              fontWeight: 600,
            }}
          >
            <span>Total</span>
            <span className="mono">{formatoDica(barraSobre.total)}</span>
          </div>
        </div>
      )}
      <svg
        viewBox={`0 0 ${g.W} ${altura}`}
        width={g.W}
        height={altura}
        role="img"
        aria-label={aria}
      >
        <defs>
          {(Object.keys(COR) as TipoBarra[]).map((t) => (
            <pattern
              key={t}
              id={`h-${id}-${t}`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" fill={COR[t]} opacity="0.2" />
              <rect width="3.2" height="7" fill={COR[t]} opacity="0.92" />
            </pattern>
          ))}
        </defs>
        {g.eixo.marcas.map((v, t) => {
          const y = g.padT + g.plotH - g.plotH * (v / g.eixo.topo);
          return (
            <g key={t}>
              <line
                x1={g.padL}
                y1={y}
                x2={g.W - 6}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text
                x={g.padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--txt-3)"
                fontFamily={MONO}
              >
                {abreviar(v)}
              </text>
            </g>
          );
        })}
        {barras.map((b, i) => {
          const cx = g.padL + g.slot * i + g.slot / 2;
          let y = g.padT + g.plotH;
          const dica = [
            b.rotulo,
            ...b.segmentos
              .filter((s) => s.valor > 0)
              .map((s) => `${rotuloTipo(s.tipo, s.previsto)}: ${formatoDica(s.valor)}`),
          ].join("\n");
          return (
            <g key={i}>
              {!dicaCompleta && <title>{dica}</title>}
              {b.segmentos.map((s, k) => {
                if (!s.valor) return null;
                const h = Math.max(1.5, g.plotH * (s.valor / g.eixo.topo));
                const yy = y - h;
                y -= h + 2;
                return (
                  <rect
                    key={k}
                    x={cx - g.bw / 2}
                    y={yy}
                    width={g.bw}
                    height={h}
                    rx="3"
                    fill={s.previsto ? `url(#h-${id}-${s.tipo})` : COR[s.tipo]}
                    stroke={s.previsto ? COR[s.tipo] : undefined}
                    strokeWidth={s.previsto ? 1.25 : undefined}
                  />
                );
              })}
              {b.total > 0 && (
                <text
                  x={cx}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="var(--txt-2)"
                  fontFamily={MONO}
                >
                  {formatoTotal(b.total)}
                </text>
              )}
              <text
                x={cx}
                y={altura - 10}
                textAnchor="middle"
                fontSize="10.5"
                fill={b.agora ? "var(--os-acento-1)" : "var(--txt-3)"}
                fontWeight={b.agora ? 600 : 400}
              >
                {b.rotulo}
              </text>
              {dicaCompleta && (
                <rect
                  x={g.padL + g.slot * i}
                  y={g.padT}
                  width={g.slot}
                  height={g.plotH}
                  fill="transparent"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setSobre(i)}
                  onMouseLeave={() => setSobre((x) => (x === i ? null : x))}
                />
              )}
            </g>
          );
        })}
        <line
          x1={g.padL}
          y1={g.padT + g.plotH}
          x2={g.W - 6}
          y2={g.padT + g.plotH}
          stroke="var(--os-vidro-borda-forte)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

/**
 * Barras horizontais empilhadas: recebido (sólido, cor da mensalidade) + em aberto (hachurado, cor do setup).
 * Artefato `hStack` (financeiro.html:634-648), usado em "Setup por cliente" (:761-764). Mesmo SVG puro do
 * gráfico vertical, mesmas cores e hachura; valor total em mono à direita da barra.
 */
export function GraficoBarrasHorizontais({
  linhas,
  id,
  aria,
  formato = (v: number) => formatBRL(v),
}: {
  linhas: Array<{ rotulo: string; a: number; b: number }>;
  id: string;
  aria: string;
  formato?: (v: number) => string;
}) {
  if (linhas.length === 0) return <p className="muted small">Sem dados ainda.</p>;
  const max = Math.max(1, ...linhas.map((r) => r.a + r.b));
  const H = linhas.length * 32 + 10;
  const W = 560;
  const labW = 170;
  const trackW = W - labW - 90;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={aria}>
        <defs>
          <pattern
            id={`hs-${id}`}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="7" fill={COR.setup} opacity="0.2" />
            <rect width="3.2" height="7" fill={COR.setup} opacity="0.92" />
          </pattern>
        </defs>
        {linhas.map((r, i) => {
          const y = i * 32 + 7;
          const wa = trackW * (r.a / max);
          const wb = trackW * (r.b / max);
          let x = labW;
          const xa = x;
          if (r.a > 0) x += wa + 2;
          const xb = x;
          if (r.b > 0) x += wb;
          return (
            <g key={i}>
              <title>{`${r.rotulo}
Recebido: ${formato(r.a)}
Em aberto: ${formato(r.b)}`}</title>
              <text x={0} y={y + 16} fontSize="12" fill="var(--txt-2)">
                {r.rotulo.length > 24 ? `${r.rotulo.slice(0, 23)}…` : r.rotulo}
              </text>
              {r.a > 0 && <rect x={xa} y={y + 4} width={Math.max(2, wa)} height={17} rx={4} fill={COR.mensalidade} />}
              {r.b > 0 && (
                <rect
                  x={xb}
                  y={y + 4}
                  width={Math.max(2, wb)}
                  height={17}
                  rx={4}
                  fill={`url(#hs-${id})`}
                  stroke={COR.setup}
                  strokeWidth={1.25}
                />
              )}
              <text x={x + 9} y={y + 17} fontSize="11" fontWeight="600" fill="var(--txt-2)" fontFamily={MONO}>
                {formato(r.a + r.b)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
