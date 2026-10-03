/**
 * AbaPerguntas — caixa de perguntas do Mentor.
 *
 * O agente gera perguntas quando encontra lacuna de conhecimento. Aqui o dono:
 * responde as pendentes, edita respostas já dadas (reflete na base), exclui o
 * que não serve e acompanha quanto o agente já gerou.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Inbox } from "lucide-react";
import {
  usePerguntasAgente,
  type PerguntaMentor,
  type StatusLoop,
} from "./use-perguntas-agente";
import { CardItemPergunta } from "./card-item-pergunta";
import { ModalRespostaPergunta } from "./modal-resposta-pergunta";

// ─── Visões ───────────────────────────────────────────────────────────────────

type Visao = "pendentes" | "respondidas" | "descartadas";

const VISOES: { id: Visao; rotulo: string; status: StatusLoop[] }[] = [
  { id: "pendentes",   rotulo: "Por responder", status: ["aguardando_dono"] },
  { id: "respondidas", rotulo: "Respondidas",   status: ["dono_respondeu", "entregue_lead", "virou_bloco"] },
  { id: "descartadas", rotulo: "Descartadas",   status: ["descartada"] },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export interface AbaPerguntas {
  agenteId: string;
}

export function AbaPerguntas({ agenteId }: AbaPerguntas) {
  const { perguntas, estatisticas, carregando, responder, editarResposta, excluir } =
    usePerguntasAgente(agenteId);
  const [visao, setVisao] = useState<Visao>("pendentes");
  const [respondendo, setRespondendo] = useState<PerguntaMentor | null>(null);
  const [editando, setEditando] = useState<PerguntaMentor | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const visaoAtual = VISOES.find((v) => v.id === visao)!;
  const itensFiltrados = perguntas.filter((p) =>
    visaoAtual.status.includes(p.status_loop),
  );
  // Contagens exatas do banco (a lista é janela das 500 mais recentes).
  const geradas = estatisticas?.geradas ?? perguntas.length;
  const contar = (v: (typeof VISOES)[number]) => {
    if (estatisticas) {
      if (v.id === "pendentes") return estatisticas.porResponder;
      if (v.id === "respondidas") return estatisticas.respondidas;
      return estatisticas.descartadas;
    }
    return perguntas.filter((p) => v.status.includes(p.status_loop)).length;
  };

  async function handleResponder(resposta: string, aprovarDireto: boolean) {
    if (!respondendo) return;
    setSalvandoId(respondendo.id);
    const ok = await responder(respondendo.id, resposta, aprovarDireto);
    setSalvandoId(null);
    if (ok) {
      setRespondendo(null);
      if (aprovarDireto) {
        toast.success("Resposta validada — já está no conhecimento do agente.");
      } else {
        // Notifica que ficou travada (pedido do Theus): pré-aprovação = não vale
        // até você aprovar em Conhecimentos.
        toast.warning(
          "Resposta guardada na caixa de pré-aprovados — travada até você aprovar em Conhecimentos.",
        );
      }
    } else {
      toast.error("Não deu pra salvar a resposta. Tenta de novo.");
    }
  }

  async function handleEditar(resposta: string) {
    if (!editando) return;
    setSalvandoId(editando.id);
    const ok = await editarResposta(editando.id, resposta);
    setSalvandoId(null);
    if (ok) {
      setEditando(null);
      toast.success("Resposta atualizada.");
    } else {
      toast.error("Não deu pra atualizar a resposta. Tenta de novo.");
    }
  }

  async function handleExcluir(id: string) {
    setSalvandoId(id);
    const ok = await excluir(id);
    setSalvandoId(null);
    if (ok) toast.success("Pergunta excluída.");
    else toast.error("Não deu pra excluir. Tenta de novo.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Cabeçalho: total gerado + visões com contagem */}
      <header
        style={{
          padding: "14px 22px 12px",
          borderBottom: "1px solid oklch(0.98 0 0 / 0.05)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
            Perguntas do agente
          </span>
          {!carregando && (
            <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)" }}>
              · {geradas === 0
                ? "nenhuma gerada ainda"
                : `${geradas} gerada${geradas === 1 ? "" : "s"} até agora`}
            </span>
          )}
        </div>

        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {VISOES.map((v) => {
            const ativo = visao === v.id;
            const conta = contar(v);
            const destacar = v.id === "pendentes" && conta > 0;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVisao(v.id)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: ativo ? "oklch(0.7 0.18 220)" : "var(--bg-3)",
                  color: ativo ? "oklch(0.98 0 0)" : "var(--txt-2)",
                  fontSize: 12,
                  fontWeight: ativo ? 600 : 400,
                  cursor: "pointer",
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {v.rotulo}
                <span
                  style={{
                    background: ativo
                      ? "oklch(0.98 0 0 / 0.25)"
                      : destacar
                        ? "oklch(0.78 0.18 80)"
                        : "oklch(0.98 0 0 / 0.08)",
                    color: destacar && !ativo ? "oklch(0.16 0.05 80)" : "oklch(0.98 0 0)",
                    borderRadius: 10,
                    padding: "1px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {conta}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Lista */}
      <div
        className="scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {carregando && (
          <div
            style={{
              textAlign: "center",
              color: "var(--txt-3)",
              fontSize: 13,
              paddingTop: 40,
            }}
          >
            Carregando perguntas…
          </div>
        )}

        {!carregando && itensFiltrados.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--txt-3)",
              fontSize: 13,
              paddingTop: 48,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
            }}
          >
            {visao === "pendentes" ? (
              <CheckCircle2 size={28} color="oklch(0.72 0.18 145)" />
            ) : (
              <Inbox size={28} color="oklch(0.98 0 0 / 0.35)" />
            )}
            <div style={{ maxWidth: 320, lineHeight: 1.5 }}>
              {visao === "pendentes"
                ? "Nenhuma pergunta esperando você. Quando o agente travar numa lacuna de conhecimento, ela aparece aqui."
                : "Nada aqui ainda."}
            </div>
          </div>
        )}

        {!carregando &&
          itensFiltrados.map((item) => (
            <CardItemPergunta
              key={item.id}
              item={item}
              salvando={salvandoId === item.id}
              onResponder={setRespondendo}
              onEditar={setEditando}
              onExcluir={(id) => {
                void handleExcluir(id);
              }}
            />
          ))}
      </div>

      {/* Modal: responder pendente */}
      {respondendo && (
        <ModalRespostaPergunta
          pergunta={respondendo}
          onConfirmar={handleResponder}
          onFechar={() => setRespondendo(null)}
        />
      )}

      {/* Modal: editar resposta existente */}
      {editando && (
        <ModalRespostaPergunta
          pergunta={editando}
          valorInicial={editando.resposta_do_dono ?? ""}
          onConfirmar={handleEditar}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
