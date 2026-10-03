/**
 * Bloco "Vender por link" — gera o link público de venda (mesma RPC que o
 * agente usa: gerar_link_consulta). O tenant clica e manda pro cliente; não
 * digita documento (quem preenche é o cliente, que decide CPF/CNPJ e o preço).
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { tapPress } from "@/os/motion/presets";
import { urlPublica } from "@/lib/url-app";
import { supabase } from "@/integrations/supabase/client";
import type { ToastApi, SupabaseBruto } from "./tipos";

export function LinkVenda({ t }: { t: ToastApi }) {
  const [link, setLink] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb.rpc("gerar_link_consulta");
      if (error || !data?.ok) throw error ?? new Error(data?.erro ?? "falha");
      setLink(urlPublica("/consulta/" + data.chave_publica));
      t.success("Link de venda gerado!");
    } catch {
      t.error("Falha ao gerar link. Confira o preço e o PIX na aba Configurações.");
    } finally {
      setGerando(false);
    }
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard
      .writeText(link)
      .then(() => t.success("Link copiado"))
      .catch(() => t.error("Falha ao copiar"));
  }

  return (
    <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", margin: 0 }}>Vender consulta</h2>
          <p style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", margin: "4px 0 0", maxWidth: 460, lineHeight: 1.5 }}>
            Gera o link de pagamento (o mesmo que o agente manda). O cliente digita o documento, paga e recebe o resultado. O preço sai do que você definiu na aba Configurações.
          </p>
        </div>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={() => void gerar()}
          disabled={gerando}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 12, fontWeight: 600,
            background: gerando ? "oklch(0.98 0 0 / 0.05)" : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
            color: gerando ? "oklch(0.98 0 0 / 0.35)" : "oklch(0.98 0 0)",
            border: "1px solid oklch(0.7 0.18 220 / 0.3)", borderRadius: 10,
            cursor: gerando ? "not-allowed" : "pointer", whiteSpace: "nowrap",
          }}
        >
          <Link2 size={14} /> {gerando ? "Gerando..." : "Gerar link de venda"}
        </motion.button>
      </div>

      {link && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "10px 12px",
            background: "oklch(0.12 0.04 280 / 0.6)", borderRadius: 10, border: "1px solid oklch(0.98 0 0 / 0.08)",
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: "oklch(0.7 0.18 220)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            {link}
          </span>
          <button type="button" title="Copiar link" onClick={copiar}
            style={{ padding: 5, background: "transparent", border: "none", cursor: "pointer", color: "oklch(0.98 0 0 / 0.55)", display: "grid", placeItems: "center" }}>
            <Copy size={13} />
          </button>
          <button type="button" title="Abrir link" onClick={() => window.open(link, "_blank")}
            style={{ padding: 5, background: "transparent", border: "none", cursor: "pointer", color: "oklch(0.98 0 0 / 0.55)", display: "grid", placeItems: "center" }}>
            <ExternalLink size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
