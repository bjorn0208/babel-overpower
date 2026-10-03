/**
 * _shared/pdf-blocos.ts — desenho dos blocos do relatório em PDF.
 *
 * Cada função aqui sabe desenhar UM tipo de bloco (texto, card de indicador,
 * tabela, gráfico, destaque) e avançar o cursor vertical. Quem escolhe a ordem
 * dos blocos é o `montar-pdf-relatorio.ts`; quem define cor e medida é o
 * `pdf-tema.ts`. Regras visuais explicadas em
 * `documentos/plataforma/design-system-relatorios-pdf.md`.
 */

import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import {
  abreviar,
  alturaLinha,
  BLOCO,
  colunaNumerica,
  COR,
  corDaVariacao,
  ESPACO,
  MARGEM,
  PAGINA,
  sanear,
  tetoDoEixo,
  TIPO,
  UTIL,
} from "./pdf-tema.ts";

type Cor = ReturnType<typeof rgb>;

export type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  paginas: PDFPage[];
};

// ── Texto e fluxo de página ──────────────────────────────────────────────────

/**
 * Parte uma palavra que sozinha não cabe na linha (link assinado do Storage,
 * e-mail longo, hash). Sem isto ela era desenhada inteira e vazava do papel —
 * um link de comprovante terminava em 882pt numa página que acaba em 547pt.
 */
