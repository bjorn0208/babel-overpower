/**
 * Ações de uma reunião com cliente — artefato :1053-1061 (lista do Suporte) e :2395-2402 (detalhe do atendimento):
 * Concluir / Remarcar / Cancelar (agendada), Editar relato (concluída), Reagendar (cancelada), ✎ Editar e
 * ✕ Excluir (com a caixa "Excluir reunião", :3133-3136). Modais: `modalRelato` :4156, `modalCancelar` :4172,
 * `modalRemarcar` :4187 (com Responsável e Tipo).
 *
 * Serve às duas coleções, como `rcol` do artefato: `gestao_reunioes` (suporte) e `gestao_impl_reunioes`
 * (implementação, P&D e indicado). Em arquivo próprio para a aba Suporte e o detalhe importarem sem ciclo.
 * Apagar = `apagar()` (marca `deleted_at`).
 */

import { useState } from "react";
import { ModalConfirmar } from "./acoes-atendimento";
import { apagar, atualizar, inserir, mensagemDeErro } from "./dados";
import { dataBR, type ImplReuniao, type PropsAba, type Reuniao, type ToastApi } from "./tipos";
import { BotaoAcao, Campo, Modal } from "./ui-gestao";

export type TabelaReuniao = "gestao_reunioes" | "gestao_impl_reunioes";

