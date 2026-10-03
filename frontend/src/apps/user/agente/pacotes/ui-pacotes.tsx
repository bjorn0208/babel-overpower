/**
 * Pacotes de Conhecimento — componentes visuais compartilhados (Hub do tenant + Curadoria).
 * Linguagem do hub-conhecimento: glass roxo, inline styles oklch, ícones lucide.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, Power, PowerOff, Trash2, X } from "lucide-react";
import { BotaoIcone, BotaoPrimario, Campo, Vazio, estiloInput } from "../hub-conhecimento/ui-hub";
import {
  LIMITE_CONTEUDO,
  LIMITE_NOME_PACOTE,
  ROTULO_MODO,
  validarBloco,
  type BlocoPacote,
  type ModoBloco,
  type ValoresBlocoPacote,
} from "./logica-pacotes";
import { mensagemErro, type OpcaoSimples, type ValoresPacote } from "./dados-pacotes";

export type ToastApi = { success: (m: string) => void; error: (m: string) => void };

/* ── Interruptor ON/OFF ─────────────────────────────────────────────── */

export function Interruptor({
  ligado,
  onToggle,
  rotulo,
  desabilitado,
}: {
  ligado: boolean;
  onToggle: () => void;
  rotulo: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={rotulo}
      disabled={desabilitado}
      onClick={onToggle}
      style={{
        position: "relative",
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "1px solid",
        borderColor: ligado ? "oklch(0.72 0.16 155 / 0.6)" : "oklch(0.98 0 0 / 0.14)",
        background: ligado ? "oklch(0.72 0.16 155 / 0.35)" : "oklch(0.98 0 0 / 0.05)",
        cursor: desabilitado ? "wait" : "pointer",
        flexShrink: 0,
        opacity: desabilitado ? 0.6 : 1,
        transition: "background 120ms ease-out",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 3,
          left: ligado ? "calc(100% - 20px)" : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: ligado ? "oklch(0.85 0.14 155)" : "oklch(0.98 0 0 / 0.45)",
          transition: "left 120ms ease-out",
        }}
      />
    </button>
  );
}

/* ── Etiquetas ──────────────────────────────────────────────────────── */

