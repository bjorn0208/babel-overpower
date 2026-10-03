// Seletor de conversa para o replay
// Campo livre para colar ID + lista das N conversas mais recentes do tenant

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ConversaListagem } from "./tipos-replay";

const N_RECENTES = 10;

interface PropsSeletorConversa {
  conversaAtual: string | null;
  carregando: boolean;
  aoSelecionar: (id: string) => void;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export default function SeletorConversa({
  conversaAtual,
  carregando,
  aoSelecionar,
}: PropsSeletorConversa) {
  const [idDigitado, setIdDigitado] = useState(conversaAtual ?? "");
  const [recentes, setRecentes] = useState<ConversaListagem[]>([]);
  const [statusLista, setStatusLista] = useState<
    "buscando" | "lista" | "vazio" | "nao_logado" | "erro"
  >("buscando");
  const [erroMsg, setErroMsg] = useState<string>("");

  // Carrega conversas recentes do tenant logado.
  // Feedback diferenciado (interaction-design): sem login ≠ erro ≠ vazio —
  // o usuário precisa saber QUAL é a causa, não um "nenhuma conversa" mudo.
  useEffect(() => {
    let cancelado = false;
    setStatusLista("buscando");
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (cancelado) return;
      if (!sess?.session) {
        setStatusLista("nao_logado");
        return;
      }
      const { data, error } = await supabase
        .from("conversas")
        .select("id, phone, channel, created_at, status, titulo")
        .order("created_at", { ascending: false })
        .limit(N_RECENTES);
      if (cancelado) return;
      if (error) {
        setErroMsg(error.message);
        setStatusLista("erro");
        return;
      }
      const lista = (data ?? []) as ConversaListagem[];
      setRecentes(lista);
      setStatusLista(lista.length > 0 ? "lista" : "vazio");
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const confirmar = useCallback(() => {
    const id = idDigitado.trim();
    if (id) aoSelecionar(id);
  }, [idDigitado, aoSelecionar]);

  const selecionarRecente = useCallback(
    (id: string) => {
      setIdDigitado(id);
      aoSelecionar(id);
    },
    [aoSelecionar]
  );

  const estiloBase: React.CSSProperties = {
    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    color: "oklch(0.92 0.02 240)",
  };

  return (
    <div
      style={{
        ...estiloBase,
        padding: "12px 16px",
        background: "oklch(0.12 0.02 240)",
        borderBottom: "1px solid oklch(0.22 0.03 240)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Título */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "oklch(0.55 0.06 240)",
        }}
      >
        Replay — escolha uma conversa
      </div>

      {/* Campo ID + botão */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={idDigitado}
          onChange={(e) => setIdDigitado(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmar()}
          placeholder="Cole o ID da conversa (UUID)…"
          style={{
            flex: 1,
            background: "oklch(0.15 0.02 240)",
            border: "1.5px solid oklch(0.28 0.03 240)",
            borderRadius: 6,
            color: "oklch(0.92 0.02 240)",
            fontSize: 12,
            padding: "5px 10px",
            outline: "none",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={confirmar}
          disabled={carregando || !idDigitado.trim()}
          style={{
            background:
              carregando || !idDigitado.trim()
                ? "oklch(0.22 0.02 240)"
                : "oklch(0.55 0.18 240)",
            border: "none",
            borderRadius: 6,
            color:
              carregando || !idDigitado.trim()
                ? "oklch(0.45 0.03 240)"
                : "oklch(0.97 0.01 240)",
            cursor:
              carregando || !idDigitado.trim() ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 14px",
            transition: "background 150ms ease-out",
            whiteSpace: "nowrap",
          }}
        >
          {carregando ? "Carregando…" : "Carregar"}
        </button>
      </div>

      {/* Lista recentes */}
      {statusLista === "buscando" ? (
        <div style={{ fontSize: 11, color: "oklch(0.5 0.03 240)" }}>
          Buscando conversas recentes…
        </div>
      ) : recentes.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            maxHeight: 80,
            overflowY: "auto",
          }}
        >
          {recentes.map((c) => {
            const ativo = c.id === conversaAtual;
            return (
              <button
                key={c.id}
                onClick={() => selecionarRecente(c.id)}
                title={c.id}
                style={{
                  background: ativo
                    ? "oklch(0.55 0.18 240)"
                    : "oklch(0.18 0.02 240)",
                  border: `1px solid ${ativo ? "oklch(0.55 0.18 240)" : "oklch(0.28 0.03 240)"}`,
                  borderRadius: 5,
                  color: ativo
                    ? "oklch(0.97 0.01 240)"
                    : "oklch(0.70 0.03 240)",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "3px 8px",
                  transition: "background 120ms ease-out",
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.phone ?? c.channel ?? c.id.slice(0, 8)}…{" "}
                <span style={{ opacity: 0.6 }}>{formatarData(c.created_at)}</span>
              </button>
            );
          })}
        </div>
      ) : statusLista === "nao_logado" ? (
        <div style={{ fontSize: 11, color: "oklch(0.72 0.14 60)", lineHeight: 1.5 }}>
          ⚠ Você não está logado nesta origem. Abra o mapa na MESMA URL (mesma
          porta) onde está logado na plataforma — sem sessão o banco não libera
          as conversas (RLS). Enquanto isso, cole o ID da conversa acima.
        </div>
      ) : statusLista === "erro" ? (
        <div style={{ fontSize: 11, color: "oklch(0.66 0.18 25)", lineHeight: 1.5 }}>
          Erro ao listar: {erroMsg}. Pode ser RLS/permissão — cole o ID
          manualmente acima por enquanto.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "oklch(0.45 0.03 240)" }}>
          Logado, mas nenhuma conversa visível pra este usuário. Cole o ID
          acima se souber qual quer ver.
        </div>
      )}
    </div>
  );
}
