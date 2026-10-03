/** Aba Números (dashboard) — métricas reais por rifa a partir de pedidos_rifa. Visual Arena. */

import { useMemo } from "react";
import { Botao } from "../componentes/botao";
import { BarraProgresso, CarregandoCentro, CartaoMetrica, EstadoVazio, Selo, seloDoStatus } from "../componentes/basicos";
import { fmtBRL, fmtData, fmtDataHora } from "../formato";
import type { PedidoRifa, Rifa, StatsRifa } from "../tipos";

export interface AbaDashboardProps {
  rifas: Rifa[];
  pedidos: PedidoRifa[];
  statsDe: (rifaId: string) => StatsRifa;
  rifaSelecionadaId: string | null;
  aoSelecionar: (rifaId: string | null) => void;
  carregando: boolean;
  aoAbrir: (rifa: Rifa) => void;
  aoCriar: () => void;
}

const DIAS = 7;

/** Gráfico de barras em SVG puro: 7 dias, roxo → rosa. Sem biblioteca. */
const GraficoVendas = ({ dias, maior }: { dias: { rotulo: string; valor: number }[]; maior: number }) => {
  const L = 100;
  const A = 100;
  const gap = 3;
  const larg = (L - gap * (dias.length - 1)) / dias.length;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="w-full h-36 block" aria-hidden>
      <defs>
        <linearGradient id="ar-grad-barra" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ar-roxo-alto)" />
          <stop offset="100%" stopColor="var(--ar-roxo)" />
        </linearGradient>
      </defs>
      {dias.map((d, i) => {
        const h = d.valor > 0 ? Math.max(3, (d.valor / maior) * A) : 2;
        return (
          <rect
            key={i}
            x={i * (larg + gap)}
            y={A - h}
            width={larg}
            height={h}
            rx={1.5}
            fill={d.valor > 0 ? "url(#ar-grad-barra)" : "var(--ar-cartao-alto)"}
          />
        );
      })}
    </svg>
  );
};

