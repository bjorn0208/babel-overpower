// _shared/tools-rifas.ts — pacote VENDA/LEITURA do app Rifas pro agente.
//
// Divisão de canal (decisão Theus 2026-09-06):
//   • ESTE arquivo  → tools que o agente usa falando com LEAD (externo) e também
//     valem pro dono no interno. Só lê e vende. Nada aqui muda preço, sorteia,
//     aprova pagamento ou apaga rifa.
//   • tools-rifas-admin.ts → poder de dono. Carregado SÓ no canal interno.
// Motivo da divisão: lead não pode induzir o agente por conversa a sortear a rifa
// nem a aprovar o próprio comprovante.
//
// Catraca: `rifa_pode_vender` (app instalado + toggle) — o motor já faz splice das
// tools quando bloqueado; a checagem aqui é defesa em profundidade.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { CtxFerramenta, ResultadoFerramenta } from "./tools-internas.ts";
import { primeiroNome } from "./nomes.ts";

// deno-lint-ignore no-explicit-any
export type HandlerRifa = (sb: SupabaseClient, ctx: CtxFerramenta, args: any) => Promise<ResultadoFerramenta>;

const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br").replace(/\/+$/, "");

export function linkRifa(chave: string, pedidoToken?: string): string {
  return `${APP_PUBLIC_URL}/rifa/${chave}${pedidoToken ? `?pedido=${pedidoToken}` : ""}`;
}

export const fmtCentavos = (c: number) =>
  (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const HORARIOS_SORTEIO: Record<string, string> = {
  loteria_federal: "Loteria Federal — qua 20:00 · dom 11:00",
  ppt: "PPT — seg a sáb 09:20",
  ptm: "PTM — seg a sáb 11:20",
  pt_rio: "PT Rio — seg a sáb 14:20",
  ptv: "PTV — seg a sáb 16:20",
  ptn: "PTN — seg a sáb 18:20",
  corujinha: "Corujinha — seg a sáb 21:20",
  plataforma: "sorteador da plataforma",
};

/**
 * Horário PADRÃO de cada método, por dia da semana (0=domingo). Último recurso
 * quando a rifa não tem hora cadastrada — sai marcado como "padrão do método",
 * nunca como se fosse dado da rifa.
 */
const PADRAO_METODO: Record<string, Record<number, string>> = {
  loteria_federal: { 0: "11:00", 3: "20:00" },
  ppt: { 1: "09:20", 2: "09:20", 3: "09:20", 4: "09:20", 5: "09:20", 6: "09:20" },
  ptm: { 1: "11:20", 2: "11:20", 3: "11:20", 4: "11:20", 5: "11:20", 6: "11:20" },
  pt_rio: { 1: "14:20", 2: "14:20", 3: "14:20", 4: "14:20", 5: "14:20", 6: "14:20" },
  ptv: { 1: "16:20", 2: "16:20", 3: "16:20", 4: "16:20", 5: "16:20", 6: "16:20" },
  ptn: { 1: "18:20", 2: "18:20", 3: "18:20", 4: "18:20", 5: "18:20", 6: "18:20" },
  corujinha: { 1: "21:20", 2: "21:20", 3: "21:20", 4: "21:20", 5: "21:20", 6: "21:20" },
};

const DIAS_PT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** "19h" · "19:30" · "19h30" · "7" → "HH:MM". Espelha `parseHora` do cron de aviso. */
function normalizarHora(txt: string | null | undefined): string | null {
  if (!txt) return null;
  const m = String(txt).trim().match(/^(\d{1,2})\s*[:hH]?\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Data de hoje em BRT como YYYY-MM-DD — o servidor roda em UTC. */
function hojeBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Monta a resposta EXATA de "quando é o sorteio". Antes a tool devolvia a tabela
 * de horários de todos os métodos e deixava a LLM interpretar — resultado real
 * em produção (06/09): lead perguntou o horário e o agente respondeu "no horário
 * marcado", sem dado nenhum. Agora a frase vem pronta e a origem vem declarada,
 * pra LLM não ter o que inventar.
 *
 * Ordem: `rifas.hora_sorteio` → `rifa_imagens.hora_sorteio` (arte mais recente)
 * → horário padrão do método no dia da semana da data prevista → nada.
 */
export async function resolverSorteio(
  sb: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  rifa: any,
): Promise<{ texto: string; hora: string | null; exata: boolean }> {
  const data: string | null = rifa?.data_sorteio_prevista ?? null;
  const metodo = String(rifa?.metodo_sorteio ?? "");

  let hora = normalizarHora(rifa?.hora_sorteio);
  let origem: "rifa" | "arte" | "padrao" | null = hora ? "rifa" : null;

  if (!hora) {
    const { data: arte } = await sb
      .from("rifa_imagens")
      .select("hora_sorteio")
      .eq("rifa_id", rifa.id)
      .is("deleted_at", null)
      .not("hora_sorteio", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    hora = normalizarHora(arte?.hora_sorteio);
    if (hora) origem = "arte";
  }

  if (!data) {
    return {
      texto: hora
        ? `Sorteio às ${hora} (horário de Brasília), mas SEM data marcada na rifa — não crave o dia.`
        : "Sorteio ainda SEM data e SEM hora cadastradas. NÃO invente horário: diga que ainda não foi definido e que você confirma e retorna.",
      hora,
      exata: false,
    };
  }

  // Dia da semana da data prevista, lido em BRT (o servidor roda em UTC).
  const diaSemana = new Date(`${data}T12:00:00-03:00`).getDay();
  if (!hora) {
    const padrao = PADRAO_METODO[metodo]?.[diaSemana] ?? null;
    if (padrao) {
      hora = padrao;
      origem = "padrao";
    }
  }

  const hoje = hojeBRT();
  const amanha = new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() + 86400000)
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [a, m, d] = data.split("-");
  const dataBR = `${d}/${m}/${a}`;
  const quando = data === hoje ? "HOJE" : data === amanha ? "amanhã" : DIAS_PT[diaSemana];

  if (!hora) {
    return {
      texto: `Sorteio marcado pra ${quando}, ${dataBR} (${DIAS_PT[diaSemana]}) — método ${HORARIOS_SORTEIO[metodo] ?? metodo}. A HORA não está cadastrada nesta rifa. NÃO invente horário: diga o dia, avise que confirma a hora e retorna.`,
      hora: null,
      exata: false,
    };
  }

  const ressalva = origem === "padrao"
    ? ` (horário padrão do ${HORARIOS_SORTEIO[metodo] ?? metodo} pra ${DIAS_PT[diaSemana]} — não foi cadastrado na rifa, então diga "costuma sair às" em vez de cravar)`
    : "";

  return {
    texto: `Sorteio ${quando}, ${dataBR} (${DIAS_PT[diaSemana]}), às ${hora} no horário de Brasília${ressalva}. Método: ${HORARIOS_SORTEIO[metodo] ?? metodo}.`,
    hora,
    exata: origem === "rifa" || origem === "arte",
  };
}

/** Só dígitos — casa telefone gravado com e sem DDI/máscara. */
export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * Resolve QUAL rifa o agente está tratando. Ordem:
 *   1. `codigo_controle` ou `rifa_id` que a conversa citou
 *   2. `rifas_config_tenant.rifa_disparo_id` — a "rifa do dia" escolhida na aba Disparo
 *   3. rifa `ativa` mais recente
 * O passo 2 não existia: os crons (bom-dia, disparo) respeitavam `rifa_disparo_id`
 * e as tools não, então o agente podia vender uma rifa diferente da anunciada.
 */
export async function resolverRifa(
  sb: SupabaseClient,
  tenantId: string,
  // deno-lint-ignore no-explicit-any
  args?: any,
  // deno-lint-ignore no-explicit-any
): Promise<{ rifa: any | null; outrasAtivas: number }> {
  const COLS =
    "id, codigo_controle, titulo, descricao, premio_principal, premios_extras, total_numeros, " +
    "preco_numero_centavos, promocoes, cotas_premiadas, chave_publica, data_sorteio_prevista, " +
    "metodo_sorteio, hora_sorteio, max_numeros_por_pedido, minutos_reserva, aceita_fiado, numeracao_desde_zero, status, imagem_url";

  const codigo = String(args?.codigo_controle ?? "").trim();
  const rifaId = String(args?.rifa_id ?? "").trim();

  const { count: ativas } = await sb
    .from("rifas")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).eq("status", "ativa").is("deleted_at", null);

  if (codigo || rifaId) {
    let q = sb.from("rifas").select(COLS).eq("tenant_id", tenantId).is("deleted_at", null);
    q = codigo ? q.eq("codigo_controle", codigo) : q.eq("id", rifaId);
    const { data } = await q.maybeSingle();
    if (data) return { rifa: data, outrasAtivas: Math.max(0, (ativas ?? 1) - 1) };
  }

  const { data: cfg } = await sb
    .from("rifas_config_tenant").select("rifa_disparo_id").eq("tenant_id", tenantId).maybeSingle();
  if (cfg?.rifa_disparo_id) {
    const { data } = await sb.from("rifas").select(COLS)
      .eq("id", cfg.rifa_disparo_id).eq("tenant_id", tenantId)
      .eq("status", "ativa").is("deleted_at", null).maybeSingle();
    if (data) return { rifa: data, outrasAtivas: Math.max(0, (ativas ?? 1) - 1) };
  }

  const { data } = await sb.from("rifas").select(COLS)
    .eq("tenant_id", tenantId).eq("status", "ativa").is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { rifa: data ?? null, outrasAtivas: Math.max(0, (ativas ?? 1) - 1) };
}

async function catracaLiberada(sb: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data } = await sb.rpc("rifa_pode_vender", { p_tenant_id: tenantId });
  return data === true;
}

/**
 * Informar ≠ vender (2026-09-07). `rifa_pode_vender` mistura duas checagens: o app Rifas
 * estar instalado E o toggle `agente_pode_vender`. Usar a catraca inteira em `consultar_rifa`
 * fazia o agente responder "Venda de rifa desativada" quando o dono só tinha desligado a
 * VENDA — ou seja, com o toggle off ele conseguia checar número livre
 * (`consultar_numeros_rifa`, que nunca teve catraca) mas não conseguia dizer QUAL é a rifa.
 *
 * Aqui fica só a checagem de app instalado, que é o que faz sentido para leitura. A catraca
 * completa segue valendo em `vender_numeros_rifa`, que é onde a venda de fato acontece.
 */
async function appRifasInstalado(sb: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data: appAtivo } = await sb
    .from("loja_aplicativos")
    .select("id")
    .eq("slug", "rifas")
    .eq("is_active", true)
    .maybeSingle();
  if (!appAtivo) return true; // app não existe no catálogo = sem exigência de instalação

  const { data: instalado } = await sb
    .from("aplicativos_instalados")
    .select("id")
    .eq("user_id", tenantId)
    .eq("aplicativo_slug", "rifas")
    .maybeSingle();
  return Boolean(instalado);
}

