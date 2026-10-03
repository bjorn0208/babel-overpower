// Painel "Mensagem do lead que gerou este prompt" (extraído de VisaoConstrucao
// para manter os arquivos ≤300 linhas — inviolável §11). Comportamento idêntico.

import type { MensagemReal } from "./tipos-replay";

interface Props {
  msgs: MensagemReal[];
}

export default function MensagemLeadTurno({ msgs }: Props) {
  return (
    <div style={{ padding: "4px 16px 0" }}>
      <div
        style={{
          background: "oklch(0.14 0.02 240)",
          border: "1px solid oklch(0.24 0.03 240)",
          borderRadius: 10,
          padding: "10px 12px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "oklch(0.55 0.06 240)",
            marginBottom: 7,
          }}
        >
          Mensagem do lead que gerou este prompt
        </div>
        {msgs.length === 0 ? (
          <div style={{ fontSize: 12, color: "oklch(0.55 0.04 240)" }}>
            Sem mensagem do lead nesta janela — turno proativo (o agente
            iniciou o contato) ou a msg ficou fora do recorte deste turno.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {msgs.map((m) => (
              <div
                key={m.id}
                style={{
                  background: "oklch(0.30 0.10 145)",
                  border: "1px solid oklch(0.42 0.12 145)",
                  borderRadius: "10px 10px 10px 3px",
                  padding: "7px 11px",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "oklch(0.94 0.02 145)",
                  maxWidth: "80%",
                  alignSelf: "flex-start",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.content || "(mídia / sem texto)"}
              </div>
            ))}
            {msgs.length > 1 && (
              <span style={{ fontSize: 10.5, color: "oklch(0.5 0.04 240)" }}>
                {msgs.length} mensagens agrupadas pelo buffer neste turno
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