export function Etiqueta({ children, cor }: { children: ReactNode; cor: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 999,
        color: cor,
        background: cor.replace(")", " / 0.12)"),
        border: `1px solid ${cor.replace(")", " / 0.3)")}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export const COR_SEMPRE = "oklch(0.78 0.14 75)";
export const COR_RELEVANCIA = "oklch(0.70 0.16 235)";

export function EtiquetaModo({ modo }: { modo: ModoBloco }) {
  return (
    <Etiqueta cor={modo === "sempre" ? COR_SEMPRE : COR_RELEVANCIA}>
      {ROTULO_MODO[modo].titulo}
    </Etiqueta>
  );
}

/* ── Modal base ─────────────────────────────────────────────────────── */

function ModalBase({
  titulo,
  sub,
  onFechar,
  children,
}: {
  titulo: string;
  sub?: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return createPortal(
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "oklch(0.1 0.03 280 / 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        role="dialog"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "88vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 20,
          borderRadius: 16,
          background: "oklch(0.18 0.06 280 / 0.96)",
          border: "1px solid oklch(0.7 0.18 280 / 0.25)",
          color: "oklch(0.98 0 0)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{titulo}</span>
            {sub && <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.5)" }}>{sub}</span>}
          </div>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "none",
              color: "oklch(0.98 0 0 / 0.55)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RodapeModal({
  erro,
  salvando,
  onCancelar,
  onSalvar,
}: {
  erro: string | null;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  return (
    <>
      {erro && <span style={{ fontSize: 11, color: "oklch(0.75 0.16 40)" }}>{erro}</span>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancelar}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 500,
            color: "oklch(0.98 0 0 / 0.65)",
            background: "transparent",
            border: "1px solid oklch(0.98 0 0 / 0.12)",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <BotaoPrimario onClick={onSalvar}>{salvando ? "Salvando…" : "Salvar"}</BotaoPrimario>
      </div>
    </>
  );
}

/* ── Modal do pacote ────────────────────────────────────────────────── */

export function ModalPacote({
  inicial,
  nichos,
  onFechar,
  onSalvar,
}: {
  inicial: ValoresPacote | null;
  /** Só no admin: permite restringir o pacote a um nicho. */
  nichos?: OpcaoSimples[];
  onFechar: () => void;
  onSalvar: (v: ValoresPacote) => Promise<void>;
}) {
  const [v, setV] = useState<ValoresPacote>({
    nome: inicial?.nome ?? "",
    descricao: inicial?.descricao ?? "",
    nicho_id: inicial?.nicho_id ?? null,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (salvando) return;
    if (!v.nome.trim()) return setErro("Dê um nome ao pacote.");
    if (v.nome.trim().length > LIMITE_NOME_PACOTE)
      return setErro(`Nome com no máximo ${LIMITE_NOME_PACOTE} caracteres.`);
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(nichos ? v : { nome: v.nome, descricao: v.descricao });
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      titulo={inicial ? "Editar pacote" : "Novo pacote de conhecimento"}
      sub="Um pacote agrupa blocos de conhecimento extra que o agente usa quando você liga."
      onFechar={onFechar}
    >
      <Campo label="Nome">
        <input
          type="text"
          autoFocus
          value={v.nome}
          maxLength={LIMITE_NOME_PACOTE}
          onChange={(e) => setV({ ...v, nome: e.target.value })}
          placeholder="Ex.: Negociação avançada"
          style={estiloInput}
        />
      </Campo>
      <Campo
        label="Descrição"
        dica="Aparece no card do pacote. Diga em uma frase o que o agente ganha."
      >
        <textarea
          rows={3}
          value={v.descricao}
          onChange={(e) => setV({ ...v, descricao: e.target.value })}
          style={estiloInput}
        />
      </Campo>
      {nichos && (
        <Campo
          label="Nicho"
          dica="Vazio = todos os tenants veem. Com nicho, só quem é daquele nicho."
        >
          <select
            value={v.nicho_id ?? ""}
            onChange={(e) => setV({ ...v, nicho_id: e.target.value || null })}
            style={estiloInput}
          >
            <option value="">Todos os nichos</option>
            {nichos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <RodapeModal erro={erro} salvando={salvando} onCancelar={onFechar} onSalvar={salvar} />
    </ModalBase>
  );
}

/* ── Modal do bloco ─────────────────────────────────────────────────── */

export function ModalBlocoPacote({
  nomePacote,
  inicial,
  onFechar,
  onSalvar,
}: {
  nomePacote: string;
  inicial: BlocoPacote | null;
  onFechar: () => void;
  onSalvar: (v: ValoresBlocoPacote) => Promise<void>;
}) {
  const [v, setV] = useState<ValoresBlocoPacote>({
    titulo: inicial?.titulo ?? "",
    conteudo: inicial?.conteudo ?? "",
    modo: inicial?.modo ?? "relevancia",
    category: inicial?.category ?? "",
    tags: (inicial?.tags ?? []).join(", "),
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const limite = LIMITE_CONTEUDO[v.modo];
  const tamanho = v.conteudo.trim().length;

  async function salvar() {
    if (salvando) return;
    const problema = validarBloco(v);
    if (problema) return setErro(problema);
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(v);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      titulo={`${inicial ? "Editar" : "Novo"} bloco · ${nomePacote}`}
      sub="Vale para os agentes com este pacote ligado."
      onFechar={onFechar}
    >
      <Campo label="Título">
        <input
          type="text"
          autoFocus
          value={v.titulo}
          onChange={(e) => {
            setErro(null);
            setV({ ...v, titulo: e.target.value });
          }}
          style={estiloInput}
        />
      </Campo>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "oklch(0.98 0 0 / 0.55)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Como o agente usa
        </span>
        <div
          role="radiogroup"
          aria-label="Como o agente usa"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 8,
          }}
        >
          {(["sempre", "relevancia"] as const).map((m) => {
            const on = v.modo === m;
            const cor = m === "sempre" ? COR_SEMPRE : COR_RELEVANCIA;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setErro(null);
                  setV({ ...v, modo: m });
                }}
                style={{
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  color: "inherit",
                  background: on ? cor.replace(")", " / 0.14)") : "oklch(0.98 0 0 / 0.04)",
                  border: `1px solid ${on ? cor.replace(")", " / 0.55)") : "oklch(0.98 0 0 / 0.1)"}`,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: on ? cor : "oklch(0.98 0 0 / 0.85)",
                  }}
                >
                  {ROTULO_MODO[m].titulo}
                </span>
                <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.55)", lineHeight: 1.4 }}>
                  {ROTULO_MODO[m].descricao}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Campo label="Conteúdo">
        <textarea
          rows={8}
          value={v.conteudo}
          onChange={(e) => {
            setErro(null);
            setV({ ...v, conteudo: e.target.value });
          }}
          style={estiloInput}
        />
        <span
          style={{
            alignSelf: "flex-end",
            fontSize: 10.5,
            fontVariantNumeric: "tabular-nums",
            color: tamanho > limite ? "oklch(0.75 0.16 40)" : "oklch(0.98 0 0 / 0.45)",
          }}
        >
          {tamanho.toLocaleString("pt-BR")} / {limite.toLocaleString("pt-BR")}
        </span>
      </Campo>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        <Campo
          label="Categoria (opcional)"
          dica="preco, pagamento e consulta seguem as mesmas travas do conhecimento padrão."
        >
          <input
            type="text"
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
            style={estiloInput}
          />
        </Campo>
        <Campo label="Tags (opcional)" dica="Separe por vírgula.">
          <input
            type="text"
            value={v.tags}
            onChange={(e) => setV({ ...v, tags: e.target.value })}
            style={estiloInput}
          />
        </Campo>
      </div>

      <RodapeModal erro={erro} salvando={salvando} onCancelar={onFechar} onSalvar={salvar} />
    </ModalBase>
  );
}

/* ── Lista de blocos de um pacote ───────────────────────────────────── */

export function ListaBlocosPacote({
  nomePacote,
  blocos,
  editavel,
  toast,
  onCriar,
  onEditar,
  onAlternarAtivo,
  onExcluir,
}: {
  nomePacote: string;
  blocos: BlocoPacote[];
  editavel: boolean;
  toast: ToastApi;
  onCriar: (v: ValoresBlocoPacote) => Promise<void>;
  onEditar: (id: string, v: ValoresBlocoPacote) => Promise<void>;
  onAlternarAtivo: (id: string, ativo: boolean) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const [modal, setModal] = useState<{ bloco: BlocoPacote | null } | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
  // O conteúdo do bloco aparece INTEIRO (Theus, 2026-09-16: "preciso que as caixas mostrem
  // elas completas para poder ler"). Antes eram 3 linhas com line-clamp e não dava pra
  // conferir o que estava no pacote sem abrir o modal de edição um por um. Quem quiser a
  // lista compacta clica no texto e recolhe aquele bloco.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const alternarRecolhido = (id: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  async function executar(acao: () => Promise<void>, ok: string) {
    try {
      await acao();
      toast.success(ok);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {editavel && (
        <div>
          <BotaoPrimario onClick={() => setModal({ bloco: null })}>
            <Plus size={14} /> Novo bloco
          </BotaoPrimario>
        </div>
      )}

      {blocos.length === 0 ? (
        <Vazio
          pequeno
          mensagem="Nenhum bloco neste pacote."
          dica={
            editavel
              ? "Crie o primeiro bloco: uma regra curta (Sempre) ou um conteúdo de consulta (Por relevância)."
              : undefined
          }
        />
      ) : (
        blocos.map((b) => (
          <div
            key={b.id}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "oklch(0.98 0 0 / 0.035)",
              border: "1px solid oklch(0.98 0 0 / 0.07)",
              opacity: b.ativo ? 1 : 0.55,
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                  {b.titulo}
                </span>
                <EtiquetaModo modo={b.modo} />
                {!b.ativo && <Etiqueta cor="oklch(0.7 0.02 280)">Desligado</Etiqueta>}
                {b.modo === "relevancia" && b.embedding_status === "pendente" && (
                  <Etiqueta cor="oklch(0.75 0.12 200)">Indexando…</Etiqueta>
                )}
                {b.embedding_status === "erro" && (
                  <Etiqueta cor="oklch(0.7 0.18 30)">Erro ao indexar</Etiqueta>
                )}
                {b.category && (
                  <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>
                    {b.category}
                  </span>
                )}
              </div>
              <span
                onClick={() => alternarRecolhido(b.id)}
                title={recolhidos.has(b.id) ? "Mostrar o bloco inteiro" : "Recolher"}
                style={{
                  fontSize: 11.5,
                  color: "oklch(0.98 0 0 / 0.65)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  cursor: "pointer",
                  ...(recolhidos.has(b.id)
                    ? {
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }
                    : {}),
                }}
              >
                {b.conteudo}
              </span>
              <button
                type="button"
                onClick={() => alternarRecolhido(b.id)}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: 0,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "oklch(0.98 0 0 / 0.45)",
                }}
              >
                {recolhidos.has(b.id) ? "ver tudo" : "recolher"}
              </button>
            </div>
            {editavel && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flexShrink: 0 }}>
                <BotaoIcone titulo="Editar" onClick={() => setModal({ bloco: b })}>
                  <Pencil size={14} />
                </BotaoIcone>
                <BotaoIcone
                  titulo={b.ativo ? "Desligar bloco" : "Ligar bloco"}
                  onClick={() =>
                    executar(
                      () => onAlternarAtivo(b.id, !b.ativo),
                      b.ativo ? "Bloco desligado" : "Bloco ligado",
                    )
                  }
                >
                  {b.ativo ? <Power size={14} /> : <PowerOff size={14} />}
                </BotaoIcone>
                {confirmarExclusao === b.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmarExclusao(null);
                      void executar(() => onExcluir(b.id), "Bloco excluído");
                    }}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: 8,
                      cursor: "pointer",
                      color: "oklch(0.98 0 0)",
                      background: "oklch(0.6 0.2 25 / 0.35)",
                      border: "1px solid oklch(0.65 0.24 25 / 0.6)",
                    }}
                  >
                    Confirmar
                  </button>
                ) : (
                  <BotaoIcone titulo="Excluir" perigo onClick={() => setConfirmarExclusao(b.id)}>
                    <Trash2 size={14} />
                  </BotaoIcone>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {modal && (
        <ModalBlocoPacote
          nomePacote={nomePacote}
          inicial={modal.bloco}
          onFechar={() => setModal(null)}
          onSalvar={async (v) => {
            if (modal.bloco) await onEditar(modal.bloco.id, v);
            else await onCriar(v);
            toast.success(modal.bloco ? "Bloco atualizado" : "Bloco criado");
          }}
        />
      )}
    </div>
  );
}
