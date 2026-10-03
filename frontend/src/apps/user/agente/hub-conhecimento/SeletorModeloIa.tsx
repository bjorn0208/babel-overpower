/**
 * Seletor sutil da IA grátis usada pelo botão "Melhorar com IA".
 * Lista os modelos `:free` disponíveis agora na API pública do OpenRouter
 * (sem chave) e deixa o tenant escolher. "Automático" = cascata padrão.
 * A escolha persiste em localStorage e vira o primeiro modelo da fila na edge.
 */

import { useEffect, useState } from "react";

export type ModeloGratis = { slug: string; rotulo: string };

const CHAVE_ARMAZENAMENTO = "melhorar-prompt-modelo";

/** Reserva local caso a API pública esteja fora — espelho da cascata da edge. */
const RESERVA: ModeloGratis[] = [
  { slug: "meta-llama/llama-3.3-70b-instruct:free", rotulo: "Llama 3.3 70B" },
  { slug: "openai/gpt-oss-120b:free", rotulo: "GPT-OSS 120B" },
  { slug: "qwen/qwen3-next-80b-a3b-instruct:free", rotulo: "Qwen3 Next 80B" },
  { slug: "google/gemma-4-31b-it:free", rotulo: "Gemma 4 31B" },
  { slug: "nousresearch/hermes-3-llama-3.1-405b:free", rotulo: "Hermes 3 405B" },
];

export function modeloEscolhido(): string | null {
  return localStorage.getItem(CHAVE_ARMAZENAMENTO);
}

export function SeletorModeloIa() {
  const [modelos, setModelos] = useState<ModeloGratis[]>(RESERVA);
  const [escolhido, setEscolhido] = useState<string>(() => modeloEscolhido() ?? "");

  useEffect(() => {
    let ativo = true;
    fetch("https://openrouter.ai/api/v1/models")
      .then((r) => r.json())
      .then((corpo: { data?: Array<{ id: string; name?: string; context_length?: number }> }) => {
        if (!ativo || !corpo?.data) return;
        const livres = corpo.data
          .filter((m) => m.id.endsWith(":free"))
          .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
          .map((m) => ({ slug: m.id, rotulo: (m.name ?? m.id).replace(/\s*\(free\)\s*$/i, "") }));
        if (livres.length > 0) setModelos(livres);
      })
      .catch(() => {
        /* fica na reserva local */
      });
    return () => {
      ativo = false;
    };
  }, []);

  function escolher(slug: string) {
    setEscolhido(slug);
    if (slug === "") localStorage.removeItem(CHAVE_ARMAZENAMENTO);
    else localStorage.setItem(CHAVE_ARMAZENAMENTO, slug);
  }

  return (
    <select
      value={escolhido}
      onChange={(e) => escolher(e.target.value)}
      title="Qual IA grátis o botão usa — se ela saturar, as outras entram de reserva"
      style={{
        maxWidth: 190,
        padding: "3px 6px",
        fontSize: 10,
        fontStyle: "italic",
        color: "oklch(0.98 0 0 / 0.5)",
        background: "transparent",
        border: "1px solid oklch(0.98 0 0 / 0.1)",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <option value="" style={{ background: "#1a1530" }}>
        IA automática · grátis
      </option>
      {modelos.map((m) => (
        <option key={m.slug} value={m.slug} style={{ background: "#1a1530" }}>
          {m.rotulo} · grátis
        </option>
      ))}
    </select>
  );
}
