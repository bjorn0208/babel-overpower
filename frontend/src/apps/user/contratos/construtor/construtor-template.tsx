/**
 * construtor-template.tsx — Orquestrador 3 colunas do construtor de template v2.
 *
 * Layout: [selector + editor (col esquerda)] | [painel direito 6 abas]
 * Tijolo 2e: conectado ao banco via dados-template.ts.
 * Fetch no mount (quando ownerId presente) + save com debounce 1200ms.
 *
 * Spec §8. ≤ 300 linhas.
 */

import React, { useEffect, useRef, useState } from "react";

import { useListaTemplates } from "./use-lista-templates";
import { ModalTemplates } from "./modal-templates";
import { BarraTemplates } from "./barra-templates";
import { ModalGerarIA } from "./gerar-ia/modal-gerar-ia";

import { EditorContrato } from "./editor/editor-contrato";
import type { SecaoAtiva } from "./editor/secao-tabs";
import { PainelPreco } from "./painel-direito/painel-preco";
import { PainelCampos } from "./painel-direito/painel-campos";
import { PainelPagamento } from "./painel-direito/painel-pagamento";
import { PainelProvas } from "./painel-direito/painel-provas";
import { PainelPreview } from "./painel-direito/painel-preview";
import { PainelLead } from "./painel-direito/painel-lead";
import { Tabs } from "./painel-direito/tabs";
import type { TabId } from "./painel-direito/tabs";
import type { TemplateV2 } from "./tipos";
import { EVENTO_ABRIR_CONFIG } from "./tipos";
import type { ProdutoRef } from "./painel-direito/logica";
import {
  carregarTemplates,
  carregarProdutos,
  salvarTemplate,
  criarTemplate as criarTemplateNoBanco,
  excluirTemplate as excluirTemplateDoBanco,
} from "./dados-template";
import { docParaTexto, textoParaDoc } from "./editor/serializa";
import { estilosConstrutor as estilos } from "./estilos-construtor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConstrutorTemplateProps {
  /**
   * ID do tenant autenticado. Quando presente, busca templates e produtos
   * do banco e habilita save automático com debounce.
   * Quando ausente, opera em memória (útil em testes).
   */
  ownerId?: string | null;
  /** Template inicial (opcional — sobrepõe o primeiro do banco). */
  templateInicial?: TemplateV2;
  /**
   * Lista de produtos do tenant. Quando não fornecida e ownerId presente,
   * busca do banco automaticamente.
   */
  produtosDisponiveis?: ProdutoRef[];
  /** Chamado quando o estado do template muda (além do save automático). */
  onMudar?: (template: TemplateV2) => void;
}

// ---------------------------------------------------------------------------
// ConstrutorTemplate
// ---------------------------------------------------------------------------