export function LinhaAcoesReuniao({
  reuniao,
  nomeCliente,
  t,
  recarregar,
  tabela = "gestao_reunioes",
  pessoas = [],
  tipos = [],
  tipoPadrao = "",
  onEditar,
}: {
  reuniao: Reuniao | ImplReuniao;
  nomeCliente: string;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  tabela?: TabelaReuniao;
  /** Quem pode ser responsável (Remarcar, :4198-4199). */
  pessoas?: string[];
  /** Tipos de reunião desta coleção (Remarcar, :4200-4201). */
  tipos?: readonly string[];
  tipoPadrao?: string;
  /** ✎ Editar reunião: quem chama abre o `ModalReuniao` em modo edição. */
  onEditar?: () => void;
}) {
  const chave = tabela === "gestao_reunioes" ? "reunioes" : "implReunioes";
  const [concluirAberto, setConcluirAberto] = useState(false);
  const [resumoReu, setResumoReu] = useState(reuniao.resumo ?? "");
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [remarcarAberto, setRemarcarAberto] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState(reuniao.hora ?? "");
  const [novoResp, setNovoResp] = useState(reuniao.responsavel ?? "");
  const [novoTipo, setNovoTipo] = useState(reuniao.tipo || tipoPadrao);
  const [motivoRemarcacao, setMotivoRemarcacao] = useState("");
  const [excluirAberto, setExcluirAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const listaPessoas =
    reuniao.responsavel && !pessoas.includes(reuniao.responsavel) ? [...pessoas, reuniao.responsavel] : pessoas;
  const listaTipos = reuniao.tipo && !tipos.includes(reuniao.tipo) ? [...tipos, reuniao.tipo] : [...tipos];

  async function confirmarConclusao() {
    if (!resumoReu.trim()) {
      t.error("Escreva como foi a reunião antes de concluir.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar(tabela, reuniao.id, { status: "Concluída", resumo: resumoReu.trim() });
      t.success("Reunião concluída.");
      setConcluirAberto(false);
      await recarregar([chave]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui concluir a reunião."));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarCancelamento() {
    if (!motivoCancelamento.trim()) {
      t.error("Informe o motivo do cancelamento.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar(tabela, reuniao.id, { status: "Cancelada", motivo: motivoCancelamento.trim() });
      t.success("Reunião cancelada.");
      setCancelarAberto(false);
      await recarregar([chave]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui cancelar a reunião."));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemarcacao() {
    if (!novaData) {
      t.error("Escolha a nova data.");
      return;
    }
    if (!motivoRemarcacao.trim()) {
      t.error("Informe o motivo da remarcação.");
      return;
    }
    setSalvando(true);
    try {
      // Artefato :4211-4217: cria a nova (mesmo cliente e vínculo) e marca a original como remarcada.
      const nova: Record<string, unknown> = {
        cliente_id: reuniao.cliente_id,
        data: novaData,
        hora: novaHora || null,
        responsavel: novoResp || null,
        tipo: novoTipo || null,
        status: "Agendada",
        resumo: null,
        motivo: null,
        remarcada_para: null,
        origem_id: reuniao.id,
      };
      if (tabela === "gestao_reunioes") nova.atend_id = (reuniao as Reuniao).atend_id ?? null;
      else {
        nova.impl_id = (reuniao as ImplReuniao).impl_id ?? null;
        nova.area = (reuniao as ImplReuniao).area || "impl";
      }
      await inserir(tabela, nova);
      await atualizar(tabela, reuniao.id, {
        status: "Remarcada",
        motivo: motivoRemarcacao.trim(),
        remarcada_para: novaData,
      });
      t.success("Reunião remarcada.");
      setRemarcarAberto(false);
      await recarregar([chave]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui remarcar a reunião."));
    } finally {
      setSalvando(false);
    }
  }

  async function reabrir() {
    setSalvando(true);
    try {
      await atualizar(tabela, reuniao.id, { status: "Agendada", motivo: null });
      t.success("Reunião reagendada.");
      await recarregar([chave]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui reagendar a reunião."));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    try {
      await apagar(tabela, reuniao.id, "Não consegui excluir a reunião.");
      t.success("Reunião excluída.");
      await recarregar([chave]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui excluir a reunião."));
    }
  }

  return (
    <>
      <div className="row gap-2" style={{ flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
        {reuniao.status === "Agendada" && (
          <>
            <BotaoAcao
              desabilitado={salvando}
              onClick={() => {
                setResumoReu(reuniao.resumo ?? "");
                setConcluirAberto(true);
              }}
            >
              Concluir
            </BotaoAcao>
            <BotaoAcao
              desabilitado={salvando}
              onClick={() => {
                setNovaData("");
                setNovaHora(reuniao.hora ?? "");
                setNovoResp(reuniao.responsavel ?? "");
                setNovoTipo(reuniao.tipo || tipoPadrao);
                setMotivoRemarcacao("");
                setRemarcarAberto(true);
              }}
            >
              Remarcar
            </BotaoAcao>
            <BotaoAcao
              desabilitado={salvando}
              onClick={() => {
                setMotivoCancelamento("");
                setCancelarAberto(true);
              }}
            >
              Cancelar
            </BotaoAcao>
          </>
        )}
        {reuniao.status === "Concluída" && (
          <BotaoAcao
            desabilitado={salvando}
            onClick={() => {
              setResumoReu(reuniao.resumo ?? "");
              setConcluirAberto(true);
            }}
          >
            Editar relato
          </BotaoAcao>
        )}
        {reuniao.status === "Cancelada" && (
          <BotaoAcao desabilitado={salvando} onClick={() => void reabrir()}>
            Reagendar
          </BotaoAcao>
        )}
        {onEditar && (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Editar reunião"
            title="Editar reunião"
            onClick={onEditar}
          >
            ✎
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Excluir reunião"
          title="Excluir reunião"
          onClick={() => setExcluirAberto(true)}
        >
          ✕
        </button>
      </div>

      {excluirAberto && (
        <ModalConfirmar
          titulo="Excluir reunião"
          texto={`Excluir a reunião com ${nomeCliente} de ${dataBR(reuniao.data)}?`}
          rotulo="Excluir"
          perigo
          onConfirmar={excluir}
          onClose={() => setExcluirAberto(false)}
        />
      )}

      {concluirAberto && (
        <Modal
          titulo="Relato da reunião"
          onClose={() => setConcluirAberto(false)}
          rodape={
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConcluirAberto(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={salvando}
                onClick={() => void confirmarConclusao()}
              >
                Marcar como concluída
              </button>
            </>
          }
        >
          <p className="muted small">
            {nomeCliente} · {dataBR(reuniao.data)} {reuniao.hora || ""}
          </p>
          <Campo rotulo="Como foi a reunião · o que foi abordado">
            <textarea
              className="input"
              rows={4}
              value={resumoReu}
              onChange={(e) => setResumoReu(e.target.value)}
              placeholder="Ex.: revisamos a configuração dos funis, cliente pediu ajuste no atendimento noturno. Próximo passo: enviar o passo a passo até sexta."
            />
          </Campo>
        </Modal>
      )}

      {cancelarAberto && (
        <Modal
          titulo="Cancelar reunião"
          onClose={() => setCancelarAberto(false)}
          rodape={
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelarAberto(false)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={salvando}
                onClick={() => void confirmarCancelamento()}
              >
                Cancelar reunião
              </button>
            </>
          }
        >
          <p className="muted small">
            {nomeCliente} · {dataBR(reuniao.data)} {reuniao.hora || ""}
          </p>
          <Campo rotulo="Motivo do cancelamento">
            <textarea
              className="input"
              rows={4}
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Ex.: cliente avisou que não poderia participar."
            />
          </Campo>
        </Modal>
      )}

      {remarcarAberto && (
        <Modal
          titulo="Remarcar reunião"
          onClose={() => setRemarcarAberto(false)}
          rodape={
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemarcarAberto(false)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={salvando}
                onClick={() => void confirmarRemarcacao()}
              >
                Remarcar
              </button>
            </>
          }
        >
          <p className="muted small">
            {nomeCliente} · hoje marcada para {dataBR(reuniao.data)} {reuniao.hora || ""}. A reunião original fica
            registrada como remarcada e uma nova é criada na data escolhida.
          </p>
          <div className="row gap-3" style={{ flexWrap: "wrap" }}>
            <Campo rotulo="Nova data">
              <input type="date" className="input" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            </Campo>
            <Campo rotulo="Novo horário">
              <input type="time" className="input" value={novaHora} onChange={(e) => setNovaHora(e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Responsável">
            <select className="input" value={novoResp} onChange={(e) => setNovoResp(e.target.value)}>
              <option value="">— escolher —</option>
              {listaPessoas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>
          {listaTipos.length > 0 && (
            <Campo rotulo="Tipo">
              <select className="input" value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}>
                {listaTipos.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Motivo da remarcação">
            <textarea
              className="input"
              rows={4}
              value={motivoRemarcacao}
              onChange={(e) => setMotivoRemarcacao(e.target.value)}
              placeholder="Ex.: conflito de agenda do cliente, pediu para passar para a semana seguinte."
            />
          </Campo>
        </Modal>
      )}
    </>
  );
}
