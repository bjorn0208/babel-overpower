/**
 * extrair-real.ts — Camada de I/O do fluxo real "Gerar com IA" (F3c).
 *
 * Substitui o extrair-mock (FASE 4 prevista no próprio mock):
 *   1. extrairTextoDoArquivo — TXT/MD lê local; PDF/DOCX sobe pro bucket
 *      `mestre-anexos`, chama a edge `extrair-contrato-de-arquivo` e APAGA
 *      o arquivo em seguida (promessa de privacidade do modal).
 *   2. proporEstrutura — chama a edge `contratos-propor-estrutura` (LLM).
 *   3. aplicarProposta — grava miolo/campos/exigências no PRODUTO escolhido
 *      e a moldura no MOLDE ATIVO do tenant (decisão Theus 2026-06-11:
 *      atualiza o ativo, não cria novo). Sem molde ativo → cria um e ativa.
 *
 * O molde ativo é resolvido com o MESMO critério da RPC gerar_contrato_do_template
 * (ativo=true, produto_id IS NULL primeiro, created_at ASC) — editar um e a
 * venda usar outro seria mentira silenciosa.
 */

import { supabase } from "@/integrations/supabase/client";
import { textoParaDoc } from "../editor/serializa";
import type { PropostaEstrutura } from "./proposta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

// ---------------------------------------------------------------------------
// 1. extrairTextoDoArquivo
// ---------------------------------------------------------------------------

function lerArquivoTexto(arquivo: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result ?? ""));
    leitor.onerror = () => rejeitar(new Error("Falha ao ler o arquivo local."));
    leitor.readAsText(arquivo);
  });
}

/**
 * Extrai o texto bruto do arquivo anexado.
 * TXT/MD: leitura local. PDF/DOCX: bucket + edge + remoção do arquivo.
 */
export async function extrairTextoDoArquivo(arquivo: File, userId: string): Promise<string> {
  const nome = arquivo.name.toLowerCase();
  if (arquivo.type.startsWith("text/") || nome.endsWith(".txt") || nome.endsWith(".md")) {
    return (await lerArquivoTexto(arquivo)).trim();
  }

  const nomeSeguro = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const caminho = `${userId}/contratos-import/${Date.now()}-${nomeSeguro}`;

  const { error: erroUpload } = await (supabase as Sb).storage
    .from("mestre-anexos")
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (erroUpload) throw new Error(`Falha ao enviar o arquivo: ${erroUpload.message}`);

  try {
    const { data, error } = await (supabase as Sb).functions.invoke("extrair-contrato-de-arquivo", {
      body: { caminho_arquivo: caminho },
    });
    if (error) throw new Error(`Falha na extração: ${error.message}`);
    if (!data?.ok || !data?.texto) {
      throw new Error(data?.mensagem ?? "Não consegui extrair texto deste arquivo.");
    }
    return String(data.texto).trim();
  } finally {
    // Promessa do modal: "seu documento não é armazenado"
    void (supabase as Sb).storage.from("mestre-anexos").remove([caminho]);
  }
}

// ---------------------------------------------------------------------------
// 2. proporEstrutura
// ---------------------------------------------------------------------------

export interface RespostaProposta {
  proposta: PropostaEstrutura;
  avisos: string[];
}

/** Chama a edge LLM que separa o contrato em 4 baldes. */
export async function proporEstrutura(texto: string): Promise<RespostaProposta> {
  const { data, error } = await (supabase as Sb).functions.invoke("contratos-propor-estrutura", {
    body: { texto },
  });
  if (error) throw new Error(`Falha na análise da IA: ${error.message}`);
  if (!data?.ok || !data?.proposta) {
    throw new Error(data?.mensagem ?? "A IA não conseguiu estruturar este contrato.");
  }
  return { proposta: data.proposta as PropostaEstrutura, avisos: (data.avisos as string[]) ?? [] };
}

// ---------------------------------------------------------------------------
// 3. aplicarProposta
// ---------------------------------------------------------------------------

