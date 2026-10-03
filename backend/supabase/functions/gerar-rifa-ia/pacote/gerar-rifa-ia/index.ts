/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// gerar-rifa-ia — botão "preencher com IA" do wizard de criar rifa (teste,
// Theus vai remover depois). Recebe uma dica opcional em texto livre e
// devolve um rascunho completo pra preencher os 3 passos do wizard de uma
// vez. verify_jwt=true — só o painel chama.

import { chamarLlmComTools } from "../_shared/openrouter.ts";
import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteUsuarioDoRequest } from "../_shared/supabase.ts";

const MODELO = "google/gemini-2.5-flash";

const PROMPT_SISTEMA = `Você gera dados de TESTE fictícios pra uma rifa online. Responda SOMENTE com um objeto JSON (sem markdown, sem texto fora do JSON) no formato:

{
  "titulo": "string curta e chamativa",
  "descricao": "1-2 frases sobre a rifa",
  "premio_principal": "string, ex: 'iPhone 15 Pro 256GB'",
  "premios_extras": ["string", "..."],
  "total_numeros": number (100, 500, 1000 ou 10000),
  "preco_numero_centavos": number (inteiro, ex: 500 = R$5,00),
  "promocoes": [{"qtd": number, "preco_total_centavos": number}],
  "metodo_sorteio": um de "loteria_federal" | "plataforma" | "ppt" | "ptm" | "pt_rio" | "ptv" | "ptn" | "corujinha",
  "dias_ate_sorteio": number (1 a 30),
  "max_numeros_por_pedido": number (ex: 50),
  "minutos_reserva": number (ex: 30)
}

Dados fictícios, plausíveis, em pt-BR. Nunca invente marca real de forma difamatória — use produtos genéricos populares (celular, moto, TV, etc).`;

function extrairJson(bruto: string): Record<string, unknown> {
  const tentativas = [
    bruto,
    bruto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""),
    bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1),
  ];
  for (const t of tentativas) {
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    } catch { /* tenta a próxima forma */ }
  }
  throw new Error("Resposta do modelo não é JSON válido.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const clienteUser = criarClienteUsuarioDoRequest(req);
    if (!clienteUser) return jsonRes({ ok: false, erro: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await clienteUser.auth.getUser();
    if (authErr || !user) return jsonRes({ ok: false, erro: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as { prompt?: string };
    const dica = body.prompt?.trim();

    const mensagens = [
      { role: "system" as const, content: PROMPT_SISTEMA },
      { role: "user" as const, content: dica ? `Dica do usuário: ${dica}` : "Gere uma rifa de teste qualquer." },
    ];

    const r = await chamarLlmComTools({ modelo: MODELO, mensagens, max_iter: 1 });
    const rascunho = extrairJson(r.texto_final);

    return jsonRes({ ok: true, rascunho });
  } catch (e) {
    console.error("gerar-rifa-ia erro:", e);
    return jsonRes({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
