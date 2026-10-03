/**
 * Lista de conversas — coluna esquerda.
 *
 * - Cada item tem avatar + nome + preview + tempo + badge cargo
 * - Drag-handle no avatar+nome: cursor=grab, drag → emite onArrastarFora(conversa) (Onda B abre janela isolada)
 * - Onda A: drag visual ativo, mas onArrastarFora é placeholder (toast info)
 * - aria-listbox + arrow nav + Enter seleciona
 */

import { useEffect, useRef, useState } from "react";
import { Folder, Smartphone } from "lucide-react";
import type { Conversa } from "./tipos";

interface ListaConversasProps {
  conversas: Conversa[];
  totalFiltrado?: number;
  onVerMais?: () => void;
  /** Ainda há conversas antigas no banco além do pool carregado — mantém a
   *  sentinela viva pro scroll infinito buscar o próximo lote server-side. */
  temMaisNoBanco?: boolean;
  busca?: string;
  onBuscaChange?: (v: string) => void;
  conversaSelecionadaId: string | null;
  onSelecionar: (id: string) => void;
  onArrastarFora?: (c: Conversa, x: number, y: number) => void;
  /** Quando true (Panel pai colapsado), lista mostra só avatares verticalmente. */
  colapsada?: boolean;
  /** Callback do botão sanfona — alterna entre colapsada e aberta. */
  onToggleColapsada?: () => void;
  /** Abre o painel de conversa nova por número (igual WhatsApp). */
  onNovaConversa?: () => void;
  /** Abre o modal "Importar WhatsApp pessoal" — QR real (Baileys) que traz o
   * histórico de conversas pra dentro desta lista. */
  onImportarWhatsapp?: () => void;
}

// Distância mínima pra ATIVAR o arrasto visual. 12px = qualquer movimento
// proposital já dispara o ghost flutuante. Click puro continua selecionando
// porque pointerup antes de 12px = sem drag.
const LIMIAR_DRAG_PX = 12;

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function CorCargo(cargoTipologia: string): string {
  switch (cargoTipologia) {
    case "atendimento": return "oklch(0.7 0.18 220)";
    case "vendedor": return "oklch(0.72 0.20 145)";
    case "mentor": return "oklch(0.65 0.22 280)";
    case "financeiro": return "oklch(0.82 0.18 80)";
    case "suporte": return "oklch(0.72 0.20 30)";
    default: return "var(--txt-3)";
  }
}