export interface AplicarPropostaParams {
  ownerId: string;
  produtoId: string;
  proposta: PropostaEstrutura;
}

export interface ResultadoAplicacao {
  ok: boolean;
  mensagem?: string;
  /** id do molde atualizado/criado — pro construtor recarregar e abrir nele. */
  templateId?: string;
}

/**
 * Grava a proposta aprovada:
 *   produto  → clausulas_contrato (miolo) + campos_cliente + exigencias
 *   molde    → conteudo (legado, RPC lê) + conteudo_comum (v2, editor lê)
 */
export async function aplicarProposta({ ownerId, produtoId, proposta }: AplicarPropostaParams): Promise<ResultadoAplicacao> {
  // ── Produto ───────────────────────────────────────────────────────────────
  const { data: produtoSalvo, error: erroProduto } = await (supabase as Sb)
    .from("produtos")
    .update({
      clausulas_contrato: proposta.miolo,
      campos_cliente: proposta.campos,
      exigencias: proposta.exigencias,
    })
    .eq("id", produtoId)
    .eq("user_id", ownerId)
    .select("nome")
    .single();
  if (erroProduto) return { ok: false, mensagem: `Falha ao salvar no produto: ${erroProduto.message}` };

  // O nome do molde vira o TÍTULO do contrato gerado (as RPCs fazem
  // COALESCE(template.nome, 'Contrato')). Sem renomear aqui, o molde ativo
  // seguia com o nome legado (ex: "Limpa Nome - Contrato") e todo contrato
  // novo — mesmo de outro produto — saía com título errado.
  const nomeMolde = produtoSalvo?.nome ? `${produtoSalvo.nome} — Contrato` : "Molde do contrato";

  // ── Molde ativo (mesmo critério da RPC, sem carrinho) ────────────────────
  const { data: moldes, error: erroBusca } = await (supabase as Sb)
    .from("contratos_template")
    .select("id, produto_id, created_at")
    .eq("user_id", ownerId)
    .eq("ativo", true)
    .order("produto_id", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(1);
  if (erroBusca) return { ok: false, mensagem: `Falha ao buscar o molde ativo: ${erroBusca.message}` };

  const cargaMolde = {
    conteudo: proposta.moldura,
    conteudo_comum: textoParaDoc(proposta.moldura),
    nome: nomeMolde,
  };

  if (moldes && moldes.length > 0) {
    const { error: erroMolde } = await (supabase as Sb)
      .from("contratos_template")
      .update(cargaMolde)
      .eq("id", moldes[0].id);
    if (erroMolde) return { ok: false, mensagem: `Produto salvo, mas o molde falhou: ${erroMolde.message}` };
    return { ok: true, templateId: moldes[0].id as string };
  }

  // Sem molde ativo → cria um e ativa
  const { data: criado, error: erroCriar } = await (supabase as Sb)
    .from("contratos_template")
    .insert({
      user_id: ownerId,
      ativo: true,
      // Campos com rótulo/tipo corretos (senão o trigger legado deriva "Cpf"/"Endereco" sem acento)
      campos_cliente: proposta.campos,
      // Slugs do formulário + chaves de prova (página pública liga os passos por elas)
      campos_obrigatorios: [
        ...proposta.campos.map((c) => c.slug),
        ...(proposta.exigencias.selfie ? ["selfie"] : []),
        ...(proposta.exigencias.documento ? ["documento"] : []),
        ...(proposta.exigencias.assinatura_manuscrita ? ["assinatura_manuscrita"] : []),
      ],
      num_testemunhas: proposta.exigencias.num_testemunhas,
      instrucao_selfie: proposta.exigencias.selfie ? proposta.exigencias.instrucao_selfie : null,
      ...cargaMolde,
    })
    .select("id")
    .single();
  if (erroCriar || !criado) {
    return { ok: false, mensagem: `Produto salvo, mas não consegui criar o molde: ${erroCriar?.message}` };
  }
  return { ok: true, templateId: criado.id as string };
}
