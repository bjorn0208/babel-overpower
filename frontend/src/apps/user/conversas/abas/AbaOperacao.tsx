/**
 * Aba "Operação" — o serviço/produto que o cliente contratou + o link público
 * de acompanhamento + atalho pra configurar o fluxo daquele produto.
 *
 * Fontes reais (zero DDL — só conecta o que já existe):
 *  - produto            ← leads.produto
 *  - link acompanhamento → /acompanhamento/<leads.chave_rastreamento>
 *  - converted_at       ← leads.converted_at
 *  - fluxo (editor)     → agentes_usuario.product_flows
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import type { Conversa } from "../tipos";
import { EditorFluxo } from "./EditorFluxo";

interface AbaOperacaoProps {
  conversa: Conversa;
  /** UUID real da conversa quando `conversa.id` é mock. Mantido por compat. */
  conversaIdOverride?: string | null;
}

function obterToast(): { success: (m: string) => void; error: (m: string) => void } {
  const w = window as unknown as {
    useToast?: () => { success: (m: string) => void; error: (m: string) => void };
  };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function AbaOperacao({ conversa }: AbaOperacaoProps) {
  const [editorAberto, setEditorAberto] = useState(false);
  const produto = (conversa.lead.produto ?? "").trim();
  const chave = conversa.lead.chave_rastreamento ?? null;
  const convertedAt = conversa.lead.converted_at ?? null;
  const link = chave ? `${window.location.origin}/acompanhamento/${chave}` : null;

  const copiarLink = async () => {
    if (!link) return;
    const t = obterToast();
    try {
      await navigator.clipboard.writeText(link);
      t.success("Link de acompanhamento copiado");
    } catch {
      t.error("Não consegui copiar o link");
    }
  };

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 18px" }}
    >
      <section aria-label="Produto ou serviço contratado">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Produto contratado
        </div>
        {produto ? (
          <div
            className="os-vidro"
            style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{produto}</div>
            <div className="muted tiny" style={{ marginTop: 3 }}>
              {convertedAt ? `Cliente desde ${formatarData(convertedAt)}` : "Ainda não convertido em cliente"}
            </div>
          </div>
        ) : (
          <span className="muted tiny">
            Nenhum produto/serviço definido pra esse contato ainda.
          </span>
        )}
      </section>

      <section aria-label="Link de acompanhamento">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Link de acompanhamento
        </div>
        {link ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              className="mono tiny"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                wordBreak: "break-all",
                color: "var(--txt-2)",
              }}
            >
              {link}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <motion.button
                type="button"
                onClick={copiarLink}
                whileTap={tapPress}
                className="btn btn-sm"
                style={{ flex: 1 }}
              >
                Copiar link
              </motion.button>
              <motion.a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                whileTap={tapPress}
                className="btn btn-ghost btn-sm"
                aria-label="Abrir página de acompanhamento em nova aba"
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                Abrir
              </motion.a>
            </div>
          </div>
        ) : (
          <span className="muted tiny">Sem chave de rastreamento pra esse contato.</span>
        )}
      </section>

      <section aria-label="Fluxo do acompanhamento">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Fluxo do acompanhamento
        </div>
        <div className="muted tiny" style={{ marginBottom: 8 }}>
          Estágios e checkpoints que o cliente vê na página pública. Configurável por produto.
        </div>
        <motion.button
          type="button"
          onClick={() => setEditorAberto(true)}
          whileTap={tapPress}
          className="btn btn-sm"
          disabled={!produto}
          style={{ opacity: produto ? 1 : 0.5 }}
          aria-label="Configurar fluxo do acompanhamento"
        >
          Configurar fluxo
        </motion.button>
        {!produto && (
          <div className="muted tiny" style={{ marginTop: 6, fontStyle: "italic" }}>
            Defina o produto antes de configurar o fluxo.
          </div>
        )}
      </section>

      {produto && (
        <EditorFluxo produto={produto} aberto={editorAberto} onFechar={() => setEditorAberto(false)} />
      )}
    </motion.div>
  );
}
