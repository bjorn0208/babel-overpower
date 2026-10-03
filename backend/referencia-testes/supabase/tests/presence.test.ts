import { strict as assert } from "node:assert";
import { classificarPresence } from "../functions/_shared/presence.ts";

// Z-API real: callback PresenceChatCallback, status UPPERCASE
assert.equal(
  classificarPresence({ type: "PresenceChatCallback", status: "COMPOSING" }),
  "produzindo",
);
assert.equal(
  classificarPresence({ type: "PresenceChatCallback", status: "RECORDING" }),
  "produzindo",
);
assert.equal(
  classificarPresence({ type: "PresenceChatCallback", status: "PAUSED" }),
  "parou",
);
assert.equal(
  classificarPresence({ type: "PresenceChatCallback", status: "UNAVAILABLE" }),
  "parou",
);
// AVAILABLE = entrou no chat (online) — NÃO é "parou de digitar" (corrige bug)
assert.equal(
  classificarPresence({ type: "PresenceChatCallback", status: "AVAILABLE" }),
  "entrou_chat",
);

// Defensivo: aceita minúsculo legado e campo `presence`
assert.equal(classificarPresence({ status: "composing" }), "produzindo");
assert.equal(classificarPresence({ presence: "typing" }), "produzindo");
assert.equal(classificarPresence({ status: "paused" }), "parou");

// Mensagem recebida normal (sem status/presence/type) → null (segue fluxo de msg)
assert.equal(classificarPresence({ phone: "5511999999999", text: "oi" }), null);
assert.equal(classificarPresence({}), null);

// MessageStatusCallback (SENT/READ) NÃO é presença → null (não classificar como parou/produzindo)
assert.equal(
  classificarPresence({ type: "MessageStatusCallback", status: "SENT" }),
  null,
);
assert.equal(
  classificarPresence({ type: "MessageStatusCallback", status: "READ" }),
  null,
);

console.log("presence: OK");
