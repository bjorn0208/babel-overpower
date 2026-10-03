/**
 * Mapa das 16 coleções do Backup (documento camelCase, id de texto) ↔ linha de `gestao_*` (snake_case, uuid).
 * Só dados e conversão: nenhum acesso ao banco aqui (o importador está em dados.ts).
 *
 * FONTE: sandbox-gestao/CATALOGO.mjs (lista permitida de colunas). O uuid do documento é o MESMO do sandbox
 * (md5 de "gestao:<id>" em forma de uuid), como manda o plano (PLANO-DE-ACAO-GESTAO-BABEL.md, fase 4):
 * assim as referências entre coleções resolvem sem tabela auxiliar e reimportar não duplica.
 * Fora do Backup por decisão do plano: acessos, pedidos de acesso e arquivos (comprovantes).
 */

type Tipo = "text" | "date" | "ts" | "num" | "int" | "bool" | "json" | "texts" | "ref";
type Campo = [chave: string, coluna: string, tipo: Tipo];

const f = (k: string, c?: string, t?: Tipo): Campo => [k, c ?? k, t ?? "text"];

const REUNIAO: Campo[] = [
  f("clienteId", "cliente_id", "ref"),
  f("data", "data", "date"),
  f("hora"),
  f("responsavel"),
  f("tipo"),
  f("status"),
  f("resumo"),
  f("motivo"),
  f("remarcadaPara", "remarcada_para", "date"),
  f("origemId", "origem_id", "ref"),
];

export interface ColecaoMapa {
  tabela: string;
  campos: Campo[];
  /** 1 = clientes; 2 = filhas de cliente com FK; 3 = o resto (decisão 14: importar na ordem das chaves). */
  etapa: 1 | 2 | 3;
}

