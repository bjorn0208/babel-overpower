/**
 * AnexoCard — exibe anexo de contrato (imagem / PDF / outro arquivo).
 * Extraído de aba-historico.tsx para manter cada módulo ≤300 linhas.
 */

import { useEffect, useState } from "react";

export function AnexoCard({ rotulo, url }: { rotulo: string; url: string }) {
  // 2026-05-25: usa a URL como salva no contrato (fonte da verdade por arquivo).
  // Removido o rewrite contract-signatures→assinaturas-contrato: o upload da assinatura
  // (pages/public/contrato/use-contrato.ts) + o gerar-pdf-contrato gravam em
  // `contract-signatures` (bucket público ativo), e o rewrite mandava a URL pra um
  // bucket onde o arquivo não existe → "imagem indisponível".
  const ext = (url.split("?")[0].split(".").pop() ?? "").toLowerCase();
  const ehImagem = ["jpg", "jpeg", "png", "webp", "gif", "heic", "avif"].includes(ext);
  const ehPdf = ext === "pdf";
  const [lightbox, setLightbox] = useState(false);
  const [pdfAberto, setPdfAberto] = useState(false);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const fundoCard = "oklch(0.12 0.04 280 / 0.5)";
  const fundoHover = "oklch(0.18 0.06 280 / 0.5)";

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 6, padding: 8,
        background: fundoCard, border: "1px solid oklch(0.98 0 0 / 0.08)",
        borderRadius: 10, gridColumn: ehPdf && pdfAberto ? "1 / -1" : undefined,
        transition: "border-color 150ms ease, background 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = fundoHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = fundoCard; }}
    >
      {ehImagem && (
        <button
          type="button"
          onClick={() => setLightbox(true)}
          title={`Ampliar ${rotulo}`}
          style={{ all: "unset", cursor: "zoom-in", width: "100%", aspectRatio: "4 / 3", borderRadius: 6, overflow: "hidden", background: "oklch(0.08 0.02 280 / 0.6)" }}
        >
          <img
            src={url} alt={rotulo} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).alt = "imagem indisponivel"; }}
          />
        </button>
      )}

      {ehPdf && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          {pdfAberto ? (
            <iframe
              src={url} title={rotulo}
              style={{ width: "100%", height: 460, border: "1px solid oklch(0.98 0 0 / 0.08)", borderRadius: 6, background: "white" }}
            />
          ) : (
            <button
              type="button" onClick={() => setPdfAberto(true)} title={`Ver ${rotulo} aqui`}
              style={{ all: "unset", cursor: "pointer", width: "100%", aspectRatio: "4 / 3", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0.08 0.02 280 / 0.6)", flexDirection: "column", gap: 4 }}
            >
              <span aria-hidden="true" style={{ fontSize: 36 }}>📄</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>Clique pra abrir aqui</span>
            </button>
          )}
        </div>
      )}

      {!ehImagem && !ehPdf && (
        <a
          href={url} target="_blank" rel="noopener noreferrer" title={`Baixar ${rotulo}`}
          style={{ cursor: "pointer", width: "100%", aspectRatio: "4 / 3", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0.08 0.02 280 / 0.6)", textDecoration: "none", color: "inherit", fontSize: 36 }}
        >
          <span aria-hidden="true">📎</span>
        </a>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.3, opacity: 0.85, flex: 1, minWidth: 0 }}>{rotulo}</div>
        {ehPdf && pdfAberto && (
          <button
            type="button" onClick={() => setPdfAberto(false)} title="Esconder PDF"
            style={{ all: "unset", cursor: "pointer", fontSize: 10, opacity: 0.55, padding: "2px 6px", borderRadius: 4 }}
          >
            esconder
          </button>
        )}
        <a
          href={url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba"
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.4, color: "inherit", textDecoration: "none", padding: "2px 4px" }}
        >
          {ext || "arquivo"} ↗
        </a>
      </div>

      {lightbox && ehImagem && (
        <div
          role="dialog" aria-label={`Preview ampliado · ${rotulo}`} aria-modal="true"
          onClick={() => setLightbox(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "oklch(0 0 0 / 0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", cursor: "zoom-out" }}
        >
          <button
            type="button" onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
            aria-label="Fechar preview"
            style={{ position: "absolute", top: 18, right: 22, width: 38, height: 38, borderRadius: "50%", background: "oklch(1 0 0 / 0.12)", border: "1px solid oklch(1 0 0 / 0.18)", color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            x
          </button>
          <div
            style={{ maxWidth: "min(1100px, 92vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={url} alt={rotulo}
              style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 20px 60px oklch(0 0 0 / 0.6)" }}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center", color: "white", fontSize: 12, opacity: 0.85 }}>
              <span>{rotulo}</span>
              <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "oklch(0.78 0.18 220)", textDecoration: "underline" }}>
                abrir original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
