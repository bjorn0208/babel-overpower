// Classifica o callback de presença do Z-API ("Chat status" / on-chat-presence).
//
// Doc oficial (https://developer.z-api.io/webhooks/on-chat-presence-examples):
// callback tem `type:"PresenceChatCallback"` e `status` em MAIÚSCULO:
//   COMPOSING (digitando) · RECORDING (gravando áudio) · PAUSED (parou de
//   digitar) · UNAVAILABLE (saiu do chat) · AVAILABLE (entrou/online).
//
// Bug corrigido (2026-05-18): o webhook comparava minúsculo
// ("composing"/"paused"/"available") → nunca batia → `estado_digitacao`
// ficava zerada. Além disso tratava AVAILABLE como "parou de digitar", o
// que é errado: AVAILABLE = só ficou online, não estava digitando.
//
// Semântica para o buffer de debounce:
//   produzindo  → lead ainda está falando (digitando/gravando): PAUSA a
//                 contagem do buffer (não responde enquanto ele compõe).
//   parou       → lead parou/saiu: REINICIA a contagem + retoma entregas.
//   entrou_chat → só presença online; NÃO mexe no buffer (neutro).

export type TipoPresenca = "produzindo" | "parou" | "entrou_chat" | null;

type PresencaPayload = {
  type?: string;
  status?: string | null;
  presence?: string | null;
};

export function classificarPresence(payload: PresencaPayload): TipoPresenca {
  const ehPresenca = payload?.type === "PresenceChatCallback" ||
    payload?.status != null || payload?.presence != null;
  if (!ehPresenca) return null;

  const bruto = String(payload.status ?? payload.presence ?? "")
    .trim()
    .toUpperCase();
  if (!bruto) return null;

  switch (bruto) {
    case "COMPOSING":
    case "TYPING":
    case "RECORDING":
      return "produzindo";
    case "PAUSED":
    case "PAUSADA":
    case "UNAVAILABLE":
      return "parou";
    case "AVAILABLE":
      return "entrou_chat";
    default:
      // Ex.: MessageStatusCallback (SENT/RECEIVED/READ) — não é presença.
      return null;
  }
}
