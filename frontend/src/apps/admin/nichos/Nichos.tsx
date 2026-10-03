/**
 * App admin Nichos — gestão dos nichos da plataforma (nível do meio do RAG multi-escopo).
 * Criar, editar e ligar/desligar. Sem delete físico: nicho tem FK em profiles,
 * agentes e blocos — desativar é o caminho (some dos selects, quem já usa continua).
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, X, Check } from "lucide-react";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { Campo, Vazio, BotaoIcone, Toggle } from "../consulta/ui-admin";
import { supabase } from "@/integrations/supabase/client";
import { inputStyle, pegarToast } from "../consulta/tipos";
import type { SupabaseBruto } from "../consulta/tipos";

type Nicho = {
  id: string;
  slug: string;
  nome_exibicao: string;
  descricao: string | null;
  ativo: boolean;
};

type Contagens = Record<string, { tenants: number; blocos: number }>;

/** "Móveis Planejados" → "moveis-planejados" */
function gerarSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AppNichos() {
  const t = pegarToast();
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [contagens, setContagens] = useState<Contagens>({});
  const [carregando, setCarregando] = useState(true);
  const [edicao, setEdicao] = useState<Partial<Nicho> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const [{ data: ns }, { data: perfis }, { data: blocos }] = await Promise.all([
      sb.from("nichos").select("id, slug, nome_exibicao, descricao, ativo").order("nome_exibicao"),
      sb.from("profiles").select("nicho_id").is("deleted_at", null).not("nicho_id", "is", null),
      sb.from("blocos_conhecimento").select("nicho_id").eq("escopo", "nicho").is("deleted_at", null),
    ]);
    const cont: Contagens = {};
    for (const p of (perfis ?? []) as { nicho_id: string }[]) {
      cont[p.nicho_id] = cont[p.nicho_id] ?? { tenants: 0, blocos: 0 };
      cont[p.nicho_id].tenants += 1;
    }
    for (const b of (blocos ?? []) as { nicho_id: string }[]) {
      cont[b.nicho_id] = cont[b.nicho_id] ?? { tenants: 0, blocos: 0 };
      cont[b.nicho_id].blocos += 1;
    }
    setNichos((ns ?? []) as Nicho[]);
    setContagens(cont);
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function abrirNovo() {
    setEdicao({ nome_exibicao: "", slug: "", descricao: "", ativo: true });
  }

  async function salvar() {
    const nome = edicao?.nome_exibicao?.trim();
    const slug = edicao?.slug?.trim();
    if (!nome) { t.error("Nome é obrigatório."); return; }
    if (!edicao?.id && !slug) { t.error("Slug é obrigatório."); return; }
    if (!edicao?.id && nichos.some((n) => n.slug === slug)) { t.error("Já existe nicho com esse slug."); return; }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      if (edicao?.id) {
        // slug é imutável após criar (FKs e RAG apontam pra ele)
        const { error } = await sb.from("nichos")
          .update({ nome_exibicao: nome, descricao: edicao.descricao?.trim() || null })
          .eq("id", edicao.id);
        if (error) throw error;
        t.success("Nicho atualizado.");
      } else {
        const { error } = await sb.from("nichos")
          .insert({ slug, nome_exibicao: nome, descricao: edicao?.descricao?.trim() || null, ativo: true });
        if (error) throw error;
        t.success("Nicho criado.");
      }
      setEdicao(null);
      void carregar();
    } catch {
      t.error("Falha ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(n: Nicho, v: boolean) {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("nichos").update({ ativo: v }).eq("id", n.id);
      if (error) throw error;
      t.success(v ? "Nicho ativado." : "Nicho desativado — some dos selects; quem já usa continua.");
      void carregar();
    } catch {
      t.error("Falha ao salvar.");
    }
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ padding: 16, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Nichos da plataforma</div>
          <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
            Nível do meio do RAG: todo tenant do nicho herda os blocos dele. Desativar esconde o
            nicho pra novos cadastros — quem já usa continua funcionando.
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={abrirNovo}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            fontSize: 12, fontWeight: 600,
            background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
            color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            borderRadius: 10, cursor: "pointer",
          }}
        >
          <Plus size={13} /> Novo nicho
        </motion.button>
      </div>

      {carregando ? null : nichos.length === 0 ? (
        <Vazio mensagem="Nenhum nicho cadastrado ainda." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nichos.map((n) => {
            const c = contagens[n.id] ?? { tenants: 0, blocos: 0 };
            return (
              <motion.div
                key={n.id}
                layout
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: "oklch(0.18 0.06 280 / 0.4)",
                  border: "1px solid oklch(0.98 0 0 / 0.06)", borderRadius: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{n.nome_exibicao}</span>
                    <span style={{
                      fontSize: 10, fontFamily: "ui-monospace, monospace", padding: "2px 7px",
                      background: "oklch(0.98 0 0 / 0.06)", border: "1px solid oklch(0.98 0 0 / 0.08)",
                      borderRadius: 6, color: "oklch(0.98 0 0 / 0.7)",
                    }}>{n.slug}</span>
                    {!n.ativo && (
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 999,
                        background: "oklch(0.65 0.24 25 / 0.12)", color: "oklch(0.65 0.24 25)",
                        border: "1px solid oklch(0.65 0.24 25 / 0.25)",
                      }}>inativo</span>
                    )}
                  </div>
                  {n.descricao && (
                    <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginTop: 3 }}>{n.descricao}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 11, color: "oklch(0.98 0 0 / 0.6)" }}>
                  <div>{c.tenants} tenant{c.tenants === 1 ? "" : "s"}</div>
                  <div>{c.blocos} bloco{c.blocos === 1 ? "" : "s"} de nicho</div>
                </div>
                <Toggle ativo={n.ativo} onChange={(v) => void alternarAtivo(n, v)} rotulo="" />
                <BotaoIcone onClick={() => setEdicao({ ...n })} titulo="Editar nome e descrição">
                  <Edit2 size={13} />
                </BotaoIcone>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal — portal por fora (escapa do transform da janela), AnimatePresence dentro */}
      {createPortal(
        <AnimatePresence>
          {edicao && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEdicao(null)}
                style={{
                  position: "fixed", inset: 0, zIndex: 40,
                  background: "oklch(0.08 0.04 280 / 0.7)", backdropFilter: "blur(6px)",
                }}
              />
              <div style={{ position: "fixed", inset: 0, zIndex: 41, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 10 }}
                  style={{
                    width: 440, maxWidth: "100%", pointerEvents: "auto",
                    background: "oklch(0.15 0.05 280)", border: "1px solid oklch(0.98 0 0 / 0.1)",
                    borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                      {edicao.id ? "Editar nicho" : "Novo nicho"}
                    </span>
                    <BotaoIcone onClick={() => setEdicao(null)} titulo="Fechar"><X size={14} /></BotaoIcone>
                  </div>
                  <Campo label="Nome de exibição">
                    <input
                      style={inputStyle}
                      value={edicao.nome_exibicao ?? ""}
                      placeholder="Ex.: Energia Solar"
                      onChange={(e) => {
                        const nome = e.target.value;
                        setEdicao((ed) => ({
                          ...ed, nome_exibicao: nome,
                          // slug acompanha o nome só na criação, até o admin mexer nele
                          ...(ed?.id ? {} : { slug: gerarSlug(nome) }),
                        }));
                      }}
                    />
                  </Campo>
                  <Campo label={edicao.id ? "Slug (fixo após criar)" : "Slug"}>
                    <input
                      style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", opacity: edicao.id ? 0.5 : 1 }}
                      value={edicao.slug ?? ""}
                      disabled={!!edicao.id}
                      onChange={(e) => setEdicao((ed) => ({ ...ed, slug: gerarSlug(e.target.value) }))}
                    />
                  </Campo>
                  <Campo label="Descrição (opcional)">
                    <textarea
                      style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
                      value={edicao.descricao ?? ""}
                      placeholder="Pra que serve esse nicho, que tipo de negócio entra nele…"
                      onChange={(e) => setEdicao((ed) => ({ ...ed, descricao: e.target.value }))}
                    />
                  </Campo>
                  <motion.button
                    type="button"
                    whileTap={tapPress}
                    disabled={salvando}
                    onClick={() => void salvar()}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "9px 14px", fontSize: 12, fontWeight: 600,
                      background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.35), oklch(0.65 0.22 280 / 0.25))",
                      color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
                      borderRadius: 10, cursor: salvando ? "wait" : "pointer", opacity: salvando ? 0.6 : 1,
                    }}
                  >
                    <Check size={13} /> {edicao.id ? "Salvar" : "Criar nicho"}
                  </motion.button>
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
