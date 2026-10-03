/**
 * Leitura de contatos a partir de planilha (CSV/XLSX) — camada compartilhada
 * entre o app Rifas (lista de disparo) e o app Campanha (público da campanha).
 *
 * Nasceu de um risco real medido em 2026-09-08. A heurística que vivia dentro do
 * `lista-contatos-disparo.tsx` escolhia a coluna de telefone contando quantos
 * valores tinham 10 a 13 dígitos. Só que **CPF tem 11 dígitos** e CNPJ sem
 * formatação costuma cair na mesma faixa. Numa planilha real de 2.283 leads o
 * placar foi: WhatsApp 2.283 × CPF 2.072 — a coluna certa ganhou por 9%. Bastava
 * a planilha ter mais CPF preenchido que telefone pra plataforma disparar
 * WhatsApp pra números que são CPF de gente.
 *
 * Duas defesas, nesta ordem:
 *   1. procura o cabeçalho nas primeiras linhas (não só na primeira — planilha
 *      exportada costuma ter título//metadado antes do cabeçalho de verdade);
 *   2. descarta colunas cujo cabeçalho diz documento (CPF/CNPJ/RG/IE...), então
 *      elas nunca competem na contagem por densidade.
 *
 * A contagem por densidade continua existindo, mas como último recurso.
 */

import { normalizarTelefoneBrasil } from "@/lib/telefone";

/** Quantas linhas do topo podem ser vasculhadas em busca do cabeçalho. */
const LINHAS_ATE_O_CABECALHO = 10;

const RE_COL_TELEFONE = /tel|fone|phone|whats|zap|n[uú]mero|celular|contato/i;
const RE_COL_NOME = /nome|name|raz[aã]o|fantasia|cliente|respons[aá]vel/i;
/** Documento nunca é telefone, por mais que o tamanho engane. */
const RE_COL_DOCUMENTO = /cpf|cnpj|\bdoc|documento|\brg\b|inscri[cç][aã]o|\bie\b|matr[ií]cula|c[oó]digo|\bid\b/i;
const RE_COL_EMAIL = /mail/i;

export interface ContatoPlanilha {
  nome: string | null;
  phone: string;
}

export interface LeituraPlanilha {
  contatos: ContatoPlanilha[];
  /** Índice da coluna usada como telefone (-1 se não achou). */
  colunaTelefone: number;
  /** Cabeçalho daquela coluna, quando existia. */
  rotuloTelefone: string | null;
  /** Como a coluna foi escolhida — vai pra tela, pra pessoa poder discordar. */
  criterio: "cabecalho" | "densidade" | "nenhum";
  /** Linhas do corpo que não renderam telefone válido. */
  descartadas: number;
  /** Telefones repetidos que entraram uma vez só. */
  duplicadas: number;
}

const soDigitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/**
 * Acha a linha de cabeçalho: a primeira, dentro do topo da planilha, que tenha
 * pelo menos duas células de texto não-numérico. Uma linha de título solta
 * ("ID SERIE VOUCHERS | 11") não passa nesse crivo.
 */
function acharCabecalho(linhas: unknown[][]): number {
  const teto = Math.min(LINHAS_ATE_O_CABECALHO, linhas.length);
  for (let i = 0; i < teto; i++) {
    const celulas = (linhas[i] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
    if (celulas.length < 2) continue;
    const textuais = celulas.filter((c) => !/^\d+([.,]\d+)?$/.test(c));
    if (textuais.length >= 2) return i;
  }
  return -1;
}

export function lerContatosDaPlanilha(linhas: unknown[][]): LeituraPlanilha {
  const vazio: LeituraPlanilha = {
    contatos: [],
    colunaTelefone: -1,
    rotuloTelefone: null,
    criterio: "nenhum",
    descartadas: 0,
    duplicadas: 0,
  };
  if (linhas.length === 0) return vazio;

  const iCab = acharCabecalho(linhas);
  const cabecalho = iCab >= 0 ? (linhas[iCab] ?? []).map((c) => String(c ?? "").trim()) : [];
  const corpo = iCab >= 0 ? linhas.slice(iCab + 1) : linhas;
  if (corpo.length === 0) return vazio;

  const ehDocumento = (i: number) => !!cabecalho[i] && RE_COL_DOCUMENTO.test(cabecalho[i]);

  // 1ª tentativa: o cabeçalho diz qual é a coluna.
  let colTelefone = cabecalho.findIndex((c) => RE_COL_TELEFONE.test(c) && !RE_COL_DOCUMENTO.test(c));
  let criterio: LeituraPlanilha["criterio"] = colTelefone >= 0 ? "cabecalho" : "nenhum";

  // 2ª tentativa: densidade de valores com cara de telefone, ignorando documento.
  if (colTelefone < 0) {
    const colunas = Math.max(...corpo.map((l) => l.length), 0);
    let melhor = -1;
    let melhorQtd = 0;
    for (let c = 0; c < colunas; c++) {
      if (ehDocumento(c)) continue;
      const qtd = corpo.filter((l) => {
        const d = soDigitos(l[c]);
        return d.length >= 10 && d.length <= 13;
      }).length;
      if (qtd > melhorQtd) {
        melhorQtd = qtd;
        melhor = c;
      }
    }
    // Exige presença mínima: coluna que só tem telefone em 1 linha de 500 não é
    // coluna de telefone, é coincidência.
    if (melhor >= 0 && melhorQtd >= Math.max(1, Math.ceil(corpo.length * 0.1))) {
      colTelefone = melhor;
      criterio = "densidade";
    }
  }

  if (colTelefone < 0) return vazio;

  // Nome: preferir cabeçalho; senão, a primeira coluna textual que não seja
  // telefone, documento ou e-mail.
  let colNome = cabecalho.findIndex(
    (c, i) => i !== colTelefone && RE_COL_NOME.test(c) && !RE_COL_DOCUMENTO.test(c) && !RE_COL_EMAIL.test(c),
  );
  if (colNome < 0) {
    const colunas = Math.max(...corpo.map((l) => l.length), 0);
    for (let c = 0; c < colunas; c++) {
      if (c === colTelefone || ehDocumento(c)) continue;
      if (cabecalho[c] && RE_COL_EMAIL.test(cabecalho[c])) continue;
      const textuais = corpo.filter((l) => {
        const v = String(l[c] ?? "").trim();
        return v.length > 2 && !/^\d+$/.test(v);
      }).length;
      if (textuais >= corpo.length * 0.5) {
        colNome = c;
        break;
      }
    }
  }

  const vistos = new Set<string>();
  const contatos: ContatoPlanilha[] = [];
  let descartadas = 0;
  let duplicadas = 0;

  for (const linha of corpo) {
    const phone = normalizarTelefoneBrasil(soDigitos(linha[colTelefone]));
    if (!phone) {
      // Linha totalmente vazia não conta como descarte — é só o fim da planilha.
      if ((linha ?? []).some((c) => String(c ?? "").trim())) descartadas++;
      continue;
    }
    if (vistos.has(phone)) {
      duplicadas++;
      continue;
    }
    vistos.add(phone);
    const nome = colNome >= 0 ? String(linha[colNome] ?? "").trim() : "";
    contatos.push({ nome: nome || null, phone });
  }

  return {
    contatos,
    colunaTelefone: colTelefone,
    rotuloTelefone: cabecalho[colTelefone] || null,
    criterio,
    descartadas,
    duplicadas,
  };
}
