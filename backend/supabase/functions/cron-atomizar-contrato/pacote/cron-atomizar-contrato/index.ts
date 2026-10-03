/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-atomizar-contrato · one-shot · gera blocos atômicos a partir de contratos_template
// 1 bloco por aspecto e por template: documentos · selfie · testemunhas · pagamento · posição do pagamento
// Bloco 3.5 — atomização semântica do processo de assinatura
//
// 2026-09-11: reescrito pra ler as colunas em português de `contratos_template`
// (campos_obrigatorios, instrucao_selfie, posicao_pagamento, opcoes_parcelamento,
// chave_pix). A versão anterior pedia `installment_options`/`pix_key`/`payment_position`,
// que não existem mais, e por isso gerava "?x de R$180" e nunca via a entrada.
// Também passou a atomizar TODOS os templates ativos do tenant (antes só o 1º).

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

type OpcaoParcelamento = {
  entrada?: number | null;
  parcelas?: number | null;
  valor_parcela?: number | null;
  valor_total?: number | null;
};

type ContratoTemplate = {
  id: string;
  nome: string | null;
  campos_obrigatorios: string[] | null;
  num_testemunhas: number | null;
  instrucao_selfie: string | null;
  posicao_pagamento: string | null;
  opcoes_parcelamento: OpcaoParcelamento[] | null;
  valor_a_vista: number | string | null;
  chave_pix: string | null;
};

