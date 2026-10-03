/**
 * Aba Gerador — cria contrato livre via RPC `criar_contrato_livre`.
 * Extraído 1:1 do monolito — sem mudança de comportamento.
 */

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { urlContrato } from "@/lib/url-app";
import { PainelRecursos } from "./painel-recursos";
import {
  Campo,
  inputStyle,
  ProdutoResumo,
  RecursosEditaveis,
  SupabaseBruto,
  TemplateContrato,
  ToastApi,
} from "./re-exports";

const RECURSOS_VAZIOS: RecursosEditaveis = {
  campos_obrigatorios: [],
  instrucao_selfie: null,
  num_testemunhas: 0,
  chave_pix: null,
  link_parcelamento: null,
  posicao_pagamento: null,
};

type AbaGeradorProps = {
  ownerId: string | null;
  templates: TemplateContrato[];
  produtos: ProdutoResumo[];
  t: ToastApi;
  onCriado: () => void;
};

export function AbaGerador({ ownerId, templates, produtos, t, onCriado }: AbaGeradorProps) {
  const [titulo, setTitulo] = useState("Contrato de Prestacao de Servico");
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [recursos, setRecursos] = useState<RecursosEditaveis>(RECURSOS_VAZIOS);
  const [templateAplicado, setTemplateAplicado] = useState<TemplateContrato | null>(null);
  const ativos = templates.filter((tt) => tt.ativo);
  const bloqueado = templateAplicado !== null;

  function aplicarTemplate(tpl: TemplateContrato) {
    setTemplateAplicado(tpl);
    setTitulo(tpl.nome);
    setTexto(tpl.conteudo);
    setRecursos({
      campos_obrigatorios: tpl.campos_obrigatorios,
      instrucao_selfie: tpl.instrucao_selfie,
      num_testemunhas: tpl.num_testemunhas,
      chave_pix: tpl.chave_pix,
      link_parcelamento: tpl.link_parcelamento,
      posicao_pagamento: tpl.posicao_pagamento,
    });
    t.success(`Template "${tpl.nome}" aplicado — formulário bloqueado, clique "Gerar link"`);
  }

  function removerTemplate() {
    setTemplateAplicado(null);
    setTitulo("Contrato de Prestacao de Servico");
    setTexto("");
    setRecursos(RECURSOS_VAZIOS);
  }

  async function gerarLivre() {
    if (!ownerId) return;
    setGerando(true);
    const sb = supabase as SupabaseBruto;

    const resposta = templateAplicado
      ? await sb.rpc("criar_contrato_livre_de_template", {
          p_template_id: templateAplicado.id,
        })
      : await sb.rpc("criar_contrato_livre", {
          p_texto: texto,
          p_titulo: titulo || "Contrato",
          p_origem: "manual",
          p_campos_obrigatorios: recursos.campos_obrigatorios,
          p_instrucao_selfie: recursos.instrucao_selfie,
          p_num_testemunhas: recursos.num_testemunhas,
          p_chave_pix: recursos.chave_pix,
          p_link_parcelamento: recursos.link_parcelamento,
          p_posicao_pagamento: recursos.posicao_pagamento,
        });

    setGerando(false);
    const { data, error } = resposta;
    if (error || !data?.[0]) { t.error(`Erro: ${error?.message || "desconhecido"}`); return; }
    const chave = data[0].chave_publica;
    const link = urlContrato(chave);
    try {
      await navigator.clipboard.writeText(link);
      t.success("Link copiado pra area de transferencia");
    } catch {
      t.success("Contrato criado");
    }
    removerTemplate();
    onCriado();
  }

  const podeGerar = !gerando && (bloqueado || texto.trim().length > 0);

  return (
    <div
      className="os-vidro"
      style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
        Gerar contrato livre
      </h2>

      {bloqueado && templateAplicado && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.12))",
            border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.9)", display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} style={{ color: "oklch(0.7 0.18 220)" }} />
            Usando template: <strong>{templateAplicado.nome}</strong>
            <span style={{ opacity: 0.6, fontSize: 11 }}>· página pública abre idêntica à do agente</span>
          </span>
          <button
            type="button"
            onClick={removerTemplate}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              background: "transparent",
              color: "oklch(0.98 0 0 / 0.75)",
              border: "1px solid oklch(0.98 0 0 / 0.2)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Remover template
          </button>
        </div>
      )}

      {!bloqueado && ativos.length > 0 && (
        <div style={{ padding: 12, background: "oklch(0.7 0.18 220 / 0.08)", border: "1px solid oklch(0.7 0.18 220 / 0.25)", borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginBottom: 6 }}>
            {ativos.length} template(s) — clique pra usar como base
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ativos.map((tt) => (
              <button
                key={tt.id}
                type="button"
                onClick={() => aplicarTemplate(tt)}
                title={`Aplica "${tt.nome}" — bloqueia o formulário e usa a RPC do agente`}
                style={{
                  padding: "4px 10px",
                  fontSize: 10,
                  background: "oklch(0.98 0 0 / 0.06)",
                  color: "oklch(0.98 0 0 / 0.75)",
                  border: "1px solid oklch(0.98 0 0 / 0.1)",
                  borderRadius: 999,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "oklch(0.7 0.18 220 / 0.18)";
                  e.currentTarget.style.borderColor = "oklch(0.7 0.18 220 / 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "oklch(0.98 0 0 / 0.06)";
                  e.currentTarget.style.borderColor = "oklch(0.98 0 0 / 0.1)";
                }}
              >
                {tt.nome}
                {tt.produto_id && (
                  <span style={{ opacity: 0.6 }}> · {produtos.find((p) => p.id === tt.produto_id)?.nome}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <Campo label="Titulo">
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          disabled={bloqueado}
          style={{
            ...inputStyle,
            opacity: bloqueado ? 0.55 : 1,
            cursor: bloqueado ? "not-allowed" : "text",
          }}
        />
      </Campo>

      <Campo label="Texto do contrato (cole aqui)">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={bloqueado}
          rows={14}
          placeholder="Cole o texto completo do contrato. Para criar um modelo reutilizavel com placeholders, use a aba Templates."
          style={{
            ...inputStyle,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            resize: "vertical",
            opacity: bloqueado ? 0.55 : 1,
            cursor: bloqueado ? "not-allowed" : "text",
          }}
        />
      </Campo>

      {/* Mesmas provas/pagamento do montador de template — dirigem os passos
          da página pública. ocultarNotaValores: o gerador livre não tem os
          painéis {SE_A_VISTA}/{SE_PARCELADO} do editor.
          Quando template aplicado, bloqueia interação via pointer-events. */}
      <div
        style={{
          opacity: bloqueado ? 0.55 : 1,
          pointerEvents: bloqueado ? "none" : "auto",
          transition: "opacity 0.15s",
        }}
        aria-disabled={bloqueado}
      >
        <PainelRecursos ed={recursos} aoMudar={setRecursos} ocultarNotaValores />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)", display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={12} /> {bloqueado
            ? "Página pública vai abrir com branding + formulário do agente."
            : "Wizard 4 steps + preview PDF ao vivo chegam na Onda 1-b."}
        </span>
        <button
          type="button"
          disabled={!podeGerar}
          onClick={gerarLivre}
          style={{
            padding: "8px 18px",
            fontSize: 12,
            fontWeight: 600,
            background: gerando
              ? "oklch(0.18 0.06 280)"
              : "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
            color: "oklch(0.98 0 0)",
            border: "none",
            borderRadius: 10,
            cursor: gerando ? "wait" : podeGerar ? "pointer" : "not-allowed",
            opacity: !podeGerar ? 0.6 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {gerando && <Loader2 size={13} className="animate-spin" />}
          Gerar link de assinatura
        </button>
      </div>
    </div>
  );
}
