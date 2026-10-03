/**
 * Widgets de desktop com dados REAIS do tenant (Theus, 2026-09-18).
 *
 * Antes KPIs e Agenda eram números fixos de exemplo (234 conversas,
 * "Curadoria do Vendedor"…). Agora todo widget resolve o dono da conta com
 * `obterTenantId` (membro de equipe vê os dados do dono) e filtra por ele
 * explicitamente — admin também tem RLS aberta, então o filtro não é opcional.
 * Leads de conversa artificial (origem_lead = conversa_artificial) ficam fora.
 * Recarregam a cada 60s: é painel de olhar rápido, não tempo real.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { obterTenantId } from "@/data/tenant-atual";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const INTERVALO_MS = 60_000;

function inicioDoDia(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function inicioDoMes(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function dataIsoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Resolve o tenant e recarrega `carregar` a cada minuto. */
function useDadosTenant<T>(carregar: (tenantId: string) => Promise<T>) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState(false);
  const rodar = useCallback(async () => {
    try {
      const t = await obterTenantId();
      if (!t) return;
      setDados(await carregar(t));
      setErro(false);
    } catch (e) {
      console.warn("[widgets] falha ao carregar:", e);
      setErro(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void rodar();
    const id = setInterval(() => void rodar(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [rodar]);
  return { dados, erro };
}

function Cabecalho({ titulo, direita }: { titulo: string; direita?: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
      <div className="title-section">{titulo}</div>
      {direita}
    </div>
  );
}

function Estado({ erro }: { erro: boolean }) {
  return <div className="muted tiny" style={{ padding: "6px 0" }}>{erro ? "Não consegui carregar agora." : "Carregando…"}</div>;
}

function Sparkline({ dados, altura = 44 }: { dados: number[]; altura?: number }) {
  const max = Math.max(1, ...dados);
  const w = 100 / Math.max(1, dados.length - 1);
  const pts = dados.map((v, i) => `${(i * w).toFixed(2)},${(altura - (v / max) * (altura - 4) - 2).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" style={{ width: "100%", height: altura, display: "block" }} aria-hidden>
      <polyline points={`0,${altura} ${pts} 100,${altura}`} fill="var(--os-acento-1)" opacity={0.15} stroke="none" />
      <polyline points={pts} fill="none" stroke="var(--os-acento-1)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({ valor, rotulo, dica }: { valor: string | number; rotulo: string; dica?: string }) {
  return (
    <div className="flex-1" title={dica} style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8, minWidth: 0 }}>
      <div className="kpi-num os-aurora-text" style={{ fontSize: 18 }}>{valor}</div>
      <div className="muted tiny">{rotulo}</div>
    </div>
  );
}

// ─────────────────────────────── KPIs ───────────────────────────────

interface DadosKpis {
  falaramHoje: number;
  quentes: number;
  convertidosMes: number;
  novosMes: number;
  novosPorDia: number[];
}

async function carregarKpis(t: string): Promise<DadosKpis> {
  const hoje = inicioDoDia();
  const mes = inicioDoMes();
  const oitoDias = new Date(hoje.getTime() - 7 * 86_400_000);
  const base = () => sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", t).is("deleted_at", null).or("origem_lead.is.null,origem_lead.neq.conversa_artificial");

  // Sparkline por contagem (head), não lendo linhas: o PostgREST corta em 1000.
  const dias = Array.from({ length: 8 }, (_, i) => new Date(oitoDias.getFullYear(), oitoDias.getMonth(), oitoDias.getDate() + i));
  const [falaram, quentes, convertidos, novos, ...porDia] = await Promise.all([
    base().gte("ultima_resposta_lead_em", hoje.toISOString()),
    base().eq("temperatura_lead", "quente").is("desfecho", null),
    base().eq("desfecho", "convertido").gte("desfecho_em", mes.toISOString()),
    base().gte("created_at", mes.toISOString()),
    ...dias.map((d) => base().gte("created_at", d.toISOString())
      .lt("created_at", new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString())),
  ]);
  for (const r of [falaram, quentes, convertidos, novos, ...porDia]) if (r.error) throw r.error;
  const novosPorDia = porDia.map((r) => r.count ?? 0);
  return {
    falaramHoje: falaram.count ?? 0,
    quentes: quentes.count ?? 0,
    convertidosMes: convertidos.count ?? 0,
    novosMes: novos.count ?? 0,
    novosPorDia,
  };
}

export function WidgetKpisReal() {
  const { dados, erro } = useDadosTenant(carregarKpis);
  const conv = dados && dados.novosMes > 0 ? Math.round((dados.convertidosMes / dados.novosMes) * 100) : 0;
  return (
    <>
      <Cabecalho titulo="KPIs · agora" direita={
        <span className="badge badge-success" style={{ fontSize: 9 }}><span className="dot dot-on pulse"></span> ao vivo</span>
      } />
      {!dados ? <Estado erro={erro} /> : (
        <>
          <div className="row gap-2" style={{ marginBottom: 10 }}>
            <Kpi valor={dados.falaramHoje} rotulo="falaram hoje" dica="Leads que mandaram mensagem hoje" />
            <Kpi valor={dados.quentes} rotulo="leads 🔥" dica="Leads quentes ainda sem desfecho" />
            <Kpi valor={`${conv}%`} rotulo="conv. mês" dica={`${dados.convertidosMes} convertidos / ${dados.novosMes} leads novos no mês`} />
          </div>
          <div className="muted tiny" style={{ marginBottom: 4 }}>Leads novos · 8 dias</div>
          <Sparkline dados={dados.novosPorDia} />
        </>
      )}
    </>
  );
}

// ───────────────────────────── Finanças ─────────────────────────────

interface DadosFinancas {
  entradas: number;
  saidas: number;
  proximaConta: { titulo: string; valor: number; vencimento: string } | null;
  contasAbertas: number;
}

async function carregarFinancas(t: string): Promise<DadosFinancas> {
  const mes = inicioDoMes();
  const proximoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  // PostgREST corta em 1000 linhas: pagina, senão o saldo do mês sai errado.
  const movs: { tipo: string; valor: number }[] = [];
  for (let pagina = 0; pagina < 30; pagina++) {
    const de = pagina * 1000;
    const { data, error } = await sb.from("movimentos_financeiros").select("tipo, valor")
      .eq("owner_id", t).is("deleted_at", null)
      .gte("data_movimento", dataIsoLocal(mes)).lt("data_movimento", dataIsoLocal(proximoMes))
      .order("id").range(de, de + 999);
    if (error) throw error;
    movs.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const contas = await sb.from("contas_a_pagar").select("titulo, valor_total, parcelas_total, proximo_vencimento")
    .eq("tenant_id", t).eq("status", "aberta").is("deleted_at", null)
    .order("proximo_vencimento", { ascending: true, nullsFirst: false });
  if (contas.error) throw contas.error;
  let entradas = 0, saidas = 0;
  for (const m of movs) {
    if (m.tipo === "entrada") entradas += Number(m.valor) || 0;
    else saidas += Number(m.valor) || 0;
  }
  const lista = (contas.data ?? []) as { titulo: string; valor_total: number; parcelas_total: number | null; proximo_vencimento: string | null }[];
  const p = lista.find((c) => c.proximo_vencimento);
  return {
    entradas,
    saidas,
    contasAbertas: lista.length,
    proximaConta: p ? {
      titulo: p.titulo,
      valor: Number(p.valor_total) / Math.max(1, p.parcelas_total ?? 1),
      vencimento: p.proximo_vencimento as string,
    } : null,
  };
}

export function WidgetFinancas({ onLaunch }: { onLaunch?: (slug: string) => void }) {
  const { dados, erro } = useDadosTenant(carregarFinancas);
  const mesNome = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const saldo = dados ? dados.entradas - dados.saidas : 0;
  return (
    <>
      <Cabecalho titulo={`Finanças · ${mesNome}`} direita={
        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => onLaunch?.("caixa")}>abrir</button>
      } />
      {!dados ? <Estado erro={erro} /> : (
        <>
          <div style={{ marginBottom: 10 }}>
            <div className="muted tiny">Saldo do mês</div>
            <div className="kpi-num" style={{ fontSize: 24, color: saldo >= 0 ? "oklch(0.78 0.16 155)" : "oklch(0.72 0.19 25)" }}>{brl(saldo)}</div>
          </div>
          <div className="row gap-2" style={{ marginBottom: 10 }}>
            <Kpi valor={brl(dados.entradas)} rotulo="entradas" />
            <Kpi valor={brl(dados.saidas)} rotulo="saídas" />
          </div>
          <div style={{ padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            {dados.proximaConta ? (
              <>
                <div className="muted tiny">Próxima conta · {new Date(`${dados.proximaConta.vencimento}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</div>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dados.proximaConta.titulo}</span>
                  <span className="small mono">{brl(dados.proximaConta.valor)}</span>
                </div>
                {dados.contasAbertas > 1 && <div className="muted tiny">+{dados.contasAbertas - 1} em aberto</div>}
              </>
            ) : <div className="muted tiny">Nenhuma conta a pagar em aberto.</div>}
          </div>
        </>
      )}
    </>
  );
}

