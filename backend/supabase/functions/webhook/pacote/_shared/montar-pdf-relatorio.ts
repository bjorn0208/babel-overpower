/**
 * Relatório em PDF montado a partir de um roteiro de seções (pdf-lib, Deno edge).
 *
 * Quem manda o roteiro é a LLM do commandbar (tool `gerar_documento_pdf`): ela
 * consulta os dados, decide o que vira KPI, tabela, gráfico ou texto, e este
 * módulo compõe a página — com a marca do tenant (banner + logo).
 *
 * Divisão de trabalho: `pdf-tema.ts` tem os tokens (cor, escala, medida),
 * `pdf-blocos.ts` desenha cada bloco, este arquivo decide a ordem e a moldura.
 * O porquê de cada escolha está em
 * `documentos/plataforma/design-system-relatorios-pdf.md`.
 */

import { PDFDocument, StandardFonts, type PDFImage } from "npm:pdf-lib@1.17.1";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { BLOCO, COR, ESPACO, MARGEM, PAGINA, sanear, TIPO, UTIL } from "./pdf-tema.ts";
import {
  caber,
  type Ctx,
  desenharDestaque,
  desenharGraficoBarras,
  desenharKpis,
  desenharTabela,
  escrever,
  escreverEspacado,
  garantir,
  quebrar,
  tituloSecao,
} from "./pdf-blocos.ts";

export type SecaoRelatorio =
  | { tipo: "texto"; titulo?: string; texto: string }
  | { tipo: "destaque"; texto: string }
  | { tipo: "lista"; titulo?: string; itens: string[] }
  | { tipo: "kpis"; titulo?: string; itens: { rotulo: string; valor: string; nota?: string }[] }
  | { tipo: "tabela"; titulo?: string; colunas: string[]; linhas: (string | number | null)[][] }
  | {
    tipo: "grafico_barras";
    titulo?: string;
    itens: { rotulo: string; valor: number }[];
    prefixo?: string;
    sufixo?: string;
  };

export interface RelatorioPdf {
  titulo: string;
  subtitulo?: string | null;
  nome_empresa?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  rodape?: string | null;
  secoes: SecaoRelatorio[];
}

// ── Imagens da marca ─────────────────────────────────────────────────────────

function urlStoragePermitida(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase().replace(/\.+$/, "");
    return h.endsWith(".supabase.co") || h.endsWith(".supabase.in");
  } catch {
    return false;
  }
}

/** Baixa, reduz e embute imagem da marca. Falha vira null (documento segue sem). */
async function embImg(
  doc: PDFDocument,
  url: string | null | undefined,
  maxLargura: number,
): Promise<PDFImage | null> {
  if (!url || !urlStoragePermitida(url)) return null;
  try {
    const r = await fetch(url, { redirect: "manual" });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 8_000_000) return null;
    const img = await Image.decode(bytes);
    if (img.width > maxLargura) img.resize(maxLargura, Image.RESIZE_AUTO);
    return await doc.embedJpg(await img.encodeJPEG(80));
  } catch {
    return null;
  }
}

// ── Moldura do documento ─────────────────────────────────────────────────────

/**
 * Capa premium (redesign 2026-08-11). Sem banner do tenant: banda full-bleed
 * de tinta escura com a identidade dentro (empresa em caps espaçado, título
 * grande branco, subtítulo suave) fechada por régua da marca. Com banner: o
 * banner É a identidade — entra full-bleed com a régua da marca embaixo, e o
 * bloco de título vem em seguida sobre o branco.
 */
