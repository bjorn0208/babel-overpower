/**
 * serializa.ts — conversão bidirecional texto-com-tokens ↔ ProseMirror doc
 *
 * Ajuste A (DEC-037): o conteúdo do contrato é texto-com-tokens, não JSON puro.
 * O TipTap edita visualmente, mas a serialização produz texto simples onde:
 *   - tokens inline aparecem literalmente: {{nome_completo}}, {TOTAL_AVISTA}
 *   - tokens de bloco aparecem em linha própria: {ITENS_CONTRATADOS}
 *   - parágrafos viram linhas separadas por \n\n
 *   - quebras de linha (<hardBreak>) viram \n
 *
 * Round-trip garantido pelo teste vitest (ver serializa.test.ts).
 *
 * Decisões de implementação:
 *   - Token detectado por regex /({{[^}]+}}|\{[A-Z_]+\})/g — cobre {{slug}} e {TOKEN}
 *   - Parágrafo vazio → nó paragraph com content [] (TipTap aceita)
 *   - Blocos ({ITENS_CONTRATADOS} etc) precisam estar em linha isolada no texto
 *     pra serem deserializados como blockToken; se estiverem no meio de parágrafo,
 *     tratamos como tokenInline (comportamento seguro, sem perda de dado)
 */

import type { ProseMirrorDoc, ProseMirrorNode } from "../tipos";
import { TOKENS_BLOCO } from "../tipos";

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

/** Casa {{slug}} e {TOKEN} em qualquer posição do texto. */
const RE_TOKEN = /({{[^}]+}}|\{[A-Z_][A-Z0-9_]*\})/g;

// ---------------------------------------------------------------------------
// docParaTexto — serializa ProseMirror JSON → texto-com-tokens
// ---------------------------------------------------------------------------

/**
 * Serializa um doc ProseMirror (saída do TipTap) para texto simples
 * onde tokens ficam literais ({{campo}}, {TOKEN}).
 *
 * @param doc - Documento ProseMirror JSON
 * @returns Texto plano com tokens como strings literais
 */
export function docParaTexto(doc: ProseMirrorDoc): string {
  return serializarNos(doc.content).trimEnd();
}

function serializarNos(nos: ProseMirrorNode[]): string {
  return nos.map(serializarNo).join("");
}

function serializarNo(no: ProseMirrorNode): string {
  switch (no.type) {
    case "doc":
      return serializarNos(no.content ?? []);

    case "paragraph": {
      const interior = serializarNos(no.content ?? []);
      return interior + "\n\n";
    }

    case "hardBreak":
      return "\n";

    case "text":
      return no.text ?? "";

    case "token":
      // token inline → literal
      return (no.attrs?.token as string) ?? "";

    case "blockToken":
      // token de bloco → linha isolada com separador de parágrafo
      return ((no.attrs?.token as string) ?? "") + "\n\n";

    case "heading": {
      const nivel = (no.attrs?.level as number) ?? 1;
      const prefix = "#".repeat(nivel) + " ";
      return prefix + serializarNos(no.content ?? []) + "\n\n";
    }

    case "bulletList":
      return serializarNos(no.content ?? []) + "\n";

    case "orderedList":
      return serializarNos(no.content ?? []) + "\n";

    case "listItem":
      return "- " + serializarNos(no.content ?? []).trimEnd() + "\n";

    case "blockquote":
      return (
        serializarNos(no.content ?? [])
          .split("\n")
          .map((l) => "> " + l)
          .join("\n") + "\n\n"
      );

    default:
      // nó desconhecido — serializa filhos recursivamente
      if (no.content?.length) return serializarNos(no.content);
      return "";
  }
}

// ---------------------------------------------------------------------------
// textoParaDoc — desserializa texto-com-tokens → ProseMirror JSON
// ---------------------------------------------------------------------------

/**
 * Converte texto simples com tokens literais ({{campo}}, {TOKEN})
 * para um documento ProseMirror compatível com TipTap.
 *
 * Regra de parsing:
 *   - Linha em branco separa parágrafos
 *   - Linha isolada que é EXATAMENTE um token de bloco → blockToken node
 *   - Dentro de parágrafo: tokens inline → nó "token", texto comum → nó "text"
 *
 * @param texto - Texto plano com tokens literais
 * @returns ProseMirrorDoc para carregar no editor TipTap
 */
export function textoParaDoc(texto: string): ProseMirrorDoc {
  // Normaliza quebras de linha
  const normalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Divide em blocos por parágrafo (linha em branco dupla)
  const blocos = normalizado.split(/\n\n+/);

  const content: ProseMirrorNode[] = [];

  for (const bloco of blocos) {
    const trimado = bloco.trim();
    if (!trimado) continue;

    // Verifica se o bloco inteiro é um token de bloco isolado
    if (TOKENS_BLOCO.includes(trimado)) {
      content.push({
        type: "blockToken",
        attrs: { token: trimado },
      });
      continue;
    }

    // Caso contrário: parágrafo com possíveis tokens inline e quebras simples
    const linhas = trimado.split("\n");
    const nosConteudo: ProseMirrorNode[] = [];

    for (let i = 0; i < linhas.length; i++) {
      if (i > 0) {
        // Quebra simples de linha → hardBreak
        nosConteudo.push({ type: "hardBreak" });
      }

      const linha = linhas[i];
      // Verifica se linha isolada (dentro do parágrafo) é token de bloco
      // → tratamos como token inline pra não quebrar a estrutura do parágrafo
      const nosLinha = parsearLinha(linha);
      nosConteudo.push(...nosLinha);
    }

    content.push({
      type: "paragraph",
      content: nosConteudo,
    });
  }

  // Garante que o doc nunca fica vazio (TipTap exige ao menos 1 nó)
  if (content.length === 0) {
    content.push({ type: "paragraph", content: [] });
  }

  return { type: "doc", content };
}

/**
 * Parseia uma linha de texto em nós inline (text + token).
 * Usa RE_TOKEN para identificar {{slug}} e {TOKEN}.
 */
function parsearLinha(linha: string): ProseMirrorNode[] {
  if (!linha) return [];

  const nos: ProseMirrorNode[] = [];
  let ultimoIndex = 0;

  RE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RE_TOKEN.exec(linha)) !== null) {
    // Texto antes do token
    if (match.index > ultimoIndex) {
      nos.push({
        type: "text",
        text: linha.slice(ultimoIndex, match.index),
      });
    }

    // Token inline
    nos.push({
      type: "token",
      attrs: { token: match[0] },
    });

    ultimoIndex = match.index + match[0].length;
  }

  // Texto restante após último token
  if (ultimoIndex < linha.length) {
    nos.push({
      type: "text",
      text: linha.slice(ultimoIndex),
    });
  }

  return nos;
}
