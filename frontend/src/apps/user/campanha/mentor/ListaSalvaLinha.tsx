/**
 * 1 linha de lista salva do Mentor — os 2 CTAs que materializam a decisão
 * "agente conversa" vs "disparo fixo" sobre o MESMO público resolvido.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Send, Trash2 } from "lucide-react";

import { tapPress } from "@/os/motion/presets";
import { BotaoIcone, botaoPrimarioStyle, botaoSecundarioStyle, type ToastApi } from "../re-exports";
import { ComposerDisparoFixo } from "./ComposerDisparoFixo";
import type { ListaDisparoLead } from "./tipos";

interface Props {
  lista: ListaDisparoLead;
  ownerId: string;
  t: ToastApi;
  onMandarAgente: () => void;
  onExcluir: () => void;
  resolverIds: () => Promise<string[]>;
}

const ROTULO_CRITERIO: Record<string, string> = {
  desfecho: "Estado final",
  dias_sem_resposta: "Dias sem resposta",
  mes_entrada: "Mês de entrada",
  mes_desfecho: "Mês do desfecho",
};

function resumoCriterios(lista: ListaDisparoLead): string {
  if (lista.lead_ids?.length) return `${lista.lead_ids.length} leads (congelada)`;
  if (lista.criterios.modo === "todos") return "Todos os leads ativos";
  const partes = lista.criterios.criterios.map((c) => ROTULO_CRITERIO[c.chave] ?? c.chave);
  return partes.length > 0
    ? partes.join(lista.criterios.operadorGlobal === "OR" ? " OU " : " + ")
    : "Sem critério";
}

export function ListaSalvaLinha({
  lista,
  ownerId,
  t,
  onMandarAgente,
  onExcluir,
  resolverIds,
}: Props) {
  const [composerAberto, setComposerAberto] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        background: "oklch(0.18 0.06 280 / 0.28)",
        border: "1px solid oklch(0.98 0 0 / 0.08)",
        borderRadius: 12,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0 / 0.9)" }}>
            {lista.nome}
          </span>
          <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>
            {resumoCriterios(lista)}
          </span>
        </div>
        <BotaoIcone onClick={onExcluir} titulo="Excluir lista" perigo>
          <Trash2 size={14} />
        </BotaoIcone>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={onMandarAgente}
          style={{
            ...botaoSecundarioStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            justifyContent: "center",
          }}
        >
          <MessageCircle size={13} />
          Mandar pro agente
        </motion.button>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={() => setComposerAberto(true)}
          style={{
            ...botaoPrimarioStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            justifyContent: "center",
          }}
        >
          <Send size={13} />
          Disparo fixo
        </motion.button>
      </div>

      {composerAberto && (
        <ComposerDisparoFixo
          lista={lista}
          ownerId={ownerId}
          t={t}
          resolverIds={resolverIds}
          onFechar={() => setComposerAberto(false)}
        />
      )}
    </div>
  );
}
