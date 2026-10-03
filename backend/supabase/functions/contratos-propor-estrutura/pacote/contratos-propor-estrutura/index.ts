/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * contratos-propor-estrutura v1 — F3c (2026-06-11)
 *
 * Recebe `{ texto }` (contrato real extraído pelo `extrair-contrato-de-arquivo`)
 * e devolve a PROPOSTA da IA em 4 baldes — IA leitora no cadastro, nunca autora na venda:
 *   moldura     → esqueleto reutilizável (vai pro molde ativo do tenant)
 *   miolo       → cláusulas do produto (vai pra produtos.clausulas_contrato)
 *   campos      → [{slug,rotulo,tipo,obrigatorio}] (vai pra produtos.campos_cliente)
 *   exigencias  → {selfie,num_testemunhas,instrucao_selfie} (vai pra produtos.exigencias)
 *
 * O tenant SEMPRE confere na tela antes de salvar (gate humano do blueprint v3 §3).
 * Validação server-side: todo placeholder {{slug}} no texto ganha campo (autocorreção + aviso).
 *
 * verify_jwt: true (só tenant autenticado).
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteUsuarioDoRequest } from "../_shared/supabase.ts";
import { chamarLlmComTools } from "../_shared/openrouter.ts";

const MODELO_PRINCIPAL = "google/gemini-3.1-pro-preview-customtools";
const MODELO_RESERVA = "google/gemini-3.1-flash-lite";
const LIMITE_CARACTERES = 120_000;

const TIPOS_CAMPO = [
  "texto",
  "texto_longo",
  "email",
  "telefone",
  "cpf",
  "cnpj",
  "data",
  "numero",
] as const;
type TipoCampo = (typeof TIPOS_CAMPO)[number];

interface CampoProposto {
  slug: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
}

interface PropostaEstrutura {
  moldura: string;
  miolo: string;
  campos: CampoProposto[];
  exigencias: { selfie: boolean; num_testemunhas: number; instrucao_selfie: string };
  nome_produto_detectado: string | null;
}

const PROMPT_SISTEMA = `Você é um leitor de contratos de uma plataforma brasileira. Recebe o texto bruto de um contrato real e o separa em 4 baldes, devolvendo APENAS um JSON válido (sem markdown, sem comentário, sem texto fora do JSON):

{
  "moldura": "texto da moldura",
  "miolo": "texto das cláusulas do produto",
  "campos": [{"slug": "nome_completo", "rotulo": "Nome completo", "tipo": "texto", "obrigatorio": true}],
  "exigencias": {"selfie": false, "num_testemunhas": 0, "instrucao_selfie": "", "documento": false, "assinatura_manuscrita": true},
  "nome_produto_detectado": "nome do serviço/produto ou null"
}

REGRAS DA MOLDURA (esqueleto reutilizável):
- Mantenha cabeçalho, qualificação das partes, cláusulas gerais (foro, rescisão, LGPD, multa, disposições finais) e o fecho de assinatura. Preserve a redação e a numeração originais — não resuma, não invente.
- Substitua TODO dado pessoal do CONTRATANTE por placeholder {{slug}} (minúsculo_com_underscore, sem acento). Ex.: nome → {{nome_completo}}, CPF → {{cpf}}, endereço → {{endereco}}.
- Dados fixos da empresa CONTRATADA (razão social, CNPJ dela, endereço dela) permanecem como estão.
- REMOVA da moldura as cláusulas que descrevem o serviço/produto específico; no lugar delas escreva UMA linha contendo somente o token exato: {CLAUSULAS_POR_PRODUTO}
- REMOVA valores monetários, preços, entradas e parcelamentos; no lugar escreva: "Os valores, a forma e as condições de pagamento são os constantes do quadro-resumo deste contrato." (o sistema injeta os números reais na geração — nunca deixe número de preço fixo na moldura)

REGRAS DO MIOLO (cláusulas do produto):
- Texto puro das cláusulas que descrevem o serviço/produto: objeto, escopo, prazos de execução, obrigações específicas das partes ligadas a esse serviço.
- Sem valores monetários específicos (troque por "conforme quadro-resumo") e sem placeholders de dados pessoais.

REGRAS DOS CAMPOS:
- Um item por placeholder {{slug}} usado na moldura + qualquer dado que o contratante precise informar.
- "tipo" obrigatoriamente um de: texto, texto_longo, email, telefone, cpf, cnpj, data, numero.
- NÃO crie campo data_assinatura (o sistema preenche sozinho).

REGRAS DAS EXIGÊNCIAS:
- "selfie": true só se o contrato exigir selfie do contratante.
- "documento": true se o contrato exigir cópia/foto do documento de identidade (RG/CNH).
- "assinatura_manuscrita": true se o contrato for assinado com assinatura desenhada/manuscrita — padrão da plataforma, use true salvo se o texto indicar aceite simples.
- "num_testemunhas": quantas testemunhas o fecho do contrato pede (0 se nenhuma).
- "instrucao_selfie": instrução curta em pt-BR se selfie=true, senão "".

Tudo em pt-BR com acentuação correta.`;

// ---------------------------------------------------------------------------
// Parse + saneamento da resposta do LLM
// ---------------------------------------------------------------------------

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

