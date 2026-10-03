/**
 * Botão "Melhorar com IA" do form de bloco de conhecimento.
 * Chama a edge `melhorar-prompt` (modelo grátis do OpenRouter) usando título +
 * conteúdo como contexto e mostra: o texto reescrito ("como a IA sugere") e
 * 1 sugestão complementar. Nada é aplicado sem o tenant decidir:
 * Aprovar aplica no conteúdo · Editar abre popup editável · Descartar joga fora.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BotaoPrimario, estiloInput } from "./ui-hub";
import { SeletorModeloIa, modeloEscolhido } from "./SeletorModeloIa";

type Proposta = { melhorado: string; sugestao: string; modelo: string };

const ROTULO_IA = "Llama 3.3 70B · grátis";

const estiloCartao: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 12,
  borderRadius: 12,
  background: "oklch(0.22 0.06 280 / 0.55)",
  border: "1px solid oklch(0.7 0.18 280 / 0.2)",
};

const estiloRotulo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "oklch(0.98 0 0 / 0.55)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const estiloTexto: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.55,
  color: "oklch(0.98 0 0 / 0.85)",
  whiteSpace: "pre-wrap",
  maxHeight: 180,
  overflowY: "auto",
};

const estiloBotaoLeve: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 500,
  color: "oklch(0.98 0 0 / 0.65)",
  background: "transparent",
  border: "1px solid oklch(0.98 0 0 / 0.12)",
  borderRadius: 10,
  cursor: "pointer",
};

export function MelhorarPrompt({
  titulo,
  conteudo,
  onAplicar,
}: {
  titulo: string;
  conteudo: string;
  onAplicar: (texto: string) => void;
}) {
  const [melhorando, setMelhorando] = useState(false);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [textoEdicao, setTextoEdicao] = useState("");

  const podeMelhorar = titulo.trim() !== "" && conteudo.trim() !== "" && !melhorando;

  // Erro inline além do toast: reforço visual perto do botão (o toast some
  // sozinho depois de alguns segundos; o erro inline fica até o usuário agir).
  function falhou(mensagem: string) {
    setErro(mensagem);
    toast.error(mensagem);
  }

  async function melhorar() {
    if (!podeMelhorar) return;
    setMelhorando(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("melhorar-prompt", {
        body: { titulo, conteudo, modelo: modeloEscolhido() ?? undefined },
      });
      if (error || data?.error) {
        let detalheErro = data?.error;
        if (!detalheErro && error && "context" in error) {
          const corpo = await (error.context as Response).json().catch(() => null);
          detalheErro = corpo?.error;
        }
        falhou(detalheErro ?? "Não consegui melhorar agora. Tenta de novo.");
        return;
      }
      setProposta({
        melhorado: data.melhorado ?? "",
        sugestao: data.sugestao ?? "",
        modelo: data.modelo ? `${data.modelo}${data.gratis ? " · grátis" : ""}` : ROTULO_IA,
      });
    } catch {
      falhou("Não consegui melhorar agora. Tenta de novo.");
    } finally {
      setMelhorando(false);
    }
  }

  function aprovar() {
    if (!proposta) return;
    onAplicar(proposta.melhorado);
    setProposta(null);
    toast.success("Conteúdo atualizado com a versão melhorada.");
  }

  function abrirEdicao() {
    if (!proposta) return;
    setTextoEdicao(proposta.melhorado);
    setEditando(true);
  }

  function salvarEdicao() {
    if (textoEdicao.trim() === "") return;
    onAplicar(textoEdicao);
    setEditando(false);
    setProposta(null);
    toast.success("Conteúdo atualizado com o texto editado.");
  }

  function usarSugestao() {
    if (!proposta || proposta.sugestao.trim() === "") return;
    onAplicar(`${conteudo.trim()}\n\n${proposta.sugestao.trim()}`);
    toast.success("Sugestão adicionada ao fim do conteúdo.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={melhorar}
          disabled={!podeMelhorar}
          style={{
            ...estiloBotaoLeve,
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: podeMelhorar ? "oklch(0.85 0.12 280)" : "oklch(0.98 0 0 / 0.35)",
            borderColor: podeMelhorar ? "oklch(0.7 0.18 280 / 0.4)" : "oklch(0.98 0 0 / 0.08)",
            cursor: podeMelhorar ? "pointer" : "default",
          }}
        >
          <Sparkles size={13} aria-hidden="true" />
          {melhorando ? "Melhorando…" : "Melhorar com IA"}
        </button>
        <SeletorModeloIa />
      </div>

      {erro && (
        <span style={{ fontSize: 10.5, lineHeight: 1.4, color: "oklch(0.72 0.17 25)" }}>
          {erro}
        </span>
      )}

      {proposta && (
        <>
          <div style={estiloCartao}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={estiloRotulo}>Como a IA sugere</span>
              <span style={{ fontSize: 10, fontStyle: "italic", color: "oklch(0.98 0 0 / 0.4)" }}>
                {proposta.modelo}
              </span>
            </div>
            <div style={estiloTexto}>{proposta.melhorado}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setProposta(null)} style={estiloBotaoLeve}>
                Descartar
              </button>
              <button type="button" onClick={abrirEdicao} style={estiloBotaoLeve}>
                Editar
              </button>
              <BotaoPrimario onClick={aprovar}>Aprovar</BotaoPrimario>
            </div>
          </div>

          {proposta.sugestao.trim() !== "" && (
            <div style={estiloCartao}>
              <span style={estiloRotulo}>Sugestão</span>
              <div style={estiloTexto}>{proposta.sugestao}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" onClick={usarSugestao} style={estiloBotaoLeve}>
                  Adicionar ao conteúdo
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {editando &&
        createPortal(
          <div
            onClick={() => setEditando(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              background: "oklch(0.1 0.03 280 / 0.6)",
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 520,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 20,
                borderRadius: 16,
                background: "oklch(0.18 0.06 280 / 0.97)",
                border: "1px solid oklch(0.7 0.18 280 / 0.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
                  Editar texto melhorado
                </span>
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  title="Fechar"
                  style={{ background: "transparent", border: "none", color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>
              <textarea
                rows={10}
                autoFocus
                value={textoEdicao}
                onChange={(e) => setTextoEdicao(e.target.value)}
                style={estiloInput}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setEditando(false)} style={estiloBotaoLeve}>
                  Cancelar
                </button>
                <BotaoPrimario onClick={salvarEdicao}>Salvar</BotaoPrimario>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
