/**
 * Sidebar de histórico do Chat-Teste — Onda 2026-05-13.
 *
 * Lista as conversas com `channel='teste'` do agente ativo, ordenadas por
 * `updated_at desc`. Click reabre (callback `onAbrir`); botão "Nova" encerra
 * a ativa e cria uma sessão limpa (callback `onNova`).
 *
 * Realtime: subscriber em `conversas` UPDATE/INSERT — sidebar atualiza sozinho
 * quando o motor cria nova conversa teste ou marca a atual como `encerrada`.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SessaoTeste {
  id: string;
  titulo: string | null;
  status: string;
  updated_at: string;
  ultima_msg_preview: string;
}

interface Props {
  agenteId: string;
  conversaAtivaId: string | null;
  onAbrir: (sessao: SessaoTeste) => void;
  onNova: () => void;
  carregandoAcao?: boolean;
  /** Ocupa a largura toda (gaveta do modo celular) em vez da coluna fixa de 240px. */
  larguraCheia?: boolean;
  /** Botão "fechar" no topo — só aparece quando a lista está numa gaveta. */
  onFechar?: () => void;
}

export function SidebarHistorico({ agenteId, conversaAtivaId, onAbrir, onNova, carregandoAcao, larguraCheia, onFechar }: Props) {
  const [sessoes, setSessoes] = useState<SessaoTeste[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data: convs } = await supabase
      .from("conversas")
      .select("id, titulo, status, updated_at, created_at")
      .eq("agente_id", agenteId)
      .eq("channel", "teste")
      .neq("status", "encerrada")
      .order("updated_at", { ascending: false })
      .limit(40);
    const convList = (convs ?? []) as Array<{ id: string; titulo: string | null; status: string; updated_at: string; created_at: string }>;

    const ids = convList.map((c) => c.id);
    const msgsPorConv: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: msgs } = await supabase
        .from("mensagens")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      const seen = new Set<string>();
      for (const m of (msgs ?? []) as Array<{ conversation_id: string; content: string | null; role: string }>) {
        if (seen.has(m.conversation_id)) continue;
        seen.add(m.conversation_id);
        const prefix = m.role === "user" ? "voce: " : "";
        msgsPorConv[m.conversation_id] = prefix + (m.content || "").slice(0, 80);
      }
    }

    setSessoes(
      convList.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        status: c.status,
        updated_at: c.updated_at || c.created_at,
        ultima_msg_preview: msgsPorConv[c.id] || "(sem mensagens)",
      })),
    );
    setCarregando(false);
  }, [agenteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    let timer: number | null = null;
    const ch = supabase
      .channel(`chat-teste-historico-${agenteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => void carregar(), 600);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => void carregar(), 600);
      })
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [agenteId, carregar]);

  return (
    <aside
      style={{
        flex: larguraCheia ? "1 1 auto" : "0 0 240px",
        width: larguraCheia ? "100%" : undefined,
        height: larguraCheia ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        borderRight: larguraCheia ? "none" : "1px solid var(--os-vidro-borda, rgba(255,255,255,0.10))",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            aria-label="Voltar para a conversa"
            style={{ background: "none", border: "none", color: "var(--txt-1)", fontSize: 20, lineHeight: 1, padding: "4px 6px", cursor: "pointer" }}
          >
            ←
          </button>
        )}
        <span style={{ fontSize: larguraCheia ? 15 : 12, fontWeight: 600, color: "var(--txt-1)" }}>Historico</span>
        <span className="muted tiny" style={{ marginLeft: "auto" }}>
          {sessoes.length}
        </span>
      </div>
      <button
        type="button"
        onClick={onNova}
        disabled={carregandoAcao}
        style={{
          margin: "8px 12px",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid oklch(0.7 0.18 220 / 0.40)",
          background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.18))",
          color: "var(--txt-1)",
          fontSize: 12,
          fontWeight: 600,
          cursor: carregandoAcao ? "not-allowed" : "pointer",
          opacity: carregandoAcao ? 0.5 : 1,
        }}
      >
        + Nova sessao
      </button>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
        {carregando && (
          <div className="muted tiny" style={{ padding: "8px 4px" }}>
            carregando...
          </div>
        )}
        {!carregando && sessoes.length === 0 && (
          <div className="muted tiny" style={{ padding: "8px 4px" }}>
            sem sessoes anteriores
          </div>
        )}
        {sessoes.map((s) => {
          const ativa = s.id === conversaAtivaId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onAbrir(s)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: larguraCheia ? "12px 12px" : "8px 10px",
                marginBottom: 4,
                borderRadius: 8,
                border: ativa
                  ? "1px solid oklch(0.7 0.18 220 / 0.55)"
                  : "1px solid transparent",
                background: ativa ? "oklch(0.7 0.18 220 / 0.10)" : "transparent",
                color: "var(--txt-1)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: larguraCheia ? 14 : 12, fontWeight: ativa ? 600 : 500, overflowWrap: "anywhere" }}>
                {s.titulo || "Sessao sem titulo"}
              </span>
              <span className="muted tiny" style={{ fontSize: larguraCheia ? 13 : 11, lineHeight: 1.3, overflowWrap: "anywhere" }}>
                {s.ultima_msg_preview}
              </span>
              <span className="muted tiny" style={{ fontSize: 10, opacity: 0.6 }}>
                {formatarRelativo(s.updated_at)}
                {s.status === "encerrada" ? " - encerrada" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function formatarRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atras`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atras`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d atras`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
