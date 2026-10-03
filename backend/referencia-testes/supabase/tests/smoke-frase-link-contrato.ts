/**
 * Smoke A/B — a frase de retorno da tool de contrato faz o agente colar a URL?
 *
 * Reproduz FIELMENTE o caminho de síntese do motor `ragentic-processar-inline`:
 *  - mesmo modelo (google/gemini-3.1-flash-lite), temperature 0.6, max_tokens 1400
 *  - tool_choice forçado na 1ª iteração (como o Porteiro faz), "auto" depois
 *  - tool-result devolvido como role:"tool" com JSON.stringify({ok,dados,mensagem})
 *
 * Única variável testada: o campo `mensagem` do resultado — VELHA vs NOVA.
 * Mede em quantas runs o texto final do agente contém a URL do contrato.
 *
 * Rodar:
 *   deno run --allow-net --allow-env --env-file=.env.local tests/smoke-frase-link-contrato.ts
 *
 * A chave OpenRouter vem de OPENROUTER_API_KEY (env) — nunca é impressa.
 */

const MODELO = "google/gemini-3.1-flash-lite";
const BASE = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
const KEY = Deno.env.get("OPENROUTER_API_KEY");
if (!KEY) {
  console.error("Falta OPENROUTER_API_KEY no env (.env.local).");
  Deno.exit(1);
}

const N = Number(Deno.env.get("N_RUNS") ?? "20");

const LINK = "https://www.plataformalimpa.com.br/contrato/ff601ec4-5334-4509-9fc6-0bf4e6cdb50f";

// VELHA — exatamente como está hoje em tools-internas.ts:88
const FRASE_VELHA = `Link do contrato pro lead assinar: ${LINK}`;

// NOVA — ordem imperativa: o link só chega se o agente escrever a URL no texto
const FRASE_NOVA =
  `AÇÃO OBRIGATÓRIA NA SUA PRÓXIMA MENSAGEM AO LEAD: o contrato NÃO é enviado por nenhum sistema — ` +
  `o link só chega ao lead se VOCÊ escrever a URL completa dentro da sua resposta. ` +
  `Cole exatamente esta URL, inteira, para o lead abrir e assinar: ${LINK} . ` +
  `Nunca diga apenas que "enviei" ou "já mandei" — isso deixa o lead sem o link. Escreva a URL no texto.`;

function resultadoJSON(frase: string): string {
  return JSON.stringify({
    ok: true,
    dados: { link: LINK, canal: "whatsapp", contrato_id: "00000000-0000-0000-0000-000000000000" },
    mensagem: frase,
  });
}

// System prompt aproximado do Agente Vivo, enriquecido com elementos CONFIRMADOS no motor real
// (bolhas curtas semânticas + tag <pensamento_estruturado> obrigatória no fim + tom conciso),
// que competem por atenção. Deliberadamente SEM regra "cole a URL" — é o que falta em produção.
const SYSTEM =
  `Você é a Lia, consultora de um serviço de limpa-nome, atendendo um lead pelo WhatsApp.\n` +
  `Fale em pt-BR, tom humano, caloroso e NATURAL — como uma pessoa de verdade no WhatsApp.\n` +
  `Seja conciso. Quebre a resposta em bolhas curtas: cada ideia distinta numa bolha, separadas por ` +
  `linha em branco. Não seja prolixo nem robótico, não repita o que já é óbvio.\n` +
  `Seu objetivo é fechar: quando o lead aceita avançar, gere o contrato com a ferramenta ` +
  `gerar_contrato e conduza o lead a assinar.\n` +
  `Você pode acionar ferramentas. Depois que uma ferramenta roda, você recebe o resultado e deve ` +
  `continuar a conversa com o lead em linguagem natural — nunca escreva JSON, tags de ferramenta ` +
  `ou nomes de função no texto visível.\n\n` +
  `OBRIGATÓRIO: termine TODA resposta com a tag de pensamento, exatamente neste formato, após o texto ao lead:\n` +
  `<pensamento_estruturado>{"leitura_da_situacao":"...","proxima_intencao":"...","acao_pretendida":"fechar","quando_voltar":null,"motivo":"...","plano_proximos_2_turnos":[]}</pensamento_estruturado>`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "gerar_contrato",
      description:
        "Gera o contrato do lead a partir do molde do tenant e do carrinho da conversa, e devolve o link de assinatura.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  // deno-lint-ignore no-explicit-any
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

