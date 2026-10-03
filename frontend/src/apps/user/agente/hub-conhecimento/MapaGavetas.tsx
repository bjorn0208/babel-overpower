/**
 * Mapa do hub: grid de cards, um por gaveta. Cada card mostra o que o agente
 * tem naquela gaveta vindo de Universo / Nicho / Você num olhar. Clica → abre.
 * Upgrade 2026-07-05: tile de ícone, número tabular, legenda por extenso
 * (leigo entende sem decorar sigla), hover/press, card vazio orienta o começo.
 */

import { motion } from "framer-motion";
import { tapPress } from "@/os/motion/presets";
import { GAVETAS, corEscopo, type Gaveta } from "./gavetas";
import type { ContagemEscopo } from "./use-hub-conhecimento";
import { Vazio } from "./ui-hub";

export function MapaGavetas({
  contagens,
  carregando,
  onAbrir,
}: {
  contagens: Record<string, ContagemEscopo>;
  carregando: boolean;
  onAbrir: (g: Gaveta) => void;
}) {
  if (carregando) return <Vazio mensagem="Lendo o que o agente sabe…" />;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}
    >
      {GAVETAS.map((g) => (
        <CardGaveta key={g.id} gaveta={g} c={contagens[g.id]} onAbrir={() => onAbrir(g)} />
      ))}
    </div>
  );
}

function CardGaveta({
  gaveta,
  c,
  onAbrir,
}: {
  gaveta: Gaveta;
  c: ContagemEscopo | undefined;
  onAbrir: () => void;
}) {
  const { Icone } = gaveta;
  const cont = c ?? { global: 0, nicho: 0, tenant: 0 };
  const total = cont.global + cont.nicho + cont.tenant;
  const vazia = total === 0;
  return (
    <motion.button
      whileTap={tapPress}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir gaveta ${gaveta.rotulo} (${total} bloco${total === 1 ? "" : "s"})`}
      style={{
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        borderRadius: 14,
        background: "oklch(0.18 0.06 280 / 0.4)",
        border: "1px solid oklch(0.98 0 0 / 0.07)",
        cursor: "pointer",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            width: 32,
            height: 32,
            borderRadius: 9,
            flexShrink: 0,
            color: "oklch(0.75 0.14 280)",
            background: "oklch(0.68 0.14 290 / 0.14)",
            border: "1px solid oklch(0.68 0.14 290 / 0.2)",
          }}
        >
          <Icone size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.98 0 0)" }}>{gaveta.rotulo}</div>
        </div>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontVariantNumeric: "tabular-nums",
            color: vazia ? "oklch(0.98 0 0 / 0.25)" : "oklch(0.98 0 0 / 0.9)",
            lineHeight: 1,
          }}
        >
          {total}
        </span>
      </div>
      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", lineHeight: 1.5, minHeight: 32 }}>
        {gaveta.descricao}
      </span>
      {vazia ? (
        <span style={{ fontSize: 10.5, color: "oklch(0.7 0.18 220 / 0.8)", fontWeight: 500 }}>
          Vazia — toque pra criar o primeiro bloco
        </span>
      ) : (
        <BarraEscopos cont={cont} total={total} />
      )}
    </motion.button>
  );
}

function BarraEscopos({ cont, total }: { cont: ContagemEscopo; total: number }) {
  const pct = (n: number) => (total > 0 ? `${Math.max((n / total) * 100, n > 0 ? 4 : 0)}%` : "0%");
  const segmentos: { escopo: "global" | "nicho" | "tenant"; n: number; rotulo: string }[] = [
    { escopo: "global", n: cont.global, rotulo: "Universo" },
    { escopo: "nicho", n: cont.nicho, rotulo: "Nicho" },
    { escopo: "tenant", n: cont.tenant, rotulo: "Você" },
  ];
  const visiveis = segmentos.filter((s) => s.n > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          background: "oklch(0.98 0 0 / 0.06)",
        }}
      >
        {segmentos.map((s) => (
          <div key={s.escopo} style={{ width: pct(s.n), background: corEscopo(s.escopo) }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, color: "oklch(0.98 0 0 / 0.55)" }}>
        {visiveis.map((s) => (
          <span key={s.escopo} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: "50%", background: corEscopo(s.escopo), display: "inline-block" }}
            />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {s.n} {s.rotulo}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
