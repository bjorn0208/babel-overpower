/**
 * PainelEspera — card flutuante do anfitrião com a fila de quem pediu
 * pra entrar na sala (estilo "Alguém quer participar" do Meet).
 */

import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, cor } from "./reuniao-ui";
import type { PedidoEntrada } from "./use-sala-espera";

type Props = {
  pendentes: PedidoEntrada[];
  responder: (participanteId: string, aprovar: boolean) => Promise<void>;
};

export default function PainelEspera({ pendentes, responder }: Props) {
  if (pendentes.length === 0) return null;

  async function decidir(pedido: PedidoEntrada, aprovar: boolean) {
    try {
      await responder(pedido.participanteId, aprovar);
      toast.success(
        aprovar ? `${pedido.nome} entrou na sala.` : `Entrada de ${pedido.nome} negada.`,
      );
    } catch (err) {
      console.error("[Reunião] responder entrada", err);
      toast.error("Não foi possível responder ao pedido. Tente novamente.");
    }
  }

  return (
    <div
      className="reu-surgir"
      role="dialog"
      aria-label="Pedidos para entrar na sala"
      style={{
        position: "absolute",
        right: 16,
        top: 16,
        zIndex: 30,
        background: "oklch(0.18 0.035 264)",
        border: `1px solid ${cor.borda}`,
        borderRadius: 16,
        padding: "14px 16px",
        width: "min(320px, calc(100vw - 32px))",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "0 12px 32px oklch(0.05 0.01 264 / 0.55)",
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: cor.texto1 }}>
        {pendentes.length === 1
          ? "Alguém quer participar"
          : `${pendentes.length} pessoas querem participar`}
      </span>
      {pendentes.map((pedido) => (
        <div key={pedido.participanteId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar nome={pedido.nome} tamanho={32} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              color: cor.texto1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {pedido.nome}
          </span>
          <button
            type="button"
            className="reu-btn reu-btn-fantasma"
            onClick={() => void decidir(pedido, false)}
            title={`Negar entrada de ${pedido.nome}`}
            aria-label={`Negar entrada de ${pedido.nome}`}
            style={{ width: 34, height: 34, color: cor.perigo }}
          >
            <X size={17} />
          </button>
          <button
            type="button"
            className="reu-btn reu-btn-primario"
            onClick={() => void decidir(pedido, true)}
            title={`Permitir entrada de ${pedido.nome}`}
            aria-label={`Permitir entrada de ${pedido.nome}`}
            style={{ padding: "7px 14px", fontSize: 13 }}
          >
            <Check size={15} aria-hidden /> Permitir
          </button>
        </div>
      ))}
    </div>
  );
}
