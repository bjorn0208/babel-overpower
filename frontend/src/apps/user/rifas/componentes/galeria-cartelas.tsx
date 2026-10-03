/**
 * Galeria das cartelas geradas pelo cron-status-rifa (atualizada de hora em
 * hora). Só leitura — a criação/edição de arte saiu da aba Imagens (extinta);
 * aqui é só o histórico visual do que já foi/está sendo postado no Status.
 *
 * Arena (2026-09-12): grade de miniaturas `.ar-galeria` sobre fundo escuro.
 */

import { useEffect, useState } from "react";
import { listarGaleria, type ArteRifa } from "../dados-imagens";

export const GaleriaCartelas = ({ rifaId }: { rifaId: string }) => {
  const [imagens, setImagens] = useState<ArteRifa[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!rifaId) return;
    setCarregando(true);
    listarGaleria(rifaId)
      .then((lista) => setImagens(lista.filter((a) => a.tipo === "cartela")))
      .finally(() => setCarregando(false));
  }, [rifaId]);

  if (!rifaId) return null;

  return (
    <div className="space-y-3">
      <h3>Galeria (atualizada de hora em hora)</h3>
      {carregando ? (
        <p className="ar-txt-3 text-sm">Carregando…</p>
      ) : imagens.length === 0 ? (
        <p className="ar-txt-3 text-sm">Ainda sem cartelas geradas.</p>
      ) : (
        <div className="ar-galeria">
          {imagens.map((img) => (
            <a key={img.id} href={img.url} target="_blank" rel="noreferrer" className="ar-galeria__item">
              <img
                src={img.url}
                alt={img.legenda ?? "Cartela da rifa"}
                className="ar-galeria__img"
              />
              <span className="ar-galeria__data ar-num">
                {new Date(img.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
