// Aba 13 — Crons
// Jobs cron do sistema. Banco real via RPC listar_jobs_com_historico.
// Toggle via RPC togglar_job (cron.schedule/unschedule real).

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useJobsCron } from "../dados/use-jobs-cron";
import type { JobCron } from "../dados/tipos";
import {
  badgeCategoria,
  badgeStatusExec,
  formatarUltimaExec,
  HeatmapExecucoes,
} from "../componentes/cron-execucoes";

// ─── constantes ───────────────────────────────────────────────────────────────

const CATEGORIAS = ["todos", "rag", "motor", "campanha", "memoria", "manutencao", "financeiro"];

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaCrons() {
  const { jobs, status, toggleAtivo, refetch } = useJobsCron();
  const [categoria, setCategoria] = useState("todos");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const jobsFiltrados = jobs.filter((j) => {
    const passaCategoria = categoria === "todos" || j.categoria === categoria;
    const passaBusca =
      !busca.trim() ||
      j.chave.toLowerCase().includes(busca.toLowerCase()) ||
      j.edge_function?.toLowerCase().includes(busca.toLowerCase());
    return passaCategoria && passaBusca;
  });

  const jobSel = jobs.find((j) => j.chave === sel) ?? null;
  const totalAtivos = jobs.filter((j) => j.ativo).length;
  const totalFalhas = jobs.reduce((acc, j) => acc + (j.falhas_30d ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Crons</div>
          <div className="small muted mt-0.5">
            Jobs agendados do sistema.{" "}
            <span className="mono">agendamentos_config</span> ·{" "}
            <span className="mono">pg_cron</span> em UTC.
          </div>
        </div>
        <div className="row gap-2 shrink-0">
          {status === "ok" && (
            <>
              <span className="badge badge-neutral tiny mono">{totalAtivos}/{jobs.length} ativos</span>
              {totalFalhas > 0 && (
                <span
                  className="badge tiny mono"
                  style={{
                    background: "oklch(0.65 0.20 25 / 0.12)",
                    color: "oklch(0.65 0.20 25)",
                    border: "1px solid oklch(0.65 0.20 25 / 0.3)",
                  }}
                >
                  {totalFalhas} falhas/7d
                </span>
              )}
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={refetch}>
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* filtros */}
      <div className="px-4 py-2 border-b border-borda flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              className="px-2 py-1 rounded text-xs transition-colors"
              style={
                categoria === c
                  ? { background: "var(--os-acento-1-soft)", color: "var(--os-acento-1)" }
                  : { color: "var(--os-txt3)" }
              }
              onClick={() => setCategoria(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 os-card px-2 py-1 rounded-lg ml-auto">
          <Icon name="search" size={12} />
          <input
            className="bg-transparent text-xs outline-none w-40"
            placeholder="buscar cron…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {status === "carregando" && (
        <div className="flex-1 flex items-center justify-center muted small">
          Carregando jobs…
        </div>
      )}

      {status === "erro" && (
        <div className="flex-1 flex items-center justify-center small" style={{ color: "var(--os-perigo)" }}>
          Erro ao carregar jobs.
        </div>
      )}

      {status === "ok" && (
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* tabela */}
          <div className={`${jobSel ? "w-3/5 border-r border-borda" : "flex-1"} overflow-auto`}>
            {jobsFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 muted">
                <Icon name="clock" size={24} />
                <span className="small">Nenhum job encontrado</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0" style={{ background: "var(--os-painel)" }}>
                  <tr className="border-b border-borda">
                    {["job", "schedule", "categoria", "última exec", "falhas/7d", "duração", "ativo"].map((col) => (
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
                  {jobsFiltrados.map((j) => (
                    <tr
                      key={j.chave}
                      className={`border-b border-borda/40 cursor-pointer transition-colors ${
                        sel === j.chave ? "bg-painel2" : "hover:bg-painel2/50"
                      }`}
                      onClick={() => setSel(sel === j.chave ? null : j.chave)}
                    >
                      <td className="py-2 px-3 first:pl-4">
                        <div className="mono small font-medium" style={{ color: "var(--os-acento-1)" }}>
                          {j.chave}
                        </div>
                        {j.edge_function && (
                          <div className="tiny muted mono">{j.edge_function}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 mono tiny tabular-nums">{j.schedule}</td>
                      <td className="py-2 px-3">
                        {j.categoria && badgeCategoria(j.categoria)}
                      </td>
                      <td className="py-2 px-3">
                        <div className="tiny mono muted">{formatarUltimaExec(j.ultima_exec ?? null)}</div>
                        {j.status_ultima && badgeStatusExec(j.status_ultima)}
                      </td>
                      <td className="py-2 px-3 mono tiny tabular-nums text-center">
                        {j.falhas_30d != null ? (
                          <span style={{ color: j.falhas_30d > 0 ? "oklch(0.65 0.20 25)" : "var(--os-txt3)" }}>
                            {j.falhas_30d}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 mono tiny tabular-nums">
                        {j.duracao_media_ms != null ? `${j.duracao_media_ms}ms` : <span className="muted">—</span>}
                      </td>
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="w-8 h-4 rounded-full relative transition-colors"
                          style={{ background: j.ativo ? "var(--os-acento-1)" : "var(--os-borda)" }}
                          onClick={() => toggleAtivo(j.chave, !j.ativo)}
                          title={j.ativo ? "Desativar" : "Ativar"}
                        >
                          <span
                            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                            style={{ left: j.ativo ? "calc(100% - 14px)" : 2 }}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* detalhe lateral */}
          {jobSel && (
            <div className="w-2/5 overflow-auto flex flex-col">
              <div className="px-4 py-3 border-b border-borda row">
                <span className="mono small font-medium" style={{ color: "var(--os-acento-1)" }}>
                  {jobSel.chave}
                </span>
                <button onClick={() => setSel(null)} className="muted hover:text-txt p-1">
                  <Icon name="x" size={14} />
                </button>
              </div>

              <div className="p-4 space-y-4 flex-1 overflow-auto">
                {/* meta */}
                <div className="os-card p-3 space-y-1.5">
                  {[
                    { label: "Schedule",       val: jobSel.schedule },
                    { label: "Edge function",  val: jobSel.edge_function ?? "—" },
                    { label: "Categoria",      val: jobSel.categoria ?? "—" },
                    { label: "Última exec",    val: formatarUltimaExec(jobSel.ultima_exec ?? null) },
                    { label: "Status última",  val: jobSel.status_ultima ?? "—" },
                    { label: "Falhas 7d",      val: String(jobSel.falhas_30d ?? 0) },
                    { label: "Duração média",  val: jobSel.duracao_media_ms != null ? `${jobSel.duracao_media_ms}ms` : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="row gap-2 tiny">
                      <span className="muted w-28 shrink-0">{label}</span>
                      <span className="mono truncate">{val}</span>
                    </div>
                  ))}
                </div>

                {/* heatmap */}
                <div>
                  <div className="tiny uppercase text-txt3 mb-2">
                    Execuções últimos 7d (24h por coluna)
                  </div>
                  <HeatmapExecucoes job={jobSel} />
                  <div className="flex gap-3 mt-2 tiny muted">
                    <span className="row gap-1">
                      <span className="w-2 h-2 rounded-sm" style={{ background: "oklch(0.72 0.18 145)" }} />
                      ok
                    </span>
                    <span className="row gap-1">
                      <span className="w-2 h-2 rounded-sm" style={{ background: "oklch(0.65 0.20 25)" }} />
                      falha
                    </span>
                    <span className="row gap-1">
                      <span className="w-2 h-2 rounded-sm" style={{ background: "oklch(0.32 0.01 240)" }} />
                      sem dados
                    </span>
                  </div>
                </div>

                {/* ação */}
                <div className="row gap-2">
                  <button
                    className="btn btn-sm flex-1"
                    style={{
                      background: jobSel.ativo ? "var(--os-perigo)" : "var(--os-acento-1)",
                      color: "#fff",
                      border: "none",
                    }}
                    onClick={() => {
                      toggleAtivo(jobSel.chave, !jobSel.ativo);
                      setSel(null);
                    }}
                  >
                    {jobSel.ativo ? "desativar job" : "ativar job"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
