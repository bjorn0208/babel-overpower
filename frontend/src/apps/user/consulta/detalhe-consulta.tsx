/**
 * DetalheConsulta — painel expandido de uma consulta no histórico.
 * Carregando — spinner exportado para o shell Consulta.tsx.
 */

import { Loader2 } from "lucide-react";
import { Linha, Vazio } from "./re-exports";
import { formatBRL, mascaraDoc } from "./re-exports";
import { LaudoConsulta } from "./laudo-consulta";
import type { Consulta } from "./tipos";

// ---------------------------------------------------------------------------
// Detalhe expandido
// ---------------------------------------------------------------------------

export function DetalheConsulta({
  c,
  link,
}: {
  c: Consulta;
  link: string;
}) {
  const anexos = [
    { rotulo: "Selfie do solicitante", url: c.url_selfie ?? "" },
    { rotulo: "Documento do solicitante", url: c.url_documento ?? "" },
    { rotulo: "Comprovante de pagamento", url: c.url_comprovante_pagamento ?? "" },
  ].filter((a) => a.url.trim().length > 0);

  return (
    <div
      style={{
        padding: 14,
        marginTop: 6,
        marginBottom: 8,
        background: "oklch(0.18 0.06 280 / 0.3)",
        borderRadius: 12,
        border: "1px solid oklch(0.98 0 0 / 0.05)",
      }}
    >
      {/* Grid de metadados */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 11 }}>
        <Linha k="ID público" v={(c.chave_publica ?? "").slice(0, 8) + "..."} />
        <Linha
          k="Link público"
          v={
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "oklch(0.7 0.18 220)", textDecoration: "underline" }}
            >
              abrir
            </a>
          }
        />
        <Linha k="Tipo do documento" v={c.tipo_doc ? c.tipo_doc.toUpperCase() : "—"} />
        <Linha k="Documento" v={c.documento ? mascaraDoc(c.documento) : "—"} />
        <Linha k="Custo" v={c.custo != null ? formatBRL(c.custo) : "—"} />
        <Linha k="Preço cobrado" v={c.preco != null ? formatBRL(c.preco) : "—"} />
        <Linha k="Criado em" v={new Date(c.created_at).toLocaleString("pt-BR")} />
        <Linha
          k="Consultado em"
          v={c.consultada_em ? new Date(c.consultada_em).toLocaleString("pt-BR") : "—"}
        />
        {c.erro_motivo && (
          <Linha
            k="Motivo do erro"
            v={
              <span style={{ color: "oklch(0.65 0.24 25)" }}>{c.erro_motivo}</span>
            }
          />
        )}
      </div>

      {/* Anexos */}
      {anexos.length > 0 && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid oklch(0.98 0 0 / 0.06)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              opacity: 0.75,
              marginBottom: 8,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            Anexos enviados · {anexos.length}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {anexos.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 8,
                  background: "oklch(0.18 0.06 280 / 0.4)",
                  borderRadius: 8,
                  border: "1px solid oklch(0.98 0 0 / 0.08)",
                  textDecoration: "none",
                }}
              >
                <img
                  src={a.url}
                  alt={a.rotulo}
                  style={{
                    width: "100%",
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 6,
                    background: "oklch(0.12 0.04 280)",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    color: "oklch(0.98 0 0 / 0.55)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  {a.rotulo}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Resultado da consulta */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid oklch(0.98 0 0 / 0.06)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            opacity: 0.75,
            marginBottom: 8,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          Resultado
        </div>
        {c.resultado ? (
          <LaudoConsulta resultado={c.resultado} />
        ) : (
          <Vazio mensagem="Resultado ainda não disponível" pequeno />
        )}
      </div>

      {/* Botões de ação */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {c.pdf_url && (
          <a
            href={c.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 500,
              background: "oklch(0.7 0.18 220 / 0.2)",
              color: "oklch(0.7 0.18 220)",
              border: "1px solid oklch(0.7 0.18 220 / 0.4)",
              borderRadius: 8,
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            Baixar PDF
          </a>
        )}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 500,
            background: "oklch(0.98 0 0 / 0.06)",
            color: "oklch(0.98 0 0 / 0.75)",
            border: "1px solid oklch(0.98 0 0 / 0.1)",
            borderRadius: 8,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          Abrir link público
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner de carregamento — exportado para o shell Consulta.tsx
// ---------------------------------------------------------------------------

export function Carregando() {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
      }}
    >
      <Loader2 size={24} className="animate-spin" style={{ color: "oklch(0.7 0.18 220)" }} />
    </div>
  );
}
