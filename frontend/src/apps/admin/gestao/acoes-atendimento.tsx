/**
 * Ações de passagem do atendimento (Lotes 3 e 4, 2026-09-24): um lugar só para os botões que aparecem na
 * lista E no detalhe — artefato `botoesAtend` :2445-2481 e os `act(...)` de :3118-3203.
 *
 * Cada ação abre o mesmo modal do artefato, com os mesmos textos, campos e validações; onde o artefato pede
 * `confirmar(...)` (:3988), aqui abre `ModalConfirmar` (título, texto, "Voltar" e o botão do artefato).
 *
 * Decisões que valem acima do artefato (não desfazer):
 *  - D-2: a ÁREA "Programador" aparece como "P&D"; a PESSOA continua "programador" (campos "Programador",
 *    "Programador responsável", "Quem está devolvendo").
 *  - D-3: enviar ao P&D não exige programador ("— escolher depois —"); o registro `extras.encaminhamentos`
 *    {em, de, para, por} continua sendo gravado.
 *  - Apagar = `apagar()` (marca `deleted_at`); nunca DELETE. Sucesso só depois do banco devolver a linha.
 *  - Datas de calendário sem fuso (AAAA-MM-DD); instantes em ISO.
 */

import { useState, type ReactNode } from "react";
import { apagar, atualizar, definirSuporteCliente, excluirDoSuporte, mensagemDeErro } from "./dados";
import { dataDeBR, equipeSuporte, horaValida, mascararData, mascararHora, proximoSuporte } from "./calculos";
import {
  agoraHM,
  atendimentoDaImpl,
  atendimentoIntocado,
  dataHoraAs,
  diarioDoContexto,
  diasPreenchidos,
  hojeBR,
  nomeClienteImpl,
  nomesDaArea,
  pendenciasProg,
  type GravadorAtendimento,
  type RegistroAtendimento,
} from "./logica-atendimento";
import { ModalFinalizarImpl } from "./modal-finalizar";
import { ModalIniciarAtendimento } from "./modal-iniciar";
import { obsConcluidoSemAcompanhamento } from "./logica-chamados";
import {
  podeEscrever,
  type Dados,
  type Implementacao,
  type Papel,
  type PropsAba,
  type SuporteAtend,
  type ToastApi,
} from "./tipos";
import { Campo, Faixa, Modal } from "./ui-gestao";

type Linha = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Caixa de confirmação — artefato `confirmar` :3988-3995
// ---------------------------------------------------------------------------

