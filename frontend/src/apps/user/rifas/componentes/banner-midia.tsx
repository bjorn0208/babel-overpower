/**
 * Banner de mídia da RIFA ESPECÍFICA (Theus 26/08): capa + galeria (foto E
 * vídeo) girando no hero da rifa — antes só a capa aparecia e a galeria
 * ficava de fora do banner. Vídeo toca mudo em loop; com 2+ mídias entra
 * crossfade com pontinhos. Usado no detalhe do app e na vitrine pública.
 */

import { useEffect, useMemo, useState } from "react";
import { ehVideo } from "../formato";

export interface BannerMidiaRifaProps {
  capa?: string | null;
  galeria?: string[] | null;
  titulo: string;
  /** ms entre trocas (só com 2+ mídias). Vídeo ativo pausa a troca. */
  intervaloMs?: number;
  /** Preenche o pai (position:absolute inset:0) — modo fundo de hero. */
  comoFundo?: boolean;
}

export const BannerMidiaRifa = ({ capa, galeria, titulo, intervaloMs = 4500, comoFundo = false }: BannerMidiaRifaProps) => {
  const midias = useMemo(
    () => [...new Set([capa, ...(galeria ?? [])].filter((m): m is string => !!m))],
    [capa, galeria],
  );
  const [atual, setAtual] = useState(0);

  const videoAtivo = midias.length > 0 && ehVideo(midias[atual % midias.length]);
  useEffect(() => {
    if (midias.length < 2 || videoAtivo) return;
    const id = setInterval(() => setAtual((i) => (i + 1) % midias.length), intervaloMs);
    return () => clearInterval(id);
  }, [midias.length, videoAtivo, intervaloMs]);

  if (midias.length === 0) return null;

  return (
    <div className={comoFundo ? "absolute inset-0 overflow-hidden" : "relative w-full overflow-hidden rounded-2xl bg-black"} style={comoFundo ? undefined : { aspectRatio: "16 / 9" }}>
      {midias.map((m, i) => {
        const visivel = i === atual % midias.length;
        const estilo: React.CSSProperties = {
          opacity: visivel ? 1 : 0,
          transition: "opacity 0.9s ease-in-out",
        };
        return ehVideo(m) ? (
          <video
            key={m}
            src={m}
            muted
            loop
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={estilo}
            onEnded={() => setAtual((i2) => (i2 + 1) % midias.length)}
          />
        ) : (
          <img key={m} src={m} alt={titulo} draggable={false} className="absolute inset-0 w-full h-full object-cover" style={estilo} />
        );
      })}
      {midias.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {midias.map((m, i) => (
            <button
              key={m}
              type="button"
              aria-label={`Mídia ${i + 1}`}
              onClick={() => setAtual(i)}
              className="rounded-full"
              style={{
                width: 8,
                height: 8,
                background: i === atual % midias.length ? "#fff" : "rgba(255,255,255,0.45)",
                border: "none",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
