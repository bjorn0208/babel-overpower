/**
 * Aba Consultoria — leitura estratégica do caixa do mês.
 *
 * Mora dentro do app Financeiro de propósito: os dados da empresa
 * (movimentos, contas, metas) já vivem aqui — a consultoria é a camada
 * que lê esses números e devolve saúde + estratégia. Com movimentos reais
 * calcula tudo ao vivo; sem dados, mostra o exemplo demo marcado.
 */

import { motion } from "framer-motion";
import { fadeSlideIn } from "@/os/motion/presets";
import { formatBRL, type MovimentoFinanceiro } from "./tipos";

type Estrategia = { titulo: string; texto: string; tom: "alerta" | "ok" | "neutro" };

const COR_TOM: Record<Estrategia["tom"], string> = {
  alerta: "oklch(0.75 0.16 75)",
  ok: "oklch(0.72 0.18 145)",
  neutro: "oklch(0.7 0.18 220)",
};

const ESTRATEGIAS_DEMO: Estrategia[] = [
  { titulo: "Exemplo — reserva de emergência", texto: "Separar 10% de cada entrada até cobrir 3 meses de custo fixo.", tom: "neutro" },
  { titulo: "Exemplo — corte de assinatura", texto: "Revisar ferramentas pagas sem uso nos últimos 60 dias.", tom: "alerta" },
  { titulo: "Exemplo — antecipação de recebível", texto: "Negociar desconto de 3% pra cliente que pagar à vista.", tom: "ok" },
];

function mesPorExtenso(mes: string): string {
  const [ano, mm] = mes.split("-").map(Number);
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[(mm ?? 1) - 1]}/${ano}`;
}

type Props = { movimentos: MovimentoFinanceiro[]; mes: string };

export function AbaConsultoria({ movimentos, mes }: Props) {
  const entradas = movimentos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + (Number(m.valor) || 0), 0);
  const saidas = movimentos.filter((m) => m.tipo === "saida").reduce((s, m) => s + (Number(m.valor) || 0), 0);
  const resultado = entradas - saidas;
  const margem = entradas > 0 ? (resultado / entradas) * 100 : 0;
  const temDados = movimentos.length > 0;

  // Maior categoria de saída do mês (pra estratégia dirigida).
  const porCategoria = new Map<string, number>();
  for (const m of movimentos) {
    if (m.tipo !== "saida") continue;
    const c = (m.categoria ?? "sem categoria").trim() || "sem categoria";
    porCategoria.set(c, (porCategoria.get(c) ?? 0) + (Number(m.valor) || 0));
  }
  const topSaida = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  // Pontuação de saúde 0–100 por regras simples e explicáveis.
  let pontuacao = 50;
  if (resultado > 0) pontuacao += 20;
  if (resultado < 0) pontuacao -= 20;
  if (margem >= 20) pontuacao += 15;
  else if (margem >= 10) pontuacao += 8;
  if (movimentos.length >= 10) pontuacao += 10;
  pontuacao = Math.max(5, Math.min(95, pontuacao));

  const corPontuacao = pontuacao >= 70 ? COR_TOM.ok : pontuacao >= 45 ? COR_TOM.alerta : "oklch(0.65 0.24 25)";
  const leitura = !temDados
    ? "Sem movimentos neste mês — registre pelo WhatsApp ou na aba Movimentos que a leitura nasce sozinha."
    : resultado > 0
      ? `Mês no azul: sobraram ${formatBRL(resultado)} (margem de ${margem.toFixed(0)}%). Dá pra transformar essa sobra em estratégia.`
      : `Mês no vermelho: faltaram ${formatBRL(Math.abs(resultado))}. Prioridade é estancar a maior saída antes de pensar em crescer.`;

  const estrategias: Estrategia[] = temDados
    ? [
        resultado > 0
          ? { titulo: "Destinar a sobra", texto: `Separar ${formatBRL(resultado * 0.5)} (metade da sobra) pra reserva ou meta antes que vire gasto.`, tom: "ok" }
          : { titulo: "Estancar o vermelho", texto: `Cortar ou renegociar já o suficiente pra cobrir ${formatBRL(Math.abs(resultado))} e zerar o mês.`, tom: "alerta" },
        topSaida
          ? { titulo: `Maior saída: ${topSaida[0]}`, texto: `${formatBRL(topSaida[1])} no mês. Vale renegociar fornecedor ou revisar se tudo aí é essencial.`, tom: "alerta" }
          : { titulo: "Categorizar as saídas", texto: "Sem categoria não há diagnóstico — marque as saídas pra consultoria apontar onde cortar.", tom: "neutro" },
        { titulo: "Rotina de leitura", texto: "Reservar 15 minutos toda segunda pra revisar esta aba — constância vale mais que planilha perfeita.", tom: "neutro" },
      ]
    : ESTRATEGIAS_DEMO;

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      {/* Hero — pontuação de saúde + leitura do mês */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 20, padding: 20, marginBottom: 14,
          borderRadius: 16, border: "1px solid oklch(0.98 0 0 / 0.09)",
          background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.08), oklch(0.65 0.22 280 / 0.05))",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "grid", placeItems: "center", width: 92, height: 92, borderRadius: "50%", flexShrink: 0,
            background: `conic-gradient(${corPontuacao} ${pontuacao * 3.6}deg, oklch(0.98 0 0 / 0.08) 0deg)`,
          }}
        >
          <div style={{ display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: "50%", background: "oklch(0.22 0.02 265)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: corPontuacao, fontVariantNumeric: "tabular-nums" }}>{pontuacao}</div>
              <div style={{ fontSize: 9, color: "oklch(0.98 0 0 / 0.5)", letterSpacing: 0.5 }}>SAÚDE</div>
            </div>
          </div>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>Consultoria financeira — {mesPorExtenso(mes)}</div>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "oklch(0.98 0 0 / 0.7)", margin: "6px 0 0" }}>{leitura}</p>
        </div>
      </div>

      {/* Números do mês */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { rotulo: "Entradas", valor: formatBRL(entradas), cor: COR_TOM.ok },
          { rotulo: "Saídas", valor: formatBRL(saidas), cor: "oklch(0.65 0.24 25)" },
          { rotulo: "Resultado", valor: formatBRL(resultado), cor: resultado >= 0 ? COR_TOM.ok : "oklch(0.65 0.24 25)" },
          { rotulo: "Margem", valor: temDados ? `${margem.toFixed(0)}%` : "—", cor: "oklch(0.9 0.05 220)" },
        ].map((k) => (
          <div key={k.rotulo} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid oklch(0.98 0 0 / 0.08)", background: "oklch(0.98 0 0 / 0.03)" }}>
            <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginBottom: 4 }}>{k.rotulo}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: k.cor, fontVariantNumeric: "tabular-nums" }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Estratégias */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.98 0 0)", marginBottom: 10 }}>Estratégias do consultor</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {estrategias.map((e) => (
          <div key={e.titulo} style={{ padding: "13px 16px", borderRadius: 13, border: "1px solid oklch(0.98 0 0 / 0.09)", background: "oklch(0.98 0 0 / 0.03)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COR_TOM[e.tom], marginBottom: 4 }}>● {e.titulo}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "oklch(0.98 0 0 / 0.78)" }}>{e.texto}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: "oklch(0.98 0 0 / 0.45)" }}>
        Leitura gerada dos movimentos reais do caixa. A versão completa — plano de ação conversado — chega junto com o Mentor.
      </div>
    </motion.div>
  );
}
