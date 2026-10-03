// SYNC-BLOCOS v4 — Gera blocos_conhecimento de TODOS os dados relevantes do tenant
// Identidade, empresa, sócios, produtos, conhecimento, mídias, contratos, configuração.
// Fluxo NÃO entra mais (o motor roteia por cargo). RAG = só FATO.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// ===== Tipos =====

type FaseConfig = { descricao: string; instrucoes: string[]; regras: string[] }
type Qualificador = { id: string; texto: string; obrigatorio: boolean }
type QualificadorProduto = { produto_id: string; produto_nome: string; qualificadores: Qualificador[] }
type QualificacaoConfig = FaseConfig & { qualificadores_produto?: QualificadorProduto[] }
type MidiaRef = { produto_midia_id: string; descricao: string }
type ApresentacaoConfig = FaseConfig & { midias_envio: MidiaRef[] }
type FluxoConfig = { saudacao: FaseConfig; qualificacao: QualificacaoConfig; apresentacao: ApresentacaoConfig; negociacao: FaseConfig; fechado: FaseConfig }
type ChunkTipo = "apresentacao" | "valor" | "resposta" | "pagamento" | "processo";
type LinhaBloco = { agente_id: string; title: string; content: string; category: string; tipo: ChunkTipo; tags: string[]; tag: string | null; vetor_semantico: number[] | null }

// Deriva tipo (motor v2 RAG) a partir das tags. FASE 11.5.c.
function derivarTipo(tags: string[]): ChunkTipo {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  if (set.has("preco") || set.has("valor")) return "valor";
  if (set.has("pagamento")) return "pagamento";
  if (set.has("objecao") || set.has("faq") || set.has("resposta")) return "resposta";
  if (set.has("fluxo") || set.has("processo") || set.has("atendimento") || set.has("garantia") || set.has("qualificador")) return "processo";
  // Default: produto/identidade/empresa/conhecimento -> apresentacao
  return "apresentacao";
}

type Turno = { dia: string; ativo: boolean; inicio: string; fim: string }
type ConfiguracaoAgente = {
  horario?: { tipo?: string; turnos?: Turno[]; mensagem_fora?: string }
  transferir_humano?: { ativo?: boolean }
}

// ===== CORS & helpers =====

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function splitTexto(texto: string, maxTokens = 500, overlap = 50): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.length <= maxTokens) return [texto];
  const blocos: string[] = [];
  let i = 0;
  while (i < palavras.length) {
    blocos.push(palavras.slice(i, i + maxTokens).join(" "));
    i += maxTokens - overlap;
  }
  return blocos;
}

function adicionarBloco(arr: Omit<LinhaBloco, "vetor_semantico" | "tipo">[], agentId: string, title: string, content: string, category: string, tags: string[]) {
  if (!content || content.trim().length < 10) return;
  const pedacos = splitTexto(content);
  for (let i = 0; i < pedacos.length; i++) {
    arr.push({
      agente_id: agentId,
      title: pedacos.length > 1 ? `${title} (${i + 1}/${pedacos.length})` : title,
      content: pedacos[i],
      category,
      tags,
      // Marcador "auto" — usado pelo DELETE seletivo da sincronização.
      // DELETE só apaga blocos com tag='auto' (gerados aqui), preservando blocos
      // curados manualmente (tag=NULL). Evita incidente de apagar base curada
      // quando frontend salva tela Empresa/Produtos.
      tag: "auto",
    });
  }
}

