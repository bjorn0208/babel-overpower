/**
 * Aba Vender — gera link público de consulta pago com preço definido pelo tenant.
 */

import { useState } from "react";
import type React from "react";
import { Copy, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { urlPublica } from "@/lib/url-app";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { Campo, inputStyle, Vazio } from "./re-exports";
import { formatBRL } from "./tipos";
import type { TipoConsulta, ToastApi, SupabaseBruto } from "./tipos";

export function AbaVender({
  tipos,
  t,
}: {
  tipos: TipoConsulta[];
  t: ToastApi;
}) {
  const [tipoId, setTipoId] = useState("");
  const [preco, setPreco] = useState("");
  const [titulo, setTitulo] = useState("");
  const [corPagina, setCorPagina] = useState("#6366f1");
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const tiposAtivos = tipos.filter((tp) => tp.ativo).sort((a, b) => a.ordem - b.ordem);
  const tipoSel = tiposAtivos.find((tp) => tp.id === tipoId) ?? null;
  const precoNum = parseFloat(preco.replace(",", "."));
  const desabilitado = gerando || !tipoId;

  async function gerarLink() {
    if (!tipoId) { t.error("Selecione um tipo de consulta"); return; }
    if (isNaN(precoNum) || precoNum < 0) { t.error("Preço inválido"); return; }
    setGerando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { t.error("Sessão expirada. Entre novamente."); return; }

      const { data: nova, error } = await sb
        .from("consultas")
        .insert({
          tenant_id: uid,
          tipo_id: tipoId,
          origem: "link",
          preco: precoNum,
          titulo: titulo || null,
          cor_pagina: corPagina,
          status: "aguardando_pagamento",
        })
        .select("chave_publica")
        .single();
      if (error || !nova) throw error ?? new Error("falha ao gerar link");

      setLinkGerado(urlPublica("/consulta/" + nova.chave_publica));
      t.success("Link gerado!");
    } catch {
      t.error("Falha ao gerar link. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  function copiar() {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado)
      .then(() => t.success("Link copiado"))
      .catch(() => t.error("Falha ao copiar"));
  }

  const btnStyle: React.CSSProperties = {
    padding: "10px 20px", fontSize: 12, fontWeight: 600, borderRadius: 10,
    cursor: desabilitado ? "not-allowed" : "pointer",
    background: desabilitado
      ? "oklch(0.98 0 0 / 0.05)"
      : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
    color: desabilitado ? "oklch(0.98 0 0 / 0.35)" : "oklch(0.98 0 0)",
    border: "1px solid oklch(0.7 0.18 220 / 0.3)",
    alignSelf: "flex-start",
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 14 }}>
          Gerar link de venda
        </h2>

        {tiposAtivos.length === 0 ? (
          <Vazio mensagem="Nenhum tipo de consulta ativo para vender" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
            <Campo label="Tipo de consulta">
              <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}
                style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                <option value="">Selecione...</option>
                {tiposAtivos.map((tp) => (
                  <option key={tp.id} value={tp.id}>{tp.nome} · {formatBRL(tp.custo)}</option>
                ))}
              </select>
            </Campo>

            <Campo label="Preço cobrado do cliente (R$)">
              <input type="number" min="0" step="0.01" value={preco}
                onChange={(e) => setPreco(e.target.value)} placeholder="ex: 29,90" style={inputStyle} />
              {tipoSel && preco && !isNaN(precoNum) && (
                <span style={{ fontSize: 10, color: "oklch(0.72 0.18 145)", marginTop: 2 }}>
                  Custo: {formatBRL(tipoSel.custo)} · Margem: {formatBRL(Math.max(0, precoNum - tipoSel.custo))}
                </span>
              )}
            </Campo>

            <Campo label="Título da página (opcional)">
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="ex: Consulta de CPF — Empresa X" style={inputStyle} maxLength={120} />
            </Campo>

            <Campo label="Cor da página">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="color" value={corPagina} onChange={(e) => setCorPagina(e.target.value)}
                  style={{ width: 40, height: 32, borderRadius: 8, border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent", cursor: "pointer", padding: 2 }} />
                <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>{corPagina}</span>
              </div>
            </Campo>

            <p style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)", lineHeight: 1.5, margin: 0 }}>
              Exigir <strong>selfie</strong> e <strong>foto do documento</strong> se liga na aba <strong>Configurações</strong> — vale pra todos os links de venda, na hora.
            </p>

            <motion.button type="button" whileTap={tapPress}
              onClick={() => void gerarLink()} disabled={desabilitado} style={btnStyle}>
              {gerando ? "Gerando..." : "Gerar link de venda"}
            </motion.button>
          </div>
        )}
      </div>

      {linkGerado && (
        <motion.div variants={fadeSlideIn} initial="hidden" animate="visible"
          className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.98 0 0 / 0.75)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Link gerado
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "oklch(0.12 0.04 280 / 0.6)", borderRadius: 10, border: "1px solid oklch(0.98 0 0 / 0.08)" }}>
            <span style={{ flex: 1, fontSize: 11, color: "oklch(0.7 0.18 220)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
              {linkGerado}
            </span>
            <button type="button" title="Copiar link" onClick={copiar}
              style={{ padding: 5, background: "transparent", border: "none", cursor: "pointer", color: "oklch(0.98 0 0 / 0.55)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Copy size={13} />
            </button>
            <button type="button" title="Abrir link" onClick={() => window.open(linkGerado, "_blank")}
              style={{ padding: 5, background: "transparent", border: "none", cursor: "pointer", color: "oklch(0.98 0 0 / 0.55)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <ExternalLink size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
