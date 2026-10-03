/**
 * AguardandoAprovacao — estado do convidado depois de pedir entrada
 * numa sala com aprovação ativada: spinner + opção de cancelar.
 */

import { Hourglass } from "lucide-react";
import { cor } from "@/apps/user/reuniao/reuniao-ui";

type Props = {
  nomeSala: string;
  negado?: boolean;
  onCancelar: () => void;
};

export default function AguardandoAprovacao({ nomeSala, negado, onCancelar }: Props) {
  return (
    <div
      className="reu-surgir"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
        maxWidth: 380,
        margin: "auto",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: negado ? "oklch(0.22 0.06 25 / 0.5)" : "oklch(0.2 0.04 264)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: negado ? cor.perigo : cor.texto2,
        }}
      >
        <Hourglass
          size={26}
          aria-hidden
          style={negado ? undefined : { animation: "reu-pulso 2s ease-in-out infinite" }}
        />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        {negado ? "Entrada não autorizada" : "Pedido enviado"}
      </h1>
      <p style={{ fontSize: 13.5, color: cor.texto2, margin: 0, lineHeight: 1.5, maxWidth: 300 }}>
        {negado
          ? "O anfitrião não autorizou sua entrada nesta reunião."
          : `Aguardando o anfitrião de "${nomeSala}" autorizar sua entrada. Fique nesta tela.`}
      </p>
      <button type="button" className="reu-btn reu-btn-secundario" onClick={onCancelar}>
        {negado ? "Voltar" : "Cancelar pedido"}
      </button>
    </div>
  );
}