const DIAS_LABEL: Record<string, string> = { segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta", sexta: "Sexta", sabado: "Sábado", domingo: "Domingo" };

const FLUXO_VAZIO: FluxoConfig = {
  saudacao: { descricao: "", instrucoes: [], regras: [] },
  qualificacao: { descricao: "", instrucoes: [], regras: [], qualificadores_produto: [] },
  apresentacao: { descricao: "", instrucoes: [], regras: [], midias_envio: [] },
  negociacao: { descricao: "", instrucoes: [], regras: [] },
  fechado: { descricao: "", instrucoes: [], regras: [] },
};

// ===== Parsers =====

function parseFluxoConfig(raw: unknown): FluxoConfig {
  if (!raw || typeof raw !== "object") return { ...FLUXO_VAZIO };
  const obj = raw as Record<string, unknown>;
  if (obj.saudacao && obj.qualificacao && obj.apresentacao && obj.negociacao && obj.fechado) return raw as FluxoConfig;
  return { ...FLUXO_VAZIO };
}

function parseIdentidade(ident: unknown): { nome: string; cargo: string; personalidade: string } {
  if (!ident) return { nome: "", cargo: "", personalidade: "" };
  if (typeof ident === "object" && !Array.isArray(ident) && ident !== null) {
    const obj = ident as Record<string, string>;
    return { nome: obj.nome || "", cargo: obj.cargo || "", personalidade: obj.personalidade || "" };
  }
  // Formato legado (array de pastas)
  if (Array.isArray(ident)) {
    let nome = "", cargo = "";
    for (const pasta of ident) {
      const p = pasta as { filhos?: { nome: string; conteudo?: string }[] };
      if (p.filhos) {
        for (const f of p.filhos) {
          if (f.nome === "Nome" && f.conteudo) nome = f.conteudo;
          if (f.nome === "Cargo" && f.conteudo) cargo = f.conteudo;
        }
      }
    }
    return { nome, cargo, personalidade: "" };
  }
  return { nome: "", cargo: "", personalidade: "" };
}

function parseConfiguracao(raw: unknown): ConfiguracaoAgente {
  if (!raw || typeof raw !== "object") return {};
  return raw as ConfiguracaoAgente;
}

// ===== Bloco generators =====

function gerarChunkIdentidade(blocos: Omit<LinhaBloco, "vetor_semantico" | "tipo">[], agentId: string, ident: { nome: string; cargo: string; personalidade: string }) {
  if (!ident.nome) return;
  const parts = [`Nome: ${ident.nome}`, `Cargo: ${ident.cargo || "Assistente"}`];
  if (ident.personalidade) parts.push(ident.personalidade);
  adicionarBloco(blocos, agentId, "Identidade do Agente", parts.join(". ") + ".", "identidade", ["identidade"]);
}

function gerarChunksEmpresa(
  blocos: Omit<LinhaBloco, "vetor_semantico" | "tipo">[],
  agentId: string,
  empresa: Record<string, string | null> | null,
  socios: { nome: string; descricao: string | null }[]
) {
  if (!empresa) return;

  // INSTITUCIONAL
  const instParts: string[] = [];
  if (empresa.nome) instParts.push(empresa.nome);
  if (empresa.descricao) instParts.push(empresa.descricao);
  if (empresa.cnpj) instParts.push(`CNPJ: ${empresa.cnpj}`);
  if (empresa.data_inicio) instParts.push(`No mercado desde ${empresa.data_inicio}.`);
  if (instParts.length > 0) {
    adicionarBloco(blocos, agentId, "Empresa — Informações", instParts.join(". "), "empresa", ["empresa", "institucional"]);
  }

  // LOCALIZAÇÃO
  const temCidade = !!empresa.cidade;
  const temPresenca = !!empresa.tipo_presenca;
  if (temCidade || temPresenca) {
    let locContent = "";
    if (empresa.tipo_presenca === "digital" || (!empresa.endereco && empresa.tipo_presenca !== "fisico")) {
      locContent = "Empresa 100% digital, sem endereço físico. Atendimento remoto para todo o Brasil.";
    } else {
      // físico ou tem endereço
      const endParts: string[] = [];
      if (empresa.endereco) endParts.push(empresa.endereco);
      if (empresa.bairro) endParts.push(empresa.bairro);
      const cidadeEstado = [empresa.cidade, empresa.estado].filter(Boolean).join("/");
      if (cidadeEstado) endParts.push(cidadeEstado);
      if (empresa.cep) endParts.push(`CEP ${empresa.cep}`);
      locContent = `Endereço: ${endParts.join(", ")}.`;
    }
    adicionarBloco(blocos, agentId, "Empresa — Localização", locContent, "empresa", ["empresa", "localizacao"]);
  }

  // CONTATO E REDES SOCIAIS
  const contatoParts: string[] = [];
  if (empresa.whatsapp) contatoParts.push(`WhatsApp: ${empresa.whatsapp}`);
  if (empresa.instagram) contatoParts.push(`Instagram: ${empresa.instagram}`);
  if (empresa.facebook) contatoParts.push(`Facebook: ${empresa.facebook}`);
  if (empresa.tiktok) contatoParts.push(`TikTok: ${empresa.tiktok}`);
  if (empresa.site) contatoParts.push(`Site: ${empresa.site}`);
  if (contatoParts.length > 0) {
    adicionarBloco(blocos, agentId, "Empresa — Contato e Redes Sociais", contatoParts.join(". ") + ".", "empresa", ["empresa", "contato"]);
  }

  // EQUIPE (sócios)
  if (socios.length > 0) {
    const lista = socios.map(s => s.nome + (s.descricao ? ` (${s.descricao})` : "")).join(", ");
    adicionarBloco(blocos, agentId, "Empresa — Representantes", `Representantes legais: ${lista}.`, "empresa", ["empresa", "equipe"]);
  }
}

function gerarChunksProdutos(
  blocos: Omit<LinhaBloco, "vetor_semantico" | "tipo">[],
  agentId: string,
  produtos: Record<string, unknown>[],
  conhecimentos: Record<string, unknown>[],
  midias: { produto_id: string; arquivo_nome: string | null; descricao: string | null }[],
  contratos: Record<string, unknown>[],
  fluxo: FluxoConfig
) {
  for (const prod of produtos) {
    const p = prod as { id: string; nome: string; garantia?: string; prazo_entrega?: string };
    const nomeLower = p.nome.toLowerCase();

    // CONHECIMENTO por tipo
    const conhecProd = conhecimentos.filter((c) => (c as Record<string, unknown>).produto_id === p.id);
    for (const item of conhecProd) {
      const c = item as { tipo: string; titulo: string; conteudo: string };
      const tipoNorm = c.tipo === "info" ? "conhecimento" : (c.tipo || "conhecimento");

      if (tipoNorm === "conhecimento") {
        adicionarBloco(blocos, agentId, c.titulo || `Conhecimento — ${p.nome}`, c.conteudo, "produto", ["produto", "conhecimento", nomeLower]);
      } else if (tipoNorm === "preco") {
        adicionarBloco(blocos, agentId, c.titulo || `Preços — ${p.nome}`, c.conteudo, "produto", ["produto", "preco", nomeLower]);
      } else if (tipoNorm === "objecao") {
        adicionarBloco(blocos, agentId, c.titulo || `Objeção — ${p.nome}`, c.conteudo, "produto", ["produto", "objecao", nomeLower]);
      } else if (tipoNorm === "pagamento") {
        adicionarBloco(blocos, agentId, c.titulo || `Pagamento — ${p.nome}`, c.conteudo, "produto", ["produto", "pagamento", nomeLower]);
      } else if (tipoNorm === "faq") {
        const faqContent = `Pergunta frequente: ${c.titulo || p.nome}\nResposta: ${c.conteudo}`;
        adicionarBloco(blocos, agentId, `FAQ — ${c.titulo || p.nome}`, faqContent, "produto", ["produto", "faq", nomeLower]);
      } else {
        // tipo genérico
        adicionarBloco(blocos, agentId, c.titulo || `${tipoNorm} — ${p.nome}`, c.conteudo, "produto", ["produto", tipoNorm, nomeLower]);
      }
    }

    // GARANTIA / PRAZO
    if (p.garantia || p.prazo_entrega) {
      const garParts: string[] = [];
      if (p.garantia) garParts.push(`Garantia: ${p.garantia}.`);
      if (p.prazo_entrega) garParts.push(`Prazo de entrega: ${p.prazo_entrega}.`);
      adicionarBloco(blocos, agentId, `Garantia e Prazo — ${p.nome}`, garParts.join(" "), "produto", ["produto", "garantia", nomeLower]);
    }

    // QUALIFICADORES (do fluxo.qualificacao.qualificadores_produto)
    const qualProd = (fluxo.qualificacao as QualificacaoConfig).qualificadores_produto;
    if (qualProd && qualProd.length > 0) {
      const qualDoProduto = qualProd.find(q => q.produto_id === p.id);
      if (qualDoProduto && qualDoProduto.qualificadores.length > 0) {
        const obrigatorios = qualDoProduto.qualificadores.filter(q => q.obrigatorio).map(q => q.texto);
        const opcionais = qualDoProduto.qualificadores.filter(q => !q.obrigatorio).map(q => q.texto);
        const qualParts: string[] = [`Para identificar se o cliente precisa de ${p.nome}:`];
        if (obrigatorios.length > 0) qualParts.push(`Critérios obrigatórios: ${obrigatorios.join("; ")}`);
        if (opcionais.length > 0) qualParts.push(`Critérios opcionais: ${opcionais.join("; ")}`);
        adicionarBloco(blocos, agentId, `Qualificadores — ${p.nome}`, qualParts.join("\n"), "produto", ["produto", "qualificador", nomeLower]);
      }
    }

    // MÍDIAS (com descrição)
    const midiasProd = midias.filter(m => m.produto_id === p.id);
    for (const m of midiasProd) {
      if (m.descricao) {
        adicionarBloco(blocos, agentId, m.arquivo_nome || `Mídia — ${p.nome}`, m.descricao, "produto", ["produto", "midia", nomeLower]);
      }
    }

    // CONTRATO
    const contratosProd = contratos.filter(c => (c as Record<string, unknown>).produto_id === p.id);
    for (const ct of contratosProd) {
      const t = ct as {
        produto_id: string; nome: string;
        campos_obrigatorios: string[] | null; instrucao_selfie: string | null;
        num_testemunhas: number | null; posicao_pagamento: string | null;
        chave_pix: string | null; opcoes_parcelamento: { entrada: number; parcelas: number; valor_parcela: number; link?: string }[] | null;
        valor_a_vista: number | null
      };

      // Bloco de contrato
      const contParts: string[] = [`Contrato do ${p.nome}: assinatura 100% digital pelo celular.`];
      const rf = t.campos_obrigatorios || [];
      if (rf.includes("selfie")) contParts.push("Requisito: selfie ao vivo.");
      if (rf.includes("documento")) contParts.push("Requisito: foto do documento (RG ou CNH).");
      if (rf.includes("assinatura_manuscrita")) contParts.push("Requisito: assinatura manuscrita na tela.");
      if (rf.includes("testemunha")) contParts.push(`Necessário ${t.num_testemunhas || 1} testemunha(s).`);
      if (t.instrucao_selfie) {
        const selfieMap: Record<string, string> = {
          dois_dedos: "mostrar 2 dedos na selfie",
          segurar_documento: "segurar o documento na selfie",
          documento_dois_dedos: "segurar o documento e mostrar 2 dedos",
        };
        const instrucao = selfieMap[t.instrucao_selfie] || t.instrucao_selfie;
        contParts.push(`Instrução da selfie: ${instrucao}.`);
      }
      adicionarBloco(blocos, agentId, `Processo de Contrato — ${p.nome}`, contParts.join(" "), "processo", ["processo", "contrato", nomeLower]);

      // Bloco de pagamento
      const temPagamento = t.chave_pix || t.valor_a_vista || (t.opcoes_parcelamento && t.opcoes_parcelamento.length > 0);
      if (temPagamento) {
        const pagParts: string[] = [];
        if (t.posicao_pagamento === "before_sign") pagParts.push("Pagamento realizado ANTES de assinar o contrato.");
        if (t.posicao_pagamento === "after_sign") pagParts.push("Pagamento realizado DEPOIS de assinar o contrato.");
        if (t.valor_a_vista) pagParts.push(`Valor à vista: R$ ${Number(t.valor_a_vista).toFixed(2)}.`);
        if (t.chave_pix) pagParts.push(`Chave PIX: ${t.chave_pix}.`);
        if (t.opcoes_parcelamento && t.opcoes_parcelamento.length > 0) {
          for (const opt of t.opcoes_parcelamento) {
            const linkPart = opt.link ? ` (link: ${opt.link})` : "";
            pagParts.push(`- Entrada: R$ ${opt.entrada} + ${opt.parcelas}x de R$ ${opt.valor_parcela}${linkPart}`);
          }
        }
        adicionarBloco(blocos, agentId, `Formas de Pagamento — ${p.nome}`, pagParts.join("\n"), "processo", ["processo", "pagamento", nomeLower]);
      }
    }
  }
}

function gerarChunksAtendimento(blocos: Omit<LinhaBloco, "vetor_semantico" | "tipo">[], agentId: string, config: ConfiguracaoAgente) {
  // HORÁRIO
  const horario = config.horario;
  if (horario) {
    if (horario.tipo === "24h") {
      adicionarBloco(blocos, agentId, "Horário de Atendimento", "Atendimento 24 horas, todos os dias.", "atendimento", ["atendimento", "horario"]);
    } else if (horario.tipo === "personalizado" && horario.turnos) {
      const ativos = horario.turnos.filter(t => t.ativo);
      const inativos = horario.turnos.filter(t => !t.ativo);
      const parts: string[] = ["Horário de atendimento:"];
      for (const t of ativos) {
        parts.push(`${DIAS_LABEL[t.dia] || t.dia}: ${t.inicio} às ${t.fim}`);
      }
      if (inativos.length > 0) {
        parts.push(`Fechado: ${inativos.map(t => DIAS_LABEL[t.dia] || t.dia).join(", ")}`);
      }
      adicionarBloco(blocos, agentId, "Horário de Atendimento", parts.join("\n"), "atendimento", ["atendimento", "horario"]);
    }
  }

  // ATENDIMENTO HUMANO
  if (config.transferir_humano?.ativo) {
    adicionarBloco(
      blocos, agentId, "Atendimento Humano",
      "Se o cliente preferir, pode solicitar atendimento com um atendente humano a qualquer momento.",
      "atendimento", ["atendimento", "humano"]
    );
  }
}

/** service_role / segredo de cron, ou JWT de usuário cujo tenant é dono do agente. */
async function autorizarDonoDoAgente(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  agenteId: string,
): Promise<{ ok: true } | { ok: false; erro: string; status: number }> {
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!bearer) return { ok: false, erro: "nao_autorizado", status: 401 };

  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (servico && bearer === servico) return { ok: true };
  const { data: segredo } = await supabase.rpc("ler_segredo_cron");
  if (typeof segredo === "string" && segredo.length > 0 && bearer === segredo) return { ok: true };

  const { data: auth } = await supabase.auth.getUser(bearer);
  const uid = auth?.user?.id as string | undefined;
  if (!uid) return { ok: false, erro: "nao_autorizado", status: 401 };

  const { data: perfil } = await supabase
    .from("profiles").select("parent_user_id, system_role").eq("id", uid).maybeSingle();
  if (perfil?.system_role === "platform_admin") return { ok: true };
  const tenant = (perfil?.parent_user_id as string | null) ?? uid;

  const { data: agente } = await supabase
    .from("agentes_usuario").select("user_id").eq("id", agenteId).maybeSingle();
  if (!agente) return { ok: false, erro: "Agente não encontrado", status: 404 };
  if (agente.user_id !== tenant) return { ok: false, erro: "forbidden", status: 403 };
  return { ok: true };
}

