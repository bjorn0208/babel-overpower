/**
 * PpDocumento — render do texto do contrato com hidratação local.
 * Exibe o texto_contrato com {{campo}} substituídos pelos dados do lead
 * e o bloco {{COND_PAG_*}} resolvido conforme escolha atual (só para preview).
 * Reproduz pp-doc.jsx do bundle Claude design adaptado ao contrato de dados v2.
 */

import type { DadosContrato, EscolhaPagamento } from "./tipos";
import { prepararTextoPreview } from "./helpers";

interface Props {
  contrato: DadosContrato;
  dados: Record<string, string>;
  escolha: EscolhaPagamento | null;
}

export function PpDocumento({ contrato, dados, escolha }: Props) {
  const textoBase = contrato.texto_contrato ?? "";
  const textoFinal = prepararTextoPreview(
    textoBase,
    dados,
    escolha,
    contrato.dados_pagamento
  );

  if (!textoFinal.trim()) {
    return (
      <p style={{ color: "var(--pp-ink-4)", fontStyle: "italic" }}>
        (Sem texto de contrato)
      </p>
    );
  }

  // Renderiza o texto preservando quebras de linha e marcações simples
  const linhas = textoFinal.split("\n");

  return (
    <>
      {linhas.map((linha, i) => {
        const trim = linha.trim();
        if (!trim) return <br key={i} />;
        if (trim.startsWith("# "))
          return <h1 key={i}>{trim.slice(2)}</h1>;
        if (trim.startsWith("## "))
          return <h2 key={i}>{trim.slice(3)}</h2>;
        if (trim.startsWith("### "))
          return <h3 key={i}>{trim.slice(4)}</h3>;
        return <p key={i}>{trim}</p>;
      })}
    </>
  );
}
