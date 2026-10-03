/**
 * Coluna esquerda do app Base: pastas (grupos de contatos, nível único) +
 * contatos. Raiz = grade de pastas + soltos concluídos; pasta aberta = membros
 * (quem voltou pro Conversas aparece com selo "em conversa" — a pasta não
 * perde ninguém). Mover contato = painel inline, sem modal. Theus 2026-07-05.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Folder, FolderInput, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { criarPasta, excluirPasta, moverContatoParaPasta, renomearPasta, type PastaBase } from "./pastas-base";
import type { ContatoBase } from "./useBase";
import { tapPress } from "@/os/motion/presets";

interface ListaContatosBaseProps {
  contatos: ContatoBase[];
  pastas: PastaBase[];
  carregando: boolean;
  erro: string | null;
  tenantId: string | null;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  onMudou: () => Promise<void>;
}

export function ListaContatosBase({
  contatos, pastas, carregando, erro, tenantId, selecionadoId, onSelecionar, onMudou,
}: ListaContatosBaseProps) {
  const [pastaAbertaId, setPastaAbertaId] = useState<string | null>(null);
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [renomeando, setRenomeando] = useState(false);
  const [movendoId, setMovendoId] = useState<string | null>(null);

  const pastaAberta = useMemo(
    () => pastas.find((p) => p.id === pastaAbertaId) ?? null,
    [pastas, pastaAbertaId],
  );

  const membrosPorPasta = useMemo(() => {
    const mapa = new Map<string, ContatoBase[]>();
    for (const c of contatos) {
      if (!c.pasta_base_id) continue;
      mapa.set(c.pasta_base_id, [...(mapa.get(c.pasta_base_id) ?? []), c]);
    }
    return mapa;
  }, [contatos]);

  // Raiz: só soltos que estão de fato na Base; pasta aberta: membros (mesmo em conversa).
  const visiveis = useMemo(
    () => (pastaAberta
      ? membrosPorPasta.get(pastaAberta.id) ?? []
      : contatos.filter((c) => !c.pasta_base_id && !c.em_conversa)),
    [pastaAberta, membrosPorPasta, contatos],
  );

  const fmt = (n: number) => n.toLocaleString("pt-BR");

  const salvarPasta = async () => {
    if (!tenantId) return;
    const nome = nomeNovo.trim().slice(0, 80);
    if (!nome) { toast.error("Dê um nome pra pasta."); return; }
    try {
      if (renomeando && pastaAberta) {
        await renomearPasta(pastaAberta.id, nome);
        toast.success("Pasta renomeada. O chip no Conversas acompanha.");
      } else {
        await criarPasta(tenantId, nome);
        toast.success(`Pasta "${nome}" criada.`);
      }
      setNomeNovo(""); setCriandoPasta(false); setRenomeando(false);
      await onMudou();
    } catch {
      toast.error(renomeando ? "Falha ao renomear." : "Falha ao criar a pasta.");
    }
  };

  const removerPasta = async () => {
    if (!pastaAberta) return;
    try {
      await excluirPasta(pastaAberta.id);
      toast.success(`Pasta "${pastaAberta.nome}" removida. Contatos ficaram soltos na Base.`);
      setPastaAbertaId(null);
      await onMudou();
    } catch {
      toast.error("Falha ao remover a pasta.");
    }
  };

  const mover = async (leadId: string, pastaId: string | null) => {
    try {
      await moverContatoParaPasta(leadId, pastaId);
      toast.success(pastaId ? "Contato movido pra pasta." : "Contato tirado da pasta.");
      setMovendoId(null);
      await onMudou();
    } catch {
      toast.error("Falha ao mover o contato.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Barra: navegação + ações de pasta */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {pastaAberta ? (
          <>
            <motion.button whileTap={tapPress} type="button" onClick={() => { setPastaAbertaId(null); setRenomeando(false); setCriandoPasta(false); }}
              aria-label="Voltar pra raiz da Base" style={botaoIcone}>
              <ChevronLeft size={14} aria-hidden="true" />
            </motion.button>
            <Folder size={13} aria-hidden="true" style={{ color: "oklch(0.78 0.12 220)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pastaAberta.nome}
            </span>
            <div style={{ flex: 1 }} />
            <motion.button whileTap={tapPress} type="button" title="Renomear pasta" aria-label="Renomear pasta"
              onClick={() => { setRenomeando(!renomeando); setCriandoPasta(false); setNomeNovo(pastaAberta.nome); }} style={botaoIcone}>
              <Pencil size={12} aria-hidden="true" />
            </motion.button>
            <motion.button whileTap={tapPress} type="button" title="Remover pasta (contatos ficam soltos)" aria-label="Remover pasta"
              onClick={() => void removerPasta()} style={{ ...botaoIcone, color: "oklch(0.65 0.24 25)" }}>
              <Trash2 size={12} aria-hidden="true" />
            </motion.button>
          </>
        ) : (
          <>
            <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Pastas</span>
            <div style={{ flex: 1 }} />
            <motion.button whileTap={tapPress} type="button" onClick={() => { setCriandoPasta(!criandoPasta); setNomeNovo(""); }} style={botaoNovaPasta}>
              <Plus size={11} aria-hidden="true" /> Nova pasta
            </motion.button>
          </>
        )}
      </div>

      {(criandoPasta || renomeando) && (
        <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <input
            value={nomeNovo} maxLength={80} autoFocus
            placeholder={renomeando ? "Novo nome da pasta" : "Nome da pasta (ex: Grupo indicação)"}
            onChange={(e) => setNomeNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void salvarPasta(); if (e.key === "Escape") { setCriandoPasta(false); setRenomeando(false); } }}
            style={inputPasta}
          />
          <motion.button whileTap={tapPress} type="button" onClick={() => void salvarPasta()} style={botaoNovaPasta}>
            {renomeando ? "salvar" : "criar"}
          </motion.button>
        </div>
      )}

      {/* Grade de pastas (só na raiz) */}
      {!pastaAberta && pastas.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {pastas.map((p) => {
            const membros = membrosPorPasta.get(p.id) ?? [];
            const emConversa = membros.filter((m) => m.em_conversa).length;
            return (
              <motion.button key={p.id} whileTap={tapPress} type="button" onClick={() => setPastaAbertaId(p.id)}
                style={cardPasta} title={`Abrir pasta ${p.nome}`}>
                <Folder size={18} aria-hidden="true" style={{ color: "oklch(0.78 0.12 220)" }} />
                <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                <div className="tiny muted">
                  {fmt(membros.length)} contato(s){emConversa > 0 ? ` · ${fmt(emConversa)} em conversa` : ""}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <div className="tiny muted" style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {carregando ? "Carregando…" : erro ? "Erro ao carregar" : `${fmt(visiveis.length)} contato(s)${pastaAberta ? " na pasta" : " solto(s)"}`}
      </div>

      {/* Contatos */}
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!carregando && visiveis.length === 0 && (
          <div className="muted small" style={{ padding: 24, textAlign: "center" }}>
            {pastaAberta
              ? "Pasta vazia. Mova contatos pra cá pelo botão de pasta em cada contato."
              : "Nenhum contato solto na Base. Conversas concluídas ou arquivadas aparecem aqui."}
          </div>
        )}
        {visiveis.map((c) => {
          const ativo = c.id === selecionadoId;
          return (
            <div key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", background: ativo ? "rgba(255,255,255,0.06)" : "transparent" }}>
                <button
                  type="button"
                  onClick={() => onSelecionar(c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0,
                    padding: "10px 4px 10px 14px", background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", color: "inherit",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: c.foto_url ? `url(${c.foto_url}) center/cover` : "rgba(255,255,255,0.08)",
                      display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "var(--txt-2)",
                    }}
                  >
                    {!c.foto_url && (c.nome[0] ?? "?").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                      {c.em_conversa && (
                        <span className="tiny" title="Voltou pro app Conversas — segue na pasta" style={seloEmConversa}>em conversa</span>
                      )}
                    </div>
                    <div className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.produto || "sem produto"}{c.tags.length > 0 ? ` · ${c.tags.slice(0, 2).join(", ")}` : ""}
                    </div>
                  </div>
                </button>
                <motion.button whileTap={tapPress} type="button" title="Mover pra pasta" aria-label={`Mover ${c.nome} pra pasta`}
                  onClick={() => setMovendoId(movendoId === c.id ? null : c.id)}
                  style={{ ...botaoIcone, margin: "0 8px" }}>
                  <FolderInput size={14} aria-hidden="true" />
                </motion.button>
              </div>
              {movendoId === c.id && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 10px 60px" }}>
                  {pastas.filter((p) => p.id !== c.pasta_base_id).map((p) => (
                    <motion.button key={p.id} whileTap={tapPress} type="button" onClick={() => void mover(c.id, p.id)} style={opcaoPasta}>
                      <Folder size={10} aria-hidden="true" /> {p.nome}
                    </motion.button>
                  ))}
                  {c.pasta_base_id && (
                    <motion.button whileTap={tapPress} type="button" onClick={() => void mover(c.id, null)} style={{ ...opcaoPasta, color: "oklch(0.98 0 0 / 0.6)" }}>
                      tirar da pasta
                    </motion.button>
                  )}
                  {pastas.length === 0 && (
                    <span className="tiny muted">Crie uma pasta primeiro (botão “Nova pasta”).</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const botaoIcone: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 8, cursor: "pointer", flexShrink: 0,
  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent", color: "oklch(0.98 0 0 / 0.7)",
};
const botaoNovaPasta: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
  color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
  background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
};
const inputPasta: React.CSSProperties = {
  flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 8, color: "oklch(0.98 0 0)",
  border: "1px solid oklch(0.98 0 0 / 0.12)", background: "oklch(0.18 0.06 280 / 0.35)", outline: "none",
};
const cardPasta: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4, textAlign: "left", cursor: "pointer",
  padding: "10px 11px", borderRadius: 10, color: "inherit",
  background: "oklch(0.18 0.06 280 / 0.35)", border: "1px solid oklch(0.98 0 0 / 0.08)",
};
const seloEmConversa: React.CSSProperties = {
  flexShrink: 0, padding: "1px 6px", borderRadius: 999,
  background: "oklch(0.72 0.18 145 / 0.12)", border: "1px solid oklch(0.72 0.18 145 / 0.35)",
  color: "oklch(0.72 0.18 145)",
};
const opcaoPasta: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, padding: "4px 9px", borderRadius: 999, cursor: "pointer",
  border: "1px solid oklch(0.7 0.18 220 / 0.3)", background: "oklch(0.7 0.18 220 / 0.1)",
  color: "oklch(0.78 0.12 220)",
};
