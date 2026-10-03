/**
 * Avatar da notificação — identidade do contato no card.
 *
 * Ordem de fallback (degrada com graça):
 *  1. foto do WhatsApp (leads.url_foto_perfil) — quando existe e carrega
 *  2. iniciais do nome num disco com cor derivada do próprio nome (estável)
 *  3. disco neutro com o glifo do tipo — notificação legada/sem nome real
 *
 * Badge de tipo no canto recortado pelo fundo do card — diz a natureza
 * (WhatsApp / pediu humano / atendimento humano / concluído) num relance.
 */

import { useState } from "react";

type TipoVisual = "info" | "sucesso" | "erro" | "aviso";

interface AvatarNotifProps {
  fotoUrl?: string | null;
  titulo: string;
  /** Tipo bruto vindo do banco (handoff, conversa_humana, conversa_mensagem...). */
  tipoBruto?: string;
  tipoVisual: TipoVisual;
}

/** Cor de acento do badge por tipo bruto (verde WhatsApp, amber handoff, azul humano). */
const ACENTO: Record<string, string> = {
  conversa_mensagem: "oklch(0.72 0.17 155)",
  conversa_humana: "oklch(0.70 0.15 245)",
  handoff: "oklch(0.80 0.16 75)",
  contrato_assinado: "oklch(0.72 0.18 145)",
  comprovante_enviado: "oklch(0.72 0.18 145)",
};

const ACENTO_VISUAL: Record<TipoVisual, string> = {
  sucesso: "oklch(0.72 0.18 145)",
  erro: "oklch(0.68 0.22 25)",
  aviso: "oklch(0.80 0.16 75)",
  info: "oklch(0.70 0.06 264)",
};

/** Títulos genéricos (legado / sem nome real) — não viram iniciais. */
const GENERICOS = new Set([
  "Nova mensagem do contato",
  "Mensagem em atendimento humano",
  "Lead pediu atendimento humano",
  "Novo contato",
]);

function iniciais(nome: string): string {
  const limpo = (nome || "").trim();
  if (!limpo) return "?";
  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Hue estável a partir do nome — mesma pessoa, mesma cor (estilo WhatsApp). */
function hueDeNome(nome: string): number {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360;
  return h;
}

export function AvatarNotif({ fotoUrl, titulo, tipoBruto, tipoVisual }: AvatarNotifProps) {
  const [erroFoto, setErroFoto] = useState(false);
  const acento = (tipoBruto && ACENTO[tipoBruto]) || ACENTO_VISUAL[tipoVisual];
  const temFoto = !!fotoUrl && !erroFoto;
  const temNome = !!titulo && !GENERICOS.has(titulo.trim());
  const hue = hueDeNome(titulo || "?");

  // Sem foto e sem nome real: disco neutro com o glifo do tipo (na cor de acento).
  if (!temFoto && !temNome) {
    return (
      <div className="notif-avatar-wrap" aria-hidden="true">
        <div
          className="notif-avatar"
          style={{ background: "linear-gradient(150deg, oklch(0.24 0.03 264), oklch(0.17 0.03 264))" }}
        >
          <span className="notif-avatar-glyph" style={{ color: acento }}>
            <BadgeGlyph tipoBruto={tipoBruto} tipoVisual={tipoVisual} cor="currentColor" size={20} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="notif-avatar-wrap" aria-hidden="true">
      <div
        className="notif-avatar"
        style={
          temFoto
            ? undefined
            : {
                background: `linear-gradient(150deg, oklch(0.55 0.13 ${hue}), oklch(0.42 0.11 ${(hue + 40) % 360}))`,
              }
        }
      >
        {temFoto ? (
          <img src={fotoUrl as string} alt="" loading="lazy" onError={() => setErroFoto(true)} />
        ) : (
          <span className="notif-avatar-iniciais">{iniciais(titulo)}</span>
        )}
      </div>
      <span className="notif-avatar-badge" style={{ background: acento }}>
        <BadgeGlyph tipoBruto={tipoBruto} tipoVisual={tipoVisual} />
      </span>
    </div>
  );
}

function BadgeGlyph({
  tipoBruto,
  tipoVisual,
  cor = "#fff",
  size = 10,
}: {
  tipoBruto?: string;
  tipoVisual: TipoVisual;
  cor?: string;
  size?: number;
}) {
  if (tipoBruto === "conversa_mensagem") {
    // Glifo oficial do WhatsApp (fill).
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill={cor} aria-hidden="true">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01a1.09 1.09 0 0 0-.792.372c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
      </svg>
    );
  }
  if (tipoBruto === "handoff") {
    return (
      <svg viewBox="0 0 24 24" width={size + 1} height={size + 1} fill="none" stroke={cor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 11V6a2 2 0 0 0-4 0v5" />
        <path d="M14 10V4a2 2 0 0 0-4 0v6" />
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    );
  }
  if (tipoBruto === "conversa_humana") {
    return (
      <svg viewBox="0 0 24 24" width={size + 1} height={size + 1} fill="none" stroke={cor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (tipoVisual === "sucesso") {
    return (
      <svg viewBox="0 0 24 24" width={size + 1} height={size + 1} fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={cor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
