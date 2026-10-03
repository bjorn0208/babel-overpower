/**
 * tests/tools-mentor.test.ts
 *
 * Testes dos handlers do Cargo Mentor (_shared/tools-mentor.ts).
 *
 * Padrão CJS-safe: async function main() + main().catch(...) — sem top-level await.
 * Fake client chainable com DI — não bate no banco real.
 *
 * Cobertura:
 *   - Escrita: produto, cliente, categoria, bloco, anotação, empresa
 *   - Leitura: kpi, dashboard, listar leads
 *   - RPC: contrato livre, template contrato
 *   - Regex: detectarPlaceholders (vários formatos)
 *   - Dispatcher: executarTool (dispatch + tool desconhecida)
 *   - UI-only: abrir_app, abrir_app_os, mostrar_desktop
 */

import { strict as assert } from "node:assert";

// Import dinâmico lazy pra isolar jsr: do tsx (mesmo padrão de recall-memoria.ts).
// tsx/node não resolve "jsr:@supabase/supabase-js@2" — o módulo usa SupabaseClient
// apenas como tipo, mas o import estático no topo do .ts seria resolvido em runtime.
// Com import dinâmico dentro da função main(), o tsx carrega o módulo só quando
// executado — e como o fake client satisfaz a interface em duck-typing, funciona.

// ---------------------------------------------------------------------------
// Fake client chainable
// ---------------------------------------------------------------------------

type FakeResult = { data?: unknown; error?: { message: string } | null; count?: number };

/**
 * Cria um fake Supabase client que registra chamadas e devolve respostas fixas.
 *
 * Suporta:
 *   - .from(tabela).insert(payload).select("id").single()
 *   - .from(tabela).update(campos).eq(col, val)
 *   - .from(tabela).select(...).eq(...).is(...).order(...).limit(N)  → { data, error }
 *   - .from(tabela).select("id", { count: "exact", head: true }).eq(...).gte(...)  → { count, error }
 *   - .rpc(fn, args)  → { data, error }
 *   - Promise.all([...]) com múltiplos selects em paralelo
 *
 * `respostas`: mapa { "tabela" | "rpc:fn" → FakeResult }
 */
