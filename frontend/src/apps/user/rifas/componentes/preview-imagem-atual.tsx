/**
 * Botão + modal pra ver a cartela atual (a mesma que o cron-status-rifa
 * mantém atualizada de hora em hora e que os agendamentos de foto usam).
 *
 * Arena (2026-09-12): texto em token, imagem com o filete de `.ar-comprovante`.
 */

import { useState } from "react";
import { Botao } from "./botao";
import { Modal } from "./modal";
import { obterImagemAtual } from "../dados-disparos";

export const PreviewImagemAtual = ({ rifaId }: { rifaId: string }) => {
  const [aberto, setAberto] = useState(false);
  const [url, setUrl] = useState<string | null | "carregando">(null);

  const abrir = async () => {
    setAberto(true);
    setUrl("carregando");
    try {
      setUrl(await obterImagemAtual(rifaId));
    } catch {
      setUrl(null);
    }
  };

  return (
    <>
      <Botao tamanho="sm" variante="fantasma" onClick={() => void abrir()}>
        🖼 Ver imagem atual
      </Botao>
      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Imagem atual da rifa"
        tamanho="md"
      >
        {url === "carregando" ? (
          <p className="ar-txt-3 text-sm py-8 text-center">Carregando…</p>
        ) : url ? (
          <img
            src={url}
            alt="Cartela atual da rifa"
            className="ar-comprovante"
          />
        ) : (
          <p className="ar-txt-3 text-sm py-8 text-center">
            Ainda não tem cartela gerada — o cron atualiza de hora em hora.
          </p>
        )}
      </Modal>
    </>
  );
};
