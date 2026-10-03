// comercial-qualificar — lê uma inscrição e devolve:
//   · score comercial 0..1000  (INTERNO: ranqueia no painel do mentor)
//   · nível A/B/C + ação        (INTERNO: para onde esse lead vai)
//   · score da operação hoje → projetado  (o que o LEAD vê)
//   · números inferidos, plano de ação e o roteiro da mentoria
//
// O princípio: O MODELO NÃO SOMA NADA. As checagens de coerência, os números
// inferidos, os dois scores e o ganho em reais são aritmética TypeScript. A IA
// só responde pergunta fechada (intensidade de dor 0..2) e escreve os textos.
//
// Por que DOIS scores: o comercial mede prontidão para COMPRAR — dor alta sobe
// a nota. Projetar esse número depois do plano faria ele CAIR, o que é absurdo
// de mostrar a alguém. O da operação mede saúde e maturidade: é ele que sobe
// quando os buracos fecham, e é ele que aparece para o lead.
//
// A régua de coerência nasceu da análise do Marcelo sobre a lead Josy Gondim
// (29/08/2026): R$350k declarados contra 40 contratos × R$1.000 = R$40k. Ele
// deu 25/100; esta régua dá 30. Sem IA nenhuma.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = "google/gemini-3.7-flash";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Números escritos por gente: "R$ 350.000,00", "uns 300 mil", "20 a 30", "40%"
// ---------------------------------------------------------------------------
function puro(s: string): number | null {
  const temPonto = s.includes("."), temVirgula = s.includes(",");
  let t = s;
  if (temPonto && temVirgula) t = s.replace(/\./g, "").replace(",", ".");
  else if (temVirgula) t = s.replace(",", ".");
  else if (temPonto) {
    const depois = s.split(".").pop() ?? "";
    t = depois.length === 3 ? s.replace(/\./g, "") : s;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function escala(texto: string, n: number): number {
  if (/\b(milh(ão|ao|ões|oes)|kk|mi)\b/.test(texto)) return n * 1e6;
  if (/\b(mil|k)\b/.test(texto)) return n * 1e3;
  return n;
}

function numero(t?: string | null): number | null {
  if (t === null || t === undefined) return null;
  const s = String(t).toLowerCase().trim();
  if (!s) return null;
  const faixa = s.match(/(\d[\d.,]*)\s*(?:a|à|até|-|e)\s*(\d[\d.,]*)/);
  if (faixa) {
    const a = puro(faixa[1]), b = puro(faixa[2]);
    if (a !== null && b !== null) return escala(s, (a + b) / 2);
  }
  const m = s.match(/(\d[\d.,]*)/);
  if (!m) return null;
  const n = puro(m[1]);
  return n === null ? null : escala(s, n);
}

// Português usa vírgula decimal. toFixed() devolve ponto, e "5.3%" num
// documento em português denuncia que o número veio de máquina.
const dec = (n: number, casas = 1) => n.toFixed(casas).replace(".", ",");

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// Coerência: cruza o que a pessoa declarou contra ela mesma.
// Cada conflito vira uma PERGUNTA para o mentor, não uma acusação — "faturamento"
// significa coisas diferentes para pessoas diferentes, e o buraco pode ser
// definição, não mentira.
// ---------------------------------------------------------------------------
// Cada conflito carrega, além do texto, os DOIS números que ele compara — é o
// que permite a tela desenhar o confronto em vez de contar em prosa. O buraco
// visto em barra dói; o mesmo buraco em frase passa batido.
type Visual = {
  tipo: "confronto";
  formato: "brl" | "pct" | "numero";
  a: { rotulo: string; valor: number };
  b: { rotulo: string; valor: number };
};
type Conflito = { titulo: string; achado: string; pergunta: string; peso: number; visual?: Visual };

function coerencia(n: Record<string, number | null>) {
  const { faturamento_mensal: F, ticket_medio: T, contratos_mes: C,
          leads_dia: L, conversao_declarada: X, colaboradores: N,
          investimento_ads: A } = n;
  const conflitos: Conflito[] = [];

  if (F && T && C && F > 0 && T > 0 && C > 0) {
    const implicito = C * T;
    const desvio = Math.abs(F - implicito) / Math.max(F, implicito);
    if (desvio > 0.35) {
      const dif = Math.abs(F - implicito);
      conflitos.push({
        titulo: "O buraco no faturamento",
        achado: `Declarou ${brl(F)} de faturamento, mas ${C} contratos × ${brl(T)} de ticket dão ${brl(implicito)} — diferença de ${brl(dif)}.`,
        pergunta: `Esses ${brl(dif)} vêm de recorrência, de outro produto, ou de um canal que não passa por esses contratos?`,
        peso: 40,
        visual: {
          tipo: "confronto", formato: "brl",
          a: { rotulo: "faturamento que você declarou", valor: F },
          b: { rotulo: `o que ${C} contratos × ${brl(T)} dão`, valor: implicito },
        },
      });
    }
  } else {
    conflitos.push({
      titulo: "Não deu para conferir a conta",
      achado: "Faltou faturamento, ticket ou volume de contratos — sem os três não dá para cruzar nada.",
      pergunta: "Quanto entra por mês, quantos contratos e qual o ticket? Preciso dos três para te mostrar onde está o dinheiro.",
      peso: 25,
    });
  }

  if (C && L && L > 0 && C > 0) {
    const leadsMes = L * 30;
    const real = (C / leadsMes) * 100;
    if (X !== null && Math.abs(X - real) > 5) {
      conflitos.push({
        titulo: "O gargalo da conversão",
        achado: `Afirma ${X}% de conversão, mas ${Math.round(leadsMes)} leads/mês fechando ${C} contratos dão ${dec(real)}% reais.`,
        pergunta: `Esses ${X}% são de quem chega ou de quem você consegue atender? A diferença é o tamanho do vazamento.`,
        peso: 30,
        visual: {
          tipo: "confronto", formato: "pct",
          a: { rotulo: "conversão que você acredita ter", valor: X },
          b: { rotulo: "conversão que os números mostram", valor: Math.round(real * 10) / 10 },
        },
      });
    }
  }

  if (A && A > 0 && F && F > 0 && F < A * 3) {
    conflitos.push({
      titulo: "Tráfego pesando demais",
      achado: `${brl(A)}/mês em Ads para ${brl(F)} de faturamento — o tráfego come mais de um terço do que entra.`,
      pergunta: "Esse investimento se paga em quanto tempo? Quanto do faturamento vem de fato do pago?",
      peso: 15,
      visual: {
        tipo: "confronto", formato: "brl",
        a: { rotulo: "faturamento no mês", valor: F },
        b: { rotulo: "investimento em Ads", valor: A },
      },
    });
  }

  if (C && N && N > 0 && C / N > 30) {
    conflitos.push({
      titulo: "Time pequeno para o volume",
      achado: `${C} contratos/mês para ${N} pessoa(s) — mais de ${Math.round(C / N)} por cabeça.`,
      pergunta: "Como essas pessoas dão conta? O que deixa de ser feito quando aperta?",
      peso: 15,
      visual: {
        tipo: "confronto", formato: "numero",
        a: { rotulo: "contratos por pessoa, no seu time", valor: Math.round(C / N) },
        b: { rotulo: "o que uma pessoa costuma segurar", valor: 30 },
      },
    });
  }

  if (F && N && N > 0 && F / N > 500000) {
    conflitos.push({
      titulo: "Receita por pessoa fora da curva",
      achado: `${brl(F / N)} por colaborador — muito acima do normal para operação de vendas.`,
      pergunta: "Esse faturamento passa todo pelo time, ou boa parte é recorrência que roda sozinha?",
      peso: 10,
    });
  }

  return { nota: Math.max(0, 100 - conflitos.reduce((s, c) => s + c.peso, 0)), conflitos };
}

// ---------------------------------------------------------------------------
// O que a pessoa NÃO escreveu, mas os números dela dizem.
// É o trabalho de um mentor financeiro: derivar, não adivinhar. Tudo aqui sai
// de conta sobre o que ela declarou — nada vem do modelo.
// ---------------------------------------------------------------------------
type Inferido = { rotulo: string; valor: string; conta: string };

function inferir(n: Record<string, number | null>) {
  const { faturamento_mensal: F, ticket_medio: T, contratos_mes: C,
          leads_dia: L, colaboradores: N, investimento_ads: A,
          inadimplencia: I, horas_cobranca: H } = n;

  const itens: Inferido[] = [];
  const bruto: Record<string, number> = {};

  if (L && L > 0) {
    bruto.leads_mes = Math.round(L * 30);
    itens.push({ rotulo: "Leads por mês", valor: String(bruto.leads_mes),
      conta: `${L} por dia × 30` });
  }
  if (bruto.leads_mes && C && C > 0) {
    bruto.conversao_real = (C / bruto.leads_mes) * 100;
    bruto.leads_perdidos = bruto.leads_mes - C;
    itens.push({ rotulo: "Conversão real", valor: dec(bruto.conversao_real) + "%",
      conta: `${C} contratos ÷ ${bruto.leads_mes} leads` });
    itens.push({ rotulo: "Leads que não viraram nada", valor: String(Math.round(bruto.leads_perdidos)),
      conta: `${bruto.leads_mes} − ${C}, todo mês` });
  }
  if (C && T && C > 0 && T > 0) {
    bruto.faturamento_implicito = C * T;
    itens.push({ rotulo: "Faturamento pelos contratos", valor: brl(bruto.faturamento_implicito),
      conta: `${C} × ${brl(T)}` });
  }
  if (A && A > 0 && C && C > 0) {
    bruto.cac = A / C;
    itens.push({ rotulo: "Custo por cliente novo (CAC)", valor: brl(bruto.cac),
      conta: `${brl(A)} de Ads ÷ ${C} contratos` });
  }
  if (A && A > 0 && bruto.leads_mes) {
    bruto.custo_por_lead = A / bruto.leads_mes;
    itens.push({ rotulo: "Custo por lead", valor: brl(bruto.custo_por_lead),
      conta: `${brl(A)} ÷ ${bruto.leads_mes} leads` });
  }
  if (bruto.cac && T && T > 0) {
    bruto.margem_por_cliente = T - bruto.cac;
    itens.push({ rotulo: "Sobra por cliente", valor: brl(bruto.margem_por_cliente),
      conta: `ticket ${brl(T)} − CAC ${brl(bruto.cac)}` });
  }
  if (F && N && N > 0 && F > 0) {
    bruto.receita_por_pessoa = F / N;
    itens.push({ rotulo: "Receita por colaborador", valor: brl(bruto.receita_por_pessoa),
      conta: `${brl(F)} ÷ ${N} pessoa(s)` });
  }
  if (H && H > 0) {
    bruto.horas_cobranca_mes = H * 22;
    itens.push({ rotulo: "Horas/mês só em cobrança", valor: String(Math.round(bruto.horas_cobranca_mes)) + "h",
      conta: `${H}h por dia × 22 dias úteis` });
  }
  if (F && I && F > 0 && I > 0) {
    bruto.inadimplencia_reais = F * (I / 100);
    itens.push({ rotulo: "Dinheiro parado em inadimplência", valor: brl(bruto.inadimplencia_reais),
      conta: `${I}% de ${brl(F)}` });
  }
  if (bruto.leads_perdidos && T && T > 0) {
    bruto.receita_na_mesa = bruto.leads_perdidos * (bruto.conversao_real / 100) * T;
  }

  return { itens, bruto };
}

// ---------------------------------------------------------------------------
// O SCORE DA OPERAÇÃO — 0..1000. Este é o que o lead vê.
// Mede saúde e maturidade, não vontade de comprar. Cinco eixos.
// A projeção aplica o que a Babel entrega e recalcula com a MESMA régua:
// não é um número inventado para impressionar, é a mesma conta com as
// premissas trocadas.
// ---------------------------------------------------------------------------
const NEUTRO = 0.45; // eixo sem dado: nem elogia nem pune

// Cada sinal de dor nasce de uma pergunta. Se a pergunta ficou em branco, o
// sinal volta 0 do modelo — e 0 quer dizer "não tem essa dor", o que viraria
// nota cheia. Falta de dado não é excelência: sem resposta, o eixo vale NEUTRO.
const ORIGEM: Record<string, string> = {
  demora_followup: "dor_followup",
  sem_remarketing: "remarketing",
  cobranca_manual: "fechamento_tipo",
  inadimplencia: "inadimplencia",
  horas_cobranca: "horas_cobranca",
  conversao_baixa: "conversao_declarada",
};

function operacional(
  coer: number,
  inf: Record<string, number>,
  n: Record<string, number | null>,
  dor: Record<string, number>,
  respondeu: (chave: string) => boolean,
) {
  // média só do que foi de fato perguntado E respondido
  const media = (ks: string[]) => {
    const vs = ks.filter((k) => respondeu(ORIGEM[k])).map((k) => dor[k]);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  };

  // hoje
  const metricasHoje = coer / 100;
  const mAuto = media(["cobranca_manual", "sem_remarketing", "demora_followup"]);
  const automacaoHoje = mAuto === null ? NEUTRO : 1 - mAuto / 2;
  const conversaoHoje = inf.conversao_real != null
    ? Math.min(1, inf.conversao_real / 20) : NEUTRO;
  const inad = n.inadimplencia;
  const financeiroHoje = inad != null ? Math.max(0, 1 - Math.min(1, inad / 25)) : NEUTRO;
  const estruturaHoje = respondeu("horas_cobranca")
    ? 1 - dor.horas_cobranca / 2 : NEUTRO;

  // com o plano — o que a Babel de fato entrega, sem prometer perfeição
  const conversaoAlvo = inf.conversao_real != null
    ? Math.min(inf.conversao_real * 1.45, 20) : null;
  const metricasProj = 0.92;
  const automacaoProj = 0.90;
  const conversaoProj = conversaoAlvo != null ? Math.min(1, conversaoAlvo / 20) : 0.75;
  const financeiroProj = inad != null ? Math.max(0, 1 - Math.min(1, (inad * 0.6) / 25)) : 0.75;
  const estruturaProj = 0.85;

  const eixos = [
    { chave: "domínio das métricas", teto: 250, hoje: metricasHoje, proj: metricasProj },
    { chave: "automação da operação", teto: 300, hoje: automacaoHoje, proj: automacaoProj },
    { chave: "conversão", teto: 200, hoje: conversaoHoje, proj: conversaoProj },
    { chave: "saúde financeira", teto: 150, hoje: financeiroHoje, proj: financeiroProj },
    { chave: "estrutura", teto: 100, hoje: estruturaHoje, proj: estruturaProj },
  ].map((e) => ({
    chave: e.chave, teto: e.teto,
    hoje: Math.round(Math.max(0, Math.min(1, e.hoje)) * e.teto),
    projetado: Math.round(Math.max(0, Math.min(1, Math.max(e.hoje, e.proj))) * e.teto),
  }));

  const hoje = eixos.reduce((s, e) => s + e.hoje, 0);
  const projetado = eixos.reduce((s, e) => s + e.projetado, 0);
  return { hoje, projetado, eixos, conversao_alvo: conversaoAlvo };
}

// ---------------------------------------------------------------------------
// O dinheiro que o plano põe de volta. Também é conta, com as premissas ditas.
// ---------------------------------------------------------------------------
function ganho(inf: Record<string, number>, n: Record<string, number | null>, alvo: number | null) {
  const linhas: { rotulo: string; valor: number; premissa: string }[] = [];
  const T = n.ticket_medio, C = n.contratos_mes;

  if (alvo != null && inf.leads_mes && inf.conversao_real != null && T && C) {
    const contratosAlvo = (inf.leads_mes * alvo) / 100;
    const extras = Math.max(0, contratosAlvo - C);
    if (extras >= 0.5) {
      linhas.push({
        rotulo: "Contratos que hoje escapam por demora e falta de follow-up",
        valor: extras * T,
        premissa: `conversão de ${dec(inf.conversao_real)}% para ${dec(alvo)}% — ${Math.round(extras)} contratos a mais por mês`,
      });
    }
  }
  if (inf.inadimplencia_reais) {
    linhas.push({
      rotulo: "Inadimplência recuperada com cobrança automática",
      valor: inf.inadimplencia_reais * 0.4,
      premissa: "40% do que hoje não é pago volta quando a régua de cobrança não depende de alguém lembrar",
    });
  }
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const horas = inf.horas_cobranca_mes ? inf.horas_cobranca_mes * 0.8 : 0;

  // A cascata: de onde ele parte, o que cada movimento acrescenta, onde chega.
  // Sem a base, "+R$18.000" é um número solto; com ela, é uma subida.
  const base = n.faturamento_mensal ?? inf.faturamento_implicito ?? null;
  const cascata = base
    ? { base, passos: linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor })), fim: base + total }
    : null;

  return { linhas, total, horas_devolvidas: horas, cascata };
}

