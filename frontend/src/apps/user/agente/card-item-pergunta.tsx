/**
 * CardItemPergunta — item da lista de perguntas do Mentor.
 *
 * Linha com meta (status + tempo), pergunta em destaque, resposta aninhada
 * com tint, e ações por ícone (responder / editar / excluir com confirmação
 * inline / abrir conversa).
 */

import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Reply, Trash2 } from "lucide-react";
import type { PerguntaMentor, StatusLoop } from "./use-perguntas-agente";

export const ROTULOS_STATUS: Record<StatusLoop, string> = {
  aguardando_dono: "Aguardando você",
  dono_respondeu: "Respondida — entregando ao lead",
  entregue_lead: "Entregue ao lead",
  virou_bloco: "Respondida — virou conhecimento",
  descartada: "Descartada",
};

export const CORES_STATUS: Record<StatusLoop, string> = {
  aguardando_dono: "oklch(0.78 0.18 80)",
  dono_respondeu: "oklch(0.7 0.18 220)",
  entregue_lead: "oklch(0.72 0.18 145)",
  virou_bloco: "oklch(0.72 0.18 145)",
  descartada: "oklch(0.98 0 0 / 0.4)",
};

export function formatarRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  return `há ${Math.floor(hr / 24)}d`;
}

const estiloBotaoIcone: React.CSSProperties = {
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid oklch(0.98 0 0 / 0.08)",
  background: "transparent",
  color: "oklch(0.98 0 0 / 0.55)",
  cursor: "pointer",
};

export interface CardItemPerguntaProps {
  item: PerguntaMentor;
  salvando: boolean;
  onResponder: (item: PerguntaMentor) => void;
  onEditar: (item: PerguntaMentor) => void;
  onExcluir: (id: string) => void;
}

export function CardItemPergunta({
  item,
  salvando,
  onResponder,
  onEditar,
  onExcluir,
}: CardItemPerguntaProps) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  // Confirmação de exclusão expira sozinha — sem modal.
  useEffect(() => {
    if (!confirmandoExclusao) return;
    const t = setTimeout(() => setConfirmandoExclusao(false), 3500);
    return () => clearTimeout(t);
  }, [confirmandoExclusao]);

  const pendente = item.status_loop === "aguardando_dono";
  const respondida =
    item.status_loop === "dono_respondeu" ||
    item.status_loop === "entregue_lead" ||
    item.status_loop === "virou_bloco";

  return (
    <div
      style={{
        background: "oklch(0.18 0.06 280 / 0.4)",
        border: `1px solid ${pendente ? "oklch(0.78 0.18 80 / 0.25)" : "oklch(0.98 0 0 / 0.07)"}`,
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: salvando ? 0.5 : 1,
        transition: "opacity 0.15s ease-out, border-color 0.15s ease-out",
      }}
    >
      {/* Meta: dot de status + rótulo + tempo + ações */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: CORES_STATUS[item.status_loop],
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: CORES_STATUS[item.status_loop],
            letterSpacing: 0.2,
          }}
        >
          {ROTULOS_STATUS[item.status_loop]}
        </span>
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.4)" }}>
          · {formatarRelativo(item.criado_em)}
        </span>

        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          {item.conversation_id && (
            <a
              href={`/atendimento?conversa=${item.conversation_id}`}
              target="_blank"
              rel="noreferrer"
              title="Abrir a conversa de origem"
              style={{ ...estiloBotaoIcone, textDecoration: "none" }}
            >
              <ExternalLink size={14} />
            </a>
          )}
          {respondida && (
            <button
              type="button"
              title="Editar resposta"
              onClick={() => onEditar(item)}
              style={estiloBotaoIcone}
            >
              <Pencil size={14} />
            </button>
          )}
          {confirmandoExclusao ? (
            <button
              type="button"
              onClick={() => {
                setConfirmandoExclusao(false);
                onExcluir(item.id);
              }}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid oklch(0.65 0.24 25 / 0.5)",
                background: "oklch(0.65 0.24 25 / 0.15)",
                color: "oklch(0.78 0.16 25)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Trash2 size={13} /> Excluir?
            </button>
          ) : (
            <button
              type="button"
              title="Excluir pergunta"
              onClick={() => setConfirmandoExclusao(true)}
              style={estiloBotaoIcone}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Pergunta */}
      <div style={{ fontSize: 13, fontWeight: 500, color: "oklch(0.98 0 0)", lineHeight: 1.5 }}>
        {item.pergunta}
      </div>

      {/* Reformulação do Mentor (só enquanto pendente — depois a resposta importa mais) */}
      {pendente && item.pergunta_para_mentor && (
        <div
          style={{
            fontSize: 12,
            color: "oklch(0.98 0 0 / 0.7)",
            background: "oklch(0.78 0.18 80 / 0.08)",
            border: "1px solid oklch(0.78 0.18 80 / 0.15)",
            borderRadius: 8,
            padding: "8px 10px",
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "oklch(0.78 0.18 80)",
              marginBottom: 3,
            }}
          >
            O agente precisa saber
          </span>
          {item.pergunta_para_mentor}
        </div>
      )}

      {/* Resposta do dono */}
      {item.resposta_do_dono && (
        <div
          style={{
            fontSize: 12,
            color: "oklch(0.98 0 0 / 0.8)",
            background: "oklch(0.72 0.18 145 / 0.07)",
            border: "1px solid oklch(0.72 0.18 145 / 0.14)",
            borderRadius: 8,
            padding: "8px 10px",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "oklch(0.72 0.18 145)",
              marginBottom: 3,
            }}
          >
            Sua resposta
            {item.respondida_em ? ` · ${formatarRelativo(item.respondida_em)}` : ""}
          </span>
          {item.resposta_do_dono}
        </div>
      )}

      {/* Rodapé: destino do conhecimento + ação principal */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {item.bloco_criado_id && (
          <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
            Salvo na base ({item.gaveta_proposta?.replace("blocos_", "") ?? "conhecimento"} ·{" "}
            {item.escopo_proposto ?? "tenant"})
          </span>
        )}
        {pendente && (
          <button
            type="button"
            onClick={() => onResponder(item)}
            style={{
              marginLeft: "auto",
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "oklch(0.7 0.18 220)",
              color: "oklch(0.98 0 0)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Reply size={14} /> Responder
          </button>
        )}
      </div>
    </div>
  );
}