// ────────────────────────────── Agenda ──────────────────────────────

interface ItemAgenda { id: string; titulo: string; quando: Date; cor: string }

async function carregarAgenda(t: string): Promise<ItemAgenda[]> {
  const agora = new Date().toISOString();
  const [evs, comps] = await Promise.all([
    sb.from("eventos_agenda").select("id, titulo, inicio_em, cor, status").eq("tenant_id", t).is("deleted_at", null)
      .or("status.is.null,status.neq.concluido").gte("inicio_em", agora).order("inicio_em").limit(4),
    sb.from("compromissos").select("id, descricao, scheduled_at").eq("tenant_id", t).eq("status", "pendente")
      .gte("scheduled_at", agora).order("scheduled_at").limit(4),
  ]);
  if (evs.error) throw evs.error;
  if (comps.error) throw comps.error;
  const itens: ItemAgenda[] = [
    ...((evs.data ?? []) as { id: string; titulo: string; inicio_em: string; cor: string | null }[]).map((e) => ({
      id: e.id, titulo: e.titulo, quando: new Date(e.inicio_em), cor: e.cor || "oklch(0.65 0.22 280)",
    })),
    ...((comps.data ?? []) as { id: string; descricao: string | null; scheduled_at: string }[]).map((c) => ({
      id: c.id, titulo: c.descricao || "Compromisso com lead", quando: new Date(c.scheduled_at), cor: "oklch(0.72 0.18 145)",
    })),
  ];
  return itens.sort((a, b) => a.quando.getTime() - b.quando.getTime()).slice(0, 4);
}

