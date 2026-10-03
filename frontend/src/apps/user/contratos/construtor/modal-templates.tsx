/**
 * modal-templates.tsx — Modal de seleção/criação de templates.
 *
 * Abre pelo selector no topo do construtor (substitui sidebar).
 * Recebe lista de templates por prop (mock em memória — Supabase é 2e).
 * Três ações: selecionar existente, criar em branco, gerar com IA (Beta).
 *
 * Microcopy: "1 template ativo cobre todas as vendas."
 * Estilos em estilos-modal-templates.ts para manter ≤ 300 linhas.
 */

import React from "react";
import type { TemplateV2 } from "./tipos";
import { estilosModal as e } from "./estilos-modal-templates";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModalTemplatesProps {
  /** Lista de templates em memória (2e: virá do banco) */
  templates: TemplateV2[];
  /** ID do template atualmente em edição */
  templateAtivoId: string;
  onSelecionar: (id: string) => void;
  onCriarEmBranco: () => void;
  onGerarComIA: () => void;
  onExcluir: (id: string) => void;
  onFechar: () => void;
}

// ---------------------------------------------------------------------------
// ModalTemplates
// ---------------------------------------------------------------------------

export function ModalTemplates({
  templates,
  templateAtivoId,
  onSelecionar,
  onCriarEmBranco,
  onGerarComIA,
  onExcluir,
  onFechar,
}: ModalTemplatesProps): React.ReactElement {
  return (
    <div style={e.backdrop} onClick={onFechar}>
      <div style={e.janela} onClick={(ev) => ev.stopPropagation()}>
        <div style={e.cabecalho}>
          <div>
            <h2 style={e.titulo}>Templates de contrato</h2>
            <p style={e.subtitulo}>
              Cada template pode conter vários produtos.{" "}
              <strong>1 template ativo cobre todas as vendas.</strong>{" "}
              Crie um segundo só se precisar de um molde diferente (ex: B2B vs B2C).
            </p>
          </div>
          <button style={e.btnIcone} onClick={onFechar} aria-label="Fechar modal">✕</button>
        </div>

        <div style={e.corpo}>
          <div style={e.grade}>
            {templates.map((t) => (
              <CardTemplate
                key={t.id}
                template={t}
                emEdicao={t.id === templateAtivoId}
                onSelecionar={() => onSelecionar(t.id)}
                onExcluir={() => onExcluir(t.id)}
              />
            ))}

            {/* Card "Gerar com IA" — roxo, badge Beta */}
            <div
              role="button"
              tabIndex={0}
              onClick={onGerarComIA}
              onKeyDown={(ev) => ev.key === "Enter" && onGerarComIA()}
              style={e.cardIA}
              aria-label="Gerar template com IA"
            >
              <span style={e.badgeBeta}>Beta</span>
              <span style={{ fontSize: 26 }}>✦</span>
              <span style={e.cardIATitulo}>Gerar com IA</span>
              <span style={e.cardIADesc}>
                Anexe seu contrato atual. A IA preenche o que conseguir e marca o que falta pra você revisar.
              </span>
            </div>

            {/* Card "Novo template em branco" */}
            <div
              role="button"
              tabIndex={0}
              onClick={onCriarEmBranco}
              onKeyDown={(ev) => ev.key === "Enter" && onCriarEmBranco()}
              style={e.cardEmBranco}
              aria-label="Criar novo template em branco"
            >
              <span style={{ fontSize: 26, color: "oklch(0.55 0.01 270)" }}>+</span>
              <span style={e.cardEmBrancoTitulo}>Novo template em branco</span>
              <span style={e.cardEmBrancoDesc}>
                Você adiciona os produtos e escreve as cláusulas do zero.
              </span>
            </div>
          </div>
        </div>

        <div style={e.rodape}>
          <span style={e.notaRodape}>
            ✦ O agente escolhe automaticamente o template ativo que aceita os produtos do carrinho.
          </span>
          <button style={e.btn} onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardTemplate
// ---------------------------------------------------------------------------

/**
 * Linha do produto no card: "Remoção Judicial / Limpa Nome · R$ 697 · R$ 197 + 6x R$ 150".
 * Antes o card mostrava o UUID do produto, que não diz nada pra quem lê a lista.
 */
function resumoProdutoAceito(pa: TemplateV2["produtos_aceitos"][number]): string {
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
  const partes: string[] = [pa.nome ?? pa.produto_id];
  if (pa.preco_pendente || !(pa.preco_avista > 0)) {
    partes.push("sem preço");
    return partes.join(" · ");
  }
  partes.push(brl(pa.preco_avista));
  const parc = pa.parcelamento;
  if (parc && parc.max_parcelas > 1 && parc.valor_parcelado_total > 0) {
    const entrada = parc.entrada ?? 0;
    const valorParcela = Math.max(0, parc.valor_parcelado_total - entrada) / parc.max_parcelas;
    partes.push(`${entrada > 0 ? `${brl(entrada)} + ` : ""}${parc.max_parcelas}x ${brl(valorParcela)}`);
  }
  return partes.join(" · ");
}

interface CardTemplateProps {
  template: TemplateV2;
  emEdicao: boolean;
  onSelecionar: () => void;
  onExcluir: () => void;
}

function CardTemplate({
  template, emEdicao, onSelecionar, onExcluir,
}: CardTemplateProps): React.ReactElement {
  const qtdProdutos = template.produtos_aceitos.length;

  function handleExcluir(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirm("Excluir este template? Esta ação não pode ser desfeita.")) return;
    onExcluir();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelecionar}
      onKeyDown={(ev) => ev.key === "Enter" && onSelecionar()}
      style={{ ...e.card, ...(emEdicao ? e.cardAtivo : {}) }}
      aria-label={`Template: ${template.nome}${emEdicao ? " (em edição)" : ""}`}
    >
      <div style={e.cardCabecalho}>
        <span style={{ fontSize: 18, marginTop: 2, flexShrink: 0 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={e.cardNome}>{template.nome}</div>
          <div style={e.cardBadges}>
            <span style={template.ativo ? e.badgeAtivo : e.badgeRascunho}>
              {template.ativo ? "Ativo" : "Rascunho"}
            </span>
            <span style={e.badgeProdutos}>
              {qtdProdutos} produto{qtdProdutos !== 1 ? "s" : ""}
            </span>
            {emEdicao && <span style={e.badgeEmEdicao}>Em edição</span>}
          </div>
        </div>
      </div>

      {qtdProdutos > 0 && (
        <div style={e.cardProdutos}>
          {template.produtos_aceitos.slice(0, 3).map((pa) => (
            <div key={pa.produto_id}>{resumoProdutoAceito(pa)}</div>
          ))}
          {qtdProdutos > 3 && ` · +${qtdProdutos - 3}`}
        </div>
      )}

      <div style={e.cardRodape}>
        <span style={e.cardDica}>
          {emEdicao ? "Editando agora" : "Clique pra abrir"}
        </span>
        <button
          style={e.btnExcluir}
          onClick={handleExcluir}
          title="Excluir template"
          aria-label={`Excluir template ${template.nome}`}
        >
          🗑
        </button>
      </div>
    </div>
  );
}
