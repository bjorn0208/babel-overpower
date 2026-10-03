/**
 * PerguntasMentorBell.tsx — Sino independente do loop Mentor no topo do OS.
 *
 * Renderiza um badge âmbar com contador SÓ quando há perguntas aguardando
 * resposta do dono (status_loop='aguardando_dono'). Todas respondidas =
 * nenhuma notificação.
 *
 * Click no badge → abre CardPerguntaMentor da pergunta mais antiga (FIFO),
 * navegável pela fila e com aba de histórico das respondidas.
 *
 * URL ?pergunta=<id> → abre diretamente o card daquela pergunta.
 *
 * Plugado no slot `notif` do Topo via bundle.jsx (ao lado do NotificationCenter).
 */

import { useEffect, useState } from "react";
import { usePerguntasMentor } from "../dados/use-perguntas-mentor";
import type { PerguntaMentor } from "../dados/use-perguntas-mentor";
import { CardPerguntaMentor } from "./CardPerguntaMentor";
import { IconeAjuda } from "./icones-mentor";

interface EstadoModal {
  aberto: boolean;
  perguntaId: string | null;
}

function lerParamsUrl(): { perguntaId: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    return { perguntaId: params.get("pergunta") };
  } catch {
    return { perguntaId: null };
  }
}

export function PerguntasMentorBell({ onAbrirApp }: { onAbrirApp?: (slug: string) => void } = {}) {
  const { aguardando, respondidas, estatisticas, responder, descartar } = usePerguntasMentor();

  const [modal, setModal] = useState<EstadoModal>({
    aberto: false,
    perguntaId: null,
  });

  // Otimismo: ids já respondidos/descartados nesta sessão. Filtra a fila na hora
  // (antes do realtime sincronizar) pra a pergunta processada não piscar de volta.
  const [processadas, setProcessadas] = useState<Set<string>>(new Set());
  function marcarProcessada(id: string) {
    setProcessadas((prev) => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
  }

  // Fila de perguntas a responder — ordem FIFO (mais antiga primeiro), mas navegável.
  const fila = aguardando
    .filter((p) => !processadas.has(p.id))
    .sort(
      (a, b) =>
        new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
    );
  const total = fila.length;

  // Abre automaticamente se URL tiver ?pergunta=<id>
  useEffect(() => {
    const { perguntaId } = lerParamsUrl();
    if (!perguntaId) return;
    setModal({ aberto: true, perguntaId });
  }, []);

  function abrirProxima() {
    if (fila.length > 0) {
      setModal({ aberto: true, perguntaId: fila[0].id });
    }
  }

  function fechar() {
    setModal({ aberto: false, perguntaId: null });
  }

  // Abre a conversa do cliente em janela isolada (mesmo padrão da Maquete/GenUi):
  // payload global + slug único conversa-isolada__<id> resolvido pelo bundle.
  function abrirConversa(conversationId: string) {
    if (!onAbrirApp) return;
    const slug = `conversa-isolada__${conversationId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
    try {
      const w = window as unknown as { __PAYLOADS_CONVERSAS?: Record<string, { id: string }> };
      if (!w.__PAYLOADS_CONVERSAS) w.__PAYLOADS_CONVERSAS = {};
      w.__PAYLOADS_CONVERSAS[slug] = { id: conversationId };
    } catch {
      /* noop */
    }
    onAbrirApp(slug);
  }

  // Navega na fila de resposta (setas ‹ ›) — delta -1 anterior, +1 próxima.
  function irPara(delta: number) {
    const pos = fila.findIndex((p) => p.id === modal.perguntaId);
    if (pos === -1) return;
    const novo = pos + delta;
    if (novo >= 0 && novo < fila.length) {
      setModal((m) => ({ ...m, perguntaId: fila[novo].id }));
    }
  }

  // Após responder/descartar: avança pra vizinha; fila vazia = fecha.
  function avancarApos(id: string) {
    const pos = fila.findIndex((p) => p.id === id);
    const restante = fila.filter((p) => p.id !== id);
    if (restante.length > 0) {
      const novoIdx = Math.min(Math.max(pos, 0), restante.length - 1);
      setModal({ aberto: true, perguntaId: restante[novoIdx].id });
    } else {
      fechar();
    }
  }

  async function handleResponder(id: string, resposta: string) {
    const res = await responder(id, resposta);
    if (res.ok) {
      marcarProcessada(id);
      avancarApos(id);
    }
    return res;
  }

  async function handleDescartar(id: string) {
    const res = await descartar(id);
    if (res.ok) {
      marcarProcessada(id);
      avancarApos(id);
    }
    return res;
  }

  // Pergunta ativa no modal (fila ou histórico — URL pode apontar respondida)
  const perguntaAtiva: PerguntaMentor | null =
    modal.perguntaId
      ? ([...aguardando, ...respondidas].find((p) => p.id === modal.perguntaId) ?? null)
      : null;

  // Posição da pergunta ativa na fila de resposta (pra setas + contador)
  const posFila = fila.findIndex((p) => p.id === modal.perguntaId);

  if (total === 0 && !modal.aberto) return null;

  return (
    <>
      {total > 0 && (
        <button
          onClick={abrirProxima}
          aria-label={`${total} pergunta${total > 1 ? "s" : ""} aguardando sua resposta`}
          title="Perguntas aguardando sua resposta"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 999,
            background: "oklch(0.85 0.18 55 / 0.15)",
            border: "1px solid oklch(0.85 0.18 55 / 0.45)",
            color: "oklch(0.90 0.16 60)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "background 140ms, border-color 140ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "oklch(0.85 0.18 55 / 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "oklch(0.85 0.18 55 / 0.15)";
          }}
        >
          <IconeAjuda size={12} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 18,
              height: 18,
              borderRadius: 999,
              background: "oklch(0.85 0.20 55)",
              color: "oklch(0.15 0.05 55)",
              fontSize: 11,
              fontWeight: 800,
              padding: "0 5px",
            }}
            aria-live="polite"
            aria-atomic="true"
          >
            {total > 99 ? "99+" : total}
          </span>
        </button>
      )}

      {modal.aberto && perguntaAtiva && (
        <CardPerguntaMentor
          pergunta={perguntaAtiva}
          respondidas={respondidas}
          estatisticas={estatisticas}
          onResponder={handleResponder}
          onDescartar={handleDescartar}
          onFechar={fechar}
          indice={posFila >= 0 ? posFila + 1 : undefined}
          total={fila.length}
          onAnterior={posFila > 0 ? () => irPara(-1) : undefined}
          onProxima={posFila >= 0 && posFila < fila.length - 1 ? () => irPara(1) : undefined}
          onAbrirConversa={onAbrirApp ? abrirConversa : undefined}
        />
      )}
    </>
  );
}
