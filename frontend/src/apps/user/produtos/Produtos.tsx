/**
 * App Produtos — Onda 7.2 (2026-05-13).
 *
 * Grid de produtos do tenant + view detalhe com conhecimento embarcado.
 * Lê `public.produtos` (1 row Diego) + `public.produto_conhecimento` agrupado por `tipo`.
 *
 * Tipos reais Diego: objecao (8) · faq (7) · conhecimento (7) · pagamento (2) · preco (1).
 */

import { useCallback, useEffect, useState } from "react";
import { obterTenantId } from "@/data/tenant-atual";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSincronizarBlocos } from "@/hooks/use-sincronizar-blocos";
import { SecaoMidias } from "./secao-midias";
import { SecaoPagamentoProduto } from "./secao-pagamento-produto";
import { duration, easing, springSnap, stagger, staggerItem } from "@/os/motion/presets";

/**
 * Helper: converte oklch(L C H) em oklch(L C H / alpha).
 * Necessário porque CSS NÃO entende `${oklch(...)}/40` — produz string inválida.
 */
function corComAlpha(cor: string, alpha: number): string {
  const m = cor.match(/^oklch\(([^)]+)\)$/);
  if (!m) return cor;
  return `oklch(${m[1]} / ${alpha})`;
}

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

interface Produto {
  id: string;
  nome: string;
  slug: string | null;
  descricao_curta: string | null;
  palavras_chave: string[];
  prazo_entrega: string | null;
  garantia: string | null;
  ativo: boolean;
  ordem: number;
  metadata: Record<string, unknown>;
}

interface ConhecimentoItem {
  id: string;
  produto_id: string;
  tipo: string;
  titulo: string;
  conteudo: string;
  ordem: number;
}

const TIPOS_ORDEM = ["descricao", "conhecimento", "preco", "pagamento", "garantia", "processo", "faq", "objecao"] as const;

const ROTULO_TIPO: Record<string, string> = {
  descricao: "Descrição",
  conhecimento: "Conhecimento",
  preco: "Preço",
  pagamento: "Pagamento",
  garantia: "Garantia",
  processo: "Processo",
  faq: "FAQ",
  objecao: "Objeções",
};

