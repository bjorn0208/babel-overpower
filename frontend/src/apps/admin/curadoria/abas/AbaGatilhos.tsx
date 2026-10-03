// @ts-nocheck
// Aba 9 — Gatilhos
// Semânticos (blocos_gatilho) e temporais (acoes_agendadas).
// Banco real: blocos_gatilho via useBlocosGaveta + acoes_agendadas via useAcoesAgendadas.

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useBlocosGaveta } from "../dados/use-blocos-gaveta";
import { useAcoesAgendadas } from "../dados/use-acoes-agendadas";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── badges helpers ───────────────────────────────────────────────────────────

function BadgeEscopo({ escopo }: { escopo: string }) {
  const cor =
    escopo === "global"
      ? "var(--os-acento-1)"
      : escopo === "nicho"
      ? "var(--os-roxo)"
      : "var(--os-info)";
  return (
    <span
      className="badge tiny mono"
      style={{
        background: `${cor}22`,
        color: cor,
        border: `1px solid ${cor}44`,
      }}
    >
      {escopo}
    </span>
  );
}

function BadgeEmbedding({ status }: { status: string }) {
  const ok = status === "ok" || status === "sincronizado";
  return (
    <span
      className="badge tiny mono"
      style={{
        background: ok ? "oklch(0.72 0.18 145 / 0.15)" : "oklch(0.70 0.16 85 / 0.15)",
        color: ok ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.16 85)",
        border: `1px solid ${ok ? "oklch(0.72 0.18 145 / 0.3)" : "oklch(0.70 0.16 85 / 0.3)"}`,
      }}
    >
      {ok ? "embedding ok" : status ?? "pendente"}
    </span>
  );
}