function partirPalavra(palavra: string, font: PDFFont, size: number, largura: number): string[] {
  const pedacos: string[] = [];
  let atual = "";
  for (const ch of palavra) {
    if (atual && font.widthOfTextAtSize(atual + ch, size) > largura) {
      pedacos.push(atual);
      atual = ch;
    } else {
      atual += ch;
    }
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}

export function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of sanear(texto).split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/)) {
      // Palavra maior que a linha inteira: parte antes de tentar encaixar.
      if (font.widthOfTextAtSize(palavra, size) > largura) {
        if (atual) {
          linhas.push(atual);
          atual = "";
        }
        const pedacos = partirPalavra(palavra, font, size, largura);
        linhas.push(...pedacos.slice(0, -1));
        atual = pedacos[pedacos.length - 1] ?? "";
        continue;
      }
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (font.widthOfTextAtSize(teste, size) > largura && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = teste;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Corta com reticências em vez de quebrar no meio (célula de tabela, rótulo). */
export function caber(texto: string, font: PDFFont, size: number, largura: number): string {
  const t = sanear(texto);
  if (font.widthOfTextAtSize(t, size) <= largura) return t;
  let corte = t;
  while (corte.length > 1 && font.widthOfTextAtSize(`${corte}...`, size) > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}...`;
}

export function novaPagina(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGINA.largura, PAGINA.altura]);
  ctx.paginas.push(ctx.page);
  ctx.y = PAGINA.altura - MARGEM;
}

/** Garante espaço vertical; abre página nova quando o bloco não cabe inteiro. */
export function garantir(ctx: Ctx, altura: number): void {
  if (ctx.y - altura < MARGEM + ESPACO.xl) novaPagina(ctx);
}

export function escrever(
  ctx: Ctx,
  texto: string,
  o: {
    nivel?: { tamanho: number; entrelinha: number };
    bold?: boolean;
    cor?: Cor;
    x?: number;
    largura?: number;
  } = {},
): void {
  const nivel = o.nivel ?? TIPO.corpo;
  const font = o.bold ? ctx.bold : ctx.regular;
  const passo = alturaLinha(nivel);
  const x = o.x ?? MARGEM;
  for (const linha of quebrar(texto, font, nivel.tamanho, o.largura ?? UTIL)) {
    garantir(ctx, passo);
    ctx.page.drawText(linha, {
      x,
      y: ctx.y - nivel.tamanho,
      size: nivel.tamanho,
      font,
      color: o.cor ?? COR.texto,
    });
    ctx.y -= passo;
  }
}

/**
 * Texto com tracking (espaço extra entre caracteres), char a char — a fonte
 * padrão do pdf-lib não tem letter-spacing. Devolve a largura total desenhada.
 */
export function escreverEspacado(
  ctx: Ctx,
  texto: string,
  o: { x: number; y: number; size: number; bold?: boolean; cor?: Cor; tracking?: number },
): number {
  const font = o.bold ? ctx.bold : ctx.regular;
  const tracking = o.tracking ?? 1.2;
  let x = o.x;
  for (const ch of sanear(texto)) {
    ctx.page.drawText(ch, { x, y: o.y, size: o.size, font, color: o.cor ?? COR.texto });
    x += font.widthOfTextAtSize(ch, o.size) + tracking;
  }
  return x - o.x - tracking;
}

/** Título de seção editorial: caps com tracking + régua dupla (acento curto e hairline). */
export function tituloSecao(ctx: Ctx, texto: string): void {
  if (!texto) return;
  const nivel = TIPO.secaoCaps;
  garantir(ctx, alturaLinha(nivel) + ESPACO.lg);
  ctx.y -= ESPACO.md;
  escreverEspacado(ctx, String(texto).toUpperCase(), {
    x: MARGEM,
    y: ctx.y - nivel.tamanho,
    size: nivel.tamanho,
    bold: true,
    cor: COR.marca,
    tracking: 1.4,
  });
  ctx.y -= alturaLinha(nivel) + ESPACO.xs;
  ctx.page.drawLine({
    start: { x: MARGEM, y: ctx.y },
    end: { x: MARGEM + 28, y: ctx.y },
    thickness: 2,
    color: COR.marca,
  });
  ctx.page.drawLine({
    start: { x: MARGEM + 28, y: ctx.y },
    end: { x: MARGEM + UTIL, y: ctx.y },
    thickness: 0.6,
    color: COR.linha,
  });
  ctx.y -= ESPACO.md;
}

// ── Cards de indicador ───────────────────────────────────────────────────────

export function desenharKpis(ctx: Ctx, itens: { rotulo: string; valor: string; nota?: string }[]): void {
  const lista = itens.slice(0, 6);
  const porLinha = lista.length <= 2 ? BLOCO.cardsPorLinhaAte2 : BLOCO.cardsPorLinha;
  const larg = (UTIL - ESPACO.md * (porLinha - 1)) / porLinha;
  const alt = BLOCO.cardAltura;
  const pad = BLOCO.cardRespiro;

  for (let i = 0; i < lista.length; i += porLinha) {
    const linha = lista.slice(i, i + porLinha);
    garantir(ctx, alt + ESPACO.md);
    const topo = ctx.y;
    linha.forEach((kpi, col) => {
      const x = MARGEM + col * (larg + ESPACO.md);
      // Card branco com hairline + filete de acento no topo (redesign premium).
      ctx.page.drawRectangle({
        x,
        y: topo - alt,
        width: larg,
        height: alt,
        color: COR.tintaTexto,
        borderColor: COR.linha,
        borderWidth: 0.8,
      });
      ctx.page.drawRectangle({
        x,
        y: topo - BLOCO.cardFilete,
        width: larg,
        height: BLOCO.cardFilete,
        color: COR.marca,
      });
      escreverEspacado(ctx, caber(String(kpi.rotulo).toUpperCase(), ctx.bold, TIPO.kpiRotulo.tamanho, larg - pad * 2 - 12), {
        x: x + pad,
        y: topo - pad - TIPO.kpiRotulo.tamanho,
        size: TIPO.kpiRotulo.tamanho,
        bold: true,
        cor: COR.textoSuave,
        tracking: 0.8,
      });
      // O valor é sempre da marca: direção se lê na nota, não no número.
      // Encolhe a fonte até caber antes de cortar: valor de dinheiro cortado
      // ("R$ 24.78...") é valor errado, não é só feio.
      const valorTexto = sanear(kpi.valor);
      const dispo = larg - pad * 2;
      let corpo = TIPO.kpiValor.tamanho;
      while (corpo > BLOCO.kpiValorMin && ctx.bold.widthOfTextAtSize(valorTexto, corpo) > dispo) {
        corpo -= 0.5;
      }
      ctx.page.drawText(caber(valorTexto, ctx.bold, corpo, dispo), {
        x: x + pad,
        y: topo - pad - TIPO.kpiRotulo.tamanho - ESPACO.sm - TIPO.kpiValor.tamanho,
        size: corpo,
        font: ctx.bold,
        color: COR.marca,
      });
      if (kpi.nota) {
        ctx.page.drawText(caber(kpi.nota, ctx.regular, TIPO.micro.tamanho, larg - pad * 2), {
          x: x + pad,
          y: topo - alt + pad,
          size: TIPO.micro.tamanho,
          font: ctx.regular,
          color: corDaVariacao(kpi.nota) ?? COR.textoSuave,
        });
      }
    });
    ctx.y = topo - alt - ESPACO.md;
  }
}

// ── Tabela ───────────────────────────────────────────────────────────────────

/** Larguras proporcionais ao conteúdo, com piso e teto pra nenhuma coluna sumir. */
function larguraDasColunas(ctx: Ctx, colunas: string[], linhas: (string | number | null)[][]): number[] {
  const size = TIPO.tabela.tamanho;
  const brutas = colunas.map((c, i) => {
    let maior = ctx.bold.widthOfTextAtSize(sanear(c), size);
    for (const l of linhas) {
      const larguraCelula = ctx.regular.widthOfTextAtSize(sanear(l?.[i]), size);
      if (larguraCelula > maior) maior = larguraCelula;
    }
    return maior + ESPACO.md;
  });
  const soma = brutas.reduce((s, v) => s + v, 0) || 1;
  const piso = UTIL * 0.12;
  const teto = UTIL * 0.4;
  const limitadas = brutas.map((b) => Math.min(teto, Math.max(piso, (b / soma) * UTIL)));
  const somaLimitada = limitadas.reduce((s, v) => s + v, 0) || 1;
  return limitadas.map((v) => (v / somaLimitada) * UTIL);
}

export function desenharTabela(ctx: Ctx, colunas: string[], linhas: (string | number | null)[][]): void {
  if (colunas.length === 0) return;
  const larguras = larguraDasColunas(ctx, colunas, linhas);
  const xDe = (i: number) => MARGEM + larguras.slice(0, i).reduce((s, v) => s + v, 0);
  const direita = colunas.map((_, i) => colunaNumerica(linhas.map((l) => l?.[i] ?? null)));
  const h = BLOCO.tabelaLinha;
  const size = TIPO.tabela.tamanho;

  const celula = (texto: string, i: number, y: number, font: PDFFont) => {
    const t = caber(texto, font, size, larguras[i] - ESPACO.md);
    const x = direita[i]
      ? xDe(i) + larguras[i] - ESPACO.sm - font.widthOfTextAtSize(t, size)
      : xDe(i) + ESPACO.sm;
    ctx.page.drawText(t, { x, y, size, font, color: COR.texto });
  };

  // Cabeçalho editorial (redesign premium): sem faixa de fundo — caps na cor
  // da marca com régua forte abaixo. Zebra saiu; cada linha ganha hairline.
  const celulaCabecalho = (texto: string, i: number, y: number) => {
    const t = caber(String(texto).toUpperCase(), ctx.bold, TIPO.micro.tamanho, larguras[i] - ESPACO.md);
    const x = direita[i]
      ? xDe(i) + larguras[i] - ESPACO.sm - ctx.bold.widthOfTextAtSize(t, TIPO.micro.tamanho)
      : xDe(i) + ESPACO.sm;
    ctx.page.drawText(t, { x, y, size: TIPO.micro.tamanho, font: ctx.bold, color: COR.marca });
  };

  const cabecalho = () => {
    garantir(ctx, h * 2);
    colunas.forEach((c, i) => celulaCabecalho(String(c), i, ctx.y - h + ESPACO.sm - 1));
    ctx.page.drawLine({
      start: { x: MARGEM, y: ctx.y - h },
      end: { x: MARGEM + UTIL, y: ctx.y - h },
      thickness: 1.2,
      color: COR.marca,
    });
    ctx.y -= h;
  };

  cabecalho();
  linhas.forEach((linha) => {
    if (ctx.y - h < MARGEM + ESPACO.xl) {
      novaPagina(ctx);
      cabecalho();
    }
    colunas.forEach((_, i) => celula(String(linha?.[i] ?? ""), i, ctx.y - h + ESPACO.sm - 1, ctx.regular));
    ctx.page.drawLine({
      start: { x: MARGEM, y: ctx.y - h },
      end: { x: MARGEM + UTIL, y: ctx.y - h },
      thickness: 0.4,
      color: COR.linha,
    });
    ctx.y -= h;
  });
  ctx.y -= ESPACO.md;
}

// ── Gráfico de barras ────────────────────────────────────────────────────────

export function desenharGraficoBarras(
  ctx: Ctx,
  itens: { rotulo: string; valor: number }[],
  prefixo = "",
  sufixo = "",
): void {
  const dados = itens.filter((i) => Number.isFinite(Number(i.valor))).slice(0, 12);
  if (dados.length === 0) return;

  const alturaDesenho = BLOCO.graficoAltura;
  garantir(ctx, alturaDesenho + ESPACO.xl + ESPACO.lg);
  const topo = ctx.y;
  const base = topo - alturaDesenho;
  const teto = tetoDoEixo(Math.max(...dados.map((d) => Number(d.valor)), 0));

  // Eixo de valores à esquerda + grade horizontal: sem elas o olho não mede.
  // A faixa do eixo se ajusta ao maior rótulo: com 36pt fixos, "R$ 112,5k" saía
  // cortado como "R$ 112..." e quem lia o gráfico pela escala lia número errado.
  const rotulosEixo: string[] = [];
  for (let d = 0; d <= BLOCO.graficoDivisoes; d++) {
    rotulosEixo.push(`${prefixo}${abreviar(teto * (d / BLOCO.graficoDivisoes))}`);
  }
  const eixoLargura = Math.min(
    BLOCO.graficoEixoMax,
    Math.max(
      BLOCO.graficoEixoMin,
      Math.max(...rotulosEixo.map((r) => ctx.regular.widthOfTextAtSize(r, TIPO.micro.tamanho))) + ESPACO.sm,
    ),
  );
  for (let d = 0; d <= BLOCO.graficoDivisoes; d++) {
    const fracao = d / BLOCO.graficoDivisoes;
    const y = base + alturaDesenho * fracao;
    ctx.page.drawLine({
      start: { x: MARGEM + eixoLargura, y },
      end: { x: MARGEM + UTIL, y },
      thickness: d === 0 ? 0.8 : 0.4,
      color: COR.linha,
    });
    const rotulo = rotulosEixo[d];
    ctx.page.drawText(caber(rotulo, ctx.regular, TIPO.micro.tamanho, eixoLargura - ESPACO.xs), {
      x: MARGEM,
      y: y - 2,
      size: TIPO.micro.tamanho,
      font: ctx.regular,
      color: COR.textoSuave,
    });
  }

  // Barras centralizadas na faixa: poucas barras não podem deixar meia página
  // vazia à direita (era o defeito da referência de 2026-08-11).
  const faixa = UTIL - eixoLargura;
  const n = dados.length;
  const ideal = faixa / (n + (n - 1) * BLOCO.barraFolga);
  const barra = Math.max(BLOCO.barraMin, Math.min(BLOCO.barraMax, ideal));
  const passo = barra * (1 + BLOCO.barraFolga);
  const usado = n * barra + (n - 1) * (passo - barra);
  const x0 = MARGEM + eixoLargura + Math.max(0, (faixa - usado) / 2);

  dados.forEach((d, i) => {
    const valor = Number(d.valor);
    const altura = Math.max(1.5, (valor / teto) * alturaDesenho);
    const x = x0 + i * passo;
    // Trilho de fundo até o teto do eixo (redesign premium): o olho compara a
    // barra com o total possível, e o desenho ganha corpo sem poluir.
    ctx.page.drawRectangle({ x, y: base, width: barra, height: alturaDesenho, color: COR.trilho });
    ctx.page.drawRectangle({ x, y: base, width: barra, height: altura, color: COR.marca });

    // Número NUNCA leva reticências: "R$ 1.284..." lido de cima da barra vira
    // conta errada na mão de quem soma. Não coube inteiro? cai pro abreviado
    // ("R$ 1,3M"), que é curto e honesto. Só o abreviado ainda estourando é que
    // aceita corte — e aí já não há dígito a perder.
    const cheio = `${prefixo}${valor.toLocaleString("pt-BR")}${sufixo}`;
    const curto = `${prefixo}${abreviar(valor)}${sufixo}`;
    const t = ctx.bold.widthOfTextAtSize(cheio, TIPO.micro.tamanho) <= passo
      ? cheio
      : caber(curto, ctx.bold, TIPO.micro.tamanho, passo);
    ctx.page.drawText(t, {
      x: x + barra / 2 - ctx.bold.widthOfTextAtSize(t, TIPO.micro.tamanho) / 2,
      y: base + altura + ESPACO.xs,
      size: TIPO.micro.tamanho,
      font: ctx.bold,
      color: COR.texto,
    });

    const rot = caber(d.rotulo, ctx.regular, TIPO.micro.tamanho, passo);
    ctx.page.drawText(rot, {
      x: x + barra / 2 - ctx.regular.widthOfTextAtSize(rot, TIPO.micro.tamanho) / 2,
      y: base - ESPACO.md,
      size: TIPO.micro.tamanho,
      font: ctx.regular,
      color: COR.textoSuave,
    });
  });

  ctx.y = base - ESPACO.xl;
}

// ── Destaque ─────────────────────────────────────────────────────────────────

/**
 * Destaque invertido (redesign premium): bloco de tinta escura, texto branco.
 *
 * Pagina quando o texto é maior que uma página. Antes desenhava o bloco inteiro
 * de uma vez: com um parágrafo longo o retângulo ia parar em y=-125 e as
 * últimas linhas eram escritas fora do papel — sumiam do documento.
 */
export function desenharDestaque(ctx: Ctx, texto: string): void {
  const nivel = { tamanho: 11.5, entrelinha: 1.55 };
  const largura = UTIL - ESPACO.xl * 2;
  const passo = alturaLinha(nivel);
  const restantes = quebrar(texto, ctx.bold, nivel.tamanho, largura);
  const piso = MARGEM + ESPACO.xl;
  let primeiraFatia = true;

  while (restantes.length > 0) {
    const disponivel = ctx.y - piso - ESPACO.xl * 2;
    let cabem = Math.floor((disponivel + (passo - nivel.tamanho)) / passo);
    if (cabem < 1) {
      novaPagina(ctx);
      cabem = Math.floor((ctx.y - piso - ESPACO.xl * 2 + (passo - nivel.tamanho)) / passo);
      if (cabem < 1) return; // página em branco não comporta nem uma linha: desiste
    }
    const fatia = restantes.splice(0, cabem);
    const alt = fatia.length * passo + ESPACO.xl * 2 - (passo - nivel.tamanho);
    const topo = ctx.y;

    ctx.page.drawRectangle({ x: MARGEM, y: topo - alt, width: UTIL, height: alt, color: COR.tinta });
    // Filete de acento no topo — mesma assinatura visual do card de KPI.
    if (primeiraFatia) {
      ctx.page.drawRectangle({
        x: MARGEM,
        y: topo - BLOCO.cardFilete,
        width: UTIL,
        height: BLOCO.cardFilete,
        color: COR.marca,
      });
      primeiraFatia = false;
    }
    let y = topo - ESPACO.xl;
    for (const l of fatia) {
      ctx.page.drawText(l, {
        x: MARGEM + ESPACO.xl,
        y: y - nivel.tamanho,
        size: nivel.tamanho,
        font: ctx.bold,
        color: COR.tintaTexto,
      });
      y -= passo;
    }
    ctx.y = topo - alt - ESPACO.lg;
  }
}
