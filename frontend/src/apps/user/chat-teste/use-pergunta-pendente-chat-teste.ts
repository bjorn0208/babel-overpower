/**
 * Hook que escuta a pergunta pendente do ciclo Mentor no Chat de Teste.
 *
 * Retorna a pergunta mais recente com status_loop relevante pra exibir o
 * GenUI inline de resposta. Usa realtime pra atualizar automaticamente
 * quando o trigger muda o status_loop (ex: dono_respondeu → virou_bloco).
 *
 * Cleanup obrigatório: removeChannel no unmount. Onda 8 RAG-first 2026-05-29.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PerguntaPendenteChatTeste =
  Database["public"]["Tables"]["perguntas_sem_resposta"]["Row"];

/** Status que exigem ação ou exibição no GenUI inline. */
const STATUS_VISIVEIS = ["aguardando_dono", "dono_respondeu", "virou_bloco"] as const;

interface UsePerguntaPendenteResult {
  /** Pergunta pendente atual (null = nenhuma pra exibir). */
  pergunta: PerguntaPendenteChatTeste | null;
  /** "carregando" até busca inicial completar; "pronto" depois. */
  status: "carregando" | "pronto";
  /** Chama RPC responder_pergunta_mentor. Retorna {ok, erro?}. */
  responder: (
    perguntaId: string,
    resposta: string,
  ) => Promise<{ ok: boolean; erro?: string }>;
}

export function usePerguntaPendenteChatTeste(
  conversationId: string | null,
): UsePerguntaPendenteResult {
  const [pergunta, setPergunta] = useState<PerguntaPendenteChatTeste | null>(null);
  const [status, setStatus] = useState<"carregando" | "pronto">("carregando");

  useEffect(() => {
    if (!conversationId) {
      setPergunta(null);
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
        .eq("conversation_id", conversationId)
        .in("status_loop", STATUS_VISIVEIS)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ativo) return;
      setPergunta((data as PerguntaPendenteChatTeste | null) ?? null);
      setStatus("pronto");
    }

    void carregar();

    const ch = supabase
      .channel(`pergunta-pendente-chat-teste-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "perguntas_sem_resposta",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void carregar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      void supabase.removeChannel(ch);
    };
  }, [conversationId]);

  async function responder(
    perguntaId: string,
    resposta: string,
  ): Promise<{ ok: boolean; erro?: string }> {
    const { data, error } = await supabase.rpc("responder_pergunta_mentor", {
      p_id: perguntaId,
      p_resposta: resposta,
    });
    if (error) return { ok: false, erro: error.message };
    // RPC retorna Json — normaliza pra boolean
    const resultado = data as { ok?: boolean; erro?: string } | null;
    if (resultado?.ok === false) {
      return { ok: false, erro: resultado.erro ?? "Erro desconhecido" };
    }
    return { ok: true };
  }

  return { pergunta, status, responder };
}
