/**
 * Diagnóstico das tools do app Rifas (canal externo) contra a OpenRouter.
 *
 * Regra da casa pós-incidente v207 (2026-08-02): schema de tool mal fechado
 * (array sem items, objeto sem properties) faz o Google devolver 400 no request
 * INTEIRO — derruba toda mensagem do canal. Toda tool nova valida aqui ANTES
 * do deploy.
 *
 * Rodar: OPENROUTER_API_KEY=... deno run -A supabase/functions/tests/diagnostico-tools-rifa.test.ts
 */

const chave = Deno.env.get("OPENROUTER_API_KEY") ?? "";

// Espelho fiel dos schema_zod semeados em ferramentas_dinamicas (2026-08-03).
const tools = [
  {
    type: "function",
    function: {
      name: "consultar_rifa",
      description:
        "Consulta a rifa ATIVA do tenant: prêmio, preço por número, quantos números restam, promoções, cotas premiadas e link da página.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "vender_numeros_rifa",
      description:
        "RESERVA números da rifa ativa pro lead e devolve números + valor + chave PIX + link de acompanhamento.",
      parameters: {
        type: "object",
        required: ["quantidade"],
        properties: {
          quantidade: { type: "integer", description: "Quantos números o lead quer" },
          numeros_especificos: {
            type: "array",
            items: { type: "integer" },
            description: "Números exatos escolhidos (opcional; se vier, ignora quantidade)",
          },
          nome_comprador: { type: "string", description: "Nome do lead (opcional)" },
        },
      },
    },
  },
];

console.log("tamanho do JSON de tools:", JSON.stringify(tools).length, "chars");

if (!chave) {
  console.log("sem OPENROUTER_API_KEY — só a inspeção estática rodou.");
} else {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-pro-preview-customtools",
      messages: [
        { role: "system", content: "Você é um vendedor no WhatsApp." },
        { role: "user", content: "quero 5 números da rifa" },
      ],
      tools,
      tool_choice: "auto",
    }),
  });
  const txt = await r.text();
  console.log("status:", r.status);
  console.log(txt.slice(0, 600));
}
