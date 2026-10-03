/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Tool `gerar_documento_pdf` do canal interno (commandbar).
 *
 * O dono pede "monta um relatório disso em PDF" e a LLM entrega o roteiro do
 * documento (título + seções: KPIs, tabela, gráfico, texto). Aqui o roteiro
 * vira PDF com a marca do tenant (`_shared/montar-pdf-relatorio.ts`), sobe no
 * bucket privado `mestre-anexos` e volta como link assinado de 7 dias.
 *
 * A marca (logo/banner/nome) sai de `empresas` — mesma fonte do laudo de
 * consulta, então o documento sai coerente com o resto da plataforma.
 */

import type { RelatorioPdf, SecaoRelatorio } from "./montar-pdf-relatorio.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface CtxDocumento {
  user_id: string;
  supabase_admin: AnyClient;
}

export const SCHEMA_GERAR_DOCUMENTO_PDF = {
  type: "function" as const,
  function: {
    name: "gerar_documento_pdf",
    description:
      "Gera um documento PDF apresentável com a identidade visual da empresa (banner e logo do tenant) e " +
      "devolve o link pra baixar. Use quando o usuário pedir relatório, proposta, resumo, apresentação ou " +
      "'manda isso em PDF'. REGRA DURA: documento com kpis/tabela/grafico_barras SÓ executa se você chamou " +
      "consultar_dados (ou mostrar_kpi) NESTE turno — a tool recusa caso contrário. Fluxo obrigatório: " +
      "1) consultar_dados com a consulta certa; 2) montar o roteiro copiando os números EXATOS retornados — " +
      "sem arredondar, sem completar de memória, sem estimar; número que a consulta não trouxe NÃO entra. " +
      "Escolha as seções pelo conteúdo: 'kpis' pros números que importam (máx 6), " +
      "'grafico_barras' pra comparar períodos/categorias (máx 12 barras), 'tabela' pra listas, 'texto' pra " +
      "análise e recomendação, 'destaque' pra 1 conclusão forte, 'lista' pra pontos rápidos. " +
      "FORMATO DA SEÇÃO: o conteúdo vai NO NÍVEL DE CIMA — 'itens' em kpis/lista/grafico_barras, " +
      "'colunas' + 'linhas' em tabela, 'texto' em texto/destaque. NUNCA aninhe o conteúdo dentro de " +
      "outra chave (ex.: {tipo:'grafico_barras', grafico_barras:{itens:[...]}}) — a tool recusa o " +
      "documento inteiro e você perde o turno. Tabela sempre com 'colunas'. " +
      "Escreva a análise você mesmo: o valor do documento é a leitura dos números, não os números soltos.",
    parameters: {
      type: "object" as const,
      properties: {
        titulo: { type: "string", description: "Título do documento (ex: 'Relatório de Vendas — Julho/2026')." },
        subtitulo: { type: "string", description: "Linha de apoio (período, escopo). Opcional." },
        nome_arquivo: { type: "string", description: "Nome do arquivo sem extensão. Opcional." },
        secoes: {
          type: "array",
          description: "Seções na ordem em que aparecem no documento.",
          items: {
            type: "object",
            properties: {
              tipo: {
                type: "string",
                enum: ["texto", "destaque", "lista", "kpis", "tabela", "grafico_barras"],
                description: "Formato da seção.",
              },
              titulo: { type: "string", description: "Título da seção (opcional)." },
              texto: { type: "string", description: "Conteúdo de 'texto' e 'destaque'." },
              // O Gemini exige `items` declarado em TODO nível de array e
              // properties em objeto — schema frouxo aqui derruba o turno
              // inteiro com 400 (aconteceu em 2026-08-02, edge v207).
              itens: {
                type: "array",
                description:
                  "'lista': use só o campo texto. 'kpis': rotulo + valor (+nota). 'grafico_barras': rotulo + valor.",
                items: {
                  type: "object",
                  properties: {
                    texto: { type: "string", description: "Item de lista." },
                    rotulo: { type: "string", description: "Rótulo do KPI ou da barra." },
                    valor: {
                      type: "string",
                      description:
                        "Em 'kpis', o valor JÁ FORMATADO como deve aparecer no card, com moeda e " +
                        "separador de milhar: 'R$ 39.999,00', '59', '12,5%'. NUNCA número cru tipo " +
                        "'39999'. Em 'grafico_barras' é o contrário: só o número, sem R$ e sem ponto " +
                        "de milhar ('2388'), porque a moeda vai no campo 'prefixo' da seção.",
                    },
                    nota: { type: "string", description: "Complemento do KPI (ex: '+40% vs junho')." },
                  },
                },
              },
              colunas: { type: "array", items: { type: "string" }, description: "Cabeçalho da tabela." },
              linhas: {
                type: "array",
                description: "Linhas da tabela: cada linha é um array de células (texto).",
                items: { type: "array", items: { type: "string" } },
              },
              prefixo: { type: "string", description: "Prefixo do valor no gráfico (ex: 'R$ ')." },
              sufixo: { type: "string", description: "Sufixo do valor no gráfico (ex: '%')." },
            },
            required: ["tipo"],
          },
        },
      },
      required: ["titulo", "secoes"],
    },
  },
};

