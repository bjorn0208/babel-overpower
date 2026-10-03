/**
 * Teste realizado, enviar ao suporte — artefato `modalFinalizarImpl` :2646-2688 e `novoAtendSuporte` :1992-2001.
 *
 * Defeito corrigido em 2026-09-24 (plano B1): o app só chamava `gestao_atribuir_suporte`, que exige a
 * implementação JÁ concluída e com o responsável de suporte gravado — então falhava sempre, e nenhum
 * cliente chegava ao Suporte. Agora segue a ordem do artefato:
 *   1. grava a conclusão na implementação (status, datas, call de validação, resultado, suporte);
 *   2. cria o atendimento de suporte (`id_origem = "sa-" + id da implementação`, como o id do artefato,
 *      o que também impede atendimento duplicado);
 *   3. se há equipe de suporte, grava o rodízio e o suporte do cliente pela função estreita.
 * Sem equipe cadastrada, conclui sem responsável, como o artefato.
 */
import { useState } from "react";
import { atribuirSuporte, atualizar, mensagemDeErro } from "./dados";
import { garantirAtendimento } from "./suporte-atendimento";
import { dataDeBR, horaValida, mascararData, mascararHora } from "./calculos";
import { hojeLocal, type ImplReuniao, type Implementacao, type PropsAba, type SuporteAtend, type ToastApi } from "./tipos";
import { Campo, Faixa, Modal } from "./ui-gestao";

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const hojeBR = (): string => {
  const d = hojeLocal();
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const agoraHM = (): string => {
  const d = new Date();
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
};
const isoParaBR = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

export function ModalFinalizarImpl({
  impl,
  nomeCliente,
  proximo,
  equipe,
  implReunioes,
  suporteAtend,
  t,
  recarregar,
  onClose,
  aoConcluir,
}: {
  impl: Implementacao;
  nomeCliente: string;
  /** Quem recebe pelo rodízio (`proximoSuporte`); null quando não há equipe de suporte. */
  proximo: { indice: number; nome: string } | null;
  equipe: string[];
  implReunioes: ImplReuniao[];
  suporteAtend: SuporteAtend[];
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
  /** Só no sucesso: o artefato volta para a lista (:2680, `S.impSel=null`). */
  aoConcluir?: () => void;
}) {
  // Artefato :2649: a última call concluída desde que entrou em validação preenche data e hora.
  const desde = (impl.validacao_desde ?? "").slice(0, 10);
  const calls = implReunioes
    .filter(
      (r) =>
        r.impl_id === impl.id && r.area !== "prog" && r.status === "Concluída" && !!desde && (r.data ?? "") >= desde,
    )
    .sort((a, b) => `${a.data ?? ""} ${a.hora ?? ""}`.localeCompare(`${b.data ?? ""} ${b.hora ?? ""}`));
  const ultimaCall = calls[calls.length - 1];

  const [data, setData] = useState(ultimaCall?.data ? isoParaBR(ultimaCall.data) : hojeBR());
  const [hora, setHora] = useState(ultimaCall ? (ultimaCall.hora ?? "") : agoraHM());
  const [obs, setObs] = useState(impl.obs_final ?? "");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    // Mesmas checagens do artefato (:2669-2672).
    const dtxt = data.trim();
    const dc = dtxt ? dataDeBR(dtxt) : ymdHoje();
    if (!dc) {
      t.error("A data da call está incompleta. Use o formato dd/mm/aaaa.");
      return;
    }
    const hc = hora.trim();
    if (hc && !horaValida(hc)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      return;
    }
    const alvo = proximo;
    const agora = new Date().toISOString();
    setSalvando(true);
    let etapa = "a conclusão da implementação";
    try {
      await atualizar("gestao_implementacoes", impl.id, {
        status: "concluida",
        concluido_em: agora,
        validado_em: agora,
        call_validacao: dc,
        call_validacao_hora: hc || null,
        obs_final: obs.trim() || null,
        suporte_responsavel: alvo ? alvo.nome : null,
        suporte_auto: !!alvo,
        suporte_removido: false,
      });

      etapa = "o atendimento no Suporte";
      // Artefato `novoAtendSuporte` :1992-2001. Se a linha já existe (inclusive apagada), é reaproveitada
      // (suporte-atendimento.ts); um atendimento vivo desta implementação não é recriado.
      await garantirAtendimento(impl, suporteAtend, {
        nomeCliente,
        responsavel: alvo ? alvo.nome : null,
        enviadoEm: agora,
      });

      if (alvo) {
        etapa = "o rodízio do suporte";
        await atribuirSuporte(impl.id, alvo.nome, alvo.indice);
      }

      t.success(
        `${nomeCliente} concluído` +
          (alvo ? ` e enviado ao suporte com ${alvo.nome}.` : ". Sem time de suporte cadastrado."),
      );
      onClose();
      aoConcluir?.();
    } catch (e) {
      // Falha no meio: dizer exatamente o que ficou gravado.
      const feito =
        etapa === "a conclusão da implementação"
          ? "Nada foi gravado."
          : etapa === "o atendimento no Suporte"
            ? "A implementação ficou concluída, mas o atendimento no Suporte não foi criado. Ele é criado quando alguém abrir ou iniciar o cliente na aba Suporte."
            : "A implementação foi concluída e o atendimento foi criado, mas o rodízio não foi atualizado.";
      t.error(`${mensagemDeErro(e, `Não consegui gravar ${etapa}.`)} ${feito}`);
    } finally {
      setSalvando(false);
      await recarregar(["implementacoes", "suporteAtend", "clientes", "config"]);
    }
  }

  return (
    <Modal
      titulo="Teste realizado, enviar ao suporte"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void confirmar()}>
            {salvando ? "enviando…" : "Teste realizado, enviar ao suporte"}
          </button>
        </>
      }
    >
      <p className="muted small">
        {nomeCliente} vai para o histórico da Implementação e segue automaticamente para o Suporte.
      </p>
      <Faixa tom="ok">
        Ao clicar em <b>Teste realizado, enviar ao suporte</b>, você confirma que testou tudo e que o cliente
        aprovou na call.
      </Faixa>
      <div className="row gap-3" style={{ flexWrap: "wrap" }}>
        <Campo rotulo="Data da call com o cliente">
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
      <Campo rotulo="Vai para o suporte (rodízio automático)">
        {proximo ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 15, padding: "4px 0" }}>{proximo.nome}</div>
            <div className="row gap-1" style={{ flexWrap: "wrap" }}>
              {equipe.map((n) => (
                <span key={n} className={n === proximo.nome ? "badge badge-aurora" : "badge"}>
                  {n}
                </span>
              ))}
            </div>
          </>
        ) : (
          <Faixa tom="aviso">
            Nenhuma pessoa cadastrada no time de suporte. O cliente será concluído sem responsável. Cadastre a
            equipe em Suporte › Equipe.
          </Faixa>
        )}
      </Campo>
      <Campo rotulo="Resultado da validação">
        <textarea
          className="input"
          rows={3}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: fluxos testados com o cliente na call, tudo funcionando."
        />
      </Campo>
    </Modal>
  );
}

function ymdHoje(): string {
  const d = hojeLocal();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}
