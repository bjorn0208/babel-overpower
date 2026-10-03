/**
 * MarcaEmpresa — cabeçalho white-label do pré-join da sala pública.
 * Banner do tenant com fade pro fundo, logo, nome, descrição curta e
 * chips de destaque (vindos de info_sala_publica).
 */

import { cor } from "@/apps/user/reuniao/reuniao-ui";

export type InfoMarca = {
  empresa_nome?: string | null;
  empresa_logo_url?: string | null;
  empresa_banner_url?: string | null;
  empresa_descricao?: string | null;
  empresa_cidade?: string | null;
  empresa_estado?: string | null;
  empresa_headline?: string | null;
  empresa_chips?: string[] | null;
};

export default function MarcaEmpresa({ marca }: { marca: InfoMarca }) {
  const nome = marca.empresa_nome?.trim();
  if (!nome) return null;

  const destaque = marca.empresa_headline?.trim() || marca.empresa_descricao?.trim() || "";
  const chips = Array.isArray(marca.empresa_chips) ? marca.empresa_chips.slice(0, 3) : [];
  const local = [marca.empresa_cidade, marca.empresa_estado].filter(Boolean).join(" · ");

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {marca.empresa_banner_url && (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "clamp(96px, 18vw, 160px)",
            overflow: "hidden",
          }}
        >
          <img
            src={marca.empresa_banner_url}
            alt=""
            aria-hidden
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to bottom, oklch(0.11 0.025 264 / 0.15), ${cor.fundo})`,
            }}
          />
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: marca.empresa_banner_url ? "0 24px" : "18px 24px 0",
          marginTop: marca.empresa_banner_url ? -28 : 0,
          position: "relative",
          flexWrap: "wrap",
        }}
      >
        {marca.empresa_logo_url ? (
          <img
            src={marca.empresa_logo_url}
            alt={`Logo de ${nome}`}
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              objectFit: "cover",
              border: `2px solid ${cor.fundo}`,
              background: cor.tile,
              flexShrink: 0,
            }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span
            style={{ fontSize: 16, fontWeight: 700, color: cor.texto1, letterSpacing: "-0.01em" }}
          >
            {nome}
          </span>
          {(destaque || local) && (
            <span
              style={{
                fontSize: 12.5,
                color: cor.texto2,
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {destaque || local}
            </span>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 24px 0" }}>
          {chips.map((chip) => (
            <span
              key={chip}
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                color: cor.texto2,
                border: `1px solid ${cor.borda}`,
                borderRadius: 999,
                padding: "4px 12px",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
