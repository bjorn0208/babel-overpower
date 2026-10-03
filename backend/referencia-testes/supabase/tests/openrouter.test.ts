/**
 * tests/openrouter.test.ts
 *
 * Testes de `chamarLlmComTools` portado pra `_shared/openrouter.ts`.
 *
 * Padrão CJS-safe: async function main() + main().catch(...) — sem top-level await.
 * `fetch` e `criarClienteAdmin` injetados via DI/stub — não faz chamada real.
 *
 * Casos:
 *   (a) sem tool_calls → texto_final = conteúdo da resposta
 *   (b) 1 tool_call → chama executarTool, reinjeta resultado, 2ª resposta vira texto_final
 *   (c) estoura max_iter → fallback sem tools (última chamada sem tools)
 *   (d) executarTool lança → resultado vira string de erro, loop não derruba
 */

import { strict as assert } from "node:assert";

// ---------------------------------------------------------------------------
// Helpers de stub
// ---------------------------------------------------------------------------

/** Cria um fake criarClienteAdmin que retorna um Supabase fake com api_key. */
function fakeAdmin(apiKey = "chave-fake") {
  return () => ({
    from(_tabela: string) {
      return {
        select(_cols: string) { return this; },
        eq(_col: string, _val: unknown) { return this; },
        limit(_n: number) { return this; },
        single() {
          return Promise.resolve({ data: { api_key: apiKey }, error: null });
        },
      };
    },
  });
}

/** Cria um fake criarClienteAdmin que simula credencial ausente. */
function fakeAdminSemChave() {
  return () => ({
    from(_tabela: string) {
      return {
        select(_cols: string) { return this; },
        eq(_col: string, _val: unknown) { return this; },
        limit(_n: number) { return this; },
        single() {
          return Promise.resolve({ data: null, error: { message: "not found" } });
        },
      };
    },
  });
}

/** Cria um fake fetch que devolve respostas em sequência. */
function fakeFetch(respostas: Array<{ ok: boolean; body: unknown; status?: number }>) {
  let idx = 0;
  return async (_url: string, _opts: unknown): Promise<unknown> => {
    const resp = respostas[idx] ?? respostas[respostas.length - 1];
    idx++;
    if (!resp.ok) {
      const text = JSON.stringify(resp.body);
      return {
        ok: false,
        status: resp.status ?? 500,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(resp.body),
      };
    }
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(resp.body)),
      json: () => Promise.resolve(resp.body),
    };
  };
}

/** Monta um body de resposta OpenRouter sem tool_calls (resposta final). */
function respostaTexto(conteudo: string) {
  return {
    choices: [{ message: { content: conteudo, tool_calls: undefined } }],
  };
}

