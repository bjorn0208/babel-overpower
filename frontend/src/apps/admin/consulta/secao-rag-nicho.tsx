/**
 * Seção RAG (nicho) — admin cadastra o conhecimento de venda da consulta
 * por NICHO (padrão pra todos os tenants daquele nicho).
 * Grava em blocos_conhecimento: escopo='nicho', nicho_id, category='consulta'.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { Vazio } from "./ui-admin";
import { inputStyle, pegarToast } from "./tipos";
import type { SupabaseBruto } from "./tipos";

interface Nicho {
  id: string;
  nome_exibicao: string;
}
interface BlocoRag {
  id: string;
  title: string;
  content: string;
}

const selectStyle = { ...inputStyle, appearance: "auto" as const };

export function SecaoRagNicho() {
  const t = pegarToast();
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [nichoSel, setNichoSel] = useState<string>("");
  const [blocos, setBlocos] = useState<BlocoRag[]>([]);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoConteudo, setNovoConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregarBlocos = useCallback(async (nichoId: string) => {
    if (!nichoId) { setBlocos([]); return; }
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("blocos_conhecimento")
      .select("id, title, content")
      .eq("nicho_id", nichoId)
      .eq("category", "consulta")
      .eq("escopo", "nicho")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setBlocos((data ?? []) as BlocoRag[]);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = supabase as SupabaseBruto;
      const { data } = await sb
        .from("nichos")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao", { ascending: true });
      const lista = (data ?? []) as Nicho[];
      setNichos(lista);
      // default: limpa-nome se existir, senão o primeiro
      const limpa = lista.find((n) => /limpa/i.test(n.nome_exibicao));
      const inicial = limpa?.id ?? lista[0]?.id ?? "";
      setNichoSel(inicial);
      if (inicial) await carregarBlocos(inicial);
      setCarregando(false);
    })();
  }, [carregarBlocos]);

  async function trocarNicho(id: string) {
    setNichoSel(id);
    await carregarBlocos(id);
  }

  async function adicionar() {
    if (!nichoSel) { t.error("Escolha um nicho."); return; }
    if (!novoTitulo.trim() || !novoConteudo.trim()) { t.error("Preencha título e conteúdo."); return; }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("blocos_conhecimento").insert({
        nicho_id: nichoSel,
        title: novoTitulo.trim(),
        content: novoConteudo.trim(),
        category: "consulta",
        escopo: "nicho",
        tipo: "resposta",
        embedding_status: "pendente",
        ativo: true,
      });
      if (error) throw error;
      t.success("Conhecimento do nicho adicionado.");
      setNovoTitulo(""); setNovoConteudo("");
      await carregarBlocos(nichoSel);
    } catch {
      t.error("Falha ao adicionar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    try {
      const sb = supabase as SupabaseBruto;
      // `ativo: false` junto com `deleted_at`: as RPCs busca_hibrida_* filtram por `ativo`,
      // nunca por `deleted_at`. Sem isso o bloco de NICHO sumia da tela e continuava vivo no
      // RAG de todos os tenants daquele nicho. Mesma regra do acoes-gaveta.ts:52.
      const { error } = await sb
        .from("blocos_conhecimento")
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("id", id);
      if (error) throw error;
      await carregarBlocos(nichoSel);
    } catch {
      t.error("Falha ao excluir.");
    }
  }

  if (carregando) {
    return <div style={{ padding: 40, textAlign: "center", color: "oklch(0.98 0 0 / 0.4)", fontSize: 12 }}>Carregando…</div>;
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ padding: 4, maxWidth: 620 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>RAG de venda — por nicho</div>
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
          Conhecimento padrão de como o agente vende/explica a consulta. Vale pra TODOS os tenants do nicho (o tenant pode somar os dele na aba Agente do app).
        </div>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.98 0 0 / 0.6)", display: "block", marginBottom: 6 }}>Nicho</label>
        <select style={selectStyle} value={nichoSel} onChange={(e) => void trocarNicho(e.target.value)}>
          {nichos.map((n) => <option key={n.id} value={n.id}>{n.nome_exibicao}</option>)}
        </select>
      </div>

      {blocos.length === 0 ? (
        <Vazio mensagem="Nenhum bloco de conhecimento neste nicho ainda." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {blocos.map((b) => (
            <div key={b.id} style={{ padding: "10px 12px", background: "oklch(0.18 0.06 280 / 0.4)", border: "1px solid oklch(0.98 0 0 / 0.07)", borderRadius: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{b.title}</div>
                <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.6)", marginTop: 2, lineHeight: 1.4 }}>{b.content}</div>
              </div>
              <button type="button" onClick={() => void excluir(b.id)} title="Excluir"
                style={{ background: "none", border: "none", color: "oklch(0.65 0.24 25)", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid oklch(0.98 0 0 / 0.07)", paddingTop: 14 }}>
        <input style={inputStyle} value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Título (ex: Como abordar quem tem dúvida sobre o nome)" />
        <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} value={novoConteudo} onChange={(e) => setNovoConteudo(e.target.value)} placeholder="O que o agente deve saber/falar pra vender a consulta neste nicho…" />
        <motion.button type="button" whileTap={tapPress} onClick={() => void adicionar()} disabled={salvando}
          style={{ alignSelf: "flex-start", padding: "9px 18px", fontSize: 12, fontWeight: 600, background: "oklch(0.7 0.18 220 / 0.2)", color: "oklch(0.85 0.12 220)", border: "1px solid oklch(0.7 0.18 220 / 0.35)", borderRadius: 10, cursor: salvando ? "not-allowed" : "pointer" }}>
          {salvando ? "Adicionando…" : "+ Adicionar conhecimento ao nicho"}
        </motion.button>
      </div>
    </motion.div>
  );
}
