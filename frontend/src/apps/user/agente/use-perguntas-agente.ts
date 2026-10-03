/**
 * use-perguntas-agente — hook local do app Agente.
 *
 * Lê `perguntas_sem_resposta` do agente (realtime) e expõe as 4 mutações
 * via RPC SECURITY DEFINER (RLS do tenant é só SELECT):
 * responder · editarResposta · descartar · excluir.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EstatisticasPerguntas } from "../dados/use-perguntas-mentor";

export type { EstatisticasPerguntas };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type StatusLoop =
  | "aguardando_dono"
  | "dono_respondeu"
  | "entregue_lead"
  | "virou_bloco"
  | "descartada";

export interface PerguntaMentor {
  id: string;
  tenant_id: string;
  agente_id: string | null;
  /** coluna real no banco */
  conversation_id: string | null;
  lead_id: string | null;
  pergunta: string;
  pergunta_para_mentor: string | null;
  resposta_do_dono: string | null;
  respondida_em: string | null;
  status_loop: StatusLoop;
  bloco_criado_id: string | null;
  gaveta_proposta: string | null;
  escopo_proposto: string | null;
  criado_em: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePerguntasAgente(agenteId: string) {
  const [perguntas, setPerguntas] = useState<PerguntaMentor[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasPerguntas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = supabase as Sb;
      // Contagem só de cabeçalho (head) — número exato sem trazer linhas nem sofrer
      // o corte da janela (o cabeçalho mentia "200 geradas" quando havia 316).
      const contarPorStatus = (status?: string[]) => {
        let q = sb
          .from("perguntas_sem_resposta")
          .select("id", { count: "exact", head: true })
          .eq("agente_id", agenteId);
        if (status) q = q.in("status_loop", status);
        return q;
      };
      const [listaRes, geradasRes, pendentesRes, respondidasRes, descartadasRes] =
        await Promise.all([
          sb
            .from("perguntas_sem_resposta")
            .select(
              "id, tenant_id, agente_id, conversation_id, lead_id, " +
              "pergunta, pergunta_para_mentor, resposta_do_dono, " +
              "respondida_em, status_loop, bloco_criado_id, gaveta_proposta, " +
              "escopo_proposto, criado_em",
            )
            .eq("agente_id", agenteId)
            .order("criado_em", { ascending: false })
            .limit(500),
          contarPorStatus(),
          contarPorStatus(["aguardando_dono"]),
          contarPorStatus(["dono_respondeu", "entregue_lead", "virou_bloco"]),
          contarPorStatus(["descartada"]),
        ]);
      if (listaRes.error) throw listaRes.error;
      setPerguntas((listaRes.data ?? []) as PerguntaMentor[]);
      setEstatisticas({
        geradas: geradasRes.count ?? 0,
        porResponder: pendentesRes.count ?? 0,
        respondidas: respondidasRes.count ?? 0,
        descartadas: descartadasRes.count ?? 0,
      });
    } catch (e) {
      console.error("[usePerguntasAgente] carregar falhou:", e);
    } finally {
      setCarregando(false);
    }
  }, [agenteId]);

  useEffect(() => {
    void carregar();

    const canal = supabase
      .channel(`perguntas-agente-${agenteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "perguntas_sem_resposta",
          filter: `agente_id=eq.${agenteId}`,
        },
        () => { void carregar(); },
      )
      .subscribe();

    canalRef.current = canal;

    return () => {
      if (canalRef.current) {
        void supabase.removeChannel(canalRef.current);
        canalRef.current = null;
      }
    };
  }, [agenteId, carregar]);

  /** Executa uma RPC jsonb {ok, erro?} e recarrega em caso de sucesso. */
  const chamarRpc = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<boolean> => {
      try {
        const sb = supabase as Sb;
        const { data, error } = await sb.rpc(fn, args);
        if (error) throw error;
        const r = data as { ok?: boolean; erro?: string } | null;
        if (r?.ok === false) throw new Error(r.erro ?? `${fn} retornou ok:false`);
        void carregar();
        return true;
      } catch (e) {
        console.error(`[usePerguntasAgente] ${fn} falhou:`, e);
        return false;
      }
    },
    [carregar],
  );

  return {
    perguntas,
    estatisticas,
    carregando,
    responder: (id: string, resposta: string, aprovarDireto: boolean) =>
      chamarRpc("responder_pergunta_mentor", {
        p_id: id,
        p_resposta: resposta,
        p_aprovar_direto: aprovarDireto,
      }),
    editarResposta: (id: string, resposta: string) =>
      chamarRpc("editar_resposta_pergunta_mentor", { p_id: id, p_resposta: resposta }),
    descartar: (id: string) =>
      chamarRpc("descartar_pergunta_mentor", { p_id: id }),
    excluir: (id: string) =>
      chamarRpc("excluir_pergunta_mentor", { p_id: id }),
  };
}
