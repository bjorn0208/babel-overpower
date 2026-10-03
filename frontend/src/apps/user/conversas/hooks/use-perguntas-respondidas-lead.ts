/**
 * Hook que lista as perguntas do ciclo Mentor já respondidas para um lead.
 *
 * Usado na subaba "Perguntas respondidas" da AbaMente do Dossiê.
 * Filtra status_loop IN ('virou_bloco', 'entregue_lead') — perguntas que
 * completaram o ciclo e geram valor de curadoria.
 *
 * Cleanup obrigatório com removeChannel no unmount. Onda 8 RAG-first 2026-05-29.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PerguntaRespondida =
  Database["public"]["Tables"]["perguntas_sem_resposta"]["Row"];

interface UsePerguntasRespondidasResult {
  perguntas: PerguntaRespondida[];
  status: "carregando" | "pronto";
}

const STATUS_CONCLUIDOS = ["virou_bloco", "entregue_lead"] as const;

export function usePerguntasRespondidasLead(
  leadId: string | null,
): UsePerguntasRespondidasResult {
  const [perguntas, setPerguntas] = useState<PerguntaRespondida[]>([]);
  const [status, setStatus] = useState<"carregando" | "pronto">("carregando");

  useEffect(() => {
    if (!leadId) {
      setPerguntas([]);
      setStatus("pronto");
      return;
    }

    let ativo = true;

    async function carregar() {
      // deno-lint-ignore no-explicit-any
      const sb = supabase as unknown as { from: (t: string) => any };
      const { data } = await sb
        .from("perguntas_sem_resposta")
        .select("*")
        .eq("lead_id", leadId)
        .in("status_loop", STATUS_CONCLUIDOS)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (!ativo) return;
      setPerguntas((data as PerguntaRespondida[]) ?? []);
      setStatus("pronto");
    }

    void carregar();

    // Realtime: atualiza quando nova pergunta virar bloco ou entregue_lead
    const ch = supabase
      .channel(`perguntas-respondidas-lead-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "perguntas_sem_resposta",
          filter: `lead_id=eq.${leadId}`,
        },
        () => void carregar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      void supabase.removeChannel(ch);
    };
  }, [leadId]);

  return { perguntas, status };
}