function fakeSupabase(respostas: Record<string, FakeResult>) {
  const chamadas: Array<{ op: string; tabela?: string; fn?: string; payload?: unknown; campos?: unknown }> = [];

  function builder(tabela: string, pendingInsert?: unknown, pendingUpdate?: unknown): Record<string, unknown> {
    const b: Record<string, unknown> = {};

    b.insert = (payload: unknown) => {
      chamadas.push({ op: "insert", tabela, payload });
      return builder(tabela, payload);
    };
    b.update = (campos: unknown) => {
      chamadas.push({ op: "update", tabela, campos });
      return builder(tabela, undefined, campos);
    };
    b.select = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.eq = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.is = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.not = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.gte = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.lte = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.order = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.limit = (..._args: unknown[]) => builder(tabela, pendingInsert, pendingUpdate);
    b.maybeSingle = () => {
      const r = respostas[tabela] ?? { data: null };
      return Promise.resolve(r);
    };
    b.single = () => {
      const r = respostas[tabela] ?? { data: { id: "fake-id" } };
      return Promise.resolve(r);
    };
    // Tornando o builder thenable (para await direto em update/eq chain)
    // deno-lint-ignore no-explicit-any
    (b as any).then = (resolve: (v: unknown) => void) => {
      const r = respostas[tabela] ?? { data: null };
      resolve(r);
    };

    return b;
  }

  return {
    chamadas,
    from(tabela: string) {
      return builder(tabela);
    },
    rpc(fn: string, args: unknown) {
      chamadas.push({ op: "rpc", fn, payload: args });
      return Promise.resolve(respostas[`rpc:${fn}`] ?? { data: null });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(sb: ReturnType<typeof fakeSupabase>, user_id = "uid-teste") {
  // deno-lint-ignore no-explicit-any
  return { user_id, supabase_admin: sb as any };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Import dinâmico lazy — tsx carrega sem precisar resolver jsr:
  const {
    handlerAbrirApp,
    handlerAbrirAppOs,
    handlerAtualizarEmpresa,
    handlerCadastrarBlocoConhecimento,
    handlerCadastrarProduto,
    handlerCriarAnotacaoMentor,
    handlerCriarCategoria,
    handlerCriarCliente,
    handlerCriarTemplateContrato,
    handlerDashboardResumo,
    handlerGerarLinkContratoLivre,
    handlerListarLeadsRecentes,
    handlerMostrarDesktop,
    handlerMostrarKpi,
    detectarPlaceholders,
    executarTool,
  } = await import("../functions/_shared/tools-mentor.ts");

  // ── 1. handlerCadastrarProduto ────────────────────────────────────────────

  // 1a. nome obrigatório
  {
    const sb = fakeSupabase({});
    const r = await handlerCadastrarProduto({}, ctx(sb));
    assert.ok(r.includes("✗"), "produto sem nome deve falhar");
    assert.ok(r.includes("obrigatório"));
  }

  // 1b. inserção com campos opcionais
  {
    const sb = fakeSupabase({ produtos: { data: { id: "prod-1" } } });
    const r = await handlerCadastrarProduto(
      { nome: "Serviço Limpeza", descricao: "desc", categoria_id: "cat-1" },
      ctx(sb),
    );
    assert.ok(r.includes("✓"), "produto deve retornar sucesso");
    assert.ok(r.includes("Serviço Limpeza"));
    const ins = sb.chamadas.find((c) => c.op === "insert" && c.tabela === "produtos");
    assert.ok(ins, "deve inserir na tabela produtos");
    const payload = ins!.payload as Record<string, unknown>;
    assert.equal(payload.nome, "Serviço Limpeza");
    assert.equal(payload.owner_id, "uid-teste");
    assert.equal(payload.descricao_curta, "desc");
    assert.equal(payload.tipo_produto_id, "cat-1");
  }

  // 1c. erro de banco
  {
    const sb = fakeSupabase({ produtos: { data: null, error: { message: "unique violation" } } });
    const r = await handlerCadastrarProduto({ nome: "X" }, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("unique violation"));
  }

  // ── 2. handlerCriarCliente ────────────────────────────────────────────────

  // 2a. nome + telefone obrigatórios
  {
    const sb = fakeSupabase({});
    const r = await handlerCriarCliente({ nome: "João" }, ctx(sb));
    assert.ok(r.includes("✗"));
  }

  // 2b. inserção correta
  {
    const sb = fakeSupabase({ clientes: { data: { id: "cli-1" } } });
    const r = await handlerCriarCliente(
      { nome: "Maria Silva", telefone: "11999990000", email: "maria@ex.com" },
      ctx(sb),
    );
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("Maria Silva"));
    const ins = sb.chamadas.find((c) => c.op === "insert" && c.tabela === "clientes");
    assert.ok(ins);
    const payload = ins!.payload as Record<string, unknown>;
    assert.equal(payload.nome, "Maria Silva");
    assert.equal(payload.telefone, "11999990000");
    assert.equal(payload.email, "maria@ex.com");
    assert.equal(payload.owner_id, "uid-teste");
  }

  // ── 3. handlerCriarCategoria ──────────────────────────────────────────────

  // 3a. nome obrigatório
  {
    const sb = fakeSupabase({});
    const r = await handlerCriarCategoria({}, ctx(sb));
    assert.ok(r.includes("✗"));
  }

  // 3b. inserção com descrição opcional
  {
    const sb = fakeSupabase({ categorias_produto: { data: { id: "cat-99" } } });
    const r = await handlerCriarCategoria(
      { nome: "Residencial", descricao: "Serviços residenciais" },
      ctx(sb),
    );
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("Residencial"));
    const ins = sb.chamadas.find((c) => c.op === "insert" && c.tabela === "categorias_produto");
    assert.ok(ins);
    const payload = ins!.payload as Record<string, unknown>;
    assert.equal(payload.nome, "Residencial");
    assert.equal(payload.descricao, "Serviços residenciais");
    assert.equal(payload.owner_id, "uid-teste");
  }

  // ── 4. handlerCadastrarBlocoConhecimento ─────────────────────────────────

  // 4a. titulo + conteudo obrigatórios
  {
    const sb = fakeSupabase({});
    const r = await handlerCadastrarBlocoConhecimento({ titulo: "X" }, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("obrigatórios"));
  }

  // 4b. agente não encontrado → falha com mensagem clara
  {
    const sb = fakeSupabase({ agentes: { data: null } });
    const r = await handlerCadastrarBlocoConhecimento(
      { titulo: "FAQ Preços", conteudo: "Nossos preços são...", escopo: "tenant" },
      ctx(sb),
    );
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("Agente do tenant não encontrado"));
  }

  // 4c. inserção correta com agente resolvido
  {
    const sb = fakeSupabase({
      agentes: { data: { id: "agente-42" } },
      blocos_conhecimento: { data: { id: "bloco-1" } },
    });
    const r = await handlerCadastrarBlocoConhecimento(
      { titulo: "Política de Cancelamento", conteudo: "Para cancelar...", escopo: "tenant" },
      ctx(sb),
    );
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("Política de Cancelamento"));
    const ins = sb.chamadas.find((c) => c.op === "insert" && c.tabela === "blocos_conhecimento");
    assert.ok(ins);
    const payload = ins!.payload as Record<string, unknown>;
    assert.equal(payload.title, "Política de Cancelamento");
    assert.equal(payload.content, "Para cancelar...");
    assert.equal(payload.agente_id, "agente-42");
    assert.equal(payload.escopo, "tenant");
    assert.equal(payload.tipo, "conhecimento");
    assert.equal(payload.ativo, true);
    assert.equal(payload.embedding_status, "pendente");
  }

  // ── 5. handlerCriarAnotacaoMentor ────────────────────────────────────────

  // 5a. conteudo obrigatório
  {
    const sb = fakeSupabase({});
    const r = await handlerCriarAnotacaoMentor({}, ctx(sb));
    assert.ok(r.includes("✗"));
  }

  // 5b. inserção com tags
  {
    const sb = fakeSupabase({ mentor_anotacoes: { data: { id: "anot-1" } } });
    const r = await handlerCriarAnotacaoMentor(
      { conteudo: "Tenant quer integração com ERP", tags: ["erp", "integração"] },
      ctx(sb),
    );
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.acao, "anotacao_criada");
    const ins = sb.chamadas.find((c) => c.op === "insert" && c.tabela === "mentor_anotacoes");
    assert.ok(ins);
    const payload = ins!.payload as Record<string, unknown>;
    assert.equal(payload.conteudo, "Tenant quer integração com ERP");
    assert.equal(payload.owner_id, "uid-teste");
    assert.deepEqual(payload.tags, ["erp", "integração"]);
  }

  // 5c. tags ausentes → array vazio
  {
    const sb = fakeSupabase({ mentor_anotacoes: { data: { id: "anot-2" } } });
    await handlerCriarAnotacaoMentor({ conteudo: "Nota sem tags" }, ctx(sb));
    const ins = sb.chamadas.find((c) => c.op === "insert" && c.tabela === "mentor_anotacoes");
    assert.ok(ins);
    const payload = ins!.payload as Record<string, unknown>;
    assert.deepEqual(payload.tags, []);
  }

  // ── 6. handlerAtualizarEmpresa ────────────────────────────────────────────

  // 6a. nenhum campo → falha
  {
    const sb = fakeSupabase({});
    const r = await handlerAtualizarEmpresa({}, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("Nenhum campo"));
  }

  // 6b. atualização com campos mapeados corretamente
  {
    const sb = fakeSupabase({ empresas: { data: null, error: null } });
    const r = await handlerAtualizarEmpresa(
      { nome_fantasia: "Limpeza Total", cnpj: "12.345.678/0001-90", endereco: "Rua A, 1", telefone: "1133334444" },
      ctx(sb),
    );
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("Empresa atualizada"));
    const upd = sb.chamadas.find((c) => c.op === "update" && c.tabela === "empresas");
    assert.ok(upd);
    const campos = upd!.campos as Record<string, unknown>;
    assert.equal(campos.nome, "Limpeza Total");
    assert.equal(campos.cnpj, "12.345.678/0001-90");
    assert.equal(campos.endereco, "Rua A, 1");
    assert.equal(campos.whatsapp, "1133334444");
    assert.ok(typeof campos.updated_at === "string", "updated_at deve ser ISO string");
  }

  // ── 7. handlerMostrarKpi ─────────────────────────────────────────────────

  // 7a. retorna JSON estruturado com tipo grafico_kpi
  {
    const sb = fakeSupabase({ leads: { count: 5, data: null } });
    const r = await handlerMostrarKpi({ metrica: "leads_quentes", periodo: "7d" }, ctx(sb));
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.tipo, "grafico_kpi");
    assert.equal(parsed.dados.metrica, "leads_quentes");
    assert.equal(parsed.dados.periodo, "7d");
    // série temporal: 7d → 7 pontos
    assert.equal(parsed.dados.serie_temporal.length, 7);
    // último ponto = valor real
    assert.equal(parsed.dados.serie_temporal[6].valor, 5);
  }

  // 7b. taxa_conversao calcula porcentagem
  {
    // Primeiro select retorna total=10, segundo retorna conv=4
    // Como o fake não distingue selects encadeados, usamos count fixo
    const sb = fakeSupabase({ leads: { count: 10, data: null } });
    const r = await handlerMostrarKpi({ metrica: "taxa_conversao", periodo: "30d" }, ctx(sb));
    const parsed = JSON.parse(r);
    assert.equal(parsed.dados.tipo, "grafico_kpi");
    assert.ok(parsed.mensagem.includes("%"));
  }

  // ── 8. handlerListarLeadsRecentes ────────────────────────────────────────

  // 8a. retorna JSON estruturado com tipo lista_leads
  {
    const leads = [
      { id: "l1", name: "João", phone: "11999", lead_temperature: "quente", pipeline_stage: "negociacao", updated_at: "2026-05-18" },
    ];
    const sb = fakeSupabase({ leads: { data: leads } });
    const r = await handlerListarLeadsRecentes({ filtro: "quente", limite: 5 }, ctx(sb));
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.tipo, "lista_leads");
    assert.equal(parsed.dados.leads.length, 1);
    assert.equal(parsed.mensagem, "1 lead(s) encontrado(s).");
  }

  // 8b. erro de banco
  {
    const sb = fakeSupabase({ leads: { data: null, error: { message: "timeout" } } });
    const r = await handlerListarLeadsRecentes({}, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("timeout"));
  }

  // ── 9. handlerDashboardResumo ─────────────────────────────────────────────

  // 9a. retorna JSON com 5 cards
  {
    const sb = fakeSupabase({
      leads: { count: 100, data: null },
      conversas: { count: 8, data: null },
      mensagens: { count: 200, data: null },
    });
    const r = await handlerDashboardResumo({}, ctx(sb));
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.tipo, "dashboard");
    assert.equal(parsed.dados.cards.length, 5);
    // Títulos dos cards (fiel ao original)
    const titulos = parsed.dados.cards.map((c: { titulo: string }) => c.titulo);
    assert.ok(titulos.includes("Total de leads"));
    assert.ok(titulos.includes("Leads quentes"));
    assert.ok(titulos.includes("Conversas ativas"));
    assert.ok(titulos.includes("Msgs hoje"));
    assert.ok(titulos.includes("Conversões no mês"));
  }

  // ── 10. handlerGerarLinkContratoLivre ─────────────────────────────────────

  // 10a. texto obrigatório
  {
    const sb = fakeSupabase({});
    const r = await handlerGerarLinkContratoLivre({}, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("obrigatório"));
  }

  // 10b. RPC criar_contrato_livre chamado com params corretos
  {
    const sb = fakeSupabase({
      "rpc:criar_contrato_livre": { data: [{ id: "cont-1", chave_publica: "abc123" }] },
    });
    const r = await handlerGerarLinkContratoLivre(
      { texto: "Contrato de limpeza...", titulo: "Limpeza Residencial", lead_id: "lead-1", conversa_id: "conv-1" },
      ctx(sb),
    );
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.tipo, "link_contrato");
    assert.equal(parsed.dados.chave_publica, "abc123");
    assert.equal(parsed.dados.url_publica, "/contrato/abc123");
    const rpc = sb.chamadas.find((c) => c.op === "rpc" && c.fn === "criar_contrato_livre");
    assert.ok(rpc);
    const args = rpc!.payload as Record<string, unknown>;
    assert.equal(args.p_texto, "Contrato de limpeza...");
    assert.equal(args.p_titulo, "Limpeza Residencial");
    assert.equal(args.p_lead_id, "lead-1");
    assert.equal(args.p_conversa_id, "conv-1");
    assert.deepEqual(args.p_dados_cliente, {});
    assert.equal(args.p_origem, "mestre_livre");
  }

  // 10c. RPC retorna null → falha
  {
    const sb = fakeSupabase({ "rpc:criar_contrato_livre": { data: null } });
    const r = await handlerGerarLinkContratoLivre({ texto: "X" }, ctx(sb));
    assert.ok(r.includes("✗"));
  }

  // ── 11. handlerCriarTemplateContrato ──────────────────────────────────────

  // 11a. nome obrigatório
  {
    const sb = fakeSupabase({});
    const r = await handlerCriarTemplateContrato({ texto: "Contrato..." }, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("nome do template"));
  }

  // 11b. texto obrigatório
  {
    const sb = fakeSupabase({});
    const r = await handlerCriarTemplateContrato({ nome: "Modelo A" }, ctx(sb));
    assert.ok(r.includes("✗"));
    assert.ok(r.includes("texto do template"));
  }

  // 11c. RPC criar_template_a_partir_de_texto chamado com placeholders detectados
  {
    const sb = fakeSupabase({
      "rpc:criar_template_a_partir_de_texto": {
        data: [{ id: "tmpl-1", chunks_rag_gerados: 3 }],
      },
    });
    // Texto com placeholders explícitos {{snake_case}}
    const texto = "Eu, {{nome_completo}}, CPF {{cpf}}, contrato pelos serviços...";
    const r = await handlerCriarTemplateContrato(
      { nome: "Modelo Residencial", texto, ativar: true },
      ctx(sb),
    );
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.tipo, "confirmacao_placeholders");
    assert.equal(parsed.dados.template_id, "tmpl-1");
    assert.equal(parsed.dados.ativo, true);
    // Placeholders detectados devem incluir nome_completo e cpf
    const nomes = (parsed.dados.placeholders as Array<{ nome: string }>).map((p) => p.nome);
    assert.ok(nomes.includes("nome_completo"));
    assert.ok(nomes.includes("cpf"));
    const rpc = sb.chamadas.find((c) => c.op === "rpc" && c.fn === "criar_template_a_partir_de_texto");
    assert.ok(rpc);
    const args = rpc!.payload as Record<string, unknown>;
    assert.equal(args.p_nome, "Modelo Residencial");
    assert.equal(args.p_ativar, true);
    assert.equal(args.p_num_testemunhas, 1);
    assert.equal(args.p_instrucao_selfie, null);
  }

  // ── 12. detectarPlaceholders — regex puro ─────────────────────────────────

  // 12a. {{snake_case}}
  {
    const r = detectarPlaceholders("Olá {{nome_completo}}, seu CPF é {{cpf}}.");
    const nomes = r.map((p) => p.nome);
    assert.ok(nomes.includes("nome_completo"));
    assert.ok(nomes.includes("cpf"));
  }

  // 12b. {SNAKE_CASE} maiúsculo
  {
    const r = detectarPlaceholders("Nome: {NOME_CLIENTE}, Valor: {VALOR}");
    const nomes = r.map((p) => p.nome);
    assert.ok(nomes.includes("nome_cliente"));
    assert.ok(nomes.includes("valor"));
  }

  // 12c. [NOME] estilo bracket
  {
    const r = detectarPlaceholders("Contratante: [NOME_COMPLETO], telefone: [TELEFONE]");
    const nomes = r.map((p) => p.nome);
    assert.ok(nomes.includes("nome_completo"));
    assert.ok(nomes.includes("telefone"));
  }

  // 12d. ___snake___ estilo underscore
  {
    const r = detectarPlaceholders("Endereço: ___endereco___, Cidade: ___cidade___");
    const nomes = r.map((p) => p.nome);
    assert.ok(nomes.includes("endereco"));
    assert.ok(nomes.includes("cidade"));
  }

  // 12e. <<placeholder>> estilo angle
  {
    const r = detectarPlaceholders("Email: <<email>>, CEP: <<cep>>");
    const nomes = r.map((p) => p.nome);
    assert.ok(nomes.includes("email"));
    assert.ok(nomes.includes("cep"));
  }

  // 12f. ignora {SE_A_VISTA} e similares condicionais
  {
    const r = detectarPlaceholders("{SE_A_VISTA}desconto aplicado{/SE_A_VISTA}");
    assert.equal(r.length, 0, "condicionais SE_ devem ser ignorados");
  }

  // 12g. tipo correto: data → "data", valor → "valor_brl", resto → "texto"
  {
    const r = detectarPlaceholders("{{data_assinatura}} {{valor}} {{nome}}");
    const byNome: Record<string, string> = {};
    for (const p of r) byNome[p.nome] = p.tipo;
    assert.equal(byNome["data_assinatura"], "data");
    assert.equal(byNome["valor"], "valor_brl");
    assert.equal(byNome["nome"], "texto");
  }

  // 12h. descrição canônica pra nome conhecido
  {
    const r = detectarPlaceholders("{{cpf}}");
    assert.equal(r[0].descricao, "CPF do cliente");
  }

  // 12i. texto sem placeholder → array vazio
  {
    const r = detectarPlaceholders("Texto normal sem variável alguma.");
    assert.equal(r.length, 0);
  }

  // 12j. deduplicação: mesmo placeholder repetido → aparece 1x
  {
    const r = detectarPlaceholders("{{nome}} e novamente {{nome}}");
    assert.equal(r.filter((p) => p.nome === "nome").length, 1);
  }

  // ── 13. executarTool — dispatcher ─────────────────────────────────────────

  // 13a. dispatch correto para cadastrar_produto
  {
    const sb = fakeSupabase({ produtos: { data: { id: "p-disp" } } });
    const r = await executarTool("cadastrar_produto", { nome: "Via dispatcher" }, ctx(sb));
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("Via dispatcher"));
  }

  // 13b. tool desconhecida
  {
    const sb = fakeSupabase({});
    const r = await executarTool("tool_que_nao_existe", {}, ctx(sb));
    assert.ok(r.includes("Tool desconhecida"));
    assert.ok(r.includes("tool_que_nao_existe"));
  }

  // 13c. dispatch pra criar_cliente
  {
    const sb = fakeSupabase({ clientes: { data: { id: "c-disp" } } });
    const r = await executarTool("criar_cliente", { nome: "Carlos", telefone: "11888" }, ctx(sb));
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("Carlos"));
  }

  // ── 14. UI-only handlers ──────────────────────────────────────────────────

  // 14a. abrir_app
  {
    const sb = fakeSupabase({});
    const r = await handlerAbrirApp({ app_id: "contratos" }, ctx(sb));
    assert.ok(r.includes("✓"));
    assert.ok(r.includes("contratos"));
  }

  // 14b. abrir_app sem app_id
  {
    const sb = fakeSupabase({});
    const r = await handlerAbrirApp({}, ctx(sb));
    assert.ok(r.includes("✗"));
  }

  // 14c. abrir_app_os
  {
    const sb = fakeSupabase({});
    const r = await handlerAbrirAppOs({ slug: "atendimento" }, ctx(sb));
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.tipo, "acao_os");
    assert.equal(parsed.dados.acao, "abrir_app");
    assert.equal(parsed.dados.slug, "atendimento");
  }

  // 14d. abrir_app_os sem slug
  {
    const sb = fakeSupabase({});
    const r = await handlerAbrirAppOs({}, ctx(sb));
    assert.ok(r.includes("✗"));
  }

  // 14e. mostrar_desktop
  {
    const sb = fakeSupabase({});
    const r = await handlerMostrarDesktop({}, ctx(sb));
    const parsed = JSON.parse(r);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dados.acao, "mostrar_desktop");
  }

  console.log("tools-mentor.test.ts OK — 14 grupos, todos passaram.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
