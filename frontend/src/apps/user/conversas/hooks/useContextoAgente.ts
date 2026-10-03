/**
 * useContextoAgente — o cartão de contexto da aba "Agente" do Dossiê.
 *
 * Responde "com o que ela está atendendo esta conversa AGORA": quem ela diz que
 * é, que empresa, que PIX e contrato ela tem em mãos, e quanto do conhecimento e
 * das ferramentas está de fato ligado.
 *
 * **Não carrega sozinho.** Só busca quando alguém clica em Atualizar — o valor
 * do painel é ser uma foto do instante, e dado que aparece pronto ao abrir a aba
 * mente sobre quando foi lido. `carregado` diz se já houve uma leitura.
 *
 * Fontes (leitura pura, zero DDL):
 *  - `conversas`            → agente_id, tenant_id, cargo_ativo_id
 *  - `agentes`              → nome do atendente
 *  - `empresas`             → nome da empresa (cadastro, não o texto do contrato)
 *  - `contratos_template`   → contrato ativo e chave PIX do tenant
 *  - `blocos_conhecimento`  → ativos / total do agente, e os valores em R$ que
 *                             aparecem neles (o que ela pode falar de preço)
 *  - `produtos`             → catálogo ativo do tenant: à vista e parcelado
 *  - `cargo_ferramentas` ⋈ `ferramentas_dinamicas` → ativas / total do cargo
 *  - `prompts_turno`        → o system prompt inteiro do último turno
 *
 * Duas fontes de preço de propósito (2026-09-07): o catálogo é o que vale no
 * link de pagamento e no contrato; o conhecimento é o que ela fala no papo. No
 * tenant da Tríade o catálogo tinha 2 produtos e o conhecimento citava 12
 * valores que não existem em produto nenhum. Mostrar só o catálogo responderia
 * "2 serviços" para um agente que fala uma dezena de preços.
 *
 * Defensivo: cada leitura falha sozinha. Painel de diagnóstico nunca pode
 * derrubar a tela de Conversas.
 */

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cast bruto: tabelas de observabilidade e config estão fora dos types gerados
// (mesmo padrão de acoes-cliente.ts e AbaFinanceiro.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quantos de quantos — o painel mostra número, nunca a lista. */
export interface Contagem {
  ativos: number;
  total: number;
}

/** Uma linha da tabela de serviços: o que ela vende e por quanto. */
export interface ItemCatalogo {
  nome: string;
  /** "R$ 597" — null quando o produto não tem preço cadastrado. */
  a_vista: string | null;
  /** "R$ 117 + 5x R$ 147" — null quando só vende à vista. */
  parcelado: string | null;
}

/** Valor em R$ que aparece no conhecimento do agente. */
export interface PrecoNoConhecimento {
  /** Como está escrito no bloco, normalizado: "1.500,00". */
  valor: string;
  /** Em quantos blocos ativos ele aparece. */
  blocos: number;
  /** false = nenhum produto do catálogo tem este valor. */
  no_catalogo: boolean;
}

export interface ContextoAgente {
  /** Nome pelo qual ela se apresenta ao lead. */
  atendente: string | null;
  /** Razão social / nome fantasia que ela usa ao falar da casa. */
  empresa: string | null;
  /** Chave PIX que ela passa pra receber. */
  pix: string | null;
  /** Modelo de contrato ativo do tenant — o que ela usa pra fechar. */
  contrato: string | null;
  conhecimento: Contagem | null;
  tools: Contagem | null;
  /** Serviços e preços do catálogo do tenant — o que vale no contrato. */
  catalogo: ItemCatalogo[];
  /** Valores citados nos blocos ativos — o que ela pode falar no papo. */
  precos_no_conhecimento: PrecoNoConhecimento[];
  /** System prompt inteiro do último turno. null quando não há snapshot. */
  prompt_completo: string | null;
  /** Quando esta leitura foi feita (ISO). null = nunca leu. */
  lido_em: string | null;
}

