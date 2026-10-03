/**
 * Helpers para a página pública de contrato v2.
 */

import type { DadosPagamento, EscolhaPagamento, OpcaoNomeada } from "./tipos";

/** Mapa de instrução de selfie → texto legível */
export const INSTRUCAO_SELFIE_MAP: Record<string, string> = {
  mostrar_2_dedos: "Mostre 2 dedos ao lado do rosto na foto.",
  segurar_documento: "Segure seu documento ao lado do rosto na foto.",
  documento_e_2_dedos:
    "Segure o documento ao lado do rosto e mostre 2 dedos com a outra mão.",
};

/** Formata número como BRL (ex: 1234.5 → "R$ 1.234,50") */
export function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Centavos (bigint do Postgres) → BRL formatado. Única conversão permitida no client. */
export function brlCent(centavos: number): string {
  return brl(centavos / 100);
}

/** "1.920,00" — mesmo formato do to_char do Postgres (sem "R$", sem milhar). */
function valorSql(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/**
 * Frase da cláusula de pagamento de uma opção nomeada.
 * ESPELHO de public.descrever_opcao_pagamento — o texto assinado sai do Postgres;
 * aqui é só o preview. Manter os dois iguais.
 */
export function descreverOpcaoNomeada(o: OpcaoNomeada): string {
  const parcelas = Math.max(1, o.parcelas || 1);
  let meio: string;
  if (parcelas > 1 && o.entrada_centavos > 0) {
    meio = `, sendo entrada de R$ ${valorSql(o.entrada_centavos)} + ${parcelas} parcelas de R$ ${valorSql(o.valor_parcela_centavos)}`;
  } else if (parcelas > 1) {
    meio = `, em ${parcelas} parcelas de R$ ${valorSql(o.valor_parcela_centavos)}`;
  } else {
    meio = ", em pagamento único";
  }
  const obs = o.observacao?.trim() ? ` ${o.observacao.trim()}` : "";
  return `Forma de pagamento escolhida: ${o.rotulo}. Valor total de R$ ${valorSql(o.total_centavos)}${meio}.${obs}`;
}

/** Opção nomeada escolhida, se a escolha for do tipo "opcao". */
export function opcaoNomeadaEscolhida(
  dp: DadosPagamento | null | undefined,
  escolha: EscolhaPagamento | null,
): OpcaoNomeada | null {
  if (escolha?.modo !== "opcao") return null;
  return dp?.planos?.junto?.opcoes_nomeadas?.find((o) => o.id === escolha.opcao_id) ?? null;
}

/**
 * Resumo do valor a pagar conforme a escolha do lead (F3b).
 * Fonte: planos pré-calculados no Postgres. Devolve 1 linha por cobrança —
 * "junto" = 1 linha; "separado" = 1 linha por produto. Zero conta no client.
 */
export function resumoEscolhaPagamento(
  dp: import("./tipos").DadosPagamento | null | undefined,
  escolha: import("./tipos").EscolhaPagamento | null,
): string[] | null {
  const planos = dp?.planos;
  if (!planos || !escolha?.modo) return null;
  if (escolha.modo === "opcao") {
    const o = opcaoNomeadaEscolhida(dp, escolha);
    return o ? [`${o.rotulo}: ${brlCent(o.total_centavos)}`] : null;
  }
  const linhaDoPlano = (plano: import("./tipos").PlanoPagamento, modo: string, parcelas: number | null, prefixo = "") => {
    if (modo !== "parcelado") return `${prefixo}${brlCent(plano.total_centavos)} à vista`;
    const o = plano.opcoes.find((x) => x.parcelas === (parcelas ?? plano.max_parcelas))
      ?? plano.opcoes[plano.opcoes.length - 1];
    const entrada = o.entrada_centavos > 0 ? `entrada de ${brlCent(o.entrada_centavos)} + ` : "";
    return `${prefixo}${entrada}${o.parcelas}× de ${brlCent(o.valor_parcela_centavos)}`;
  };
  if ((escolha.composicao ?? "junto") === "junto") {
    return [linhaDoPlano(planos.junto, escolha.modo, escolha.parcelas)];
  }
  return planos.separado.map((plano) => {
    const item = plano.por_produto?.[0];
    const e = escolha.por_produto?.find((p) => p.produto_id === item?.produto_id);
    return linhaDoPlano(plano, e?.modo ?? "avista", e?.parcelas ?? null, item?.nome ? `${item.nome}: ` : "");
  });
}

/* ── Documento do contratante: CPF (pessoa física) ou CNPJ (empresa) ──
   O número fica sempre no slug do template (`cpf`), que é o que hidrata o texto;
   `tipo_documento` vai junto em dados_cliente pra quem ler depois saber qual é. */
export type TipoDocumento = "CPF" | "CNPJ";

export function formatarDocumento(tipo: TipoDocumento, valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, tipo === "CPF" ? 11 : 14);
  if (tipo === "CPF") {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/\/(\d{4})(\d{1,2})$/, "/$1-$2");
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function documentoValido(tipo: TipoDocumento, valor: string): boolean {
  const d = valor.replace(/\D/g, "");
  if (tipo === "CPF") {
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const dv1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const dv2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return dv1 === Number(d[9]) && dv2 === Number(d[10]);
  }
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}

export type SocioCampo = { indice: number; nome: string; cpf: string };

const RE_CAMPO_SOCIO = /^socio_(\d+)_(nome|cpf)$/;

export function extrairSocios(dados: Record<string, string>): SocioCampo[] {
  const porIndice = new Map<number, SocioCampo>();
  for (const [chave, valor] of Object.entries(dados)) {
    const match = RE_CAMPO_SOCIO.exec(chave);
    if (!match) continue;
    const indice = Number(match[1]);
    const atual = porIndice.get(indice) ?? { indice, nome: "", cpf: "" };
    if (match[2] === "nome") atual.nome = valor.trim();
    if (match[2] === "cpf") atual.cpf = valor.trim();
    porIndice.set(indice, atual);
  }
  return [...porIndice.values()].sort((a, b) => a.indice - b.indice);
}

export function formatarSocios(dados: Record<string, string>): string {
  const linhas = extrairSocios(dados)
    .filter((socio) => socio.nome.length > 0 || socio.cpf.length > 0)
    .map((socio) => {
    const cpf = socio.cpf ? ` — CPF ${socio.cpf}` : "";
    return `- ${socio.nome}${cpf}`;
  });
  return linhas.length > 0 ? `SÓCIOS ADICIONAIS:\n${linhas.join("\n")}` : "";
}

export function sociosValidos(dados: Record<string, string>): boolean {
  return extrairSocios(dados)
    .filter((socio) => socio.nome.length > 0 || socio.cpf.length > 0)
    .every((socio) => socio.nome.length > 1 && documentoValido("CPF", socio.cpf));
}

/** Calcula SHA-256 do texto do contrato para o payload de assinatura */
export async function calcularHash(texto: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hidratar os {{campo}} de cliente no texto do contrato (só para preview local).
 * NÃO resolve o bloco {{COND_PAG_*}} — deixar para resolverBlocoPagamento.
 */
export function hidratarCampos(
  texto: string,
  dados: Record<string, string>
): string {
  // Tokens internos da plataforma — preenchidos automaticamente, não vão pro
  // formulário do signatário. `data_assinatura` é a data corrente até assinar;
  // depois da assinatura, a RPC ainda grava o texto com o token literal e o
  // motor de exibição re-aplica esta hidratação usando `assinado_em` quando
  // está disponível em `dados`.
  const tokensAutomaticos: Record<string, string> = {
    data_assinatura: new Date().toLocaleDateString("pt-BR"),
  };
  const todos: Record<string, string> = {
    ...tokensAutomaticos,
    ...dados,
    socios_adicionais: dados.socios_adicionais || formatarSocios(dados),
  };
  return texto.replace(/\{\{([a-z_]+)\}\}/g, (_, k: string) => todos[k] ?? `{{${k}}}`);
}

/**
 * Resolve o bloco condicional de pagamento SOMENTE para preview local.
 * O bloco tem formato:
 *   {{COND_PAG_INI}}
 *   {{VAR_AVISTA}}<texto à vista>{{/VAR_AVISTA}}
 *   {{VAR_PARCELADO}}<texto parcelado>{{/VAR_PARCELADO}}
 *   {{COND_PAG_FIM}}
 *
 * A RPC resolve no servidor — aqui é só para exibição.
 */
export function resolverBlocoPreview(
  texto: string,
  escolha: EscolhaPagamento | null,
  dadosPagamento: DadosPagamento | null
): string {
  const blocoRe =
    /\{\{COND_PAG_INI\}\}([\s\S]*?)\{\{COND_PAG_FIM\}\}/g;

  return texto.replace(blocoRe, (_, interior: string) => {
    if (!escolha) {
      // Ainda sem escolha: avisa no preview
      return "[forma de pagamento será inserida após sua escolha]";
    }

    const avistaRe = /\{\{VAR_AVISTA\}\}([\s\S]*?)\{\{\/VAR_AVISTA\}\}/;
    const parceladoRe = /\{\{VAR_PARCELADO\}\}([\s\S]*?)\{\{\/VAR_PARCELADO\}\}/;

    if (escolha.modo === "opcao") {
      const o = opcaoNomeadaEscolhida(dadosPagamento, escolha);
      return o ? descreverOpcaoNomeada(o) : "[forma de pagamento será inserida após sua escolha]";
    }

    if (escolha.modo === "avista") {
      const m = avistaRe.exec(interior);
      return m ? m[1].trim() : "";
    }

    const m = parceladoRe.exec(interior);
    if (!m) return "";
    let textoParcelado = m[1].trim();

    // Resolve tokens de parcela localmente para o preview, com a MESMA fonte da
    // RPC de assinatura: a opção do plano "junto" (entrada + parcela cravada).
    // Antes dividia total_avista pelo nº de parcelas e mostrava 697 ÷ 6 = 116,17
    // num molde cuja regra é entrada de 197 + 6× de 150 — e deixava {VALOR_ENTRADA}
    // cru no texto (2026-09-11, tenant Easy).
    if (dadosPagamento) {
      const parcelas = escolha.parcelas ?? dadosPagamento.parcelas ?? dadosPagamento.max_parcelas;
      const opcoes = dadosPagamento.planos?.junto?.opcoes ?? [];
      const opcao = opcoes.find((o) => o.parcelas === parcelas) ?? opcoes[opcoes.length - 1];
      let entrada: number;
      let valorParcela: number;
      let total: number;
      if (opcao) {
        entrada = opcao.entrada_centavos / 100;
        valorParcela = opcao.valor_parcela_centavos / 100;
        total = opcao.total_centavos / 100;
      } else {
        // fallback: parcelamento do molde gravado em dados_pagamento; último recurso = divisão
        entrada = dadosPagamento.entrada ?? 0;
        valorParcela =
          dadosPagamento.valor_parcela && dadosPagamento.valor_parcela > 0
            ? dadosPagamento.valor_parcela
            : Math.round(((dadosPagamento.total_avista - entrada) / Math.max(parcelas, 1)) * 100) / 100;
        total = Math.round((entrada + parcelas * valorParcela) * 100) / 100;
      }
      const nParcelas = opcao ? opcao.parcelas : parcelas;
      textoParcelado = textoParcelado
        .replace(/\{NUMERO_PARCELAS\}/g, String(nParcelas))
        .replace(/\{VALOR_PARCELA\}/g, brl(valorParcela))
        .replace(/\{TOTAL_PARCELADO\}/g, brl(total))
        .replace(/\{VALOR_ENTRADA\}/g, entrada > 0 ? brl(entrada) : "");
    }

    return textoParcelado;
  });
}

/**
 * Prepara o texto para exibição no preview: hidratar campos + resolver bloco.
 */
export function prepararTextoPreview(
  textoContrato: string,
  dados: Record<string, string>,
  escolha: EscolhaPagamento | null,
  dadosPagamento: DadosPagamento | null
): string {
  const semCampos = hidratarCampos(textoContrato, dados);
  return resolverBlocoPreview(semCampos, escolha, dadosPagamento);
}
