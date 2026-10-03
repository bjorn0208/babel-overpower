// @ts-nocheck
/**
 * SeletorLlm — combobox flutuante dos modelos LLM ativos.
 *
 * Visual alinhado ao LLM-OS: .os-card, .input, .btn*, .badge*, .muted, .mono etc
 * Lógica e hooks 100% preservados da Onda 2A.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { agruparModelosPorProvedor, useModelosLlm } from "./dados/use-modelos-llm";

interface SeletorLlmProps {
  valor: string;
  onChange: (slug: string) => void;
}

const LABEL_PROVEDOR: Record<string, string> = {
  google: "Google",
  anthropic: "Anthropic",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  "x-ai": "xAI",
  "meta-llama": "Meta",
  qwen: "Qwen",
  mistralai: "Mistral",
};

export function SeletorLlm({ valor, onChange }: SeletorLlmProps) {
  const estado = useModelosLlm();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (aberto) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto]);

  const modelos = estado.status === "ok" ? estado.modelos : [];

  const filtrados = useMemo(() => {
    if (!q) return modelos;
    const ql = q.toLowerCase();
    return modelos.filter(
      (m) => m.slug.toLowerCase().includes(ql) || m.nome.toLowerCase().includes(ql),
    );
  }, [modelos, q]);

  const grupos = useMemo(() => agruparModelosPorProvedor(filtrados), [filtrados]);
  const modeloAtual = modelos.find((m) => m.slug === valor);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        className="btn btn-ghost"
        style={{
          width: "100%",
          justifyContent: "flex-start",
          gap: 8,
          height: 30,
          padding: "0 8px",
          fontSize: 11,
          background: "rgba(255,255,255,0.04)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
        onClick={() => setAberto((a) => !a)}
        aria-label="selecionar modelo LLM"
      >
        <Icon name="cpu" size={12} />
        <span
          className="mono"
          style={{
            flex: 1,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 11,
          }}
        >
          {modeloAtual ? modeloAtual.slug : "selecione modelo"}
        </span>
        <Icon name="chevronDown" size={10} />
      </button>

      {/* Dropdown */}
      {aberto && (
        <div
          className="os-card"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 200,
            maxHeight: 380,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Campo de busca */}
          <div
            style={{
              padding: "8px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="row gap-2">
              <Icon name="search" size={12} />
              <input
                ref={inputRef}
                className="input"
                style={{ flex: 1, height: 26, border: "none", background: "transparent", fontSize: 11 }}
                placeholder="filtrar modelo..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
            {estado.status === "carregando" && (
              <div className="muted tiny" style={{ padding: "12px 0", textAlign: "center" }}>
                carregando…
              </div>
            )}
            {estado.status === "erro" && (
              <div
                style={{
                  padding: "8px 10px",
                  fontSize: 11,
                  color: "oklch(0.82 0.20 25)",
                }}
              >
                erro: {estado.mensagem}
              </div>
            )}
            {estado.status === "ok" && filtrados.length === 0 && (
              <div className="muted tiny" style={{ padding: "12px 0", textAlign: "center" }}>
                nenhum resultado
              </div>
            )}

            {Object.entries(grupos).map(([provedor, ms]) => (
              <div key={provedor} style={{ marginBottom: 8 }}>
                {/* Label do provedor */}
                <div
                  className="title-section"
                  style={{ padding: "6px 8px 4px" }}
                >
                  {LABEL_PROVEDOR[provedor] ?? provedor}
                </div>

                {ms.map((m) => {
                  const ativo = m.slug === valor;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        width: "100%",
                        justifyContent: "flex-start",
                        height: "auto",
                        padding: "6px 8px",
                        borderRadius: 6,
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        background: ativo ? "rgba(255,255,255,0.07)" : undefined,
                        borderColor: ativo ? "rgba(255,255,255,0.14)" : "transparent",
                      }}
                      onClick={() => {
                        onChange(m.slug);
                        setAberto(false);
                        setQ("");
                      }}
                    >
                      <div className="row gap-2" style={{ width: "100%" }}>
                        <span
                          className="mono"
                          style={{
                            flex: 1,
                            fontSize: 11,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: ativo ? "var(--os-acento-1)" : "var(--txt-1)",
                          }}
                        >
                          {m.slug}
                        </span>
                        <span className="muted tiny mono" style={{ flexShrink: 0 }}>
                          ${m.custo_input_1m.toFixed(2)}/${m.custo_output_1m.toFixed(2)}
                        </span>
                      </div>
                      <div className="muted tiny mono">
                        {m.nome} · ctx {(m.context_window / 1000).toFixed(0)}k
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
