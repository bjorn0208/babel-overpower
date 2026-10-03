/**
 * PainelPreview — carrinho de exemplo editável + render best-effort do contrato.
 *
 * TODO(2e): substituir DocumentoPreenchido por render-doc oficial quando
 * o tijolo 2e for entregue. Aqui é um preview "best-effort" que resolve
 * os tokens do conteúdo serializado via serializa.ts (texto plano).
 *
 * Carrinho default: 2×ProdA + 3×ProdB + 1×ProdC (ou os 3 primeiros do template).
 * Se o template tiver < 3 produtos aceitos, usa o que houver.
 */

import { useState } from "react";
import type { TemplateV2 } from "../tipos";
import { calcularCarrinho, brl } from "./logica";
import type { CarrinhoItem, ProdutoRef } from "./logica";
import { docParaTexto } from "../editor/serializa";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PainelPreviewProps {
  template: TemplateV2;
  /** Lista de produtos do tenant para resolução de nomes */
  produtosRef: ProdutoRef[];
}

// ---------------------------------------------------------------------------
// Helpers de render best-effort
// ---------------------------------------------------------------------------

/** Dados fictícios do lead para preencher {{tokens}} */
function dadosFicticios(template: TemplateV2): Record<string, string> {
  const exemplos: Record<string, string> = {
    nome_completo: "Maria Aparecida da Silva",
    cpf: "123.456.789-00",
    email: "maria.silva@exemplo.com",
    telefone: "(11) 99876-5432",
    endereco: "Rua das Acácias, 120 — Pinheiros, SP",
    data_nascimento: "03/02/1992",
    cnpj: "12.345.678/0001-90",
  };
  const dados: Record<string, string> = {};
  for (const c of template.campos_cliente ?? []) {
    dados[`{{${c.slug}}}`] = exemplos[c.slug] ?? `[${c.rotulo}]`;
  }
  return dados;
}

/** Substitui tokens no texto serializado (best-effort) */
function resolverTexto(
  texto: string,
  dadosCliente: Record<string, string>,
  dadosValores: Record<string, string>
): string {
  const todos = { ...dadosCliente, ...dadosValores };
  return texto.replace(/({{[^}]+}}|\{[A-Z_][A-Z0-9_]*\})/g, (m) => todos[m] ?? m);
}

/**
 * Resolve as seções condicionais de pagamento pelo modo escolhido, do mesmo jeito
 * que a RPC de contrato faz no banco (migration `20260726210600`): fica a seção do
 * modo, some a do outro, e as tags saem.
 *
 * Sem isso o preview mostrava `{SE_PARCELADO}` cru — o token casa com o regex de
 * `resolverTexto` mas não está no mapa, e `{/SE_PARCELADO}` nem casava (começa com
 * `/`) — e ainda exibia as DUAS seções ao mesmo tempo. O contrato assinado sempre
 * saiu certo; era só o preview mentindo.
 */