export function ConstrutorTemplate({
  ownerId,
  templateInicial: tplInicial,
  produtosDisponiveis: produtosExternos,
  onMudar,
}: ConstrutorTemplateProps): React.ReactElement {
  const {
    templates,
    templateAtivo: template,
    templateId,
    patchTemplate,
    selecionarTemplate,
    criarEmBranco,
    excluirTemplate,
    carregarDoBanco,
  } = useListaTemplates({ templateInicial: tplInicial, onMudar });

  const [produtosBanco, setProdutosBanco] = useState<ProdutoRef[]>([]);
  const [carregando, setCarregando] = useState(false);
  const produtosDisponiveis = produtosExternos ?? produtosBanco;

  const salvarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Carregamento inicial ─────────────────────────────────────────────────
  useEffect(() => {
    if (!ownerId) return;
    setCarregando(true);
    void Promise.all([
      carregarTemplates(ownerId),
      carregarProdutos(ownerId),
    ]).then(([tpls, prods]) => {
      setProdutosBanco(prods);
      if (tpls.length > 0 && !tplInicial) {
        carregarDoBanco(tpls);
      }
      setCarregando(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const [secaoAtiva, setSecaoAtiva] = useState<SecaoAtiva>({ tipo: "comum" });
  const [tabDireita, setTabDireita] = useState<TabId>("preco");
  const [abrirModalTemplates, setAbrirModalTemplates] = useState(false);
  const [abrirModalIA, setAbrirModalIA] = useState(false);

  // Se seção ativa for produto removido → volta ao comum
  useEffect(() => {
    if (secaoAtiva.tipo === "produto") {
      const existe = template?.produtos_aceitos.some(
        (p) => p.produto_id === secaoAtiva.produto_id
      );
      if (!existe) setSecaoAtiva({ tipo: "comum" });
    }
  }, [template?.produtos_aceitos, secaoAtiva]);

  // Cleanup debounce no unmount
  useEffect(() => {
    return () => { if (salvarTimeoutRef.current) clearTimeout(salvarTimeoutRef.current); };
  }, []);

  // Clique num token dentro do contrato abre a aba que configura aquele valor.
  // Pedido do Theus (2026-09-08): "editar dentro do contrato e já ir às configurações".
  // O evento vem das pílulas (NodeView do TipTap não recebe callback do pai).
  useEffect(() => {
    function aoAbrirConfig(e: Event) {
      const aba = (e as CustomEvent<{ aba?: TabId }>).detail?.aba;
      if (aba) setTabDireita(aba);
    }
    window.addEventListener(EVENTO_ABRIR_CONFIG, aoAbrirConfig);
    return () => window.removeEventListener(EVENTO_ABRIR_CONFIG, aoAbrirConfig);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────

  function agendarSave(tpl: TemplateV2) {
    if (!ownerId) return;
    if (salvarTimeoutRef.current) clearTimeout(salvarTimeoutRef.current);
    salvarTimeoutRef.current = setTimeout(() => { void salvarTemplate(tpl); }, 1200);
  }

  function editarClausulas(produto_id: string) {
    setSecaoAtiva({ tipo: "produto", produto_id });
  }

  function handleEditorChange(texto: string) {
    const novoDoc = textoParaDoc(texto);
    if (secaoAtiva.tipo === "comum") {
      const tplAtualizado = { ...template, conteudo_comum: novoDoc };
      patchTemplate({ conteudo_comum: novoDoc });
      agendarSave(tplAtualizado);
    } else {
      const clausulasAtualizadas = {
        ...(template.clausulas_por_produto ?? {}),
        [secaoAtiva.produto_id]: novoDoc.content,
      };
      const tplAtualizado = { ...template, clausulas_por_produto: clausulasAtualizadas };
      patchTemplate({ clausulas_por_produto: clausulasAtualizadas });
      agendarSave(tplAtualizado);
    }
  }

  function handlePatchComSave(parcial: Partial<TemplateV2>) {
    patchTemplate(parcial);
    agendarSave({ ...template, ...parcial });
  }

  function resolverNomeProduto(produto_id: string): string {
    return produtosDisponiveis.find((p) => p.id === produto_id)?.nome ?? produto_id;
  }

  async function handleCriarEmBranco() {
    if (ownerId) {
      const tplBanco = await criarTemplateNoBanco(ownerId);
      if (tplBanco) {
        selecionarTemplate(tplBanco.id);
        setSecaoAtiva({ tipo: "comum" });
        setTabDireita("preco");
        setAbrirModalTemplates(false);
        return;
      }
    }
    criarEmBranco();
    setSecaoAtiva({ tipo: "comum" });
    setTabDireita("preco");
    setAbrirModalTemplates(false);
  }

  /** F3c: pós-aprovação do modal IA — recarrega do banco e abre o molde atualizado. */
  async function handleAplicadoIA(templateId: string | null) {
    setAbrirModalIA(false);
    if (ownerId) {
      const tpls = await carregarTemplates(ownerId);
      if (tpls.length > 0) carregarDoBanco(tpls);
    }
    if (templateId) selecionarTemplate(templateId);
    setSecaoAtiva({ tipo: "comum" });
    setTabDireita("preview");
  }

  async function handleExcluir(id: string) {
    if (ownerId) await excluirTemplateDoBanco(id);
    excluirTemplate(id);
  }

  const produtosDisponivelParaAdicionar = produtosDisponiveis.filter(
    (p) => !template.produtos_aceitos.some((pa) => pa.produto_id === p.id)
  );

  const textoEditorAtual =
    secaoAtiva.tipo === "comum"
      ? template.conteudo_comum ? docParaTexto(template.conteudo_comum) : ""
      : (() => {
          const nos = template.clausulas_por_produto?.[secaoAtiva.produto_id] ?? [];
          return nos.length === 0 ? "" : docParaTexto({ type: "doc", content: nos });
        })();

  if (carregando) {
    return (
      <div style={{ ...estilos.wrapper, alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "oklch(0.65 0.01 270)", fontSize: 13 }}>Carregando templates…</span>
      </div>
    );
  }

  return (
    <div style={estilos.wrapper}>
      {/* ── Coluna esquerda: editor ──────────────────────────────────────── */}
      <div style={estilos.colunaEditor}>
        <div style={estilos.barraSelector}>
          <button
            style={estilos.btnSelector}
            onClick={() => setAbrirModalTemplates(true)}
            title="Trocar de template ou criar novo"
          >
            <span style={{ color: "oklch(0.72 0.22 295)", fontSize: 13 }}>📄</span>
            <span style={estilos.btnSelectorNome}>{template?.nome ?? "Novo template"}</span>
            {template?.ativo && <span style={estilos.badgeSelectorAtivo}>Ativo</span>}
            <span style={estilos.btnSelectorCount}>
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
          </button>
        </div>
        <BarraTemplates
          templates={templates}
          templateAtivoId={templateId}
          onSelecionar={(id) => { selecionarTemplate(id); setSecaoAtiva({ tipo: "comum" }); }}
          onNovo={() => { void handleCriarEmBranco(); }}
        />

        <EditorContrato
          valor={textoEditorAtual}
          onChange={handleEditorChange}
          produtosAceitos={template.produtos_aceitos}
          resolverNomeProduto={resolverNomeProduto}
          onAdicionarProduto={() => setTabDireita("preco")}
          secaoAtiva={secaoAtiva}
          onTrocarSecao={setSecaoAtiva}
          mapClausulas={Object.fromEntries(
            template.produtos_aceitos.map((pa) => [
              pa.produto_id,
              !!(template.clausulas_por_produto?.[pa.produto_id]?.length),
            ])
          )}
        />
      </div>

      {/* ── Coluna direita: painel ───────────────────────────────────────── */}
      <div style={estilos.colunaDireita}>
        <Tabs ativa={tabDireita} onChange={setTabDireita} />
        <div style={estilos.corpoDireito}>
          {tabDireita === "preco"     && <PainelPreco     template={template} onPatch={handlePatchComSave} onEditarClausulas={editarClausulas} produtosDisponiveis={produtosDisponivelParaAdicionar} />}
          {tabDireita === "campos"    && <PainelCampos    template={template} onPatch={handlePatchComSave} />}
          {tabDireita === "pagamento" && <PainelPagamento template={template} onPatch={handlePatchComSave} />}
          {tabDireita === "provas"    && <PainelProvas    template={template} onPatch={handlePatchComSave} />}
          {tabDireita === "preview"   && <PainelPreview   template={template} produtosRef={produtosDisponiveis} />}
          {tabDireita === "lead"      && <PainelLead      template={template} produtosRef={produtosDisponiveis} />}
        </div>
      </div>

      {/* ── Modais ──────────────────────────────────────────────────────── */}
      {abrirModalTemplates && (
        <ModalTemplates
          templates={templates}
          templateAtivoId={templateId}
          onSelecionar={(id) => { selecionarTemplate(id); setSecaoAtiva({ tipo: "comum" }); setAbrirModalTemplates(false); }}
          onCriarEmBranco={() => { void handleCriarEmBranco(); }}
          onGerarComIA={() => { setAbrirModalTemplates(false); setAbrirModalIA(true); }}
          onExcluir={(id) => { void handleExcluir(id); }}
          onFechar={() => setAbrirModalTemplates(false)}
        />
      )}

      {abrirModalIA && (
        <ModalGerarIA
          ownerId={ownerId ?? null}
          produtos={produtosDisponiveis}
          onAplicado={(tplId) => { void handleAplicadoIA(tplId); }}
          onFechar={() => setAbrirModalIA(false)}
        />
      )}
    </div>
  );
}
