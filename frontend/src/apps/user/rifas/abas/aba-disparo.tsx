/**
 * Aba Disparo — lista de contatos do bom-dia (7h) + disparos automáticos
 * agendados (foto/texto/vídeo) com galeria e envios ao vivo. Composição de
 * componentes menores (limite de 300 linhas por arquivo).
 */

import { useState } from "react";
import { ListaContatosDisparo } from "../componentes/lista-contatos-disparo";
import { ComposerBomDia } from "../componentes/composer-bom-dia";
import { EditorAgendamentos } from "../componentes/editor-agendamentos";
import { LiveEnvios } from "../componentes/live-envios";
import { PreviewImagemAtual } from "../componentes/preview-imagem-atual";
import { GaleriaCartelas } from "../componentes/galeria-cartelas";
import { TemplatesMensagem } from "../componentes/templates-mensagem";
import { CheckinEnvios } from "../componentes/checkin-envios";

export interface AbaDisparoProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const AbaDisparo = ({ aoNotificar }: AbaDisparoProps) => {
  // Rifa efetiva pros agendamentos automáticos: a "rifa do dia" escolhida na
  // lista de contatos, ou a ativa mais recente do tenant (mesmo fallback do
  // cron-bom-dia-rifa) — repassada de baixo pra cima pelo componente da lista.
  const [rifaEfetiva, setRifaEfetiva] = useState("");

  return (
    <div className="max-w-3xl space-y-5">
      <ListaContatosDisparo aoNotificar={aoNotificar} aoRifaEfetivaMudar={setRifaEfetiva} />
      <ComposerBomDia aoNotificar={aoNotificar} />

      <div className="ar-secao space-y-2">
        <h2>✅ Check-in de hoje</h2>
        <CheckinEnvios />
      </div>

      <div className="ar-secao">
        <TemplatesMensagem aoNotificar={aoNotificar} />
      </div>

      {rifaEfetiva ? (
        <div className="ar-secao space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2>⏰ Disparos automáticos</h2>
            <PreviewImagemAtual rifaId={rifaEfetiva} />
          </div>
          <EditorAgendamentos rifaId={rifaEfetiva} aoNotificar={aoNotificar} />
          <LiveEnvios rifaId={rifaEfetiva} aoNotificar={aoNotificar} />
          <GaleriaCartelas rifaId={rifaEfetiva} />
        </div>
      ) : (
        <p className="ar-secao ar-txt-4 text-sm">
          Crie uma rifa ativa pra desbloquear os disparos automáticos.
        </p>
      )}
    </div>
  );
};
