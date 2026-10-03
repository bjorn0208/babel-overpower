/**
 * Editor do fluxo de acompanhamento de um produto.
 *
 * Liga na coluna `agentes_usuario.product_flows` (JSON) — que JÁ alimenta a
 * página pública `/acompanhamento/:token` via RPC `obter_fluxo_publico_servico`.
 * Aqui o tenant configura os estágios e checkpoints daquele produto. Zero DDL.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { duration, easing, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizarListaFluxosPublico,
  type FluxoProduto,
  type FluxoStage,
} from "@/pages/public/acompanhamento-logica";

// product_flows não está no types gerado — mesmo cast usado no resto do app.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

type Estado = "carregando" | "pronto" | "salvando" | "erro";

interface EditorFluxoProps {
  produto: string;
  aberto: boolean;
  onFechar: () => void;
}

const CORES_ESTAGIO = ["#6366f1", "#F59E0B", "#8B5CF6", "#10B981", "#ef4444", "#3aa6c9"];

function idDe(label: string, usados: Set<string>): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  let cand = base || `item_${usados.size + 1}`;
  let i = 2;
  while (usados.has(cand)) cand = `${base}_${i++}`;
  usados.add(cand);
  return cand;
}

export function EditorFluxo({ produto, aberto, onFechar }: EditorFluxoProps) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [outros, setOutros] = useState<FluxoProduto[]>([]);
  const [stages, setStages] = useState<FluxoStage[]>([]);
  const [atencao, setAtencao] = useState<number>(7);
  const [atraso, setAtraso] = useState<number>(30);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setEstado("carregando");
    (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const tenantId = sessao?.session?.user.id;
        if (!tenantId) throw new Error("sem sessão");
        const sb = supabase as SupabaseBruto;
        const { data, error } = await sb
          .from("agentes_usuario")
          .select("product_flows")
          .eq("user_id", tenantId)
          .maybeSingle();
        if (error) throw error;
        if (!ativo) return;
        const flows = normalizarListaFluxosPublico(
          (data as { product_flows?: unknown } | null)?.product_flows,
        );
        const alvoNome = produto.trim().toLowerCase();
        const meu = flows.find((f) => (f.produto ?? "").trim().toLowerCase() === alvoNome);
        setOutros(flows.filter((f) => f !== meu));
        setStages(meu?.stages ?? []);
        setAtencao(meu?.timer_attention_days ?? 7);
        setAtraso(meu?.timer_late_days ?? 30);
        setEstado("pronto");
      } catch (e) {
        console.error("[EditorFluxo] carregar falhou:", e);
        if (ativo) setEstado("erro");
      }
    })();
    return () => { ativo = false; };
  }, [aberto, produto]);

  const usados = (): Set<string> => new Set(stages.map((s) => s.id));

  const addStage = () => {
    const u = usados();
    const cor = CORES_ESTAGIO[stages.length % CORES_ESTAGIO.length];
    setStages([...stages, { id: idDe(`estagio ${stages.length + 1}`, u), label: "Novo estágio", color: cor, checkpoints: [] }]);
  };
  const setStage = (i: number, patch: Partial<FluxoStage>) =>
    setStages(stages.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const rmStage = (i: number) => setStages(stages.filter((_, k) => k !== i));
  const addCp = (i: number) => {
    const s = stages[i];
    const u = new Set(s.checkpoints.map((c) => c.id));
    setStage(i, { checkpoints: [...s.checkpoints, { id: idDe("checkpoint", u), label: "Novo checkpoint" }] });
  };
  const setCp = (i: number, j: number, label: string) =>
    setStage(i, { checkpoints: stages[i].checkpoints.map((c, k) => (k === j ? { ...c, label } : c)) });
  const rmCp = (i: number, j: number) =>
    setStage(i, { checkpoints: stages[i].checkpoints.filter((_, k) => k !== j) });

  const salvar = async () => {
    setEstado("salvando");
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const tenantId = sessao?.session?.user.id;
      if (!tenantId) throw new Error("sem sessão");
      const fluxo: FluxoProduto = {
        produto,
        stages,
        timer_attention_days: atencao,
        timer_late_days: atraso,
      };
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("agentes_usuario")
        .update({ product_flows: [...outros, fluxo] })
        .eq("user_id", tenantId);
      if (error) throw error;
      const w = window as unknown as { useToast?: () => { success: (m: string) => void } };
      w.useToast?.().success("Fluxo salvo");
      onFechar();
    } catch (e) {
      console.error("[EditorFluxo] salvar falhou:", e);
      setEstado("erro");
    }
  };

  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.fast, ease: easing.outExpo }}
            onClick={onFechar}
            style={{ position: "absolute", inset: 0, background: "rgba(5,3,12,0.55)", zIndex: 40 }}
          />
          <motion.div
            role="dialog"
            aria-label={`Configurar fluxo de ${produto}`}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: duration.normal, ease: easing.outExpo }}
            style={{
              position: "absolute",
              inset: "8% 6%",
              background: "rgba(15,12,30,0.98)",
              border: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.12))",
              borderRadius: 14,
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
              zIndex: 41,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Fluxo de acompanhamento</div>
                <div className="muted tiny">{produto || "Produto sem nome"}</div>
              </div>
              <motion.button
                type="button"
                onClick={onFechar}
                whileTap={tapPress}
                aria-label="Fechar"
                className="btn btn-ghost btn-icon btn-sm"
                style={{ fontSize: 13 }}
              >
                ✕
              </motion.button>
            </div>

            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
              {estado === "carregando" && <div className="muted small">Carregando fluxo…</div>}
              {estado === "erro" && (
                <div className="small" style={{ color: "oklch(0.78 0.20 25)" }}>
                  Falha ao carregar/salvar o fluxo. Tente de novo.
                </div>
              )}
              {(estado === "pronto" || estado === "salvando") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label className="muted tiny" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      Dias para "Atenção"
                      <input
                        type="number"
                        min={1}
                        value={atencao}
                        onChange={(e) => setAtencao(Math.max(1, Number(e.target.value)))}
                        className="input"
                        style={{ width: 110 }}
                      />
                    </label>
                    <label className="muted tiny" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      Dias para "Atrasado"
                      <input
                        type="number"
                        min={1}
                        value={atraso}
                        onChange={(e) => setAtraso(Math.max(1, Number(e.target.value)))}
                        className="input"
                        style={{ width: 110 }}
                      />
                    </label>
                  </div>

                  {stages.length === 0 && (
                    <div className="muted small" style={{ fontStyle: "italic" }}>
                      Nenhum estágio ainda. Adicione o primeiro (ex: "Documentação").
                    </div>
                  )}

                  {stages.map((s, i) => (
                    <div
                      key={s.id}
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 10,
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="color"
                          value={s.color || "#6366f1"}
                          onChange={(e) => setStage(i, { color: e.target.value })}
                          aria-label="Cor do estágio"
                          style={{ width: 30, height: 30, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                        />
                        <input
                          value={s.label}
                          onChange={(e) => setStage(i, { label: e.target.value })}
                          aria-label="Nome do estágio"
                          className="input"
                          style={{ flex: 1, fontWeight: 600 }}
                        />
                        <motion.button
                          type="button"
                          onClick={() => rmStage(i)}
                          whileTap={tapPress}
                          aria-label={`Remover estágio ${s.label}`}
                          className="btn btn-ghost btn-icon btn-sm"
                          style={{ color: "oklch(0.78 0.20 25)" }}
                        >
                          🗑
                        </motion.button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 8 }}>
                        {s.checkpoints.map((c, j) => (
                          <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span aria-hidden="true" className="muted tiny">○</span>
                            <input
                              value={c.label}
                              onChange={(e) => setCp(i, j, e.target.value)}
                              aria-label="Nome do checkpoint"
                              className="input"
                              style={{ flex: 1, fontSize: 12 }}
                            />
                            <motion.button
                              type="button"
                              onClick={() => rmCp(i, j)}
                              whileTap={tapPress}
                              aria-label={`Remover checkpoint ${c.label}`}
                              className="btn btn-ghost btn-icon btn-sm"
                            >
                              ✕
                            </motion.button>
                          </div>
                        ))}
                        <motion.button
                          type="button"
                          onClick={() => addCp(i)}
                          whileTap={tapPress}
                          className="btn btn-ghost btn-sm"
                          style={{ alignSelf: "flex-start", fontSize: 11 }}
                        >
                          + checkpoint
                        </motion.button>
                      </div>
                    </div>
                  ))}

                  <motion.button
                    type="button"
                    onClick={addStage}
                    whileTap={tapPress}
                    className="btn btn-sm"
                    style={{ alignSelf: "flex-start" }}
                  >
                    + estágio
                  </motion.button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <motion.button type="button" onClick={onFechar} whileTap={tapPress} className="btn btn-ghost btn-sm">
                Cancelar
              </motion.button>
              <motion.button
                type="button"
                onClick={salvar}
                whileTap={tapPress}
                disabled={estado === "salvando" || estado === "carregando"}
                className="btn btn-primary btn-sm"
                style={{ opacity: estado === "salvando" || estado === "carregando" ? 0.5 : 1 }}
              >
                {estado === "salvando" ? "Salvando…" : "Salvar fluxo"}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
