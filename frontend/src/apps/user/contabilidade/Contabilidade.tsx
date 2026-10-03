/**
 * App Contabilidade — módulos fiscais da empresa (fase visual).
 *
 * Grid de módulos (DAS, impostos, notas fiscais…) com resumo demo em cada
 * tile e painel de detalhe ao clicar. Sem banco ainda — o objetivo é dar
 * cara de produto pronto na apresentação de vendas; os dados reais entram
 * quando o contador/integração fiscal for conectado.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/bundle/bundle-shared";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";

type Modulo = {
  id: string;
  nome: string;
  icone: string;
  descricao: string;
  selo: string;
  tom: "alerta" | "ok" | "neutro";
  detalhe: Array<{ rotulo: string; valor: string }>;
};

const MODULOS: Modulo[] = [
  {
    id: "das",
    nome: "DAS",
    icone: "fileText",
    descricao: "Guia mensal do Simples Nacional",
    selo: "1 guia em aberto",
    tom: "alerta",
    detalhe: [
      { rotulo: "Competência", valor: "Julho/2026" },
      { rotulo: "Valor da guia", valor: "R$ 1.842,60" },
      { rotulo: "Vencimento", valor: "20/08/2026" },
      { rotulo: "Situação", valor: "Em aberto — código de barras disponível" },
    ],
  },
  {
    id: "impostos",
    nome: "Impostos",
    icone: "dollar",
    descricao: "DARF, ISS, INSS e retenções",
    selo: "Em dia",
    tom: "ok",
    detalhe: [
      { rotulo: "ISS retido no mês", valor: "R$ 312,40" },
      { rotulo: "INSS patronal", valor: "R$ 968,00" },
      { rotulo: "Próximo DARF", valor: "25/08/2026" },
      { rotulo: "Situação", valor: "Nenhuma pendência com a Receita" },
    ],
  },
  {
    id: "notas",
    nome: "Notas fiscais",
    icone: "note",
    descricao: "Emitidas e recebidas no mês",
    selo: "12 no mês",
    tom: "neutro",
    detalhe: [
      { rotulo: "Emitidas em julho", valor: "9 notas · R$ 24.300,00" },
      { rotulo: "Recebidas em julho", valor: "3 notas · R$ 4.180,00" },
      { rotulo: "Última emissão", valor: "29/07 — Consultoria mensal" },
      { rotulo: "Situação", valor: "Todas autorizadas na prefeitura" },
    ],
  },
  {
    id: "folha",
    nome: "Folha e encargos",
    icone: "briefcase",
    descricao: "Salários, pró-labore e FGTS",
    selo: "Fecha dia 05",
    tom: "neutro",
    detalhe: [
      { rotulo: "Folha de julho", valor: "R$ 11.480,00 (4 pessoas)" },
      { rotulo: "Pró-labore", valor: "R$ 3.200,00" },
      { rotulo: "FGTS", valor: "R$ 918,40 — vence 07/08" },
      { rotulo: "Situação", valor: "Aguardando fechamento do ponto" },
    ],
  },
  {
    id: "certidoes",
    nome: "Certidões",
    icone: "shield",
    descricao: "Negativas federais e municipais",
    selo: "Todas válidas",
    tom: "ok",
    detalhe: [
      { rotulo: "CND Federal", valor: "Válida até 14/09/2026" },
      { rotulo: "CND Municipal", valor: "Válida até 02/10/2026" },
      { rotulo: "FGTS (CRF)", valor: "Válida até 21/08/2026" },
      { rotulo: "Situação", valor: "Empresa apta pra licitação e crédito" },
    ],
  },
  {
    id: "calendario",
    nome: "Calendário fiscal",
    icone: "calendar",
    descricao: "Prazos e obrigações do mês",
    selo: "3 prazos em agosto",
    tom: "neutro",
    detalhe: [
      { rotulo: "07/08", valor: "FGTS da folha de julho" },
      { rotulo: "20/08", valor: "DAS competência julho" },
      { rotulo: "25/08", valor: "DARF de retenções" },
      { rotulo: "Situação", valor: "Nenhum prazo estourado" },
    ],
  },
];

const COR_TOM: Record<Modulo["tom"], string> = {
  alerta: "oklch(0.75 0.16 75)",
  ok: "oklch(0.72 0.18 145)",
  neutro: "oklch(0.98 0 0 / 0.55)",
};

export function AppContabilidade() {
  const [aberto, setAberto] = useState<Modulo | null>(null);

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ height: "100%", overflowY: "auto", padding: 22 }}
    >
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "oklch(0.98 0 0)" }}>Contabilidade</div>
        <div style={{ fontSize: 12.5, color: "oklch(0.98 0 0 / 0.55)", marginTop: 4 }}>
          Regime: Simples Nacional · Anexo III — próxima guia vence <strong style={{ color: COR_TOM.alerta }}>20/08</strong>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {MODULOS.map((m) => {
          const ativo = aberto?.id === m.id;
          return (
            <motion.button
              key={m.id}
              type="button"
              whileTap={tapPress}
              onClick={() => setAberto(ativo ? null : m)}
              style={{
                textAlign: "left",
                padding: "16px 16px 14px",
                borderRadius: 14,
                border: `1px solid ${ativo ? "oklch(0.7 0.18 220 / 0.45)" : "oklch(0.98 0 0 / 0.09)"}`,
                background: ativo
                  ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.12), oklch(0.65 0.22 280 / 0.06))"
                  : "oklch(0.98 0 0 / 0.03)",
                cursor: "pointer",
                transition: `border-color ${duration.normal} ${easing.glass}, background ${duration.normal} ${easing.glass}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.16), oklch(0.65 0.22 280 / 0.1))",
                    color: "oklch(0.9 0.05 220)",
                  }}
                >
                  <Icon name={m.icone} size={19} />
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{m.nome}</div>
                  <div style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.5)" }}>{m.descricao}</div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: COR_TOM[m.tom] }}>{m.selo}</div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {aberto && (
          <motion.section
            key={aberto.id}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(8px)" }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            style={{
              marginTop: 16,
              padding: 18,
              borderRadius: 14,
              border: "1px solid oklch(0.98 0 0 / 0.09)",
              background: "oklch(0.98 0 0 / 0.03)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.98 0 0)", marginBottom: 12 }}>
              {aberto.nome} — visão rápida
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {aberto.detalhe.map((d) => (
                <div key={d.rotulo} style={{ padding: "10px 12px", borderRadius: 10, background: "oklch(0.98 0 0 / 0.04)" }}>
                  <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginBottom: 3 }}>{d.rotulo}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.98 0 0 / 0.92)" }}>{d.valor}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: "oklch(0.98 0 0 / 0.45)" }}>
              Demonstração — os números reais entram quando o contador ou a integração fiscal for conectada.
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default AppContabilidade;
