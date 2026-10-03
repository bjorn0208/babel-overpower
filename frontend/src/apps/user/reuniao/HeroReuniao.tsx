/**
 * HeroReuniao — cabeçalho do lobby estilo Google Meet:
 * "Nova reunião" + "Agendar" + campo "cole um link ou código" pra entrar
 * em qualquer sala pelo navegador.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Keyboard, Video } from "lucide-react";
import { cor, estiloInput } from "./reuniao-ui";

type Props = {
  criandoSala: boolean;
  onNovaReuniao: () => void;
  onAgendar: () => void;
};

/** Aceita link completo ou chave crua e devolve a chave da sala. */
function extrairChave(entrada: string): string | null {
  const limpo = entrada.trim();
  if (!limpo) return null;
  const m = limpo.match(/\/sala\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{4,}$/.test(limpo)) return limpo;
  return null;
}

export default function HeroReuniao({ criandoSala, onNovaReuniao, onAgendar }: Props) {
  const [codigoEntrada, setCodigoEntrada] = useState("");

  function entrarComCodigo() {
    const chave = extrairChave(codigoEntrada);
    if (!chave) {
      toast.warning("Cole um link válido ou o código da sala.");
      return;
    }
    window.location.assign(`${window.location.origin}/sala/${chave}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 4 }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: cor.texto1,
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        Reuniões por vídeo, direto da plataforma
      </h1>
      <p style={{ fontSize: 13.5, color: cor.texto2, margin: 0, maxWidth: 480, lineHeight: 1.5 }}>
        Crie uma sala em um clique e compartilhe o link — quem recebe entra pelo navegador, sem
        conta.
      </p>
      <div
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}
      >
        <button
          type="button"
          className="reu-btn reu-btn-primario"
          onClick={onNovaReuniao}
          disabled={criandoSala}
        >
          <Video size={17} aria-hidden />
          {criandoSala ? "Criando sala…" : "Nova reunião"}
        </button>
        <button type="button" className="reu-btn reu-btn-secundario" onClick={onAgendar}>
          <CalendarPlus size={16} aria-hidden /> Agendar
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: "1 1 240px",
            maxWidth: 360,
            position: "relative",
          }}
        >
          <Keyboard
            size={17}
            aria-hidden
            style={{ position: "absolute", left: 14, color: cor.texto3, pointerEvents: "none" }}
          />
          <input
            type="text"
            className="reu-input"
            placeholder="Cole um link ou código"
            value={codigoEntrada}
            onChange={(e) => setCodigoEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") entrarComCodigo();
            }}
            style={{ ...estiloInput, borderRadius: 999, padding: "10px 14px 10px 40px" }}
            aria-label="Link ou código da sala"
          />
          {codigoEntrada.trim() && (
            <button
              type="button"
              className="reu-btn reu-btn-secundario"
              onClick={entrarComCodigo}
              style={{ flexShrink: 0 }}
            >
              Entrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
