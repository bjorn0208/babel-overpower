// @ts-nocheck
// Aba 8 — Tools
// Ferramentas dinâmicas dos cargos.
// Banco real: ferramentas_dinamicas + cargo_ferramentas via useToolsCargos.

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useToolsCargos } from "../dados/use-tools-cargos";
import { useCargosResumo } from "../dados/use-cargos-resumo";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── tipos locais ────────────────────────────────────────────────────────────

interface FerramentaDinamica {
  id: string;
  nome: string;
  descricao?: string;
  schema_args?: string;
  ativo: boolean;
  tenant_id?: string | null;
  nicho_id?: string | null;
}

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaTools() {
  const tenant = useTenantImpersonado();
  const tenantId = tenant.id === TENANT_UNIVERSO.id ? null : tenant.id;

  const { ferramentas, vinculosCargo, status, toggleAtivoFerramenta } = useToolsCargos(tenantId);
  const { cargos } = useCargosResumo(tenantId);

  const [sel, setSel] = useState<FerramentaDinamica | null>(null);

  // cargos que têm acesso a uma tool
  function cargosComTool(toolId: string): string[] {
    return vinculosCargo
      .filter((v) => v.ferramenta_id === toolId)
      .map((v) => {
        const c = cargos.find((c) => c.id === v.cargo_id);
        return c?.nome ?? v.cargo_id;
      });
  }

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Tools</div>
          <div className="small muted mt-0.5">
            Ferramentas dinâmicas dos cargos. JSON Schema editável; mapeamento via{" "}
            <span className="mono">cargo_ferramentas</span>.
          </div>
        </div>
        <div className="row gap-2 shrink-0">
          {status === "ok" && (
            <span className="badge badge-neutral tiny mono">{ferramentas.length} tools</span>
          )}
          <button className="btn btn-primary btn-sm">
            <Icon name="plus" size={14} />
            nova tool
          </button>
        </div>
      </div>

      {/* sem tenant */}
      {!tenantId && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 muted">
          <Icon name="tool" size={28} />
          <span className="small">Selecione um tenant para ver as tools</span>
        </div>
      )}

      {tenantId && status === "carregando" && (
        <div className="flex-1 flex items-center justify-center muted small">
          Carregando tools…
        </div>
      )}

      {tenantId && status === "erro" && (
        <div className="flex-1 flex items-center justify-center small" style={{ color: "var(--os-perigo)" }}>
          Erro ao carregar tools.
        </div>
      )}

      {tenantId && status === "ok" && (
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* lista + matriz */}
          <div className={`${sel ? "w-3/5 border-r border-borda" : "flex-1"} overflow-auto p-5 space-y-5`}>
            {/* tabela de tools */}
            {ferramentas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 muted">
                <Icon name="tool" size={24} />
                <span className="small">Nenhuma tool cadastrada</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda">
                    {["tool", "descrição", "cargos", "ativo"].map((col) => (
                      <th
                        key={col}
                        className="text-left py-2 px-3 tiny uppercase text-txt3 font-medium first:pl-0"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ferramentas.map((t) => {
                    const nomesCargos = cargosComTool(t.id);
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-borda/40 hover:bg-painel2 cursor-pointer transition-colors"
                        onClick={() => setSel(t)}
                      >
                        <td className="py-2 px-3 first:pl-0 mono font-medium" style={{ color: "var(--os-acento-1)" }}>
                          {t.nome}
                        </td>
                        <td className="py-2 px-3 muted small">{t.descricao ?? "—"}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {nomesCargos.length === 0 ? (
                              <span className="muted tiny">nenhum</span>
                            ) : (
                              nomesCargos.map((c) => (
                                <span key={c} className="badge badge-neutral">{c}</span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="w-8 h-4 rounded-full relative transition-colors"
                            style={{
                              background: t.ativo ? "var(--os-acento-1)" : "var(--os-borda)",
                              cursor: "pointer",
                            }}
                            onClick={() => { void toggleAtivoFerramenta(t.id, !t.ativo); }}
                            title={t.ativo ? "Desativar" : "Ativar"}
                          >
                            <span
                              className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                              style={{ left: t.ativo ? "calc(100% - 14px)" : 2 }}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* matriz cargo × tool */}
            {cargos.length > 0 && ferramentas.length > 0 && (
              <div className="os-card p-4">
                <div className="tiny uppercase text-txt3 tracking-wide mb-3">
                  Matriz cargo × tool
                </div>
                <div className="overflow-x-auto">
                  <table className="tiny mono">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 text-left text-txt3">cargo \ tool</th>
                        {ferramentas.map((t) => (
                          <th
                            key={t.id}
                            className="px-2 py-1 text-txt3 text-center"
                            style={{ minWidth: 90 }}
                          >
                            {t.nome}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cargos.map((c) => (
                        <tr key={c.id} className="border-t border-borda/30">
                          <td className="px-2 py-1">{c.nome}</td>
                          {ferramentas.map((t) => {
                            const temAcesso = vinculosCargo.some(
                              (v) => v.cargo_id === c.id && v.ferramenta_id === t.id
                            );
                            return (
                              <td key={t.id} className="text-center">
                                {temAcesso ? (
                                  <span
                                    className="inline-flex w-4 h-4 rounded items-center justify-center"
                                    style={{ background: "var(--os-acento-1-soft)", color: "var(--os-acento-1)" }}
                                  >
                                    <Icon name="check" size={10} />
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex w-4 h-4 rounded"
                                    style={{ border: "1px solid var(--os-borda)" }}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* painel de edição */}
          {sel && (
            <div className="w-2/5 overflow-auto flex flex-col">
              <div className="px-4 py-3 border-b border-borda row">
                <span className="mono font-medium" style={{ color: "var(--os-acento-1)" }}>
                  {sel.nome}
                </span>
                <button onClick={() => setSel(null)} className="muted hover:text-txt p-1">
                  <Icon name="x" size={14} />
                </button>
              </div>

              <div className="p-4 space-y-3 flex-1 overflow-auto">
                <div>
                  <div className="tiny uppercase text-txt3 mb-1">Descrição</div>
                  <input
                    className="os-card w-full px-3 py-2 text-sm rounded-lg"
                    defaultValue={sel.descricao ?? ""}
                  />
                </div>

                <div>
                  <div className="tiny uppercase text-txt3 mb-1">JSON Schema dos argumentos</div>
                  <textarea
                    rows={7}
                    className="os-card w-full px-3 py-2 text-xs mono rounded-lg resize-none"
                    defaultValue={sel.schema_args ?? "{}"}
                  />
                </div>

                <div>
                  <div className="tiny uppercase text-txt3 mb-1">Cargos com acesso</div>
                  <div className="flex flex-wrap gap-2">
                    {cargos.map((c) => {
                      const ativo = vinculosCargo.some(
                        (v) => v.cargo_id === c.id && v.ferramenta_id === sel.id
                      );
                      return (
                        <label
                          key={c.id}
                          className="row gap-1.5 px-2 py-1 rounded text-xs cursor-pointer"
                          style={{ border: "1px solid var(--os-borda)" }}
                        >
                          <input
                            type="checkbox"
                            defaultChecked={ativo}
                            style={{ accentColor: "var(--os-acento-1)" }}
                          />
                          {c.nome}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* exemplo de chamada */}
                <div className="os-card p-3">
                  <div className="tiny uppercase text-txt3 mb-1">Exemplo de chamada</div>
                  <pre className="tiny mono text-txt2 whitespace-pre-wrap">
                    {sel.nome}({sel.schema_args ?? "{}"})
                  </pre>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-borda row gap-2 shrink-0">
                <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>
                  cancelar
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setSel(null)}
                >
                  <Icon name="save" size={14} />
                  salvar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
