/**
 * tests/canal-interno.test.ts
 *
 * Testes de `processarCanalInterno` (_shared/canal-interno.ts).
 *
 * Padrão CJS-safe: async function main() + main().catch(...) — sem top-level await.
 * DI total via `deps`: supabaseAdmin fake chainable, chamarLlm stub, recall stub.
 *
 * Casos:
 *   (a) conversa de outro owner → 404 (sem permissão)
 *   (b) fluxo feliz sem tool → grava user+assistant, retorna texto
 *   (c) tool `recall_entidade` status `unico` → injeta memória e responde
 *   (d) tool `recall_entidade` status `ambiguo` → resposta pede desambiguação
 *   (e) ehAdmin=false busca tipologia='mentor', ehAdmin=true busca 'admin'
 *   (f) cargo objetivo_principal vazio → usa só MOLDE_FORMATO (não quebra)
 */

import { strict as assert } from "node:assert";

// ---------------------------------------------------------------------------
// Fake client chainable (suporta o fluxo completo do canal-interno)
// ---------------------------------------------------------------------------

type FakeResult = { data?: unknown; error?: { message: string } | null };

/**
 * Cria um fake Supabase admin client.
 *
 * `respostas`: mapa tabela|"rpc:fn" → resultado.
 * Sequências: para respostas que mudam por chamada, passar array → respostas[0], [1], ...
 */
function fakeAdmin(respostas: Record<string, FakeResult | FakeResult[]>) {
  const chamadas: Array<{ op: string; tabela?: string; fn?: string; payload?: unknown; campos?: unknown }> = [];

  // Contadores por tabela (pra respostas em sequência)
  const contadores: Record<string, number> = {};

  function resolverResposta(chave: string): FakeResult {
    const r = respostas[chave];
    if (Array.isArray(r)) {
      const idx = contadores[chave] ?? 0;
      contadores[chave] = idx + 1;
      return r[idx] ?? r[r.length - 1];
    }
    return r ?? { data: null };
  }

  function builder(tabela: string): Record<string, unknown> {
    const b: Record<string, unknown> = {};

    b.insert = (payload: unknown) => {
      chamadas.push({ op: "insert", tabela, payload });
      return builder(tabela);
    };
    b.update = (campos: unknown) => {
      chamadas.push({ op: "update", tabela, campos });
      return builder(tabela);
    };
    b.select = (..._a: unknown[]) => builder(tabela);
    b.eq = (..._a: unknown[]) => builder(tabela);
    b.is = (..._a: unknown[]) => builder(tabela);
    b.order = (..._a: unknown[]) => builder(tabela);
    b.limit = (..._a: unknown[]) => builder(tabela);
    b.single = () => Promise.resolve(resolverResposta(tabela));
    b.maybeSingle = () => Promise.resolve(resolverResposta(tabela));
    // thenable pra `await sb.from(...).update(...).eq(...)` sem terminal explícito
    // deno-lint-ignore no-explicit-any
    (b as any).then = (resolve: (v: unknown) => void) => resolve(resolverResposta(tabela));

    return b;
  }

  return {
    chamadas,
    from(tabela: string) { return builder(tabela); },
    rpc(fn: string, args: unknown) {
      chamadas.push({ op: "rpc", fn, payload: args });
      return Promise.resolve(respostas[`rpc:${fn}`] ?? { data: null });
    },
  };
}

/** Stub de chamarLlm que devolve texto fixo sem ferramenta. */
function stubLlmTexto(texto: string) {
  return async (_params: unknown) => ({
    texto_final: texto,
    tool_calls_executados: [] as Array<{ nome: string; args: unknown; resultado: string }>,
  });
}