// ===== Handler =====

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const agenteId = (body.agente_id ?? body.agent_id) as string | undefined;
    if (!agenteId) return jsonResp({ error: "agente_id obrigatório" }, 400);

    const supabase = criarClienteAdmin();

    // Auth (2026-09-17): antes bastava mandar um agente_id — qualquer um com a
    // anon key apagava (tag='auto') e regravava a base de conhecimento de
    // QUALQUER agente. Agora exige service_role/segredo de cron OU um usuário
    // logado cujo tenant é dono do agente (é como o frontend chama).
    const guard = await autorizarDonoDoAgente(supabase, req, agenteId);
    if (!guard.ok) return jsonResp({ error: guard.erro }, guard.status);

    // 1. Carregar agente (identidade + fluxo + configuracao)
    const { data: ua, error: uaError } = await supabase
      .from("agentes_usuario").select("id, user_id, identidade, fluxo, configuracao").eq("id", agenteId).single();
    if (uaError || !ua) return jsonResp({ error: "Agente não encontrado" }, 404);

    const tenantId = ua.user_id;

    // 2. Carregar empresa (com campos expandidos)
    let empresa: Record<string, string | null> | null = null;
    let empresaId: string | null = null;
    if (tenantId) {
      const { data: emp } = await supabase.from("empresas")
        .select("id, nome, descricao, cnpj, endereco, cidade, estado, instagram, whatsapp, site, facebook, tiktok, bairro, cep, data_inicio, tipo_presenca")
        .eq("user_id", tenantId).maybeSingle();
      if (emp) {
        empresaId = emp.id as string;
        empresa = emp as Record<string, string | null>;
      }
    }

    // 3. Carregar sócios
    let socios: { nome: string; descricao: string | null }[] = [];
    if (empresaId) {
      const { data: socData } = await supabase.from("socios")
        .select("nome, descricao")
        .eq("empresa_id", empresaId);
      if (socData) {
        socios = socData as { nome: string; descricao: string | null }[];
      }
    }

    // 4. Carregar produtos + conhecimento + mídias + contratos
    let produtos: Record<string, unknown>[] = [];
    let conhecimentos: Record<string, unknown>[] = [];
    let midias: { produto_id: string; arquivo_nome: string | null; descricao: string | null }[] = [];
    let contratos: Record<string, unknown>[] = [];
    if (tenantId) {
      const { data: prods } = await supabase.from("produtos")
        .select("id, nome, garantia, prazo_entrega").eq("user_id", tenantId);
      if (prods) produtos = prods;

      if (produtos.length > 0) {
        const ids = produtos.map((p) => p.id as string);
        const [conhecRes, midiasRes, contratosRes] = await Promise.all([
          supabase.from("produto_conhecimento").select("produto_id, tipo, titulo, conteudo").in("produto_id", ids),
          supabase.from("produto_midias").select("produto_id, arquivo_nome, descricao").in("produto_id", ids),
          supabase.from("contratos_template")
            .select("produto_id, nome, campos_obrigatorios, instrucao_selfie, num_testemunhas, posicao_pagamento, chave_pix, opcoes_parcelamento, valor_a_vista")
            .in("produto_id", ids).eq("ativo", true),
        ]);
        if (conhecRes.data) conhecimentos = conhecRes.data;
        if (midiasRes.data) midias = midiasRes.data as typeof midias;
        if (contratosRes.data) contratos = contratosRes.data;
      }
    }

    // 5. Deletar SÓ os blocos gerados automaticamente por esta edge (tag='auto').
    //    Blocos curados manualmente (tag=NULL) e de outras origens são preservados.
    //    Embedding fica a cargo da trigger + cron Cohere.
    await supabase.from("blocos_conhecimento")
      .delete()
      .eq("agente_id", agenteId)
      .eq("tag", "auto");

    // 6. Gerar blocos
    const blocos: Omit<LinhaBloco, "vetor_semantico" | "tipo">[] = [];
    const ident = parseIdentidade(ua.identidade);
    const fluxo = parseFluxoConfig(ua.fluxo);
    const config = parseConfiguracao(ua.configuracao);

    gerarChunkIdentidade(blocos, agenteId, ident);
    gerarChunksEmpresa(blocos, agenteId, empresa, socios);
    gerarChunksProdutos(blocos, agenteId, produtos, conhecimentos, midias, contratos, fluxo);
    gerarChunksAtendimento(blocos, agenteId, config);
    // Fluxo legado (jsonb agentes_usuario.fluxo) NÃO entra mais no RAG:
    // o motor (ragentic-processar-inline) roteia comportamento por cargo
    // (cargos + cargo_diretrizes), não por blocos de fluxo. RAG = só FATO.

    if (blocos.length === 0) return jsonResp({ chunks_created: 0, message: "Nenhum conteúdo para indexar" });

    // 6.4. Dedup por conteúdo (2026-09-11, tenant Verifik): 3 planos FATIMIN com a MESMA tabela
    // de preços e o MESMO prazo geravam 3 blocos idênticos cada — ocupavam 6 das 8 vagas do
    // recall e empurravam bloco útil pra fora do top-k. Conteúdo repetido vira 1 bloco só,
    // com o título somando os nomes ("Garantia e Prazo — FATIMIN 1, FATIMIN 2 e FATIMIN 3").
    {
      const porConteudo = new Map<string, number>();
      const unicos: typeof blocos = [];
      for (const b of blocos) {
        const chave = b.content.replace(/\s+/g, " ").trim().toLowerCase();
        const idx = porConteudo.get(chave);
        if (idx === undefined) {
          porConteudo.set(chave, unicos.length);
          unicos.push(b);
          continue;
        }
        const base = unicos[idx];
        const [prefBase, sufBase] = base.title.split(" — ");
        const [prefNovo, sufNovo] = b.title.split(" — ");
        if (sufBase && sufNovo && prefBase === prefNovo) {
          const nomes = sufBase.split(/, | e /).concat(sufNovo).filter((n, i, a) => a.indexOf(n) === i);
          base.title = `${prefBase} — ${nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] : nomes[0]}`;
        }
        base.tags = [...new Set([...base.tags, ...b.tags])];
      }
      if (unicos.length < blocos.length) {
        console.info(`[sincronizar-blocos] dedup por conteúdo: ${blocos.length} → ${unicos.length} blocos`);
        blocos.length = 0;
        blocos.push(...unicos);
      }
    }

    // 6.5. Config vence SEMPRE (DEC-043, caso Diego 2026-06-11): bloco MANUAL homônimo de um
    // bloco gerado pela config (ex: "Horário de Atendimento" editado na curadoria) é desativado
    // (soft delete) — senão convivem 2 cartões contraditórios e o agente fala dado velho.
    const titulosGerados = [...new Set(blocos.map((b) => b.title))];
    // Dois updates simples (o `.or` encadeado no UPDATE falhava silencioso): (a) tag IS NULL
    // (curadoria manual), (b) tag preenchida ≠ 'auto'. Erro agora é LOGADO, nunca engolido.
    let _manuaisDesativados = 0;
    {
      const { data: _d1, error: _e1 } = await supabase
        .from("blocos_conhecimento")
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("agente_id", agenteId)
        .in("title", titulosGerados)
        .is("tag", null)
        .is("deleted_at", null)
        .select("id");
      if (_e1) console.warn(`[sincronizar-blocos] config-vence (tag null) falhou: ${_e1.message}`);
      _manuaisDesativados += _d1?.length ?? 0;
      const { data: _d2, error: _e2 } = await supabase
        .from("blocos_conhecimento")
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("agente_id", agenteId)
        .in("title", titulosGerados)
        .neq("tag", "auto")
        .not("tag", "is", null)
        .is("deleted_at", null)
        .select("id");
      if (_e2) console.warn(`[sincronizar-blocos] config-vence (tag != auto) falhou: ${_e2.message}`);
      _manuaisDesativados += _d2?.length ?? 0;
    }
    if (_manuaisDesativados > 0) {
      console.warn(`[sincronizar-blocos] config venceu: ${_manuaisDesativados} bloco(s) manual(is) homônimo(s) desativado(s)`);
    }

    // 7. Insert em batches de 100. Embedding fica null — trigger trg_enqueue_embedding_knowledge
    //    enfileira em pgmq.embedding_jobs e o cron process_embedding_jobs preenche via Cohere embed-v4.0.
    const rows: LinhaBloco[] = blocos.map((bloco) => ({
      ...bloco, tipo: derivarTipo(bloco.tags), vetor_semantico: null,
    }));
    let totalInseridos = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertError } = await supabase.from("blocos_conhecimento").insert(batch);
      if (insertError) console.error(`Insert batch ${i} error:`, insertError);
      else totalInseridos += batch.length;
    }

    return jsonResp({
      chunks_created: totalInseridos,
      total_extracted: blocos.length,
    });
  } catch (error) {
    console.error("sync-blocos error:", error);
    return jsonResp({ error: "Erro interno", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