export function ModalConfirmar({
  titulo,
  texto,
  rotulo,
  perigo,
  onConfirmar,
  onClose,
}: {
  titulo: string;
  texto: string;
  rotulo: string;
  perigo?: boolean;
  /** Faz a gravação (e mostra o próprio erro). A caixa fecha quando termina. */
  onConfirmar: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  async function sim() {
    setSalvando(true);
    try {
      await onConfirmar();
    } finally {
      setSalvando(false);
      onClose();
    }
  }
  return (
    <Modal
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={salvando}>
            Voltar
          </button>
          <button
            type="button"
            className={perigo ? "btn btn-sm" : "btn btn-primary btn-sm"}
            style={perigo ? { color: "var(--os-erro)" } : undefined}
            disabled={salvando}
            onClick={() => void sim()}
          >
            {salvando ? "Gravando…" : rotulo}
          </button>
        </>
      }
    >
      <p className="small" style={{ lineHeight: 1.55 }}>
        {texto}
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export type TipoAcao =
  | "impl-iniciar"
  | "impl-concluir"
  | "impl-retornar"
  | "impl-finalizar"
  | "impl-reabrir"
  | "impl-excluir-hist"
  | "impl-remover"
  | "prog-iniciar"
  | "prog-concluir"
  | "prog-devolver-impl"
  | "prog-remover"
  | "prog-excluir-hist"
  | "sup-iniciar"
  | "sup-concluir"
  /** Acompanhamento de 15 dias que não precisou acontecer (25/09): conclui direto do "aguardando", com motivo. */
  | "sup-concluir-direto"
  | "sup-reabrir"
  | "sup-excluir";

export interface AcaoAtendimento {
  tipo: TipoAcao;
  im?: Implementacao;
  at?: SuporteAtend;
}

export interface OpcoesAcoes {
  dados: Dados;
  papeis: Papel[];
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  meuNome: string | null;
  /** Depois de iniciar (artefato :2908 e :2996 abrem o detalhe). */
  aoIniciar?: (ctx: "impl" | "prog" | "sup", id: string) => void;
  /** Quando a ação tira o registro da tela aberta (artefato `S.impSel=null` / `S.progSel=null` / `S.supSel=null`). */
  aoSair?: () => void;
  /**
   * No detalhe: o gravador compartilhado da tela (B7). Gravações que mexem em `extras` passam por ele, para não
   * apagarem o que o diário ou as tentativas acabaram de gravar.
   */
  gravador?: GravadorAtendimento<RegistroAtendimento> | null;
}

export interface PermissoesAcoes {
  /** gestao_implementacoes: implementação e P&D (RLS). */
  impl: boolean;
  /** gestao_suporte_atend: implementação e suporte (RLS). */
  sup: boolean;
  /**
   * "Excluir do suporte" grava na implementação (`suporte_removido`), no atendimento e nas reuniões: só quem
   * escreve nas três tabelas (hoje, admin). PENDÊNCIA DE BANCO: o papel Suporte não altera implementações.
   */
  supExcluir: boolean;
  /** gestao_funcionarios: hoje só admin (PENDÊNCIA DE BANCO: no artefato qualquer papel da aba cadastra). */
  funcionarios: boolean;
}

export function permissoesAcoes(papeis: Papel[]): PermissoesAcoes {
  const impl = podeEscrever(papeis, "implementacoes");
  const sup = podeEscrever(papeis, "suporteAtend");
  return {
    impl,
    sup,
    // Excluir do suporte: marca pela função estreita (suporte/implementação) e apaga atendimento + reuniões (suporte).
    supExcluir: sup && podeEscrever(papeis, "reunioes"),
    funcionarios: podeEscrever(papeis, "funcionarios"),
  };
}

/** Estado + modais das ações. `abrir(...)` é o `act(...)` do artefato; `modais` vai no fim da tela. */
export function useAcoesAtendimento(op: OpcoesAcoes): {
  abrir: (a: AcaoAtendimento) => void;
  pode: PermissoesAcoes;
  modais: ReactNode;
} {
  const [acao, setAcao] = useState<AcaoAtendimento | null>(null);
  const { papeis, t, recarregar } = op;
  const pode = permissoesAcoes(papeis);

  async function reabrirSup(at: SuporteAtend) {
    // artefato :3203 — sem confirmação
    try {
      await atualizar("gestao_suporte_atend", at.id, { status: "andamento", concluido_em: null });
      await recarregar(["suporteAtend"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui reabrir o atendimento."));
    }
  }

  function abrir(a: AcaoAtendimento) {
    if (a.tipo === "sup-reabrir" && a.at) {
      void reabrirSup(a.at);
      return;
    }
    if (a.tipo === "prog-concluir" && a.im && !a.im.prog_iniciado_em) {
      // artefato :3149-3150
      t.info("Inicie o atendimento do programador antes de concluir.");
      setAcao({ tipo: "prog-iniciar", im: a.im });
      return;
    }
    setAcao(a);
  }

  const fechar = () => setAcao(null);
  const modais = acao ? <ModaisAcao acao={acao} op={op} pode={pode} onClose={fechar} /> : null;
  return { abrir, pode, modais };
}

// ---------------------------------------------------------------------------
// Os modais, um por ação
// ---------------------------------------------------------------------------

function ModaisAcao({
  acao,
  op,
  pode,
  onClose,
}: {
  acao: AcaoAtendimento;
  op: OpcoesAcoes;
  pode: PermissoesAcoes;
  onClose: () => void;
}) {
  const { dados, t, recarregar, aoIniciar, aoSair, gravador } = op;
  const im = acao.im;
  const at = acao.at;
  const nome = im ? nomeClienteImpl(im, dados.clientes) : at ? nomeClienteImpl(at, dados.clientes) : "Cliente";

  /** Grava na implementação; no detalhe, pela fila do gravador (retrato mais recente de `extras`). */
  async function gravarImpl(alvo: Implementacao, patch: (atual: Implementacao) => Linha): Promise<void> {
    if (gravador && gravador.obterAtual().id === alvo.id) {
      await gravador.gravar((atual) => atualizar("gestao_implementacoes", alvo.id, patch(atual as Implementacao)));
    } else {
      await atualizar("gestao_implementacoes", alvo.id, patch(alvo));
    }
  }

  /** removerImpl / "Excluir de vez" — artefato :3031-3050 e :3018-3029: a implementação e as reuniões dela. */
  async function apagarImplementacao(alvo: Implementacao): Promise<boolean> {
    try {
      await apagar("gestao_implementacoes", alvo.id, "Não consegui remover da implementação.");
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui remover da implementação."));
      return false;
    }
    const reus = dados.implReunioes.filter((r) => r.impl_id === alvo.id);
    let falhas = 0;
    for (const r of reus) {
      try {
        await apagar("gestao_impl_reunioes", r.id);
      } catch {
        falhas++;
      }
    }
    if (falhas)
      t.error(`A implementação foi removida, mas ${falhas} reunião(ões) dela não foram apagadas. Tente de novo pela lista de reuniões.`);
    await recarregar(["implementacoes", "implReunioes"]);
    return true;
  }

  switch (acao.tipo) {
    case "impl-iniciar":
    case "sup-iniciar": {
      const sup = acao.tipo === "sup-iniciar";
      const reg = sup ? at : im;
      if (!reg) return null;
      return (
        <ModalIniciarAtendimento
          fila={sup ? "suporte" : "implementacao"}
          id={reg.id}
          nomeCliente={nome}
          enviadoEm={reg.enviado_em}
          responsavelAtual={reg.responsavel}
          pessoas={sup ? equipeSuporte(dados.config) : nomesDaArea(dados.funcionarios, "implementacao")}
          t={t}
          recarregar={recarregar}
          onClose={onClose}
          aoIniciar={() => aoIniciar?.(sup ? "sup" : "impl", reg.id)}
        />
      );
    }

    case "impl-finalizar":
      if (!im) return null;
      return (
        <ModalFinalizarImpl
          impl={im}
          nomeCliente={nome}
          proximo={proximoSuporte(dados.config)}
          equipe={equipeSuporte(dados.config)}
          implReunioes={dados.implReunioes}
          suporteAtend={dados.suporteAtend}
          t={t}
          recarregar={recarregar}
          onClose={onClose}
          aoConcluir={aoSair}
        />
      );

    case "impl-concluir":
      if (!im) return null;
      return <ModalEnviarProg im={im} nome={nome} op={op} gravarImpl={gravarImpl} onClose={onClose} />;

    case "impl-retornar":
      if (!im) return null;
      return <ModalRetornarProg im={im} nome={nome} op={op} gravarImpl={gravarImpl} onClose={onClose} />;

    case "prog-iniciar":
      if (!im) return null;
      return <ModalIniciarProg im={im} nome={nome} op={op} gravarImpl={gravarImpl} onClose={onClose} />;

    case "prog-concluir":
      if (!im) return null;
      return <ModalConcluirProg im={im} nome={nome} op={op} gravarImpl={gravarImpl} onClose={onClose} />;

    case "prog-devolver-impl":
      if (!im) return null;
      return <ModalDevolverImpl im={im} nome={nome} op={op} gravarImpl={gravarImpl} onClose={onClose} />;

    case "prog-remover":
      if (!im) return null;
      return (
        <ModalRemoverProg
          nome={nome}
          onClose={onClose}
          onDevolver={async () => {
            try {
              await gravarImpl(im, () => ({
                status: "andamento",
                enviado_prog_em: null,
                prog_iniciado_em: null,
                prog_inicio: null,
                prog_inicio_hora: null,
              }));
              t.success(`${nome} voltou para a implementação.`);
              aoSair?.();
              await recarregar(["implementacoes"]);
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui devolver para a implementação."));
            }
          }}
          onExcluir={async () => {
            if (await apagarImplementacao(im)) {
              t.success(`${nome} foi excluído do P&D e da implementação.`);
              aoSair?.();
            }
          }}
        />
      );

    case "impl-remover":
      if (!im) return null;
      return (
        <ModalConfirmar
          titulo="Remover da implementação"
          texto={`Remover ${nome} da implementação? O cliente continua na aba Clientes, mas as anotações, tentativas de contato e reuniões desta implementação serão apagadas.`}
          rotulo="Remover da implementação"
          perigo
          onClose={onClose}
          onConfirmar={async () => {
            if (await apagarImplementacao(im)) {
              t.success(`${nome} foi removido da implementação.`);
              aoSair?.();
            }
          }}
        />
      );

    case "impl-excluir-hist":
    case "prog-excluir-hist": {
      if (!im) return null;
      const ehImpl = acao.tipo === "impl-excluir-hist";
      return (
        <ModalConfirmar
          titulo={ehImpl ? "Excluir do histórico da implementação" : "Excluir dos concluídos do P&D"}
          texto={
            `Excluir ${nome}${ehImpl ? " do histórico da Implementação?" : " dos concluídos do P&D?"} Ele deixa de aparecer nesta aba. ` +
            (ehImpl
              ? "O atendimento no Suporte e o cliente na aba Clientes não são alterados."
              : "A Implementação, o Suporte e a aba Clientes não são alterados.")
          }
          rotulo="Excluir"
          perigo
          onClose={onClose}
          onConfirmar={async () => {
            try {
              await gravarImpl(im, () => (ehImpl ? { oculto_impl: true } : { oculto_prog: true }));
              t.success(`${nome} foi excluído ${ehImpl ? "do histórico da implementação." : "dos concluídos do P&D."}`);
              aoSair?.();
              await recarregar(["implementacoes"]);
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui excluir."));
            }
          }}
        />
      );
    }

    case "impl-reabrir":
      if (!im) return null;
      return (
        <ModalConfirmar
          titulo="Reabrir em validação"
          texto={`Reabrir ${nome}? Ele sai do histórico e volta para “Em validação” na Implementação. O responsável de suporte já definido não muda.`}
          rotulo="Reabrir"
          onClose={onClose}
          onConfirmar={async () => {
            try {
              await gravarImpl(im, () => ({
                status: "validacao",
                concluido_em: null,
                validacao_desde: new Date().toISOString(),
              }));
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui reabrir em validação."));
              return;
            }
            // O atendimento de suporte só sai se ninguém mexeu nele (artefato :3170-3172).
            const sa = atendimentoDaImpl(dados.suporteAtend, im.id);
            if (sa && atendimentoIntocado(sa) && pode.sup) {
              try {
                await apagar("gestao_suporte_atend", sa.id);
              } catch (e) {
                t.error(
                  `${mensagemDeErro(e, "Não consegui apagar o atendimento de suporte.")} A implementação voltou para validação, mas o atendimento no Suporte continua.`,
                );
              }
            }
            await recarregar(["implementacoes", "suporteAtend"]);
          }}
        />
      );

    case "sup-excluir":
      if (!im) return null;
      return (
        <ModalConfirmar
          titulo="Excluir do suporte"
          texto={`Excluir ${nome} da lista de atendimentos do suporte? O atendimento, as tentativas, o diário e as reuniões ligadas a ele serão apagados. O cliente continua na aba Clientes e no histórico da Implementação.`}
          rotulo="Excluir"
          perigo
          onClose={onClose}
          onConfirmar={async () => {
            // Ordem segura: primeiro tira da lista (suporte_removido); depois apaga o atendimento e as reuniões.
            try {
              await excluirDoSuporte(im.id);
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui excluir do suporte."));
              return;
            }
            const sa = atendimentoDaImpl(dados.suporteAtend, im.id);
            let falhas = 0;
            if (sa) {
              for (const r of dados.reunioes.filter((x) => x.atend_id === sa.id)) {
                try {
                  await apagar("gestao_reunioes", r.id);
                } catch {
                  falhas++;
                }
              }
              try {
                await apagar("gestao_suporte_atend", sa.id);
              } catch {
                falhas++;
              }
            }
            if (falhas) t.error(`${nome} saiu da lista, mas ${falhas} registro(s) do atendimento não foram apagados.`);
            else t.success(`${nome} foi excluído do suporte.`);
            aoSair?.();
            await recarregar(["implementacoes", "suporteAtend", "reunioes"]);
          }}
        />
      );

    case "sup-concluir":
      if (!at) return null;
      return <ModalConcluirSup at={at} nome={nome} op={op} onClose={onClose} />;

    case "sup-concluir-direto":
      if (!at) return null;
      return <ModalConcluirSemAcompanhamento at={at} nome={nome} op={op} onClose={onClose} />;

    default:
      return null;
  }
}

type GravarImpl = (alvo: Implementacao, patch: (atual: Implementacao) => Linha) => Promise<void>;

interface PropsModalImpl {
  im: Implementacao;
  nome: string;
  op: OpcoesAcoes;
  gravarImpl: GravarImpl;
  onClose: () => void;
}

function SelectNomes({
  valor,
  onChange,
  nomes,
  vazio,
}: {
  valor: string;
  onChange: (v: string) => void;
  nomes: string[];
  vazio: string;
}) {
  return (
    <select className="input" value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vazio}</option>
      {nomes.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/** Lista de nomes + o nome atual, se ele não estiver mais na lista (artefato :2606, :2976, :2891). */
const comAtual = (nomes: string[], atual: string | null | undefined): string[] =>
  atual && !nomes.includes(atual) ? [...nomes, atual] : nomes;

function RodapeModal({
  onClose,
  salvando,
  rotulo,
  onOk,
}: {
  onClose: () => void;
  salvando: boolean;
  rotulo: string;
  onOk: () => void;
}) {
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={salvando}>
        Cancelar
      </button>
      <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={onOk}>
        {salvando ? "Gravando…" : rotulo}
      </button>
    </>
  );
}

/** modalEnviarProg — artefato :2561-2581 ("Concluir implementação e enviar ao programador"; D-2: P&D). */
function ModalEnviarProg({ im, nome, op, gravarImpl, onClose }: PropsModalImpl) {
  const { dados, t, recarregar, meuNome } = op;
  const pend = dados.implReunioes.filter((r) => r.impl_id === im.id && r.status === "Agendada").length;
  const progs = nomesDaArea(dados.funcionarios, "programador");
  const [prog, setProg] = useState(im.programador ?? "");
  const [recado, setRecado] = useState(String((im.extras?.obsParaProg as string | undefined) ?? ""));
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      await gravarImpl(im, (atual) => {
        const extras = { ...(atual.extras ?? {}) };
        const anteriores = (extras.encaminhamentos as unknown[] | undefined) ?? [];
        return {
          status: "programador",
          enviado_prog_em: agora,
          // D-3: programador opcional; sem escolha, fica na fila do P&D para alguém "Assumir".
          programador: prog || null,
          extras: {
            ...extras,
            implConcluidoEm: agora,
            obsParaProg: recado.trim(),
            encaminhamentos: [...anteriores, { em: agora, de: "implementacao", para: "pd", por: meuNome ?? null }],
          },
        };
      });
      t.success(`${nome} foi enviado ao P&D.`);
      onClose();
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui enviar ao P&D."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Concluir implementação e enviar ao P&D"
      onClose={onClose}
      rodape={<RodapeModal onClose={onClose} salvando={salvando} rotulo="Enviar ao P&D" onOk={() => void ok()} />}
    >
      <p className="muted small">
        {nome} · {diasPreenchidos(diarioDoContexto("impl", im))} dia(s) com registro. O cliente vai para a aba P&D.
        Quando o P&D concluir a parte dele, o cliente volta para cá como concluído, entra no histórico e é enviado
        automaticamente ao suporte.
      </p>
      {pend > 0 && <Faixa tom="aviso">Ainda há {pend} reunião(ões) de implementação agendada(s).</Faixa>}
      <Campo rotulo="Programador">
        <SelectNomes
          valor={prog}
          onChange={setProg}
          nomes={progs}
          vazio={progs.length ? "— escolher depois —" : "Nenhum programador cadastrado"}
        />
      </Campo>
      <Campo rotulo="Recado para o P&D">
        <textarea
          className="input"
          rows={4}
          value={recado}
          onChange={(e) => setRecado(e.target.value)}
          placeholder="Ex.: fluxos configurados; falta integrar a agenda e ajustar a mensagem de boas-vindas."
        />
      </Campo>
    </Modal>
  );
}

/** modalRetornarProg — artefato :2603-2625. */
function ModalRetornarProg({ im, nome, op, gravarImpl, onClose }: PropsModalImpl) {
  const { dados, t, recarregar, aoSair } = op;
  const progs = comAtual(nomesDaArea(dados.funcionarios, "programador"), im.programador);
  const [prog, setProg] = useState(im.programador ?? "");
  const [por, setPor] = useState(im.responsavel ?? "");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    const mot = motivo.trim();
    if (!mot) {
      t.error("Descreva o que ainda precisa ser resolvido.");
      return;
    }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      await gravarImpl(im, (atual) => ({
        status: "programador",
        retornos: [...(atual.retornos ?? []), { em: agora, motivo: mot, por: por || undefined }],
        prog_concluido_em: null,
        validacao_desde: null,
        ultima_volta: "",
        oculto_prog: false,
        programador: prog || atual.programador || null,
        enviado_prog_em: agora,
      }));
      t.success(`${nome} retornou ao P&D.`);
      onClose();
      aoSair?.();
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui retornar ao P&D."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Retornar ao P&D"
      onClose={onClose}
      rodape={<RodapeModal onClose={onClose} salvando={salvando} rotulo="Retornar ao P&D" onOk={() => void ok()} />}
    >
      <p className="muted small">{nome} volta para a aba P&D. Descreva o que ainda não está resolvido.</p>
      <Campo rotulo="Programador">
        <SelectNomes valor={prog} onChange={setProg} nomes={progs} vazio="— escolher —" />
      </Campo>
      <Campo rotulo="Quem está retornando">
        <SelectNomes
          valor={por}
          onChange={setPor}
          nomes={comAtual(nomesDaArea(dados.funcionarios, "implementacao"), im.responsavel)}
          vazio="—"
        />
      </Campo>
      <Campo rotulo="O que ainda precisa ser resolvido">
        <textarea
          className="input"
          rows={4}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: no teste, o reagendamento não enviou confirmação ao cliente."
        />
      </Campo>
    </Modal>
  );
}

/** modalIniciarProg — artefato :2973-2999 (programador obrigatório, data e hora). */
function ModalIniciarProg({ im, nome, op, gravarImpl, onClose }: PropsModalImpl) {
  const { dados, t, recarregar, aoIniciar } = op;
  const progs = comAtual(nomesDaArea(dados.funcionarios, "programador"), im.programador);
  const [prog, setProg] = useState(im.programador ?? "");
  const [data, setData] = useState(hojeBR());
  const [hora, setHora] = useState(agoraHM());
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    if (!prog) {
      t.error(progs.length ? "Escolha o programador." : "Cadastre um programador antes de iniciar.");
      return;
    }
    const dt = dataDeBR(data);
    if (!dt) {
      t.error("Informe a data de início no formato dd/mm/aaaa.");
      return;
    }
    const hi = hora.trim();
    if (hi && !horaValida(hi)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      return;
    }
    setSalvando(true);
    try {
      await gravarImpl(im, () => ({
        programador: prog,
        prog_inicio: dt,
        prog_inicio_hora: hi || null,
        prog_iniciado_em: new Date().toISOString(),
      }));
      t.success("Atendimento do P&D iniciado.");
      onClose();
      await recarregar(["implementacoes"]);
      aoIniciar?.("prog", im.id);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui iniciar o atendimento."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Iniciar atendimento do P&D"
      onClose={onClose}
      rodape={<RodapeModal onClose={onClose} salvando={salvando} rotulo="Iniciar atendimento" onOk={() => void ok()} />}
    >
      <p className="muted small">
        {nome} · recebido da implementação em {dataHoraAs(im.enviado_prog_em)}.
      </p>
      <Campo rotulo="Programador responsável">
        <SelectNomes valor={prog} onChange={setProg} nomes={progs} vazio="— escolher —" />
      </Campo>
      <div className="row gap-3" style={{ flexWrap: "wrap" }}>
        <Campo rotulo="Data de início">
          <input
            className="input"
            inputMode="numeric"
            maxLength={10}
            placeholder="dd/mm/aaaa"
            value={data}
            onChange={(e) => setData(mascararData(e.target.value))}
          />
        </Campo>
        <Campo rotulo="Horário (24h)">
          <input
            className="input"
            inputMode="numeric"
            maxLength={5}
            placeholder="hh:mm"
            value={hora}
            onChange={(e) => setHora(mascararHora(e.target.value))}
          />
        </Campo>
      </div>
    </Modal>
  );
}

/** modalConcluirProg — artefato :2582-2602. */
function ModalConcluirProg({ im, nome, op, gravarImpl, onClose }: PropsModalImpl) {
  const { t, recarregar, aoSair } = op;
  const pend = pendenciasProg(diarioDoContexto("impl", im)).length;
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const texto = obs.trim();
      await gravarImpl(im, (atual) => {
        const extras = { ...(atual.extras ?? {}) };
        const entregas = (extras.entregas as unknown[] | undefined) ?? [];
        return {
          status: "validacao",
          prog_concluido_em: agora,
          validacao_desde: agora,
          ultima_volta: "entrega",
          extras: {
            ...extras,
            obsProgFinal: texto,
            entregas: [...entregas, { em: agora, obs: texto, por: atual.programador ?? "" }],
          },
        };
      });
      t.success(`${nome} voltou para a implementação para testes e call.`);
      onClose();
      aoSair?.();
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui concluir a parte do P&D."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Concluir parte do P&D"
      onClose={onClose}
      rodape={
        <RodapeModal
          onClose={onClose}
          salvando={salvando}
          rotulo="Concluir e devolver para a implementação"
          onOk={() => void ok()}
        />
      }
    >
      <p className="muted small">
        {nome} volta para a aba <b>Implementação</b> para o time testar tudo e fazer a call com o cliente. Se estiver
        tudo certo, a implementação conclui e o cliente vai automaticamente para o Suporte.
      </p>
      {pend > 0 && <Faixa tom="aviso">Há {pend} pedido(s) no diário sem data de resolução.</Faixa>}
      <Campo rotulo="O que foi entregue">
        <textarea
          className="input"
          rows={4}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: integração da agenda feita, mensagem de boas-vindas ajustada. Testar o fluxo de reagendamento."
        />
      </Campo>
    </Modal>
  );
}

/** modalDevolverImpl — artefato :2626-2645. */
function ModalDevolverImpl({ im, nome, op, gravarImpl, onClose }: PropsModalImpl) {
  const { dados, t, recarregar, aoSair } = op;
  const [por, setPor] = useState(im.programador ?? "");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    const mot = motivo.trim();
    if (!mot) {
      t.error("Explique por que está retornando.");
      return;
    }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      await gravarImpl(im, (atual) => {
        const extras = { ...(atual.extras ?? {}) };
        const devolucoes = (extras.devolucoes as unknown[] | undefined) ?? [];
        return {
          status: "validacao",
          ultima_volta: "devolucao",
          validacao_desde: agora,
          extras: { ...extras, devolucoes: [...devolucoes, { em: agora, motivo: mot, por: por || undefined }] },
        };
      });
      t.success(`${nome} voltou para a implementação.`);
      onClose();
      aoSair?.();
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui retornar à implementação."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Retornar à implementação"
      onClose={onClose}
      rodape={
        <RodapeModal onClose={onClose} salvando={salvando} rotulo="Retornar à implementação" onOk={() => void ok()} />
      }
    >
      <p className="muted small">
        {nome} volta para a aba Implementação como <b>Devolvido pelo P&D</b>. O time de implementação vê o motivo e
        pode retornar ao P&D quando resolver.
      </p>
      <Campo rotulo="Quem está devolvendo">
        <SelectNomes
          valor={por}
          onChange={setPor}
          nomes={comAtual(nomesDaArea(dados.funcionarios, "programador"), im.programador)}
          vazio="—"
        />
      </Campo>
      <Campo rotulo="Por que está voltando para a implementação">
        <textarea
          className="input"
          rows={4}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: preciso do acesso ao sistema do cliente e da planilha de horários."
        />
      </Campo>
    </Modal>
  );
}

/** removerProg — artefato :3000-3030: duas saídas, cada uma com o seu botão. */
function ModalRemoverProg({
  nome,
  onClose,
  onDevolver,
  onExcluir,
}: {
  nome: string;
  onClose: () => void;
  onDevolver: () => Promise<void>;
  onExcluir: () => Promise<void>;
}) {
  const [salvando, setSalvando] = useState(false);
  const rodar = async (fn: () => Promise<void>) => {
    setSalvando(true);
    try {
      await fn();
    } finally {
      setSalvando(false);
      onClose();
    }
  };
  return (
    <Modal
      titulo="Remover do P&D"
      onClose={onClose}
      rodape={
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={salvando}>
          Voltar
        </button>
      }
    >
      <p className="small" style={{ lineHeight: 1.55 }}>
        O que fazer com {nome}?
      </p>
      <div className="os-card" style={{ padding: "12px 14px" }}>
        <b className="small">Devolver para a implementação</b>
        <p className="muted small" style={{ margin: "4px 0 10px" }}>
          Sai da aba P&D e volta como “Em andamento” na Implementação. Anotações, diário e reuniões são mantidos.
        </p>
        <button type="button" className="btn btn-sm" disabled={salvando} onClick={() => void rodar(onDevolver)}>
          Devolver para a implementação
        </button>
      </div>
      <div className="os-card" style={{ padding: "12px 14px" }}>
        <b className="small">Excluir de vez</b>
        <p className="muted small" style={{ margin: "4px 0 10px" }}>
          Apaga esta implementação inteira (anotações, tentativas, diário e reuniões). O cliente continua na aba
          Clientes.
        </p>
        <button
          type="button"
          className="btn btn-sm"
          style={{ color: "var(--os-erro)" }}
          disabled={salvando}
          onClick={() => void rodar(onExcluir)}
        >
          Excluir de vez
        </button>
      </div>
    </Modal>
  );
}

/** modalConcluirSup — artefato :2698-2713. */
function ModalConcluirSup({
  at,
  nome,
  op,
  onClose,
}: {
  at: SuporteAtend;
  nome: string;
  op: OpcoesAcoes;
  onClose: () => void;
}) {
  const { dados, papeis, t, recarregar } = op;
  const pend = dados.reunioes.filter((r) => r.atend_id === at.id && r.status === "Agendada").length;
  const [obs, setObs] = useState(at.obs_final ?? "");
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    setSalvando(true);
    try {
      await atualizar("gestao_suporte_atend", at.id, {
        status: "concluida",
        concluido_em: new Date().toISOString(),
        obs_final: obs.trim(),
      });
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui concluir o atendimento."));
      setSalvando(false);
      return;
    }
    // Artefato :2710: o cliente fica com quem atendeu — pela função estreita (PERMISSOES-IGUAL-ARTEFATO.sql).
    let aviso = "";
    if (at.cliente_id && at.responsavel) {
      try {
        await definirSuporteCliente(at.cliente_id, at.responsavel);
      } catch (e) {
        aviso = ` ${mensagemDeErro(e, "O suporte do cliente não foi atualizado.")}`;
      }
    }
    if (aviso) t.error(`Atendimento de ${nome} concluído, mas o suporte do cliente não foi atualizado.${aviso}`);
    else t.success(`Atendimento de ${nome} concluído.`);
    setSalvando(false);
    onClose();
    await recarregar(["suporteAtend", "clientes"]);
  }

  return (
    <Modal
      titulo="Concluir atendimento de suporte"
      onClose={onClose}
      rodape={<RodapeModal onClose={onClose} salvando={salvando} rotulo="Concluir atendimento" onOk={() => void ok()} />}
    >
      <p className="muted small">
        {nome} · {diasPreenchidos(diarioDoContexto("sup", at))} dia(s) com registro. O cliente continua com{" "}
        {at.responsavel || "o suporte"} e o atendimento vai para os concluídos.
      </p>
      {pend > 0 && <Faixa tom="aviso">Ainda há {pend} reunião(ões) de alinhamento agendada(s).</Faixa>}
      <Campo rotulo="Observação do suporte">
        <textarea
          className="input"
          rows={4}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: cliente operando sozinho, próximos alinhamentos mensais."
        />
      </Campo>
    </Modal>
  );
}

