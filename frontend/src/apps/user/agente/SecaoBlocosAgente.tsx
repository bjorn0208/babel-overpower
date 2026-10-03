/**
 * SecaoBlocosAgente — gerencia blocos de conhecimento do agente.
 * Lista, ativa/desativa, edita e remove conhecimentos.
 * Integrado na AbaConfiguracao.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit2, Upload } from "lucide-react";

interface BlocoAgente {
  id: string;
  title: string;
  content: string;
  ativo: boolean;
  tipo: string;
  category?: string;
  tag?: string;
  embedding_status: string;
}

interface SecaoBlocosAgenteProps {
  agenteId: string;
  onBlocosAlterados?: () => void;
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

type SupabaseBruto = any;

export function SecaoBlocosAgente({ agenteId, onBlocosAlterados }: SecaoBlocosAgenteProps) {
  const t = pegarToast();
  const [carregando, setCarregando] = useState(true);
  const [blocos, setBlocos] = useState<BlocoAgente[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [blocoEditando, setBlocoEditando] = useState<BlocoAgente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formulario, setFormulario] = useState({
    title: "",
    content: "",
    tipo: "resposta" as const,
    category: "",
  });

  const carregarBlocos = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("blocos_conhecimento")
        .select("*")
        .eq("agente_id", agenteId)
        .eq("escopo", "tenant")
        .eq("ativo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBlocos(data || []);
    } catch (e) {
      console.error("[SecaoBlocosAgente] carregarBlocos falhou:", e);
      t.error(`Falha ao carregar blocos: ${(e as Error).message}`);
    } finally {
      setCarregando(false);
    }
  }, [agenteId]);

  useEffect(() => {
    void carregarBlocos();
  }, [carregarBlocos]);

  const abrirModalNovo = () => {
    setBlocoEditando(null);
    setFormulario({ title: "", content: "", tipo: "resposta", category: "" });
    setModalAberto(true);
  };

  const abrirModalEditar = (bloco: BlocoAgente) => {
    setBlocoEditando(bloco);
    setFormulario({
      title: bloco.title,
      content: bloco.content,
      tipo: (bloco.tipo as any) || "resposta",
      category: bloco.category || "",
    });
    setModalAberto(true);
  };

  const salvarBloco = async () => {
    if (!formulario.title.trim() || !formulario.content.trim()) {
      t.error("Título e conteúdo são obrigatórios");
      return;
    }

    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const payload = {
        title: formulario.title,
        content: formulario.content,
        tipo: formulario.tipo,
        category: formulario.category || null,
        agente_id: agenteId,
        escopo: "tenant",
        embedding_status: "pendente",
      };

      if (blocoEditando) {
        // Editar
        const { error } = await sb
          .from("blocos_conhecimento")
          .update(payload)
          .eq("id", blocoEditando.id);
        if (error) throw error;
        t.success("Bloco atualizado");
      } else {
        // Criar
        const { error } = await sb
          .from("blocos_conhecimento")
          .insert([{ ...payload, ativo: true }]);
        if (error) throw error;
        t.success("Bloco criado");
      }

      setModalAberto(false);
      onBlocosAlterados?.();
      await carregarBlocos();
    } catch (e) {
      console.error("[SecaoBlocosAgente] salvarBloco falhou:", e);
      t.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivoBloco = async (bloco: BlocoAgente) => {
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("blocos_conhecimento")
        .update({ ativo: !bloco.ativo })
        .eq("id", bloco.id);
      if (error) throw error;
      t.success(bloco.ativo ? "Bloco desativado" : "Bloco ativado");
      onBlocosAlterados?.();
      await carregarBlocos();
    } catch (e) {
      console.error("[SecaoBlocosAgente] toggleAtivoBloco falhou:", e);
      t.error(`Falha ao alternar: ${(e as Error).message}`);
    }
  };

  const removerBloco = async (blocoId: string) => {
    if (!confirm("Tem certeza que quer remover este bloco?")) return;

    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("blocos_conhecimento")
        .update({ ativo: false })
        .eq("id", blocoId);
      if (error) throw error;
      t.success("Bloco removido");
      onBlocosAlterados?.();
      await carregarBlocos();
    } catch (e) {
      console.error("[SecaoBlocosAgente] removerBloco falhou:", e);
      t.error(`Falha ao remover: ${(e as Error).message}`);
    }
  };

  if (carregando) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--txt-3)", fontSize: 13 }}>
        Carregando conhecimentos…
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        <section
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "14px 16px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📚</span>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--txt-2)", flex: 1 }}>
              Conhecimentos do agente
            </h3>
            <button
              type="button"
              className="btn btn-sm"
              onClick={abrirModalNovo}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={16} />
              Novo
            </button>
          </div>
          <div className="muted tiny" style={{ marginBottom: 10 }}>
            Blocos de conhecimento que o agente usa no contexto. Ative/desative para controlar quais são considerados.
          </div>

          {blocos.length === 0 ? (
            <div className="muted small" style={{ marginTop: 8, fontStyle: "italic" }}>
              Nenhum conhecimento adicionado ainda.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {blocos.map((bloco) => (
                <CartaoBlocoAgente
                  key={bloco.id}
                  bloco={bloco}
                  onToggleAtivo={() => void toggleAtivoBloco(bloco)}
                  onEditar={() => abrirModalEditar(bloco)}
                  onRemover={() => void removerBloco(bloco.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {modalAberto && (
        <ModalEditarBlocoAgente
          bloco={blocoEditando}
          formulario={formulario}
          setFormulario={setFormulario}
          salvando={salvando}
          onSalvar={() => void salvarBloco()}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  );
}

function CartaoBlocoAgente({
  bloco,
  onToggleAtivo,
  onEditar,
  onRemover,
}: {
  bloco: BlocoAgente;
  onToggleAtivo: () => void;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const resumo = bloco.content.substring(0, 80).replace(/\n/g, " ");
  const temMais = bloco.content.length > 80;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: 12,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        opacity: bloco.ativo ? 1 : 0.6,
      }}
    >
      <input
        type="checkbox"
        checked={bloco.ativo}
        onChange={onToggleAtivo}
        style={{ width: 20, height: 20, cursor: "pointer", marginTop: 2 }}
        title={bloco.ativo ? "Desativar" : "Ativar"}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt-1)", marginBottom: 2 }}>
          {bloco.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--txt-3)", marginBottom: 4 }}>
          {resumo}
          {temMais && "…"}
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
          <span style={{ color: "var(--txt-4)" }}>
            Tipo: <strong>{bloco.tipo}</strong>
          </span>
          {bloco.embedding_status && (
            <span style={{ color: "var(--txt-4)" }}>
              Vetor: <strong>{bloco.embedding_status === "pronto" ? "✓" : "⏳"}</strong>
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onEditar}
          style={{
            width: 32,
            height: 32,
            padding: 0,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--txt-3)",
          }}
          title="Editar"
        >
          <Edit2 size={14} />
        </button>
        <button
          type="button"
          onClick={onRemover}
          style={{
            width: 32,
            height: 32,
            padding: 0,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--txt-3)",
          }}
          title="Remover"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function ModalEditarBlocoAgente({
  bloco,
  formulario,
  setFormulario,
  salvando,
  onSalvar,
  onFechar,
}: {
  bloco: BlocoAgente | null;
  formulario: { title: string; content: string; tipo: string; category: string };
  setFormulario: (f: any) => void;
  salvando: boolean;
  onSalvar: () => void;
  onFechar: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onFechar}
    >
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 20,
          maxWidth: 600,
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, fontWeight: 700 }}>
          {bloco ? "Editar conhecimento" : "Novo conhecimento"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Título
            </label>
            <input
              type="text"
              className="input"
              value={formulario.title}
              onChange={(e) => setFormulario({ ...formulario, title: e.target.value })}
              placeholder="Título do conhecimento"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Conteúdo
            </label>
            <textarea
              className="input"
              value={formulario.content}
              onChange={(e) => setFormulario({ ...formulario, content: e.target.value })}
              placeholder="Conteúdo do bloco…"
              style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Tipo
              </label>
              <select
                className="input"
                value={formulario.tipo}
                onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
                style={{ width: "100%", appearance: "auto" as const }}
              >
                <option value="resposta">Resposta</option>
                <option value="apresentacao">Apresentação</option>
                <option value="valor">Valor</option>
                <option value="pagamento">Pagamento</option>
                <option value="processo">Processo</option>
                <option value="clausula_contrato">Cláusula de contrato</option>
                <option value="contato">Contato</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Categoria (opcional)
              </label>
              <input
                type="text"
                className="input"
                value={formulario.category}
                onChange={(e) => setFormulario({ ...formulario, category: e.target.value })}
                placeholder="Ex: consulta, produto…"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onFechar}
            disabled={salvando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onSalvar}
            disabled={salvando}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