const VAZIO: ContextoAgente = {
  atendente: null,
  empresa: null,
  pix: null,
  contrato: null,
  conhecimento: null,
  tools: null,
  catalogo: [],
  precos_no_conhecimento: [],
  prompt_completo: null,
  lido_em: null,
};

function texto(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type Ancoras = {
  agente_id: string | null;
  tenant_id: string | null;
  cargo_ativo_id: string | null;
};

/** As chaves da conversa — tudo o mais pendura aqui. */
async function lerAncoras(conversaId: string): Promise<Ancoras> {
  const { data } = await (supabase as SupabaseBruto)
    .from("conversas")
    .select("agente_id, tenant_id, cargo_ativo_id")
    .eq("id", conversaId)
    .maybeSingle();
  return {
    agente_id: texto(data?.agente_id) || null,
    tenant_id: texto(data?.tenant_id) || null,
    cargo_ativo_id: texto(data?.cargo_ativo_id) || null,
  };
}

async function lerNomeAtendente(agenteId: string): Promise<string | null> {
  const { data } = await (supabase as SupabaseBruto)
    .from("agentes")
    .select("nome_agente")
    .eq("id", agenteId)
    .maybeSingle();
  return texto(data?.nome_agente) || null;
}

/**
 * Nome da empresa. Fonte é o cadastro (`empresas.nome`), não o texto congelado
 * nos contratos já emitidos: contrato velho guarda a razão social da época e faz
 * o painel mentir. (Conferido em 2026-09-06: um mesmo tenant tem 1.039 contratos
 * com uma razão social antiga e 5 com a atual.)
 */
async function lerEmpresa(tenantId: string): Promise<string | null> {
  const { data } = await (supabase as SupabaseBruto)
    .from("empresas")
    .select("nome")
    .eq("user_id", tenantId)
    .limit(1)
    .maybeSingle();
  return texto(data?.nome) || null;
}

/**
 * Contrato e PIX ativos do tenant, do modelo (`contratos_template`) — é de onde
 * sai todo contrato que ela manda e a chave que ela passa. Um tenant pode ter um
 * modelo ativo por produto; nesse caso o painel mostra o mais recente e avisa
 * quantos mais existem, em vez de fingir que só há um.
 */
async function lerContratoAtivo(
  tenantId: string,
): Promise<{ pix: string | null; contrato: string | null }> {
  const { data } = await (supabase as SupabaseBruto)
    .from("contratos_template")
    .select("nome, chave_pix, updated_at")
    .eq("user_id", tenantId)
    .eq("ativo", true)
    .order("updated_at", { ascending: false });

  const linhas = lista(data) as Array<{ nome?: string; chave_pix?: string }>;
  if (linhas.length === 0) return { pix: null, contrato: null };

  const principal = linhas[0];
  const outros = linhas.length - 1;
  const nome = texto(principal.nome) || null;
  return {
    pix: texto(principal.chave_pix) || null,
    contrato: nome && outros > 0 ? `${nome} (+${outros})` : nome,
  };
}

/** Conhecimento do agente: quantos blocos ligados de quantos que existem. */
async function contarConhecimento(agenteId: string): Promise<Contagem | null> {
  const base = () =>
    (supabase as SupabaseBruto)
      .from("blocos_conhecimento")
      .select("id", { count: "exact", head: true })
      .eq("agente_id", agenteId)
      .is("deleted_at", null);

  const [totalRes, ativosRes] = await Promise.all([base(), base().eq("ativo", true)]);
  const total = Number(totalRes?.count ?? 0);
  const ativos = Number(ativosRes?.count ?? 0);
  if (totalRes?.error && ativosRes?.error) return null;
  return { ativos, total };
}

/** Ferramentas do cargo ativo: quantas ligadas de quantas plugadas no cargo. */
async function contarTools(cargoId: string): Promise<Contagem | null> {
  const { data, error } = await (supabase as SupabaseBruto)
    .from("cargo_ferramentas")
    .select("ferramenta_id, ferramentas_dinamicas!inner(ativo)")
    .eq("cargo_id", cargoId);
  if (error) return null;

  const linhas = lista(data) as Array<{ ferramentas_dinamicas?: { ativo?: boolean } }>;
  return {
    total: linhas.length,
    ativos: linhas.filter((l) => l.ferramentas_dinamicas?.ativo === true).length,
  };
}

/** Centavos → "R$ 597" / "R$ 1.297,50" (só mostra centavos quando existem). */
function emReais(centavos: unknown): string | null {
  const n = Number(centavos);
  if (!Number.isFinite(n) || n <= 0) return null;
  const reais = n / 100;
  return `R$ ${reais.toLocaleString("pt-BR", {
    minimumFractionDigits: reais % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

type ProdutoBruto = {
  nome?: string;
  preco_centavos?: number | null;
  entrada_centavos?: number | null;
  max_parcelas?: number | null;
  valor_parcela_cravado_centavos?: number | null;
  parcelas_oferecidas?: number[] | null;
};

/**
 * Monta "R$ 117 + 5x R$ 147" a partir dos campos de parcelamento do produto.
 *
 * `parcelas_oferecidas` manda quando existe (é o que o tenant escolheu oferecer
 * no contrato); `max_parcelas` é o legado. Sem parcela cravada ou com uma só
 * parcela sem entrada, não há plano parcelado a mostrar — devolve null e a
 * coluna fica com travessão, em vez de inventar um plano que o contrato não faz.
 */
function planoParcelado(p: ProdutoBruto): string | null {
  const parcela = emReais(p.valor_parcela_cravado_centavos);
  if (!parcela) return null;
  const oferecidas = Array.isArray(p.parcelas_oferecidas) ? p.parcelas_oferecidas : [];
  const vezes =
    oferecidas.length > 0
      ? Math.max(...oferecidas.map(Number).filter(Number.isFinite))
      : Number(p.max_parcelas ?? 0);
  if (!Number.isFinite(vezes) || vezes < 1) return null;
  const entrada = emReais(p.entrada_centavos);
  if (!entrada && vezes <= 1) return null;
  return entrada ? `${entrada} + ${vezes}x ${parcela}` : `${vezes}x ${parcela}`;
}

/**
 * Catálogo do tenant: o que ela vende e por quanto. Filtra por `user_id` porque
 * é assim que o motor monta o carrinho (`tools-internas.ts`) — produto sem
 * `agente_id` vale pro tenant inteiro. Inativo fica de fora: agente não oferece.
 */
async function lerCatalogo(tenantId: string): Promise<ItemCatalogo[]> {
  const { data } = await (supabase as SupabaseBruto)
    .from("produtos")
    .select(
      "nome, preco_centavos, entrada_centavos, max_parcelas, valor_parcela_cravado_centavos, parcelas_oferecidas, ordem",
    )
    .eq("user_id", tenantId)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .limit(50);

  return (lista(data) as ProdutoBruto[])
    .map((p) => ({
      nome: texto(p.nome) || "(sem nome)",
      a_vista: emReais(p.preco_centavos),
      parcelado: planoParcelado(p),
    }))
    .filter((i) => i.a_vista || i.parcelado);
}

/** Toda ocorrência de "R$ 1.234,56" num texto, normalizada pra comparação. */
function valoresDoTexto(t: string): string[] {
  return (t.match(/R\$\s?\d[\d.]*(?:,\d{2})?/g) ?? []).map((v) =>
    v.replace(/^R\$\s?/, "").replace(/\.$/, ""),
  );
}

/** Compara "597" com "597,00" — o mesmo dinheiro escrito de dois jeitos. */
function comoNumero(v: string): number {
  return Number(v.replace(/\./g, "").replace(",", "."));
}

/**
 * Preços que aparecem no conhecimento ATIVO do agente.
 *
 * Existe porque o catálogo não é a fonte do que ela fala: no tenant da Tríade
 * (2026-09-07) `produtos` tinha 2 itens com preço e o conhecimento da Carol
 * tinha 69 blocos citando valor — inclusive R$ 1.500, R$ 900 e R$ 297, que não
 * são preço de produto nenhum. É essa divergência que o painel precisa mostrar.
 */
async function lerPrecosDoConhecimento(
  agenteId: string,
  catalogo: ItemCatalogo[],
): Promise<PrecoNoConhecimento[]> {
  const { data } = await (supabase as SupabaseBruto)
    .from("blocos_conhecimento")
    .select("content")
    .eq("agente_id", agenteId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .ilike("content", "%R$%")
    .limit(300);

  const noCatalogo = new Set<number>();
  for (const item of catalogo) {
    for (const v of [item.a_vista, item.parcelado].filter(Boolean) as string[]) {
      for (const bruto of valoresDoTexto(v)) noCatalogo.add(comoNumero(bruto));
    }
  }

  const contagem = new Map<string, number>();
  for (const linha of lista(data) as Array<{ content?: string }>) {
    // Um bloco que repete o mesmo valor 3 vezes conta como 1 bloco, não 3.
    for (const v of new Set(valoresDoTexto(texto(linha.content)))) {
      contagem.set(v, (contagem.get(v) ?? 0) + 1);
    }
  }

  return [...contagem.entries()]
    .map(([valor, blocos]) => ({
      valor,
      blocos,
      no_catalogo: noCatalogo.has(comoNumero(valor)),
    }))
    .filter((p) => Number.isFinite(comoNumero(p.valor)))
    .sort((a, b) => b.blocos - a.blocos || comoNumero(b.valor) - comoNumero(a.valor));
}

/** System prompt inteiro do último turno — a saída de emergência do painel. */
async function lerPromptDoTurno(conversaId: string): Promise<string | null> {
  const { data } = await (supabase as SupabaseBruto)
    .from("prompts_turno")
    .select("prompt_completo")
    .eq("conversa_id", conversaId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.prompt_completo ? String(data.prompt_completo) : null;
}

/**
 * Contexto do agente pra uma conversa. Nasce vazio — só busca quando
 * `recarregar()` é chamado.
 */
export function useContextoAgente(conversaId: string | null) {
  const [contexto, setContexto] = useState<ContextoAgente>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    if (!conversaId || !EH_UUID.test(conversaId)) {
      setContexto(VAZIO);
      setCarregado(true);
      return;
    }
    setCarregando(true);

    const ancoras = await lerAncoras(conversaId).catch(
      (): Ancoras => ({ agente_id: null, tenant_id: null, cargo_ativo_id: null }),
    );

    const temTenant = !!ancoras.tenant_id && EH_UUID.test(ancoras.tenant_id);
    const [atendente, empresa, doContrato, conhecimento, tools, prompt] = await Promise.all([
      ancoras.agente_id ? lerNomeAtendente(ancoras.agente_id).catch(() => null) : null,
      temTenant ? lerEmpresa(ancoras.tenant_id as string).catch(() => null) : null,
      temTenant
        ? lerContratoAtivo(ancoras.tenant_id as string).catch(() => ({ pix: null, contrato: null }))
        : { pix: null, contrato: null },
      ancoras.agente_id ? contarConhecimento(ancoras.agente_id).catch(() => null) : null,
      ancoras.cargo_ativo_id ? contarTools(ancoras.cargo_ativo_id).catch(() => null) : null,
      lerPromptDoTurno(conversaId).catch(() => null),
    ]);

    // Catálogo antes dos preços do conhecimento: é ele que diz quais valores
    // têm respaldo em produto e quais a agente só conhece de ouvir falar.
    const catalogo = temTenant
      ? await lerCatalogo(ancoras.tenant_id as string).catch(() => [] as ItemCatalogo[])
      : [];
    const precos = ancoras.agente_id
      ? await lerPrecosDoConhecimento(ancoras.agente_id, catalogo).catch(
          () => [] as PrecoNoConhecimento[],
        )
      : [];

    setContexto({
      atendente,
      empresa,
      ...doContrato,
      conhecimento,
      tools,
      catalogo,
      precos_no_conhecimento: precos,
      prompt_completo: prompt,
      lido_em: new Date().toISOString(),
    });
    setCarregando(false);
    setCarregado(true);
  }, [conversaId]);

  return { contexto, carregando, carregado, recarregar };
}