export function ListaConversas({
  conversas,
  totalFiltrado,
  onVerMais,
  temMaisNoBanco = false,
  busca,
  onBuscaChange,
  conversaSelecionadaId,
  onSelecionar,
  onArrastarFora,
  colapsada = false,
  onToggleColapsada,
  onNovaConversa,
  onImportarWhatsapp,
}: ListaConversasProps) {
  const refLista = useRef<HTMLDivElement | null>(null);
  // State pro ghost flutuante durante drag. Quando arrastandoId === c.id,
  // mostra um clone do item seguindo o cursor (item original fica semi-transparente).
  // Conversa NUNCA sai da lista — é duplicação visual pra abrir em janela nova.
  const [arrastando, setArrastando] = useState<{ id: string; nome: string; x: number; y: number; offX: number; offY: number } | null>(null);
  const refSentinela = useRef<HTMLDivElement | null>(null);

  // Scroll infinito — observa a sentinela no fim da lista. Dispara onVerMais
  // 200px antes do usuário chegar nela, pra carregamento "antecipado".
  useEffect(() => {
    const el = refSentinela.current;
    if (!el || !onVerMais || totalFiltrado == null) return;
    if (conversas.length >= totalFiltrado && !temMaisNoBanco) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVerMais();
      },
      { root: refLista.current, rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [conversas.length, totalFiltrado, onVerMais, temMaisNoBanco]);

  const onPointerDownHandle = (e: React.PointerEvent<HTMLDivElement>, c: Conversa) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    // Offset do cursor dentro do item (pra ghost grudar exatamente onde clicou)
    const rect = e.currentTarget.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const nomeLead = c.lead.nome;
    let arrastou = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!arrastou && Math.hypot(dx, dy) > LIMIAR_DRAG_PX) {
        arrastou = true;
        document.body.classList.add("janela-arrastando");
      }
      if (arrastou) {
        setArrastando({ id: c.id, nome: nomeLead, x: ev.clientX, y: ev.clientY, offX, offY });
      }
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      document.body.classList.remove("janela-arrastando");
      setArrastando(null);
      if (arrastou && onArrastarFora) {
        // Conversa CONTINUA na lista — onArrastarFora só ABRE nova janela com essa conversa
        onArrastarFora(c, ev.clientX, ev.clientY);
      } else if (!arrastou) {
        onSelecionar(c.id);
      }
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  };

  const onKeyLista = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (conversas.length === 0) return;
    const idx = conversas.findIndex((c) => c.id === conversaSelecionadaId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const prox = conversas[Math.min(idx + 1, conversas.length - 1)];
      onSelecionar(prox.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const ant = conversas[Math.max(idx - 1, 0)];
      onSelecionar(ant.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      onSelecionar(conversas[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      onSelecionar(conversas[conversas.length - 1].id);
    }
  };

  return (
    <div
      ref={refLista}
      role="listbox"
      aria-label="Lista de conversas"
      tabIndex={0}
      onKeyDown={onKeyLista}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(15, 12, 30, 0.35)",
        minHeight: 0,
        outline: "none",
      }}
    >
      {/* Header com botão sanfona — sempre visível. Em modo aberto fica à direita
          junto da busca; em modo colapsado fica centralizado. */}
      {colapsada ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <button
            type="button"
            onClick={onToggleColapsada}
            aria-label="Expandir lista de conversas"
            title="Expandir lista"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--txt-1)",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 150ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          >
            ▸
          </button>
        </div>
      ) : (
        <div style={{ padding: "10px 12px 6px", display: "flex", alignItems: "center", gap: 8 }}>
          {onNovaConversa && (
            <button
              type="button"
              onClick={onNovaConversa}
              title="Nova conversa por número"
              aria-label="Iniciar conversa nova por número"
              style={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.25), oklch(0.65 0.22 280 / 0.2))",
                color: "var(--txt-1)",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ＋
            </button>
          )}
          {onImportarWhatsapp && (
            <button
              type="button"
              onClick={onImportarWhatsapp}
              title="Escanear WhatsApp — QR pra trazer suas conversas"
              aria-label="Escanear WhatsApp e trazer as conversas"
              style={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid oklch(0.7 0.18 220 / 0.35)",
                background: "oklch(0.7 0.18 220 / 0.12)",
                color: "var(--txt-1)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Smartphone size={16} aria-hidden="true" />
            </button>
          )}
          {onBuscaChange && (
            <div style={{ position: "relative", flex: 1 }}>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 12,
                  opacity: 0.55,
                }}
              >
                🔍
              </span>
              {/* type="text" de propósito: type="search" renderiza o × nativo do
                  browser em cima do nosso ✕ custom — ficavam DOIS X na barra. */}
              <input
                type="text"
                value={busca ?? ""}
                onChange={(e) => onBuscaChange(e.target.value)}
                placeholder="Buscar por nome, telefone ou conteúdo…"
                aria-label="Buscar conversas por nome, telefone ou conteúdo das mensagens"
                style={{
                  width: "100%",
                  padding: "8px 30px 8px 30px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--txt-1)",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => onBuscaChange("")}
                  aria-label="Limpar busca"
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--txt-3)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "2px 6px",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleColapsada}
            aria-label="Colapsar lista de conversas"
            title="Colapsar lista (mostra só fotos)"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--txt-2)",
              cursor: "pointer",
              fontSize: 14,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 150ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          >
            ◂
          </button>
        </div>
      )}
      {!colapsada && (
        <div
          className="muted tiny"
          style={{
            padding: "4px 14px",
            fontSize: 10,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            opacity: 0.5,
          }}
          aria-hidden="true"
        >
          Clique abre · arraste pra fora pra janela isolada
        </div>
      )}
      <div
        className="scroll"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: colapsada ? "4px 6px" : "8px 6px" }}
      >
        {conversas.length === 0 ? (
          <div className="muted small" style={{ padding: 24, textAlign: "center" }}>
            {colapsada ? "—" : "Nenhuma conversa nesse filtro."}
            {!colapsada && onImportarWhatsapp && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={onImportarWhatsapp}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 16px",
                    borderRadius: 10,
                    border: "1px solid oklch(0.7 0.18 220 / 0.4)",
                    background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.2), oklch(0.65 0.22 280 / 0.16))",
                    color: "var(--txt-1)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Smartphone size={14} aria-hidden="true" />
                  Escanear WhatsApp
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {conversas.map((c) => {
              const selecionada = c.id === conversaSelecionadaId;
              const corCargo = CorCargo(c.cargo_ativo.tipologia);
              if (colapsada) {
                return (
                  <div
                    key={c.id}
                    role="option"
                    aria-selected={selecionada}
                    aria-label={c.lead.nome}
                    onPointerDown={(e) => onPointerDownHandle(e, c)}
                    title={`${c.lead.nome} · ${c.cargo_ativo.nome}`}
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      padding: "6px 0",
                      borderRadius: 10,
                      cursor: arrastando?.id === c.id ? "grabbing" : "grab",
                      background: selecionada
                        ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.14), oklch(0.65 0.22 280 / 0.10))"
                        : "transparent",
                      border: selecionada
                        ? "1px solid oklch(0.7 0.18 220 / 0.35)"
                        : "1px solid transparent",
                      transition: "background 200ms ease, border-color 200ms ease, opacity 120ms ease",
                      userSelect: "none",
                      touchAction: "none",
                      opacity: arrastando?.id === c.id ? 0.35 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: c.lead.foto_url
                          ? `url(${c.lead.foto_url}) center/cover`
                          : "rgba(255,255,255,0.08)",
                        border: `2px solid ${corCargo}`,
                        boxShadow: `0 0 0 1px rgba(0,0,0,0.4), 0 0 8px ${corCargo}55`,
                        flexShrink: 0,
                        position: "relative",
                      }}
                      aria-hidden="true"
                    >
                      {c.mensagens_nao_lidas > 0 && (
                        <span
                          style={{
                            position: "absolute",
                            top: -3,
                            right: -3,
                            minWidth: 18,
                            height: 18,
                            padding: "0 5px",
                            borderRadius: 999,
                            background: "oklch(0.65 0.24 25)",
                            color: "white",
                            fontSize: 10,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 0 8px oklch(0.65 0.24 25 / 0.55)",
                          }}
                        >
                          {c.mensagens_nao_lidas > 9 ? "9+" : c.mensagens_nao_lidas}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={selecionada}
                  onPointerDown={(e) => onPointerDownHandle(e, c)}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: arrastando?.id === c.id ? "grabbing" : "grab",
                    background: selecionada
                      ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.14), oklch(0.65 0.22 280 / 0.10))"
                      : "transparent",
                    border: selecionada
                      ? "1px solid oklch(0.7 0.18 220 / 0.35)"
                      : "1px solid transparent",
                    transition: "background 200ms ease, border-color 200ms ease, opacity 120ms ease",
                    userSelect: "none",
                    touchAction: "none",
                    opacity: arrastando?.id === c.id ? 0.35 : 1,
                  }}
                  title={`Clique abre aqui · Arraste pra fora pra duplicar em janela isolada · ${c.lead.nome}`}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: c.lead.foto_url
                        ? `url(${c.lead.foto_url}) center/cover`
                        : "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      flexShrink: 0,
                      position: "relative",
                    }}
                    aria-hidden="true"
                  >
                    {c.mensagens_nao_lidas > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          minWidth: 16,
                          height: 16,
                          padding: "0 5px",
                          borderRadius: 999,
                          background: "oklch(0.65 0.24 25)",
                          color: "white",
                          fontSize: 10,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 8px oklch(0.65 0.24 25 / 0.55)",
                        }}
                      >
                        {c.mensagens_nao_lidas > 9 ? "9+" : c.mensagens_nao_lidas}
                      </span>
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 160,
                          }}
                        >
                          {c.lead.nome}
                        </span>
                        {c.lead.canal === "instagram" && (
                          <span aria-label="Conversa do Instagram" title="Conversa do Instagram" style={{ fontSize: 11, lineHeight: 1 }}>
                            📷
                          </span>
                        )}
                      </span>
                      <span className="muted tiny mono">{tempoRelativo(c.ultima_mensagem_em)}</span>
                    </div>
                    <div
                      className="muted small"
                      style={{
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c.preview_ultima_mensagem}
                    </div>
                    <div className="row" style={{ marginTop: 4, gap: 6, alignItems: "center" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: corCargo,
                          boxShadow: `0 0 4px ${corCargo}`,
                        }}
                      />
                      <span className="mono tiny" style={{ color: corCargo }}>
                        {c.cargo_ativo.nome}
                      </span>
                      {c.lead.pasta_base_nome && (
                        <span
                          className="tiny"
                          title={`Pasta da Base: ${c.lead.pasta_base_nome}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: "oklch(0.7 0.18 220 / 0.12)",
                            border: "1px solid oklch(0.7 0.18 220 / 0.3)",
                            color: "oklch(0.78 0.12 220)",
                            maxWidth: 110,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Folder size={9} aria-hidden="true" style={{ flexShrink: 0 }} />
                          {c.lead.pasta_base_nome}
                        </span>
                      )}
                      {!c.agente_ligado && (
                        <span className="muted tiny" style={{ marginLeft: "auto" }}>
                          ⏸ modo humano
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {totalFiltrado != null && (conversas.length < totalFiltrado || temMaisNoBanco) && (
              <div
                ref={refSentinela}
                className="muted tiny"
                style={{
                  padding: "12px 4px",
                  textAlign: "center",
                  opacity: 0.55,
                  letterSpacing: 0.3,
                }}
                aria-hidden="true"
              >
                {colapsada
                  ? "···"
                  : conversas.length >= totalFiltrado
                    ? "Buscando conversas antigas…"
                    : `Carregando mais… (${conversas.length} de ${totalFiltrado})`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ghost flutuante durante drag — segue o cursor, sinaliza visualmente
          que a conversa está sendo "duplicada" pra nova janela. Quando solta,
          ghost some + onArrastarFora dispara abrindo a janela isolada.
          Conversa NUNCA sai da lista. */}
      {arrastando && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: arrastando.x - arrastando.offX,
            top: arrastando.y - arrastando.offY,
            pointerEvents: "none",
            zIndex: 9999,
            background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.35), oklch(0.65 0.22 280 / 0.30))",
            border: "1px solid oklch(0.7 0.18 220 / 0.65)",
            borderRadius: 12,
            padding: "10px 14px",
            color: "var(--txt-1)",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px oklch(0.7 0.18 220 / 0.40)",
            backdropFilter: "blur(14px) saturate(160%)",
            WebkitBackdropFilter: "blur(14px) saturate(160%)",
            transform: "rotate(-2deg) scale(1.02)",
            minWidth: 200,
            maxWidth: 280,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16 }}>💬</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {arrastando.nome}
            </div>
            <div className="muted tiny" style={{ fontSize: 10, marginTop: 2 }}>
              solte pra abrir em janela
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