/**
 * "Concluir sem acompanhamento" (25/09, Adrian): o cliente já estava em dia e os 15 dias não precisam acontecer.
 * Motivo obrigatório; grava em obs_final quem concluiu e por quê. Como o ModalConcluirSup, o cliente fica com o responsável.
 */
function ModalConcluirSemAcompanhamento({
  at,
  nome,
  op,
  onClose,
}: {
  at: SuporteAtend;
  nome: string;
  op: OpcoesAcoes;
  onClose: () => void;
}) {
  const { t, recarregar, meuNome } = op;
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function ok() {
    const obs = obsConcluidoSemAcompanhamento(motivo, meuNome);
    if (!obs) {
      setErro("Escreva o motivo para concluir sem acompanhamento.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar("gestao_suporte_atend", at.id, {
        status: "concluida",
        concluido_em: new Date().toISOString(),
        obs_final: obs,
      });
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui concluir o atendimento."));
      setSalvando(false);
      return;
    }
    let aviso = "";
    if (at.cliente_id && at.responsavel) {
      try {
        await definirSuporteCliente(at.cliente_id, at.responsavel);
      } catch (e) {
        aviso = ` ${mensagemDeErro(e, "O suporte do cliente não foi atualizado.")}`;
      }
    }
    if (aviso) t.error(`Atendimento de ${nome} concluído, mas o suporte do cliente não foi atualizado.${aviso}`);
    else t.success(`Atendimento de ${nome} concluído sem acompanhamento.`);
    setSalvando(false);
    onClose();
    await recarregar(["suporteAtend", "clientes"]);
  }

  return (
    <Modal
      titulo="Concluir sem acompanhamento"
      onClose={onClose}
      rodape={<RodapeModal onClose={onClose} salvando={salvando} rotulo="Concluir sem acompanhamento" onOk={() => void ok()} />}
    >
      <p className="muted small">
        {nome} vai direto para os concluídos, sem os 15 dias de acompanhamento. Fica registrado quem concluiu e o motivo.
      </p>
      <Campo rotulo="Motivo">
        <textarea
          className="input"
          rows={3}
          value={motivo}
          onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
          placeholder="Ex.: cliente já estava em dia, sem pendências."
        />
      </Campo>
      {erro && <p className="tiny" role="alert" style={{ color: "var(--os-erro)", margin: "6px 0 0" }}>{erro}</p>}
    </Modal>
  );
}