/** Monta um body de resposta OpenRouter com 1 tool_call. */
function respostaComTool(id: string, nome: string, args: Record<string, unknown>) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: [{ id, type: "function", function: { name: nome, arguments: JSON.stringify(args) } }],
      },
    }],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Import dinâmico lazy — tsx carrega sem precisar resolver jsr:/Deno.
  const { chamarLlmComTools } = await import("../functions/_shared/openrouter.ts");

  // ── (a) sem tool_calls → texto_final = conteúdo da resposta ──────────────
  {
    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "oi" }],
        max_iter: 3,
      },
      {
        fetch: fakeFetch([{ ok: true, body: respostaTexto("olá mundo") }]) as typeof fetch,
        criarClienteAdmin: fakeAdmin(),
      },
    );
    assert.equal(resp.texto_final, "olá mundo");
    assert.deepEqual(resp.tool_calls_executados, []);
  }

  // ── (b) 1 tool_call → chama executarTool, reinjeta, 2ª resp vira texto ──
  {
    const toolsChamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
    const executarTool = async (nome: string, args: Record<string, unknown>) => {
      toolsChamadas.push({ nome, args });
      return `resultado da ${nome}`;
    };

    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "execute tool" }],
        tools: [{ type: "function", function: { name: "minha_tool", description: "test", parameters: {} } }],
        max_iter: 3,
        executarTool,
      },
      {
        fetch: fakeFetch([
          { ok: true, body: respostaComTool("tc-1", "minha_tool", { param: "val" }) },
          { ok: true, body: respostaTexto("depois da tool, aqui está o texto final") },
        ]) as typeof fetch,
        criarClienteAdmin: fakeAdmin(),
      },
    );

    assert.equal(resp.texto_final, "depois da tool, aqui está o texto final");
    assert.equal(resp.tool_calls_executados.length, 1);
    assert.equal(resp.tool_calls_executados[0].nome, "minha_tool");
    assert.deepEqual(resp.tool_calls_executados[0].args, { param: "val" });
    assert.equal(resp.tool_calls_executados[0].resultado, "resultado da minha_tool");
    assert.equal(toolsChamadas.length, 1);
    assert.equal(toolsChamadas[0].nome, "minha_tool");
  }

  // ── (c) estoura max_iter → fallback sem tools (última chamada sem tools) ──
  {
    // max_iter=2: 2 iterações com tool_calls → fallback na 3ª chamada
    const fetch3 = fakeFetch([
      { ok: true, body: respostaComTool("tc-1", "t1", {}) },
      { ok: true, body: respostaComTool("tc-2", "t1", {}) },
      { ok: true, body: respostaTexto("fallback após max_iter") },
    ]);

    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "loop" }],
        tools: [{ type: "function", function: { name: "t1", description: "t", parameters: {} } }],
        max_iter: 2,
        executarTool: async () => "ok",
      },
      {
        fetch: fetch3 as typeof fetch,
        criarClienteAdmin: fakeAdmin(),
      },
    );

    assert.equal(resp.texto_final, "fallback após max_iter");
    assert.equal(resp.tool_calls_executados.length, 2);
  }

  // ── (d) executarTool lança → resultado vira string de erro, loop continua ──
  {
    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "tool quebrada" }],
        tools: [{ type: "function", function: { name: "tool_quebrada", description: "q", parameters: {} } }],
        max_iter: 3,
        executarTool: async (_nome: string) => {
          throw new Error("tool explodiu");
        },
      },
      {
        fetch: fakeFetch([
          { ok: true, body: respostaComTool("tc-err", "tool_quebrada", {}) },
          { ok: true, body: respostaTexto("mesmo com erro, continuo aqui") },
        ]) as typeof fetch,
        criarClienteAdmin: fakeAdmin(),
      },
    );

    // Loop não derrubou — retornou texto_final normalmente
    assert.equal(resp.texto_final, "mesmo com erro, continuo aqui");
    assert.equal(resp.tool_calls_executados.length, 1);
    // Resultado do erro capturado como string, não re-throw
    assert.ok(resp.tool_calls_executados[0].resultado.includes("tool explodiu"));
  }

  // ── (e) raciocínio EN vazado como resposta → descarta e re-pede em PT-BR ──
  // Exemplo REAL do banco (mentor_mensagens, 2026-08-02 20:27 UTC): raciocínio
  // em inglês citando dados PT com acento ("sócio") — o detector antigo caía
  // no falso-negativo por causa do acento da citação.
  {
    const raciocinio =
      "I see that the `produtos` table has the prices 297 and 497 already updated. " +
      "The `produto_conhecimento` table has the text correctly updated to:\n" +
      "- CPF: R$ 297\n- CNPJ com 1 sócio: R$ 497\n\n" +
      "I can just confirm to the user that yes, the values are already updated correctly.";
    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "os valores foram atualizados?" }],
        max_iter: 3,
      },
      {
        fetch: fakeFetch([
          { ok: true, body: respostaTexto(raciocinio) },
          { ok: true, body: respostaTexto("Confirmado: os valores já estão atualizados nas duas tabelas.") },
        ]) as typeof fetch,
        criarClienteAdmin: fakeAdmin(),
      },
    );
    assert.equal(resp.texto_final, "Confirmado: os valores já estão atualizados nas duas tabelas.");
  }

  // ── (f) raciocínio EN com bloco de código PT (acento no código) → idem ──
  // Exemplo REAL do banco (2026-08-02 20:31 UTC): "It updated correctly!" +
  // citação da CLÁUSULA do contrato dentro de ``` — acento só na citação.
  {
    const raciocinio =
      "It updated correctly!\nThe `conteudo` in the response clearly shows:\n" +
      "```\nCLÁUSULA 3ª — DO VALOR E PAGAMENTO\nO valor do serviço contratado é:\n" +
      "- Mapa do Crédito — CPF: R$ 297,00;\n```";
    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "atualizou o contrato?" }],
        max_iter: 3,
      },
      {
        fetch: fakeFetch([
          { ok: true, body: respostaTexto(raciocinio) },
          { ok: true, body: respostaTexto("Atualizado: a cláusula 3ª já está com os valores novos.") },
        ]) as typeof fetch,
        criarClienteAdmin: fakeAdmin(),
      },
    );
    assert.equal(resp.texto_final, "Atualizado: a cláusula 3ª já está com os valores novos.");
  }

  // ── (g) resposta legítima PT-BR com citação de valores → passa intacta ──
  {
    let chamadas = 0;
    const contadorFetch = (base: ReturnType<typeof fakeFetch>) =>
      (async (url: string, opts: unknown) => {
        chamadas++;
        return base(url, opts);
      }) as typeof fetch;
    const legitima =
      "Ainda não. Verifiquei que o template do contrato ainda está com os valores antigos.\n\n" +
      "Preciso da sua aprovação para alterar os valores no contrato.\n\n" +
      "**Como está hoje no contrato:**\n" +
      '"- Mapa do Crédito — CPF: R$ 147,00;\n- Mapa do Crédito PJ (CNPJ + 1 sócio): R$ 247,00;"';
    const resp = await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "como está o contrato?" }],
        max_iter: 3,
      },
      {
        fetch: contadorFetch(fakeFetch([{ ok: true, body: respostaTexto(legitima) }])),
        criarClienteAdmin: fakeAdmin(),
      },
    );
    assert.equal(resp.texto_final, legitima);
    assert.equal(chamadas, 1, "resposta legítima não pode disparar re-pedido");
  }

  // ── (h) toda chamada manda reasoning.exclude=true no body ──
  {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchCapturando = (async (_url: string, opts: { body: string }) => {
      bodies.push(JSON.parse(opts.body));
      return {
        ok: true,
        status: 200,
        text: () => Promise.resolve(""),
        json: () => Promise.resolve(respostaTexto("olá")),
      };
    }) as typeof fetch;
    await chamarLlmComTools(
      {
        modelo: "google/gemini-3.1-flash-lite",
        mensagens: [{ role: "user", content: "oi" }],
        max_iter: 3,
      },
      { fetch: fetchCapturando, criarClienteAdmin: fakeAdmin() },
    );
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0].reasoning, { exclude: true });
  }

  console.log("openrouter.test.ts OK — 8 casos passaram.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