// ══════════════════════════ consultar_rifa ══════════════════════════
const consultar_rifa: HandlerRifa = async (sb, ctx, args) => {
  if (!(await appRifasInstalado(sb, ctx.tenant_id))) {
    return { ok: false, mensagem: "App Rifas não instalado para este tenant." };
  }

  const { rifa, outrasAtivas } = await resolverRifa(sb, ctx.tenant_id, args);
  if (!rifa) return { ok: false, mensagem: "Nenhuma rifa ativa no momento — não ofereça rifa." };

  const { data: pub } = await sb.rpc("obter_rifa_por_token", { p_token: rifa.chave_publica });
  const disponiveis = pub?.progresso?.disponiveis ?? "?";
  const sorteio = await resolverSorteio(sb, rifa);
  const regraPrazo = await regraPrazoReserva(sb, rifa, sorteio);

  // deno-lint-ignore no-explicit-any
  const promos = ((rifa.promocoes ?? []) as any[])
    .map((p) => `${p.qtd} números por ${fmtCentavos(p.preco_total_centavos)}`).join(" · ");
  // deno-lint-ignore no-explicit-any
  const cotasLivres = ((rifa.cotas_premiadas ?? []) as any[])
    .filter((c) => !c.pedido_ganhador).map((c) => `nº ${c.numero} (${c.premio})`).join(", ");
  // deno-lint-ignore no-explicit-any
  const extras = ((rifa.premios_extras ?? []) as any[]).map(String).filter(Boolean).join(" · ");

  const partes = [
    `Rifa ativa: "${rifa.titulo}" (código ${rifa.codigo_controle ?? "—"}) — prêmio: ${rifa.premio_principal}.`,
    extras ? `Prêmios extras: ${extras}.` : "",
    rifa.descricao ? `Sobre: ${rifa.descricao}` : "",
    `Número a ${fmtCentavos(rifa.preco_numero_centavos)} · ${disponiveis} de ${rifa.total_numeros} disponíveis · ` +
      `numeração de ${rifa.numeracao_desde_zero ? 0 : 1} a ${(rifa.numeracao_desde_zero ? 0 : 1) + rifa.total_numeros - 1} · ` +
      `máx ${rifa.max_numeros_por_pedido} por pedido. Número fora dessa faixa NÃO existe nesta rifa — diga isso ao lead em vez de procurar.`,
    // Δ 2026-09-09: o sorteio subiu pra cá. Ficava no fim da mensagem e era cortado do resumo
    // que o Gate B1 recebe como fonte — o juiz então reprovava o horário CERTO como invenção
    // (conversa do Fabrício, 01:58 BRT).
    sorteio.texto,
    // Idem `rifa_do_dia`: sem pacote cadastrado, dizer que NÃO há — silêncio virava invenção.
    promos
      ? `Pacotes com desconto: ${promos}. Fora esses pacotes não há desconto.`
      : `DESCONTO: nenhum pacote promocional cadastrado — o preço por número é o mesmo em qualquer quantidade. Se o lead pedir desconto, responda que não há; não invente nem prometa consultar o dono.`,
    cotasLivres ? `Números da sorte ainda em jogo (prêmio na hora): ${cotasLivres}.` : "",
    rifa.aceita_fiado ? "Esta rifa ACEITA fiado — dá pra reservar sem pagar na hora." : "",
    regraPrazo,
    `Pra SEPARAR número, confirme antes pra qual WhatsApp fica a reserva (pode ser este mesmo da conversa).`,
    outrasAtivas > 0 ? `Atenção: o tenant tem mais ${outrasAtivas} rifa(s) ativa(s) — se o lead citar outra, peça o código.` : "",
    // Δ 2026-09-09 (Theus): NADA de link da rifa na conversa. A venda acontece no chat —
    // link tira o lead daqui e ele não volta. Se ele quiser ver a rifa, manda a arte
    // (`enviar_foto_rifa`) e descreve.
    `NÃO mande link nenhum da rifa pro lead, nem invente URL. Se ele pedir pra ver, use enviar_foto_rifa e conte em texto.`,
  ].filter(Boolean);

  return {
    ok: true,
    dados: {
      rifa_id: rifa.id, codigo_controle: rifa.codigo_controle,
      preco_numero_centavos: rifa.preco_numero_centavos, disponiveis,
      data_sorteio: rifa.data_sorteio_prevista, hora_sorteio: sorteio.hora, hora_exata: sorteio.exata,
    },
    mensagem: partes.join(" "),
  };
};

/**
 * Lê um número de rifa como o lead escreve (2026-09-07, conversa 9a30c57e).
 *
 * O lead mandou `oo,04,25,26,77,76,88,96,99,55`: em rifa de 00 a 99 é comum sair a letra O
 * no lugar do zero. `parseInt("oo")` dava NaN, o item era descartado em silêncio e ninguém
 * ficava sabendo — nem o lead, nem o modelo. Aqui "oo"/"O7" viram número e o que sobra
 * volta na lista de não entendidos, pra virar pergunta em vez de sumir.
 */
export function lerNumeroRifa(v: unknown): number | null {
  const bruto = String(v ?? "").trim();
  if (!bruto) return null;
  const so = bruto.replace(/[oO]/g, "0");
  if (!/^\d{1,6}$/.test(so)) return null;
  return parseInt(so, 10);
}

/** Separa o que virou número do que não deu pra ler, preservando o texto original. */
function lerNumerosRifa(lista: unknown[]): { numeros: number[]; nao_entendidos: string[] } {
  const numeros: number[] = [];
  const nao_entendidos: string[] = [];
  for (const item of lista) {
    const n = lerNumeroRifa(item);
    if (n === null) nao_entendidos.push(String(item ?? "").trim());
    else numeros.push(n);
  }
  return { numeros, nao_entendidos };
}

// ═════════════ disponibilidade — leitura única, dois donos ══════════
/**
 * Números FIXOS que valem nesta rifa (`rifa_numeros_fixos` é por tenant + método de
 * sorteio, não por rifa: "o 23 é sempre da Vanessa").
 *
 * A `sincronizar_numeros_fixos_rifa` materializa esses números em `numeros_rifa` quando
 * a rifa é ativada — mas um fixo cadastrado DEPOIS disso só existe na tabela de fixos.
 * Sem esta leitura ele apareceria como livre e a agente venderia o número de alguém.
 */
async function numerosFixosDaRifa(
  // deno-lint-ignore no-explicit-any
  sb: SupabaseClient, tenantId: string, rifa: any, apenas?: number[],
): Promise<number[]> {
  if (!rifa?.metodo_sorteio) return [];
  // `status = 'ativo'`: pedido de fixo ainda PENDENTE de aprovação do dono não segura
  // número (2026-09-17). Se segurasse, qualquer lead tirava número da venda só pedindo.
  let q = sb.from("rifa_numeros_fixos").select("numero")
    .eq("tenant_id", tenantId).eq("metodo_sorteio", rifa.metodo_sorteio).eq("status", "ativo");
  if (apenas && apenas.length > 0) q = q.in("numero", apenas);
  const { data } = await q;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((f: any) => f.numero as number);
}

/**
 * Lê do banco o status dos números pedidos. Usada pelo `consultar_numeros_rifa` e,
 * desde 2026-09-07, também pelas RECUSAS do `vender_numeros_rifa`: reserva negada
 * não pode devolver o turno vazio quando a disponibilidade — que é o que o lead
 * está perguntando de verdade — está a um SELECT de distância.
 *
 * Ocupado = linha em `numeros_rifa` (reservado ou pago) OU número fixo do tenant.
 */
