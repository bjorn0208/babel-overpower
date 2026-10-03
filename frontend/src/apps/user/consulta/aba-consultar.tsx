/**
 * Aba Consultar — vitrine de tipos de consulta + execução por documento.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { Campo, CardKpi, inputStyle, Vazio, formatBRL, mascaraDoc, detectarTipoDoc } from "./re-exports";
import { derivarCamposParams, UFS } from "./tipos";
import { LaudoConsulta } from "./laudo-consulta";
import { LinkVenda } from "./link-venda";
import type { TipoConsulta, ToastApi, SupabaseBruto } from "./tipos";

/** Rótulo amigável pros params dinâmicos do serviço. */
function rotuloParam(chave: string): string {
  const mapa: Record<string, string> = { uf: "UF (estado)", insumo: "Fontes da consulta" };
  return mapa[chave] ?? chave.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function AbaConsultar({
  tipos,
  saldo,
  t,
}: {
  tipos: TipoConsulta[];
  saldo: number;
  t: ToastApi;
}) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoConsulta | null>(null);
  const [documento, setDocumento] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});

  const tiposAtivos = tipos.filter((tp) => tp.ativo).sort((a, b) => a.ordem - b.ordem);
  const tipoDoc = documento ? detectarTipoDoc(documento) : null;
  const camposExtra = tipoSelecionado ? derivarCamposParams(tipoSelecionado.settings_api) : [];

  // Ao trocar de tipo, reinicia os params extras (multiselect já vem com todas as opções marcadas).
  useEffect(() => {
    if (!tipoSelecionado) { setParams({}); return; }
    const init: Record<string, unknown> = {};
    for (const c of derivarCamposParams(tipoSelecionado.settings_api)) {
      init[c.chave] = c.tipo === "multiselect" ? [...(c.opcoes ?? [])] : "";
    }
    setParams(init);
  }, [tipoSelecionado]);

  function toggleOpcao(chave: string, opcao: string) {
    setParams((prev) => {
      const arr = Array.isArray(prev[chave]) ? (prev[chave] as string[]) : [];
      const novo = arr.includes(opcao) ? arr.filter((o) => o !== opcao) : [...arr, opcao];
      return { ...prev, [chave]: novo };
    });
  }

  function handleDocumento(valor: string) {
    const apenasDigitos = valor.replace(/\D/g, "").slice(0, 14);
    setDocumento(mascaraDoc(apenasDigitos));
  }

  const tipoCompativelComDoc = (tp: TipoConsulta): boolean => {
    if (!tipoDoc) return true;
    if (tp.tipo_doc === "ambos") return true;
    return tp.tipo_doc === tipoDoc;
  };

  async function consultar() {
    if (!tipoSelecionado) { t.error("Selecione um tipo de consulta"); return; }
    const doc = documento.replace(/\D/g, "");
    if (doc.length < 11) { t.error("Documento inválido"); return; }
    if (saldo < tipoSelecionado.custo) {
      t.error("Saldo insuficiente. Recarregue na aba Carteira.");
      return;
    }
    // Valida os params exigidos pelo serviço (ex: UF, fontes) antes de gastar saldo.
    for (const campo of camposExtra) {
      if (!campo.obrigatorio) continue;
      const v = params[campo.chave];
      const vazio = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (vazio) { t.error(`Preencha "${rotuloParam(campo.chave)}" pra esse tipo de consulta.`); return; }
    }

    setConsultando(true);
    setResultado(null);
    try {
      const sb = supabase as SupabaseBruto;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { t.error("Sessão expirada. Entre novamente."); return; }

      // 1. Cria a consulta (RLS garante tenant_id = próprio user)
      const { data: nova, error: errIns } = await sb
        .from("consultas")
        .insert({
          tenant_id: uid,
          tipo_id: tipoSelecionado.id,
          origem: "manual",
          tipo_doc: tipoDoc,
          documento: doc,
          params_api: camposExtra.length ? params : {},
          status: "rascunho",
        })
        .select("id")
        .single();
      if (errIns || !nova) throw errIns ?? new Error("falha ao criar consulta");

      // 2. Dispara a edge (debita carteira → API → resultado)
      const { data: res, error: errFn } = await sb.functions.invoke("consultar-documento", {
        body: { consulta_id: nova.id },
      });
      if (errFn) throw errFn;
      if (res && res.ok === false) {
        t.error("Consulta não concluída: " + (res.erro ?? "erro desconhecido"));
        return;
      }

      // 3. Lê o resultado gravado
      const { data: c } = await sb
        .from("consultas")
        .select("resultado")
        .eq("id", nova.id)
        .maybeSingle();
      setResultado((c?.resultado ?? null) as Record<string, unknown> | null);
      t.success("Consulta concluída!");
    } catch {
      t.error("Falha na consulta. Tente novamente.");
    } finally {
      setConsultando(false);
    }
  }

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      {/* KPI saldo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <CardKpi
          rotulo="Saldo disponível"
          valor={saldo}
          cor="oklch(0.72 0.18 145)"
          formatado={formatBRL(saldo)}
        />
      </div>

      {/* Vender por link (gera o mesmo link do agente) */}
      <LinkVenda t={t} />

      {/* Vitrine de tipos */}
      <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 12 }}>
          Tipos de consulta disponíveis
        </h2>

        {tiposAtivos.length === 0 ? (
          <Vazio mensagem="Nenhum tipo de consulta ativo" />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {tiposAtivos.map((tp) => {
              const selecionado = tipoSelecionado?.id === tp.id;
              const compativel = tipoCompativelComDoc(tp);
              return (
                <motion.button
                  key={tp.id}
                  type="button"
                  whileTap={tapPress}
                  onClick={() => setTipoSelecionado(selecionado ? null : tp)}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: selecionado
                      ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))"
                      : "oklch(0.18 0.06 280 / 0.3)",
                    border: selecionado
                      ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                      : "1px solid oklch(0.98 0 0 / 0.07)",
                    cursor: "pointer",
                    textAlign: "left",
                    opacity: !compativel && documento ? 0.45 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "oklch(0.98 0 0)",
                      marginBottom: 4,
                    }}
                  >
                    {tp.nome}
                  </div>
                  {tp.descricao && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "oklch(0.98 0 0 / 0.55)",
                        marginBottom: 8,
                        lineHeight: 1.4,
                      }}
                    >
                      {tp.descricao}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "oklch(0.72 0.18 145)",
                        fontFamily: "ui-monospace, SFMono-Regular, monospace",
                      }}
                    >
                      {formatBRL(tp.custo)}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: "oklch(0.98 0 0 / 0.07)",
                        color: "oklch(0.98 0 0 / 0.55)",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {tp.tipo_doc === "ambos" ? "CPF / CNPJ" : tp.tipo_doc.toUpperCase()}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Formulário de consulta */}
      {tipoSelecionado && (
        <motion.div
          variants={fadeSlideIn}
          initial="hidden"
          animate="visible"
          className="os-vidro"
          style={{ padding: 18, borderRadius: 16 }}
        >
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "oklch(0.98 0 0)",
              marginBottom: 14,
            }}
          >
            Consultar via {tipoSelecionado.nome}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
            <Campo label="CPF ou CNPJ">
              <input
                type="text"
                inputMode="numeric"
                value={documento}
                onChange={(e) => handleDocumento(e.target.value)}
                placeholder="000.000.000-00"
                style={inputStyle}
                maxLength={18}
              />
            </Campo>

            {tipoDoc && (
              <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>
                Detectado: <strong style={{ color: "oklch(0.7 0.18 220)" }}>{tipoDoc.toUpperCase()}</strong>
              </div>
            )}

            {camposExtra.map((campo) => (
              <Campo key={campo.chave} label={rotuloParam(campo.chave) + (campo.obrigatorio ? " *" : "")}>
                {campo.tipo === "uf" ? (
                  <select
                    style={inputStyle}
                    value={(params[campo.chave] as string) ?? ""}
                    onChange={(e) => setParams((p) => ({ ...p, [campo.chave]: e.target.value }))}
                  >
                    <option value="">Selecione…</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                ) : campo.tipo === "multiselect" ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(campo.opcoes ?? []).map((op) => {
                      const arr = Array.isArray(params[campo.chave]) ? (params[campo.chave] as string[]) : [];
                      const on = arr.includes(op);
                      return (
                        <button
                          key={op}
                          type="button"
                          onClick={() => toggleOpcao(campo.chave, op)}
                          style={{
                            padding: "5px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 999,
                            cursor: "pointer",
                            background: on ? "oklch(0.7 0.18 220 / 0.25)" : "oklch(0.98 0 0 / 0.05)",
                            color: on ? "oklch(0.8 0.14 220)" : "oklch(0.98 0 0 / 0.55)",
                            border: `1px solid ${on ? "oklch(0.7 0.18 220 / 0.5)" : "oklch(0.98 0 0 / 0.1)"}`,
                          }}
                        >
                          {op}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    style={inputStyle}
                    value={(params[campo.chave] as string) ?? ""}
                    onChange={(e) => setParams((p) => ({ ...p, [campo.chave]: e.target.value }))}
                  />
                )}
              </Campo>
            ))}

            <motion.button
              type="button"
              whileTap={tapPress}
              onClick={() => void consultar()}
              disabled={consultando || !documento}
              style={{
                padding: "10px 20px",
                fontSize: 12,
                fontWeight: 600,
                background: consultando
                  ? "oklch(0.98 0 0 / 0.05)"
                  : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
                color: consultando ? "oklch(0.98 0 0 / 0.35)" : "oklch(0.98 0 0)",
                border: "1px solid oklch(0.7 0.18 220 / 0.3)",
                borderRadius: 10,
                cursor: consultando ? "not-allowed" : "pointer",
                alignSelf: "flex-start",
              }}
            >
              {consultando ? "Consultando..." : `Consultar · ${formatBRL(tipoSelecionado.custo)}`}
            </motion.button>
          </div>

          {/* Área de resultado */}
          {resultado ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.98 0 0 / 0.75)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                Resultado
              </div>
              <LaudoConsulta resultado={resultado} />
            </div>
          ) : (
            <Vazio mensagem="Resultado aparecerá aqui após a consulta" pequeno />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
