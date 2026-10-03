// @ts-nocheck
/**
 * Registry de componentes de aba.
 *
 * O orquestrador Curadoria.tsx consulta este registry pra resolver qual componente
 * renderizar pra cada AbaId. Abas não portadas retornam PlaceholderAba.
 *
 * Visual alinhado ao LLM-OS: .os-card, .h3, .muted, .badge* etc
 */

import type { ComponentType } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { getAbaPorId } from "../dados/abas";
import type { AbaId } from "../dados/tipos";
import { AbaAvisos } from "./AbaAvisos";
import { AbaCerebro } from "./AbaCerebro";
import { AbaDashboard } from "./AbaDashboard";
import { AbaConversa } from "./AbaConversa";
import { AbaBlocos } from "./AbaBlocos";
import { AbaPacotesConhecimento } from "./AbaPacotesConhecimento";
import { AbaSimulador } from "./AbaSimulador";
import { AbaEmpatia } from "./AbaEmpatia";
import { AbaProdutos } from "./AbaProdutos";
import { AbaTools } from "./AbaTools";
import { AbaGatilhos } from "./AbaGatilhos";
import { AbaAcompanhamentos } from "./AbaAcompanhamentos";
import { AbaCargos } from "./AbaCargos";
import { AbaChamadasLlm } from "./AbaChamadasLlm";
import { AbaCrons } from "./AbaCrons";
import { AbaCrossNicho } from "./AbaCrossNicho";
import { AbaRecursosCustos } from "./AbaRecursosCustos";

// Mapa de nome de ícone (DefAba.icone) → nome do Icon do bundle-shared
const ICONE_ABA: Record<string, string> = {
  Bell: "bell",
  Brain: "brain",
  Chart: "trending",
  Chat: "message",
  Book: "bookOpen",
  Flask: "flaskConical",
  Heart: "heart",
  Cart: "package",
  Wrench: "wrench",
  Zap: "zap",
  Cal: "calendar",
  Badge: "briefcase",
  Cpu: "cpu",
  Clock: "clock",
  Layers: "layers",
};

const REGISTRY: Partial<Record<AbaId, ComponentType>> = {
  // operacao
  avisos:           AbaAvisos,
  cerebro:          AbaCerebro,
  dashboard:        AbaDashboard,
  conversa:         AbaConversa,
  blocos:           AbaBlocos,
  pacotes:          AbaPacotesConhecimento,
  simulador:        AbaSimulador,
  empatia:          AbaEmpatia,
  produtos:         AbaProdutos,
  tools:            AbaTools,
  gatilhos:         AbaGatilhos,
  acompanhamentos:  AbaAcompanhamentos,
  cargos:           AbaCargos,
  // control_plane
  chamadas:         AbaChamadasLlm,
  crons:            AbaCrons,
  cross_nicho:      AbaCrossNicho,
  recursos:         AbaRecursosCustos,
};

interface PlaceholderProps {
  abaId: AbaId;
}

function Placeholder({ abaId }: PlaceholderProps) {
  const aba = getAbaPorId(abaId);

  if (!aba) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="muted small">Aba não encontrada</span>
      </div>
    );
  }

  const nomeIcone = ICONE_ABA[aba.icone] ?? "dot";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 360,
          gap: 10,
        }}
      >
        {/* Ícone em card */}
        <div
          className="os-card row center"
          style={{ width: 64, height: 64, borderRadius: 18, marginBottom: 4 }}
        >
          <Icon name={nomeIcone} size={28} />
        </div>

        <div className="h3">{aba.label}</div>

        <div className="muted small" style={{ lineHeight: 1.55, opacity: 0.65 }}>
          Aba em construção.
        </div>

        {aba.destaque && aba.badge && (
          <span className="badge badge-aurora" style={{ fontSize: 11, marginTop: 4 }}>
            {aba.badge}
          </span>
        )}

        {aba.atalho && (
          <span className="badge" style={{ fontSize: 10 }}>
            ⌘{aba.atalho}
          </span>
        )}
      </div>
    </div>
  );
}

export function ResolverAba({ abaId }: { abaId: AbaId }) {
  const Componente = REGISTRY[abaId];
  const conteudo = Componente ? <Componente /> : <Placeholder abaId={abaId} />;
  // Wrapper minimal — centraliza e limita largura, mantém height pra abas com layout próprio
  return (
    <div style={{
      maxWidth: 1200,
      margin: "0 auto",
      width: "100%",
      height: "100%",
    }}>
      {conteudo}
    </div>
  );
}
