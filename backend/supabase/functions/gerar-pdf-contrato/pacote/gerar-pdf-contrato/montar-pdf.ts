/**
 * Geração server-side do PDF do contrato assinado (pdf-lib, roda em Deno edge).
 *
 * Espelha o conteúdo do PDF do modelo antigo (jsPDF client-side): cabeçalho da
 * empresa, texto do contrato (com quebra de linha e paginação), dados do
 * signatário, provas (selfie / documento / assinatura / comprovante), dados da
 * testemunha e bloco de autenticação (data, IP, hash).
 *
 * StandardFonts.Helvetica usa WinAnsi (Latin-1) — cobre acentos pt-BR. Texto é
 * sanitizado pra remover o que o WinAnsi não codifica (evita erro em runtime).
 */

import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "npm:pdf-lib@1.17.1";
// Identidade compartilhada com o relatório e o laudo: cor, margem e escala saem
// do tema. Regras em documentos/plataforma/design-system-relatorios-pdf.md.
import { alturaLinha, BLOCO, COR, ESPACO, MARGEM, PAGINA, sanear, TIPO, UTIL } from "../_shared/pdf-tema.ts";

export interface ContratoPdf {
  titulo: string | null;
  nome_empresa: string | null;
  texto_contrato: string | null;
  dados_cliente: Record<string, unknown> | null;
  dados_signatario: Record<string, unknown> | null;
  assinado_em: string | null;
  ip_assinatura: string | null;
  hash_contrato: string | null;
  url_selfie: string | null;
  url_documento: string | null;
  url_assinatura: string | null;
  url_comprovante_pagamento: string | null;
  url_selfie_testemunha: string | null;
  url_documento_testemunha: string | null;
  url_assinatura_testemunha: string | null;
  dados_testemunha: unknown;
  metodo_pagamento: string | null;
}

const A4 = { w: PAGINA.largura, h: PAGINA.altura };
const LARGURA_UTIL = UTIL;

/** Remove caracteres que o WinAnsi (StandardFonts) não codifica. */
const sanitizar = sanear;

