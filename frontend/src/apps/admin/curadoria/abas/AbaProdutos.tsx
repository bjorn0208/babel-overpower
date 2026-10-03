// @ts-nocheck
// Aba 7 — Produtos
// Catálogo de produtos do tenant impersonado.
// Dados reais: agentes_usuario.fluxo->produtos (jsonb array).

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useProdutosAgente, type ProdutoAgente } from "../dados/use-produtos-agente";
import { TENANT_UNIVERSO } from "../dados/tipos";

// Tipo Produto reexportado do hook persistente
type Produto = ProdutoAgente;

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaProdutos() {
  const tenant = useTenantImpersonado();
  const tenantId = tenant.id === TENANT_UNIVERSO.id ? null : tenant.id;

  const { produtos, status, salvar, toggleAtivo: toggleAtivoPersist, erro: erroHook } = useProdutosAgente(tenantId);
  const [sel, setSel] = useState<Produto | null>(null);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [salvando, setSalvando] = useState(false);

  function selecionar(p: Produto) {
    setSel(p);
    setEditando({ ...p });
  }

  function fecharEditor() {
    setSel(null);
    setEditando(null);
  }

  function toggleAtivo(id: string, v: boolean) {
    void toggleAtivoPersist(id, v);
  }

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3" style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }}>Produtos</div>
          <div className="small muted mt-0.5" style={{ opacity: 0.7 }}>
            Catálogo do tenant impersonado · <span className="mono">agentes_usuario.fluxo.produtos</span> · edição persistente via app <span className="mono">/produtos</span>.
          </div>
        </div>
        <div className="row gap-2 shrink-0">
          {status === "ok" && (
            <span className="badge badge-neutral tiny mono">{produtos.length} produtos</span>
          )}
          <button className="btn btn-primary btn-sm">
            <Icon name="plus" size={14} />
            novo produto
          </button>
        </div>
      </div>

      {/* estado sem tenant */}
      {!tenantId && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 muted">
          <Icon name="package" size={28} />
          <span className="small">Selecione um tenant para ver o catálogo</span>
        </div>
      )}

      {/* carregando */}
      {tenantId && status === "carregando" && (
        <div className="flex-1 flex items-center justify-center muted small">
          Carregando produtos…
        </div>
      )}

      {/* erro */}
      {tenantId && status === "erro" && (
        <div className="flex-1 flex items-center justify-center small" style={{ color: "var(--os-perigo)" }}>
          Erro ao carregar produtos.
        </div>
      )}

      {/* lista + editor */}
      {tenantId && status === "ok" && (
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* tabela */}
          <div className={`${sel ? "w-3/5 border-r border-borda" : "flex-1"} overflow-auto p-5`}>
            {produtos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 muted">
                <Icon name="package" size={24} />
                <span className="small">Nenhum produto cadastrado no fluxo deste agente</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda">
                    {["produto", "categoria", "preço", "unidade", "agenda", "ativo"].map((col) => (
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
                  {produtos.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-borda/40 hover:bg-painel2 cursor-pointer transition-colors"
                      onClick={() => selecionar(p)}
                    >
                      <td className="py-2 px-3 first:pl-0 font-medium">{p.nome}</td>
                      <td className="py-2 px-3">
                        <span className="badge badge-neutral">{p.categoria}</span>
                      </td>
                      <td className="py-2 px-3 mono tabular-nums text-right">
                        R$ {p.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 mono tiny text-txt3">{p.unidade}</td>
                      <td className="py-2 px-3 mono tabular-nums text-right">
                        {p.estoque_agenda == null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            style={{
                              color: p.estoque_agenda < 5 ? "var(--os-aviso)" : "var(--os-txt2)",
                            }}
                          >
                            {p.estoque_agenda} slots
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          className={`w-8 h-4 rounded-full transition-colors relative ${
                            p.ativo ? "bg-acento" : "bg-borda"
                          }`}
                          style={{
                            background: p.ativo ? "var(--os-acento-1)" : "var(--os-borda)",
                          }}
                          onClick={() => toggleAtivo(p.id, !p.ativo)}
                          title={p.ativo ? "Desativar" : "Ativar"}
                        >
                          <span
                            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                            style={{ left: p.ativo ? "calc(100% - 14px)" : 2 }}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* editor lateral */}
          {sel && editando && (
            <div className="w-2/5 overflow-auto flex flex-col">
              {/* header do editor */}
              <div className="px-4 py-3 border-b border-borda row">
                <span className="small font-medium">{sel.nome}</span>
                <button onClick={fecharEditor} className="muted hover:text-txt p-1">
                  <Icon name="x" size={14} />
                </button>
              </div>

              {/* campos */}
              <div className="p-4 space-y-3 flex-1 overflow-auto">
                <div>
                  <div className="tiny uppercase text-txt3 mb-1">Nome</div>
                  <input
                    className="os-card w-full px-3 py-2 text-sm rounded-lg"
                    value={editando.nome}
                    onChange={(e) => setEditando((prev) => ({ ...prev!, nome: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="tiny uppercase text-txt3 mb-1">Preço (R$)</div>
                    <input
                      className="os-card w-full px-3 py-2 text-sm rounded-lg mono"
                      type="number"
                      step="0.01"
                      value={editando.preco}
                      onChange={(e) =>
                        setEditando((prev) => ({ ...prev!, preco: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <div className="tiny uppercase text-txt3 mb-1">Unidade</div>
                    <input
                      className="os-card w-full px-3 py-2 text-sm rounded-lg mono"
                      value={editando.unidade}
                      onChange={(e) =>
                        setEditando((prev) => ({ ...prev!, unidade: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="tiny uppercase text-txt3 mb-1">Categoria</div>
                  <input
                    className="os-card w-full px-3 py-2 text-sm rounded-lg"
                    value={editando.categoria}
                    onChange={(e) =>
                      setEditando((prev) => ({ ...prev!, categoria: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <div className="tiny uppercase text-txt3 mb-1">Descrição / condições</div>
                  <textarea
                    rows={4}
                    className="os-card w-full px-3 py-2 text-sm rounded-lg resize-none"
                    value={editando.descricao ?? ""}
                    onChange={(e) =>
                      setEditando((prev) => ({ ...prev!, descricao: e.target.value }))
                    }
                  />
                </div>

                {/* JSON preview */}
                <div className="os-card p-3">
                  <div className="tiny uppercase text-txt3 mb-1">
                    JSON em <span className="mono">agentes_usuario.fluxo.produtos</span>
                  </div>
                  <pre className="tiny mono text-txt3 whitespace-pre-wrap overflow-auto max-h-40">
                    {JSON.stringify(editando, null, 2)}
                  </pre>
                </div>
              </div>

              {/* ações */}
              <div className="px-4 py-3 border-t border-borda row gap-2 shrink-0">
                <button className="btn btn-ghost btn-sm" onClick={fecharEditor}>
                  cancelar
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={salvando}
                  onClick={async () => {
                    if (!editando) return;
                    setSalvando(true);
                    try { await salvar(editando); fecharEditor(); }
                    finally { setSalvando(false); }
                  }}
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
