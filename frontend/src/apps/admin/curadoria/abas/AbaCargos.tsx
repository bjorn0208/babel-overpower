// @ts-nocheck
// Aba 11 — Cargos
// Visão de curadoria dos cargos — não duplica o app cargos-admin.
// Banco real: cargos via useCargosResumo.
// Foco: inspecionar objetivo, tipologia, modelo LLM, canal, escopo de cada cargo.

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useCargosResumo } from "../dados/use-cargos-resumo";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TABS_CARGO = ["objetivo", "tipologia", "modelo", "canal"] as const;
type TabCargo = (typeof TABS_CARGO)[number];

function badgeTipologia(tip: string) {
  const mapa: Record<string, string> = {
    vendedor:    "var(--os-acento-1)",
    recepcao:    "var(--os-info)",
    suporte:     "oklch(0.72 0.18 145)",
    mentoria:    "var(--os-roxo)",
    cobranca:    "oklch(0.65 0.20 25)",
  };
  const cor = mapa[tip?.toLowerCase()] ?? "var(--os-txt3)";
  return (
    <span
      className="badge tiny mono"
      style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}44` }}
    >
      {tip}
    </span>
  );
}

function badgeEscopo(escopo: string) {
  const mapa: Record<string, string> = {
    global: "var(--os-acento-1)",
    nicho:  "var(--os-roxo)",
    tenant: "var(--os-info)",
  };
  const cor = mapa[escopo] ?? "var(--os-txt3)";
  return (
    <span
      className="badge tiny mono"
      style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}44` }}
    >
      {escopo}
    </span>
  );
}

// ─── painel de detalhe de um cargo ───────────────────────────────────────────

