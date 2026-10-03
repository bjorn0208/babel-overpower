/**
 * Aba Metas — objetivos de compra/investimento com foto e progresso.
 * Cadastra meta (valor alvo + foto opcional), registra aporte manual
 * (vira saída "investimento" no caixa) e acompanha até bater o alvo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { parseMoedaBR } from "@/lib/moeda";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { formatBRL, inputStyle, type SupabaseBruto, type ToastApi } from "./tipos";

type Meta = {
  id: string;
  titulo: string;
  valor_alvo: number;
  foto_path: string | null;
  status: string;
  juntado: number;
  foto_url?: string | null;
};

type Props = { ownerId: string | null; t: ToastApi };

export function AbaMetas({ ownerId, t }: Props) {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState({ titulo: "", valor: "" });
  const [foto, setFoto] = useState<File | null>(null);
  const [aporte, setAporte] = useState<{ id: string; valor: string } | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("metas_financeiras")
      .select("id, titulo, valor_alvo, foto_path, status")
      .eq("tenant_id", ownerId)
      .is("deleted_at", null)
      .order("criado_em", { ascending: false });
    if (error) { t.error("Falha ao carregar as metas."); return; }
    const lista = (data ?? []) as Meta[];
    for (const m of lista) {
      const { data: aportes } = await sb
        .from("movimentos_financeiros").select("valor").eq("meta_id", m.id).is("deleted_at", null);
      m.juntado = ((aportes ?? []) as Array<{ valor: number }>).reduce((s, a) => s + (Number(a.valor) || 0), 0);
      if (m.foto_path) {
        const { data: url } = await sb.storage.from("financeiro").createSignedUrl(m.foto_path, 3600);
        m.foto_url = url?.signedUrl ?? null;
      }
    }
    setMetas([...lista]);
  }, [ownerId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const cadastrar = async () => {
    if (!ownerId) return;
    const valor = parseMoedaBR(form.valor);
    if (!form.titulo.trim()) { t.error("Dê um nome pra meta."); return; }
    if (!Number.isFinite(valor) || valor <= 0) { t.error("Valor alvo inválido."); return; }
    setOcupado(true);
    const sb = supabase as SupabaseBruto;
    let fotoPath: string | null = null;
    try {
      if (foto) {
        const ext = /\.(png|webp)$/i.test(foto.name) ? foto.name.split(".").pop()!.toLowerCase() : "jpg";
        fotoPath = `${ownerId}/metas/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await sb.storage.from("financeiro")
          .upload(fotoPath, foto, { contentType: foto.type || "image/jpeg" });
        if (upErr) { fotoPath = null; t.info("Foto não subiu — meta criada sem foto."); }
      }
      const { error } = await sb.from("metas_financeiras").insert({
        tenant_id: ownerId,
        titulo: form.titulo.trim().slice(0, 120),
        valor_alvo: valor,
        foto_path: fotoPath,
      });
      if (error) { t.error("Falha ao criar a meta."); return; }
      setCriando(false);
      setForm({ titulo: "", valor: "" });
      setFoto(null);
      t.success("Meta criada — bora juntar!");
      void carregar();
    } finally {
      setOcupado(false);
    }
  };

  const registrarAporte = async (m: Meta) => {
    // Guard de duplo clique: mesmo `ocupado` do cadastro evita aporte dobrado.
    if (!ownerId || !aporte || aporte.id !== m.id || ocupado) return;
    const valor = parseMoedaBR(aporte.valor);
    if (!Number.isFinite(valor) || valor <= 0) { t.error("Valor inválido."); return; }
    setOcupado(true);
    const sb = supabase as SupabaseBruto;
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const { error } = await sb.from("movimentos_financeiros").insert({
        owner_id: ownerId,
        tipo: "saida",
        valor,
        descricao: `Aporte pra meta: ${m.titulo}`,
        categoria: "investimento",
        data_movimento: hoje,
        origem: "manual",
        meta_id: m.id,
        carga: {},
      });
      if (error) { t.error("Falha ao registrar o aporte."); return; }
      const novoTotal = m.juntado + valor;
      if (novoTotal >= Number(m.valor_alvo)) {
        await sb.from("metas_financeiras").update({ status: "concluida" }).eq("id", m.id);
        t.success(`Meta "${m.titulo}" batida! 🎉`);
      } else {
        t.success(`Aporte registrado — faltam ${formatBRL(Number(m.valor_alvo) - novoTotal)}.`);
      }
      setAporte(null);
      void carregar();
    } finally {
      setOcupado(false);
    }
  };

  const excluir = async (m: Meta) => {
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("metas_financeiras")
      .update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
    if (error) { t.error("Falha ao excluir."); return; }
    t.success("Meta excluída.");
    void carregar();
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.6)", margin: 0 }}>
          O que você quer comprar ou investir. Cada aporte aproxima do alvo — pelo app ou falando com o agente.
        </p>
        <div style={{ flex: 1 }} />
        <motion.button whileTap={tapPress} type="button" onClick={() => setCriando(!criando)} style={botaoPrimario}>
          {criando ? "fechar" : "+ Nova meta"}
        </motion.button>
      </div>

      {criando && (
        <div style={{ ...moldura, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={inputStyle} value={form.titulo} maxLength={120} placeholder="Objetivo (ex: impressora nova)"
            onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, width: 150 }} value={form.valor} inputMode="decimal" placeholder="Valor alvo"
              onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <input ref={fotoRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { setFoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <motion.button whileTap={tapPress} type="button" onClick={() => fotoRef.current?.click()} style={botaoAcao}>
              {foto ? `foto: ${foto.name.slice(0, 24)}` : "adicionar foto"}
            </motion.button>
            <div style={{ flex: 1 }} />
            <motion.button whileTap={tapPress} type="button" disabled={ocupado} onClick={() => void cadastrar()}
              style={{ ...botaoPrimario, opacity: ocupado ? 0.6 : 1 }}>
              {ocupado ? "salvando…" : "salvar"}
            </motion.button>
          </div>
        </div>
      )}

      {metas.length === 0 && !criando ? (
        <div style={vazio}>Nenhuma meta ainda. Crie uma com foto do que você quer conquistar.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {metas.map((m) => {
            const alvo = Number(m.valor_alvo);
            const pct = Math.min(100, Math.round((m.juntado / alvo) * 100));
            const concluida = m.status === "concluida" || m.juntado >= alvo;
            return (
              <div key={m.id} style={{ ...moldura, padding: 0, overflow: "hidden" }}>
                {m.foto_url && (
                  <img src={m.foto_url} alt={m.titulo}
                    style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                )}
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                    {m.titulo}{concluida ? " ✓" : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.6)", margin: "4px 0 8px" }}>
                    {formatBRL(m.juntado)} de {formatBRL(alvo)} ({pct}%)
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "oklch(0.98 0 0 / 0.08)", overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%", borderRadius: 999,
                      background: concluida
                        ? "oklch(0.72 0.18 145)"
                        : "linear-gradient(90deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
                    }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                    {!concluida && (aporte?.id === m.id ? (
                      <>
                        <input style={{ ...inputStyle, width: 100, padding: "5px 8px" }} autoFocus
                          value={aporte.valor} inputMode="decimal" placeholder="Valor"
                          onChange={(e) => setAporte({ id: m.id, valor: e.target.value })} />
                        <motion.button whileTap={tapPress} type="button" disabled={ocupado} onClick={() => void registrarAporte(m)}
                          style={{ ...botaoAcao, color: "oklch(0.72 0.18 145)", opacity: ocupado ? 0.6 : 1 }}>
                          ok
                        </motion.button>
                        <motion.button whileTap={tapPress} type="button" onClick={() => setAporte(null)} style={botaoAcao}>
                          x
                        </motion.button>
                      </>
                    ) : (
                      <motion.button whileTap={tapPress} type="button"
                        onClick={() => setAporte({ id: m.id, valor: "" })} style={botaoAcao}>
                        + aporte
                      </motion.button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <motion.button whileTap={tapPress} type="button" onClick={() => void excluir(m)}
                      style={{ ...botaoAcao, color: "oklch(0.65 0.24 25)" }}>
                      excluir
                    </motion.button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

const moldura: React.CSSProperties = {
  padding: "11px 14px", borderRadius: 10,
  background: "oklch(0.18 0.06 280 / 0.25)", border: "1px solid oklch(0.98 0 0 / 0.06)",
};
const vazio: React.CSSProperties = {
  padding: "36px 0", textAlign: "center", color: "oklch(0.98 0 0 / 0.45)", fontSize: 13,
};
const botaoPrimario: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 10, cursor: "pointer",
  color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
  background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
};
const botaoAcao: React.CSSProperties = {
  fontSize: 10, padding: "4px 8px", borderRadius: 8, whiteSpace: "nowrap",
  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent",
  color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer",
};