function BadgeStatusAcao({ status }: { status: string }) {
  const enviado = status === "enviado" || status === "executado";
  return (
    <span
      className="badge tiny mono"
      style={{
        background: enviado ? "oklch(0.72 0.18 145 / 0.15)" : "oklch(0.55 0.14 250 / 0.12)",
        color: enviado ? "oklch(0.72 0.18 145)" : "oklch(0.55 0.14 250)",
        border: `1px solid ${enviado ? "oklch(0.72 0.18 145 / 0.3)" : "oklch(0.55 0.14 250 / 0.3)"}`,
      }}
    >
      {status}
    </span>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaGatilhos() {
  const tenant = useTenantImpersonado();
  const tenantId = tenant.id === TENANT_UNIVERSO.id ? null : tenant.id;

  // gatilhos semânticos — usa escopo "todos" pra mostrar global+nicho+tenant
  const {
    blocos: gatilhos,
    status: statusGatilhos,
    toggleAtivo: toggleAtivoGatilho,
  } = useBlocosGaveta("blocos_gatilho", "todos", "");

  // fila temporal — filtrada pelo tenant se houver
  const {
    acoes,
    status: statusAcoes,
    cancelar,
  } = useAcoesAgendadas(tenantId, "todos");

  const [novoGatilho, setNovoGatilho] = useState(false);

  function toggleGatilho(id: string, ativo: boolean) {
    void toggleAtivoGatilho(id, ativo);
  }

  // próximas 24h
  const agora = new Date();
  const em24h = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
  const filaProxima = acoes.filter((a) => {
    const t = new Date(a.agendado_para);
    return t >= agora && t <= em24h;
  });

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Gatilhos</div>
          <div className="small muted mt-0.5">
            Semânticos (<span className="mono">blocos_gatilho</span>) e temporais (
            <span className="mono">acoes_agendadas</span>). Ativa/desativa, vê fila.
          </div>
        </div>
      </div>

      {/* conteúdo */}
      <div
        className="grid gap-4 p-5 overflow-auto flex-1"
        style={{ gridTemplateColumns: "1fr 380px" }}
      >
        {/* ── Gatilhos semânticos ── */}
        <div className="os-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-borda row">
            <div>
              <div className="small font-medium">Gatilhos semânticos</div>
              <div className="tiny muted mono">blocos_gatilho · acionados via embedding</div>
            </div>
            <button
              className="btn btn-primary btn-sm shrink-0"
              onClick={() => setNovoGatilho(true)}
            >
              <Icon name="plus" size={14} />
              novo gatilho
            </button>
          </div>

          {statusGatilhos === "carregando" && (
            <div className="flex-1 flex items-center justify-center muted small p-6">
              Carregando gatilhos…
            </div>
          )}

          {statusGatilhos === "erro" && (
            <div className="flex-1 flex items-center justify-center small p-6" style={{ color: "var(--os-perigo)" }}>
              Erro ao carregar gatilhos.
            </div>
          )}

          {(statusGatilhos === "ok" || statusGatilhos === "ocioso") && (
            <div className="divide-y overflow-auto flex-1" style={{ borderColor: "var(--os-borda)" }}>
              {gatilhos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 muted p-4">
                  <Icon name="zap" size={20} />
                  <span className="small">Nenhum gatilho cadastrado</span>
                </div>
              ) : (
                gatilhos.map((g) => (
                  <div key={g.id} className="px-4 py-3">
                    <div className="row gap-2 mb-1 flex-wrap">
                      {g.categoria && (
                        <span
                          className="badge tiny mono"
                          style={{
                            background: "oklch(0.55 0.14 300 / 0.12)",
                            color: "oklch(0.65 0.18 300)",
                            border: "1px solid oklch(0.55 0.14 300 / 0.25)",
                          }}
                        >
                          {g.categoria}
                        </span>
                      )}
                      <BadgeEscopo escopo={g.escopo ?? "tenant"} />
                      {g.embedding_status && (
                        <BadgeEmbedding status={g.embedding_status} />
                      )}
                      <div className="ml-auto shrink-0">
                        <button
                          className="w-8 h-4 rounded-full relative transition-colors"
                          style={{
                            background: g.ativo ? "var(--os-acento-1)" : "var(--os-borda)",
                          }}
                          onClick={() => toggleGatilho(g.id, !g.ativo)}
                          title={g.ativo ? "Desativar" : "Ativar"}
                        >
                          <span
                            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                            style={{ left: g.ativo ? "calc(100% - 14px)" : 2 }}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="small text-txt line-clamp-2">{g.conteudo}</div>
                    {g.tags && g.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {g.tags.slice(0, 4).map((tag: string) => (
                          <span key={tag} className="badge badge-neutral tiny">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Fila temporal ── */}
        <div className="os-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-borda row">
            <div>
              <div className="small font-medium">Fila temporal</div>
              <div className="tiny muted mono">acoes_agendadas · próximas 24h</div>
            </div>
            <button className="btn btn-ghost btn-sm">
              <Icon name="refresh" size={14} />
            </button>
          </div>

          {!tenantId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 muted p-6">
              <Icon name="clock" size={20} />
              <span className="small">Selecione um tenant para ver a fila</span>
            </div>
          )}

          {tenantId && statusAcoes === "carregando" && (
            <div className="flex-1 flex items-center justify-center muted small p-6">
              Carregando fila…
            </div>
          )}

          {tenantId && (statusAcoes === "ok" || statusAcoes === "ocioso") && (
            <div className="divide-y overflow-auto flex-1" style={{ borderColor: "var(--os-borda)" }}>
              {filaProxima.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 muted p-4">
                  <Icon name="check-circle" size={20} />
                  <span className="small">Nenhuma ação nas próximas 24h</span>
                </div>
              ) : (
                filaProxima.map((a) => {
                  const hora = new Date(a.agendado_para)
                    .toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
                    .replace(",", "");
                  return (
                    <div key={a.id} className="px-4 py-2.5">
                      <div className="row gap-2 mb-1 flex-wrap">
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
                        <BadgeStatusAcao status={a.status} />
                        <span className="ml-auto tiny mono muted">{hora}</span>
                      </div>
                      {a.lead_id && (
                        <div className="tiny muted mono mb-0.5 truncate">
                          → lead {a.lead_id.slice(0, 8)}…
                        </div>
                      )}
                      {a.mensagem && (
                        <div className="small text-txt line-clamp-2">{a.mensagem}</div>
                      )}
                      {a.status === "pendente" && (
                        <button
                          className="btn btn-ghost btn-xs mt-1"
                          onClick={() => cancelar(a.id)}
                          style={{ color: "var(--os-perigo)" }}
                        >
                          cancelar
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