export const AbaDashboard = ({
  rifas,
  pedidos,
  statsDe,
  rifaSelecionadaId,
  aoSelecionar,
  carregando,
  aoAbrir,
  aoCriar,
}: AbaDashboardProps) => {
  const rifa = rifas.find((r) => r.id === rifaSelecionadaId) ?? null;
  const pedidosDaRifa = useMemo(
    () => (rifa ? pedidos.filter((p) => p.rifa_id === rifa.id) : []),
    [pedidos, rifa],
  );

  const vendasPorDia = useMemo(() => {
    const dias: { rotulo: string; valor: number }[] = [];
    for (let i = DIAS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const proximo = new Date(d);
      proximo.setDate(d.getDate() + 1);
      const valor = pedidosDaRifa
        .filter((p) => p.status === "pago")
        .filter((p) => {
          const quando = new Date(p.pago_em ?? p.created_at);
          return quando >= d && quando < proximo;
        })
        .reduce((s, p) => s + p.valor_centavos, 0);
      dias.push({ rotulo: d.toLocaleDateString("pt-BR", { weekday: "short" }), valor });
    }
    return dias;
  }, [pedidosDaRifa]);

  if (carregando) return <CarregandoCentro rotulo="Carregando números…" />;

  // Seleção de rifa
  if (!rifa) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="ar-titulo-tela">Números</h2>
          <p className="text-sm ar-txt-3 mt-1">Métricas, vendas e pedidos por rifa.</p>
        </div>
        {rifas.length === 0 ? (
          <EstadoVazio
            icone={<span aria-hidden>📊</span>}
            titulo="Você ainda não tem rifas"
            descricao="Crie uma campanha para acompanhar vendas e pedidos em tempo real."
            acao={
              <Botao variante="primario" onClick={aoCriar}>
                Criar minha primeira rifa
              </Botao>
            }
          />
        ) : (
          <>
            <p className="ar-rotulo">Escolha uma rifa</p>
            <div className="ar-lista ar-cartao ar-cartao--compacto !py-1">
              {rifas.map((r) => {
                const s = statsDe(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => aoSelecionar(r.id)}
                    className="ar-linha ar-linha--clicavel w-full text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium ar-txt-1 truncate">{r.titulo}</p>
                      <p className="text-xs ar-txt-3 mt-0.5">
                        {seloDoStatus(r.status).rotulo} · <span className="ar-num">{s.vendidos}/{r.total_numeros}</span> vendidos
                      </p>
                    </div>
                    <span className="text-sm shrink-0" style={{ color: "var(--ar-roxo-alto)" }}>Ver ›</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  const stats = statsDe(rifa.id);
  const progresso = (stats.vendidos / Math.max(1, rifa.total_numeros)) * 100;
  const pagos = pedidosDaRifa.filter((p) => p.status === "pago");
  const mediaPorPedido = pagos.length > 0 ? stats.arrecadadoCentavos / pagos.length : 0;
  const maiorDia = Math.max(...vendasPorDia.map((d) => d.valor), 1);
  const recentes = pedidosDaRifa.slice(0, 8);
  const selo = seloDoStatus(rifa.status);
  const totalSemana = vendasPorDia.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="space-y-6">
      {/* Seletor de rifa em chips roláveis */}
      <div className="ar-scroll-x -mx-4 px-4">
        {rifas.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => aoSelecionar(r.id)}
            className={`ar-chip max-w-[200px] ${r.id === rifa.id ? "ar-chip--ativo" : ""}`}
          >
            <span className="truncate">{r.titulo}</span>
          </button>
        ))}
      </div>

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ar-titulo-tela flex items-center gap-2 flex-wrap">
            <span className="truncate">{rifa.titulo}</span>
            <Selo variante={selo.variante} ponto>
              {selo.rotulo}
            </Selo>
          </h2>
          <p className="text-sm ar-txt-3 mt-1">
            Sorteio previsto: <span className="ar-txt-1 font-medium">{fmtData(rifa.data_sorteio_prevista)}</span>
          </p>
        </div>
        <Botao variante="secundario" tamanho="sm" onClick={() => aoAbrir(rifa)} className="sm:shrink-0">
          Gerenciar rifa ›
        </Botao>
      </div>

      {/* Métricas */}
      <div className="ar-grid-metricas">
        <CartaoMetrica rotulo="Vendidos" valor={String(stats.vendidos)} sub={`de ${rifa.total_numeros}`} icone="🎟️" />
        <CartaoMetrica rotulo="Caixa" valor={fmtBRL(stats.arrecadadoCentavos)} sub={`${fmtBRL(mediaPorPedido)} por pedido`} icone="💰" cor="trevo" />
        <CartaoMetrica rotulo="Progresso" valor={`${progresso.toFixed(1)}%`} sub={`${Math.max(0, rifa.total_numeros - stats.vendidos)} restantes`} icone="📈" cor="emerald" />
        <CartaoMetrica rotulo="Reservas vivas" valor={String(stats.reservados)} sub="aguardando pagamento" icone="⏳" cor="amber" />
      </div>

      {/* Progresso */}
      <div className="ar-cartao">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h3 className="ar-titulo-secao">Progresso de vendas</h3>
          <span className="text-sm ar-txt-3 ar-num shrink-0">
            {stats.vendidos}/{rifa.total_numeros}
          </span>
        </div>
        <BarraProgresso valor={stats.vendidos} maximo={rifa.total_numeros} altura="h-2.5" />
      </div>

      {/* Vendas 7 dias */}
      <div className="ar-cartao">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="ar-titulo-secao">Últimos {DIAS} dias</h3>
            <p className="text-xs ar-txt-3 mt-0.5">vendas pagas por dia</p>
          </div>
          <span className="ar-chip-num">
            <span className="ar-chip-num__rotulo">semana</span>
            <span className="ar-chip-num__valor">{fmtBRL(totalSemana)}</span>
          </span>
        </div>
        <GraficoVendas dias={vendasPorDia} maior={maiorDia} />
        <div className="grid mt-2" style={{ gridTemplateColumns: `repeat(${DIAS}, 1fr)`, gap: 3 }}>
          {vendasPorDia.map((dia, i) => (
            <div key={i} className="text-center min-w-0" title={`${dia.rotulo}: ${fmtBRL(dia.valor)}`}>
              <p className="text-[10px] ar-txt-4 capitalize truncate">{dia.rotulo.replace(".", "")}</p>
              {dia.valor > 0 && <p className="text-[10px] ar-num ar-txt-2 truncate">{fmtBRL(dia.valor)}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Pedidos recentes */}
      <div className="ar-cartao">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="ar-titulo-secao">Pedidos recentes</h3>
          <span className="text-sm ar-txt-3 shrink-0">{pedidosDaRifa.length} no total</span>
        </div>
        {recentes.length === 0 ? (
          <EstadoVazio
            icone={<span aria-hidden>🧾</span>}
            titulo="Nenhum pedido ainda"
            descricao="Compartilhe a rifa para começar a receber participações."
          />
        ) : (
          <div className="ar-lista">
            {recentes.map((p) => {
              const seloPedido = seloDoStatus(p.status);
              return (
                <div key={p.id} className="ar-linha">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium ar-txt-1 truncate">{p.nome}</p>
                    <p className="text-xs ar-txt-3">
                      {fmtDataHora(p.created_at)} · {p.qtd_numeros} {p.qtd_numeros === 1 ? "número" : "números"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold ar-num ar-txt-1">{fmtBRL(p.valor_centavos)}</span>
                    <Selo variante={seloPedido.variante}>{seloPedido.rotulo}</Selo>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
