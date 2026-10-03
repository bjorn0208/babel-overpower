/**
 * Aba Conversa — histórico do papo com o assistente financeiro (WhatsApp).
 * 1 conversa por número autorizado: quando há mais de uma pessoa, um seletor
 * (pills) alterna entre os fios. Realtime na conversa selecionada.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { type SupabaseBruto } from "./tipos";

type Conversa = { id: string; titulo: string | null; numero_wpp: string | null };
type Mensagem = { id: string; papel: string; conteudo: string; criado_em: string };

type Props = { ownerId: string | null };

export function AbaConversa({ ownerId }: Props) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef<HTMLDivElement>(null);

  // Lista os fios (1 por número autorizado)
  useEffect(() => {
    (async () => {
      if (!ownerId) { setCarregando(false); return; }
      const sb = supabase as SupabaseBruto;
      const { data } = await sb
        .from("mentor_conversas")
        .select("id, titulo, numero_wpp")
        .eq("owner_id", ownerId)
        .eq("canal", "financeiro")
        .order("atualizado_em", { ascending: false });
      const lista = (data ?? []) as Conversa[];
      setConversas(lista);
      setConversaId(lista[0]?.id ?? null);
      if (lista.length === 0) setCarregando(false);
    })();
  }, [ownerId]);

  const carregarMensagens = useCallback(async (cid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("mentor_mensagens")
      .select("id, papel, conteudo, criado_em")
      .eq("conversa_id", cid)
      .order("criado_em", { ascending: true })
      .limit(400);
    setMensagens((data ?? []) as Mensagem[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (conversaId) { setCarregando(true); void carregarMensagens(conversaId); }
  }, [conversaId, carregarMensagens]);

  // Realtime: nova mensagem no fio selecionado (cleanup obrigatório)
  useEffect(() => {
    if (!conversaId) return;
    const sb = supabase as SupabaseBruto;
    const ch = sb
      .channel(`financeiro-conversa-${conversaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mentor_mensagens", filter: `conversa_id=eq.${conversaId}` },
        () => { void carregarMensagens(conversaId); },
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [conversaId, carregarMensagens]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens.length]);

  if (carregando && conversas.length === 0) {
    return <div style={vazioStyle}>Carregando…</div>;
  }
  if (conversas.length === 0) {
    return (
      <div style={vazioStyle}>
        Nenhuma conversa ainda. Manda uma mensagem de um número autorizado pro WhatsApp da
        empresa que o histórico aparece aqui — um fio pra cada pessoa.
      </div>
    );
  }

  const rotuloConversa = (c: Conversa) =>
    (c.titulo ?? "").replace(/^Financeiro — /, "") || c.numero_wpp || "Conversa";

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden"
      style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
      {conversas.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {conversas.map((c) => {
            const ativa = c.id === conversaId;
            return (
              <motion.button key={c.id} whileTap={tapPress} type="button"
                onClick={() => setConversaId(c.id)}
                style={{
                  fontSize: 11, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                  color: ativa ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.6)",
                  border: ativa ? "1px solid oklch(0.7 0.18 220 / 0.5)" : "1px solid oklch(0.98 0 0 / 0.1)",
                  background: ativa
                    ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.25), oklch(0.65 0.22 280 / 0.18))"
                    : "transparent",
                  fontWeight: ativa ? 600 : 500,
                }}>
                {rotuloConversa(c)}
              </motion.button>
            );
          })}
        </div>
      )}

      {carregando ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : mensagens.length === 0 ? (
        <div style={vazioStyle}>Sem mensagens neste fio ainda.</div>
      ) : (
        mensagens.map((m) => {
          const doUser = m.papel === "user";
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: doUser ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "78%",
                padding: "9px 13px",
                borderRadius: 14,
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "oklch(0.98 0 0)",
                background: doUser
                  ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.28), oklch(0.65 0.22 280 / 0.2))"
                  : "oklch(0.18 0.06 280 / 0.4)",
                border: doUser
                  ? "1px solid oklch(0.7 0.18 220 / 0.3)"
                  : "1px solid oklch(0.98 0 0 / 0.07)",
              }}>
                {m.conteudo}
                <div style={{ fontSize: 9, color: "oklch(0.98 0 0 / 0.4)", marginTop: 4, textAlign: "right" }}>
                  {new Date(m.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div ref={fimRef} />
    </motion.div>
  );
}

const vazioStyle: React.CSSProperties = {
  padding: "40px 20px",
  textAlign: "center",
  color: "oklch(0.98 0 0 / 0.45)",
  fontSize: 13,
  lineHeight: 1.6,
};
