/**
 * Confirmação com texto explicativo — artefato `confirmar` (financeiro.html:3988-3995).
 *
 * O artefato abre uma caixa com título, a frase que explica o que vai acontecer ("Essa ação não pode ser
 * desfeita", "a venda continua em Vendas"…) e dois botões: "Voltar" e o da ação (vermelho quando é perigoso).
 * Substitui o "clicar duas vezes" (`BotaoAcao` armado) que perdia o texto. Usa o `Modal` de ui-gestao.tsx
 * (portal, Esc fecha); nenhuma cor nova: o vermelho é `--os-erro`, o mesmo do "Remover acesso" (aba-acessos.tsx).
 *
 * Uso:
 *   const conf = useConfirmacao();
 *   conf.pedir({ titulo, mensagem, rotulo, perigo: true, aoConfirmar: async () => { … } });
 *   return <>…{conf.elemento}</>;
 * O `aoConfirmar` roda com o botão desabilitado; a caixa fecha quando ele termina (deu certo ou não —
 * o aviso de erro é do próprio `aoConfirmar`, como no resto do app).
 */

import { useCallback, useState } from "react";
import type React from "react";
import { Modal } from "./ui-gestao";

export interface PedidoConfirmacao {
  titulo: string;
  mensagem: string;
  /** Texto do botão da ação (artefato: "Excluir", "Enviar para Vendas", "Reabrir"…). */
  rotulo: string;
  /** Ação destrutiva: botão vermelho e o foco começa no "Voltar" (artefato :3994). */
  perigo?: boolean;
  aoConfirmar: () => void | Promise<void>;
}

export function ModalConfirmacao({
  pedido,
  onClose,
}: {
  pedido: PedidoConfirmacao;
  onClose: () => void;
}) {
  const [rodando, setRodando] = useState(false);

  async function confirmar() {
    setRodando(true);
    try {
      await pedido.aoConfirmar();
    } finally {
      setRodando(false);
      onClose();
    }
  }

  return (
    <Modal
      titulo={pedido.titulo}
      onClose={() => !rodando && onClose()}
      largura={440}
      rodape={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={rodando}
            autoFocus={!!pedido.perigo}
          >
            Voltar
          </button>
          <button
            type="button"
            className={pedido.perigo ? "btn" : "btn btn-primary"}
            style={pedido.perigo ? { color: "var(--os-erro)" } : undefined}
            onClick={() => void confirmar()}
            disabled={rodando}
            autoFocus={!pedido.perigo}
          >
            {rodando ? "Aguarde…" : pedido.rotulo}
          </button>
        </>
      }
    >
      <p className="small" style={{ lineHeight: 1.55, color: "var(--txt-2)", margin: 0 }}>
        {pedido.mensagem}
      </p>
    </Modal>
  );
}

/** Estado da caixa de confirmação de uma tela: `pedir` abre; `elemento` vai no fim do JSX da tela. */
export function useConfirmacao(): {
  pedir: (p: PedidoConfirmacao) => void;
  elemento: React.ReactNode;
} {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const pedir = useCallback((p: PedidoConfirmacao) => setPedido(p), []);
  const elemento = pedido ? <ModalConfirmacao pedido={pedido} onClose={() => setPedido(null)} /> : null;
  return { pedir, elemento };
}
