/**
 * Aba Atendimento (Theus 2026-09-02) — Kanban + chat + dossiê dos leads de
 * Rifas, sem sair do app. 2 telas que se ALTERNAM (nunca dividem espaço):
 * Kanban (padrão) OU Chat em tela cheia (clica no card) — igual WhatsApp
 * mobile, em qualquer largura de tela. Dossiê abre por cima do chat, sob
 * demanda (ícone de contato no header).
 *
 * Arena (2026-09-12): a moldura `.ar-atendimento` (aba-atendimento.css) dá altura em dvh,
 * canto redondo e fundo chumbo; kanban vira etapas no celular.
 */

import { useState } from "react";
import { KanbanAtendimento } from "../componentes/kanban-atendimento";
import { ChatAtendimento } from "../componentes/chat-atendimento";
import { DossieCliente } from "../componentes/dossie-cliente";
import type { CardAtendimento } from "../dados-atendimento";
import "./aba-atendimento.css";

export interface AbaAtendimentoProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const AbaAtendimento = ({ aoNotificar }: AbaAtendimentoProps) => {
  const [cardAberto, setCardAberto] = useState<CardAtendimento | null>(null);
  const [dossieAberto, setDossieAberto] = useState(false);

  const abrirCard = (c: CardAtendimento) => {
    if (!c.conversaId) {
      aoNotificar("Esse contato ainda não tem conversa aberta.", "info");
      return;
    }
    setCardAberto(c);
  };

  const fecharChat = () => {
    setCardAberto(null);
    setDossieAberto(false);
  };

  // Chat aberto = tela cheia, SEMPRE (não divide espaço com o Kanban em
  // nenhuma largura — bug relatado pelo Theus: "só aparece metade do chat").
  if (cardAberto?.conversaId) {
    return (
      <div className="ar-atendimento">
        <ChatAtendimento
          conversaId={cardAberto.conversaId}
          nome={cardAberto.nome}
          fotoUrl={cardAberto.fotoUrl}
          aoVoltar={fecharChat}
          aoAbrirDossie={() => setDossieAberto(true)}
          aoNotificar={aoNotificar}
        />
        <DossieCliente aberto={dossieAberto} aoFechar={() => setDossieAberto(false)} leadId={cardAberto.leadId} phone={cardAberto.phone} />
      </div>
    );
  }

  return (
    <div className="ar-atendimento">
      <KanbanAtendimento aoAbrirCard={abrirCard} aoNotificar={aoNotificar} />
    </div>
  );
};