function PainelCargo({ cargo }: { cargo: ReturnType<typeof useCargosResumo>["cargos"][number] }) {
  const [tab, setTab] = useState<TabCargo>("objetivo");

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho do cargo */}
      <div className="px-4 py-3 border-b border-borda space-y-1">
        <div className="row gap-2 flex-wrap">
          <span className="small font-semibold">{cargo.nome}</span>
          {cargo.tipologia && badgeTipologia(cargo.tipologia)}
          {cargo.escopo && badgeEscopo(cargo.escopo)}
          {!cargo.ativo && (
            <span className="badge tiny" style={{ color: "var(--os-perigo)", border: "1px solid var(--os-perigo)44" }}>
              inativo
            </span>
          )}
        </div>
        {cargo.canal_atuacao && (
          <div className="tiny muted mono">canal: {cargo.canal_atuacao}</div>
        )}
      </div>

      {/* tabs */}
      <div className="flex border-b border-borda px-4 shrink-0">
        {TABS_CARGO.map((t) => (
          <button
            key={t}
            className="px-3 py-2 text-xs border-b-2 transition-colors -mb-px"
            style={
              tab === t
                ? { borderColor: "var(--os-acento-1)", color: "var(--os-acento-1)" }
                : { borderColor: "transparent", color: "var(--os-txt3)" }
            }
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* conteúdo da tab */}
      <div className="p-4 overflow-auto flex-1 space-y-3">
        {tab === "objetivo" && (
          <>
            <div>
              <div className="tiny uppercase text-txt3 mb-1">Objetivo do cargo</div>
              <div className="os-card p-3 small text-txt whitespace-pre-wrap">
                {cargo.objetivo ?? (
                  <span className="muted">Sem objetivo definido.</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "ID", val: cargo.id },
                { label: "Tenant", val: cargo.tenant_id ?? "global" },
                { label: "Nicho", val: cargo.nicho_id ?? "—" },
                { label: "Ativo", val: cargo.ativo ? "sim" : "não" },
              ].map(({ label, val }) => (
                <div key={label} className="os-card p-2.5">
                  <div className="tiny text-txt3 uppercase mb-0.5">{label}</div>
                  <div className="small mono truncate">{val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "tipologia" && (
          <div className="space-y-2">
            <div className="os-card p-3">
              <div className="tiny uppercase text-txt3 mb-1">Tipologia</div>
              <div className="row gap-2">
                {cargo.tipologia ? badgeTipologia(cargo.tipologia) : <span className="muted small">—</span>}
              </div>
            </div>
            <div className="os-card p-3">
              <div className="tiny uppercase text-txt3 mb-1">Escopo</div>
              <div className="row gap-2">
                {cargo.escopo ? badgeEscopo(cargo.escopo) : <span className="muted small">—</span>}
              </div>
            </div>
            <div
              className="rounded-lg px-4 py-3 small"
              style={{
                background: "oklch(0.55 0.14 250 / 0.08)",
                border: "1px solid oklch(0.55 0.14 250 / 0.20)",
                color: "oklch(0.75 0.08 250)",
              }}
            >
              <Icon name="info" size={13} className="inline mr-1.5" />
              Edição completa de diretrizes e exemplos disponível no app{" "}
              <span className="mono">cargos-admin</span>.
            </div>
          </div>
        )}

        {tab === "modelo" && (
          <div className="space-y-2">
            <div className="os-card p-3">
              <div className="tiny uppercase text-txt3 mb-1">Modelo LLM padrão</div>
              <div className="mono small" style={{ color: "var(--os-acento-1)" }}>
                {cargo.modelo_llm_padrao ?? (
                  <span className="muted">herda do tenant / global</span>
                )}
              </div>
            </div>
            <div
              className="rounded-lg px-4 py-3 small"
              style={{
                background: "oklch(0.70 0.16 85 / 0.08)",
                border: "1px solid oklch(0.70 0.16 85 / 0.25)",
                color: "oklch(0.85 0.10 85)",
              }}
            >
              <Icon name="warning" size={13} className="inline mr-1.5" />
              Configuração detalhada de LLM por chamada está na aba{" "}
              <strong>Chamadas LLM</strong> (C1).
            </div>
          </div>
        )}

        {tab === "canal" && (
          <div className="space-y-2">
            <div className="os-card p-3">
              <div className="tiny uppercase text-txt3 mb-1">Canal de atuação</div>
              <div className="small font-medium">
                {cargo.canal_atuacao ?? <span className="muted">—</span>}
              </div>
            </div>
            <div className="os-card p-3">
              <div className="tiny uppercase text-txt3 mb-2">Tools vinculadas</div>
              <div className="muted small">
                Ver aba <strong>Tools</strong> para a matriz cargo × tool.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaCargos() {
  const tenant = useTenantImpersonado();
  const tenantId = tenant.id === TENANT_UNIVERSO.id ? null : tenant.id;

  const { cargos, status } = useCargosResumo(tenantId);
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const cargosFiltrados = busca.trim()
    ? cargos.filter(
        (c) =>
          c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
          c.tipologia?.toLowerCase().includes(busca.toLowerCase())
      )
    : cargos;

  const cargoSel = cargos.find((c) => c.id === sel) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Cargos</div>
          <div className="small muted mt-0.5">
            Visão de curadoria dos cargos — objetivo, modelo, canal, tipologia.
            Edição completa em <span className="mono">cargos-admin</span>.
          </div>
        </div>
        <div className="row gap-2 shrink-0">
          {status === "ok" && (
            <span className="badge badge-neutral tiny mono">{cargos.length} cargos</span>
          )}
        </div>
      </div>

      {/* corpo */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* sidebar de lista */}
        <div
          className="flex flex-col border-r border-borda overflow-hidden"
          style={{ width: cargoSel ? 240 : "100%" }}
        >
          {/* busca */}
          <div className="p-3 border-b border-borda shrink-0">
            <div className="row gap-1.5 os-card px-2 py-1.5 rounded-lg">
              <Icon name="search" size={12} />
              <input
                className="bg-transparent text-xs outline-none flex-1"
                placeholder="buscar cargo…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          {status === "carregando" && (
            <div className="flex-1 flex items-center justify-center muted small">
              Carregando cargos…
            </div>
          )}

          {status === "erro" && (
            <div className="flex-1 flex items-center justify-center small" style={{ color: "var(--os-perigo)" }}>
              Erro ao carregar.
            </div>
          )}

          {(status === "ok" || status === "ocioso") && (
            <div className="overflow-auto flex-1">
              {cargosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 muted p-4">
                  <Icon name="users" size={20} />
                  <span className="small">
                    {busca ? "Nenhum cargo encontrado" : "Selecione um tenant"}
                  </span>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--os-borda)" }}>
                  {cargosFiltrados.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-4 py-2.5 transition-colors hover:bg-painel2"
                      style={
                        sel === c.id
                          ? { background: "var(--os-acento-1-soft)" }
                          : {}
                      }
                      onClick={() => setSel(sel === c.id ? null : c.id)}
                    >
                      <div className="row gap-2">
                        <span className="small font-medium truncate flex-1">{c.nome}</span>
                        {!c.ativo && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: "var(--os-perigo)" }}
                            title="inativo"
                          />
                        )}
                      </div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {c.tipologia && badgeTipologia(c.tipologia)}
                        {c.escopo && badgeEscopo(c.escopo)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* painel de detalhe */}
        {cargoSel && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-2 border-b border-borda row">
              <span className="tiny muted">cargo selecionado</span>
              <button
                onClick={() => setSel(null)}
                className="muted hover:text-txt p-1"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <PainelCargo cargo={cargoSel} />
            </div>
          </div>
        )}

        {/* estado vazio quando não tem cargo selecionado e tem espaço */}
        {!cargoSel && (status === "ok" || status === "ocioso") && cargos.length > 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 muted">
            <Icon name="users" size={28} />
            <span className="small">Selecione um cargo para inspecionar</span>
          </div>
        )}
      </div>
    </div>
  );
}
