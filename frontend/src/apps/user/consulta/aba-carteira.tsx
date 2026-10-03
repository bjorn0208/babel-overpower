/**
 * Aba Carteira — saldo, pacotes de recarga e extrato de movimentos.
 */

import { useState, useEffect } from "react";
import type React from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { Campo, CardKpi, inputStyle, Vazio } from "./re-exports";
import { formatBRL } from "./tipos";
import type { MovimentoCarteira, PacoteCredito, ToastApi, SupabaseBruto } from "./tipos";

export function AbaCarteira({
  saldo,
  pacotes,
  movimentos,
  t,
}: {
  saldo: number;
  pacotes: PacoteCredito[];
  movimentos: MovimentoCarteira[];
  t: ToastApi;
}) {
  const [pacoteAtivo, setPacoteAtivo] = useState<string | null>(null);
  const [urlComprovante, setUrlComprovante] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subindo, setSubindo] = useState(false);

  async function subirComprovante(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setSubindo(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { t.error("Sessão expirada. Entre novamente."); return; }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `recargas/${uid}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("consultas-anexos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = sb.storage.from("consultas-anexos").getPublicUrl(path);
      setUrlComprovante(pub?.publicUrl ?? "");
      t.success("Comprovante anexado.");
    } catch {
      t.error("Falha ao anexar comprovante. Tente novamente.");
    } finally {
      setSubindo(false);
    }
  }

  const pacotesAtivos = pacotes.filter((p) => p.ativo).sort((a, b) => a.ordem - b.ordem);
  const pacoteSelecionado = pacotesAtivos.find((p) => p.id === pacoteAtivo) ?? null;

  // PIX da plataforma (pra onde o tenant paga a recarga) — vem da config da plataforma.
  const [CHAVE_PIX, setChavePix] = useState("");
  useEffect(() => {
    (async () => {
      const sb = supabase as SupabaseBruto;
      const { data } = await sb.from("config_plataforma_publico").select("pix_key").limit(1).maybeSingle();
      if (data?.pix_key) setChavePix(data.pix_key as string);
    })();
  }, []);

  async function enviarComprovante() {
    if (!pacoteSelecionado) { t.error("Selecione um pacote"); return; }
    if (!urlComprovante.trim()) { t.error("Informe a URL do comprovante"); return; }
    setEnviando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { t.error("Sessão expirada. Entre novamente."); return; }

      const { error } = await sb.from("consultas_recargas").insert({
        tenant_id: uid,
        pacote_id: pacoteSelecionado.id,
        valor: pacoteSelecionado.valor,
        credito: pacoteSelecionado.credito,
        chave_pix: CHAVE_PIX,
        url_comprovante: urlComprovante.trim(),
        status: "comprovante_enviado",
      });
      if (error) throw error;
      t.success("Comprovante enviado para análise. Saldo creditado após aprovação.");
      setUrlComprovante("");
      setPacoteAtivo(null);
    } catch {
      t.error("Falha ao enviar comprovante. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <CardKpi rotulo="Saldo atual" valor={saldo} cor="oklch(0.72 0.18 145)" formatado={formatBRL(saldo)} />
        <CardKpi rotulo="Recargas" valor={movimentos.filter((m) => m.tipo === "credito").length} cor="oklch(0.7 0.18 220)" />
        <CardKpi rotulo="Débitos" valor={movimentos.filter((m) => m.tipo === "debito").length} cor="oklch(0.65 0.22 280)" />
      </div>

      <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 12 }}>
          Pacotes de crédito
        </h2>

        {pacotesAtivos.length === 0 ? (
          <Vazio mensagem="Nenhum pacote disponível no momento" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {pacotesAtivos.map((p) => {
              const sel = pacoteAtivo === p.id;
              return (
                <motion.button key={p.id} type="button" whileTap={tapPress}
                  onClick={() => setPacoteAtivo(sel ? null : p.id)}
                  style={{
                    padding: 16, borderRadius: 12, cursor: "pointer", textAlign: "left",
                    background: sel
                      ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))"
                      : "oklch(0.18 0.06 280 / 0.3)",
                    border: sel ? "1px solid oklch(0.7 0.18 220 / 0.5)" : "1px solid oklch(0.98 0 0 / 0.07)",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.98 0 0)", marginBottom: 6 }}>{p.nome}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "oklch(0.72 0.18 145)", fontFamily: "ui-monospace, SFMono-Regular, monospace", marginBottom: 4 }}>
                    {formatBRL(p.credito)}
                  </div>
                  <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
                    em créditos por <strong style={{ color: "oklch(0.98 0 0 / 0.85)" }}>{formatBRL(p.valor)}</strong>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {pacoteSelecionado && (
          <motion.div variants={fadeSlideIn} initial="hidden" animate="visible"
            style={{ marginTop: 16, padding: 16, background: "oklch(0.12 0.04 280 / 0.5)", borderRadius: 12, border: "1px solid oklch(0.98 0 0 / 0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 12 }}>
              PIX · {pacoteSelecionado.nome} — {formatBRL(pacoteSelecionado.valor)}
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "oklch(0.98 0 0 / 0.55)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                Chave PIX {/* TODO(banco): chave real virá da config do tenant */}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "oklch(0.18 0.06 280 / 0.4)", borderRadius: 10, border: "1px solid oklch(0.98 0 0 / 0.08)" }}>
                <span style={{ flex: 1, fontSize: 12, color: "oklch(0.7 0.18 220)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{CHAVE_PIX}</span>
                <button type="button"
                  onClick={() => navigator.clipboard.writeText(CHAVE_PIX).then(() => t.success("Chave PIX copiada")).catch(() => t.error("Falha ao copiar"))}
                  style={{ fontSize: 10, padding: "4px 10px", background: "oklch(0.7 0.18 220 / 0.15)", color: "oklch(0.7 0.18 220)", border: "1px solid oklch(0.7 0.18 220 / 0.3)", borderRadius: 6, cursor: "pointer" }}>
                  Copiar
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Campo label="Comprovante de pagamento">
                <input type="file" accept="image/*,application/pdf" onChange={(e) => void subirComprovante(e)}
                  disabled={subindo} style={{ ...inputStyle, padding: 8, cursor: "pointer" }} />
                {subindo && <span style={{ fontSize: 10, color: "oklch(0.78 0.18 80)", marginTop: 4 }}>Enviando anexo…</span>}
                {urlComprovante && !subindo && (
                  <span style={{ fontSize: 10, color: "oklch(0.72 0.18 145)", marginTop: 4 }}>Comprovante anexado ✓</span>
                )}
              </Campo>
              <motion.button type="button" whileTap={tapPress} onClick={() => void enviarComprovante()}
                disabled={enviando || !urlComprovante.trim()}
                style={{
                  padding: "9px 18px", fontSize: 12, fontWeight: 600, borderRadius: 10, alignSelf: "flex-start",
                  background: enviando || !urlComprovante.trim() ? "oklch(0.98 0 0 / 0.05)" : "linear-gradient(135deg, oklch(0.72 0.18 145 / 0.4), oklch(0.7 0.18 220 / 0.3))",
                  color: enviando || !urlComprovante.trim() ? "oklch(0.98 0 0 / 0.3)" : "oklch(0.98 0 0)",
                  border: "1px solid oklch(0.72 0.18 145 / 0.3)",
                  cursor: enviando || !urlComprovante.trim() ? "not-allowed" : "pointer",
                }}>
                {enviando ? "Enviando..." : "Enviar comprovante"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 12 }}>Extrato</h2>

        {movimentos.length === 0 ? (
          <Vazio mensagem="Nenhuma movimentação ainda" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {movimentos.map((m) => {
              const isPos = m.tipo !== "debito";
              const cor = isPos ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.24 25)";
              const sinal = isPos ? "+" : "−";
              const rotulo = m.tipo === "estorno" ? "Estorno" : isPos ? "Crédito" : "Débito";
              return (
                <div key={m.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "10px 12px", background: "oklch(0.18 0.06 280 / 0.2)", borderRadius: 10, border: "1px solid oklch(0.98 0 0 / 0.05)" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: isPos ? "oklch(0.72 0.18 145 / 0.15)" : "oklch(0.65 0.24 25 / 0.15)", color: cor, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>
                    {rotulo}
                  </span>
                  <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                  <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.35)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>saldo: {formatBRL(m.saldo_apos)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cor, fontFamily: "ui-monospace, SFMono-Regular, monospace", whiteSpace: "nowrap" }}>{sinal} {formatBRL(m.valor)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
