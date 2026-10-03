/**
 * Kanban de atendimento de Rifas (Theus 2026-09-02) — drag-and-drop HTML5
 * nativo, mesmo padrão do Kanban de Campanha (`campanha/visao/Operacao.tsx`).
 * Colunas draggable = `pedidos_rifa.status` de verdade (arrastar muda o
 * status real). "Conversando" é informativa (sem pedido ainda).
 *
 * Arena (2026-09-12): no desktop, colunas lado a lado com arrastar-e-soltar; no celular
 * (ou modo celular) as etapas viram um segmented control e o card ganha chips "mover pra…",
 * porque arrastar com o dedo não existe no DnD nativo. Mesmo `soltar` nos dois caminhos.
 */

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  listarConversandoSemPedido,
  listarPedidosKanban,
  moverFasePedido,
  type CardAtendimento,
  type FaseKanban,
} from "../dados-atendimento";
import { assinarMudancas } from "../dados-rifas";
import { fmtBRL } from "../formato";
import { Carregando } from "./basicos";

type FaseMovivel = Exclude<FaseKanban, "conversando">;

const COLUNAS: { fase: FaseKanban; rotulo: string; curto: string; draggable: boolean; tinta: string; vidro: string }[] = [
  { fase: "conversando", rotulo: "💬 Conversando", curto: "Conversando", draggable: false, tinta: "var(--ar-txt-3)", vidro: "var(--ar-filete)" },
  { fase: "reservado", rotulo: "🎟️ Reservado", curto: "Reservado", draggable: true, tinta: "var(--ar-aviso)", vidro: "var(--ar-aviso-vidro)" },
  { fase: "aguardando_validacao", rotulo: "🧾 Aguardando validação", curto: "Validação", draggable: true, tinta: "var(--ar-info)", vidro: "var(--ar-info-vidro)" },
  { fase: "pago", rotulo: "✅ Pago", curto: "Pago", draggable: true, tinta: "var(--ar-ok)", vidro: "var(--ar-ok-vidro)" },
];

