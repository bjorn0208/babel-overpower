// @ts-nocheck
// Aba 12 — Chamadas LLM (C1)
// Onda C1 ATIVADA — tabela config_chamadas_llm real (migration 2026-05-27).
// Hook useConfigChamadasLlm puxa do banco + UPDATE persiste + trigger incrementa versão.
// Onda 5 — modelos puxados do banco via useModelosLlm (não mais hardcoded).

import { useEffect, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useConfigChamadasLlm } from "../dados/use-config-chamadas-llm";
import { useModelosLlm } from "../dados/use-modelos-llm";
import {
  PainelEdicaoChamada,
  type ConfigChamada,
} from "../componentes/painel-edicao-chamada";

const GAVETAS_DISPONIVEIS = [
  "blocos_conhecimento",
  "blocos_comportamento",
  "blocos_humanizacao",
  "blocos_meta",
  "blocos_gatilho",
  "blocos_variacao",
  "blocos_procedurais",
  "regras_operacionais_blocos",
];

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaChamadasLlm() {
  const { status, chamadas, erro, refetch, salvar: salvarConfig } = useConfigChamadasLlm();
  const { modelos: modelosLlm } = useModelosLlm();
  const [sel, setSel] = useState<ConfigChamada | null>(null);
  const [editando, setEditando] = useState<ConfigChamada | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Auto-seleciona primeira chamada quando carrega
  useEffect(() => {
    if (chamadas.length > 0 && !sel) {
      setSel(chamadas[0]);
      setEditando({ ...chamadas[0] });
    }
  }, [chamadas, sel]);

  function selecionar(c: ConfigChamada) {
    setSel(c);
    setEditando({ ...c });
  }

  async function salvar() {
    if (!editando) return;
    setSalvando(true);
    try {
      await salvarConfig(editando.chave, {
        nome: editando.nome,
        descricao: editando.descricao,
        modelo: editando.modelo,
        temperatura: editando.temperatura,
        max_tokens: editando.max_tokens,
        prompt_template: editando.prompt_template,
        itens_produzidos: editando.itens_produzidos,
      });
      const atualizada = chamadas.find((c) => c.chave === editando.chave);
      if (atualizada) {
        setSel(atualizada);
        setEditando({ ...atualizada });
      }
    } catch (e: any) {
      console.error("[AbaChamadasLlm] erro salvar:", e?.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Chamadas LLM</div>
          <div className="small muted mt-0.5">
            Configura modelo, temperatura e prompt por chamada do motor RAG.
          </div>
        </div>
      </div>

      {/* estado: carregando / erro */}
      {status === "carregando" && (
        <div className="mx-5 mt-3 small muted" style={{ opacity: 0.7 }}>
          carregando configurações…
        </div>
      )}
      {status === "erro" && (
        <div
          className="mx-5 mt-3 rounded-lg px-4 py-2.5 small row gap-2 shrink-0"
          style={{
            background: "oklch(0.65 0.24 25 / 0.10)",
            border: "1px solid oklch(0.65 0.24 25 / 0.25)",
          }}
        >
          <Icon name="alert" size={13} style={{ color: "oklch(0.65 0.24 25)", flexShrink: 0 }} />
          <span style={{ color: "oklch(0.82 0.20 25)", flex: 1 }}>erro: {erro}</span>
          <button className="btn btn-ghost btn-sm" onClick={refetch}>tentar de novo</button>
        </div>
      )}

      {/* corpo */}
      <div className="flex flex-1 overflow-hidden min-h-0 mt-3">
        {/* sidebar de chamadas */}
        <div className="w-56 border-r border-borda flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-borda shrink-0">
            <span className="tiny uppercase text-txt3 tracking-wide">Chamadas do motor</span>
          </div>
          <div className="overflow-auto flex-1">
            {chamadas.map((c) => (
              <button
                key={c.chave}
                className="w-full text-left px-3 py-2.5 transition-colors border-b"
                style={{
                  borderColor: "var(--os-borda)",
                  background: sel?.chave === c.chave ? "var(--os-acento-1-soft)" : undefined,
                }}
                onClick={() => selecionar(c)}
              >
                <div className="row gap-2">
                  <span
                    className="small font-medium"
                    style={sel?.chave === c.chave ? { color: "var(--os-acento-1)" } : undefined}
                  >
                    {c.nome}
                  </span>
                  <span className="badge tiny mono ml-auto">v{c.versao}</span>
                </div>
                <div className="tiny muted mono truncate mt-0.5">{c.modelo}</div>
              </button>
            ))}
          </div>
        </div>

        {/* painel de edição */}
        {sel && editando && (
          <PainelEdicaoChamada
            sel={sel}
            editando={editando}
            salvando={salvando}
            onSalvar={salvar}
            onChange={setEditando}
            modelosDisponiveis={modelosLlm}
            gavetasDisponiveis={GAVETAS_DISPONIVEIS}
          />
        )}
      </div>
    </div>
  );
}
