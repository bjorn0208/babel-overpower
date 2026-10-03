/**
 * Estágios do disparo — o par de botões que substitui o antigo "🧪 Testar".
 *
 * Antes, "Testar" chamava a edge e ela disparava pra LISTA REAL, só pulando a
 * checagem de horário. Era um blast disfarçado de teste. Agora são dois passos
 * de verdade, e o segundo só existe depois do primeiro:
 *
 *   Estágio 1 · Testar   → manda pro número do dono e só. Carimba `teste_em`.
 *   Estágio 2 · Disparar → manda pra esteira. A edge recusa sem teste válido.
 *
 * Editar a mensagem depois de testar derruba o estágio 2 (`teste_em` fica
 * anterior ao `atualizado_em`): quem mudou o texto tem que conferir de novo.
 *
 * Visual Arena: linha do tempo horizontal em chips roláveis — feita em
 * verde-limão, atual em roxo, futura em chumbo.
 */

import { useState } from "react";
import { Check, ChevronRight, FlaskConical, Send } from "lucide-react";
import { ModalConfirmar } from "./modal-confirmar";
import {
  dispararAgora,
  estagioDoAgendamento,
  testarAgendamentoAgora,
  type AgendamentoDisparo,
} from "../dados-disparos";
import "../abas/aba-disparo.css";

export interface EstagiosDisparoProps {
  agendamento: AgendamentoDisparo;
  /** Pra onde o teste vai — só pra pessoa saber antes de apertar. */
  telefoneTeste: string | null;
  /** Quantos contatos a esteira tem hoje, pro texto da confirmação. */
  totalNaEsteira: number;
  /** Freio de mão ligado: o estágio 2 fica bloqueado. */
  pausado: boolean;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
  aoMudar: () => void;
}

const fmtFone = (f: string | null) => {
  if (!f) return "número não definido";
  const d = f.replace(/\D/g, "");
  if (d.length < 12) return d;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, -4)}-${d.slice(-4)}`;
};

/** Tinta da etapa na linha do tempo. */
const classeEtapa = (estado: "feita" | "atual" | "futura") =>
  estado === "feita"
    ? "ar-chip ard-etapa ard-etapa--feita"
    : estado === "atual"
      ? "ar-chip ard-etapa ar-chip--ativo"
      : "ar-chip ard-etapa ard-etapa--futura";

export const EstagiosDisparo = ({
  agendamento,
  telefoneTeste,
  totalNaEsteira,
  pausado,
  aoNotificar,
  aoMudar,
}: EstagiosDisparoProps) => {
  const [testando, setTestando] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const estagio = estagioDoAgendamento(agendamento);
  const liberado = estagio === "liberado";

  const testar = async () => {
    setTestando(true);
    const r = await testarAgendamentoAgora(agendamento.id);
    setTestando(false);
    if (!r.ok) {
      aoNotificar(`Teste não saiu: ${r.erro}`, "error");
      return;
    }
    if ((r.enviados ?? 0) === 0) {
      // Sem isso o dono via "teste ok" e ficava esperando uma mensagem que
      // nunca chegou — e o estágio 2 continuava trancado sem explicação.
      aoNotificar(
        "O teste não chegou a sair (0 enviados). Confira a mídia do agendamento e o WhatsApp conectado.",
        "error",
      );
      aoMudar();
      return;
    }
    aoNotificar(`Teste enviado pra ${fmtFone(telefoneTeste)}. Confira e libere o disparo.`, "success");
    aoMudar();
  };

  const disparar = async () => {
    setDisparando(true);
    const r = await dispararAgora(agendamento.id);
    setDisparando(false);
    setConfirmando(false);
    if (!r.ok) {
      aoNotificar(`Disparo recusado: ${r.erro}`, "error");
      aoMudar();
      return;
    }
    if (r.pausado) {
      aoNotificar("Disparo parou: os envios estão pausados. Solte o freio pra continuar.", "info");
    } else {
      aoNotificar(
        `Disparo em andamento: ${r.enviados ?? 0} enviados, ${r.falharam ?? 0} falharam.`,
        "success",
      );
    }
    aoMudar();
  };

  const podeDisparar = liberado && !pausado && totalNaEsteira > 0;
  const motivoBloqueio = pausado
    ? "Envios pausados — solte o freio primeiro"
    : !liberado
      ? "Faça o teste antes"
      : totalNaEsteira === 0
        ? "Nenhum contato marcado na esteira"
        : undefined;

  return (
    <>
      <div className="ar-scroll-x items-center">
        <button
          type="button"
          className={classeEtapa(liberado ? "feita" : "atual")}
          disabled={testando}
          onClick={() => void testar()}
        >
          {liberado ? <Check size={15} aria-hidden /> : <FlaskConical size={15} aria-hidden />}
          {testando ? "Testando…" : liberado ? "1 · Testado" : "1 · Testar em mim"}
        </button>

        <span className="ard-etapa-seta" aria-hidden>
          <ChevronRight size={14} />
        </span>

        <button
          type="button"
          className={classeEtapa(podeDisparar ? "atual" : "futura")}
          disabled={!podeDisparar || disparando}
          onClick={() => setConfirmando(true)}
          title={motivoBloqueio}
        >
          <Send size={15} aria-hidden />
          {disparando ? "Disparando…" : "2 · Disparar pra esteira"}
        </button>
      </div>

      <div className="w-full mt-2">
        {estagio === "sem_teste" && (
          <p className="ar-info-box">
            Ainda não testado. O teste vai pro <strong className="ar-num">{fmtFone(telefoneTeste)}</strong>.
          </p>
        )}
        {estagio === "vencido" && (
          <p className="ar-aviso-box">
            A mensagem mudou depois do último teste — teste de novo antes de mandar pra lista.
          </p>
        )}
        {liberado && (
          <p className="ar-ok-box">
            Testado em {new Date(agendamento.teste_em as string).toLocaleString("pt-BR")} no{" "}
            <span className="ar-num">{fmtFone(agendamento.teste_phone)}</span>. Pronto pra disparar.
          </p>
        )}
      </div>

      <ModalConfirmar
        aberto={confirmando}
        titulo="Disparar pra esteira agora?"
        variante="perigo"
        textoConfirmar={`Disparar pra ${totalNaEsteira}`}
        carregando={disparando}
        mensagem={
          <>
            Vai mandar essa mensagem pra <strong>{totalNaEsteira} contato(s)</strong> marcados na
            esteira, um por vez, com {agendamento.descanso_min_segundos}-
            {agendamento.descanso_max_segundos}s entre cada um.
            {totalNaEsteira > 50 && (
              <>
                {" "}
                Nesse ritmo leva no mínimo{" "}
                <strong>
                  {Math.round((totalNaEsteira * agendamento.descanso_min_segundos) / 60)} min
                </strong>
                .
              </>
            )}{" "}
            Dá pra parar no meio pelo botão de pausa.
          </>
        }
        aoConfirmar={() => void disparar()}
        aoCancelar={() => setConfirmando(false)}
      />
    </>
  );
};