const COR_TIPO: Record<string, string> = {
  descricao: "oklch(0.7 0.18 220)",
  conhecimento: "oklch(0.65 0.22 280)",
  preco: "oklch(0.78 0.20 80)",
  pagamento: "oklch(0.72 0.20 145)",
  garantia: "oklch(0.72 0.20 30)",
  processo: "oklch(0.70 0.18 200)",
  faq: "oklch(0.65 0.18 260)",
  objecao: "oklch(0.70 0.20 25)",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

export function Produtos() {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const { sync } = useSincronizarBlocos(ownerId);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [conhecimento, setConhecimento] = useState<ConhecimentoItem[]>([]);
  const [carregandoConhecimento, setCarregandoConhecimento] = useState(false);

  const carregarProdutos = useCallback(async () => {
    try {
      // Δ 2026-09-17: era o `uid` do logado. Membro de equipe via lista vazia e
      // gravava com o id dele (invisível pro dono). Agora usa o dono da conta.
      const uid = await obterTenantId();
      if (!uid) {
        setCarregando(false);
        return;
      }
      setOwnerId(uid);
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("produtos")
        .select("id, nome, slug, descricao_curta, palavras_chave, prazo_entrega, garantia, ativo, ordem, metadata")
        .eq("user_id", uid)
        .order("ordem", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      setProdutos(
        rows.map((d) => ({
          id: String(d.id),
          nome: String(d.nome ?? ""),
          slug: d.slug ? String(d.slug) : null,
          descricao_curta: d.descricao_curta ? String(d.descricao_curta) : null,
          palavras_chave: Array.isArray(d.palavras_chave)
            ? (d.palavras_chave as unknown[]).filter((x): x is string => typeof x === "string")
            : [],
          prazo_entrega: d.prazo_entrega ? String(d.prazo_entrega) : null,
          garantia: d.garantia ? String(d.garantia) : null,
          ativo: d.ativo !== false,
          ordem: Number(d.ordem ?? 0),
          metadata: (d.metadata as Record<string, unknown>) ?? {},
        })),
      );
    } catch (e) {
      console.error("[Produtos] carregar falhou:", e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarProdutos();
  }, [carregarProdutos]);

  const carregarConhecimento = useCallback(async (produtoId: string) => {
    setCarregandoConhecimento(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("produto_conhecimento")
        .select("id, produto_id, tipo, titulo, conteudo, ordem")
        .eq("produto_id", produtoId)
        .order("tipo", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      setConhecimento(
        rows.map((d) => ({
          id: String(d.id),
          produto_id: String(d.produto_id),
          tipo: String(d.tipo ?? "conhecimento"),
          titulo: String(d.titulo ?? ""),
          conteudo: String(d.conteudo ?? ""),
          ordem: Number(d.ordem ?? 0),
        })),
      );
    } catch (e) {
      console.error("[Produtos] conhecimento falhou:", e);
      setConhecimento([]);
    } finally {
      setCarregandoConhecimento(false);
    }
  }, []);

  useEffect(() => {
    if (selecionadoId) void carregarConhecimento(selecionadoId);
  }, [selecionadoId, carregarConhecimento]);

  async function salvarProduto(p: Produto) {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("produtos")
        .update({
          nome: p.nome,
          slug: p.slug || null,
          descricao_curta: p.descricao_curta || null,
          palavras_chave: p.palavras_chave,
          prazo_entrega: p.prazo_entrega || null,
          garantia: p.garantia || null,
          ativo: p.ativo,
          metadata: p.metadata,
        })
        .eq("id", p.id);
      if (error) throw error;
      setProdutos((xs) => xs.map((x) => (x.id === p.id ? p : x)));
      t.success("Produto salvo");
      void sync(); // regenera o RAG do agente com o produto atualizado
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function salvarConhecimento(c: ConhecimentoItem) {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("produto_conhecimento")
        .update({ tipo: c.tipo, titulo: c.titulo, conteudo: c.conteudo, ordem: c.ordem })
        .eq("id", c.id);
      if (error) throw error;
      setConhecimento((xs) => xs.map((x) => (x.id === c.id ? c : x)));
      t.success("Item salvo");
      void sync(); // regenera o RAG do agente com o conhecimento atualizado
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function adicionarConhecimento(produtoId: string, tipo: string) {
    try {
      const sb = supabase as SupabaseBruto;
      const ordemNova = conhecimento.filter((c) => c.tipo === tipo).length;
      const { data, error } = await sb
        .from("produto_conhecimento")
        .insert({ produto_id: produtoId, tipo, titulo: "Novo item", conteudo: "", ordem: ordemNova })
        .select("id, produto_id, tipo, titulo, conteudo, ordem")
        .single();
      if (error) throw error;
      const d = data as Record<string, unknown>;
      setConhecimento((xs) => [
        ...xs,
        {
          id: String(d.id),
          produto_id: String(d.produto_id),
          tipo: String(d.tipo),
          titulo: String(d.titulo ?? ""),
          conteudo: String(d.conteudo ?? ""),
          ordem: Number(d.ordem ?? 0),
        },
      ]);
      t.success("Item adicionado");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function removerConhecimento(id: string) {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("produto_conhecimento").delete().eq("id", id);
      if (error) throw error;
      setConhecimento((xs) => xs.filter((x) => x.id !== id));
      t.info?.("Item removido");
      void sync(); // regenera o RAG do agente sem o conhecimento removido
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function criarProduto() {
    if (!ownerId) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("produtos")
        .insert({ user_id: ownerId, nome: "Novo produto", ativo: true, ordem: produtos.length })
        .select("id, nome, slug, descricao_curta, palavras_chave, prazo_entrega, garantia, ativo, ordem, metadata")
        .single();
      if (error) throw error;
      const d = data as Record<string, unknown>;
      const novo: Produto = {
        id: String(d.id),
        nome: String(d.nome ?? ""),
        slug: null,
        descricao_curta: null,
        palavras_chave: [],
        prazo_entrega: null,
        garantia: null,
        ativo: true,
        ordem: Number(d.ordem ?? 0),
        metadata: {},
      };
      setProdutos((xs) => [...xs, novo]);
      setSelecionadoId(novo.id);
      t.success("Produto criado");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function alternarAtivo(p: Produto) {
    const novoAtivo = !p.ativo;
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("produtos").update({ ativo: novoAtivo }).eq("id", p.id);
      if (error) throw error;
      setProdutos((xs) => xs.map((x) => (x.id === p.id ? { ...x, ativo: novoAtivo } : x)));
      t.success(novoAtivo ? "Produto ativado — o agente volta a oferecer" : "Produto desativado — o agente não oferece mais");
      void sync(); // regenera o RAG do agente respeitando o ativo novo
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function excluirProduto(p: Produto) {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("produtos").delete().eq("id", p.id);
      if (error) throw error;
      setProdutos((xs) => xs.filter((x) => x.id !== p.id));
      setSelecionadoId(null);
      t.success(`Produto "${p.nome}" excluído`);
      void sync(); // regenera o RAG do agente sem o produto excluído
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  if (carregando) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--txt-3)",
        }}
      >
        Carregando produtos…
      </div>
    );
  }

  const selecionado = produtos.find((p) => p.id === selecionadoId) ?? null;

  if (selecionado) {
    return (
      <Detalhe
        produto={selecionado}
        conhecimento={conhecimento}
        carregandoConhecimento={carregandoConhecimento}
        onVoltar={() => setSelecionadoId(null)}
        onSalvarProduto={(p) => void salvarProduto(p)}
        onSalvarConhecimento={(c) => void salvarConhecimento(c)}
        onAdicionarConhecimento={(tipo) => void adicionarConhecimento(selecionado.id, tipo)}
        onRemoverConhecimento={(id) => void removerConhecimento(id)}
        onAlternarAtivo={() => void alternarAtivo(selecionado)}
        onExcluir={() => void excluirProduto(selecionado)}
        onPagamentoSalvo={() => {
          // o link de pagamento vive em produto_conhecimento: recarrega a lista e o RAG
          void carregarConhecimento(selecionado.id);
          void sync();
        }}
      />
    );
  }

  return (
    <ListaGrid produtos={produtos} onSelecionar={setSelecionadoId} onCriar={() => void criarProduto()} />
  );
}

interface ListaGridProps {
  produtos: Produto[];
  onSelecionar: (id: string) => void;
  onCriar: () => void;
}

function ListaGrid({ produtos, onSelecionar, onCriar }: ListaGridProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", color: "var(--txt-1)" }}>
      <motion.header
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.outExpo }}
        style={{
          padding: "16px 22px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
          background:
            "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.20), oklch(0.15 0.04 264 / 0.05))",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(18px, 1.6vw, 22px)",
              fontWeight: 700,
              letterSpacing: -0.2,
              color: "var(--txt-1)",
            }}
          >
            Catálogo
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--txt-3)" }}>
            <span className="mono" style={{ fontWeight: 600, color: "var(--txt-2)" }}>
              {produtos.length}
            </span>{" "}
            {produtos.length === 1 ? "produto cadastrado" : "produtos cadastrados"}
          </p>
        </div>
        <motion.button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onCriar}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={springSnap}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            boxShadow:
              "0 4px 14px oklch(0.65 0.22 280 / 0.32), inset 0 1px 0 rgba(255,255,255,0.14)",
          }}
        >
          + Novo produto
        </motion.button>
      </motion.header>
      <motion.div
        className="scroll"
        variants={stagger(0.05, 0.05)}
        initial="hidden"
        animate="visible"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "22px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 18,
        }}
      >
        {produtos.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "60px 24px",
              textAlign: "center",
              border: "1px dashed rgba(255,255,255,0.10)",
              borderRadius: 16,
              color: "var(--txt-3)",
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 4 }}>Catálogo vazio</div>
            <div className="tiny" style={{ color: "var(--txt-4)" }}>
              Crie o primeiro produto pelo botão acima.
            </div>
          </div>
        )}
        {produtos.map((p, idx) => (
          <motion.button
            key={p.id}
            type="button"
            variants={staggerItem}
            onClick={() => onSelecionar(p.id)}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: duration.fast, ease: easing.outExpo }}
            style={{
              padding: "16px 16px 14px",
              borderRadius: 16,
              background: "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.38), oklch(0.15 0.04 264 / 0.28))",
              border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: idx % 3 === 1 ? 168 : 148,
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 22px rgba(0,0,0,0.22)",
              color: "var(--txt-1)",
              opacity: p.ativo ? 1 : 0.55,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: -0.1,
                }}
              >
                {p.nome}
              </h3>
              <span
                style={{
                  fontSize: 9,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: p.ativo
                    ? "oklch(0.72 0.20 145 / 0.18)"
                    : "rgba(255,255,255,0.06)",
                  color: p.ativo ? "oklch(0.85 0.20 145)" : "var(--txt-4)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 700,
                  border: p.ativo
                    ? "1px solid oklch(0.72 0.20 145 / 0.30)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {p.ativo ? "ativo" : "desativado"}
              </span>
            </div>
            {p.descricao_curta && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--txt-2)",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 3,
                  overflow: "hidden",
                }}
              >
                {p.descricao_curta}
              </p>
            )}
            <div style={{ marginTop: "auto", display: "flex", gap: 10, alignItems: "center" }}>
              {p.prazo_entrega && (
                <span style={{ fontSize: 11, color: "var(--txt-3)" }}>{p.prazo_entrega}</span>
              )}
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: "var(--txt-4)",
                  marginLeft: p.prazo_entrega ? "auto" : 0,
                }}
              >
                {p.slug ? `/${p.slug}` : "sem slug"}
              </span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