/**
 * Número que a LLM mandou como texto. Aceita o formato que ela de fato usa:
 * "R$ 1.194,00", "1.194", "4776", "3721.14".
 *
 * Por que existe (2026-09-07): o normalizador antigo fazia `Number(valor)` cru.
 * "1.194,00" virava NaN e a barra sumia do gráfico; "1.194" virava 1,194 — mil
 * vezes menor. Em 11/08 saiu um gráfico com 5.97/41.79/71.64 onde os valores
 * eram R$ 597 / R$ 4.179 / R$ 7.164.
 */
function numeroDoTexto(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  let t = String(bruto ?? "").replace(/ /g, " ").trim();
  if (!t) return null;
  t = t.replace(/R\$|\s|%/g, "");
  // Vírgula presente = decimal pt-BR: ponto é separador de milhar.
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  // Sem vírgula, "1.194" / "1.194.000" é milhar, não decimal.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Desaninha o corpo da seção. A LLM às vezes manda o conteúdo sob uma chave com
 * o nome do tipo — `{tipo:"grafico_barras", grafico_barras:{itens:[…]}}` — e o
 * normalizador antigo não achava `itens`, então a seção sumia do PDF em
 * silêncio: 5 de 27 gráficos e 2 de 10 tabelas em 30 dias de produção.
 */
// deno-lint-ignore no-explicit-any
function corpoDaSecao(s: any, tipo: string): any {
  const aninhado = s?.[tipo] ?? s?.conteudo ?? s?.dados;
  if (Array.isArray(aninhado)) return { ...s, itens: aninhado };
  if (aninhado && typeof aninhado === "object") return { ...s, ...aninhado };
  return s ?? {};
}

/**
 * Número cru no card de KPI ganha separador de milhar pt-BR: "39999" → "39.999".
 *
 * Caso real (2026-09-07 11:29): o card "Faturamento (R$)" saiu `39999`, ilegível
 * e ambíguo. Só a partir de 5 dígitos, pra não estragar ano ("2026") nem valor
 * curto. Não inventa "R$": adivinhar moeda seria pior que não formatar.
 */
function formatarValorKpi(valor: string): string {
  const t = valor.trim();
  if (!/^-?\d{5,}$/.test(t)) return valor;
  return Number(t).toLocaleString("pt-BR");
}

/** Chave de comparação de cabeçalho: sem acento, sem espaço, minúscula. */
function chaveNormalizada(t: unknown): string {
  return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normaliza o que a LLM mandou pro formato que o montador entende.
 *
 * Devolve também as `recusas`: seção que chegou sem conteúdo aproveitável NÃO
 * é descartada em silêncio — o handler recusa o documento inteiro e diz o que
 * faltou, pra LLM refazer no mesmo turno. Antes o PDF saía sem o gráfico que o
 * dono pediu e o Mentor ainda respondia "está pronto".
 */
// deno-lint-ignore no-explicit-any
export function normalizarSecoes(bruto: any): { secoes: SecaoRelatorio[]; recusas: string[] } {
  if (!Array.isArray(bruto)) return { secoes: [], recusas: [] };
  const secoes: SecaoRelatorio[] = [];
  const recusas: string[] = [];
  const recusar = (tipo: string, i: number, motivo: string) =>
    recusas.push(`seção ${i + 1} ('${tipo}') ${motivo}`);

  for (const [indice, bruta] of bruto.entries()) {
    const tipo = String(bruta?.tipo ?? "");
    const s = corpoDaSecao(bruta, tipo);

    if (tipo === "texto" || tipo === "destaque") {
      const texto = String(s?.texto ?? "").trim();
      if (!texto) {
        recusar(tipo, indice, "veio sem 'texto'.");
        continue;
      }
      secoes.push(
        tipo === "texto"
          ? { tipo: "texto", titulo: s?.titulo ? String(s.titulo) : undefined, texto }
          : { tipo: "destaque", texto },
      );
    } else if (tipo === "lista") {
      const itens = (Array.isArray(s?.itens) ? s.itens : [])
        // deno-lint-ignore no-explicit-any
        .map((i: any) => (typeof i === "string" ? i : String(i?.texto ?? i?.rotulo ?? "")))
        .filter(Boolean);
      if (!itens.length) {
        recusar(tipo, indice, "veio sem 'itens' (array de textos).");
        continue;
      }
      secoes.push({ tipo: "lista", titulo: s?.titulo ? String(s.titulo) : undefined, itens });
    } else if (tipo === "kpis") {
      const itens = (Array.isArray(s?.itens) ? s.itens : [])
        // deno-lint-ignore no-explicit-any
        .map((i: any) => ({
          rotulo: String(i?.rotulo ?? i?.titulo ?? ""),
          valor: formatarValorKpi(String(i?.valor ?? "")),
          nota: i?.nota ? String(i.nota) : undefined,
        }))
        .filter((i: { rotulo: string; valor: string }) => i.rotulo || i.valor);
      if (!itens.length) {
        recusar(tipo, indice, "veio sem 'itens' (cada um com rotulo + valor).");
        continue;
      }
      if (itens.length > 6) {
        recusar(tipo, indice, `tem ${itens.length} indicadores; o card comporta 6. Escolha os 6 que importam.`);
        continue;
      }
      secoes.push({ tipo: "kpis", titulo: s?.titulo ? String(s.titulo) : undefined, itens });
    } else if (tipo === "tabela") {
      const linhasBrutas = (Array.isArray(s?.linhas) ? s.linhas : []).slice(0, 200);
      let colunas = (Array.isArray(s?.colunas) ? s.colunas : []).map((c: unknown) => String(c ?? ""));
      // deno-lint-ignore no-explicit-any
      const primeiraObjeto = linhasBrutas.find((l: any) => l && !Array.isArray(l) && typeof l === "object");
      // Sem cabeçalho mas com linha-objeto: as chaves SÃO o cabeçalho.
      if (colunas.length === 0 && primeiraObjeto) colunas = Object.keys(primeiraObjeto).map(String);
      // deno-lint-ignore no-explicit-any
      const linhas = linhasBrutas.map((l: any) => {
        if (Array.isArray(l)) return l;
        if (!l || typeof l !== "object") return [l];
        // Célula por chave, não por ordem de inserção: objeto com as chaves
        // fora de ordem deixaria valor na coluna errada.
        const mapa = new Map(Object.entries(l).map(([k, v]) => [chaveNormalizada(k), v]));
        const casaTudo = colunas.every((c: string) => mapa.has(chaveNormalizada(c)));
        return casaTudo
          ? colunas.map((c: string) => mapa.get(chaveNormalizada(c)) ?? null)
          : Object.values(l);
      });
      if (!colunas.length || !linhas.length) {
        recusar(tipo, indice, `veio ${!linhas.length ? "sem 'linhas'" : "sem 'colunas' (cabeçalho)"}.`);
        continue;
      }
      secoes.push({ tipo: "tabela", titulo: s?.titulo ? String(s.titulo) : undefined, colunas, linhas });
    } else if (tipo === "grafico_barras") {
      const brutos = Array.isArray(s?.itens) ? s.itens : [];
      const itens = brutos
        // deno-lint-ignore no-explicit-any
        .map((i: any) => ({
          rotulo: String(i?.rotulo ?? i?.label ?? ""),
          valor: numeroDoTexto(i?.valor ?? i?.value),
        }))
        .filter((i: { valor: number | null }): i is { rotulo: string; valor: number } => i.valor !== null);
      if (!itens.length) {
        recusar(
          tipo,
          indice,
          brutos.length
            ? "tem itens, mas nenhum 'valor' numérico legível."
            : "veio sem 'itens' (cada um com rotulo + valor).",
        );
        continue;
      }
      if (itens.length < brutos.length) {
        recusar(tipo, indice, `tem ${brutos.length} itens mas só ${itens.length} com valor numérico legível.`);
        continue;
      }
      // Cortar a 13ª barra em silêncio faz o gráfico deixar de fechar com o KPI —
      // foi o que aconteceu em 07/09 11:29: 13 dias na consulta, 12 no desenho,
      // R$ 38.208 no gráfico contra R$ 39.999 no card.
      if (itens.length > 12) {
        recusar(
          tipo,
          indice,
          `tem ${itens.length} barras; o gráfico comporta 12. Agrupe o período (por semana/mês) ` +
            "ou reduza a janela — não corte itens, senão o gráfico deixa de fechar com o total.",
        );
        continue;
      }
      secoes.push({
        tipo: "grafico_barras",
        titulo: s?.titulo ? String(s.titulo) : undefined,
        itens,
        prefixo: s?.prefixo ? String(s.prefixo) : undefined,
        sufixo: s?.sufixo ? String(s.sufixo) : undefined,
      });
    } else if (tipo) {
      recusar(tipo, indice, "tem 'tipo' que o documento não conhece (use texto/destaque/lista/kpis/tabela/grafico_barras).");
    }
  }
  return { secoes, recusas };
}

function nomeSeguro(base: string): string {
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return limpo || "relatorio";
}

export async function handlerGerarDocumentoPdf(
  args: Record<string, unknown>,
  ctx: CtxDocumento,
): Promise<string> {
  const titulo = String(args.titulo ?? "").trim();
  if (!titulo) return "✗ Informe o titulo do documento.";

  const { secoes, recusas } = normalizarSecoes(args.secoes);
  // Seção que cai NÃO some em silêncio: o documento inteiro é recusado com o
  // motivo, pra LLM refazer no mesmo turno. Entregar o PDF sem o gráfico que o
  // dono pediu, dizendo "está pronto", é pior que não entregar.
  if (recusas.length > 0) {
    return [
      `✗ Documento não gerado — ${recusas.join(" ")}`,
      "Refaça a chamada com o conteúdo NO NÍVEL DE CIMA da seção: 'itens' pra kpis/lista/",
      "grafico_barras, 'colunas' + 'linhas' pra tabela, 'texto' pra texto/destaque. Não",
      "aninhe o conteúdo dentro de outra chave. Valor de gráfico é número (1194, não",
      "'R$ 1.194,00'). Nenhuma seção pode faltar no documento final.",
    ].join(" ");
  }
  if (secoes.length === 0) {
    return "✗ Nenhuma seção válida. Monte 'secoes' com tipo + conteúdo (kpis/tabela/grafico_barras/texto).";
  }

  // Marca do tenant — mesma fonte do laudo de consulta.
  const { data: empresa } = await ctx.supabase_admin
    .from("empresas")
    .select("nome, logo_url, banner_url")
    .eq("user_id", ctx.user_id)
    .limit(1)
    .maybeSingle();

  const nomeEmpresa = empresa?.nome ?? null;

  const relatorio: RelatorioPdf = {
    titulo,
    subtitulo: args.subtitulo ? String(args.subtitulo) : null,
    nome_empresa: nomeEmpresa,
    logo_url: empresa?.logo_url ?? null,
    banner_url: empresa?.banner_url ?? null,
    rodape: nomeEmpresa ? `${nomeEmpresa} · gerado pelo Mentor` : "Gerado pelo Mentor",
    secoes,
  };

  try {
    const { montarPdfRelatorio } = await import("./montar-pdf-relatorio.ts");
    const bytes = await montarPdfRelatorio(relatorio);

    const arquivo = `${nomeSeguro(String(args.nome_arquivo ?? titulo))}.pdf`;
    const caminho = `${ctx.user_id}/relatorios/${Date.now()}_${arquivo}`;

    const { error: upErr } = await ctx.supabase_admin.storage
      .from("mestre-anexos")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return `✗ Não consegui salvar o PDF: ${upErr.message}`;

    const { data: assinado, error: urlErr } = await ctx.supabase_admin.storage
      .from("mestre-anexos")
      .createSignedUrl(caminho, 60 * 60 * 24 * 7);
    if (urlErr || !assinado?.signedUrl) {
      return `✗ PDF gerado, mas falhou o link de download: ${urlErr?.message ?? "desconhecido"}`;
    }

    return JSON.stringify({
      ok: true,
      dados: {
        tipo: "documento_pdf",
        nome: arquivo,
        url: assinado.signedUrl,
        paginas_estimadas: Math.max(1, Math.ceil(secoes.length / 4)),
        tamanho_kb: Math.round(bytes.length / 1024),
      },
      mensagem:
        `Documento "${titulo}" pronto (${Math.round(bytes.length / 1024)} KB). ` +
        "Diga em 1 frase o que ele traz e avise que o botão de baixar está no card. O link vale 7 dias.",
    });
  } catch (e) {
    return `✗ Falha ao gerar o PDF: ${(e as Error).message}`;
  }
}