function normalizarSlug(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function humanizarSlug(slug: string): string {
  const texto = slug.replace(/_/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Saneia a proposta + autocorrige placeholder órfão (cria campo + devolve aviso). */
function sanearProposta(cru: Record<string, unknown>): { proposta: PropostaEstrutura; avisos: string[] } {
  const avisos: string[] = [];

  const moldura = String(cru.moldura ?? "").trim();
  const miolo = String(cru.miolo ?? "").trim();
  if (!moldura) throw new Error("Proposta sem moldura.");
  if (!miolo) avisos.push("A IA não separou cláusulas do produto — confira o miolo antes de salvar.");

  // Campos: dedup por slug normalizado + tipo válido
  const vistos = new Set<string>();
  const campos: CampoProposto[] = [];
  for (const item of Array.isArray(cru.campos) ? cru.campos : []) {
    const c = item as Record<string, unknown>;
    const slug = normalizarSlug(String(c.slug ?? ""));
    if (!slug || slug === "data_assinatura" || vistos.has(slug)) continue;
    vistos.add(slug);
    const tipo = TIPOS_CAMPO.includes(c.tipo as TipoCampo) ? (c.tipo as TipoCampo) : "texto";
    campos.push({
      slug,
      rotulo: String(c.rotulo ?? "").trim() || humanizarSlug(slug),
      tipo,
      obrigatorio: c.obrigatorio !== false,
    });
  }

  // Placeholder órfão na moldura/miolo → cria campo automaticamente + aviso
  const placeholders = new Set<string>();
  for (const m of `${moldura}\n${miolo}`.matchAll(/\{\{([a-z0-9_]+)\}\}/g)) placeholders.add(m[1]);
  placeholders.delete("data_assinatura");
  for (const ph of placeholders) {
    if (!vistos.has(ph)) {
      vistos.add(ph);
      campos.push({ slug: ph, rotulo: humanizarSlug(ph), tipo: "texto", obrigatorio: true });
      avisos.push(`Placeholder {{${ph}}} estava sem campo no formulário — campo criado automaticamente, confira.`);
    }
  }

  const ex = (cru.exigencias ?? {}) as Record<string, unknown>;
  const selfie = ex.selfie === true;
  const exigencias = {
    selfie,
    num_testemunhas: Math.max(0, Math.min(2, Number(ex.num_testemunhas ?? 0) || 0)),
    instrucao_selfie: selfie ? String(ex.instrucao_selfie ?? "").trim() : "",
    documento: ex.documento === true,
    // Padrão da plataforma: canvas de assinatura SEMPRE, salvo a IA negar explicitamente.
    assinatura_manuscrita: ex.assinatura_manuscrita !== false,
  };

  const nomeDetectado = typeof cru.nome_produto_detectado === "string" && cru.nome_produto_detectado.trim()
    ? cru.nome_produto_detectado.trim()
    : null;

  return { proposta: { moldura, miolo, campos, exigencias, nome_produto_detectado: nomeDetectado }, avisos };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const clienteUser = criarClienteUsuarioDoRequest(req);
    if (!clienteUser) return jsonRes({ error: "Authorization header ausente." }, 401);
    const { data: { user }, error: authError } = await clienteUser.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Token inválido." }, 401);

    let body: { texto?: string };
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: "Body inválido — esperado JSON { texto }." }, 400);
    }

    const texto = body.texto?.trim();
    if (!texto || texto.length < 200) {
      return jsonRes({ ok: false, mensagem: "Texto do contrato muito curto pra analisar (mínimo ~200 caracteres)." }, 400);
    }
    const textoCortado = texto.slice(0, LIMITE_CARACTERES);

    const mensagens = [
      { role: "system" as const, content: PROMPT_SISTEMA },
      { role: "user" as const, content: `Contrato a analisar:\n\n${textoCortado}` },
    ];

    // Modelo principal com 1 reserva (mesmo padrão de retry da interpretação de mídia v140)
    let bruto = "";
    let modeloUsado = MODELO_PRINCIPAL;
    try {
      const r = await chamarLlmComTools({ modelo: MODELO_PRINCIPAL, mensagens, max_iter: 1 });
      bruto = r.texto_final;
      if (!bruto.trim()) throw new Error("resposta vazia");
    } catch (e) {
      console.warn(`[propor-estrutura] modelo principal falhou (${String(e)}) — tentando reserva`);
      modeloUsado = MODELO_RESERVA;
      const r = await chamarLlmComTools({ modelo: MODELO_RESERVA, mensagens, max_iter: 1 });
      bruto = r.texto_final;
    }

    const { proposta, avisos } = sanearProposta(extrairJson(bruto));
    console.info(
      `[propor-estrutura] ok tenant=${user.id} modelo=${modeloUsado} campos=${proposta.campos.length} avisos=${avisos.length}`,
    );

    return jsonRes({ ok: true, proposta, avisos, modelo: modeloUsado });
  } catch (err) {
    console.error("contratos-propor-estrutura erro:", err);
    return jsonRes({ ok: false, mensagem: `Falha ao analisar o contrato: ${String((err as Error).message ?? err)}` }, 500);
  }
});
