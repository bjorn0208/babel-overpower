// @ts-nocheck
/**
 * use-sala-espera — fila de aprovação de entrada na sala (estilo Meet).
 *
 * Canal Realtime `espera:{salaId}` separado do canal da chamada:
 * o convidado pendente entra com presence (nome + participante_id) e
 * aguarda; o anfitrião vê a fila sincronizada e responde com broadcast
 * `resposta` + RPC `responder_entrada_sala` (persiste a decisão no banco).
 * Convidado só entra no canal da chamada depois de aprovado.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type PedidoEntrada = {
  participanteId: string;
  nome: string;
};

type MsgResposta = {
  participanteId: string;
  aprovado: boolean;
};

// ─── Lado anfitrião: fila de pendentes + responder ───────────────────────────

export function useSalaEspera(salaId: string | null, ativo: boolean) {
  const [pendentes, setPendentes] = useState<PedidoEntrada[]>([]);
  const canalRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!salaId || !ativo) {
      setPendentes([]);
      return;
    }
    const canal = supabase.channel(`espera:${salaId}`, {
      config: { broadcast: { self: false }, presence: { key: `anfitriao-${salaId}` } },
    });
    canalRef.current = canal;

    canal.on("presence", { event: "sync" }, () => {
      const estado = canal.presenceState<PedidoEntrada>();
      const fila = Object.values(estado)
        .flatMap((arr) => arr)
        .map((p) => ({
          participanteId: (p as PedidoEntrada & { presence_ref: string }).participanteId,
          nome: (p as PedidoEntrada & { presence_ref: string }).nome ?? "Convidado",
        }))
        .filter((p) => p.participanteId);
      setPendentes(fila);
    });

    canal.subscribe();

    return () => {
      void supabase.removeChannel(canal);
      canalRef.current = null;
      setPendentes([]);
    };
  }, [salaId, ativo]);

  async function responder(participanteId: string, aprovar: boolean): Promise<void> {
    const { error } = await supabase.rpc("responder_entrada_sala", {
      p_participante_id: participanteId,
      p_aprovar: aprovar,
    });
    if (error) throw error;
    await canalRef.current?.send({
      type: "broadcast",
      event: "resposta",
      payload: { participanteId, aprovado: aprovar } satisfies MsgResposta,
    });
    setPendentes((prev) => prev.filter((p) => p.participanteId !== participanteId));
  }

  return { pendentes, responder };
}

// ─── Lado convidado: pedir e aguardar a decisão ──────────────────────────────

export type EsperaConvidado = {
  /** Resolve com true (aprovado) ou false (negado). */
  aguardar: () => Promise<boolean>;
  cancelar: () => Promise<void>;
};

export function criarEsperaConvidado(
  salaId: string,
  participanteId: string,
  nome: string,
): EsperaConvidado {
  let canal: RealtimeChannel | null = null;

  function aguardar(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      canal = supabase.channel(`espera:${salaId}`, {
        config: { broadcast: { self: false }, presence: { key: participanteId } },
      });

      canal.on("broadcast", { event: "resposta" }, (envelope) => {
        const msg = (envelope as unknown as { payload: MsgResposta }).payload;
        if (!msg || msg.participanteId !== participanteId) return;
        resolve(msg.aprovado);
      });

      canal.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          canal!.track({ participanteId, nome } satisfies PedidoEntrada);
        }
      });
    });
  }

  async function cancelar(): Promise<void> {
    if (canal) {
      await canal.untrack();
      await supabase.removeChannel(canal);
      canal = null;
    }
  }

  return { aguardar, cancelar };
}
