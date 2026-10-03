/**
 * ModalConfirmar — a caixa de confirmação padrão do app Rifas.
 * Toda ação de risco (envio real, exclusão, post público) pergunta antes,
 * com a interrogação, a consequência em texto claro e o par Cancelar/Confirmar.
 * Substitui o window.confirm nativo (pedido do Dominic, 2026-08-21).
 *
 * Arena (2026-09-12): folha de baixo no celular (vem do `Modal`), ícone em
 * círculo com a cor da variante e a consequência em texto de corpo.
 */

import { CircleHelp, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Botao } from "./botao";
import { Modal } from "./modal";

export interface ModalConfirmarProps {
  aberto: boolean;
  titulo: string;
  /** A consequência, em uma ou duas frases claras. */
  mensagem: ReactNode;
  textoConfirmar?: string;
  variante?: "primario" | "perigo" | "sucesso";
  carregando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

const CORES_ICONE: Record<NonNullable<ModalConfirmarProps["variante"]>, { fundo: string; tinta: string }> = {
  primario: { fundo: "var(--ar-roxo-vidro)", tinta: "var(--ar-roxo-alto)" },
  perigo: { fundo: "var(--ar-erro-vidro)", tinta: "var(--ar-erro)" },
  sucesso: { fundo: "var(--ar-ok-vidro)", tinta: "var(--ar-ok)" },
};

export const ModalConfirmar = ({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  variante = "primario",
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: ModalConfirmarProps) => {
  const cor = CORES_ICONE[variante];
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoCancelar}
      titulo={titulo}
      tamanho="sm"
      rodape={
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoCancelar}>Cancelar</Botao>
          <Botao variante={variante} carregando={carregando} onClick={aoConfirmar}>
            {textoConfirmar}
          </Botao>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="w-11 h-11 rounded-[var(--ar-r-md)] flex items-center justify-center shrink-0"
          style={{ background: cor.fundo, color: cor.tinta }}
        >
          {variante === "perigo" ? <TriangleAlert size={20} /> : <CircleHelp size={20} />}
        </span>
        <div className="text-base ar-txt-2 leading-relaxed min-w-0">{mensagem}</div>
      </div>
    </Modal>
  );
};
