/**
 * Pacotes de Conhecimento — tela do tenant dentro do Hub de Conhecimento do agente.
 *
 * Pacote = conhecimento EXTRA (bônus/upgrade). Ligado, o agente soma ao que já sabe;
 * desligado, o agente fica só com o conhecimento padrão. Duas origens:
 *  - "Da Babel": criados pelo admin. Os vendidos na Loja pedem instalação antes de ligar.
 *  - "Meus pacotes": criados pelo próprio dono, com CRUD completo.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Sparkles,
  Store,
  Trash2,
} from "lucide-react";
import { BotaoIcone, BotaoPrimario, Vazio } from "../hub-conhecimento/ui-hub";
import {
  alternarAtivoBlocoPacote,
  alternarPacote,
  criarBlocoPacote,
  criarPacoteTenant,
  editarBlocoPacote,
  editarPacote,
  excluirBlocoPacote,
  excluirPacote,
  mensagemErro,
} from "./dados-pacotes";
import { resumoBlocos, situacaoPacote, type Pacote } from "./logica-pacotes";
import { usePacotesAgente, type EstadoPacotesAgente as Estado } from "./use-pacotes-agente";
import { Etiqueta, Interruptor, ListaBlocosPacote, ModalPacote, type ToastApi } from "./ui-pacotes";

export function PacotesConhecimento({
  tenantId,
  agenteId,
  toast,
  onVoltar,
}: {
  tenantId: string;
  agenteId: string | null;
  toast: ToastApi;
  onVoltar: () => void;
}) {
  const { estado, erro, recarregar } = usePacotesAgente(tenantId, agenteId);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [alternando, setAlternando] = useState<string | null>(null);
  const [modalPacote, setModalPacote] = useState<{ pacote: Pacote | null } | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);

  const daBabel = useMemo(
    () => (estado?.pacotes ?? []).filter((p) => p.origem === "admin"),
    [estado],
  );
  const meus = useMemo(
    () => (estado?.pacotes ?? []).filter((p) => p.origem === "tenant"),
    [estado],
  );

  function alternarAberto(id: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function executar(acao: () => Promise<void>, ok: string) {
    try {
      await acao();
      toast.success(ok);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      await recarregar();
    }
  }

  async function alternar(p: Pacote, ligar: boolean) {
    if (!agenteId) return;
    setAlternando(p.id);
    await executar(
      () => alternarPacote(p.id, agenteId, tenantId, ligar),
      ligar ? `"${p.nome}" ligado` : `"${p.nome}" desligado`,
    );
    setAlternando(null);
  }

  function abrirLoja() {
    window.dispatchEvent(new CustomEvent("ragentic-abrir-app", { detail: { slug: "loja" } }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <BotaoIcone titulo="Voltar ao mapa" onClick={onVoltar}>
          <ArrowLeft size={16} />
        </BotaoIcone>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "oklch(0.98 0 0)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Sparkles size={16} style={{ color: "oklch(0.78 0.14 75)" }} /> Pacotes extras
          </span>
          <span
            style={{
              fontSize: 11,
              color: "oklch(0.98 0 0 / 0.55)",
              lineHeight: 1.5,
              maxWidth: 640,
            }}
          >
            Conhecimento a mais para o agente, em pacotes que você liga e desliga. Ligado, ele soma
            ao que o agente já sabe. Desligado, o agente continua só com o conhecimento padrão.
          </span>
        </div>
      </div>

      {!agenteId && <Vazio pequeno mensagem="Crie o agente primeiro para ligar pacotes." />}
      {erro && <span style={{ fontSize: 12, color: "oklch(0.75 0.16 40)" }}>{erro}</span>}
      {!estado && !erro && <Vazio mensagem="Carregando pacotes…" />}

      {estado && (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "oklch(0.98 0 0 / 0.45)",
              }}
            >
              Da Babel
            </span>
            {daBabel.length === 0 ? (
              <Vazio pequeno mensagem="Nenhum pacote da Babel disponível ainda." />
            ) : (
              daBabel.map((p) => (
                <CardPacote
                  key={p.id}
                  p={p}
                  estado={estado}
                  aberto={abertos.has(p.id)}
                  alternando={alternando === p.id}
                  agenteId={agenteId}
                  confirmandoExclusao={confirmarExclusao === p.id}
                  toast={toast}
                  onAlternarAberto={() => alternarAberto(p.id)}
                  onAlternar={(ligar) => void alternar(p, ligar)}
                  onEditarPacote={() => setModalPacote({ pacote: p })}
                  onPedirExclusao={() => setConfirmarExclusao(p.id)}
                  onExcluir={() => {
                    setConfirmarExclusao(null);
                    void executar(() => excluirPacote(p.id), "Pacote excluído");
                  }}
                  onAbrirLoja={abrirLoja}
                  recarregar={recarregar}
                />
              ))
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "oklch(0.98 0 0 / 0.45)",
                }}
              >
                Meus pacotes
              </span>
              <BotaoPrimario onClick={() => setModalPacote({ pacote: null })}>
                <Plus size={14} /> Novo pacote
              </BotaoPrimario>
            </div>
            {meus.length === 0 ? (
              <Vazio
                pequeno
                mensagem="Você ainda não criou pacotes."
                dica="Crie um pacote para agrupar conhecimento extra, como uma campanha, um produto sazonal ou um roteiro especial."
              />
            ) : (
              meus.map((p) => (
                <CardPacote
                  key={p.id}
                  p={p}
                  estado={estado}
                  aberto={abertos.has(p.id)}
                  alternando={alternando === p.id}
                  agenteId={agenteId}
                  confirmandoExclusao={confirmarExclusao === p.id}
                  toast={toast}
                  onAlternarAberto={() => alternarAberto(p.id)}
                  onAlternar={(ligar) => void alternar(p, ligar)}
                  onEditarPacote={() => setModalPacote({ pacote: p })}
                  onPedirExclusao={() => setConfirmarExclusao(p.id)}
                  onExcluir={() => {
                    setConfirmarExclusao(null);
                    void executar(() => excluirPacote(p.id), "Pacote excluído");
                  }}
                  onAbrirLoja={abrirLoja}
                  recarregar={recarregar}
                />
              ))
            )}
          </section>
        </>
      )}

      {modalPacote && (
        <ModalPacote
          inicial={
            modalPacote.pacote
              ? { nome: modalPacote.pacote.nome, descricao: modalPacote.pacote.descricao }
              : null
          }
          onFechar={() => setModalPacote(null)}
          onSalvar={async (v) => {
            if (modalPacote.pacote) {
              await editarPacote(modalPacote.pacote.id, v);
              toast.success("Pacote atualizado");
            } else {
              const novo = await criarPacoteTenant(tenantId, v);
              setAbertos((s) => new Set(s).add(novo.id));
              toast.success("Pacote criado — agora adicione os blocos e ligue");
            }
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

function CardPacote({
  p,
  estado,
  aberto,
  alternando,
  agenteId,
  confirmandoExclusao,
  toast,
  onAlternarAberto,
  onAlternar,
  onEditarPacote,
  onPedirExclusao,
  onExcluir,
  onAbrirLoja,
  recarregar,
}: {
  p: Pacote;
  estado: Estado;
  aberto: boolean;
  alternando: boolean;
  agenteId: string | null;
  confirmandoExclusao: boolean;
  toast: ToastApi;
  onAlternarAberto: () => void;
  onAlternar: (ligar: boolean) => void;
  onEditarPacote: () => void;
  onPedirExclusao: () => void;
  onExcluir: () => void;
  onAbrirLoja: () => void;
  recarregar: () => Promise<void>;
}) {
  const blocos = estado.blocos.filter((b) => b.pacote_id === p.id);
  const instalado = !!p.loja_aplicativo_id && estado.instalados.has(p.loja_aplicativo_id);
  const situacao = situacaoPacote(p, { ligado: !!estado.ligados[p.id], instalado });
  const editavel = p.origem === "tenant";
  const ligado = situacao === "ligado";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 14,
        background: ligado ? "oklch(0.22 0.07 160 / 0.28)" : "oklch(0.18 0.06 280 / 0.4)",
        border: `1px solid ${ligado ? "oklch(0.72 0.16 155 / 0.35)" : "oklch(0.98 0 0 / 0.07)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <button
          type="button"
          onClick={onAlternarAberto}
          aria-expanded={aberto}
          aria-label={aberto ? `Recolher ${p.nome}` : `Ver blocos de ${p.nome}`}
          style={{
            background: "transparent",
            border: "none",
            color: "oklch(0.98 0 0 / 0.6)",
            cursor: "pointer",
            padding: 2,
            marginTop: 1,
          }}
        >
          {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
              {p.nome}
            </span>
            {ligado && <Etiqueta cor="oklch(0.78 0.16 155)">Ligado</Etiqueta>}
            {p.loja_aplicativo_id && <Etiqueta cor="oklch(0.75 0.14 300)">Loja</Etiqueta>}
            {!p.ativo && <Etiqueta cor="oklch(0.7 0.02 280)">Pausado</Etiqueta>}
          </div>
          {p.descricao && (
            <span style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.6)", lineHeight: 1.5 }}>
              {p.descricao}
            </span>
          )}
          <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)" }}>
            {situacao === "instalar"
              ? "Instale na Loja para ver o conteúdo e ligar"
              : resumoBlocos(blocos)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {editavel && (
            <>
              <BotaoIcone titulo="Editar pacote" onClick={onEditarPacote}>
                <Pencil size={14} />
              </BotaoIcone>
              {confirmandoExclusao ? (
                <button
                  type="button"
                  onClick={onExcluir}
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
                <BotaoIcone titulo="Excluir pacote" perigo onClick={onPedirExclusao}>
                  <Trash2 size={14} />
                </BotaoIcone>
              )}
            </>
          )}
          {situacao === "instalar" ? (
            <BotaoPrimario onClick={onAbrirLoja}>
              <Store size={14} /> Instalar na Loja
            </BotaoPrimario>
          ) : (
            <Interruptor
              ligado={ligado}
              rotulo={ligado ? `Desligar ${p.nome}` : `Ligar ${p.nome}`}
              desabilitado={alternando || !agenteId || (!p.ativo && !ligado)}
              onToggle={() => onAlternar(!ligado)}
            />
          )}
        </div>
      </div>

      {aberto && situacao !== "instalar" && (
        <div style={{ paddingLeft: 26 }}>
          <ListaBlocosPacote
            nomePacote={p.nome}
            blocos={blocos}
            editavel={editavel}
            toast={toast}
            onCriar={async (v) => {
              await criarBlocoPacote(p.id, v, blocos.length);
              await recarregar();
            }}
            onEditar={async (id, v) => {
              await editarBlocoPacote(id, v);
              await recarregar();
            }}
            onAlternarAtivo={async (id, ativo) => {
              await alternarAtivoBlocoPacote(id, ativo);
              await recarregar();
            }}
            onExcluir={async (id) => {
              await excluirBlocoPacote(id);
              await recarregar();
            }}
          />
        </div>
      )}
    </div>
  );
}
