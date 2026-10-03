/**
 * DetalheContrato — painel expandido de um contrato no histórico.
 * Carregando — spinner exportado para o shell Contratos.tsx.
 */

import { Loader2 } from "lucide-react";
import { AnexoCard } from "./anexo-card";
import { Linha } from "./re-exports";
import { statusValidar } from "./re-exports";
import type { Contrato } from "./tipos";

// ---------------------------------------------------------------------------
// Detalhe expandido
// ---------------------------------------------------------------------------

export function DetalheContrato({
  c, link, onValidar, onRejeitar,
}: {
  c: Contrato; link: string; onValidar: () => void; onRejeitar: () => void;
}) {
  const podeValidar = statusValidar(c.status);
  const anexos = [
    { rotulo: "Selfie do assinante", url: c.url_selfie ?? "" },
    { rotulo: "Documento do assinante", url: c.url_documento ?? "" },
    { rotulo: "Selfie da testemunha", url: c.url_selfie_testemunha ?? "" },
    { rotulo: "Documento da testemunha", url: c.url_documento_testemunha ?? "" },
    { rotulo: "Comprovante de pagamento", url: c.url_comprovante_pagamento ?? "" },
  ].filter((a) => a.url.trim().length > 0);

  return (
    <div style={{ padding: 14, marginTop: 6, marginBottom: 8, background: "oklch(0.18 0.06 280 / 0.3)", borderRadius: 12, border: "1px solid oklch(0.98 0 0 / 0.05)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 11 }}>
        <Linha k="ID publico" v={c.chave_publica.slice(0, 8) + "..."} />
        <Linha k="Link" v={<a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "oklch(0.7 0.18 220)", textDecoration: "underline" }}>abrir</a>} />
        <Linha k="Criado em" v={new Date(c.created_at).toLocaleString("pt-BR")} />
        <Linha k="Assinado em" v={c.assinado_em ? new Date(c.assinado_em).toLocaleString("pt-BR") : "—"} />
        {c.pdf_url && <Linha k="PDF" v={<a href={c.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: "oklch(0.7 0.18 220)", textDecoration: "underline" }}>download</a>} />}
      </div>

      {anexos.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid oklch(0.98 0 0 / 0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, marginBottom: 8, letterSpacing: 0.3, textTransform: "uppercase" }}>
            Anexos enviados · {anexos.length}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {anexos.map((a) => <AnexoCard key={a.url} rotulo={a.rotulo} url={a.url} />)}
          </div>
        </div>
      )}

      {podeValidar && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onValidar} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 500, background: "oklch(0.72 0.18 145 / 0.2)", color: "oklch(0.72 0.18 145)", border: "1px solid oklch(0.72 0.18 145 / 0.4)", borderRadius: 8, cursor: "pointer" }}>
            Validar assinatura
          </button>
          <button type="button" onClick={onRejeitar} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 500, background: "oklch(0.65 0.24 25 / 0.2)", color: "oklch(0.65 0.24 25)", border: "1px solid oklch(0.65 0.24 25 / 0.4)", borderRadius: 8, cursor: "pointer" }}>
            Rejeitar
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner de carregamento — exportado para o shell Contratos.tsx
// ---------------------------------------------------------------------------

export function Carregando() {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 }}>
      <Loader2 size={24} className="animate-spin" style={{ color: "oklch(0.7 0.18 220)" }} />
    </div>
  );
}
