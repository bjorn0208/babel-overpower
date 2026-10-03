// @ts-nocheck
// Aba 10 — Acompanhamentos
// Fila de follow-ups agendados. Banco real: acoes_agendadas via useAcoesAgendadas.

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useAcoesAgendadas } from "../dados/use-acoes-agendadas";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TIPOS_FILTRO = [
  { value: "todos", label: "todos" },
  { value: "followup", label: "followup" },
  { value: "cobranca", label: "cobrança" },
  { value: "lembrete", label: "lembrete" },
  { value: "reengajamento", label: "reengajamento" },
];

function badgeStatus(status: string) {
  const mapa: Record<string, { bg: string; cor: string }> = {
    pendente:   { bg: "oklch(0.55 0.14 250 / 0.10)", cor: "oklch(0.55 0.14 250)" },
    executado:  { bg: "oklch(0.72 0.18 145 / 0.12)", cor: "oklch(0.72 0.18 145)" },
    cancelado:  { bg: "oklch(0.65 0.20 25 / 0.12)",  cor: "oklch(0.65 0.20 25)" },
    adiado:     { bg: "oklch(0.70 0.16 85 / 0.12)",  cor: "oklch(0.70 0.16 85)" },
    enviado:    { bg: "oklch(0.72 0.18 145 / 0.12)", cor: "oklch(0.72 0.18 145)" },
  };
  const s = mapa[status] ?? { bg: "var(--os-painel2)", cor: "var(--os-txt3)" };
  return (
    <span
      className="badge tiny mono"
      style={{ background: s.bg, color: s.cor, border: `1px solid ${s.cor}44` }}
    >
      {status}
    </span>
  );
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaAcompanhamentos() {
  const tenant = useTenantImpersonado();
  const tenantId = tenant.id === TENANT_UNIVERSO.id ? null : tenant.id;

  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const { acoes, status, cancelar, refetch } = useAcoesAgendadas(tenantId, tipoFiltro);

  // filtro local por busca no texto da mensagem
  const acoesFiltradas = busca.trim()
    ? acoes.filter(
        (a) =>
          a.mensagem?.toLowerCase().includes(busca.toLowerCase()) ||
          a.lead_id?.toLowerCase().includes(busca.toLowerCase())
      )
    : acoes;

  const acaoSel = acoes.find((a) => a.id === sel) ?? null;

  // contadores por status
  const contadores = acoes.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Acompanhamentos</div>
          <div className="small muted mt-0.5">
            Fila de follow-ups agendados.{" "}
            <span className="mono">acoes_agendadas</span> · ativados pelo motor ou manualmente.
          </div>
        </div>
        <div className="row gap-2 shrink-0">
          {status === "ok" && (
            <>
              {Object.entries(contadores).map(([s, n]) => (
                <span key={s} className="badge badge-neutral tiny mono">
                  {n} {s}
                </span>
              ))}
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={refetch}>
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* sem tenant */}
      {!tenantId && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 muted">
          <Icon name="clock" size={28} />
          <span className="small">Selecione um tenant para ver os acompanhamentos</span>
        </div>
      )}

      {tenantId && status === "carregando" && (
        <div className="flex-1 flex items-center justify-center muted small">
          Carregando fila…
        </div>
      )}

      {tenantId && status === "erro" && (
        <div className="flex-1 flex items-center justify-center small" style={{ color: "var(--os-perigo)" }}>
          Erro ao carregar acompanhamentos.
        </div>
      )}

      {tenantId && (status === "ok" || status === "ocioso") && (
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* lista */}
          <div className={`${acaoSel ? "w-3/5 border-r border-borda" : "flex-1"} flex flex-col overflow-hidden`}>
            {/* filtros */}
            <div className="px-4 py-2 border-b border-borda flex items-center gap-3 shrink-0">
              {/* tabs de tipo */}
              <div className="flex gap-1">
                {TIPOS_FILTRO.map((t) => (
                  <button
                    key={t.value}
                    className="px-2 py-1 rounded text-xs transition-colors"
                    style={
                      tipoFiltro === t.value
                        ? { background: "var(--os-acento-1-soft)", color: "var(--os-acento-1)" }
                        : { color: "var(--os-txt3)" }
                    }
                    onClick={() => setTipoFiltro(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* busca */}
              <div className="flex items-center gap-1.5 os-card px-2 py-1 rounded-lg ml-auto">
                <Icon name="search" size={12} />
                <input
                  className="bg-transparent text-xs outline-none w-36"
                  placeholder="buscar mensagem…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            {/* tabela */}
            <div className="overflow-auto flex-1">
              {acoesFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 muted">
                  <Icon name="inbox" size={24} />
                  <span className="small">Nenhum acompanhamento encontrado</span>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: "var(--os-painel)" }}>
                    <tr className="border-b border-borda">
                      {["agendado para", "tipo", "status", "mensagem", "lead", ""].map((col) => (
                        <th
                          key={col}
                          className="text-left py-2 px-3 tiny uppercase text-txt3 font-medium first:pl-4"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {acoesFiltradas.map((a) => (
                      <tr
                        key={a.id}
                        className={`border-b border-borda/40 cursor-pointer transition-colors ${
                          sel === a.id ? "bg-painel2" : "hover:bg-painel2/50"
                        }`}
                        onClick={() => setSel(sel === a.id ? null : a.id)}
                      >
                        <td className="py-2 px-3 first:pl-4 mono tiny tabular-nums whitespace-nowrap">
                          {formatarHora(a.agendado_para)}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="badge tiny mono"
                            style={{
                              background: "oklch(0.55 0.14 250 / 0.10)",
                              color: "oklch(0.55 0.14 250)",
                              border: "1px solid oklch(0.55 0.14 250 / 0.25)",
                            }}
                          >
                            {a.tipo}
                          </span>
                        </td>
                        <td className="py-2 px-3">{badgeStatus(a.status)}</td>
                        <td className="py-2 px-3 max-w-xs">
                          <span className="small line-clamp-1 text-txt2">
                            {a.mensagem ?? "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3 mono tiny muted">
                          {a.lead_id ? `${a.lead_id.slice(0, 8)}…` : "—"}
                        </td>
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          {a.status === "pendente" && (
                            <button
                              className="btn btn-ghost btn-xs"
                              style={{ color: "var(--os-perigo)" }}
                              onClick={() => cancelar(a.id)}
                              title="Cancelar"
                            >
                              <Icon name="x" size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* detalhe lateral */}
          {acaoSel && (
            <div className="w-2/5 overflow-auto flex flex-col">
              <div className="px-4 py-3 border-b border-borda row">
                <span className="small font-medium">Detalhe</span>
                <button onClick={() => setSel(null)} className="muted hover:text-txt p-1">
                  <Icon name="x" size={14} />
                </button>
              </div>

              <div className="p-4 space-y-3 flex-1 overflow-auto">
                {/* meta */}
                <div className="os-card p-3 space-y-1.5">
                  {[
                    { label: "ID", val: acaoSel.id },
                    { label: "Tipo", val: acaoSel.tipo },
                    { label: "Status", val: acaoSel.status },
                    { label: "Agendado para", val: formatarHora(acaoSel.agendado_para) },
                    { label: "Lead", val: acaoSel.lead_id ?? "—" },
                    { label: "Criado em", val: acaoSel.created_at ? formatarHora(acaoSel.created_at) : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="row gap-2 tiny">
                      <span className="muted w-28 shrink-0">{label}</span>
                      <span className="mono truncate">{val}</span>
                    </div>
                  ))}
                </div>

                {/* mensagem */}
                <div>
                  <div className="tiny uppercase text-txt3 mb-1">Mensagem</div>
                  <div className="os-card p-3 small text-txt whitespace-pre-wrap">
                    {acaoSel.mensagem ?? "—"}
                  </div>
                </div>

                {/* payload completo */}
                {acaoSel.carga && (
                  <div>
                    <div className="tiny uppercase text-txt3 mb-1">Carga (jsonb)</div>
                    <pre className="os-card p-3 tiny mono text-txt3 whitespace-pre-wrap overflow-auto max-h-48">
                      {JSON.stringify(acaoSel.carga, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* ações */}
              {acaoSel.status === "pendente" && (
                <div className="px-4 py-3 border-t border-borda row gap-2 shrink-0">
                  <button
                    className="btn btn-sm"
                    style={{
                      background: "var(--os-perigo)",
                      color: "#fff",
                      border: "none",
                    }}
                    onClick={() => {
                      cancelar(acaoSel.id);
                      setSel(null);
                    }}
                  >
                    <Icon name="x" size={14} />
                    cancelar ação
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
