/**
 * use-perguntas-mentor.ts — Hook realtime pra loop Mentor (humano-no-loop).
 *
 * Busca perguntas aguardando resposta do dono + histórico recente das
 * respondidas. Subscription realtime garante que o badge aparece em tempo
 * real quando o motor dispara uma nova pergunta.
 *
 * Gaveta/escopo do bloco são decididos pela IA na edge (RAG-first) — não há
 * mais etapa manual de aprovação aqui.
 *
 * Segurança: filtra por `tenant_id = uid` explícito além da RLS.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PerguntaMentor =
  Database["public"]["Tables"]["perguntas_sem_resposta"]["Row"];

/** Contagens exatas (via count no banco — sem corte de janela de linhas). */
export interface EstatisticasPerguntas {
  geradas: number;
  porResponder: number;
  respondidas: number;
  descartadas: number;
}

const STATUS_RESPONDIDAS = ["dono_respondeu", "entregue_lead", "virou_bloco"];

export function usePerguntasMentor() {
  const [perguntas, setPerguntas] = useState<PerguntaMentor[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasPerguntas | null>(null);
  const [status, setStatus] = useState<"carregando" | "pronto" | "erro">(
    "carregando"
  );
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !ativo) return;

      // Buscas separadas: numa janela única as respondidas recentes empurravam
      // aguardando antigas pra fora do limite e a fila aparecia cortada.
      // Contagem só de cabeçalho (head) — o banco devolve o número exato sem trazer linhas.
      const contarPorStatus = (status?: string[]) => {
        let q = supabase
          .from("perguntas_sem_resposta")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.id);
        if (status) q = q.in("status_loop", status);
        return q;
      };

      const [aguardandoRes, historicoRes, geradasRes, respondidasRes, descartadasRes] =
        await Promise.all([
          supabase
            .from("perguntas_sem_resposta")
            .select("*")
            .eq("tenant_id", user.id)
            .eq("status_loop", "aguardando_dono")
            .order("criado_em", { ascending: false })
            .limit(500),
          supabase
            .from("perguntas_sem_resposta")
            .select("*")
            .eq("tenant_id", user.id)
            .in("status_loop", STATUS_RESPONDIDAS)
            .order("criado_em", { ascending: false })
            .limit(60),
          contarPorStatus(),
          contarPorStatus(STATUS_RESPONDIDAS),
          contarPorStatus(["descartada"]),
        ]);

      if (!ativo) return;
      const error = aguardandoRes.error ?? historicoRes.error;
      if (error) {
        setErro(error.message);
        setStatus("erro");
        return;
      }
      const aguardandoData = aguardandoRes.data ?? [];
      setPerguntas([...aguardandoData, ...(historicoRes.data ?? [])]);
      setEstatisticas({
        geradas: geradasRes.count ?? 0,
        porResponder: aguardandoData.length,
        respondidas: respondidasRes.count ?? 0,
        descartadas: descartadasRes.count ?? 0,
      });
      setStatus("pronto");
    }

    carregar();

    const canal = supabase
      .channel("perguntas-mentor-tela-principal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "perguntas_sem_resposta",
        },
        () => {
          carregar();
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  async function responder(
    perguntaId: string,
    resposta: string
  ): Promise<{ ok: boolean; erro?: string }> {
    const { data, error } = await supabase.rpc("responder_pergunta_mentor", {
      p_id: perguntaId,
      p_resposta: resposta,
    });
    if (error) return { ok: false, erro: error.message };
    return data as { ok: boolean; erro?: string };
  }

  async function descartar(
    perguntaId: string
  ): Promise<{ ok: boolean; erro?: string }> {
    // RPC SECURITY DEFINER: a tabela só tem RLS de SELECT pro tenant, então UPDATE
    // direto era bloqueado em silêncio (0 linhas, sem erro). A RPC valida ownership
    // por auth.uid() e seta status_loop='descartada'.
    // Cast localizado: a RPC é nova e ainda não está no types.ts gerado (regenerar = dívida à parte).
    const sb = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { ok?: boolean; erro?: string } | null; error: { message: string } | null }>;
    };
    const { data, error } = await sb.rpc("descartar_pergunta_mentor", {
      p_id: perguntaId,
    });
    if (error) return { ok: false, erro: error.message };
    const r = data;
    if (r?.ok === false) return { ok: false, erro: r.erro ?? "Erro ao descartar" };
    return { ok: true };
  }

  const aguardando = perguntas.filter(
    (p) => p.status_loop === "aguardando_dono"
  );
  const respondidas = perguntas.filter(
    (p) =>
      p.status_loop === "dono_respondeu" ||
      p.status_loop === "entregue_lead" ||
      p.status_loop === "virou_bloco"
  );

  return {
    perguntas,
    aguardando,
    respondidas,
    estatisticas,
    status,
    erro,
    responder,
    descartar,
  };
}