async function lerDisponibilidade(
  // deno-lint-ignore no-explicit-any
  sb: SupabaseClient, tenantId: string, rifa: any, numeros: number[],
): Promise<{ livres: number[]; tomados: number[]; fora_faixa: number[]; faixa: [number, number] }> {
  const min = rifa.numeracao_desde_zero ? 0 : 1;
  const max = min + rifa.total_numeros - 1;
  const fora_faixa = numeros.filter((n) => n < min || n > max);
  const dentro = numeros.filter((n) => n >= min && n <= max);
  if (dentro.length === 0) return { livres: [], tomados: [], fora_faixa, faixa: [min, max] };

  const [{ data: ocupados }, fixos] = await Promise.all([
    sb.from("numeros_rifa").select("numero").eq("rifa_id", rifa.id).in("numero", dentro),
    numerosFixosDaRifa(sb, tenantId, rifa, dentro),
  ]);
  // deno-lint-ignore no-explicit-any
  const usados = new Set<number>([...(ocupados ?? []).map((o: any) => o.numero as number), ...fixos]);
  return {
    livres: dentro.filter((n) => !usados.has(n)),
    tomados: dentro.filter((n) => usados.has(n)),
    fora_faixa,
    faixa: [min, max],
  };
}

/**
 * TODOS os números livres da rifa, sem amostragem (2026-09-07, pedido Theus).
 *
 * Antes esta leitura devolvia 10 sugestões e a agente respondia "temos 62 disponíveis,
 * alguns livres: 0, 1, 2…" — o lead que pede pra ver os disponíveis quer a lista, não
 * uma amostra, e a partir da amostra ele escolhia número já vendido.
 *
 * Livre = dentro da faixa, sem linha em `numeros_rifa` (reservado/pago) e fora dos fixos.
 */
async function listarLivres(
  // deno-lint-ignore no-explicit-any
  sb: SupabaseClient, tenantId: string, rifa: any,
): Promise<{ livres: number[]; ocupados: number; fixos: number[]; faixa: [number, number] }> {
  const min = rifa.numeracao_desde_zero ? 0 : 1;
  const max = min + rifa.total_numeros - 1;

  const [{ data: tomadosRows }, fixos] = await Promise.all([
    sb.from("numeros_rifa").select("numero").eq("rifa_id", rifa.id).limit(100000),
    numerosFixosDaRifa(sb, tenantId, rifa),
  ]);
  const usados = new Set<number>([
    // deno-lint-ignore no-explicit-any
    ...(tomadosRows ?? []).map((o: any) => o.numero as number),
    ...fixos.filter((n) => n >= min && n <= max),
  ]);

  const livres: number[] = [];
  for (let n = min; n <= max; n++) if (!usados.has(n)) livres.push(n);
  return { livres, ocupados: usados.size, fixos: fixos.filter((n) => n >= min && n <= max), faixa: [min, max] };
}

/**
 * Acima deste tamanho a lista sai em faixas ("0-22, 24-33") em vez de número a número.
 * Continua COMPLETA — o que muda é a notação. Rifa de 100 cabe crua; rifa de 1000 com 900
 * livres viraria um paredão de 4 mil caracteres que nem o lead lê nem o Gate B1 recebe
 * inteiro (o motor corta o resultado da tool ao montar as fontes do juiz).
 */
const LIMITE_LISTA_CRUA = 120;

