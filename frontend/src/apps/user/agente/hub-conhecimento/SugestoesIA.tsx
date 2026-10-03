/**
 * Caixa "Sugestões da análise de conversas" — só os blocos que vieram do botão
 * "Analisar conversas" (`tag='analise_conversas_ia'`), separados do resto da
 * gaveta Conhecimento. Nascem pendentes (`ativo=false`, invisíveis pro motor);
 * o tenant Aprova (libera pro agente usar), Melhora (reescreve com IA, mesmo
 * fluxo do form de bloco) ou Exclui.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Trash2, Sparkles, Brain } from "lucide-react";
import {
  listarSugestoesIA,
  aprovarSugestaoIA,
  excluirSugestaoIA,
  atualizarConteudoSugestaoIA,
  type SugestaoIA,
} from "./acoes-ia";
import { MelhorarPrompt } from "./MelhorarPrompt";

type ToastApi = { success: (m: string) => void; error: (m: string) => void };

const estiloBotaoLeve: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 500,
  color: "oklch(0.98 0 0 / 0.7)",
  background: "transparent",
  border: "1px solid oklch(0.98 0 0 / 0.14)",
  borderRadius: 8,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};

export function SugestoesIA({
  agenteId,
  toast,
  atualizarEm,
}: {
  agenteId: string | null;
  toast: ToastApi;
  /** muda quando "Analisar conversas" termina — dispara recarga */
  atualizarEm: number;
}) {
  const [itens, setItens] = useState<SugestaoIA[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [melhorando, setMelhorando] = useState<string | null>(null);
  const abriuSozinho = useRef(false);

  const recarregar = useCallback(async () => {
    if (!agenteId) { setCarregando(false); return; }
    setCarregando(true);
    try {
      const lista = await listarSugestoesIA(agenteId);
      setItens(lista);
      if (lista.length > 0 && !abriuSozinho.current) {
        abriuSozinho.current = true;
        setAberto(true);
      }
    } catch (e) {
      console.warn("[SugestoesIA] carregar falhou:", (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [agenteId]);

  useEffect(() => { void recarregar(); }, [recarregar, atualizarEm]);

  if (!agenteId || (carregando && itens.length === 0)) return null;
  if (!carregando && itens.length === 0) return null;

  const pendentes = itens.filter((i) => !i.ativo).length;
  const aprovadas = itens.length - pendentes;

  async function aprovar(id: string) {
    try {
      await aprovarSugestaoIA(id);
      toast.success("Aprovado — o agente já pode usar.");
      setItens((xs) => xs.map((x) => (x.id === id ? { ...x, ativo: true } : x)));
    } catch (e) {
      toast.error(`Não deu pra aprovar: ${(e as Error).message}`);
    }
  }

  async function excluir(id: string) {
    try {
      await excluirSugestaoIA(id);
      toast.success("Sugestão excluída.");
      setItens((xs) => xs.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(`Não deu pra excluir: ${(e as Error).message}`);
    }
  }

  async function aplicarMelhoria(id: string, texto: string) {
    try {
      await atualizarConteudoSugestaoIA(id, texto);
      setItens((xs) => xs.map((x) => (x.id === id ? { ...x, content: texto } : x)));
      setMelhorando(null);
    } catch (e) {
      toast.error(`Não deu pra salvar a melhoria: ${(e as Error).message}`);
    }
  }

  return (
    <div
      style={{
        border: "1px solid oklch(0.7 0.18 280 / 0.25)",
        borderRadius: 12,
        overflow: "hidden",
        background: "oklch(0.2 0.05 280 / 0.3)",
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Brain size={14} aria-hidden="true" color="oklch(0.75 0.14 280)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
          Sugestões da análise de conversas
        </span>
        <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.5)" }}>
          {pendentes > 0 ? `${pendentes} pendente${pendentes === 1 ? "" : "s"}` : "tudo revisado"}
          {aprovadas > 0 ? ` · ${aprovadas} aprovada${aprovadas === 1 ? "" : "s"}` : ""}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            marginLeft: "auto",
            opacity: 0.55,
            transform: aberto ? "rotate(180deg)" : "none",
            transition: "transform 0.18s ease-out",
          }}
        />
      </button>

      {aberto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 12px 12px" }}>
          {itens.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
                borderRadius: 10,
                background: "oklch(0.98 0 0 / 0.03)",
                border: "1px solid oklch(0.98 0 0 / 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    padding: "2px 6px",
                    borderRadius: 999,
                    color: item.ativo ? "oklch(0.72 0.16 155)" : "oklch(0.8 0.15 85)",
                    background: item.ativo ? "oklch(0.72 0.16 155 / 0.15)" : "oklch(0.8 0.15 85 / 0.15)",
                  }}
                >
                  {item.ativo ? "Aprovado" : "Pendente"}
                </span>
                {item.category && (
                  <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>{item.category}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.98 0 0 / 0.92)" }}>{item.title}</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "oklch(0.98 0 0 / 0.72)", whiteSpace: "pre-wrap" }}>
                {item.content}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                {!item.ativo && (
                  <button type="button" onClick={() => aprovar(item.id)} style={{ ...estiloBotaoLeve, color: "oklch(0.75 0.16 155)", borderColor: "oklch(0.72 0.16 155 / 0.4)" }}>
                    <Check size={12} aria-hidden="true" /> Aprovar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMelhorando((m) => (m === item.id ? null : item.id))}
                  style={estiloBotaoLeve}
                >
                  <Sparkles size={12} aria-hidden="true" /> Melhorar
                </button>
                <button type="button" onClick={() => excluir(item.id)} style={{ ...estiloBotaoLeve, color: "oklch(0.72 0.17 25)" }}>
                  <Trash2 size={12} aria-hidden="true" /> Excluir
                </button>
              </div>
              {melhorando === item.id && (
                <div style={{ marginTop: 4 }}>
                  <MelhorarPrompt
                    titulo={item.title}
                    conteudo={item.content}
                    onAplicar={(texto) => void aplicarMelhoria(item.id, texto)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
