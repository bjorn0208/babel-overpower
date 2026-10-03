/**
 * Modal central pra visualizar o comprovante de uma recarga.
 * Mostra imagem ou, quando a URL é PDF, um iframe. Fecha no backdrop ou no X.
 *
 * Centralização via flexbox no wrapper full-screen — NÃO usar top/left + transform
 * translate, porque o framer-motion sobrescreve o transform com a própria animação
 * (scale/y) e o modal desloca pro canto.
 */

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { BotaoIcone } from "./ui-admin";

interface Props {
  url: string | null;
  onClose: () => void;
}

export function ModalComprovante({ url, onClose }: Props) {
  // Só http(s) é renderizável — bloqueia javascript:/data: (XSS via iframe).
  const urlSegura = url && /^https?:\/\//i.test(url) ? url : null;
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          key="overlay-comprovante"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            background: "oklch(0.08 0.04 280 / 0.75)", backdropFilter: "blur(6px)",
          }}
        >
          <motion.div
            key="card-comprovante"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(86vw, 720px)", maxHeight: "88vh",
              background: "oklch(0.14 0.06 280 / 0.97)", border: "1px solid oklch(0.98 0 0 / 0.08)",
              borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Comprovante</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {urlSegura && (
                  <BotaoIcone onClick={() => window.open(urlSegura, "_blank", "noopener")} titulo="Abrir em nova aba">
                    <ExternalLink size={13} />
                  </BotaoIcone>
                )}
                <BotaoIcone onClick={onClose} titulo="Fechar">
                  <X size={14} />
                </BotaoIcone>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 10, background: "oklch(0.08 0.04 280 / 0.5)" }}>
              {!urlSegura ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "oklch(0.78 0.18 80)" }}>
                  URL de comprovante inválida — só links http(s) são exibidos.
                </div>
              ) : /\.pdf(\?.*)?$/i.test(urlSegura) ? (
                <iframe src={urlSegura} title="Comprovante PDF" style={{ width: "100%", height: "76vh", border: "none", borderRadius: 10 }} />
              ) : (
                <img src={urlSegura} alt="Comprovante" style={{ display: "block", maxWidth: "100%", maxHeight: "76vh", margin: "0 auto", objectFit: "contain" }} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