function rotuloQuando(d: Date): string {
  const hoje = inicioDoDia();
  const dia = Math.round((inicioDoDia(d).getTime() - hoje.getTime()) / 86_400_000);
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dia === 0) return hm;
  if (dia === 1) return `amanhã ${hm}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hm}`;
}

export function WidgetAgendaReal({ onLaunch }: { onLaunch?: (slug: string) => void }) {
  const { dados, erro } = useDadosTenant(carregarAgenda);
  return (
    <>
      <Cabecalho titulo="Próximos compromissos" direita={
        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => onLaunch?.("agenda")}>abrir</button>
      } />
      {!dados ? <Estado erro={erro} /> : dados.length === 0 ? (
        <div className="muted tiny" style={{ padding: "6px 0" }}>Nada marcado daqui pra frente.</div>
      ) : (
        <div className="col gap-2">
          {dados.map((e) => (
            <div key={e.id} className="row gap-2" style={{ padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, borderLeft: `3px solid ${e.cor}` }}>
              <span className="mono tiny" style={{ color: e.cor, fontWeight: 600, minWidth: 48 }}>{rotuloQuando(e.quando)}</span>
              <span className="small" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titulo}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ───────────────────────────── Maquete 2D ────────────────────────────

const PalcoMaquete = lazy(() => import("@/apps/user/maquete-rpg/canvas/PalcoMaquete").then((m) => ({ default: m.PalcoMaquete })));

export function WidgetMaquete({ onLaunch }: { onLaunch?: (slug: string) => void }) {
  // Clique no boneco abre a conversa, igual ao app (mesmo payload global).
  const abrirConversa = useCallback((conversaId: string) => {
    const slug = `conversa-isolada__${conversaId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
    const w = window as unknown as { __PAYLOADS_CONVERSAS?: Record<string, { id: string }> };
    w.__PAYLOADS_CONVERSAS = { ...(w.__PAYLOADS_CONVERSAS ?? {}), [slug]: { id: conversaId } };
    onLaunch?.(slug);
  }, [onLaunch]);
  return (
    <>
      <Cabecalho titulo="Maquete" direita={
        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => onLaunch?.("maquete-rpg")}>abrir</button>
      } />
      {/* widget-interativo: arrastar aqui move a câmera da maquete, não o widget */}
      <div className="widget-interativo" style={{ position: "relative", height: 230, borderRadius: 8, overflow: "hidden", background: "#6b5a47" }}>
        <Suspense fallback={<div className="muted tiny" style={{ padding: 10 }}>Montando a maquete…</div>}>
          <PalcoMaquete onAbrirConversa={abrirConversa} onExpandir={() => onLaunch?.("maquete-rpg")} />
        </Suspense>
      </div>
    </>
  );
}

// ───────────────────────────── Previews ──────────────────────────────

export function PreviewFinancas() {
  return (
    <div style={{ color: "white", width: "100%" }}>
      <div className="tiny" style={{ opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Saldo do mês</div>
      <div className="kpi-num" style={{ fontSize: 22 }}>R$ ▲▼</div>
      <div className="tiny" style={{ opacity: 0.8, marginTop: 4 }}>entradas · saídas · próxima conta</div>
    </div>
  );
}

export function PreviewMaquete() {
  return (
    <div style={{ color: "white", width: "100%", textAlign: "center" }}>
      <div style={{ fontSize: 30, lineHeight: 1 }}>🏢</div>
      <div className="tiny" style={{ opacity: 0.8, marginTop: 6 }}>Escritório 2D com a equipe e os leads ao vivo</div>
    </div>
  );
}