const iniciais = (nome: string | null) =>
  (nome ?? "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

export interface KanbanAtendimentoProps {
  aoAbrirCard: (card: CardAtendimento) => void;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const KanbanAtendimento = ({ aoAbrirCard, aoNotificar }: KanbanAtendimentoProps) => {
  const [cards, setCards] = useState<CardAtendimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaDestaque, setColunaDestaque] = useState<FaseKanban | null>(null);
  const [etapaCelular, setEtapaCelular] = useState<FaseKanban>("conversando");

  const carregar = async (comSpinner = true) => {
    if (comSpinner) setCarregando(true);
    try {
      const pedidos = await listarPedidosKanban();
      const idsComPedido = new Set(pedidos.map((p) => p.leadId).filter((x): x is string => !!x));
      const conversando = await listarConversandoSemPedido(idsComPedido);
      setCards([...conversando, ...pedidos]);
    } catch (e) {
      aoNotificar(`Falha ao carregar atendimento: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      if (comSpinner) setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    // Δ 2026-09-08: o quadro ficava congelado — venda que entrava pelo agente ou comprovante
    // aprovado só apareciam depois de trocar de aba. O canal já existia (`assinarMudancas`),
    // o kanban é que não assinava. Recarrega sem spinner pra não piscar a tela do dono.
    let cancelar: (() => void) | null = null;
    let vivo = true;
    void assinarMudancas(() => void carregar(false)).then((fn) => {
      if (vivo) cancelar = fn;
      else fn();
    });
    return () => {
      vivo = false;
      cancelar?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const soltar = async (pedidoId: string, novaFase: FaseMovivel) => {
    setColunaDestaque(null);
    setArrastandoId(null);
    const anterior = cards;
    setCards((xs) => xs.map((c) => (c.pedidoId === pedidoId ? { ...c, fase: novaFase } : c)));
    try {
      await moverFasePedido(pedidoId, novaFase);
    } catch (e) {
      setCards(anterior);
      aoNotificar(`Falha ao mover: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-full">
        <Carregando rotulo="Carregando atendimento…" />
      </div>
    );
  }

  const CardContato = ({ c, col, comMover }: { c: CardAtendimento; col: (typeof COLUNAS)[number]; comMover: boolean }) => {
    const destinos = comMover && c.pedidoId ? COLUNAS.filter((x) => x.draggable && x.fase !== col.fase) : [];
    return (
      <div
        draggable={col.draggable && !comMover}
        onDragStart={(e) => {
          if (!col.draggable || !c.pedidoId) return;
          e.dataTransfer.setData("text/plain", c.pedidoId);
          setArrastandoId(c.pedidoId);
        }}
        onDragEnd={() => setArrastandoId(null)}
        onClick={() => aoAbrirCard(c)}
        className={`ar-cartao ar-cartao--compacto ar-cartao--clicavel ar-kanban-card ${arrastandoId === c.pedidoId ? "ar-kanban-card--arrastando" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className="ar-avatar">{c.fotoUrl ? <img src={c.fotoUrl} alt="" /> : iniciais(c.nome)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium ar-txt-1 truncate">{c.nome || c.phone || "Contato"}</p>
            {c.rifaTitulo && <p className="text-xs ar-txt-3 truncate">{c.rifaTitulo}</p>}
          </div>
          <ChevronRight size={16} className="ar-txt-4 shrink-0" />
        </div>
        {(c.numeros.length > 0 || c.valorCentavos !== null) && (
          <div className="ar-scroll-x mt-2.5">
            {c.valorCentavos !== null && (
              <span className="ar-chip-num" style={{ minHeight: 30, padding: "4px 10px" }}>
                <span className="ar-chip-num__rotulo">R$</span>
                <span className="ar-chip-num__valor">{fmtBRL(c.valorCentavos).replace("R$", "").trim()}</span>
              </span>
            )}
            {c.numeros.length > 0 && (
              <span className="ar-chip-num" style={{ minHeight: 30, padding: "4px 10px" }}>
                <span className="ar-chip-num__rotulo">nº</span>
                <span className="ar-chip-num__valor">
                  {c.numeros.slice(0, 6).join(", ")}
                  {c.numeros.length > 6 ? "…" : ""}
                </span>
              </span>
            )}
          </div>
        )}
        {destinos.length > 0 && (
          <div className="ar-scroll-x mt-2.5" onClick={(e) => e.stopPropagation()}>
            {destinos.map((d) => (
              <button
                key={d.fase}
                type="button"
                onClick={() => void soltar(c.pedidoId as string, d.fase as FaseMovivel)}
                className="ar-chip"
                style={{ minHeight: 32, background: d.vidro, color: d.tinta, fontSize: 12 }}
              >
                → {d.curto}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const cabecalho = (col: (typeof COLUNAS)[number], total: number) => (
    <span
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{ background: col.vidro, color: col.tinta }}
    >
      {col.rotulo}
      <span className="ar-num opacity-70">{total}</span>
    </span>
  );

  const etapaAtual = COLUNAS.find((c) => c.fase === etapaCelular) ?? COLUNAS[0];
  const cardsEtapa = cards.filter((c) => c.fase === etapaAtual.fase);

  return (
    <>
      {/* Desktop: colunas com arrastar-e-soltar */}
      <div className="ar-kanban-colunas gap-3 h-full overflow-x-auto p-3 scrollbar-hide">
        {COLUNAS.map((col) => {
          const cardsFase = cards.filter((c) => c.fase === col.fase);
          return (
            <div
              key={col.fase}
              onDragOver={(e) => {
                if (!col.draggable) return;
                e.preventDefault();
                setColunaDestaque(col.fase);
              }}
              onDragLeave={() => colunaDestaque === col.fase && setColunaDestaque(null)}
              onDrop={(e) => {
                if (!col.draggable) return;
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void soltar(id, col.fase as FaseMovivel);
              }}
              className={`ar-kanban-coluna ${colunaDestaque === col.fase ? "ar-kanban-coluna--destino" : ""}`}
            >
              <div className="flex items-center justify-between">{cabecalho(col, cardsFase.length)}</div>
              <div className="flex-1 overflow-y-auto space-y-2 min-h-[80px] scrollbar-hide">
                {cardsFase.length === 0 ? (
                  <p className="text-xs ar-txt-4 text-center py-6">Vazio</p>
                ) : (
                  cardsFase.map((c) => <CardContato key={c.pedidoId ?? c.conversaId} c={c} col={col} comMover={false} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Celular: etapas em segmented + lista da etapa */}
      <div className="ar-kanban-etapas">
        <div className="p-3 pb-2 shrink-0">
          <nav className="ar-seg w-full" aria-label="Etapas">
            {COLUNAS.map((col) => {
              const total = cards.filter((c) => c.fase === col.fase).length;
              const ativa = col.fase === etapaCelular;
              return (
                <button
                  key={col.fase}
                  type="button"
                  onClick={() => setEtapaCelular(col.fase)}
                  aria-current={ativa ? "page" : undefined}
                  className={`ar-seg__item ${ativa ? "ar-seg__item--ativo" : ""}`}
                >
                  {col.curto}
                  {total > 0 && <span className="ar-num ml-1.5 opacity-70">{total}</span>}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-hide">
          <div className="flex items-center justify-between py-1">{cabecalho(etapaAtual, cardsEtapa.length)}</div>
          {cardsEtapa.length === 0 ? (
            <p className="text-sm ar-txt-4 text-center py-10">Ninguém nesta etapa.</p>
          ) : (
            cardsEtapa.map((c) => <CardContato key={c.pedidoId ?? c.conversaId} c={c} col={etapaAtual} comMover />)
          )}
        </div>
      </div>
    </>
  );
};