async function desenharCapa(ctx: Ctx, r: RelatorioPdf): Promise<void> {
  const banner = await embImg(ctx.doc, r.banner_url, 900);
  const logo = await embImg(ctx.doc, r.logo_url, 240);

  if (banner) {
    const bh = Math.min((PAGINA.largura * banner.height) / banner.width, BLOCO.bannerAlturaMax);
    ctx.page.drawImage(banner, { x: 0, y: PAGINA.altura - bh, width: PAGINA.largura, height: bh });
    ctx.page.drawRectangle({
      x: 0,
      y: PAGINA.altura - bh - BLOCO.reguaMarca,
      width: PAGINA.largura,
      height: BLOCO.reguaMarca,
      color: COR.marca,
    });
    ctx.y = PAGINA.altura - bh - ESPACO.xl;

    if (logo) {
      const lh = BLOCO.logoAlturaMax;
      const lw = (lh * logo.width) / logo.height;
      garantir(ctx, lh + ESPACO.md);
      ctx.page.drawImage(logo, { x: MARGEM, y: ctx.y - lh, width: lw, height: lh });
      ctx.y -= lh + ESPACO.lg;
    }
    if (r.nome_empresa) {
      escreverEspacado(ctx, String(r.nome_empresa).toUpperCase(), {
        x: MARGEM,
        y: ctx.y - TIPO.empresa.tamanho,
        size: TIPO.empresa.tamanho,
        bold: true,
        cor: COR.textoSuave,
        tracking: 1.6,
      });
      ctx.y -= TIPO.empresa.tamanho * TIPO.empresa.entrelinha + ESPACO.xs;
    }
    escrever(ctx, r.titulo, { nivel: TIPO.capa, bold: true, cor: COR.texto });
    if (r.subtitulo) {
      ctx.y -= ESPACO.xs;
      escrever(ctx, r.subtitulo, { nivel: TIPO.subtitulo, cor: COR.textoSuave });
    }
    ctx.y -= ESPACO.xl;
    return;
  }

  // Sem banner: banda de tinta full-bleed com a identidade dentro.
  const banda = BLOCO.bandaAltura;
  const topoBanda = PAGINA.altura;
  ctx.page.drawRectangle({
    x: 0,
    y: topoBanda - banda,
    width: PAGINA.largura,
    height: banda,
    color: COR.tinta,
  });
  ctx.page.drawRectangle({
    x: 0,
    y: topoBanda - banda,
    width: PAGINA.largura,
    height: BLOCO.reguaMarca + 0.5,
    color: COR.marca,
  });

  let yBanda = topoBanda - ESPACO.xl - ESPACO.sm;
  if (r.nome_empresa) {
    escreverEspacado(ctx, String(r.nome_empresa).toUpperCase(), {
      x: MARGEM,
      y: yBanda - TIPO.empresa.tamanho,
      size: TIPO.empresa.tamanho,
      bold: true,
      cor: COR.tintaSuave,
      tracking: 1.8,
    });
    yBanda -= TIPO.empresa.tamanho * TIPO.empresa.entrelinha + ESPACO.sm;
  }
  const tituloLinhas = quebrar(sanear(r.titulo), ctx.bold, TIPO.capa.tamanho, UTIL);
  for (const linha of tituloLinhas.slice(0, 2)) {
    ctx.page.drawText(linha, {
      x: MARGEM,
      y: yBanda - TIPO.capa.tamanho,
      size: TIPO.capa.tamanho,
      font: ctx.bold,
      color: COR.tintaTexto,
    });
    yBanda -= TIPO.capa.tamanho * TIPO.capa.entrelinha;
  }
  if (r.subtitulo) {
    yBanda -= ESPACO.xs;
    ctx.page.drawText(caber(sanear(r.subtitulo), ctx.regular, TIPO.subtitulo.tamanho, UTIL), {
      x: MARGEM,
      y: yBanda - TIPO.subtitulo.tamanho,
      size: TIPO.subtitulo.tamanho,
      font: ctx.regular,
      color: COR.tintaSuave,
    });
  }

  ctx.y = topoBanda - banda - ESPACO.xl;
  if (logo) {
    const lh = BLOCO.logoAlturaMax;
    const lw = (lh * logo.width) / logo.height;
    garantir(ctx, lh + ESPACO.md);
    ctx.page.drawImage(logo, { x: MARGEM, y: ctx.y - lh, width: lw, height: lh });
    ctx.y -= lh + ESPACO.lg;
  }
}

function desenharRodape(ctx: Ctx, r: RelatorioPdf): void {
  const total = ctx.paginas.length;
  const size = TIPO.micro.tamanho;
  const assinatura = sanear(
    r.rodape ?? (r.nome_empresa ? `${r.nome_empresa} · gerado pelo Mentor` : ""),
  );
  ctx.paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGEM, y: MARGEM - 10 },
      end: { x: PAGINA.largura - MARGEM, y: MARGEM - 10 },
      thickness: 0.5,
      color: COR.linha,
    });
    if (assinatura) {
      // Caps espaçado (redesign premium) — desenhado char a char na página `p`,
      // não na ctx.page corrente, por isso não usa o helper escreverEspacado.
      const texto = caber(assinatura.toUpperCase(), ctx.regular, size, UTIL - 140);
      let x = MARGEM;
      for (const ch of texto) {
        p.drawText(ch, { x, y: MARGEM - 22, size, font: ctx.regular, color: COR.textoSuave });
        x += ctx.regular.widthOfTextAtSize(ch, size) + 0.8;
      }
    }
    const num = `${i + 1}/${total}`;
    p.drawText(num, {
      x: PAGINA.largura - MARGEM - ctx.regular.widthOfTextAtSize(num, size),
      y: MARGEM - 22,
      size,
      font: ctx.regular,
      color: COR.textoSuave,
    });
  });
}

export async function montarPdfRelatorio(r: RelatorioPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGINA.largura, PAGINA.altura]);
  const ctx: Ctx = { doc, page, y: PAGINA.altura - MARGEM, regular, bold, paginas: [page] };

  await desenharCapa(ctx, r);

  for (const secao of r.secoes ?? []) {
    switch (secao.tipo) {
      case "texto":
        if (secao.titulo) tituloSecao(ctx, secao.titulo);
        escrever(ctx, secao.texto);
        ctx.y -= ESPACO.md;
        break;

      case "destaque":
        desenharDestaque(ctx, secao.texto);
        break;

      case "lista":
        if (secao.titulo) tituloSecao(ctx, secao.titulo);
        for (const item of secao.itens ?? []) {
          escrever(ctx, `•  ${item}`, { largura: UTIL - ESPACO.md });
        }
        ctx.y -= ESPACO.md;
        break;

      case "kpis":
        if (secao.titulo) tituloSecao(ctx, secao.titulo);
        desenharKpis(ctx, secao.itens ?? []);
        break;

      case "tabela":
        if (secao.titulo) tituloSecao(ctx, secao.titulo);
        desenharTabela(ctx, secao.colunas ?? [], secao.linhas ?? []);
        break;

      case "grafico_barras":
        if (secao.titulo) tituloSecao(ctx, secao.titulo);
        desenharGraficoBarras(ctx, secao.itens ?? [], secao.prefixo ?? "", secao.sufixo ?? "");
        break;
    }
  }

  desenharRodape(ctx, r);
  return await doc.save();
}