const CHAVES_LONGAS = ["dor_followup", "remarketing", "ferramentas", "objetivo"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const responder = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    // 'modelo' é opcional e serve para comparar modelos com o MESMO prompt —
    // sem isso, qualquer comparação vira opinião.
    const { inscricao_id, modelo } = await req.json();
    const modeloUsado = typeof modelo === "string" && modelo ? modelo : MODELO;
    if (!inscricao_id) return responder({ erro: "inscricao_id é obrigatório" }, 400);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: insc } = await db
      .from("comercial_inscricoes").select("*").eq("id", inscricao_id).single();
    if (!insc) return responder({ erro: "inscrição não encontrada" }, 404);

    const { data: perguntas } = await db
      .from("comercial_perguntas").select("*").order("id");
    if (!perguntas?.length) return responder({ erro: "perguntas não cadastradas" }, 500);

    const R = (insc.respostas ?? {}) as Record<string, string>;

    const num: Record<string, number | null> = {};
    for (const c of ["ticket_medio", "faturamento_mensal", "colaboradores",
                     "investimento_ads", "leads_dia", "conversao_declarada",
                     "contratos_mes", "inadimplencia", "horas_cobranca"]) {
      num[c] = numero(R[c]);
    }

    const coe = coerencia(num);
    const confianca = 0.4 + 0.6 * (coe.nota / 100);
    const inf = inferir(num);

    const fat = ((v: number | null) => v === null ? 0
      : v < 20000 ? 15 : v < 50000 ? 45 : v < 150000 ? 85 : v < 400000 ? 115 : v < 1e6 ? 140 : 150)(num.faturamento_mensal);
    const tic = ((v: number | null) => v === null ? 0
      : v < 300 ? 10 : v < 1000 ? 30 : v < 5000 ? 55 : v < 20000 ? 75 : 90)(num.ticket_medio);
    const col = ((v: number | null) => v === null ? 0
      : v < 2 ? 15 : v < 6 ? 35 : v < 21 ? 60 : 80)(num.colaboradores);
    const ads = num.investimento_ads === null ? 5
      : num.investimento_ads < 1 ? 5 : num.investimento_ads < 3000 ? 25
      : num.investimento_ads < 15000 ? 50 : num.investimento_ads < 50000 ? 70 : 80;
    const porteBruto = fat + tic + col + ads;
    const portePontos = Math.round(porteBruto * confianca);

    const respondidas = perguntas.filter((q) => {
      const v = R[q.chave];
      return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
    }).length;
    const completude = Math.round((respondidas / perguntas.length) * 80);
    const compr = CHAVES_LONGAS.reduce((s, c) => {
      const t = (R[c] ?? "").trim();
      return s + Math.min(1, t.length / 220) * (35 / CHAVES_LONGAS.length);
    }, 0);

    const { data: chave } = await db
      .from("chaves_api").select("chave")
      .eq("provedor", "openrouter").eq("ativa", true).limit(1).single();
    if (!chave?.chave) return responder({ erro: "chave da OpenRouter não cadastrada" }, 500);

    const transcricao = perguntas.map((q) =>
      `[${q.capitulo}] ${q.rotulo}\n→ ${R[q.chave] ?? "(não respondeu)"}`).join("\n\n");
    // O dossiê externo entra no prompt como FATO VERIFICADO — coisa que a
    // pessoa não escreveu no formulário e que o mentor pode citar na call.
    // Sem isso o plano fica preso ao que ela mesma declarou.
    const D = (insc.dossie ?? {}) as any;
    const linhasDossie: string[] = [];
    if (D.receita) {
      const r = D.receita;
      linhasDossie.push(`• Receita Federal: ${r.razao_social}${r.nome_fantasia ? ` (${r.nome_fantasia})` : ""}` +
        ` · ${r.situacao} desde ${r.abertura} · porte ${r.porte}` +
        ` · Simples: ${r.simples === true ? "sim" : r.simples === false ? "NÃO" : "não informado"}` +
        ` · capital ${r.capital_social} · ${r.cnae} · ${r.municipio}/${r.uf}`);
    }
    if (D.divida_uniao) {
      linhasDossie.push(D.divida_uniao.na_lista
        ? `• Dívida Ativa da União: CONSTA — ${D.divida_uniao.inscricoes} inscrições, ajuizado=${D.divida_uniao.ajuizado}, desde ${D.divida_uniao.desde}`
        : `• Dívida Ativa da União: não consta`);
    }
    if (D.instagram) {
      const g = D.instagram, rt = g.ritmo ?? {};
      linhasDossie.push(`• Instagram @${g.arroba}: ${g.seguidores} seguidores, ${g.posts_total} posts, categoria ${g.categoria}` +
        (rt.leitura ? ` · RITMO: ${rt.leitura} (último post há ${rt.dias_desde_o_ultimo} dias; ele postava a cada ${rt.intervalo_mediano_dias} dias)` : "") +
        (rt.engajamento_pct != null ? ` · ENGAJAMENTO: ${rt.engajamento_pct}% dos seguidores curtem o post mediano` : ""));
      if (g.bio) linhasDossie.push(`• Bio do Instagram: ${String(g.bio).slice(0, 200)}`);
    }
    if (D.reclame_aqui?.achados) {
      linhasDossie.push(`• Reclame Aqui: ${D.reclame_aqui.achados} reclamação(ões) pública(s) — ` +
        (D.reclame_aqui.itens ?? []).slice(0, 3).map((i: any) => `"${i.titulo}"`).join("; "));
    }
    if (D.processos?.achados) {
      linhasDossie.push(`• JusBrasil: ${D.processos.achados} processo(s) público(s)`);
    }

    const conflitosTxt = coe.conflitos.length
      ? coe.conflitos.map((c) => `• ${c.titulo}: ${c.achado}`).join("\n")
      : "• Nenhum conflito aritmético nos números declarados.";
    const inferidosTxt = inf.itens.length
      ? inf.itens.map((i) => `• ${i.rotulo}: ${i.valor} (${i.conta})`).join("\n")
      : "• Sem números suficientes para derivar indicadores.";

    const prompt = `Você é a Babel — mentora empresarial digital, com cabeça de financeiro. Está lendo o pré-cadastro de um empresário e vai devolver a ele um diagnóstico e um plano de ação.

TOM: de quem quer genuinamente ajudar, não de quem quer vender. Você fala como um consultor sênior que já viu essa operação cem vezes: direto, específico, sem adjetivo vazio, sem jargão de agência. Nunca use "solução", "inovador", "transformar", "revolucionar". Frases curtas. Português do Brasil.

O time de vendas se chama MENTORES e a reunião de 30 minutos é uma MENTORIA — nunca "apresentação", "demo" ou "reunião comercial".

O QUE A BABEL FAZ: memória de todos os clientes; atendimento 24/7 sem fila; cadência e follow-up padronizados que ninguém precisa lembrar de fazer; remarketing ativo em quem não comprou; as métricas da operação respondidas em linguagem natural, como se perguntasse ao ChatGPT; contrato e cobrança sem trabalho manual. Custa menos que um funcionário.

RESPOSTAS DO EMPRESÁRIO:
${transcricao}

CONFLITOS ARITMÉTICOS JÁ CALCULADOS (use, não recalcule):
${conflitosTxt}

NÚMEROS JÁ DERIVADOS DOS DADOS DELE (use, não recalcule):
${inferidosTxt}

O QUE APURAMOS FORA DO FORMULÁRIO (fatos verificados, com fonte — ele NÃO escreveu isso):
${linhasDossie.length ? linhasDossie.join("\n") : "• Nada apurado ainda."}

Devolva SOMENTE JSON, sem cercas:
{
  "dor": { "demora_followup":0|1|2, "sem_remarketing":0|1|2, "cobranca_manual":0|1|2,
           "inadimplencia":0|1|2, "horas_cobranca":0|1|2, "conversao_baixa":0|1|2, "porque":"uma frase" },
  "prontidao": { "objetivo":0..70, "urgencia":0..40, "maturidade":0..40, "porque":"uma frase" },
  "concretude": 0..5,
  "plano": {
    "acoes": [
      { "titulo":"verbo no infinitivo, específico",
        "por_que":"o que está acontecendo hoje na operação DELE, citando o número dele",
        "como":"o que muda na prática quando a Babel entra",
        "prazo":"primeiros 15 dias | 30 dias | 60 dias" }
    ],
    "primeiro_movimento":"a única coisa que ele deveria fazer nesta semana, mesmo sem contratar nada"
  },
  "mentoria": {
    "dores": [ {"dor":"o que dói, uma frase","solucao":"como a Babel resolve, uma frase"} ],
    "ponto_chave":"pegue o objetivo que ELE declarou e mostre que a Babel entrega além dele"
  },
  "convite":"2 ou 3 frases convidando para a mentoria. Ofereça ajuda, não produto: diga o que ELE sai sabendo depois dos 30 minutos, mesmo que não feche nada. Cite um número real dele.",
  "resumo":"uma linha que o mentor lê antes de ligar",
  "isca":"a frase dos 10 primeiros segundos da ligação, tirada da maior dor dele"
}

REGRAS:
- "plano.acoes": de 3 a 5, ordenadas por dinheiro que destravam. Cada "por_que" DEVE citar um número dele (faturamento, leads, conversão, contratos, horas, inadimplência).
- Dor: 0 = não tem, 1 = tem, 2 = é grave. NÃO pontue "não domina as próprias métricas" nos seis sinais — essa é calculada fora.
- Se houver conflito aritmético, a PRIMEIRA dor de "mentoria.dores" é sobre não dominar as próprias métricas.
- Em "convite", nada de "condição especial" ou "vagas limitadas" genéricos. O que atrai é ele sair com o mapa da própria operação na mão.
- Se houver fatos apurados fora do formulário, USE pelo menos um deles no plano ou nas dores — é o que prova que alguém olhou a operação dele de verdade. Cite com naturalidade ("vi que seu Instagram parou há 29 dias"), nunca como acusação.
- NUNCA invente valor em reais. Só use cifras que aparecem acima, nas respostas dele ou nos números derivados. Multiplicar leads por ticket para criar um "potencial represado" é errado — nem todo lead compra, e o número sai mentiroso.`;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modeloUsado, temperature: 0,
        response_format: { type: "json_object" },
        // usage.include faz a OpenRouter devolver o custo real desta chamada.
        // Sem isso o preço do diagnóstico vira estimativa, e estimativa de
        // custo tem o costume de ficar 3× abaixo do que se paga.
        usage: { include: true },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return responder({ erro: `OpenRouter ${resp.status}: ${await resp.text()}` }, 502);

    const bruto = await resp.json();
    const uso = bruto?.usage ?? null;
    const cru = bruto?.choices?.[0]?.message?.content ?? "{}";
    let ia: any;
    try { ia = JSON.parse(cru.replace(/^```json\s*|\s*```$/g, "").trim()) }
    catch { return responder({ erro: "a IA não devolveu JSON válido" }, 502) }

    // ---- a aritmética, aqui ----------------------------------------------
    const SINAIS = ["demora_followup", "sem_remarketing", "cobranca_manual",
                    "inadimplencia", "horas_cobranca", "conversao_baixa"] as const;
    const lim = (v: any, teto: number) => Math.max(0, Math.min(teto, Math.round(Number(v) || 0)));

    const dorSinais: Record<string, number> = {};
    SINAIS.forEach((k) => { dorSinais[k] = lim(ia?.dor?.[k], 2) });

    // A coerência tem dois usos de sinais contrários, e os dois estão certos:
    // desconta o porte (não dá para confiar em número que não fecha) e vira
    // uma dor própria — foi a "Dor 01" do Marcelo na análise da Josy.
    const metricasCegas = Math.round((1 - coe.nota / 100) * 60);
    const dorPontos = SINAIS.reduce((s, k) => s + (dorSinais[k] / 2) * 40, 0) + metricasCegas;
    const prontidao = lim(ia?.prontidao?.objetivo, 70) + lim(ia?.prontidao?.urgencia, 40)
                    + lim(ia?.prontidao?.maturidade, 40);
    const substancia = Math.round(compr + (lim(ia?.concretude, 5) / 5) * 35);
    const preenchimento = completude + substancia;

    const score = Math.max(0, Math.min(1000,
      Math.round(portePontos + dorPontos + prontidao + preenchimento)));

    const F = num.faturamento_mensal;
    let nivel: "A" | "B" | "C";
    if (score < 400 || (F !== null && F < 20000)) nivel = "C";
    else if (score >= 700 && F !== null && F >= 50000) nivel = "A";
    else nivel = "B";

    const ACAO = {
      A: "Mentoria gratuita de 30 minutos, um a um, com Mentor Premium.",
      B: "Comunidade ou mentoria em grupo — cabe a Mentor em formação.",
      C: "PDF com o diagnóstico via WhatsApp. Não ocupa agenda do time.",
    } as const;

    const respondeu = (chave: string) => {
      const v = R[chave];
      return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
    };
    const op = operacional(coe.nota, inf.bruto, num, dorSinais, respondeu);
    const gan = ganho(inf.bruto, num, op.conversao_alvo);

    const analise = {
      nivel,
      nivel_rotulo: { A: "Quente", B: "Morno", C: "Frio" }[nivel],
      acao: ACAO[nivel],
      coerencia: { nota: coe.nota, conflitos: coe.conflitos },
      blocos: {
        porte: { pontos: portePontos, teto: 400, bruto: porteBruto, confianca: Math.round(confianca * 100) / 100 },
        dor: { pontos: Math.round(dorPontos), teto: 300, sinais: { ...dorSinais, metricas_cegas: metricasCegas }, porque: ia?.dor?.porque ?? "" },
        prontidao: { pontos: prontidao, teto: 150, porque: ia?.prontidao?.porque ?? "" },
        preenchimento: { pontos: preenchimento, teto: 150, respondidas, total: perguntas.length },
      },
      // ---- o que o lead vê ----
      operacao: op,
      inferidos: inf.itens,
      ganho: gan,
      plano: ia?.plano ?? {},
      convite: ia?.convite ?? "",
      // ---- interno ----
      mentoria: ia?.mentoria ?? {},
      resumo: ia?.resumo ?? "",
      isca: ia?.isca ?? "",
      numeros: num,
      dossie: Object.keys(D).length ? D : null,
      modelo: modeloUsado,
      uso: uso ? {
        entrada: uso.prompt_tokens, saida: uso.completion_tokens,
        total: uso.total_tokens, custo_usd: uso.cost ?? null,
      } : null,
      gerado_em: new Date().toISOString(),
    };

    await db.from("comercial_inscricoes").update({
      score, nivel, coerencia: coe.nota, analise, completa: true,
      atualizado_em: new Date().toISOString(),
    }).eq("id", inscricao_id);

    return responder({ score, nivel, coerencia: coe.nota, analise });
  } catch (e) {
    return responder({ erro: String(e) }, 500);
  }
});
