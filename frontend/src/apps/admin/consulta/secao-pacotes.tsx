/**
 * Seção Pacotes — CRUD de consultas_pacotes.
 * Cada pacote define quanto o tenant paga e quanto de saldo recebe.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, X, Check, ArrowRight } from "lucide-react";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { Campo, Vazio, BotaoIcone, Toggle } from "./ui-admin";
import { supabase } from "@/integrations/supabase/client";
import { inputStyle, formatBRL, pegarToast } from "./tipos";
import type { PacoteCredito, SupabaseBruto } from "./tipos";

function formVazio(): Omit<PacoteCredito, "id"> {
  return { nome: "", valor: 0, credito: 0, ativo: true, ordem: 1 };
}

interface Props {
  pacotes: PacoteCredito[];
  onMudou: () => void;
}

export function SecaoPacotes({ pacotes, onMudou }: Props) {
  const t = pegarToast();
  const [edicao, setEdicao] = useState<Partial<PacoteCredito> | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() { setEdicao(formVazio()); }
  function abrirEditar(p: PacoteCredito) { setEdicao({ ...p }); }
  function fechar() { setEdicao(null); }

  async function salvar() {
    if (!edicao?.nome?.trim()) { t.error("Nome é obrigatório."); return; }
    if ((edicao.valor ?? 0) <= 0) { t.error("Valor deve ser maior que zero."); return; }
    if ((edicao.credito ?? 0) <= 0) { t.error("Crédito deve ser maior que zero."); return; }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("consultas_pacotes").upsert(edicao);
      if (error) throw error;
      t.success(edicao.id ? "Pacote atualizado." : "Pacote criado.");
      setEdicao(null);
      onMudou();
    } catch {
      t.error("Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir o pacote "${nome}"? Recargas já realizadas não são afetadas.`)) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("consultas_pacotes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      t.success("Pacote excluído.");
      onMudou();
    } catch {
      t.error("Falha ao excluir.");
    }
  }

  /** Margem percentual do pacote: (crédito - valor) / valor */
  function margem(p: PacoteCredito): string {
    if (p.valor <= 0) return "—";
    const pct = ((p.credito - p.valor) / p.valor) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  }

  function corMargem(p: PacoteCredito): string {
    if (p.valor <= 0) return "oklch(0.98 0 0 / 0.4)";
    const pct = ((p.credito - p.valor) / p.valor) * 100;
    if (pct > 0) return "oklch(0.72 0.18 145)";
    if (pct < 0) return "oklch(0.65 0.24 25)";
    return "oklch(0.98 0 0 / 0.55)";
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ padding: 4 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Pacotes de crédito</div>
          <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
            O tenant paga o <strong>Valor</strong> via PIX e recebe o <strong>Crédito</strong> na carteira para usar em consultas.
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={abrirNovo}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", fontSize: 12, fontWeight: 600,
            background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
            color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            borderRadius: 10, cursor: "pointer",
          }}
        >
          <Plus size={13} /> Novo pacote
        </motion.button>
      </div>

      {/* Lista */}
      {pacotes.length === 0 ? (
        <Vazio mensagem="Nenhum pacote de crédito cadastrado ainda." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pacotes.map((p) => (
            <motion.div
              key={p.id}
              layout
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px",
                background: "oklch(0.18 0.06 280 / 0.4)",
                border: "1px solid oklch(0.98 0 0 / 0.06)",
                borderRadius: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{p.nome}</span>
                  {!p.ativo && (
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      background: "oklch(0.65 0.24 25 / 0.12)", color: "oklch(0.65 0.24 25)",
                      border: "1px solid oklch(0.65 0.24 25 / 0.25)",
                    }}>inativo</span>
                  )}
                </div>
                {/* Resumo visual: tenant paga X → recebe Y */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>Tenant paga</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.98 0 0)", fontFamily: "ui-monospace, monospace" }}>
                    {formatBRL(p.valor)}
                  </span>
                  <ArrowRight size={10} style={{ color: "oklch(0.98 0 0 / 0.3)" }} />
                  <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>recebe</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.72 0.18 145)", fontFamily: "ui-monospace, monospace" }}>
                    {formatBRL(p.credito)}
                  </span>
                  <span style={{ fontSize: 10, color: corMargem(p), fontFamily: "ui-monospace, monospace" }}>
                    ({margem(p)})
                  </span>
                </div>
              </div>
              <BotaoIcone onClick={() => abrirEditar(p)} titulo="Editar pacote">
                <Edit2 size={13} />
              </BotaoIcone>
              <BotaoIcone onClick={() => excluir(p.id, p.nome)} titulo="Excluir pacote" perigo>
                <Trash2 size={13} />
              </BotaoIcone>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de edição */}
      <AnimatePresence>
        {edicao && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={fechar}
              style={{
                position: "fixed", inset: 0,
                background: "oklch(0.08 0.04 280 / 0.7)",
                backdropFilter: "blur(6px)", zIndex: 40,
              }}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              style={{
                position: "fixed", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 460, maxHeight: "88vh", overflowY: "auto",
                background: "oklch(0.14 0.06 280 / 0.97)",
                border: "1px solid oklch(0.98 0 0 / 0.08)",
                borderRadius: 16, padding: 24, zIndex: 41,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                  {edicao.id ? "Editar pacote" : "Novo pacote"}
                </div>
                <BotaoIcone onClick={fechar} titulo="Fechar"><X size={14} /></BotaoIcone>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Campo label="Nome do pacote">
                    <input
                      style={inputStyle}
                      value={edicao.nome ?? ""}
                      onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                      placeholder="Ex: Pacote Essencial"
                    />
                  </Campo>
                  <div style={{ width: 80 }}>
                    <Campo label="Ordem">
                      <input
                        style={inputStyle}
                        type="number"
                        value={edicao.ordem ?? 1}
                        onChange={(e) => setEdicao({ ...edicao, ordem: Number(e.target.value) })}
                      />
                    </Campo>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <Campo label="Valor cobrado (R$)">
                    <input
                      style={inputStyle}
                      type="number" step="0.01" min="0"
                      value={edicao.valor ?? 0}
                      onChange={(e) => setEdicao({ ...edicao, valor: Number(e.target.value) })}
                      placeholder="0,00"
                    />
                  </Campo>
                  <Campo label="Crédito na carteira (R$)">
                    <input
                      style={inputStyle}
                      type="number" step="0.01" min="0"
                      value={edicao.credito ?? 0}
                      onChange={(e) => setEdicao({ ...edicao, credito: Number(e.target.value) })}
                      placeholder="0,00"
                    />
                  </Campo>
                </div>

                {/* Preview do resumo */}
                {(edicao.valor ?? 0) > 0 && (edicao.credito ?? 0) > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px",
                    background: "oklch(0.72 0.18 145 / 0.06)",
                    border: "1px solid oklch(0.72 0.18 145 / 0.2)",
                    borderRadius: 8, fontSize: 11,
                  }}>
                    <span style={{ color: "oklch(0.98 0 0 / 0.55)" }}>Tenant paga</span>
                    <span style={{ fontWeight: 700, color: "oklch(0.98 0 0)", fontFamily: "ui-monospace, monospace" }}>
                      {formatBRL(edicao.valor ?? 0)}
                    </span>
                    <ArrowRight size={10} style={{ color: "oklch(0.98 0 0 / 0.3)" }} />
                    <span style={{ color: "oklch(0.98 0 0 / 0.55)" }}>recebe</span>
                    <span style={{ fontWeight: 700, color: "oklch(0.72 0.18 145)", fontFamily: "ui-monospace, monospace" }}>
                      {formatBRL(edicao.credito ?? 0)}
                    </span>
                    <span style={{ color: "oklch(0.98 0 0 / 0.4)", fontFamily: "ui-monospace, monospace" }}>
                      de saldo
                    </span>
                  </div>
                )}

                <Toggle
                  ativo={edicao.ativo ?? true}
                  onChange={(v) => setEdicao({ ...edicao, ativo: v })}
                  rotulo="Pacote ativo (aparece para os tenants comprarem)"
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
                <motion.button type="button" whileTap={tapPress} onClick={fechar}
                  style={{
                    padding: "7px 16px", fontSize: 12,
                    background: "oklch(0.98 0 0 / 0.06)", color: "oklch(0.98 0 0 / 0.7)",
                    border: "1px solid oklch(0.98 0 0 / 0.1)", borderRadius: 10, cursor: "pointer",
                  }}
                >Cancelar</motion.button>
                <motion.button type="button" whileTap={tapPress} onClick={salvar} disabled={salvando}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 16px", fontSize: 12, fontWeight: 600,
                    background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.4), oklch(0.65 0.22 280 / 0.3))",
                    color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
                    borderRadius: 10, cursor: salvando ? "not-allowed" : "pointer", opacity: salvando ? 0.6 : 1,
                  }}
                >
                  <Check size={13} /> {salvando ? "Salvando…" : "Salvar"}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
