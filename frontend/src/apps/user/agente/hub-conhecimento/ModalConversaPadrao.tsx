/**
 * Bloco especial "Conversa padrão" (Chat Treino, 2026-09-18): ao clicar no bloco no hub,
 * abre a conversa padrão daquele produto como conversa de verdade — bolhas do lead e da
 * agente (com as correções do dono aplicadas), nota do Mentor e as regras que o dono deixou.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface ConversaPadraoLinha {
  id: string;
  titulo: string;
  produto_nome: string | null;
  transcricao: Array<{ n: number; papel: "lead" | "agente"; texto: string; corrigido?: boolean; original?: string; sugestao?: string }>;
  diretrizes: string[];
  humanizacao_original: number | null;
  humanizacao_final: number | null;
  analise: { comentario_mentor?: string } | null;
  ativo: boolean;
  created_at: string;
}

function pct(n: number | null): string {
  return n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function ModalConversaPadrao({ blocoId, onFechar }: { blocoId: string; onFechar: () => void }) {
  const [cp, setCp] = useState<ConversaPadraoLinha | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await sb
        .from("conversas_padrao")
        .select("id, titulo, produto_nome, transcricao, diretrizes, humanizacao_original, humanizacao_final, analise, ativo, created_at")
        .eq("bloco_id", blocoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!vivo) return;
      setCp((data as ConversaPadraoLinha | null) ?? null);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [blocoId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversa padrão"
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5, 3, 12, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--os-janela-fundo, rgb(20, 16, 36))",
          border: "1px solid oklch(0.72 0.2 145 / 0.35)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 20 }}>💬</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{cp?.titulo ?? "Conversa padrão"}</div>
            <div style={{ fontSize: 11.5, opacity: 0.65 }}>
              Treinada no Chat Treino · a agente usa como base fixa
              {cp?.produto_nome ? ` sempre que o assunto for ${cp.produto_nome}` : ""}
              {cp && !cp.ativo ? " · DESLIGADA" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            style={{ background: "none", border: "none", color: "inherit", fontSize: 18, cursor: "pointer", padding: 6, opacity: 0.7 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {carregando && <div style={{ fontSize: 13, opacity: 0.6 }}>Abrindo conversa…</div>}
          {!carregando && !cp && (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Não encontrei a conversa deste bloco. Gere de novo no Chat Treino (botão Analisar).</div>
          )}
          {cp && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                  Humanização: {pct(cp.humanizacao_original)} → <b>{pct(cp.humanizacao_final)}</b>
                </span>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                  {new Date(cp.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {cp.analise?.comentario_mentor && (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, padding: 10, borderRadius: 10, background: "oklch(0.78 0.16 75 / 0.08)", border: "1px solid oklch(0.78 0.16 75 / 0.25)" }}>
                  🧠 {cp.analise.comentario_mentor}
                </div>
              )}
              {cp.diretrizes?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Regras do dono</div>
                  {cp.diretrizes.map((d, i) => (
                    <div key={i} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                      📌 {d}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
              {cp.transcricao.map((m, i) => {
                const lead = m.papel === "lead";
                return (
                  <div key={i} style={{ alignSelf: lead ? "flex-start" : "flex-end", maxWidth: "80%" }}>
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: lead ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                        background: lead
                          ? "rgba(255,255,255,0.06)"
                          : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.20), oklch(0.65 0.22 280 / 0.16))",
                        border: m.corrigido ? "1px solid oklch(0.72 0.2 145 / 0.5)" : "1px solid rgba(255,255,255,0.08)",
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.texto}
                    </div>
                    {(m.corrigido || m.sugestao) && (
                      <div style={{ fontSize: 10.5, marginTop: 2, textAlign: lead ? "left" : "right", color: "oklch(0.85 0.14 145)" }}>
                        {m.corrigido ? "✓ corrigida pelo dono" : ""}
                        {m.sugestao ? `${m.corrigido ? " · " : ""}💡 ${m.sugestao}` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