export const MAPA: Record<string, ColecaoMapa> = {
  clientes: {
    tabela: "gestao_clientes",
    etapa: 1,
    campos: [
      f("nome"),
      f("email"),
      f("telefone"),
      f("profileId", "profile_id", "ref"),
      f("fechamento", "fechamento", "date"),
      f("implementacao", "implementacao", "date"),
      f("setup", "setup", "num"),
      f("mensalidade", "mensalidade", "num"),
      f("inicioCobranca", "inicio_cobranca", "date"),
      f("situacao"),
      f("suporte"),
      f("implementador"),
      f("obs"),
    ],
  },
  parcelas: {
    tabela: "gestao_parcelas",
    etapa: 2,
    campos: [
      f("clienteId", "cliente_id", "ref"),
      f("desc", "descricao"),
      f("valor", "valor", "num"),
      f("venc", "vencimento", "date"),
      f("pago", "pago_em", "date"),
    ],
  },
  mensalidades: {
    tabela: "gestao_mensalidades",
    etapa: 2,
    campos: [
      f("clienteId", "cliente_id", "ref"),
      f("n", "n", "int"),
      f("pago", "pago_em", "date"),
      f("valorRecebido", "valor_recebido", "num"),
    ],
  },
  atividade: {
    tabela: "gestao_atividade",
    etapa: 2,
    campos: [
      f("clienteId", "cliente_id", "ref"),
      f("comp", "competencia"),
      f("tokens", "tokens", "int"),
      f("leads", "leads", "int"),
    ],
  },
  reunioes: {
    tabela: "gestao_reunioes",
    etapa: 3,
    campos: [...REUNIAO, f("atendId", "atend_id", "ref")],
  },
  vendedores: {
    tabela: "gestao_vendedores",
    etapa: 3,
    campos: [
      f("nome"),
      f("codigo"),
      f("whatsapp"),
      f("email"),
      f("tipo"),
      f("ativo", "ativo", "bool"),
      f("criadoEm", "criado_em", "ts"),
    ],
  },
  vendas: {
    tabela: "gestao_vendas",
    etapa: 3,
    campos: [
      f("vendedorId", "vendedor_id", "ref"),
      f("vendedorNome", "vendedor_nome"),
      f("dataVenda", "data_venda", "date"),
      f("plano"),
      f("setup", "setup", "num"),
      f("clienteId", "cliente_id", "ref"),
      f("clienteNome", "cliente_nome"),
      f("empresa"),
      f("nicho"),
      f("whatsapp"),
      f("email"),
      f("status"),
      f("origem"),
      f("obs"),
      f("indicacaoId", "indicacao_id", "ref"),
      f("comprovante", "comprovante", "json"),
      f("anexos", "anexos", "json"),
      f("submissionId", "submission_id"),
      f("consentText", "consentimento_texto"),
      f("consentAt", "consentimento_em", "ts"),
      f("createdAt", "criado_em", "ts"),
    ],
  },
  indicadores: {
    tabela: "gestao_indicadores",
    etapa: 3,
    campos: [f("codigo"), f("criadoEm", "criado_em", "ts")],
  },
  indicacoes: {
    tabela: "gestao_indicacoes",
    etapa: 3,
    campos: [
      f("indicadorId", "indicador_id", "ref"),
      f("referrerName", "referrer_name"),
      f("referrerCode", "referrer_code"),
      f("leadName", "lead_nome"),
      f("leadWhatsapp", "lead_whatsapp"),
      f("leadEmail", "lead_email"),
      f("company", "empresa"),
      f("niche", "nicho"),
      f("bestTime", "melhor_horario"),
      f("preferredDate", "data_preferida", "date"),
      f("status"),
      f("need", "necessidade"),
      f("obs"),
      f("origem"),
      f("responsavel"),
      f("inicio", "inicio", "date"),
      f("inicioHora", "inicio_hora"),
      f("iniciadoEm", "iniciado_em", "ts"),
      f("enviadoVendasEm", "enviado_vendas_em", "ts"),
      f("vendaId", "venda_id", "ref"),
      f("tentativas", "tentativas", "json"),
      f("dias", "dias", "json"),
      f("dataIndicacao", "data_indicacao", "date"),
      f("submissionId", "submission_id"),
      f("consentText", "consentimento_texto"),
      f("consentAt", "consentimento_em", "ts"),
      f("createdAt", "criado_em", "ts"),
    ],
  },
  funcionarios: {
    tabela: "gestao_funcionarios",
    etapa: 3,
    campos: [
      f("nome"),
      f("cargo"),
      f("whatsapp"),
      f("email"),
      f("ativo", "ativo", "bool"),
      f("area"),
    ],
  },
  implementacoes: {
    tabela: "gestao_implementacoes",
    etapa: 3,
    campos: [
      f("clienteId", "cliente_id", "ref"),
      f("clienteNome", "cliente_nome"),
      f("vendaId", "venda_id", "ref"),
      f("status"),
      f("responsavel"),
      f("programador"),
      f("suporteResponsavel", "suporte_responsavel"),
      f("enviadoEm", "enviado_em", "ts"),
      f("inicio", "inicio", "date"),
      f("inicioHora", "inicio_hora"),
      f("iniciadoEm", "iniciado_em", "ts"),
      f("concluidoEm", "concluido_em", "ts"),
      f("enviadoProgEm", "enviado_prog_em", "ts"),
      f("progIniciadoEm", "prog_iniciado_em", "ts"),
      f("progConcluidoEm", "prog_concluido_em", "ts"),
      f("progInicio", "prog_inicio", "date"),
      f("progInicioHora", "prog_inicio_hora"),
      f("validacaoDesde", "validacao_desde", "ts"),
      f("validadoEm", "validado_em", "ts"),
      f("callValidacao", "call_validacao", "date"),
      f("callValidacaoHora", "call_validacao_hora"),
      f("ultimaVolta", "ultima_volta"),
      f("obsFinal", "obs_final"),
      f("suporteAuto", "suporte_auto", "bool"),
      f("suporteRemovido", "suporte_removido", "bool"),
      f("ocultoProg", "oculto_prog", "bool"),
      f("ocultoImpl", "oculto_impl", "bool"),
      f("tentativas", "tentativas", "json"),
      f("dias", "dias", "json"),
      f("retornos", "retornos", "json"),
    ],
  },
  implReunioes: {
    tabela: "gestao_impl_reunioes",
    etapa: 3,
    campos: [...REUNIAO, f("implId", "impl_id", "ref"), f("area")],
  },
  suporteAtend: {
    tabela: "gestao_suporte_atend",
    etapa: 3,
    campos: [
      f("clienteId", "cliente_id", "ref"),
      f("clienteNome", "cliente_nome"),
      f("implId", "impl_id", "ref"),
      f("enviadoEm", "enviado_em", "ts"),
      f("status"),
      f("responsavel"),
      f("suporteResponsavel", "suporte_responsavel"),
      f("inicio", "inicio", "date"),
      f("inicioHora", "inicio_hora"),
      f("concluidoEm", "concluido_em", "ts"),
      f("obsFinal", "obs_final"),
      f("origem"),
      f("tentativas", "tentativas", "json"),
      f("dias", "dias", "json"),
      f("retornos", "retornos", "json"),
    ],
  },
  tarefas: {
    tabela: "gestao_tarefas",
    etapa: 3,
    campos: [
      f("titulo"),
      f("descricao"),
      f("responsavel"),
      f("prazo", "prazo", "date"),
      f("prioridade"),
      f("area"),
      f("status"),
      f("bloqueio"),
      f("clienteId", "cliente_id", "ref"),
      f("implId", "impl_id", "ref"),
      f("reuniaoId", "reuniao_id", "ref"),
      f("origemKey", "origem_key"),
      f("criadoEm", "criado_em", "ts"),
      f("concluidoEm", "concluido_em", "ts"),
    ],
  },
  reunioesEquipe: {
    tabela: "gestao_reunioes_equipe",
    etapa: 3,
    campos: [
      f("titulo"),
      f("tipo"),
      f("data", "data", "date"),
      f("hora"),
      f("duracao"),
      f("participantes", "participantes", "texts"),
      f("pauta"),
      f("ata"),
      f("status"),
      f("motivo"),
      f("criadoEm", "criado_em", "ts"),
    ],
  },
};

