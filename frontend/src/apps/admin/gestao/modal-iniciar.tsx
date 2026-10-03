/**
 * Iniciar atendimento — artefato `modalIniciarImpl` :2884.
 *
 * Defeito encontrado pelo Theus em 2026-09-22: o app iniciava o atendimento **num clique só**, sem
 * perguntar nada e sem definir responsável. No artefato o botão abre esta tela, que pede quem é o
 * responsável, a data e o horário de início — e só então grava. Serve às duas filas, como no artefato
 * (`colDe`): implementação (`gestao_implementacoes`) e suporte (`gestao_suporte_atend`).
 */

import { useState } from "react";
import { atualizar, mensagemDeErro } from "./dados";
import { dataDeBR, horaValida, mascararData, mascararHora } from "./calculos";
import { hojeLocal, ymd, type PropsAba, type ToastApi } from "./tipos";
import { DIAS_ATENDIMENTO, dataHoraAs } from "./logica-atendimento";
import { Campo, Modal } from "./ui-gestao";

/** Qual fila está sendo iniciada: muda a tabela, a frase e de onde vêm os nomes. */
export type FilaAtendimento = "implementacao" | "suporte";

const hojeBR = (): string => {
  const d = hojeLocal();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const agoraHM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function ModalIniciarAtendimento({
  fila,
  id,
  nomeCliente,
  enviadoEm,
  responsavelAtual,
  pessoas,
  t,
  recarregar,
  onClose,
  aoIniciar,
}: {
  fila: FilaAtendimento;
  id: string;
  nomeCliente: string;
  enviadoEm: string | null;
  responsavelAtual: string | null;
  /** Quem pode ser responsável: funcionários da implementação, ou a equipe de suporte. */
  pessoas: string[];
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
  /** Depois de gravar: o artefato abre o detalhe do atendimento (:2908). */
  aoIniciar?: () => void;
}) {
  const lista = responsavelAtual && !pessoas.includes(responsavelAtual) ? [...pessoas, responsavelAtual] : pessoas;
  const [responsavel, setResponsavel] = useState(responsavelAtual ?? "");
  const [data, setData] = useState(hojeBR());
  const [hora, setHora] = useState(agoraHM());
  const [salvando, setSalvando] = useState(false);

  const tabela = fila === "suporte" ? "gestao_suporte_atend" : "gestao_implementacoes";
  const chave = fila === "suporte" ? "suporteAtend" : "implementacoes";

  async function confirmar() {
    // As três checagens do artefato (:2900-2903), na mesma ordem.
    if (!responsavel) {
      t.error(
        lista.length > 0
          ? "Escolha o responsável."
          : fila === "suporte"
            ? "Cadastre a equipe de suporte antes de iniciar."
            : "Cadastre um funcionário antes de iniciar.",
      );
      return;
    }
    const iso = dataDeBR(data);
    if (!iso) {
      t.error("Informe a data de início no formato dd/mm/aaaa.");
      return;
    }
    const h = hora.trim();
    if (h && !horaValida(h)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar(tabela, id, {
        status: "andamento",
        responsavel,
        inicio: iso,
        inicio_hora: h || null,
        // iniciado_em só existe em gestao_implementacoes. Mandar em gestao_suporte_atend fazia o banco recusar a
        // gravação: "Iniciar atendimento" no Suporte falhava sempre (achado do André, 2026-09-25; conferido no esquema).
        ...(fila === "suporte" ? {} : { iniciado_em: new Date().toISOString() }),
      });
      t.success(`${nomeCliente}: atendimento iniciado.`);
      onClose();
      await recarregar([chave]);
      aoIniciar?.();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui iniciar o atendimento."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Iniciar atendimento"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void confirmar()}>
            Iniciar atendimento
          </button>
        </>
      }
    >
      <p className="muted small">
        {nomeCliente} · enviado em {dataHoraAs(enviadoEm)}. Ao iniciar,{" "}
        {fila === "suporte" ? "o atendimento de suporte" : "a implementação"} passa para “Em andamento” e o
        acompanhamento de {DIAS_ATENDIMENTO} dias é liberado.
      </p>

      <Campo rotulo="Responsável pelo atendimento">
        <select className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
          <option value="">— escolher —</option>
          {lista.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {lista.length === 0 && (
          <span className="muted small">
            {fila === "suporte"
              ? "Ninguém na equipe de suporte ainda — cadastre em Suporte › Equipe."
              : "Nenhum funcionário cadastrado — cadastre em Implementação › + Novo funcionário."}
          </span>
        )}
      </Campo>

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
    </Modal>
  );
}

/** Data de hoje em ISO, para quem precisa do padrão sem passar pela máscara. */
export const hojeISO = (): string => ymd(hojeLocal());
