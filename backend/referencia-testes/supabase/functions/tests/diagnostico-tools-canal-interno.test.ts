/**
 * Diagnóstico do catálogo de tools do canal interno (2026-08-02).
 *
 * Motivo: após os tijolos do CommandBar, todo turno do canal interno passou a
 * devolver 500 em ~2s (antes da resposta da LLM). Suspeita: o payload de tools
 * ficou inválido/grande demais pro modelo custom-tools.
 *
 * Rodar: OPENROUTER_API_KEY=... deno run -A supabase/functions/tests/diagnostico-tools-canal-interno.test.ts
 */
import { TOOLS_MENTOR } from "../_shared/tools-mentor.ts";

const chave = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const modelo = "google/gemini-3.1-pro-preview-customtools";

console.log("tools no catálogo:", TOOLS_MENTOR.length);
console.log("tamanho do JSON de tools:", JSON.stringify(TOOLS_MENTOR).length, "chars");
for (const t of TOOLS_MENTOR) {
  const d = t.function.description ?? "";
  if (d.length > 1024) console.log("  descrição longa:", t.function.name, d.length);
}

if (!chave) {
  console.log("sem OPENROUTER_API_KEY — só a inspeção estática rodou.");
} else {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: "Você é o Mentor." },
        { role: "user", content: "quantos clientes eu tive esse mês?" },
      ],
      tools: TOOLS_MENTOR,
      tool_choice: "auto",
    }),
  });
  const txt = await r.text();
  console.log("status:", r.status);
  console.log(txt.slice(0, 900));
}