/** Coleções de documento único (config/equipe, config/rodizioSuporte…): chave de texto, valor = o documento. */
export const COLECAO_CONFIG = "config";

// ---------------------------------------------------------------------------
// ids: texto do pacote → uuid, sempre o mesmo (md5 de "gestao:<id>", como o sandbox)
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const ehUuid = (s: string): boolean => UUID.test(s);

const K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
);
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

/** md5 (RFC 1321) de um texto UTF-8, em hexadecimal. Só para o id determinístico; não é segurança. */
export function md5(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  const total = ((bytes.length + 8) >> 6) * 64 + 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (bytes.length * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor((bytes.length * 8) / 2 ** 32), true);
  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    let a = a0,
      b = b0,
      c = c0,
      d = d0;
    for (let i = 0; i < 64; i++) {
      let fx: number, g: number;
      if (i < 16) {
        fx = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        fx = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        fx = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        fx = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const s = S[(i >> 4) * 4 + (i % 4)];
      const soma = (a + fx + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((soma << s) | (soma >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return Array.from(new Uint8Array(out.buffer))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/** id de texto do pacote → uuid (o mesmo do sandbox); um uuid de verdade passa direto. */
export function uuidDe(id: string | number): string {
  const s = String(id);
  if (UUID.test(s)) return s.toLowerCase();
  const h = md5(`gestao:${s}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// documento → linha (e de volta)
// ---------------------------------------------------------------------------

export class ErroValidacao extends Error {}

const ehObjeto = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);

function valorSql(tipo: Tipo, v: unknown, chave: string): unknown {
  if (v === undefined || v === null || v === "") return tipo === "text" && v === "" ? "" : null;
  switch (tipo) {
    case "text":
      return String(v);
    case "date":
      if (typeof v !== "string" || !DATA.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
        throw new ErroValidacao(`Campo "${chave}": data inválida (use AAAA-MM-DD).`);
      }
      return v;
    case "ts": {
      const t = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
      if (!t || Number.isNaN(t.getTime()))
        throw new ErroValidacao(`Campo "${chave}": data e hora inválidas.`);
      return t.toISOString();
    }
    case "num": {
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > 1e11)
        throw new ErroValidacao(`Campo "${chave}": número inválido.`);
      return n;
    }
    case "int": {
      const n = Number(v);
      if (!Number.isInteger(n) || Math.abs(n) > 9e15)
        throw new ErroValidacao(`Campo "${chave}": inteiro inválido.`);
      return n;
    }
    case "bool":
      if (typeof v !== "boolean")
        throw new ErroValidacao(`Campo "${chave}": esperava verdadeiro/falso.`);
      return v;
    case "json":
      return v;
    case "texts":
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        throw new ErroValidacao(`Campo "${chave}": esperava lista de textos.`);
      }
      return v;
    case "ref":
      if (typeof v !== "string" && typeof v !== "number")
        throw new ErroValidacao(`Campo "${chave}": id inválido.`);
      return uuidDe(v);
  }
}

/** Documento do Backup → linha pronta para upsert (com id determinístico, id_origem e extras). */
export function docParaLinha(
  colecao: string,
  idDoc: string,
  doc: unknown,
): Record<string, unknown> {
  const cat = MAPA[colecao];
  if (!cat) throw new ErroValidacao(`Coleção desconhecida: ${colecao}`);
  if (!ehObjeto(doc)) throw new ErroValidacao("O documento precisa ser um objeto.");
  const linha: Record<string, unknown> = { id: uuidDe(idDoc), id_origem: String(idDoc) };
  const usados = new Set<string>();
  for (const [k, c, t] of cat.campos) {
    usados.add(k);
    linha[c] = valorSql(t, doc[k], k);
  }
  const extras: Record<string, unknown> = {};
  for (const k of Object.keys(doc)) {
    if (usados.has(k) || k === "id" || k === "__proto__") continue;
    extras[k] = doc[k];
  }
  linha.extras = extras;
  return linha;
}

/** Linha do banco → documento do Backup (campos vazios não aparecem, como num documento). */
export function linhaParaDoc(
  colecao: string,
  linha: Record<string, unknown>,
  origemDe: (uuid: string) => string,
): Record<string, unknown> {
  const cat = MAPA[colecao];
  const doc: Record<string, unknown> = {};
  if (ehObjeto(linha.extras)) Object.assign(doc, linha.extras);
  for (const [k, c, t] of cat.campos) {
    const v = linha[c];
    if (v === null || v === undefined) continue;
    if (t === "ts") doc[k] = new Date(v as string).toISOString();
    else if (t === "num" || t === "int") doc[k] = Number(v);
    else if (t === "ref") doc[k] = origemDe(String(v));
    else doc[k] = v;
  }
  return doc;
}
