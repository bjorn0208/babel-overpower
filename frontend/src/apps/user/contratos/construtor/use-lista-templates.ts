/**
 * use-lista-templates.ts — Hook de gestão da lista de templates em memória.
 *
 * Extrai estado + handlers de construtor-template.tsx para manter o orquestrador ≤ 300 linhas.
 * 2e: substituir por fetch/persist Supabase aqui, sem tocar o orquestrador.
 */

import { useCallback, useEffect, useState } from "react";
import type { TemplateV2 } from "./tipos";
import { ORDEM_JORNADA_PADRAO } from "./painel-direito/logica";

// ---------------------------------------------------------------------------
// Template em branco (factory)
// ---------------------------------------------------------------------------

export function novoTemplateEmBranco(): TemplateV2 {
  return {
    id: `tpl-${Date.now()}`,
    user_id: "",
    nome: "Novo template",
    ativo: false,
    conteudo_comum: null,
    clausulas_por_produto: {},
    campos_cliente: [
      { slug: "nome_completo", rotulo: "Nome completo", tipo: "texto",    obrigatorio: true,  icone: "user"  },
      { slug: "cpf",           rotulo: "CPF",           tipo: "cpf",      obrigatorio: true,  icone: "id"    },
      { slug: "email",         rotulo: "E-mail",        tipo: "email",    obrigatorio: false, icone: "mail"  },
      { slug: "telefone",      rotulo: "Telefone",      tipo: "telefone", obrigatorio: false, icone: "phone" },
    ],
    produtos_aceitos: [],
    pagamento: {
      modo: "unico",
      chave_pix: null,
      link_parcelamento: null,
      posicao_pagamento: "after_sign",
    },
    provas: {
      selfie: true,
      documento: true,
      assinatura_manuscrita: true,
      testemunha: false,
      num_testemunhas: 0,
      instrucao_selfie: "",
    },
    jornada_ordem: [...ORDEM_JORNADA_PADRAO],
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseListaTemplatesOpts {
  templateInicial?: TemplateV2;
  onMudar?: (template: TemplateV2) => void;
}

export function useListaTemplates({ templateInicial, onMudar }: UseListaTemplatesOpts) {
  const [templates, setTemplates] = useState<TemplateV2[]>(
    () => [templateInicial ?? novoTemplateEmBranco()]
  );
  const [templateId, setTemplateId] = useState<string>(
    () => (templateInicial ?? novoTemplateEmBranco()).id
  );

  const templateAtivo = templates.find((t) => t.id === templateId) ?? templates[0];

  // Sincroniza quando pai injeta templateInicial atualizado (2e)
  useEffect(() => {
    if (!templateInicial) return;
    setTemplates((prev) => {
      const existe = prev.some((t) => t.id === templateInicial.id);
      return existe
        ? prev.map((t) => (t.id === templateInicial.id ? templateInicial : t))
        : [templateInicial, ...prev];
    });
    setTemplateId(templateInicial.id);
  }, [templateInicial]);

  // Atualiza template ativo e propaga ao pai
  const patchTemplate = useCallback(
    (parcial: Partial<TemplateV2>) => {
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id !== templateId) return t;
          const novo = { ...t, ...parcial };
          onMudar?.(novo);
          return novo;
        })
      );
    },
    [templateId, onMudar]
  );

  // Seleciona template existente
  function selecionarTemplate(id: string) {
    setTemplateId(id);
  }

  // Cria template em branco e o seleciona
  function criarEmBranco(): TemplateV2 {
    const novo = novoTemplateEmBranco();
    setTemplates((prev) => [...prev, novo]);
    setTemplateId(novo.id);
    return novo;
  }

  // Carrega array de templates do banco e seleciona o primeiro
  function carregarDoBanco(tpls: TemplateV2[]) {
    if (tpls.length === 0) return;
    setTemplates(tpls);
    setTemplateId(tpls[0].id);
  }

  // Exclui template; seleciona o primeiro restante
  function excluirTemplate(id: string) {
    setTemplates((prev) => {
      const novos = prev.filter((t) => t.id !== id);
      if (novos.length === 0) {
        const vazio = novoTemplateEmBranco();
        setTemplateId(vazio.id);
        return [vazio];
      }
      if (templateId === id) setTemplateId(novos[0].id);
      return novos;
    });
  }

  return {
    templates,
    templateId,
    templateAtivo,
    patchTemplate,
    selecionarTemplate,
    criarEmBranco,
    excluirTemplate,
    carregarDoBanco,
  };
}