// deno-lint-ignore no-explicit-any
async function chamar(messages: Msg[], tool_choice: any): Promise<{ texto: string; tool_calls: any[] | null }> {
  // deno-lint-ignore no-explicit-any
  const corpo: any = {
    model: MODELO,
    messages,
    temperature: 0.6,
    max_tokens: 1400,
    tools: TOOLS.map((t) => ({ type: t.type, function: t.function })),
    tool_choice: tool_choice ?? "auto",
  };
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://plataformalimpa.com.br",
      "X-Title": "smoke-frase-link-contrato",
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  const msg = j.choices?.[0]?.message ?? {};
  return { texto: (msg.content as string) ?? "", tool_calls: msg.tool_calls ?? null };
}

let exemploSemUrl = "";
async function umaRun(frase: string): Promise<{ colou: boolean; motivo: string }> {
  const messages: Msg[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "perfeito, pode gerar o contrato e me mandar pra eu assinar agora" },
  ];

  // iter 0 — Porteiro força a tool gerar_contrato
  const r0 = await chamar(messages, { type: "function", function: { name: "gerar_contrato" } });
  if (!r0.tool_calls?.length) {
    // não chamou a tool mesmo forçado — conta como falha (lead não recebe link)
    const colou = (r0.texto || "").includes(LINK) || (r0.texto || "").includes("/contrato/");
    return { colou, motivo: colou ? "texto_iter0_com_link" : "nao_chamou_tool" };
  }

  messages.push({ role: "assistant", content: r0.texto || null, tool_calls: r0.tool_calls });
  for (const tc of r0.tool_calls) {
    messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function?.name, content: resultadoJSON(frase) });
  }

  // iterações "auto" até o modelo produzir texto final (resolve casos em que ele re-chama a tool)
  for (let iter = 0; iter < 3; iter++) {
    const r = await chamar(messages, "auto");
    if (r.tool_calls?.length) {
      messages.push({ role: "assistant", content: r.texto || null, tool_calls: r.tool_calls });
      for (const tc of r.tool_calls) {
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function?.name, content: resultadoJSON(frase) });
      }
      continue;
    }
    const texto = r.texto || "";
    const colou = texto.includes(LINK) || texto.includes("/contrato/");
    if (!colou && !exemploSemUrl) exemploSemUrl = texto.replace(/<pensamento_estruturado>[\s\S]*$/i, "").trim();
    return { colou, motivo: colou ? "ok" : "prometeu_sem_url" };
  }
  return { colou: false, motivo: "sem_texto_final" };
}

async function rodarVariante(nome: string, frase: string) {
  exemploSemUrl = "";
  let colou = 0;
  const motivos: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    try {
      const r = await umaRun(frase);
      if (r.colou) colou++;
      motivos[r.motivo] = (motivos[r.motivo] ?? 0) + 1;
    } catch (e) {
      motivos["erro"] = (motivos["erro"] ?? 0) + 1;
      console.error(`  [${nome} run ${i}] erro: ${(e as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  const pct = ((colou / N) * 100).toFixed(0);
  console.log(`\n== ${nome} ==`);
  console.log(`  colou a URL: ${colou}/${N} (${pct}%)`);
  console.log(`  motivos: ${JSON.stringify(motivos)}`);
  if (exemploSemUrl) console.log(`  ex. sem URL: "${exemploSemUrl.slice(0, 180)}"`);
  return { colou, N, pct };
}

console.log(`Modelo: ${MODELO} · temp 0.6 · ${N} runs por variante\n`);
const velha = await rodarVariante("FRASE VELHA (produção atual)", FRASE_VELHA);
const nova = await rodarVariante("FRASE NOVA (imperativa)", FRASE_NOVA);

console.log(`\n========================================`);
console.log(`VELHA: ${velha.colou}/${velha.N} (${velha.pct}%)  →  NOVA: ${nova.colou}/${nova.N} (${nova.pct}%)`);
console.log(`Baseline real de produção (3 dias): 5/26 (19%) entregue.`);
console.log(`========================================`);