/** Faixas contíguas: [0,1,2,4,7,8] → "0-2, 4, 7, 8". Só agrupa a partir de 3 seguidos. */
function comprimirEmFaixas(nums: number[]): string {
  const partes: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    partes.push(j > i + 1 ? `${nums[i]}-${nums[j]}` : nums.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return partes.join(", ");
}

/** Lista completa: crua enquanto couber, em faixas quando não couber. */
function formatarLivres(livres: number[]): string {
  return livres.length <= LIMITE_LISTA_CRUA ? livres.join(", ") : comprimirEmFaixas(livres);
}

/** Frase pronta de disponibilidade — mesma redação nas duas tools. */
function frasearDisponibilidade(d: { livres: number[]; tomados: number[]; fora_faixa: number[]; faixa: [number, number] }): string {
  return [
    d.livres.length ? `Livres: ${d.livres.join(", ")}.` : "",
    d.tomados.length ? `Já vendidos/reservados: ${d.tomados.join(", ")}.` : "",
    d.fora_faixa.length ? `Fora da faixa (${d.faixa[0]} a ${d.faixa[1]}): ${d.fora_faixa.join(", ")}.` : "",
  ].filter(Boolean).join(" ") || "Nada a informar.";
}

/**
 * Recusa da venda que ainda assim ENTREGA a disponibilidade (2026-09-07).
 *
 * A reserva não aconteceu — `ok` segue false, então a retomada da tool_alvo continua
 * enxergando a dívida do turno. O que muda é que o modelo recebe, na mesma iteração,
 * o dado real dos números pedidos + a instrução do que fazer com ele. Sem isso o
 * modelo improvisava, o Gate B1 reprovava por falta de fonte e o lead levava um
 * "já te retorno" no lugar da resposta.
 */
async function recusaComDisponibilidade(
  // deno-lint-ignore no-explicit-any
  sb: SupabaseClient, tenantId: string, rifa: any, numeros: number[] | null, motivo: string, comoResolver: string,
): Promise<ResultadoFerramenta> {
  if (!rifa || !numeros || numeros.length === 0) {
    return { ok: false, mensagem: `${motivo} ${comoResolver}` };
  }
  const d = await lerDisponibilidade(sb, tenantId, rifa, numeros);
  return {
    ok: false,
    fonte_confiavel: true,
    dados: { reservado: false, ...d },
    mensagem: `${motivo} MAS a disponibilidade destes números eu acabei de ler do banco AGORA (dado real, pode falar): ` +
      `${frasearDisponibilidade(d)} Diga isso ao lead NESTA resposta, sem prometer retorno depois. ${comoResolver}`,
  };
}

// ══════════════════════ vender_numeros_rifa ═════════════════════════
/**
 * Prazo da reserva em BRT, com o DIA junto quando não é hoje (Δ 2026-09-08).
 * Antes saía só "até 04:51" — com reserva de 24h o lead (e a LLM) não sabiam de que dia era,
 * achado do smoke de 17/08. Agora: "até as 18:20 de hoje" · "até as 04:51 de amanhã (09/09)" ·
 * "até as 10:00 de 12/09".
 */
function prazoPorExtenso(iso: string): string {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
  const alvo = new Date(iso);
  const hora = fmt(alvo, { hour: "2-digit", minute: "2-digit" });
  const diaAlvo = fmt(alvo, { day: "2-digit", month: "2-digit", year: "numeric" });
  const diaHoje = fmt(new Date(), { day: "2-digit", month: "2-digit", year: "numeric" });
  const amanha = new Date(Date.now() + 86_400_000);
  const diaAmanha = fmt(amanha, { day: "2-digit", month: "2-digit", year: "numeric" });

  if (diaAlvo === diaHoje) return `até as ${hora} de hoje (horário de Brasília)`;
  const dm = diaAlvo.slice(0, 5);
  if (diaAlvo === diaAmanha) return `até as ${hora} de amanhã (${dm}, horário de Brasília)`;
  return `até as ${hora} de ${dm} (horário de Brasília)`;
}

/**
 * Regra do prazo de pagamento da reserva (Fabrício, 10/09): quem reserva paga até 1h antes do
 * sorteio; passou disso, quem decide é o DONO (vira dívida ou não — nada automático). A hora vem
 * de `rifa_prazo_pagamento` no banco, a mesma conta que grava o prazo do pedido. Sem hora de
 * sorteio conhecida, não crava horário. Rifa sem data continua com `minutos_reserva`.
 */
async function regraPrazoReserva(
  sb: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  rifa: any,
  sorteio: { hora: string | null },
): Promise<string> {
  const depois = "Passou do prazo sem pagar, quem decide é o dono: NÃO prometa que o número volta pra venda nem que vira dívida.";
  if (!rifa?.data_sorteio_prevista) {
    return rifa?.minutos_reserva
      ? `A reserva segura o número por ${rifa.minutos_reserva} min sem comprovante. ${depois}`
      : depois;
  }
  if (sorteio.hora) {
    const { data: prazo, error } = await sb.rpc("rifa_prazo_pagamento", { p_rifa: rifa.id });
    if (!error && prazo) {
      return `Quem reserva pode pagar ${prazoPorExtenso(String(prazo))} — 1h antes do sorteio. ${depois}`;
    }
  }
  return `Quem reserva pode pagar até 1h antes do sorteio (a hora do sorteio não está cadastrada — não crave horário). ${depois}`;
}

const vender_numeros_rifa: HandlerRifa = async (sb, ctx, args) => {
  if (!(await catracaLiberada(sb, ctx.tenant_id))) {
    return { ok: false, mensagem: "Venda de rifa desativada para este tenant." };
  }

  const qtd = Math.max(1, parseInt(String(args?.quantidade ?? "1"), 10) || 1);
  const lidosVenda = Array.isArray(args?.numeros_especificos)
    ? lerNumerosRifa(args.numeros_especificos)
    : null;
  const numerosEspecificos = lidosVenda ? lidosVenda.numeros.filter((n) => n >= 0) : null;
  if (lidosVenda && lidosVenda.nao_entendidos.length > 0) {
    return {
      ok: false,
      mensagem: `Não consegui ler ${lidosVenda.nao_entendidos.map((t) => `"${t}"`).join(", ")} como número da rifa. ` +
        `Pergunte ao lead qual número ele quis dizer ANTES de reservar qualquer coisa — não chute nem ignore em silêncio.`,
    };
  }

  let nomeLead: string | null = null;
  // Δ 2026-09-09: o telefone DITO na conversa vence o da conversa. Serve pra quem fala de um
  // número e compra pra outro, pro Chat de Teste (que não tem WhatsApp real) e pro caso de o
  // contato chegar por um canal e pagar com outro número. Só entra se for telefone brasileiro
  // legível — senão continua valendo o da conversa.
  const telefoneDito = soDigitos(String(args?.telefone ?? ""));
  const telefoneDitoValido = /^(55)?\d{10,11}$/.test(telefoneDito) ? telefoneDito : null;
  let phoneLead: string | null = telefoneDitoValido ?? ctx.telefone ?? null;
  if (ctx.lead_id) {
    const { data: lead } = await sb.from("leads").select("nome_exibicao, name, phone")
      .eq("id", ctx.lead_id).maybeSingle();
    nomeLead = ((lead?.nome_exibicao ?? lead?.name) as string | null) ?? null;
    phoneLead = phoneLead ?? ((lead?.phone as string | null) ?? null);
  }
  let nome = String(args?.nome_comprador ?? "").trim() || nomeLead || "Cliente WhatsApp";

  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  if (!rifa || rifa.status !== "ativa") {
    return { ok: false, mensagem: "Nenhuma rifa ativa no momento." };
  }

  // Δ 2026-09-11 (Fabrício): o mesmo WhatsApp é o mesmo comprador. Se esse telefone já tem
  // pedido nesta rifa com nome de verdade, o pedido novo fica no MESMO nome (antes nascia
  // "Lead"/"Cliente WhatsApp" e o painel via duas pessoas). O acumulado (números + valor de
  // todos os pedidos vivos do telefone) volta no fim, pra agente falar o total certo.
  const nomeGenerico = (n: string) => /^(lead|cliente whatsapp|cliente|contato)?$/i.test(n.trim()) || /^\d{8,}$/.test(n.trim());
  const foneParaAcumulado = soDigitos(String(args?.telefone ?? "") || ctx.telefone || "");
  if (foneParaAcumulado && !foneParaAcumulado.startsWith("__chat_teste")) {
    const { data: anteriores } = await sb
      .from("pedidos_rifa")
      .select("nome, status")
      .eq("rifa_id", rifa.id)
      .eq("phone", foneParaAcumulado)
      .in("status", ["reservado", "aguardando_validacao", "pago"])
      .order("created_at", { ascending: false })
      .limit(10);
    const nomeAnterior = ((anteriores ?? []) as { nome: string | null }[])
      .map((p) => String(p.nome ?? "").trim())
      .find((n) => n && !nomeGenerico(n));
    if (nomeAnterior && nomeGenerico(nome)) nome = nomeAnterior;
  }

  // Δ 2026-09-10 (Fabrício): separar número exige um WhatsApp CONFIRMADO na conversa — o
  // telefone de onde o lead escreve não basta (ele pode estar reservando pra outra pessoa, e
  // grupo e Chat de Teste nem têm telefone). Vale: `telefone` dito pelo lead;
  // `whatsapp_da_conversa=true` quando ele confirmou que é este mesmo; ou um pedido já aberto
  // nesta conversa ("quero mais um" — o WhatsApp foi confirmado na primeira reserva).
  let whatsappConfirmado: string | null = telefoneDitoValido;
  if (!whatsappConfirmado && args?.whatsapp_da_conversa === true && ctx.telefone &&
      !ctx.telefone.startsWith("__chat_teste")) {
    whatsappConfirmado = ctx.telefone;
  }
  if (!whatsappConfirmado && ctx.conversa_id) {
    const { data: abertoNaConversa } = await sb
      .from("pedidos_rifa")
      .select("phone")
      .eq("rifa_id", rifa.id)
      .eq("conversa_id", ctx.conversa_id)
      .in("status", ["reservado", "aguardando_validacao"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    whatsappConfirmado = (abertoNaConversa?.phone as string | null) ?? null;
  }
  if (!whatsappConfirmado) {
    return await recusaComDisponibilidade(
      sb, ctx.tenant_id, rifa, numerosEspecificos,
      "Reserva NÃO executada: pra separar número o WhatsApp da reserva precisa ser confirmado.",
      "Pergunte pra qual WhatsApp fica a reserva (pode ser este mesmo da conversa). Com a resposta, chame esta " +
        "tool de novo com os mesmos números: passe `telefone` se ele disser um número, ou " +
        "`whatsapp_da_conversa: true` se confirmar que é este mesmo.",
    );
  }
  phoneLead = whatsappConfirmado;

  // Telefone imprestável pra reserva: ausente, ou o placeholder do Chat de Teste
  // (`__chat_teste_<uid>_<ts>__`), que o `normalizar_telefone_brasil` da RPC devolve
  // como null → "Reserva recusada: phone_invalido", uma recusa que não ensina nada.
  // Nas 8 tentativas de venda do Chat de Teste em 7 dias (2026-09-07) foi SEMPRE isso.
  const ehTelefoneDeTeste = !!phoneLead && phoneLead.startsWith("__chat_teste");
  if (!phoneLead || ehTelefoneDeTeste) {
    return await recusaComDisponibilidade(
      sb, ctx.tenant_id, rifa, numerosEspecificos,
      ehTelefoneDeTeste
        ? "Reserva NÃO executada: esta conversa é o Chat de Teste e não tem WhatsApp real, então nenhum número foi separado de verdade."
        : "Reserva NÃO executada: não tenho o WhatsApp deste contato.",
      // Δ 2026-09-09: os dois casos têm saída — peça o WhatsApp e repita a chamada passando
      // `telefone`. Antes a recusa do Chat de Teste era um beco sem saída.
      ehTelefoneDeTeste
        ? "Peça o WhatsApp do lead e chame esta tool de NOVO com os mesmos números, passando o argumento `telefone` com o número que ele der. Aí a reserva sai de verdade, mesmo aqui no teste."
        : "Peça o WhatsApp do lead e chame esta tool de novo com os mesmos números, passando o argumento `telefone` com o número que ele der.",
    );
  }

  // Fiado só quando a rifa permite — a LLM não decide isso sozinha.
  const fiado = args?.fiado === true && rifa.aceita_fiado === true;

  // "Quero mais cinco" tem que somar no MESMO pedido (Δ 2026-09-08). A RPC aceita
  // `p_pedido_token` desde 28/08 — repreça o total com as promoções e renova o prazo — mas a
  // tool nunca passava, então cada pedido do lead abria um PIX novo e ele não sabia qual pagar.
  // Buscamos o pedido aberto aqui em vez de pedir o token à LLM: ela não tem como guardar isso
  // entre turnos, e o dado está a uma query de distância.
  const { data: pedidoAberto } = await sb
    .from("pedidos_rifa")
    .select("chave_publica, numeros, qtd_numeros, valor_centavos, created_at")
    .eq("rifa_id", rifa.id)
    .eq("phone", soDigitos(phoneLead))
    .in("status", ["reservado", "aguardando_validacao"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Guarda de repetição: a mesma chamada repetida em menos de 2 min (retry do LLM, lead
  // mandando a mesma frase duas vezes) devolve o pedido que já existe em vez de dobrar.
  if (pedidoAberto?.chave_publica) {
    const idadeMs = Date.now() - new Date(pedidoAberto.created_at as string).getTime();
    const mesmaQtd = Number(pedidoAberto.qtd_numeros ?? 0) === qtd;
    const jaTemOsNumeros = numerosEspecificos && numerosEspecificos.length > 0
      ? numerosEspecificos.every((n) => ((pedidoAberto.numeros as number[] | null) ?? []).includes(n))
      : mesmaQtd;
    if (idadeMs < 120_000 && jaTemOsNumeros) {
      const numerosJa = ((pedidoAberto.numeros as number[] | null) ?? []).join(", ");
      return {
        ok: true,
        dados: {
          numeros: pedidoAberto.numeros,
          valor_centavos: pedidoAberto.valor_centavos,
          pedido_token: pedidoAberto.chave_publica,
          repetida: true,
        },
        mensagem: `Esse pedido JÁ FOI feito agora há pouco — não reservei de novo. Números do lead: ` +
          `${numerosJa}. Total: ${fmtCentavos(pedidoAberto.valor_centavos as number)}. ` +
          `Repita os números e o valor pro lead com naturalidade, sem dizer que houve repetição. NÃO mande link.`,
      };
    }
  }

  const { data, error } = await sb.rpc("reservar_numeros_rifa_publico", {
    p_token: rifa.chave_publica,
    p_nome: nome,
    p_phone: phoneLead,
    p_qtd: qtd,
    p_numeros: numerosEspecificos && numerosEspecificos.length > 0 ? numerosEspecificos : null,
    p_lead_id: ctx.lead_id ?? null,
    p_conversa_id: ctx.conversa_id ?? null,
    p_origem: "agente",
    p_fiado: fiado,
    p_pedido_token: pedidoAberto?.chave_publica ?? null,
  });
  if (error) {
    const m = String(error.message ?? "");
    if (m.includes("NUMEROS_OCUPADOS")) {
      return await recusaComDisponibilidade(
        sb, ctx.tenant_id, rifa, numerosEspecificos,
        `Reserva NÃO executada: os números ${m.split(":")[1] ?? ""} já foram vendidos.`,
        "Diga quais sobraram e ofereça ao lead escolher outros ou ir de aleatórios.",
      );
    }
    if (m.includes("NUMEROS_INSUFICIENTES")) {
      return { ok: false, mensagem: `Não há ${qtd} números livres. ${m.split(":")[1] ?? ""}` };
    }
    if (m.includes("rate limit")) return { ok: false, mensagem: "Limite de reservas atingido pra este telefone — peça pro lead aguardar alguns minutos." };
    return await recusaComDisponibilidade(sb, ctx.tenant_id, rifa, numerosEspecificos, `Reserva NÃO executada (falha técnica: ${m}).`, "Não invente motivo técnico pro lead.");
  }
  if (!data?.ok) {
    return await recusaComDisponibilidade(
      sb, ctx.tenant_id, rifa, numerosEspecificos,
      `Reserva NÃO executada (${data?.erro ?? "erro"}).`,
      "Não invente motivo técnico pro lead — responda o que dá pra responder e peça só o que falta.",
    );
  }

  const numeros = (data.numeros ?? []).join(", ");
  const pix = data.chave_pix ? `Chave PIX pra pagamento: ${data.chave_pix}.` : "ATENÇÃO: tenant sem chave PIX configurada — oriente o pagamento por outro meio.";
  // Δ 2026-09-10 (Fabrício): o prazo é pra PAGAR (1h antes do sorteio, quando a rifa tem data) e
  // passar dele não libera nem vira dívida sozinho — o dono decide. Antes dizia "depois disso os
  // números voltam pro pote", que deixou de ser verdade.
  const aposPrazo = " Passou do prazo sem pagar, quem decide é o dono — NÃO prometa que o número volta pra venda nem que vira dívida.";
  const prazo = fiado
    ? " Reserva FIADO — sem prazo de expiração, mas a dívida entra quando o sorteio sair sem pagamento."
    : data.expira_em
    ? ` Pagamento ${prazoPorExtenso(data.expira_em as string)}` +
      `${rifa.data_sorteio_prevista ? " — 1h antes do sorteio" : ""}.${aposPrazo}`
    : "";
  const juntou = data.juntou_pedido === true;

  // Acumulado do WhatsApp nesta rifa (todos os pedidos vivos, pagos ou não) — o que o dono
  // quer que a agente diga: "você já tem N números, total R$ X", e não só o pedido de agora.
  let acumulado = "";
  let acumuladoDados: { numeros: number[]; valor_centavos: number; pedidos: number } | null = null;
  try {
    const { data: vivos } = await sb
      .from("pedidos_rifa")
      .select("numeros, valor_centavos, status")
      .eq("rifa_id", rifa.id)
      .eq("phone", soDigitos(phoneLead ?? ""))
      .in("status", ["reservado", "aguardando_validacao", "pago"]);
    const lista = (vivos ?? []) as { numeros: number[] | null; valor_centavos: number | null; status: string }[];
    if (lista.length > 1) {
      const todos = [...new Set(lista.flatMap((p) => p.numeros ?? []))].sort((a, b) => a - b);
      const total = lista.reduce((s, p) => s + Number(p.valor_centavos ?? 0), 0);
      const pagos = lista.filter((p) => p.status === "pago").length;
      acumuladoDados = { numeros: todos, valor_centavos: total, pedidos: lista.length };
      acumulado = ` ACUMULADO deste WhatsApp na rifa "${rifa.titulo}" (${lista.length} pedidos, ${pagos} já pagos): ` +
        `${todos.length} números — ${todos.join(", ")} — total ${fmtCentavos(total)}. ` +
        `Diga ao lead o total acumulado dele, não só o de agora; o que ele deve AGORA é só o pedido novo.`;
    }
  } catch { /* acumulado é cortesia — não derruba a reserva */ }

  return {
    ok: true,
    dados: {
      numeros: data.numeros,
      valor_centavos: data.valor_centavos,
      pedido_token: data.pedido_token,
      fiado,
      juntou_pedido: juntou,
      acumulado_telefone: acumuladoDados,
    },
    // Δ 2026-09-09 (Theus): sem link do pedido na conversa. O comprovante mandado AQUI no chat
    // já congela a reserva desde a v277 do motor, então o link virou caminho a mais.
    mensagem: juntou
      ? `Somei os números novos no pedido que o lead JÁ tinha aberto na rifa "${rifa.titulo}" — é UM pedido só, ` +
        `com UM PIX. Números agora: ${numeros}. Total atualizado: ${fmtCentavos(data.valor_centavos as number)} ` +
        `(o valor foi recalculado sobre o total, então pode ter entrado promoção). ${pix}${prazo} ` +
        `Diga ao lead que juntou no mesmo pedido, que ele paga só o valor total novo ` +
        `e que é pra mandar o comprovante AQUI na conversa. NÃO mande link.`
      : `Reservado na rifa "${rifa.titulo}"! Números do lead: ${numeros}. Total: ${fmtCentavos(data.valor_centavos as number)}. ${pix}${prazo} Passe números, valor, PIX e o prazo de pagamento na SUA voz e peça o comprovante AQUI na conversa. NÃO mande link.${acumulado}`,
  };
};

// ═════════════════ consultar_pedido_rifa (meus números) ═════════════
// O buraco mais sentido: o lead perguntava "meu pix caiu?" / "quais são meus
// números?" e o agente não tinha como saber. Lê direto do banco por telefone da
// conversa (ou lead_id), cross-rifa.
const consultar_pedido_rifa: HandlerRifa = async (sb, ctx, args) => {
  const phoneArg = String(args?.telefone ?? "").trim();
  const phone = soDigitos(phoneArg || ctx.telefone || "");
  if (!phone && !ctx.lead_id) {
    return { ok: false, mensagem: "Sem telefone nesta conversa — peça o WhatsApp do comprador pra localizar o pedido." };
  }

  const { data, error } = await sb.rpc("rifa_dossie_agente", {
    p_tenant_id: ctx.tenant_id,
    p_phone: phone || null,
    p_lead_id: ctx.lead_id ?? null,
  });
  if (error) return { ok: false, mensagem: `Falha ao consultar pedido: ${error.message}` };
  if (!data?.ok) return { ok: false, mensagem: `Não consegui consultar: ${data?.erro ?? "erro"}` };

  // deno-lint-ignore no-explicit-any
  const pedidos = (data.pedidos ?? []) as any[];
  if (pedidos.length === 0) {
    return { ok: true, dados: data, mensagem: "Esse contato não tem nenhum pedido de rifa registrado. Se ele diz que comprou, peça o comprovante aqui na conversa." };
  }

  const ROTULO: Record<string, string> = {
    reservado: "reservado (aguardando pagamento)",
    aguardando_validacao: "comprovante enviado, aguardando o dono validar",
    pago: "PAGO e confirmado",
    expirado: "expirou (números voltaram pro pote)",
    cancelado: "cancelado",
    rejeitado: "comprovante rejeitado",
  };

  const linhas = pedidos.slice(0, 8).map((p) => {
    const venceu = p.ganhou ? " ⭑ GANHOU o prêmio nesta rifa" : "";
    return `"${p.rifa_titulo}" — números ${(p.numeros ?? []).join(", ")} · ${fmtCentavos(p.valor_centavos)} · ${ROTULO[p.status] ?? p.status}${venceu}`;
  });

  const r = data.resumo ?? {};
  const divida = Number(r.divida_aberta_centavos ?? 0) > 0
    ? ` Este contato tem dívida aberta de ${fmtCentavos(r.divida_aberta_centavos)} de rifa anterior.`
    : "";
  // deno-lint-ignore no-explicit-any
  const fixos = ((data.numeros_fixos ?? []) as any[]).map((f) => f.numero).join(", ");

  return {
    ok: true,
    dados: data,
    mensagem: `Pedidos deste contato: ${linhas.join(" | ")}. Total já pago: ${fmtCentavos(r.total_gasto_centavos ?? 0)} em ${r.rifas_participadas ?? 0} rifa(s).${fixos ? ` Números fixos dele: ${fixos}.` : ""}${divida} Responda ao lead na SUA voz, sem despejar a lista crua.`,
  };
};

// ═══════════════ consultar_numeros_rifa (o nº X tá livre?) ══════════
const consultar_numeros_rifa: HandlerRifa = async (sb, ctx, args) => {
  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  if (!rifa) return { ok: false, mensagem: "Nenhuma rifa ativa no momento." };

  const lidos = Array.isArray(args?.numeros) ? lerNumerosRifa(args.numeros) : { numeros: [], nao_entendidos: [] };
  const pedidos = lidos.numeros;

  if (pedidos.length > 0) {
    const d = await lerDisponibilidade(sb, ctx.tenant_id, rifa, pedidos);
    const naoLidos = lidos.nao_entendidos.length
      ? ` Não entendi como número: ${lidos.nao_entendidos.map((t) => `"${t}"`).join(", ")} — pergunte ao lead o que ele quis dizer, não ignore.`
      : "";
    return {
      ok: true,
      dados: { ...d, nao_entendidos: lidos.nao_entendidos },
      mensagem: frasearDisponibilidade(d) + naoLidos,
    };
  }

  // Sem números específicos → TODOS os livres (2026-09-07, pedido Theus). Era uma amostra
  // de 10 e o lead que pedia "quero ver os disponíveis" recebia "temos 62, alguns são
  // 0, 1, 2…" — daí escolhia número já vendido e o atendimento voltava pra estaca zero.
  const { livres, fixos, faixa } = await listarLivres(sb, ctx.tenant_id, rifa);
  const [min, max] = faixa;

  if (livres.length === 0) {
    return {
      ok: true,
      dados: { disponiveis: 0, livres: [], faixa, total: rifa.total_numeros },
      mensagem: `A rifa "${rifa.titulo}" está com TODOS os ${rifa.total_numeros} números tomados — não há nenhum livre agora.`,
    };
  }

  return {
    ok: true,
    dados: {
      disponiveis: livres.length,
      livres,
      fixos_reservados_do_dono: fixos.length,
      faixa,
      total: rifa.total_numeros,
    },
    mensagem: `Rifa "${rifa.titulo}" (faixa ${min} a ${max}): ${livres.length} livres de ${rifa.total_numeros}. ` +
      `LISTA COMPLETA dos livres AGORA — ${formatarLivres(livres)}. ` +
      `Esta lista é exaustiva: todo número que não está nela ou já foi pago/reservado, ou é número fixo do dono` +
      `${fixos.length ? ` (${fixos.length} fixo(s))` : ""}. ` +
      `Passe a lista INTEIRA pro lead, do jeito que está aqui — não resuma, não corte com "entre outros", ` +
      `não ofereça número que não esteja nela.`,
  };
};

/** Tools de venda/consulta — valem nos DOIS canais. */
// ═══════════════ Rifa do Dia — seção viva do prompt ═════════════════
/**
 * Monta a seção `<rifa_do_dia>` que entra no system prompt de TODO turno (2026-09-07).
 *
 * Pedido do Theus era uma "caixa de conhecimento de 24h" alimentada por evento. Aqui o mesmo
 * efeito sai por LEITURA VIVA: nada é guardado, então nada envelhece. Número disponível muda a
 * cada reserva — cópia dele fica errada entre um evento e a próxima escrita, e erra com cara de
 * dado oficial. Foi assim que a Lucy passou o dia dizendo "não tem rifa ativa" com a Rifa
 * Solidária no ar.
 *
 * O "expira em 24h" virou a JANELA do diário: só os pedidos das últimas 24 horas aparecem.
 *
 * Devolve "" quando não há app instalado ou rifa ativa — a seção some do prompt em vez de
 * ocupar espaço dizendo que não há nada.
 */
export async function montarBlocoRifaDoDia(
  sb: SupabaseClient,
  tenantId: string,
): Promise<string> {
  try {
    if (!(await appRifasInstalado(sb, tenantId))) return "";

    const { rifa, outrasAtivas } = await resolverRifa(sb, tenantId, null);
    if (!rifa) return "";

    const { data: pub } = await sb.rpc("obter_rifa_por_token", { p_token: rifa.chave_publica });
    const prog = (pub?.progresso ?? {}) as { pagos?: number; reservados?: number; disponiveis?: number };
    const { data: cfg } = await sb
      .from("rifas_config_tenant").select("chave_pix").eq("tenant_id", tenantId).maybeSingle();

    const brl = (centavos: number) =>
      (Number(centavos ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const sorteio = await resolverSorteio(sb, rifa);

    const linhas: string[] = [];
    linhas.push(`Rifa: "${rifa.titulo}" (código ${rifa.codigo_controle ?? "—"}) — status ${rifa.status}.`);
    linhas.push(`Prêmio: ${rifa.premio_principal}.`);
    // deno-lint-ignore no-explicit-any
    const extras = (rifa.premios_extras ?? []) as any[];
    if (extras.length > 0) linhas.push(`Prêmios extras: ${extras.join(" · ")}.`);
    linhas.push(`Número: ${brl(rifa.preco_numero_centavos)} cada.`);
    // Ausência de promoção é FATO, não silêncio (2026-09-07, conversa 9a30c57e). A linha só
    // aparecia quando havia pacote; sem ela, "tem desconto?" não tinha resposta ancorada em
    // lugar nenhum — o agente respondia de cabeça, o Gate B1 reprovava por falta de fonte e
    // o turno virava "vou confirmar com a equipe e já te aviso".
    // deno-lint-ignore no-explicit-any
    const promos = (rifa.promocoes ?? []) as any[];
    linhas.push(
      promos.length > 0
        ? `Pacotes com desconto: ${promos.map((p) => `${p.qtd} por ${brl(p.preco_total_centavos)}`).join(" · ")}. Fora esses pacotes NÃO há desconto.`
        : `DESCONTO: esta rifa não tem nenhum pacote promocional cadastrado — todo número sai por ${brl(rifa.preco_numero_centavos)}, comprando 1 ou 50. Se o lead pedir desconto, diga que não há e ofereça o pacote de números que ele quiser; NUNCA invente promoção nem prometa consultar o dono.`,
    );
    linhas.push(
      `NÚMEROS AGORA: ${prog.disponiveis ?? "?"} disponíveis de ${rifa.total_numeros} ` +
      `(${prog.pagos ?? 0} pagos, ${prog.reservados ?? 0} reservados). Este é o dado do momento desta mensagem.`,
    );
    // Δ 2026-09-10: `resolverSorteio` devolve { texto, hora, exata } e o texto já começa com
    // "Sorteio…". Aqui ia o objeto inteiro — o bloco saía "Sorteio: [object Object]" desde 07/09,
    // a agente ficava sem data/hora na fonte e o Gate B1 cortava toda bolha que falava do sorteio.
    linhas.push(sorteio.texto);
    const regras: string[] = [];
    if (rifa.max_numeros_por_pedido) regras.push(`máximo ${rifa.max_numeros_por_pedido} números por pedido`);
    regras.push(rifa.aceita_fiado ? "aceita fiado" : "NÃO aceita fiado");
    linhas.push(`Regras: ${regras.join(" · ")}.`);
    // Δ 2026-09-10 (Fabrício): prazo = pagar até 1h antes do sorteio e, depois dele, o dono decide.
    // Entra aqui (todo turno) e não só no retorno das tools — instrução que só vive na tool some
    // quando a tool não é chamada.
    linhas.push(`Prazo de pagamento: ${await regraPrazoReserva(sb, rifa, sorteio)}`);
    linhas.push("Pra SEPARAR número, confirme antes pra qual WhatsApp fica a reserva (pode ser este mesmo da conversa).");
    if (cfg?.chave_pix) linhas.push(`Chave PIX das rifas: ${cfg.chave_pix}.`);
    if (outrasAtivas > 0) {
      linhas.push(
        `Existem outras ${outrasAtivas} rifa(s) ativa(s) além desta. Esta é a rifa do dia; ` +
        `se o lead citar outra, use listar_rifas ou consultar_rifa com o código.`,
      );
    }

    // Diário das últimas 24h — a "memória que expira" do pedido, como janela de leitura.
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: pedidos } = await sb
      .from("pedidos_rifa")
      .select("nome, phone, qtd_numeros, numeros, status, valor_centavos, created_at")
      .eq("rifa_id", rifa.id)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(15);

    // deno-lint-ignore no-explicit-any
    const lista = (pedidos ?? []) as any[];
    let diario = "";
    if (lista.length > 0) {
      const rotuloStatus: Record<string, string> = {
        reservado: "reservado, aguardando pagamento",
        aguardando_validacao: "comprovante em análise",
        pago: "PAGO",
        expirado: "expirou",
        rejeitado: "rejeitado",
      };
      const itens = lista.map((p) => {
        const hora = new Date(p.created_at).toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
        });
        const nums = Array.isArray(p.numeros) && p.numeros.length <= 10
          ? ` (nº ${p.numeros.join(", ")})`
          : "";
        return `- ${hora} · ${p.nome ?? "sem nome"} · ${p.qtd_numeros ?? 0} número(s)${nums} · ` +
          `${brl(p.valor_centavos)} · ${rotuloStatus[p.status] ?? p.status}`;
      });
      diario = `\nMovimento das últimas 24h (${lista.length} pedido(s)):\n${itens.join("\n")}\n`;
    } else {
      diario = `\nNenhum pedido nas últimas 24h.\n`;
    }

    return `<rifa_do_dia>\n${linhas.join("\n")}\n${diario}` +
      `Estes números são do instante desta mensagem, lidos do banco agora. Pode responder direto ` +
      `com eles, sem chamar ferramenta. Se o lead pedir número específico, confirme com ` +
      `consultar_numeros_rifa antes de prometer — entre uma mensagem e outra alguém pode ter reservado.\n` +
      // Δ 2026-09-09 (Theus): a regra do link vive aqui porque este bloco entra em TODO turno —
      // instrução que só existe no retorno de uma tool some quando a tool não é chamada.
      `REGRA DO LINK: nunca mande link da rifa nem invente URL. A venda é aqui na conversa: ` +
      `passe preço, números e PIX em texto, e peça o comprovante nesta conversa mesmo. ` +
      `Pra mostrar a rifa, use enviar_foto_rifa (manda a arte cadastrada ou a cartela do Status); ` +
      `se não houver imagem, descreva em texto e avise que a arte ainda não está disponível.\n` +
      `</rifa_do_dia>\n\n`;
  } catch (e) {
    console.warn("[rifa-do-dia] falhou (motor segue sem):", e instanceof Error ? e.message : String(e));
    return "";
  }
}

// ═══════════════ enviar_foto_rifa (manda a arte na conversa) ════════
/**
 * Enfileira a arte da rifa como bolha de FOTO na caixa de saída (2026-09-07).
 *
 * Antes disso a foto da rifa só saía por disparo em massa: a caixa de saída só sabia
 * `send-text`, e não havia tool nenhuma de mídia. Agora a bolha vai com `carga.midia_url`
 * e o `despachar-bolha` troca a rota para `send-image`, usando o texto como legenda.
 *
 * A imagem é a mais recente da galeria (`rifa_imagens`) da rifa resolvida; se não houver,
 * cai em `rifas.imagem_url`. Sem nenhuma das duas a tool AVISA em vez de inventar link —
 * mandar URL quebrada para o lead é pior que não mandar.
 */
const enviar_foto_rifa: HandlerRifa = async (sb, ctx, args) => {
  if (!(await appRifasInstalado(sb, ctx.tenant_id))) {
    return { ok: false, mensagem: "App Rifas não instalado para este tenant." };
  }
  if (!ctx.conversa_id) return { ok: false, mensagem: "conversa_id ausente — não dá pra enviar a foto." };

  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  if (!rifa) return { ok: false, mensagem: "Nenhuma rifa ativa no momento — não há foto pra enviar." };

  const { data: arte } = await sb
    .from("rifa_imagens")
    .select("url, legenda")
    .eq("tenant_id", ctx.tenant_id)
    .eq("rifa_id", rifa.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const url = String(arte?.url ?? rifa.imagem_url ?? "").trim();
  if (!url) {
    return {
      ok: false,
      mensagem:
        `A rifa "${rifa.titulo}" não tem arte na galeria nem imagem cadastrada — não há foto pra enviar. ` +
        `NÃO invente link nem prometa mandar depois: descreva a rifa em texto e avise que a arte ainda não está disponível.`,
    };
  }

  const legenda = String(args?.legenda ?? "").trim() || String(arte?.legenda ?? "").trim() ||
    `${rifa.titulo} — ${rifa.premio_principal}`;

  const { error } = await sb.from("caixa_saida_mensagens").insert({
    tenant_id: ctx.tenant_id,
    conversation_id: ctx.conversa_id,
    status: "pendente",
    content: legenda,
    bubble_order: 0,
    scheduled_at: new Date().toISOString(),
    delay_calculado_ms: 0,
    engagement_level: "morno",
    carga: { typing_ms: 0, origem: "enviar_foto_rifa", midia_url: url, rifa_id: rifa.id },
  });
  if (error) return { ok: false, mensagem: `Não consegui enfileirar a foto: ${error.message}` };

  return {
    ok: true,
    dados: { rifa_id: rifa.id, url, legenda },
    mensagem: `Foto da rifa "${rifa.titulo}" enviada com a legenda "${legenda}". Não repita a legenda no texto.`,
  };
};

// ═════════ solicitar_numero_fixo_rifa (o CLIENTE pede o fixo) ═══════
/**
 * "Quero que o 23 seja sempre meu" dito pelo LEAD (2026-09-17, Theus).
 *
 * Fixo é por tenant + método de sorteio: vale em TODA rifa daquele método, sem prazo,
 * e no sorteio fixo não pago vira dívida. Amarrar número é, na prática, tirar ele da
 * venda pra sempre — por isso quem CRAVA é o dono. Esta tool só checa e registra o
 * pedido como `pendente`; a aprovação sai por `gerenciar_numeros_fixos_rifa` (canal
 * interno) ou pela aba Fixos. Pendente não reserva nada e não conta como fixo em
 * lugar nenhum: enquanto o dono não aprova, o número continua à venda.
 *
 * Ocupado (decisão Theus 2026-09-17) = fixo de outra pessoa, pedido pendente de outra
 * pessoa, OU número já reservado/pago por outro telefone numa rifa ATIVA do método.
 * Nesse caso a tool devolve a LISTA de fixos daquele sorteio — que é o que o lead
 * precisa pra escolher outro — com número e PRIMEIRO NOME. Telefone de terceiro
 * nunca sai: o lead está pedindo número, não a agenda do dono.
 */
const METODOS_SORTEIO = [
  "loteria_federal", "plataforma", "pt_rio", "ptm", "ptn", "ptv", "ppt", "corujinha",
];

/**
 * Mesmo WhatsApp escrito de dois jeitos. O trigger da tabela grava normalizado
 * ("5511940780281") e o lead digita "11 94078-0281" — comparar string crua dizia que o
 * fixo era de outra pessoa e o cara não conseguia nem confirmar o próprio número.
 */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const nucleo = (v: string | null | undefined) => {
    const d = soDigitos(v ?? "");
    return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  };
  const x = nucleo(a), y = nucleo(b);
  return x.length >= 10 && x === y;
}

/** "23 = João · 47 = Vanessa" — a lista que o lead recebe quando o número dele deu ocupado. */
function frasearFixos(fixos: { numero: number; nome: string; status?: string | null }[]): string {
  const ativos = fixos.filter((f) => (f.status ?? "ativo") === "ativo");
  if (ativos.length === 0) return "Nenhum número fixo cadastrado neste sorteio ainda.";
  return ativos.map((f) => `${f.numero} = ${primeiroNome(f.nome)}`).join(" · ");
}

const solicitar_numero_fixo_rifa: HandlerRifa = async (sb, ctx, args) => {
  if (!(await catracaLiberada(sb, ctx.tenant_id))) {
    return { ok: false, mensagem: "Venda de rifa desativada para este tenant — não prometa número fixo." };
  }

  const { rifa } = await resolverRifa(sb, ctx.tenant_id, args);
  const metodoArg = String(args?.metodo_sorteio ?? "").trim();
  const metodo = METODOS_SORTEIO.includes(metodoArg) ? metodoArg : String(rifa?.metodo_sorteio ?? "");
  if (!metodo) {
    return {
      ok: false,
      mensagem: "Não há rifa ativa e o lead não disse de qual sorteio é o número. Pergunte de qual sorteio " +
        "ele quer fixar (Loteria Federal, PT Rio, Corujinha…) antes de chamar esta tool de novo.",
    };
  }

  const brutos = (Array.isArray(args?.numeros) ? args.numeros : [args?.numero])
    .filter((v: unknown) => String(v ?? "").trim() !== "");
  const lidos = lerNumerosRifa(brutos);
  if (lidos.nao_entendidos.length > 0) {
    return {
      ok: false,
      mensagem: `Não consegui ler ${lidos.nao_entendidos.map((t) => `"${t}"`).join(", ")} como número da rifa. ` +
        `Pergunte ao lead qual número ele quis dizer — não chute nem ignore em silêncio.`,
    };
  }
  const pedidos = [...new Set(lidos.numeros.filter((n) => n >= 0))].sort((a, b) => a - b);
  if (pedidos.length === 0) {
    return { ok: false, mensagem: "Pergunte QUAL número ele quer fixar — sem número não dá pra checar nada." };
  }

  // Quem está pedindo. Mesma regra do `vender_numeros_rifa`: o telefone DITO na conversa
  // vence o da conversa (o cara pode estar fixando pro número que ele usa pra pagar).
  const telDito = soDigitos(String(args?.telefone ?? ""));
  const telValido = /^(55)?\d{10,11}$/.test(telDito) ? telDito : null;
  const telConversa = ctx.telefone && !ctx.telefone.startsWith("__chat_teste") ? soDigitos(ctx.telefone) : "";
  let phoneLead: string | null = telValido ?? (telConversa || null);
  let nomeLead: string | null = null;
  if (ctx.lead_id) {
    const { data: lead } = await sb.from("leads").select("nome_exibicao, name, phone")
      .eq("id", ctx.lead_id).maybeSingle();
    nomeLead = ((lead?.nome_exibicao ?? lead?.name) as string | null) ?? null;
    phoneLead = phoneLead ?? (soDigitos((lead?.phone as string | null) ?? "") || null);
  }
  const nome = String(args?.nome_comprador ?? "").trim() || String(nomeLead ?? "").trim();

  // Fixo sem telefone e sem nome de verdade é fixo de ninguém: o dono não tem como
  // cobrar e a próxima rifa reserva o número pra um "Cliente WhatsApp" qualquer.
  if (!phoneLead) {
    return {
      ok: false,
      mensagem: "Não dá pra registrar número fixo sem WhatsApp — fixo vale em toda rifa do sorteio e o dono " +
        "precisa saber de quem é. Pergunte pra qual WhatsApp fica o número e chame esta tool de novo passando `telefone`.",
    };
  }
  if (!nome || /^(lead|cliente|contato|cliente whatsapp)$/i.test(nome)) {
    return {
      ok: false,
      mensagem: "Não dá pra registrar número fixo sem o nome da pessoa. Pergunte o nome dele e chame esta tool " +
        "de novo passando `nome_comprador`.",
    };
  }

  // ── Leitura: os fixos do método (ativos + pendentes) e o que já foi vendido nas ativas ──
  const { data: fixosRows } = await sb.from("rifa_numeros_fixos")
    .select("numero, nome, phone, status")
    .eq("tenant_id", ctx.tenant_id).eq("metodo_sorteio", metodo).order("numero");
  const fixos = (fixosRows ?? []) as { numero: number; nome: string; phone: string | null; status: string | null }[];
  const fixoPor = new Map(fixos.map((f) => [f.numero, f]));

  const { data: ativasRows } = await sb.from("rifas")
    .select("id, titulo, total_numeros, numeracao_desde_zero")
    .eq("tenant_id", ctx.tenant_id).eq("metodo_sorteio", metodo)
    .eq("status", "ativa").is("deleted_at", null);
  // deno-lint-ignore no-explicit-any
  const ativas = (ativasRows ?? []) as any[];

  // Número vendido/reservado na rifa ATIVA conta como ocupado — menos quando o pedido é
  // do PRÓPRIO lead (ele comprou o 23 hoje e agora quer fixar o 23: isso é permitido).
  const donoDoNumero = new Map<number, string | null>();
  if (ativas.length > 0) {
    const { data: ocup } = await sb.from("numeros_rifa")
      .select("numero, pedidos_rifa!numeros_rifa_pedido_id_fkey(phone)")
      .in("rifa_id", ativas.map((r) => r.id))
      .in("numero", pedidos);
    // deno-lint-ignore no-explicit-any
    for (const o of (ocup ?? []) as any[]) {
      const p = Array.isArray(o.pedidos_rifa) ? o.pedidos_rifa[0] : o.pedidos_rifa;
      donoDoNumero.set(o.numero as number, soDigitos(p?.phone ?? "") || null);
    }
  }

  const faixaRifa = ativas[0] ?? null;
  const min = faixaRifa ? (faixaRifa.numeracao_desde_zero ? 0 : 1) : null;
  const max = faixaRifa ? (min! + Number(faixaRifa.total_numeros) - 1) : null;

  const livres: number[] = [];
  const jaSeus: number[] = [];
  const jaPedidos: number[] = [];
  const ocupadosFixo: { numero: number; nome: string; pendente: boolean }[] = [];
  const ocupadosVenda: number[] = [];
  const foraFaixa: number[] = [];

  for (const n of pedidos) {
    if (min !== null && (n < min || n > max!)) { foraFaixa.push(n); continue; }
    const f = fixoPor.get(n);
    if (f) {
      const dele = mesmoTelefone(f.phone, phoneLead);
      if (dele) (f.status === "pendente" ? jaPedidos : jaSeus).push(n);
      else ocupadosFixo.push({ numero: n, nome: f.nome, pendente: f.status === "pendente" });
      continue;
    }
    if (donoDoNumero.has(n) && !mesmoTelefone(donoDoNumero.get(n), phoneLead)) { ocupadosVenda.push(n); continue; }
    livres.push(n);
  }

  const listaFixos = frasearFixos(fixos);
  const fixosDoSorteio = fixos
    .filter((f) => (f.status ?? "ativo") === "ativo")
    .map((f) => ({ numero: f.numero, nome: primeiroNome(f.nome) }));
  const rotuloSorteio = HORARIOS_SORTEIO[metodo]?.split(" —")[0] ?? metodo;

  // ── Ocupado: não registra nada e entrega a lista, que é o que destrava a conversa ──
  if (ocupadosFixo.length > 0 || ocupadosVenda.length > 0 || foraFaixa.length > 0) {
    const partes = [
      ocupadosFixo.length
        ? `Já é fixo de outra pessoa: ${ocupadosFixo.map((o) => `${o.numero} (${primeiroNome(o.nome)}${o.pendente ? ", pedido em análise" : ""})`).join(", ")}.`
        : "",
      ocupadosVenda.length ? `Já vendido/reservado na rifa que está rolando: ${ocupadosVenda.join(", ")}.` : "",
      foraFaixa.length && min !== null ? `Fora da faixa da rifa (${min} a ${max}): ${foraFaixa.join(", ")}.` : "",
      jaSeus.length ? `Já é fixo DELE: ${jaSeus.join(", ")}.` : "",
      jaPedidos.length ? `Ele já pediu e está esperando o dono: ${jaPedidos.join(", ")}.` : "",
      livres.length ? `Livre pra fixar: ${livres.join(", ")}.` : "",
    ].filter(Boolean).join(" ");

    return {
      ok: true,
      fonte_confiavel: true,
      dados: {
        fixado: false, metodo_sorteio: metodo, pedido_registrado: false,
        ocupados_fixo: ocupadosFixo, ocupados_venda: ocupadosVenda, fora_faixa: foraFaixa,
        ja_seus: jaSeus, ja_pedidos: jaPedidos, livres_pra_fixar: livres,
        fixos_do_sorteio: fixosDoSorteio,
      },
      mensagem: `NÃO registrei nada — o número pedido está ocupado. ${partes} ` +
        `Números fixos do sorteio ${rotuloSorteio}: ${listaFixos}. ` +
        `Diga isso ao lead NESTA resposta, no seu tom: qual número dele não dá, quem já tem os fixos ` +
        `(só o primeiro nome, nunca telefone) e convide ele a escolher outro. ` +
        `Se ele escolher outro, chame esta tool de novo com o número novo.`,
    };
  }

  if (livres.length === 0) {
    return {
      ok: true,
      fonte_confiavel: true,
      dados: { fixado: false, metodo_sorteio: metodo, ja_seus: jaSeus, ja_pedidos: jaPedidos, fixos_do_sorteio: fixosDoSorteio },
      mensagem: jaPedidos.length
        ? `O pedido dele pro(s) número(s) ${jaPedidos.join(", ")} já está registrado e esperando o dono aprovar. ` +
          `Avise que você está confirmando e retorna — NÃO diga que já está garantido.`
        : `O(s) número(s) ${jaSeus.join(", ")} JÁ é fixo dele no sorteio ${rotuloSorteio} — confirme isso pra ele, nada a fazer.`,
    };
  }

  // ── Livre: registra o pedido como PENDENTE (não reserva número) e chama o dono ──
  const agora = new Date().toISOString();
  const { error } = await sb.from("rifa_numeros_fixos").insert(
    livres.map((numero) => ({
      tenant_id: ctx.tenant_id, metodo_sorteio: metodo, numero, nome,
      phone: phoneLead, status: "pendente",
      solicitado_por_conversa: ctx.conversa_id ?? null, solicitado_em: agora,
    })),
  );
  if (error) {
    // 23505 = alguém fixou/pediu o mesmo número entre a leitura e o insert.
    const corrida = String(error.code) === "23505";
    return {
      ok: false,
      mensagem: corrida
        ? `Não registrei: ${livres.join(", ")} acabou de ser pedido por outra pessoa. Avise o lead e ofereça outro número — ` +
          `chame esta tool de novo com o número novo pra confirmar se está livre.`
        : `Falha ao registrar o pedido de número fixo: ${error.message}. NÃO prometa o número ao lead.`,
    };
  }

  // Notificação pro dono — é por onde ele fica sabendo sem ter que abrir a conversa.
  // Falha aqui não derruba o pedido: a linha pendente já está no banco e aparece na aba Fixos.
  try {
    await sb.from("notificacoes").insert({
      user_id: ctx.tenant_id,
      tipo: "rifa_numero_fixo",
      icone: "pin",
      titulo: `Pedido de número fixo: ${livres.join(", ")}`,
      mensagem: `${nome} (${phoneLead}) quer fixar ${livres.length > 1 ? "os números" : "o número"} ` +
        `${livres.join(", ")} no sorteio ${rotuloSorteio}. Aprove ou recuse na aba Fixos.`,
      acao: "/rifas",
      acao_label: "Abrir Rifas",
    });
  } catch (e) {
    console.warn("[fixo-pendente] notificação falhou (pedido segue registrado):", e instanceof Error ? e.message : String(e));
  }

  return {
    ok: true,
    fonte_confiavel: true,
    dados: {
      fixado: false, pedido_registrado: true, status: "pendente",
      metodo_sorteio: metodo, numeros: livres, nome, phone: phoneLead,
      fixos_do_sorteio: fixosDoSorteio,
    },
    mensagem: `${livres.length > 1 ? "Números" : "Número"} ${livres.join(", ")} está LIVRE no sorteio ${rotuloSorteio} e o ` +
      `pedido dele foi registrado pro dono aprovar. NÃO diga que o número já é dele, nem que está garantido, ` +
      `nem crave prazo: diga, no SEU tom, que o número está livre, que você já passou o pedido pro responsável ` +
      `e que retorna com a confirmação. Enquanto o dono não aprovar, o número continua à venda — ` +
      `se ele quiser garantir AGORA nesta rifa, ofereça reservar normalmente com vender_numeros_rifa.`,
  };
};

export const HANDLERS_RIFA_VENDA: Record<string, HandlerRifa> = {
  consultar_rifa,
  vender_numeros_rifa,
  consultar_pedido_rifa,
  consultar_numeros_rifa,
  enviar_foto_rifa,
  solicitar_numero_fixo_rifa,
};

export const TOOLS_RIFA_VENDA = Object.keys(HANDLERS_RIFA_VENDA);
