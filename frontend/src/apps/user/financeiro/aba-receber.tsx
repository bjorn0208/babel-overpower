/**
 * Aba A Receber — parcelas de contratos assinados (geradas pelo trigger
 * `gerar_recebiveis_do_contrato`) + recebíveis manuais. Marcar como recebida
 * cria a ENTRADA correspondente no caixa (`movimentos_financeiros`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { parseMoedaBR } from "@/lib/moeda";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { formatBRL, inputStyle, type SupabaseBruto, type ToastApi } from "./tipos";

type Recebivel = {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: "pendente" | "recebida" | "cancelada";
  recebida_em: string | null;
  lead_id: string | null;
  origem: "contrato" | "manual";
};

type Props = { ownerId: string | null; t: ToastApi; aoMudarCaixa?: () => void };

export function AbaReceber({ ownerId, t, aoMudarCaixa }: Props) {
  const [itens, setItens] = useState<Recebivel[]>([]);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [form, setForm] = useState({ descricao: "", valor: "", vencimento: "" });

  const carregar = useCallback(async () => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("contas_a_receber")
      .select("id, descricao, valor, vencimento, status, recebida_em, lead_id, origem")
      .eq("tenant_id", ownerId)
      .is("deleted_at", null)
      .neq("status", "cancelada")
      .order("vencimento", { ascending: true })
      .limit(300);
    if (error) { t.error("Falha ao carregar os recebíveis."); return; }
    setItens((data ?? []) as Recebivel[]);
  }, [ownerId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const { pendentes, recebidas, totalPendente, atrasadas } = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const p = itens.filter((i) => i.status === "pendente");
    return {
      pendentes: p,
      recebidas: itens.filter((i) => i.status === "recebida").slice(-20).reverse(),
      totalPendente: p.reduce((s, i) => s + Number(i.valor), 0),
      atrasadas: p.filter((i) => i.vencimento < hoje).length,
    };
  }, [itens]);

  const marcarRecebida = async (r: Recebivel) => {
    if (!ownerId || marcando) return;
    setMarcando(r.id);
    const sb = supabase as SupabaseBruto;
    try {
      const { data: mov, error: movErr } = await sb
        .from("movimentos_financeiros")
        .insert({
          owner_id: ownerId,
          tipo: "entrada",
          valor: r.valor,
          descricao: r.descricao,
          categoria: "recebiveis",
          origem: "manual", // lançamento manual do dono; CHECK só aceita manual|agente_wpp|comprovante|extrato
          lead_id: r.lead_id,
          data_movimento: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (movErr) throw movErr;
      const { error } = await sb
        .from("contas_a_receber")
        .update({ status: "recebida", recebida_em: new Date().toISOString(), movimento_id: mov.id, atualizado_em: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
      t.success(`${formatBRL(Number(r.valor))} entrou no caixa`);
      await carregar();
      aoMudarCaixa?.();
    } catch (e) {
      console.error("[Financeiro] marcar recebida falhou:", e);
      t.error("Falha ao marcar como recebida");
    } finally {
      setMarcando(null);
    }
  };

  const cancelar = async (r: Recebivel) => {
    if (!confirm(`Cancelar "${r.descricao}"? Ela some da lista de a receber.`)) return;
    const sb = supabase as SupabaseBruto;
    const { error } = await sb
      .from("contas_a_receber")
      .update({ status: "cancelada", atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    if (error) { t.error("Falha ao cancelar"); return; }
    void carregar();
  };

  const criarManual = async () => {
    if (!ownerId || ocupado) return;
    const valor = parseMoedaBR(form.valor);
    if (!form.descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !form.vencimento) {
      t.error("Preencha descrição, valor e vencimento");
      return;
    }
    setOcupado(true);
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("contas_a_receber").insert({
      tenant_id: ownerId,
      descricao: form.descricao.trim(),
      valor,
      vencimento: form.vencimento,
      origem: "manual",
    });
    setOcupado(false);
    if (error) { t.error("Falha ao criar"); return; }
    setForm({ descricao: "", valor: "", vencimento: "" });
    setCriando(false);
    void carregar();
  };

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="os-vidro" style={{ padding: "12px 16px", borderRadius: 12, minWidth: 180 }}>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>A receber</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "oklch(0.78 0.16 145)" }}>{formatBRL(totalPendente)}</div>
          <div className="muted tiny">{pendentes.length} {pendentes.length === 1 ? "parcela pendente" : "parcelas pendentes"}</div>
        </div>
        {atrasadas > 0 && (
          <div className="os-vidro" style={{ padding: "12px 16px", borderRadius: 12, minWidth: 150, border: "1px solid oklch(0.65 0.24 25 / 0.4)" }}>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>Atrasadas</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "oklch(0.65 0.24 25)" }}>{atrasadas}</div>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <motion.button
          type="button"
          className="btn btn-primary btn-sm"
          whileTap={tapPress}
          onClick={() => setCriando((v) => !v)}
          style={{ alignSelf: "flex-start" }}
        >
          + Recebível manual
        </motion.button>
      </div>

      {criando && (
        <div className="os-vidro" style={{ padding: 14, borderRadius: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inputStyle, flex: 2, minWidth: 180 }} placeholder="Descrição (ex: Setup parceiro X)" value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          <input style={{ ...inputStyle, width: 110 }} placeholder="Valor (R$)" value={form.valor}
            onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
          <input style={{ ...inputStyle, width: 150 }} type="date" value={form.vencimento}
            onChange={(e) => setForm((f) => ({ ...f, vencimento: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={() => void criarManual()} disabled={ocupado}>Salvar</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCriando(false)}>Cancelar</button>
        </div>
      )}

      {/* pendentes */}
      <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>Pendentes</div>
      {pendentes.length === 0 ? (
        <span className="muted tiny">Nada a receber por enquanto — contratos assinados entram aqui sozinhos.</span>
      ) : (
        pendentes.map((r) => {
          const atrasada = r.vencimento < hoje;
          return (
            <div key={r.id} className="os-vidro" style={{ padding: "10px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, border: atrasada ? "1px solid oklch(0.65 0.24 25 / 0.4)" : "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao}</div>
                <div className="muted tiny">
                  vence {new Date(r.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                  {atrasada ? " · atrasada" : ""}{r.origem === "contrato" ? " · do contrato" : ""}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.78 0.16 145)" }}>{formatBRL(Number(r.valor))}</span>
              <motion.button type="button" className="btn btn-primary btn-sm" whileTap={tapPress}
                disabled={marcando === r.id}
                onClick={() => void marcarRecebida(r)}>
                {marcando === r.id ? "Lançando…" : "✓ Recebi"}
              </motion.button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ opacity: 0.6 }} onClick={() => void cancelar(r)} aria-label={`Cancelar ${r.descricao}`}>✕</button>
            </div>
          );
        })
      )}

      {/* recebidas recentes */}
      {recebidas.length > 0 && (
        <>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6 }}>Recebidas recentes</div>
          {recebidas.map((r) => (
            <div key={r.id} style={{ padding: "8px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.02)" }}>
              <div className="muted" style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao}</div>
              <span className="muted tiny">{r.recebida_em ? new Date(r.recebida_em).toLocaleDateString("pt-BR") : ""}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.72 0.18 145)" }}>{formatBRL(Number(r.valor))}</span>
            </div>
          ))}
        </>
      )}
    </motion.div>
  );
}
