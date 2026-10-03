/**
 * Aba Pastas — organização do caixa em pastas aninhadas (até 5 níveis).
 * Navegação por breadcrumb; cada pasta mostra as subpastas (cards com total
 * do mês, incluindo descendentes) e os lançamentos dela. Criação em destaque.
 * Essas pastas alimentam o agente: base da organização do conhecimento financeiro.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { formatBRL, inputStyle, rotuloMes, type MovimentoFinanceiro, type SupabaseBruto, type ToastApi } from "./tipos";

type Categoria = { id: string; nome: string; categoria_pai_id: string | null };

const PROFUNDIDADE_MAX = 5;

type Props = { ownerId: string | null; movimentos: MovimentoFinanceiro[]; mes: string; t: ToastApi };

export function AbaPastas({ ownerId, movimentos, mes, t }: Props) {
  const [arvore, setArvore] = useState<Categoria[]>([]);
  const [caminho, setCaminho] = useState<string[]>([]); // pilha de ids (vazio = topo)
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  const carregar = useCallback(async () => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    await sb.rpc("garantir_categorias_padrao").then(() => {}, () => {});
    const { data, error } = await sb
      .from("categorias_financeiras")
      .select("id, nome, categoria_pai_id")
      .eq("tenant_id", ownerId)
      .is("deleted_at", null)
      .order("criado_em");
    if (error) { t.error("Falha ao carregar as pastas."); return; }
    setArvore((data ?? []) as Categoria[]);
  }, [ownerId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const porId = useMemo(() => new Map(arvore.map((c) => [c.id, c])), [arvore]);
  const filhosDe = useCallback(
    (id: string | null) => arvore.filter((c) => c.categoria_pai_id === (id ?? null)),
    [arvore],
  );

  /** Ids da pasta + todos os descendentes (BFS). */
  const comDescendentes = useCallback((id: string): string[] => {
    const ids = [id];
    for (let i = 0; i < ids.length; i++) {
      for (const f of arvore) if (f.categoria_pai_id === ids[i]) ids.push(f.id);
    }
    return ids;
  }, [arvore]);

  const movsPorCategoria = useMemo(() => {
    const mapa = new Map<string, MovimentoFinanceiro[]>();
    for (const m of movimentos) {
      if (!m.categoria_id) continue;
      mapa.set(m.categoria_id, [...(mapa.get(m.categoria_id) ?? []), m]);
    }
    return mapa;
  }, [movimentos]);

  const totalDaPasta = useCallback((id: string) => {
    let valor = 0, qtd = 0;
    for (const cid of comDescendentes(id)) {
      for (const m of movsPorCategoria.get(cid) ?? []) {
        valor += Number(m.valor) || 0;
        qtd += 1;
      }
    }
    return { valor, qtd };
  }, [comDescendentes, movsPorCategoria]);

  const pastaAtualId = caminho.length ? caminho[caminho.length - 1] : null;
  const pastaAtual = pastaAtualId ? porId.get(pastaAtualId) ?? null : null;
  const subpastas = filhosDe(pastaAtualId);
  const profundidadeAtual = caminho.length; // topo = 0
  const semPasta = useMemo(() => movimentos.filter((m) => !m.categoria_id), [movimentos]);

  const criar = async () => {
    if (!ownerId) return;
    const nome = novoNome.trim().slice(0, 60);
    if (!nome) { t.error("Dê um nome pra pasta."); return; }
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("categorias_financeiras")
      .insert({ tenant_id: ownerId, nome, categoria_pai_id: pastaAtualId });
    if (error) {
      t.error(/uk_categorias/i.test(String(error.message)) ? "Já existe uma pasta com esse nome aqui." : "Falha ao criar.");
      return;
    }
    setNovoNome("");
    setCriando(false);
    t.success("Pasta criada.");
    void carregar();
  };

  const removerAtual = async () => {
    if (!pastaAtual) return;
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("categorias_financeiras")
      .update({ deleted_at: new Date().toISOString() }).eq("id", pastaAtual.id);
    if (error) { t.error("Falha ao remover."); return; }
    t.success(`Pasta "${pastaAtual.nome}" removida (lançamentos antigos mantêm o rótulo).`);
    setCaminho(caminho.slice(0, -1));
    void carregar();
  };

  // Lançamentos exibidos: da pasta atual + descendentes (no topo, nenhum — só pastas)
  const movsVisiveis = useMemo(() => {
    if (!pastaAtualId) return [];
    return comDescendentes(pastaAtualId)
      .flatMap((id) => movsPorCategoria.get(id) ?? [])
      .sort((a, b) => String(b.data_movimento ?? "").localeCompare(String(a.data_movimento ?? "")));
  }, [pastaAtualId, comDescendentes, movsPorCategoria]);

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      {/* Breadcrumb + ações */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <motion.button whileTap={tapPress} type="button" onClick={() => { setCaminho([]); setCriando(false); }}
          style={{ ...migalha, fontWeight: caminho.length === 0 ? 650 : 500 }}>
          📁 Pastas
        </motion.button>
        {caminho.map((id, i) => (
          <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "oklch(0.98 0 0 / 0.35)" }}>›</span>
            <motion.button whileTap={tapPress} type="button"
              onClick={() => { setCaminho(caminho.slice(0, i + 1)); setCriando(false); }}
              style={{ ...migalha, fontWeight: i === caminho.length - 1 ? 650 : 500 }}>
              {porId.get(id)?.nome ?? "?"}
            </motion.button>
          </span>
        ))}
        <div style={{ flex: 1 }} />
        {pastaAtual && (
          <motion.button whileTap={tapPress} type="button" onClick={() => void removerAtual()}
            style={{ ...botaoAcao, color: "oklch(0.65 0.24 25)" }}>
            remover pasta
          </motion.button>
        )}
        {profundidadeAtual < PROFUNDIDADE_MAX && (
          <motion.button whileTap={tapPress} type="button" onClick={() => { setCriando(!criando); setNovoNome(""); }} style={botaoPrimario}>
            + Nova pasta{pastaAtual ? ` em ${pastaAtual.nome}` : ""}
          </motion.button>
        )}
      </div>

      {pastaAtual && (
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginBottom: 12 }}>
          {(() => { const tt = totalDaPasta(pastaAtual.id); return `${formatBRL(tt.valor)} em ${rotuloMes(mes)} · ${tt.qtd} lançamento(s) (subpastas incluídas)`; })()}
        </div>
      )}

      {criando && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={novoNome} maxLength={60} autoFocus
            placeholder={pastaAtual ? `Nome da subpasta dentro de ${pastaAtual.nome}` : "Nome da pasta (ex: Obra do escritório)"}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void criar(); }} />
          <motion.button whileTap={tapPress} type="button" onClick={() => void criar()} style={botaoPrimario}>criar</motion.button>
          <motion.button whileTap={tapPress} type="button" onClick={() => { setCriando(false); setNovoNome(""); }} style={botaoAcao}>cancelar</motion.button>
        </div>
      )}

      {/* Subpastas navegáveis */}
      {subpastas.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: pastaAtual ? 16 : 0 }}>
          {subpastas.map((p) => {
            const tt = totalDaPasta(p.id);
            const nFilhos = filhosDe(p.id).length;
            return (
              <motion.button key={p.id} whileTap={tapPress} type="button"
                onClick={() => { setCaminho([...caminho, p.id]); setCriando(false); }}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "14px 15px", borderRadius: 12,
                  background: "oklch(0.18 0.06 280 / 0.35)", border: "1px solid oklch(0.98 0 0 / 0.08)",
                }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
                  {tt.qtd > 0 ? `${formatBRL(tt.valor)} · ${tt.qtd} lançamento(s)` : "vazia este mês"}
                  {nFilhos > 0 ? ` · ${nFilhos} subpasta(s)` : ""}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {!pastaAtual && subpastas.length === 0 && (
        <div style={vazio}>Nenhuma pasta ainda — crie a primeira.</div>
      )}

      {/* Lançamentos da pasta aberta (descendentes incluídos) */}
      {pastaAtual && (
        movsVisiveis.length === 0 ? (
          <div style={vazio}>Nenhum lançamento nesta pasta em {rotuloMes(mes)}.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {movsVisiveis.map((m) => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "9px 13px",
                borderRadius: 10, background: "oklch(0.18 0.06 280 / 0.25)",
                border: "1px solid oklch(0.98 0 0 / 0.06)",
              }}>
                <span style={{ width: 60, fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
                  {m.data_movimento ? m.data_movimento.split("-").reverse().slice(0, 2).join("/") : "—"}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: "oklch(0.98 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.descricao || "(sem descrição)"}
                </span>
                <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>{m.categoria}</span>
                <span style={{
                  fontSize: 12.5, fontWeight: 600,
                  color: m.tipo === "entrada" ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.24 25)",
                }}>
                  {m.tipo === "entrada" ? "+" : "−"}{formatBRL(Number(m.valor))}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {!pastaAtual && semPasta.length > 0 && (
        <p style={{ fontSize: 11, color: "oklch(0.78 0.18 80)", marginTop: 14 }}>
          {semPasta.length} lançamento(s) sem pasta em {rotuloMes(mes)} — edite na aba Movimentos pra organizar.
        </p>
      )}
    </motion.div>
  );
}

const vazio: React.CSSProperties = {
  padding: "30px 0", textAlign: "center", color: "oklch(0.98 0 0 / 0.45)", fontSize: 13,
};
const migalha: React.CSSProperties = {
  fontSize: 13, color: "oklch(0.98 0 0)", background: "transparent",
  border: "none", cursor: "pointer", padding: "2px 2px",
};
const botaoPrimario: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 10, cursor: "pointer",
  color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
  background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
};
const botaoAcao: React.CSSProperties = {
  fontSize: 11, padding: "5px 10px", borderRadius: 8, whiteSpace: "nowrap", cursor: "pointer",
  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent", color: "oklch(0.98 0 0 / 0.6)",
};
