/**
 * Modal de compartilhar a rifa (Arena, 2026-09-12): cartão da rifa, atalhos
 * das redes em botões de contorno e o link público num cartão alto com Copiar.
 */

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { fmtBRL, fmtData } from "../formato";
import { urlRifa } from "@/lib/url-app";
import type { Rifa } from "../tipos";
import { Modal } from "./modal";

export interface ModalCompartilharProps {
  aberto: boolean;
  aoFechar: () => void;
  rifa?: Rifa | null;
  aoNotificar?: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

const redes = [
  { id: "whatsapp", rotulo: "WhatsApp", icone: "M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21 M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1" },
  { id: "instagram", rotulo: "Instagram", icone: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z M17.5 6.5v0" },
  { id: "telegram", rotulo: "Telegram", icone: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z" },
  { id: "facebook", rotulo: "Facebook", icone: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" },
  { id: "twitter", rotulo: "Twitter/X", icone: "M4 4l7.2 9.6L4.5 20h2.6l5.4-5.2L17 20h3l-7.5-10L19 4h-2.6l-4.8 4.8L7 4H4z" },
] as const;

// Mesma cara do `Botao` variante `contorno` — aqui precisa ser <a> de verdade
// (abre em aba nova, o Instagram usa o sheet nativo pelo onClick do link).
const CLASSE_ATALHO =
  "inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-[var(--ar-r-lg)] text-sm font-medium whitespace-nowrap transition-[transform,background] duration-150 active:scale-[0.97]";
const ESTILO_ATALHO = { boxShadow: "inset 0 0 0 1px var(--ar-filete-forte)", color: "var(--ar-txt-1)" };

export const ModalCompartilhar = ({ aberto, aoFechar, rifa, aoNotificar }: ModalCompartilharProps) => {
  const [copiado, setCopiado] = useState(false);

  const url = rifa ? urlRifa(rifa.chave_publica) : window.location.href;
  const mensagem = rifa
    ? `🎁 ${rifa.titulo} — ${rifa.premio_principal}!\n\n🎟️ Apenas ${fmtBRL(rifa.preco_numero_centavos)} por número.${
        rifa.data_sorteio_prevista ? `\n📅 Sorteio: ${fmtData(rifa.data_sorteio_prevista)}` : ""
      }\n\n👉 ${url}`
    : `Confira esta rifa: ${url}`;

  const linkDe = (rede: string) => {
    const texto = encodeURIComponent(mensagem);
    const urlCod = encodeURIComponent(url);
    switch (rede) {
      case "whatsapp":
        return `https://wa.me/?text=${texto}`;
      case "instagram":
        // O Instagram NÃO tem endpoint web de compartilhamento (o antigo
        // /share é 404 — era o bug). O caminho real é a Web Share API
        // (sheet nativo no celular → Stories/Direct); ver aoClicarRede.
        return "https://www.instagram.com/";
      case "telegram":
        return `https://t.me/share/url?url=${urlCod}&text=${texto}`;
      case "facebook":
        return `https://www.facebook.com/sharer/sharer.php?u=${urlCod}`;
      case "twitter":
        return `https://twitter.com/intent/tweet?text=${texto}`;
      default:
        return url;
    }
  };

  // Instagram: compartilha pelo sheet nativo (mobile). Sem Web Share API
  // (desktop), copia a mensagem pronta e abre o Instagram pra colar.
  const aoClicarRede = async (e: React.MouseEvent<HTMLAnchorElement>, rede: string) => {
    if (rede !== "instagram") return;
    e.preventDefault();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: rifa?.titulo ?? "Rifa", text: mensagem, url });
        return;
      } catch {
        // usuário cancelou o sheet — não abre nada
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(mensagem);
      aoNotificar?.("Mensagem copiada! Cole no seu Story ou Direct do Instagram.", "success");
    } catch {
      aoNotificar?.("Não consegui copiar — copie o link manualmente.", "error");
    }
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      aoNotificar?.("Link copiado!", "success");
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      aoNotificar?.("Não consegui copiar — copie manualmente.", "error");
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Compartilhar rifa" subtitulo={rifa?.titulo || "Compartilhe o link público"} tamanho="md">
      <div className="space-y-6">
        {rifa && (
          <div className="ar-cartao ar-cartao--alto ar-cartao--compacto flex items-center gap-4">
            <span className="ar-capa">
              {rifa.imagem_url ? <img src={rifa.imagem_url} alt={rifa.titulo} /> : <span aria-hidden>🎟️</span>}
            </span>
            <div className="min-w-0">
              <p className="font-medium ar-txt-1 leading-tight truncate">{rifa.titulo}</p>
              <div className="ar-scroll-x mt-2">
                <span className="ar-chip-num">
                  <span className="ar-chip-num__rotulo">números</span>
                  <span className="ar-chip-num__valor">{rifa.total_numeros}</span>
                </span>
                <span className="ar-chip-num">
                  <span className="ar-chip-num__rotulo">cada</span>
                  <span className="ar-chip-num__valor">{fmtBRL(rifa.preco_numero_centavos)}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Redes */}
        <div>
          <p className="ar-rotulo mb-2">Compartilhar em</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {redes.map((r) => (
              <a
                key={r.id}
                href={linkDe(r.id)}
                onClick={(e) => void aoClicarRede(e, r.id)}
                target="_blank"
                rel="noopener noreferrer"
                className={CLASSE_ATALHO}
                style={ESTILO_ATALHO}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={r.icone} />
                </svg>
                {r.rotulo}
              </a>
            ))}
          </div>
        </div>

        {/* Copiar link */}
        <div>
          <p className="ar-rotulo mb-2">Link público</p>
          <div className="ar-cartao ar-cartao--alto ar-cartao--compacto flex items-center gap-3 flex-wrap">
            <span className="ar-num text-sm ar-txt-2 flex-1 min-w-0 break-all">{url}</span>
            <button
              type="button"
              onClick={() => void copiarLink()}
              className="inline-flex items-center justify-center gap-2 min-h-[40px] px-3.5 rounded-[var(--ar-r-lg)] text-sm font-medium shrink-0 transition-[transform,background] duration-150 active:scale-[0.97]"
              style={
                copiado
                  ? { background: "var(--ar-ok-vidro)", color: "var(--ar-ok)" }
                  : { background: "var(--ar-cartao)", color: "var(--ar-txt-1)" }
              }
            >
              {copiado ? <Check size={15} /> : <Copy size={15} />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="text-xs ar-txt-4 mt-2">É por esse link que os compradores escolhem os números e pagam.</p>
        </div>
      </div>
    </Modal>
  );
};