interface DetalheProps {
  produto: Produto;
  conhecimento: ConhecimentoItem[];
  carregandoConhecimento: boolean;
  onVoltar: () => void;
  onSalvarProduto: (p: Produto) => void;
  onSalvarConhecimento: (c: ConhecimentoItem) => void;
  onAdicionarConhecimento: (tipo: string) => void;
  onRemoverConhecimento: (id: string) => void;
  onAlternarAtivo: () => void;
  onExcluir: () => void;
  onPagamentoSalvo: () => void;
}

function Detalhe({
  produto,
  conhecimento,
  carregandoConhecimento,
  onVoltar,
  onSalvarProduto,
  onSalvarConhecimento,
  onAdicionarConhecimento,
  onRemoverConhecimento,
  onAlternarAtivo,
  onExcluir,
  onPagamentoSalvo,
}: DetalheProps) {
  const [editando, setEditando] = useState<Produto>(produto);
  // re-sincroniza só quando troca de produto ou o ativo muda no pai — não reseta edição em curso
  useEffect(() => {
    setEditando((atual) => (atual.id === produto.id ? { ...atual, ativo: produto.ativo } : produto));
  }, [produto]);

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  useEffect(() => {
    if (!confirmandoExclusao) return;
    const timer = setTimeout(() => setConfirmandoExclusao(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmandoExclusao]);

  function setField<K extends keyof Produto>(key: K, value: Produto[K]) {
    setEditando((p) => ({ ...p, [key]: value }));
  }

  const tiposPresentes = Array.from(new Set(conhecimento.map((c) => c.tipo)));
  const tiposParaMostrar = [...TIPOS_ORDEM.filter((t) => tiposPresentes.includes(t)), ...tiposPresentes.filter((t) => !TIPOS_ORDEM.includes(t as typeof TIPOS_ORDEM[number]))];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", color: "var(--txt-1)" }}>
      <motion.header
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.outExpo }}
        style={{
          padding: "14px 22px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background:
            "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.22), oklch(0.15 0.04 264 / 0.06))",
        }}
      >
        <motion.button
          type="button"
          className="btn btn-sm"
          onClick={onVoltar}
          aria-label="Voltar ao catálogo"
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={springSnap}
        >
          ← Voltar
        </motion.button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(16px, 1.4vw, 19px)",
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: -0.1,
              color: "var(--txt-1)",
            }}
          >
            {editando.nome}
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--txt-3)" }}>
            <span className="mono" style={{ fontWeight: 600, color: "var(--txt-2)" }}>
              {conhecimento.length}
            </span>{" "}
            {conhecimento.length === 1 ? "item de conhecimento" : "itens de conhecimento"}
          </p>
        </div>
        <motion.button
          type="button"
          onClick={onAlternarAtivo}
          aria-label={editando.ativo ? "Desativar produto" : "Ativar produto"}
          title={editando.ativo ? "O agente oferece este produto. Clique pra desativar." : "O agente NÃO oferece este produto. Clique pra ativar."}
          whileTap={{ scale: 0.96 }}
          transition={springSnap}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px 6px 8px",
            borderRadius: 999,
            cursor: "pointer",
            background: editando.ativo ? "oklch(0.72 0.20 145 / 0.12)" : "rgba(255,255,255,0.04)",
            border: editando.ativo
              ? "1px solid oklch(0.72 0.20 145 / 0.30)"
              : "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 30,
              height: 16,
              borderRadius: 999,
              padding: 2,
              display: "flex",
              justifyContent: editando.ativo ? "flex-end" : "flex-start",
              background: editando.ativo ? "oklch(0.72 0.20 145 / 0.45)" : "rgba(255,255,255,0.10)",
              transition: "background 0.2s ease",
            }}
          >
            <motion.span
              layout
              transition={springSnap}
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: editando.ativo ? "oklch(0.85 0.18 145)" : "var(--txt-4)",
              }}
            />
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: editando.ativo ? "oklch(0.85 0.20 145)" : "var(--txt-3)",
            }}
          >
            {editando.ativo ? "Ativo" : "Desativado"}
          </span>
        </motion.button>
        <motion.button
          type="button"
          onClick={() => {
            if (!confirmandoExclusao) {
              setConfirmandoExclusao(true);
              return;
            }
            onExcluir();
          }}
          aria-label={confirmandoExclusao ? "Confirmar exclusão do produto" : "Excluir produto"}
          title="Apaga o produto, o conhecimento e as mídias dele. Sem volta."
          whileTap={{ scale: 0.96 }}
          transition={springSnap}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: confirmandoExclusao ? "7px 12px" : "7px 9px",
            borderRadius: 10,
            cursor: "pointer",
            background: confirmandoExclusao ? "oklch(0.65 0.24 25 / 0.16)" : "transparent",
            border: confirmandoExclusao
              ? "1px solid oklch(0.65 0.24 25 / 0.40)"
              : "1px solid rgba(255,255,255,0.10)",
            color: confirmandoExclusao ? "oklch(0.78 0.20 25)" : "var(--txt-3)",
          }}
        >
          <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
          {confirmandoExclusao && (
            <span style={{ fontSize: 11, fontWeight: 600 }}>Apagar de vez?</span>
          )}
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onSalvarProduto(editando)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={springSnap}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            boxShadow:
              "0 4px 14px oklch(0.65 0.22 280 / 0.32), inset 0 1px 0 rgba(255,255,255,0.14)",
          }}
        >
          Salvar produto
        </motion.button>
      </motion.header>

      <div
        className="scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px 28px",
          display: "grid",
          gridTemplateColumns: "minmax(280px, 360px) 1fr",
          gap: 16,
          minHeight: 0,
        }}
      >
        {/* Coluna esquerda: dados + mídias */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "start", minWidth: 0 }}>
        <motion.section
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: duration.normal, ease: easing.outExpo, delay: 0.05 }}
          style={{
            background:
              "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.42), oklch(0.15 0.04 264 / 0.30))",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "16px 18px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignSelf: "start",
            boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 22px rgba(0,0,0,0.22)",
          }}
        >
          <header style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
            <span
              aria-hidden="true"
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background:
                  "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
                boxShadow: "0 0 8px oklch(0.65 0.22 280 / 0.55)",
              }}
            />
            <h3
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.7,
                color: "var(--txt-3)",
              }}
            >
              Dados do produto
            </h3>
          </header>
          <Campo rotulo="Nome">
            <input
              className="input"
              value={editando.nome}
              onChange={(e) => setField("nome", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Slug (URL pública)">
            <input
              className="input"
              value={editando.slug ?? ""}
              onChange={(e) => setField("slug", e.target.value || null)}
              placeholder="limpa-nome"
            />
          </Campo>
          <Campo rotulo="Descrição curta">
            <textarea
              className="input"
              rows={3}
              value={editando.descricao_curta ?? ""}
              onChange={(e) => setField("descricao_curta", e.target.value || null)}
              placeholder="O que o lead leva de valor."
            />
          </Campo>
          <Campo rotulo="Palavras-chave (vírgula)">
            <input
              className="input"
              value={editando.palavras_chave.join(", ")}
              onChange={(e) =>
                setField(
                  "palavras_chave",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
              placeholder="limpa nome, spc, serasa, cdc"
            />
          </Campo>
          <Campo rotulo="Prazo de entrega">
            <input
              className="input"
              value={editando.prazo_entrega ?? ""}
              onChange={(e) => setField("prazo_entrega", e.target.value || null)}
            />
          </Campo>
          <Campo rotulo="Garantia">
            <textarea
              className="input"
              rows={3}
              value={editando.garantia ?? ""}
              onChange={(e) => setField("garantia", e.target.value || null)}
            />
          </Campo>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <input
              type="checkbox"
              checked={editando.ativo}
              onChange={(e) => setField("ativo", e.target.checked)}
            />
            <span className="small">Produto ativo no catálogo</span>
          </label>
        </motion.section>
        <SecaoPagamentoProduto produtoId={produto.id} onSalvou={onPagamentoSalvo} />
        <SecaoMidias produtoId={produto.id} />
        </div>

        {/* Coluna direita: conhecimento agrupado */}
        <motion.section
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: duration.normal, ease: easing.outExpo, delay: 0.1 }}
          style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}
        >
          <header style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 0 auto" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
                  boxShadow: "0 0 8px oklch(0.65 0.22 280 / 0.55)",
                }}
              />
              <h3
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.7,
                  color: "var(--txt-3)",
                }}
              >
                Base de conhecimento
              </h3>
            </div>
            <motion.div
              variants={stagger(0.03, 0.04)}
              initial="hidden"
              animate="visible"
              style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}
            >
              {TIPOS_ORDEM.map((tipo) => (
                <motion.button
                  key={tipo}
                  type="button"
                  variants={staggerItem}
                  onClick={() => onAdicionarConhecimento(tipo)}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springSnap}
                  style={{
                    fontSize: 10,
                    padding: "5px 11px",
                    borderRadius: 999,
                    border: `1px solid ${corComAlpha(COR_TIPO[tipo], 0.4)}`,
                    background: corComAlpha(COR_TIPO[tipo], 0.1),
                    color: COR_TIPO[tipo],
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + {ROTULO_TIPO[tipo]}
                </motion.button>
              ))}
            </motion.div>
          </header>

          {carregandoConhecimento ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0.25 }}
                  animate={{ opacity: [0.25, 0.5, 0.25] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15, ease: easing.glass }}
                  style={{
                    height: 56,
                    borderRadius: 12,
                    background: "oklch(0.18 0.06 280 / 0.30)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                />
              ))}
            </div>
          ) : tiposParaMostrar.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.slow, ease: easing.outExpo }}
              style={{
                padding: "44px 24px",
                textAlign: "center",
                border: "1px dashed rgba(255,255,255,0.08)",
                borderRadius: 16,
                background: "oklch(0.18 0.06 280 / 0.15)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--txt-2)", marginBottom: 4 }}>
                Base vazia
              </div>
              <div className="tiny" style={{ color: "var(--txt-4)", maxWidth: "44ch", margin: "0 auto", lineHeight: 1.5 }}>
                Adicione o primeiro item pelos chips acima. Esse texto vai pro agente quando o lead falar do produto.
              </div>
            </motion.div>
          ) : (
            <motion.div
              variants={stagger(0.04, 0.06)}
              initial="hidden"
              animate="visible"
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              {tiposParaMostrar.map((tipo) => {
                const itens = conhecimento.filter((c) => c.tipo === tipo);
                const cor = COR_TIPO[tipo] ?? "var(--txt-3)";
                return (
                  <motion.div
                    key={tipo}
                    variants={staggerItem}
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <header
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingBottom: 4,
                        borderBottom: `1px solid ${corComAlpha(cor, 0.18)}`,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: cor,
                          boxShadow: `0 0 10px ${corComAlpha(cor, 0.6)}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                          color: cor,
                        }}
                      >
                        {ROTULO_TIPO[tipo] ?? tipo}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: "var(--txt-4)",
                          marginLeft: "auto",
                          fontWeight: 600,
                        }}
                      >
                        {itens.length}
                      </span>
                    </header>
                    <AnimatePresence initial={false}>
                      {itens.map((item) => (
                        <ItemConhecimento
                          key={item.id}
                          item={item}
                          cor={cor}
                          onSalvar={onSalvarConhecimento}
                          onRemover={onRemoverConhecimento}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </motion.section>
      </div>
    </div>
  );
}

interface ItemConhecimentoProps {
  item: ConhecimentoItem;
  cor: string;
  onSalvar: (c: ConhecimentoItem) => void;
  onRemover: (id: string) => void;
}

function ItemConhecimento({ item, cor, onSalvar, onRemover }: ItemConhecimentoProps) {
  const [editando, setEditando] = useState(item);
  const [aberto, setAberto] = useState(false);
  useEffect(() => setEditando(item), [item]);

  const sujo = editando.titulo !== item.titulo || editando.conteudo !== item.conteudo;

  return (
    <motion.article
      layout
      transition={{ duration: duration.normal, ease: easing.outExpo }}
      style={{
        background: aberto
          ? "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.42), oklch(0.15 0.04 264 / 0.30))"
          : "oklch(0.18 0.06 280 / 0.20)",
        border: `1px solid ${aberto ? corComAlpha(cor, 0.35) : "rgba(255,255,255,0.06)"}`,
        borderRadius: 12,
        padding: aberto ? 14 : "10px 14px",
        boxShadow: aberto
          ? `0 4px 18px ${corComAlpha(cor, 0.18)}, inset 0 1px 0 rgba(255,255,255,0.06)`
          : "none",
      }}
    >
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            color: "var(--txt-1)",
            textAlign: "left",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
            {item.titulo || <span className="muted">(sem título)</span>}
          </span>
          <span className="muted tiny">editar</span>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className="input"
            value={editando.titulo}
            onChange={(e) => setEditando((c) => ({ ...c, titulo: e.target.value }))}
            placeholder="Título curto"
            style={{ fontWeight: 600 }}
          />
          <textarea
            className="input"
            rows={4}
            value={editando.conteudo}
            onChange={(e) => setEditando((c) => ({ ...c, conteudo: e.target.value }))}
            placeholder="Conteúdo completo. Esse texto vai pro agente quando o lead falar do produto."
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setEditando(item);
                setAberto(false);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (confirm(`Remover item "${item.titulo || "sem título"}"?`)) onRemover(item.id);
              }}
              style={{ color: "oklch(0.78 0.20 25)" }}
            >
              Excluir
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!sujo}
              onClick={() => {
                onSalvar(editando);
                setAberto(false);
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </motion.article>
  );
}

interface CampoProps {
  rotulo: string;
  children: React.ReactNode;
}

function Campo({ rotulo, children }: CampoProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="muted tiny"
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {rotulo}
      </span>
      {children}
    </label>
  );
}