function resolverSecoesPagamento(texto: string, modo: "avista" | "parcelado"): string {
  const manter = modo === "avista" ? "SE_A_VISTA" : "SE_PARCELADO";
  const remover = modo === "avista" ? "SE_PARCELADO" : "SE_A_VISTA";

  return texto
    .replace(new RegExp(`\\{${remover}\\}[\\s\\S]*?\\{\\/${remover}\\}`, "g"), "")
    .replace(new RegExp(`\\{\\/?${manter}\\}`, "g"), "")
    // Tag órfã (seção aberta e não fechada no editor) não pode vazar pra tela.
    .replace(/\{\/?SE_A_VISTA\}|\{\/?SE_PARCELADO\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Sub-componente: documento preenchido (best-effort)
// ---------------------------------------------------------------------------

function DocumentoPreenchido({
  template,
  carrinho,
  modo,
  produtosRef,
}: {
  template: TemplateV2;
  carrinho: CarrinhoItem[];
  modo: "avista" | "parcelado";
  produtosRef: ProdutoRef[];
}) {
  const calc = calcularCarrinho(template, carrinho, produtosRef);
  const { itens, totalAvista, totalParcelado, maxParcelas, entrada, valorParcela } = calc;

  const dadosCliente = dadosFicticios(template);
  const dadosValores: Record<string, string> = {
    "{TOTAL_AVISTA}":    brl(totalAvista),
    "{TOTAL_PARCELADO}": brl(totalParcelado),
    "{NUMERO_PARCELAS}": String(maxParcelas),
    "{VALOR_PARCELA}":   brl(valorParcela),
    "{PRODUTO_NOME}":    itens[0]?.nome ?? "[produto]",
    "{PRODUTO_QTD}":     String(itens[0]?.quantidade ?? 1),
    "{PRODUTO_PRECO_AVISTA}":    brl(itens[0]?.subtotal_avista ?? 0),
    "{PRODUTO_PRECO_PARCELADO}": brl(itens[0]?.subtotal_parcelado ?? 0),
  };

  // Serializa conteúdo comum pra texto e resolve tokens
  const textoComum = template.conteudo_comum
    ? docParaTexto(template.conteudo_comum)
    : "(editor vazio — adicione cláusulas no painel esquerdo)";

  // Seções condicionais primeiro: só o que sobra do modo escolhido é que vira
  // texto resolvido. Se rodasse depois, a seção do outro modo já teria os tokens
  // trocados e apareceria na tela com números do modo errado.
  const textoDoModo = resolverSecoesPagamento(textoComum, modo);

  // Substitui blocos especiais por renders inline simplificados
  let textoFinal = resolverTexto(textoDoModo, dadosCliente, dadosValores);

  // {ITENS_CONTRATADOS} → tabela ASCII simples no preview
  if (textoFinal.includes("{ITENS_CONTRATADOS}")) {
    const linhas = itens.map(
      (it) =>
        `${it.quantidade}× ${it.nome}: ${brl(modo === "avista" ? it.subtotal_avista : it.subtotal_parcelado)}`
    );
    const totalStr = `Total: ${brl(modo === "avista" ? totalAvista : totalParcelado)}`;
    textoFinal = textoFinal.replace(
      "{ITENS_CONTRATADOS}",
      [...linhas, totalStr].join("\n")
    );
  }

  // {COND_PAGAMENTO} → texto descritivo
  if (textoFinal.includes("{COND_PAGAMENTO}")) {
    // Com entrada (TAP), a frase precisa separá-la das parcelas — senão descreve um
    // parcelamento que não existe. É o caso do contrato do Diego: entrada de 117 +
    // 5× de 147 = 852, que o texto genérico exibia como "5× de 170,40".
    const condParcelado =
      entrada > 0
        ? `O(a) CONTRATANTE pagará ${brl(totalParcelado)}: entrada de ${brl(entrada)} mais ${maxParcelas}× de ${brl(valorParcela)}.`
        : `O(a) CONTRATANTE pagará ${brl(totalParcelado)} em ${maxParcelas}× de ${brl(valorParcela)}.`;
    const condTexto =
      modo === "avista"
        ? `O(a) CONTRATANTE pagará ${brl(totalAvista)} à vista via PIX.`
        : condParcelado;
    textoFinal = textoFinal.replace("{COND_PAGAMENTO}", condTexto);
  }
  // O fechamento nunca foi consumido por ninguém: não casa com o regex de
  // `resolverTexto` (começa com "/") e não havia replace pra ele. No template do
  // Diego o bloco {COND_PAGAMENTO}…{/COND_PAGAMENTO} envolve as duas seções, então
  // a tag de fechamento sobrava impressa logo abaixo da cláusula quarta.
  textoFinal = textoFinal.replace(/\{\/COND_PAGAMENTO\}/g, "").replace(/\n{3,}/g, "\n\n");

  // {CLAUSULAS_POR_PRODUTO} → placeholder
  if (textoFinal.includes("{CLAUSULAS_POR_PRODUTO}")) {
    const clausulasTexto = itens
      .map((it) => {
        const nos = template.clausulas_por_produto?.[it.produto_id] ?? [];
        if (nos.length === 0) return null;
        return `[Cláusulas de ${it.nome}]`;
      })
      .filter(Boolean)
      .join("\n");
    textoFinal = textoFinal.replace(
      "{CLAUSULAS_POR_PRODUTO}",
      clausulasTexto || "(nenhum produto no carrinho tem cláusulas)"
    );
  }

  // {ASSINATURAS} → linha de assinatura simples
  textoFinal = textoFinal.replace(
    "{ASSINATURAS}",
    `_________________________\n${dadosCliente["{{nome_completo}}"] ?? "CONTRATANTE"}`
  );

  // Renderiza o texto final como parágrafos
  const paragrafos = textoFinal.split(/\n\n+/);

  return (
    <div style={estilos.papel}>
      {paragrafos.map((p, i) => {
        const trim = p.trim();
        if (!trim) return null;
        if (trim.startsWith("# "))  return <h1 key={i} style={estilos.h1}>{trim.slice(2)}</h1>;
        if (trim.startsWith("## ")) return <h2 key={i} style={estilos.h2}>{trim.slice(3)}</h2>;
        if (trim.startsWith("### ")) return <h3 key={i} style={estilos.h3}>{trim.slice(4)}</h3>;
        return (
          <p key={i} style={estilos.paragrafo}>
            {trim.split("\n").map((linha, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {linha}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PainelPreview({ template, produtosRef }: PainelPreviewProps) {
  const [modo, setModo] = useState<"avista" | "parcelado">("avista");

  // Δ 2026-09-08 — o default era 2× do primeiro produto + 3× do segundo, herdado de um
  // exemplo com vários itens. Quem tem um produto só abria o preview e via o dobro do
  // preço ("Limpa Nome 2 · R$ 1.194,00"), parecendo cobrança duplicada. Agora 1 de cada:
  // o dono precisa reconhecer o próprio preço de cara. A quantidade continua editável.
  const carrinhoDefault: CarrinhoItem[] = (template.produtos_aceitos ?? [])
    .slice(0, 3)
    .map((pa) => ({ produto_id: pa.produto_id, quantidade: 1 }));

  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>(carrinhoDefault);

  const calc = calcularCarrinho(template, carrinho, produtosRef);

  function atualizarItem(idx: number, parcial: Partial<CarrinhoItem>) {
    setCarrinho((prev) => prev.map((it, i) => (i === idx ? { ...it, ...parcial } : it)));
  }

  function removerItem(idx: number) {
    setCarrinho((prev) => prev.filter((_, i) => i !== idx));
  }

  function addItem() {
    const primeiro = template.produtos_aceitos[0];
    if (!primeiro) return;
    setCarrinho((prev) => [...prev, { produto_id: primeiro.produto_id, quantidade: 1 }]);
  }

  const temConflito = carrinho.some(
    (ci) => !template.produtos_aceitos.some((p) => p.produto_id === ci.produto_id)
  );

  return (
    <div style={estilos.container}>
      <h3 style={estilos.titulo}>Preview com carrinho de exemplo</h3>
      <p style={estilos.subtitulo}>
        Veja como o contrato fica preenchido. Edite o carrinho e alterne entre à vista e parcelado.
      </p>

      {/* Carrinho editável */}
      <div style={{ marginBottom: 10 }}>
        <div style={estilos.label}>Carrinho simulado</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {carrinho.map((ci, idx) => {
            const aceito = template.produtos_aceitos.some((p) => p.produto_id === ci.produto_id);
            return (
              <div
                key={idx}
                style={{
                  ...estilos.carrinhoRow,
                  background: aceito ? "oklch(0.20 0.02 275)" : "oklch(0.22 0.06 55 / 0.3)",
                  border: `1px solid ${aceito ? "oklch(1 0 0 / 0.08)" : "oklch(0.80 0.16 55 / 0.35)"}`,
                }}
              >
                <select
                  style={{ ...estilos.selectPequeno, flex: 1 }}
                  value={ci.produto_id}
                  aria-label="Produto do item"
                  onChange={(e) => atualizarItem(idx, { produto_id: e.target.value })}
                >
                  {produtosRef.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                <input
                  style={{ ...estilos.inputPequeno, width: 64 }}
                  type="number"
                  min={1}
                  value={ci.quantidade}
                  aria-label="Quantidade"
                  onChange={(e) =>
                    atualizarItem(idx, { quantidade: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
                <button
                  style={estilos.btnIcone}
                  onClick={() => removerItem(idx)}
                  title="Remover item"
                  aria-label="Remover item do carrinho"
                >
                  ✕
                </button>
              </div>
            );
          })}
          {template.produtos_aceitos.length > 0 && (
            <button style={estilos.btnGhost} onClick={addItem}>
              + Adicionar item
            </button>
          )}
        </div>
      </div>

      {/* Controles: modo + total */}
      <div style={estilos.controles}>
        <div style={estilos.segmentado} role="group" aria-label="Modo de pagamento">
          <button
            style={{ ...estilos.segBtn, ...(modo === "avista" ? estilos.segBtnAtivo : {}) }}
            onClick={() => setModo("avista")}
            aria-pressed={modo === "avista"}
          >
            À vista
          </button>
          <button
            style={{ ...estilos.segBtn, ...(modo === "parcelado" ? estilos.segBtnAtivo : {}) }}
            onClick={() => setModo("parcelado")}
            aria-pressed={modo === "parcelado"}
          >
            Parcelado
          </button>
        </div>
        <div style={estilos.totalLabel}>
          Total:{" "}
          <strong style={{ color: "oklch(0.97 0.005 270)" }}>
            {brl(modo === "avista" ? calc.totalAvista : calc.totalParcelado)}
          </strong>
        </div>
      </div>

      {/* Aviso de conflito */}
      {temConflito && (
        <div style={estilos.conflito}>
          ⚠ Há produtos no carrinho que este template não aceita.
        </div>
      )}

      {/* Documento preenchido */}
      <DocumentoPreenchido
        template={template}
        carrinho={carrinho}
        modo={modo}
        produtosRef={produtosRef}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = {
  container: { padding: "16px 14px" } as React.CSSProperties,
  titulo: { margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  subtitulo: { margin: "0 0 10px", fontSize: 11.5, color: "oklch(0.65 0.01 270)", lineHeight: 1.5 } as React.CSSProperties,
  label: { fontSize: 11, fontWeight: 600, color: "oklch(0.65 0.01 270)", marginBottom: 4 } as React.CSSProperties,
  carrinhoRow: {
    display: "grid", gridTemplateColumns: "1fr 64px auto", gap: 6, alignItems: "center",
    padding: 6, borderRadius: 8,
  } as React.CSSProperties,
  selectPequeno: {
    padding: "4px 8px", fontSize: 11.5,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 6, color: "oklch(0.97 0.005 270)", outline: "none", cursor: "pointer",
  } as React.CSSProperties,
  inputPequeno: {
    padding: "4px 8px", fontSize: 11.5,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 6, color: "oklch(0.97 0.005 270)", outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  btnIcone: {
    background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px",
    fontSize: 11, color: "oklch(0.55 0.01 270)", borderRadius: 4,
  } as React.CSSProperties,
  btnGhost: {
    background: "transparent", border: "1px dashed oklch(1 0 0 / 0.12)", cursor: "pointer",
    padding: "5px 10px", fontSize: 11.5, color: "oklch(0.60 0.01 270)", borderRadius: 7,
    width: "100%", textAlign: "left" as const,
  } as React.CSSProperties,
  controles: {
    display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
  } as React.CSSProperties,
  segmentado: {
    display: "flex", borderRadius: 8, overflow: "hidden",
    border: "1px solid oklch(1 0 0 / 0.10)", background: "oklch(0.16 0.02 275)",
  } as React.CSSProperties,
  segBtn: {
    padding: "5px 14px", fontSize: 11.5, fontWeight: 500, cursor: "pointer",
    background: "transparent", border: "none", color: "oklch(0.65 0.01 270)",
    transition: "background 120ms ease, color 120ms ease",
  } as React.CSSProperties,
  segBtnAtivo: {
    background: "oklch(0.72 0.18 295 / 0.18)", color: "oklch(0.90 0.08 295)",
  } as React.CSSProperties,
  totalLabel: { fontSize: 11.5, color: "oklch(0.65 0.01 270)" } as React.CSSProperties,
  conflito: {
    display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, padding: "8px 10px",
    background: "oklch(0.22 0.08 55 / 0.25)", color: "oklch(0.85 0.12 55)",
    border: "1px solid oklch(0.80 0.16 55 / 0.30)", borderRadius: 8, marginBottom: 10,
  } as React.CSSProperties,
  papel: {
    background: "oklch(0.97 0.005 90)", color: "oklch(0.15 0.01 270)",
    borderRadius: 10, padding: "20px 22px", fontSize: 12.5, lineHeight: 1.7,
    border: "1px solid oklch(0 0 0 / 0.08)", minHeight: 120,
    fontFamily: "Georgia, 'Times New Roman', serif",
  } as React.CSSProperties,
  h1: { fontSize: 17, fontWeight: 700, marginBottom: 12, marginTop: 0, textAlign: "center" as const } as React.CSSProperties,
  h2: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 6 } as React.CSSProperties,
  h3: { fontSize: 13, fontWeight: 600, marginTop: 12, marginBottom: 4 } as React.CSSProperties,
  paragrafo: { margin: "0 0 10px", fontSize: 12.5 } as React.CSSProperties,
};
