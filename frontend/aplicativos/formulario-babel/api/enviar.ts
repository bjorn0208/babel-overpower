/**
 * Vercel Function — recebe as respostas do formulário e grava uma linha na
 * aba "Dados" da planilha (via Apps Script publicado como app da web).
 *
 * Helpers ficam inline: o builder de function do Vercel compila cada api/*.ts
 * isoladamente e não resolve import de arquivo irmão (achado na Babel em
 * 2026-09-01, ver frontend/api/whatsapp-importar.ts).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";

const OBRIGATORIOS = ["responsavel_nome", "responsavel_whatsapp", "nome_comercial"];

type Corpo = {
  campos?: Record<string, string | string[]>;
  ordem?: string[];
  cabecalho?: string[];
  produtos?: Record<string, string | string[]>[];
  ordem_produto?: string[];
  cabecalho_produto?: string[];
  metodo_conexao?: string;
  aceite?: string;
};

// Como a pessoa terminou o formulário; qualquer outra coisa vira "Sem conexão".
const METODOS = ["QR code", "Código", "Sem conexão"];

const MAX_PRODUTOS = 200;

// Nome de aba do Sheets: sem colchetes, asterisco, barras, interrogação e
// dois-pontos; no máximo 90 chars (limite é 100; sobra pra " (2)").
function sanearNomeAba(nome: string): string {
  const limpo = nome.replace(/[\[\]*/\\?:]/g, " ").replace(/\s+/g, " ").trim();
  return (limpo || "Sem nome").slice(0, 90).trim();
}

function agoraBrt(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date()).replace(",", "");
}

function valorParaCelula(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

async function postarPlanilha(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.PLANILHA_WEBAPP_URL;
  const token = process.env.PLANILHA_TOKEN;
  if (!url || !token) throw new Error("PLANILHA_WEBAPP_URL/PLANILHA_TOKEN não configurados.");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // text/plain evita preflight e é o que o Apps Script espera em e.postData
    body: JSON.stringify({ token, ...corpo }),
    redirect: "follow", // Apps Script responde 302 pra script.googleusercontent.com com o resultado
  });
  const texto = await resp.text();
  let json: Record<string, unknown>;
  try { json = JSON.parse(texto); } catch { throw new Error(`Planilha respondeu algo inesperado (HTTP ${resp.status}): ${texto.slice(0, 200)}`); }
  if (!json.ok) throw new Error(String(json.erro ?? "Planilha recusou a gravação."));
  return json;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Use POST." });
    return;
  }
  const {
    campos, ordem, cabecalho, produtos, ordem_produto: ordemProduto, cabecalho_produto: cabecalhoProduto,
    metodo_conexao: metodoConexao, aceite,
  } = (req.body ?? {}) as Corpo;
  if (!campos || !Array.isArray(ordem) || !Array.isArray(cabecalho) || ordem.length !== cabecalho.length || ordem.length === 0) {
    res.status(400).json({ ok: false, erro: "Formulário incompleto — recarregue a página e tente de novo." });
    return;
  }
  for (const chave of OBRIGATORIOS) {
    if (!valorParaCelula(campos[chave])) {
      res.status(400).json({ ok: false, erro: `Falta preencher: ${chave.replace(/_/g, " ")}.` });
      return;
    }
  }

  const listaProdutos = Array.isArray(produtos) ? produtos : [];
  if (listaProdutos.length && (!Array.isArray(ordemProduto) || !Array.isArray(cabecalhoProduto) || ordemProduto.length !== cabecalhoProduto.length || ordemProduto.length === 0)) {
    res.status(400).json({ ok: false, erro: "Formulário incompleto — recarregue a página e tente de novo." });
    return;
  }
  if (listaProdutos.length > MAX_PRODUTOS) {
    res.status(400).json({ ok: false, erro: `No máximo ${MAX_PRODUTOS} produtos por envio.` });
    return;
  }

  const aba = sanearNomeAba(valorParaCelula(campos.nome_comercial));
  const idEnvio = randomBytes(4).toString("hex");
  const metodo = METODOS.includes(String(metodoConexao)) ? String(metodoConexao) : "Sem conexão";
  // As 4 colunas de controle ficam sempre no fim, depois das respostas — o
  // Code.gs acha "ID do envio" pela última coluna e o total pela penúltima.
  const linha = [agoraBrt(), ...ordem.map((k) => valorParaCelula(campos[k])), metodo, valorParaCelula(aceite) || "Não", "0", idEnvio];
  const cabecalhoCompleto = ["Enviado em", ...cabecalho, "Como conectou", "Aceite de dados", "Conversas trazidas", "ID do envio"];
  const enviadoEm = linha[0];
  const empresa = valorParaCelula(campos.nome_comercial);
  // Uma linha por item na aba "Produtos"; o ID do envio liga com a linha da aba "Dados".
  const linhasProdutos = listaProdutos
    .filter((p) => p && typeof p === "object" && (ordemProduto ?? []).some((k) => valorParaCelula(p[k])))
    .map((p, i) => [enviadoEm, idEnvio, empresa, String(i + 1), ...(ordemProduto ?? []).map((k) => valorParaCelula(p[k]))]);
  const cabecalhoProdutos = ["Enviado em", "ID do envio", "Empresa", "Item", ...(cabecalhoProduto ?? [])];

  try {
    await postarPlanilha({
      acao: "dados", linha, cabecalho: cabecalhoCompleto,
      produtos: linhasProdutos.length ? { cabecalho: cabecalhoProdutos, linhas: linhasProdutos } : undefined,
    });
    console.warn(`[enviar] gravado id_envio=${idEnvio} aba=${aba} produtos=${linhasProdutos.length} conexao=${metodo}`);
    res.status(200).json({ ok: true, aba, id_envio: idEnvio });
  } catch (e) {
    console.error("[enviar] falha ao gravar na planilha:", e);
    res.status(502).json({ ok: false, erro: "Não consegui gravar na planilha agora. Suas respostas continuam salvas aqui — tente de novo em instantes." });
  }
}