type ChunkAtomico = {
  content: string;
  category: string;
  tag: string;
  title: string;
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function brl(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Slug de campo/prova → texto legível pro cliente. */
const ROTULO_CAMPO: Record<string, string> = {
  nome_completo: "nome completo",
  nome: "nome",
  cpf: "CPF",
  cnpj: "CNPJ",
  rg: "RG",
  email: "e-mail",
  telefone: "telefone",
  endereco: "endereço",
  numero_endereco: "número do endereço",
  bairro: "bairro",
  cidade_uf: "cidade/UF",
  cidade: "cidade",
  estado: "estado",
  cep: "CEP",
  data_nascimento: "data de nascimento",
  estado_civil: "estado civil",
  profissao: "profissão",
  tipo_pessoa: "se é pessoa física ou jurídica",
  selfie: "selfie",
  documento: "foto do documento (RG ou CNH)",
  assinatura_manuscrita: "assinatura na tela",
};

function rotuloCampo(slug: string): string {
  const s = slug.trim();
  return ROTULO_CAMPO[s.toLowerCase()] ?? s.toLowerCase().replaceAll("_", " ");
}

function pagamentoAntes(posicao: string | null): boolean {
  const p = (posicao ?? "").toLowerCase();
  return p === "before_sign" || p === "antes_assinatura" || p === "antes" || p === "before";
}

function descreverOpcao(o: OpcaoParcelamento): string | null {
  const parcelas = Number(o.parcelas ?? 0);
  const valorParcela = Number(o.valor_parcela ?? 0);
  if (!(parcelas > 0) || !(valorParcela > 0)) return null;
  const entrada = Number(o.entrada ?? 0);
  const total = Number(o.valor_total ?? 0) > 0 ? Number(o.valor_total) : entrada + parcelas * valorParcela;
  return (entrada > 0 ? `${brl(entrada)} de entrada + ` : "") +
    `${parcelas}x de ${brl(valorParcela)} (total ${brl(total)})`;
}

function montarBlocos(tenantId: string, tpl: ContratoTemplate): ChunkAtomico[] {
  const blocos: ChunkAtomico[] = [];
  const nomeTpl = (tpl.nome ?? "").trim() || "contrato";
  const prefixoTag = `contrato_${tenantId}_${tpl.id.slice(0, 8)}`;
  const prefixoTitulo = `Contrato "${nomeTpl}"`;

  // DOCUMENTOS / campos que o cliente preenche
  const campos = (tpl.campos_obrigatorios ?? []).filter((c) => typeof c === "string" && c.trim());
  if (campos.length > 0) {
    const lista = campos.map((c) => `· ${rotuloCampo(c)}`).join("\n");
    blocos.push({
      title: `${prefixoTitulo} — o que o cliente informa pra assinar`,
      content: `Para assinar o contrato "${nomeTpl}" o cliente precisa informar/enviar:\n${lista}`,
      category: "documentos_assinatura",
      tag: `${prefixoTag}_documentos`,
    });
  }

  // SELFIE — instrução
  if (tpl.instrucao_selfie) {
    const mapaInstrucao: Record<string, string> = {
      dois_dedos: "mostre 2 dedos na selfie",
      segurar_documento: "segure o documento na selfie",
      documento_dois_dedos: "segure o documento e mostre 2 dedos",
    };
    const instrucao = mapaInstrucao[tpl.instrucao_selfie] ?? tpl.instrucao_selfie;
    blocos.push({
      title: `${prefixoTitulo} — como tirar a selfie`,
      content: `Como tirar a selfie para assinar o contrato "${nomeTpl}": ${instrucao}.`,
      category: "selfie_instrucao",
      tag: `${prefixoTag}_selfie`,
    });
  }

  // TESTEMUNHA — quantas e o que enviam
  const numTest = tpl.num_testemunhas ?? 0;
  blocos.push({
    title: `${prefixoTitulo} — testemunhas`,
    content: numTest > 0
      ? `O contrato "${nomeTpl}" exige ${numTest} ${numTest > 1 ? "testemunhas" : "testemunha"}. ` +
        `Cada testemunha precisa enviar: RG, CPF, selfie e assinatura digital.`
      : `O contrato "${nomeTpl}" é assinado direto pelo cliente · sem necessidade de testemunha.`,
    category: "testemunha",
    tag: `${prefixoTag}_testemunha`,
  });

  // PAGAMENTO — à vista + opções de parcelamento (entrada + parcela cravada)
  const opcoes = (tpl.opcoes_parcelamento ?? []).map(descreverOpcao).filter((s): s is string => !!s);
  const temAVista = Number(tpl.valor_a_vista ?? 0) > 0;
  if (temAVista || opcoes.length > 0) {
    const partes: string[] = [];
    if (temAVista) partes.push(`À vista: ${brl(tpl.valor_a_vista)}.`);
    if (opcoes.length > 0) partes.push(`Parcelado: ${opcoes.join(" · ")}.`);
    if (tpl.chave_pix) partes.push(`Pagamento via PIX disponível (chave: ${tpl.chave_pix}).`);
    blocos.push({
      title: `${prefixoTitulo} — valores e parcelamento`,
      content: `Condições de pagamento do contrato "${nomeTpl}": ${partes.join(" ")}`,
      category: "parcelamento",
      tag: `${prefixoTag}_parcelamento`,
    });
  }

  // POSIÇÃO DO PAGAMENTO — antes ou depois da assinatura
  if (tpl.posicao_pagamento) {
    blocos.push({
      title: `${prefixoTitulo} — quando o cliente paga`,
      content: pagamentoAntes(tpl.posicao_pagamento)
        ? `No contrato "${nomeTpl}" o pagamento é feito ANTES da assinatura. O cliente paga primeiro · depois assina.`
        : `No contrato "${nomeTpl}" o pagamento é feito DEPOIS da assinatura. O cliente assina primeiro · depois efetua o pagamento.`,
      category: "parcelamento",
      tag: `${prefixoTag}_payment_position`,
    });
  }

  return blocos;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();

  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as { tenant_id?: string };
  const tenantIdFiltro = body.tenant_id ?? null;

  // Busca todos os user_agents ativos
  let agentsQ = supabase.from("agentes_usuario").select("id, user_id");
  if (tenantIdFiltro) agentsQ = agentsQ.eq("user_id", tenantIdFiltro);
  const { data: agents } = await agentsQ;

  let totalChunksGerados = 0;
  let totalTemplates = 0;
  const erros: string[] = [];

  for (const agent of agents ?? []) {
    // Todos os templates ativos do tenant (antes só o primeiro — tenant com 2 contratos ficava sem o 2º)
    const { data: tpls, error: tplErr } = await supabase
      .from("contratos_template")
      .select(
        "id, nome, campos_obrigatorios, num_testemunhas, instrucao_selfie, " +
        "posicao_pagamento, opcoes_parcelamento, valor_a_vista, chave_pix",
      )
      .eq("user_id", agent.user_id)
      .eq("ativo", true)
      .order("created_at", { ascending: true });

    if (tplErr) {
      erros.push(`tenant ${agent.user_id}: ${tplErr.message}`);
      continue;
    }
    if (!tpls || tpls.length === 0) continue;

    const blocos: ChunkAtomico[] = [];
    for (const tpl of tpls as unknown as ContratoTemplate[]) {
      totalTemplates++;
      blocos.push(...montarBlocos(agent.user_id, tpl));
    }

    // Apaga TUDO que este atomizador gerou antes pro agente (inclusive tags do formato
    // antigo `contrato_<tenant>_<aspecto>`, que ficaram com "?x de R$" desde abril).
    const { error: delErr } = await supabase
      .from("blocos_conhecimento")
      .delete()
      .eq("agente_id", agent.id)
      .like("tag", `contrato_${agent.user_id}_%`);
    if (delErr) erros.push(`tenant ${agent.user_id} limpeza: ${delErr.message}`);

    for (const c of blocos) {
      // Limpa texto antes de embedar
      const { data: limpo } = await supabase.rpc("limpar_antes_embedar", {
        p_text: c.content,
        p_cap_bytes: 600,
      });
      const textoFinal: string =
        (limpo as { texto_limpo?: string } | null)?.texto_limpo ?? c.content;

      // Insere novo bloco (embedding gerado pelo trigger enfileirar_tarefa_embedding)
      const { error: insErr } = await supabase.from("blocos_conhecimento").insert({
        agente_id: agent.id,
        title: c.title,
        content: textoFinal,
        category: c.category,
        tag: c.tag,
        ativo: true,
        embedding_status: "pendente",
      });

      if (insErr) {
        erros.push(`tenant ${agent.user_id} ${c.category}: ${insErr.message}`);
      } else {
        totalChunksGerados++;
      }
    }
  }

  return jsonResp({
    ok: true,
    duration_ms: Date.now() - t0,
    tenants_processados: agents?.length ?? 0,
    templates_processados: totalTemplates,
    chunks_gerados: totalChunksGerados,
    erros: erros.length > 0 ? erros.slice(0, 20) : undefined,
  });
});
