/**
 * Aba Mensalidades — grade de competências por cliente; clique marca/desmarca como recebida.
 * SEM limite de 12 meses (decisão 1: `calculos.competencias` já gera sem corte; cancelar mantém o pago,
 * decisão 2). Original: financeiro.html:898-929 (viewMensalidades), :3231-3237 (toggleMens) + patch 01/02 de
 * `plano-integracao/PATCHES-LOGICA-APP`.
 *
 * Como o cliente não para em 12 competências, a GRADE é por MÊS DE CALENDÁRIO (12 colunas ao redor do mês do
 * topo), não por número de competência (que cresceria sem fim). Cada célula mostra o número da competência e o
 * valor (no artefato: a coluna é o número e a célula tem o mês; aqui a coluna é o mês e a célula tem o número).
 *
 * Lote 6 (2026-09-24, igual ao artefato):
 *  - os totais do cabeçalho e a coluna "Recebido" somam TODAS as competências (:903-904, :926), não só as 12
 *    colunas visíveis: o total não muda mais com o mês escolhido;
 *  - marcar grava o valor previsto como recebido (:3236, `valorRecebido = previsto`): se a mensalidade do
 *    cliente mudar depois, o que já foi pago não muda junto;
 *  - sem o "editar" por célula (o artefato só marca e desmarca pelo clique; o lápis citado no texto dele não
 *    existe). Desfazer mantém a linha com `pago_em` vazio (o gatilho do banco guarda a versão paga no histórico).
 * Mantido por decisão do Theus: Histórico de pagamentos.
 */

import { useMemo } from "react";
import { ROTULO_STATUS, SELO_STATUS, competencias, statusVenc, type Competencia } from "./calculos";
import { definirMensalidade, mensagemDeErro } from "./dados";
import { HistoricoPagamentos } from "./historico-pagamentos";
import {
  addMeses,
  dataBR,
  formatBRL,
  formatBRLInteiro,
  hojeLocal,
  inicioDoMes,
  mesCurto,
  mesLongo,
  mesParaData,
  podeEscrever,
  ym,
  ymd,
  type PropsAba,
} from "./tipos";
import { AbaCasca, CabecalhoAba, CartaoTabela, Vazio } from "./ui-gestao";

/** As 12 colunas de calendário ao redor de `mes` (5 antes, o mês, 6 depois — mesma janela do Painel). */
function janela12Meses(mes: string): Date[] {
  const ini = inicioDoMes(mesParaData(mes));
  return Array.from({ length: 12 }, (_, i) => addMeses(ini, i - 5));
}

export function AbaMensalidades({ dados, mes, papeis, t, recarregar }: PropsAba) {
  const hoje = useMemo(() => hojeLocal(), []);
  const pode = podeEscrever(papeis, "mensalidades");
  const meses = useMemo(() => janela12Meses(mes), [mes]);
  const comp = useMemo(
    () => competencias(dados.clientes, dados.mensalidades, mes, hoje),
    [dados.clientes, dados.mensalidades, mes, hoje],
  );

  // Totais de TODAS as competências (:903-904) e, por cliente, o recebido de todas (:926).
  const { linhas, rec, prev } = useMemo(() => {
    const porCliente = new Map<string, Competencia[]>();
    let somaRec = 0;
    let somaPrev = 0;
    for (const c of comp) {
      if (!porCliente.has(c.clienteId)) porCliente.set(c.clienteId, []);
      porCliente.get(c.clienteId)!.push(c);
      if (c.pago) somaRec += c.recebido;
      else somaPrev += c.previsto;
    }
    const ids = [...porCliente.keys()].sort((a, b) =>
      porCliente.get(a)![0].cliente.localeCompare(porCliente.get(b)![0].cliente, "pt-BR"),
    );
    const linhasCalc = ids.map((id) => {
      const lista = porCliente.get(id)!;
      const celulas = meses.map((m) => lista.find((c) => ym(c.venc) === ym(m)) ?? null);
      const total = lista.reduce((s, c) => s + c.recebido, 0);
      return { id, nome: lista[0].cliente, celulas, total };
    });
    return { linhas: linhasCalc, rec: somaRec, prev: somaPrev };
  }, [comp, meses]);

  /** toggleMens (:3231-3237): marca na data de vencimento com o valor previsto; clicar de novo desfaz. */
  const alternar = async (c: Competencia) => {
    try {
      if (c.pago) {
        await definirMensalidade(c.clienteId, c.n, null, null);
        t.success("Pagamento desfeito.");
      } else {
        await definirMensalidade(c.clienteId, c.n, ymd(c.venc), c.previsto);
        t.success("Mensalidade marcada como recebida.");
      }
      await recarregar(["mensalidades"]);
    } catch (e) {
      t.error(mensagemDeErro(e, c.pago ? "Não consegui desfazer o pagamento." : "Não consegui marcar a mensalidade."));
    }
  };

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Mensalidades"
        subtitulo={`Competências por cliente, 12 meses ao redor de ${mesLongo(mesParaData(mes))} · ${formatBRL(rec)} recebidos · ${formatBRL(prev)} a receber`}
        acoes={<HistoricoPagamentos tamanho="md" tabela="gestao_mensalidades" />}
      />

      {linhas.length === 0 ? (
        <Vazio
          icone="calendar"
          titulo="Nenhuma mensalidade programada"
          mensagem="Preencha Valor da mensalidade e Início da cobrança no cadastro do cliente para gerar as competências."
        />
      ) : (
        <>
          <div className="os-card" style={{ padding: "14px 16px", marginBottom: 16 }}>
            <span className="muted small">
              Clique numa competência para marcar como recebida na data de vencimento; clique de novo para
              desfazer.
            </span>
          </div>

          <CartaoTabela>
            <thead>
              <tr>
                <th>Cliente</th>
                {meses.map((m) => (
                  <th key={ym(m)} style={{ textAlign: "center" }}>
                    {mesCurto(m)}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>Recebido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ id, nome, celulas, total }) => (
                <tr key={id}>
                  <td style={{ minWidth: 170 }}>{nome}</td>
                  {celulas.map((c, i) => {
                    if (!c) {
                      return (
                        <td key={i} style={{ textAlign: "center" }}>
                          <span className="muted tiny">—</span>
                        </td>
                      );
                    }
                    const st = statusVenc(c.venc, c.pago ? true : null, hoje);
                    return (
                      <td key={i} style={{ textAlign: "center", padding: 4 }}>
                        <button
                          type="button"
                          className={SELO_STATUS[st]}
                          style={{
                            width: "100%",
                            cursor: pode ? "pointer" : "default",
                            flexDirection: "column",
                            gap: 0,
                            lineHeight: 1.3,
                            borderRadius: 10, // o mesmo raio dos campos (tipos.ts inputStyle)
                          }}
                          disabled={!pode}
                          onClick={() => pode && void alternar(c)}
                          title={`${nome} · competência ${c.n} · vence ${dataBR(ymd(c.venc))} · ${ROTULO_STATUS[st]}`}
                        >
                          <span className="tiny" style={{ opacity: 0.75 }}>
                            nº {c.n}
                          </span>
                          <span>{formatBRLInteiro(c.pago ? c.recebido : c.previsto)}</span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {formatBRLInteiro(total)}
                  </td>
                  <td>
                    <HistoricoPagamentos tabela="gestao_mensalidades" clienteId={id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </CartaoTabela>
        </>
      )}
    </AbaCasca>
  );
}
