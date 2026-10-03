/**
 * Seção Tipos — CRUD de consultas_tipos.
 * Lista de tipos de consulta disponíveis + form de criação/edição.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, X, Check, Info } from "lucide-react";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { Campo, Vazio, BotaoIcone, Toggle } from "./ui-admin";
import { supabase } from "@/integrations/supabase/client";
import { inputStyle, formatBRL, formatTipoDoc, pegarToast } from "./tipos";
import type { TipoConsulta, SupabaseBruto } from "./tipos";

// ---------------------------------------------------------------------------
// Form vazio para criação
// ---------------------------------------------------------------------------

function formVazio(): Omit<TipoConsulta, "id"> {
  return {
    nome: "",
    descricao: null,
    codigo_api: "",
    tipo_doc: "ambos",
    custo: 0,
    sale_api: 0,
    ativo: true,
    ordem: 1,
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface Props {
  tipos: TipoConsulta[];
  onMudou: () => void;
}

export function SecaoTipos({ tipos, onMudou }: Props) {
  const t = pegarToast();
  const [edicao, setEdicao] = useState<Partial<TipoConsulta> | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setEdicao(formVazio());
  }

  function abrirEditar(tipo: TipoConsulta) {
    setEdicao({ ...tipo });
  }

  function fechar() {
    setEdicao(null);
  }

  async function salvar() {
    if (!edicao?.nome?.trim()) { t.error("Nome é obrigatório."); return; }
    if (!edicao?.codigo_api?.trim()) { t.error("Código da API é obrigatório."); return; }
    if (Number(edicao?.custo ?? 0) < Number(edicao?.sale_api ?? 0)) {
      t.error("O preço cobrado do tenant não pode ser menor que o custo da API.");
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("consultas_tipos").upsert(edicao);
      if (error) throw error;
      t.success(edicao.id ? "Tipo atualizado." : "Tipo criado.");
      setEdicao(null);
      onMudou();
    } catch {
      t.error("Falha ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir o tipo "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("consultas_tipos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      t.success("Tipo excluído.");
      onMudou();
    } catch {
      t.error("Falha ao excluir.");
    }
  }

  // Edição rápida na própria linha (custo + ativo), sem abrir o modal.
  async function salvarInline(id: string, patch: Partial<TipoConsulta>) {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("consultas_tipos").update(patch).eq("id", id);
      if (error) throw error;
      t.success("Salvo.");
      onMudou();
    } catch {
      t.error("Falha ao salvar.");
    }
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ padding: 4 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
            Tipos de consulta
          </div>
          <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
            Cada tipo é um serviço da API externa. Aqui você define o <strong>preço que a plataforma cobra do tenant</strong> — debitado da carteira dele a cada consulta.
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={abrirNovo}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
            color: "oklch(0.98 0 0)",
            border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          <Plus size={13} /> Novo tipo
        </motion.button>
      </div>

      {/* Lista */}
      {tipos.length === 0 ? (
        <Vazio mensagem="Nenhum tipo de consulta cadastrado ainda." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tipos.map((tipo) => (
            <motion.div
              key={tipo.id}
              layout
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "oklch(0.18 0.06 280 / 0.4)",
                border: "1px solid oklch(0.98 0 0 / 0.06)",
                borderRadius: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                    {tipo.nome}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "ui-monospace, monospace",
                      padding: "2px 7px",
                      background: "oklch(0.98 0 0 / 0.06)",
                      border: "1px solid oklch(0.98 0 0 / 0.08)",
                      borderRadius: 6,
                      color: "oklch(0.98 0 0 / 0.7)",
                    }}
                  >
                    {tipo.codigo_api}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "oklch(0.7 0.18 220 / 0.12)",
                      color: "oklch(0.7 0.18 220)",
                      border: "1px solid oklch(0.7 0.18 220 / 0.25)",
                    }}
                  >
                    {formatTipoDoc(tipo.tipo_doc)}
                  </span>
                  {!tipo.ativo && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "oklch(0.65 0.24 25 / 0.12)",
                        color: "oklch(0.65 0.24 25)",
                        border: "1px solid oklch(0.65 0.24 25 / 0.25)",
                      }}
                    >
                      inativo
                    </span>
                  )}
                </div>
                {tipo.descricao && (
                  <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginTop: 3 }}>
                    {tipo.descricao}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap", display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.3, color: "oklch(0.98 0 0 / 0.5)" }}>
                  Preço ao tenant (R$)
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={tipo.custo}
                  title="Editar e sair do campo pra salvar"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== tipo.custo && v >= Number(tipo.sale_api ?? 0)) void salvarInline(tipo.id, { custo: v });
                  }}
                  style={{
                    width: 96, textAlign: "right", fontSize: 14, fontWeight: 700,
                    fontFamily: "ui-monospace, monospace", color: "oklch(0.72 0.18 145)",
                    background: "oklch(0.18 0.06 280 / 0.4)", border: "1px solid oklch(0.98 0 0 / 0.1)",
                    borderRadius: 8, padding: "4px 8px",
                  }}
                />
                <div style={{ fontSize: 9, color: "oklch(0.98 0 0 / 0.4)" }}>
                  custo API {formatBRL(tipo.sale_api ?? 0)}
                </div>
              </div>
              <Toggle ativo={tipo.ativo} onChange={(v) => void salvarInline(tipo.id, { ativo: v })} rotulo="" />
              <BotaoIcone onClick={() => abrirEditar(tipo)} titulo="Editar detalhes">
                <Edit2 size={13} />
              </BotaoIcone>
              <BotaoIcone onClick={() => excluir(tipo.id, tipo.nome)} titulo="Excluir tipo" perigo>
                <Trash2 size={13} />
              </BotaoIcone>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de edição — portal por FORA (escapa do transform da janela), AnimatePresence DENTRO */}
      {createPortal(
        <AnimatePresence>
          {edicao && (
            <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={fechar}
              style={{
                position: "fixed", inset: 0,
                background: "oklch(0.08 0.04 280 / 0.7)",
                backdropFilter: "blur(6px)",
                zIndex: 40,
              }}
            />
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 41,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                pointerEvents: "none",
              }}
            >
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              style={{
                width: "min(520px, 92vw)",
                maxHeight: "88vh",
                overflowY: "auto",
                background: "oklch(0.14 0.06 280 / 0.97)",
                border: "1px solid oklch(0.98 0 0 / 0.08)",
                borderRadius: 16,
                padding: 24,
                pointerEvents: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                  {edicao.id ? "Editar tipo" : "Novo tipo"}
                </div>
                <BotaoIcone onClick={fechar} titulo="Fechar">
                  <X size={14} />
                </BotaoIcone>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Campo label="Nome" >
                    <input
                      style={inputStyle}
                      value={edicao.nome ?? ""}
                      onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                      placeholder="Ex: Consulta CPF básica"
                    />
                  </Campo>
                  <div style={{ width: 90 }}>
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

                <Campo label="Descrição">
                  <textarea
                    style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
                    value={edicao.descricao ?? ""}
                    onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value || null })}
                    placeholder="Para que serve esse tipo de consulta?"
                  />
                </Campo>

                <Campo label="Código da API">
                  <input
                    style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
                    value={edicao.codigo_api ?? ""}
                    onChange={(e) => setEdicao({ ...edicao, codigo_api: e.target.value })}
                    placeholder="Ex: cpf_basico"
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>
                    <Info size={10} />
                    Identificador exato que será enviado para a API externa ao executar esse tipo de consulta.
                  </div>
                </Campo>

                <Campo label="Documentos aceitos">
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={edicao.tipo_doc ?? "ambos"}
                    onChange={(e) =>
                      setEdicao({ ...edicao, tipo_doc: e.target.value as TipoConsulta["tipo_doc"] })
                    }
                  >
                    <option value="cpf">Só CPF</option>
                    <option value="cnpj">Só CNPJ</option>
                    <option value="ambos">CPF e CNPJ</option>
                  </select>
                </Campo>

                <div style={{ display: "flex", gap: 12 }}>
                  <Campo label="Custo na API (Motor de Crédito) — referência">
                    <input
                      style={inputStyle}
                      type="number"
                      step="0.01"
                      min="0"
                      value={edicao.sale_api ?? 0}
                      onChange={(e) => setEdicao({ ...edicao, sale_api: Number(e.target.value) })}
                      placeholder="0,00"
                    />
                  </Campo>

                  <Campo label="Preço cobrado do tenant (debita da carteira)">
                    <input
                      style={inputStyle}
                      type="number"
                      step="0.01"
                      min="0"
                      value={edicao.custo ?? 0}
                      onChange={(e) => setEdicao({ ...edicao, custo: Number(e.target.value) })}
                      placeholder="0,00"
                    />
                  </Campo>
                </div>

                {(() => {
                  const c = Number(edicao.custo ?? 0);
                  const s = Number(edicao.sale_api ?? 0);
                  const margem = c - s;
                  const negativa = margem < 0;
                  return (
                    <div
                      style={{
                        padding: "9px 13px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: negativa ? "oklch(0.65 0.24 25 / 0.1)" : "oklch(0.72 0.18 145 / 0.1)",
                        border: `1px solid ${negativa ? "oklch(0.65 0.24 25 / 0.3)" : "oklch(0.72 0.18 145 / 0.3)"}`,
                        color: negativa ? "oklch(0.65 0.24 25)" : "oklch(0.72 0.18 145)",
                      }}
                    >
                      Margem da plataforma: {margem.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      {negativa ? " — abaixo do custo da API, não dá pra salvar." : ""}
                    </div>
                  );
                })()}

                <Toggle
                  ativo={edicao.ativo ?? true}
                  onChange={(v) => setEdicao({ ...edicao, ativo: v })}
                  rotulo="Tipo ativo (disponível para os tenants usarem)"
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
                <motion.button type="button" whileTap={tapPress} onClick={fechar}
                  style={{
                    padding: "7px 16px", fontSize: 12, background: "oklch(0.98 0 0 / 0.06)",
                    color: "oklch(0.98 0 0 / 0.7)", border: "1px solid oklch(0.98 0 0 / 0.1)",
                    borderRadius: 10, cursor: "pointer",
                  }}
                >
                  Cancelar
                </motion.button>
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
            </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  );
}