/** Stub de chamarLlm que simula 1 tool_call_executado e texto final. */
function stubLlmComTool(nomeTool: string, argsRetorno: unknown, textoFinal: string) {
  return async (_params: unknown) => ({
    texto_final: textoFinal,
    tool_calls_executados: [{ nome: nomeTool, args: argsRetorno, resultado: "ok" }],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { processarCanalInterno } = await import("../functions/_shared/canal-interno.ts");

  // ── (a) conversa de outro owner → 404 ────────────────────────────────────
  {
    // mentor_conversas retorna null (não encontrou a conversa deste owner)
    const admin = fakeAdmin({ mentor_conversas: { data: null, error: null } });
    const r = await processarCanalInterno(
      { mensagem: "oi", conversaId: "conv-X", userId: "uid-errado", ehAdmin: false, tenantId: "t1" },
      {
        supabaseAdmin: admin,
        chamarLlm: stubLlmTexto("não devia chegar aqui"),
      },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
    assert.ok(r.erro?.includes("Conversa não encontrada") || r.erro?.includes("permissão"));
    // Nenhum insert deve ter ocorrido
    assert.equal(admin.chamadas.filter((c) => c.op === "insert").length, 0);
  }

  // ── (b) fluxo feliz sem tool → grava user+assistant, retorna texto ────────
  {
    const admin = fakeAdmin({
      // mentor_conversas → encontrou
      mentor_conversas: { data: { id: "conv-1" }, error: null },
      // mentor_mensagens → histórico com 2 msgs (user+assistant para alternância)
      mentor_mensagens: {
        data: [
          { papel: "user", conteudo: "mensagem anterior" },
          { papel: "assistant", conteudo: "resposta anterior" },
        ],
        error: null,
      },
      // cargos → cargo mentor
      cargos: { data: { nome: "Mentor", objetivo_principal: "Ajudar tenants", regras_livres: null }, error: null },
    });

    const r = await processarCanalInterno(
      { mensagem: "nova pergunta", conversaId: "conv-1", userId: "uid-1", ehAdmin: false, tenantId: "t1" },
      {
        supabaseAdmin: admin,
        chamarLlm: stubLlmTexto("resposta do mentor"),
      },
    );

    assert.equal(r.ok, true);
    assert.equal(r.mensagem, "resposta do mentor");
    assert.deepEqual(r.tool_calls, []);

    // Deve ter inserido user primeiro, depois assistant
    const inserts = admin.chamadas.filter((c) => c.op === "insert" && c.tabela === "mentor_mensagens");
    assert.equal(inserts.length, 2);
    assert.equal((inserts[0].payload as Record<string, unknown>).papel, "user");
    assert.equal((inserts[1].payload as Record<string, unknown>).papel, "assistant");
    assert.equal((inserts[1].payload as Record<string, unknown>).conteudo, "resposta do mentor");

    // Deve ter atualizado atualizado_em da conversa
    const updates = admin.chamadas.filter((c) => c.op === "update" && c.tabela === "mentor_conversas");
    assert.equal(updates.length, 1);
  }

  // ── (c) tool `recall_entidade` status `unico` → injeta memória ──────────
  // O stub de chamarLlm chama executarTool diretamente (simula o que o loop real faz)
  // para provar que o interceptador de recall_entidade é acionado e o recall é chamado.
  {
    let recallChamado = false;
    const stubRecall = async (_admin: unknown, params: { tenantId: string; termo: string; leadId?: string | null; queryRecall?: string }) => {
      recallChamado = true;
      assert.equal(params.tenantId, "t1");
      assert.equal(params.termo, "André Marques");
      return {
        status: "unico" as const,
        entidades: [{ id: "lead-1", name: "André Marques", nome_exibicao: null, phone: "11999" }],
        fatosLead: [{ fato: "tem orçamento de R$ 5k" }],
        episodios: [],
      };
    };

    const admin = fakeAdmin({
      mentor_conversas: { data: { id: "conv-1" }, error: null },
      mentor_mensagens: { data: [], error: null },
      cargos: { data: { nome: "Mentor", objetivo_principal: "Ajudar", regras_livres: null }, error: null },
    });

    // Stub que simula o loop real: chama executarTool('recall_entidade') e usa o resultado
    // deno-lint-ignore no-explicit-any
    const stubLlmChamaRecall = async (params: { executarTool?: (n: string, a: any) => Promise<string> }) => {
      // Simula o LLM pedindo a tool recall_entidade
      const resultado = params.executarTool
        ? await params.executarTool("recall_entidade", { nome: "André Marques" })
        : "sem recall";
      return {
        texto_final: `Resposta com dados: ${resultado.slice(0, 30)}`,
        tool_calls_executados: [{ nome: "recall_entidade", args: { nome: "André Marques" }, resultado }],
      };
    };

    const r = await processarCanalInterno(
      { mensagem: "como tá o André Marques?", conversaId: "conv-1", userId: "uid-1", ehAdmin: false, tenantId: "t1" },
      {
        supabaseAdmin: admin,
        chamarLlm: stubLlmChamaRecall,
        recall: stubRecall,
      },
    );

    assert.equal(r.ok, true);
    assert.equal(recallChamado, true);
    assert.equal(r.tool_calls.length, 1);
    assert.equal(r.tool_calls[0].nome, "recall_entidade");
  }

  // ── (d) tool `recall_entidade` status `ambiguo` → resposta pede desambiguação ──
  {
    let recallChamado = false;
    const stubRecall = async (_admin: unknown, _params: { tenantId: string; termo: string; leadId?: string | null; queryRecall?: string }) => {
      recallChamado = true;
      return {
        status: "ambiguo" as const,
        entidades: [
          { id: "lead-1", name: "André Marques", nome_exibicao: null, phone: "11111" },
          { id: "lead-2", name: "André M. Silva", nome_exibicao: null, phone: "22222" },
        ],
        fatosLead: [],
        episodios: [],
      };
    };

    const admin = fakeAdmin({
      mentor_conversas: { data: { id: "conv-1" }, error: null },
      mentor_mensagens: { data: [], error: null },
      cargos: { data: { nome: "Mentor", objetivo_principal: "Ajudar", regras_livres: null }, error: null },
    });

    // deno-lint-ignore no-explicit-any
    const stubLlmChamaRecallAmbiguo = async (params: { executarTool?: (n: string, a: any) => Promise<string> }) => {
      const resultado = params.executarTool
        ? await params.executarTool("recall_entidade", { nome: "André" })
        : "sem recall";
      // resultado deve conter a lista de ambíguos (2 pessoas)
      return {
        texto_final: resultado.includes("2 pessoas") || resultado.includes("Encontrei 2") ? resultado : `Desambiguação necessária: ${resultado}`,
        tool_calls_executados: [{ nome: "recall_entidade", args: { nome: "André" }, resultado }],
      };
    };

    const r = await processarCanalInterno(
      { mensagem: "como tá o André?", conversaId: "conv-1", userId: "uid-1", ehAdmin: false, tenantId: "t1" },
      {
        supabaseAdmin: admin,
        chamarLlm: stubLlmChamaRecallAmbiguo,
        recall: stubRecall,
      },
    );

    assert.equal(r.ok, true);
    assert.equal(recallChamado, true);
    // O resultado da tool deve mencionar os 2 nomes ambíguos
    const toolResult = r.tool_calls[0]?.resultado ?? "";
    assert.ok(
      toolResult.includes("André Marques") && toolResult.includes("André M. Silva"),
      `Esperava nomes ambíguos no resultado, got: ${toolResult}`,
    );
  }

  // ── (e) ehAdmin=false → tipologia='mentor', ehAdmin=true → tipologia='admin' ──
  {
    const tipsConsultadas: string[] = [];

    // Admin especial que registra qual tipologia foi consultada
    function fakeAdminComTipologia(tipologiaEsperada: string) {
      const chamadas: Array<{ op: string; tabela?: string; payload?: unknown; campos?: unknown }> = [];

      function builder(tabela: string): Record<string, unknown> {
        const b: Record<string, unknown> = {};
        const filtros: Record<string, unknown> = {};

        b.insert = (payload: unknown) => { chamadas.push({ op: "insert", tabela, payload }); return builder(tabela); };
        b.update = (campos: unknown) => { chamadas.push({ op: "update", tabela, campos }); return builder(tabela); };
        b.select = (..._a: unknown[]) => builder(tabela);
        b.eq = (col: string, val: unknown) => {
          filtros[col] = val;
          if (tabela === "cargos" && col === "tipologia") tipsConsultadas.push(val as string);
          return builder(tabela);
        };
        b.is = (..._a: unknown[]) => builder(tabela);
        b.order = (..._a: unknown[]) => builder(tabela);
        b.limit = (..._a: unknown[]) => builder(tabela);
        b.single = () => {
          if (tabela === "mentor_conversas") return Promise.resolve({ data: { id: "conv-1" }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        b.maybeSingle = () => {
          if (tabela === "mentor_conversas") return Promise.resolve({ data: { id: "conv-1" }, error: null });
          if (tabela === "cargos") return Promise.resolve({ data: { nome: "Cargo " + tipologiaEsperada, objetivo_principal: "Obj", regras_livres: null }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        // deno-lint-ignore no-explicit-any
        (b as any).then = (resolve: (v: unknown) => void) => {
          if (tabela === "mentor_mensagens") return resolve({ data: [], error: null });
          resolve({ data: null, error: null });
        };

        return b;
      }

      return { chamadas, from(tabela: string) { return builder(tabela); }, rpc() { return Promise.resolve({ data: null }); } };
    }

    // Teste com ehAdmin=false → deve consultar 'mentor'
    tipsConsultadas.length = 0;
    await processarCanalInterno(
      { mensagem: "oi", conversaId: "conv-1", userId: "uid-1", ehAdmin: false, tenantId: "t1" },
      { supabaseAdmin: fakeAdminComTipologia("mentor"), chamarLlm: stubLlmTexto("ok") },
    );
    assert.ok(tipsConsultadas.includes("mentor"), `Esperava tipologia='mentor', got: ${JSON.stringify(tipsConsultadas)}`);
    assert.ok(!tipsConsultadas.includes("admin"), "Não devia consultar 'admin' quando ehAdmin=false");

    // Teste com ehAdmin=true → deve consultar 'admin'
    tipsConsultadas.length = 0;
    await processarCanalInterno(
      { mensagem: "oi", conversaId: "conv-1", userId: "uid-1", ehAdmin: true, tenantId: "t1" },
      { supabaseAdmin: fakeAdminComTipologia("admin"), chamarLlm: stubLlmTexto("ok") },
    );
    assert.ok(tipsConsultadas.includes("admin"), `Esperava tipologia='admin', got: ${JSON.stringify(tipsConsultadas)}`);
  }

  // ── (f) cargo objetivo_principal vazio → usa só MOLDE_FORMATO ─────────────
  {
    const admin = fakeAdmin({
      mentor_conversas: { data: { id: "conv-1" }, error: null },
      mentor_mensagens: { data: [], error: null },
      // cargo sem objetivo_principal
      cargos: { data: null, error: null },
    });

    let mensagensEnviadasAoLlm: unknown = null;
    const stubLlmCapturar = async (params: { mensagens: unknown[] }) => {
      mensagensEnviadasAoLlm = params.mensagens;
      return { texto_final: "resposta sem cargo", tool_calls_executados: [] };
    };

    const r = await processarCanalInterno(
      { mensagem: "oi", conversaId: "conv-1", userId: "uid-1", ehAdmin: false, tenantId: "t1" },
      { supabaseAdmin: admin, chamarLlm: stubLlmCapturar },
    );

    assert.equal(r.ok, true);
    assert.equal(r.mensagem, "resposta sem cargo");
    // System prompt deve conter apenas o MOLDE_FORMATO (sem cargo)
    // deno-lint-ignore no-explicit-any
    const msgs = mensagensEnviadasAoLlm as any[];
    assert.ok(Array.isArray(msgs), "mensagens deve ser array");
    const systemMsg = msgs.find((m: { role: string }) => m.role === "system");
    assert.ok(systemMsg, "deve ter mensagem system");
    // Sem cargo no prompt — não deve conter "Cargo ativo:"
    assert.ok(!systemMsg.content.includes("Cargo ativo:"), "não deve ter 'Cargo ativo:' quando cargo é null");
  }

  console.log("canal-interno.test.ts OK — 6 casos passaram.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