/** Quebra texto em linhas que cabem em maxW, respeitando \n do original. */
function quebrar(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of sanitizar(texto).split(/\n/)) {
    if (paragrafo.trim() === "") {
      linhas.push("");
      continue;
    }
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (font.widthOfTextAtSize(tentativa, size) > maxW && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

async function buscarImagem(doc: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!url || url.startsWith("data:")) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const b = new Uint8Array(buf);
    // Detecta o tipo REAL pelos magic bytes — a extensão/content-type mente:
    // documento e comprovante chegam como `.png` (image/png) mas são JPEG.
    // PNG = 89 50 4E 47 · JPEG = FF D8 FF.
    const ehPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const ehJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    try {
      if (ehPng) return await doc.embedPng(buf);
      if (ehJpg) return await doc.embedJpg(buf);
      // Tipo desconhecido: tenta JPEG, depois PNG.
      try {
        return await doc.embedJpg(buf);
      } catch {
        return await doc.embedPng(buf);
      }
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function escalar(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  if (!w || !h) return { w: maxW, h: maxH };
  const ratio = w / h;
  let lw = maxW;
  let lh = lw / ratio;
  if (lh > maxH) {
    lh = maxH;
    lw = lh * ratio;
  }
  return { w: lw, h: lh };
}

const ROTULOS: Record<string, string> = {
  nome_completo: "Nome completo",
  cpf: "CPF",
  email: "E-mail",
  telefone: "Telefone",
  endereco: "Endereço",
  data_assinatura: "Data da assinatura",
};

function rotuloCampo(chave: string): string {
  if (ROTULOS[chave]) return ROTULOS[chave];
  return chave
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}


/**
 * Substitui os {{campo}} do texto do contrato pelos dados do cliente.
 * Espelha o `hidratarCampos` do frontend (preview); aqui congela no PDF.
 * Mantém o token cru quando não há dado (não esconde lacuna real).
 */
function formatarSocios(dados: Record<string, unknown>): string {
  const porIndice = new Map<number, { nome: string; cpf: string }>();
  for (const [chave, bruto] of Object.entries(dados)) {
    const match = /^socio_(\d+)_(nome|cpf)$/.exec(chave);
    if (!match) continue;
    const indice = Number(match[1]);
    const atual = porIndice.get(indice) ?? { nome: "", cpf: "" };
    if (match[2] === "nome") atual.nome = String(bruto ?? "").trim();
    if (match[2] === "cpf") atual.cpf = String(bruto ?? "").trim();
    porIndice.set(indice, atual);
  }
  const linhas = [...porIndice.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, socio]) => socio.nome.length > 0 || socio.cpf.length > 0)
    .map(([, socio]) => `- ${socio.nome}${socio.cpf ? ` — CPF ${socio.cpf}` : ""}`);
  return linhas.length > 0 ? `SÓCIOS ADICIONAIS:\n${linhas.join("\n")}` : "";
}

function hidratarCampos(texto: string, dados: Record<string, unknown>): string {
  const todos: Record<string, unknown> = {
    ...dados,
    socios_adicionais: dados.socios_adicionais || formatarSocios(dados),
  };
  return texto.replace(/\{\{([a-z_]+)\}\}/g, (token, chave: string) => {
    const v = todos[chave];
    return v != null && String(v).trim() !== "" ? String(v) : token;
  });
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

export async function montarPdfContrato(c: ContratoPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontN = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const tinta = COR.texto;
  const cinza = COR.textoSuave;

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGEM;

  const novaPagina = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - MARGEM;
  };
  const espaco = (needed: number) => {
    // Piso acima da margem: o rodapé mora nos últimos pontos da folha e o
    // conteúdo não pode escrever por cima dele.
    if (y - needed < MARGEM + ESPACO.xl) novaPagina();
  };
  const titulo = (txt: string, size = 16, cor = tinta) => {
    espaco(size + ESPACO.md);
    page.drawText(sanitizar(txt), { x: MARGEM, y: y - size, size, font: fontB, color: cor });
    y -= size + ESPACO.md;
  };
  /** Título de seção: azul da marca, igual ao relatório. */
  const tituloSecao = (txt: string) => titulo(txt, TIPO.secao.tamanho, COR.marca);
  const paragrafo = (txt: string, size = 10.5, font = fontN, cor = tinta) => {
    const lh = size * 1.45;
    for (const linha of quebrar(txt, font, size, LARGURA_UTIL)) {
      espaco(lh);
      if (linha) page.drawText(linha, { x: MARGEM, y: y - size, size, font, color: cor });
      y -= lh;
    }
  };
  const separador = () => {
    espaco(16);
    page.drawLine({
      start: { x: MARGEM, y },
      end: { x: A4.w - MARGEM, y },
      thickness: 0.5,
      color: cinza,
    });
    y -= 16;
  };
  const imagem = async (rotulo: string, url: string | null) => {
    const img = await buscarImagem(doc, url);
    if (!img) return;
    const dim = escalar(img.width, img.height, 240, 200);
    espaco(dim.h + 26);
    page.drawText(sanitizar(rotulo), { x: MARGEM, y: y - 11, size: 10, font: fontB, color: cinza });
    y -= 16;
    espaco(dim.h);
    page.drawImage(img, { x: MARGEM, y: y - dim.h, width: dim.w, height: dim.h });
    y -= dim.h + 12;
  };

  // Cabeçalho no padrão do relatório: empresa em caixa alta por cima, título
  // do documento em destaque, régua da marca fechando o bloco.
  if (c.nome_empresa) {
    espaco(alturaLinha(TIPO.empresa));
    page.drawText(sanitizar(c.nome_empresa.toUpperCase()), {
      x: MARGEM,
      y: y - TIPO.empresa.tamanho,
      size: TIPO.empresa.tamanho,
      font: fontB,
      color: cinza,
    });
    y -= alturaLinha(TIPO.empresa) + ESPACO.xs;
  }
  titulo(c.titulo || "Contrato", TIPO.titulo.tamanho);
  espaco(BLOCO.reguaMarca + ESPACO.lg);
  page.drawRectangle({ x: MARGEM, y, width: LARGURA_UTIL, height: BLOCO.reguaMarca, color: COR.marca });
  y -= ESPACO.xl;

  // Dados do cliente (hidratam o texto e listam no fim).
  const dados = (c.dados_signatario && Object.keys(c.dados_signatario).length
    ? c.dados_signatario
    : c.dados_cliente) ?? {};

  // Texto do contrato (com os {{campo}} já preenchidos com os dados do cliente).
  if (c.texto_contrato) {
    paragrafo(hidratarCampos(c.texto_contrato, dados), 10.5);
    y -= 6;
  }

  // Dados do signatário
  const entradas = Object.entries(dados).filter(
    ([k, v]) => !/^socio_\d+_/.test(k) && v != null && String(v).trim() !== "",
  );
  if (entradas.length) {
    separador();
    tituloSecao("Dados do signatário");
    for (const [k, v] of entradas) {
      paragrafo(`${rotuloCampo(k)}: ${String(v)}`, 10);
    }
  }

  // Provas (imagens)
  const provas: Array<[string, string | null]> = [
    ["Selfie do signatário", c.url_selfie],
    ["Documento do signatário", c.url_documento],
    ["Assinatura", c.url_assinatura],
    ["Comprovante de pagamento", c.url_comprovante_pagamento],
  ];
  const temProva = provas.some(([, u]) => !!u);
  if (temProva) {
    separador();
    tituloSecao("Provas");
    for (const [rotulo, url] of provas) await imagem(rotulo, url);
  }

  // Testemunha
  const test = c.dados_testemunha as { testemunhas?: Array<Record<string, unknown>> } | null;
  const testemunhas = Array.isArray(test?.testemunhas) ? test!.testemunhas : [];
  const temTestemunha =
    testemunhas.length > 0 ||
    c.url_selfie_testemunha ||
    c.url_documento_testemunha ||
    c.url_assinatura_testemunha;
  if (temTestemunha) {
    separador();
    tituloSecao("Testemunha");
    testemunhas.forEach((t, i) => {
      const nome = String(t.nome ?? "").trim();
      const cpf = String(t.cpf ?? "").trim();
      if (nome || cpf) {
        paragrafo(`Testemunha ${i + 1}: ${nome}${cpf ? ` — CPF ${cpf}` : ""}`, 10);
      }
    });
    await imagem("Selfie da testemunha", c.url_selfie_testemunha);
    await imagem("Documento da testemunha", c.url_documento_testemunha);
    await imagem("Assinatura da testemunha", c.url_assinatura_testemunha);
  }

  // Autenticação
  separador();
  tituloSecao("Autenticação");
  if (c.assinado_em) paragrafo(`Assinado em: ${formatarData(c.assinado_em)}`, 9.5, fontN, cinza);
  if (c.ip_assinatura) paragrafo(`IP: ${c.ip_assinatura}`, 9.5, fontN, cinza);
  if (c.metodo_pagamento) paragrafo(`Forma de pagamento: ${c.metodo_pagamento}`, 9.5, fontN, cinza);
  if (c.hash_contrato) paragrafo(`Hash de integridade: ${c.hash_contrato}`, 9.5, fontN, cinza);

  // Rodapé em todas as páginas — contrato assinado circula solto, então cada
  // folha precisa dizer de quem é e qual página é (antes não tinha nenhum).
  const paginas = doc.getPages();
  const assinatura = sanitizar(
    [c.nome_empresa, c.assinado_em ? `assinado em ${formatarData(c.assinado_em)}` : null]
      .filter(Boolean)
      .join(" · "),
  );
  const micro = TIPO.micro.tamanho;
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGEM, y: MARGEM - 10 },
      end: { x: A4.w - MARGEM, y: MARGEM - 10 },
      thickness: 0.5,
      color: COR.linha,
    });
    if (assinatura) {
      p.drawText(assinatura.slice(0, 110), {
        x: MARGEM,
        y: MARGEM - 22,
        size: micro,
        font: fontN,
        color: cinza,
      });
    }
    const num = `${i + 1}/${paginas.length}`;
    p.drawText(num, {
      x: A4.w - MARGEM - fontN.widthOfTextAtSize(num, micro),
      y: MARGEM - 22,
      size: micro,
      font: fontN,
      color: cinza,
    });
  });

  return await doc.save();
}
