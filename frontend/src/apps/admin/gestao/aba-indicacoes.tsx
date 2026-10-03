/**
 * Aba Indicações — leads que chegaram pela indicação de clientes; funil por status; ranking por cliente.
 * Regras seguidas: só classes de bundle.css + ui-gestao.tsx; dados via dados.ts (grave, confirme, depois recarregar);
 * contas via calculos.ts; nada de cor ou medida nova. Original: financeiro.html:1138-1242 (viewIndicacoes),
 * :1278-1336 (modalIndicacao), :1418-1472 (iniciar, enviar, excluir), :2318-2457 (detalhe, ctx "ind").
 *
 * Decisão do Theus (CLAUDE.md): indicação já vem do formulário público — esta tela é gestão/lista/edição
 * interna. "Indicar" copia o link da página pública e "Importar" lê CSV/TSV/JSON.
 *
 * Lote 6 (2026-09-24, igual ao artefato): sem paginação; sem o "editar" na linha (edita pelo "Editar dados" do
 * detalhe); filtro por quem indicou; coluna "O que busca"; contatos com link; confirmações com texto; KPIs e
 * ranking continuam na tela sem indicação. Modais e ações da indicação ficam em painel-indicacao.tsx.
 */

import { useMemo, useState } from "react";
import { diaDaIndicacao, indicacoesDoMes } from "./calculos";
import { LINK_INDICAR, ModalImportarIndicacoes, ModalLinkPublico } from "./modais-cadastro";
import { DetalheAtendimento } from "./detalhe-atendimento";
import {
  TOM_STATUS_INDICACAO,
  indicacoesPorCliente,
  norm,
  ordenarIndicacoes,
  resolverIndicador,
  rotuloHorario,
  rotuloStatusIndicacao,
} from "./logica-indicacao";
import {
  BotoesIndicacao,
  CabecalhoIndicacao,
  ContatosIndicado,
  PainelAtendimentoIndicacao,
  PainelDadosIndicacao,
  useAcoesIndicacao,
} from "./painel-indicacao";
import {
  STATUS_INDICACAO,
  dataBR,
  dataHoraBR,
  podeEscrever,
  rotuloMes,
  type Cliente,
  type PropsAba,
} from "./tipos";
import { AbaCasca, CabecalhoAba, CartaoTabela, Kpi, LinhaKpis, Segmentado, Selo, Vazio } from "./ui-gestao";

// Reexporta as regras que moraram aqui até o lote 6 (aba-clientes e aba-vendas importam daqui).
export {
  indicacoesPorCliente,
  norm,
  resolverIndicador,
  waLink,
  type IndicadorResolvido,
} from "./logica-indicacao";

export function AbaIndicacoes({ dados, papeis, mes, t, recarregar }: PropsAba) {
  const [linkAberto, setLinkAberto] = useState(false);
  const [importarAberto, setImportarAberto] = useState(false);
  const [status, setStatus] = useState("todos");
  const [indicador, setIndicador] = useState("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const pode = podeEscrever(papeis, "indicacoes");
  const acoes = useAcoesIndicacao({
    dados,
    t,
    recarregar,
    aoAbrir: (id) => setAberto(id),
    aoSair: () => setAberto(null),
  });
  const doMes = indicacoesDoMes(dados.indicacoes, mes).length;

  const resolvidas = useMemo(
    () =>
      dados.indicacoes.map((i) => ({
        i,
        r: resolverIndicador(i, dados.clientes, dados.indicadores),
      })),
    [dados.indicacoes, dados.clientes, dados.indicadores],
  );
  const total = resolvidas.length;
  const fechouQtd = resolvidas.filter((x) => x.i.status === "fechou").length;
  const semIndicador = resolvidas.filter((x) => !x.r.cliente).length;
  const porCliente = useMemo(
    () => indicacoesPorCliente(dados.indicacoes, dados.clientes, dados.indicadores),
    [dados.indicacoes, dados.clientes, dados.indicadores],
  );
  const enviadasQtd = resolvidas.filter((x) => !!x.i.enviado_vendas_em).length;

  const ranking = useMemo(
    () =>
      [...porCliente.entries()]
        .map(([id, lista]) => ({
          cliente: dados.clientes.find((c) => c.id === id),
          n: lista.length,
          f: lista.filter((i) => i.status === "fechou").length,
        }))
        .filter((r): r is { cliente: Cliente; n: number; f: number } => !!r.cliente)
        .sort((a, b) => b.n - a.n || a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR")),
    [porCliente, dados.clientes],
  );

  const clientesOrdenados = useMemo(
    () => [...dados.clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.clientes],
  );

  const q = norm(busca);
  const lista = useMemo(
    () =>
      resolvidas
        .filter(({ i }) => {
          if (status === "enviadas") return !!i.enviado_vendas_em;
          if (i.enviado_vendas_em) return false;
          if (status !== "todos" && (i.status || "novo") !== status) return false;
          return true;
        })
        .filter(({ r }) => {
          // filtro "quem indicou" (:1181-1183)
          if (indicador === "sem") return !r.cliente;
          if (indicador !== "todos") return r.cliente?.id === indicador;
          return true;
        })
        .filter(({ i, r }) => {
          if (!q) return true;
          const alvo = norm(
            [i.lead_nome, i.empresa, i.lead_email, i.lead_whatsapp, i.nicho, i.referrer_name, r.cliente?.nome]
              .filter(Boolean)
              .join(" "),
          );
          return alvo.includes(q);
        })
        .sort((a, b) => ordenarIndicacoes(a.i, b.i)),
    [resolvidas, status, indicador, q],
  );

  const filtros: Array<[string, string]> = [
    ["todos", "Em aberto"],
    ...STATUS_INDICACAO,
    ["enviadas", `Histórico · enviadas p/ Vendas (${enviadasQtd})`],
  ];

  // ---- detalhe da indicação ("Abrir") -------------------------------------------------------------
  const registroAberto = aberto ? dados.indicacoes.find((i) => i.id === aberto) : null;
  if (aberto && registroAberto) {
    const voltar = () => setAberto(null);
    return (
      <AbaCasca>
        <CabecalhoIndicacao indicacao={registroAberto} acoes={acoes} pode={pode} onVoltar={voltar} />
        <PainelDadosIndicacao indicacao={registroAberto} dados={dados} pode={pode} acoes={acoes} />
        <PainelAtendimentoIndicacao
          key={`${registroAberto.id}|${registroAberto.inicio ?? ""}|${registroAberto.inicio_hora ?? ""}`}
          indicacao={registroAberto}
          dados={dados}
          pode={pode}
          t={t}
          recarregar={recarregar}
        />
        {/* Tentativas, reuniões com o indicado e andamento de 15 dias: detalhe comum (outro agente). */}
        <DetalheAtendimento
          ctx="ind"
          registro={registroAberto}
          dados={dados}
          papeis={papeis}
          t={t}
          recarregar={recarregar}
          onVoltar={voltar}
        />
        {pode && !registroAberto.enviado_vendas_em && (
          <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            <BotoesIndicacao indicacao={registroAberto} acoes={acoes} rodape />
          </div>
        )}
        {acoes.elemento}
      </AbaCasca>
    );
  }

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Indicações"
        subtitulo={`Leads que chegaram pela indicação de clientes · ${rotuloMes(mes)}: ${doMes} ${doMes === 1 ? "nova" : "novas"}.`}
        acoes={
          pode && (
            <>
              {LINK_INDICAR && (
                <button type="button" className="btn" onClick={() => setLinkAberto(true)}>
                  Indicar
                </button>
              )}
              <button type="button" className="btn" onClick={() => setImportarAberto(true)}>
                Importar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => acoes.nova()}>
                + Nova indicação
              </button>
            </>
          )
        }
      />

      <LinhaKpis>
        <Kpi destaque rotulo="Indicações no mês" valor={String(doMes)} sub={`de ${total} no total`} />
        <Kpi
          rotulo="Viraram clientes"
          valor={String(fechouQtd)}
          sub={total ? `${Math.round((fechouQtd / total) * 100)}% de conversão` : "sem indicações ainda"}
        />
        <Kpi
          rotulo="Clientes que indicaram"
          valor={String(porCliente.size)}
          sub={`de ${dados.clientes.length} clientes`}
        />
        <Kpi
          rotulo="Sem indicador identificado"
          valor={String(semIndicador)}
          sub={semIndicador ? "vincule manualmente" : "tudo vinculado"}
        />
      </LinhaKpis>

      <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="h3">Indicações por cliente</div>
        <div className="muted small" style={{ marginBottom: 8 }}>
          Quem mais indicou. Para vincular uma indicação a um cliente, abra a indicação e escolha quem indicou.
        </div>
        {ranking.length === 0 ? (
          <div className="muted small">Nenhum cliente com indicação vinculada ainda.</div>
        ) : (
          <CartaoTabela>
            <thead>
              <tr>
                <th>Cliente</th>
                <th style={{ textAlign: "right" }}>Indicações</th>
                <th style={{ textAlign: "right" }}>Fecharam</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.cliente.id}>
                  <td>
                    <div>{r.cliente.nome}</div>
                    <div className="muted tiny">{r.cliente.situacao || "Vigente"}</div>
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {r.n}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {r.f}
                  </td>
                </tr>
              ))}
            </tbody>
          </CartaoTabela>
        )}
      </div>

      <div
        className="os-card row gap-3"
        style={{ padding: "14px 16px", marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}
      >
        <Segmentado opcoes={filtros} valor={status} onChange={setStatus} />
        <div className="row gap-2" style={{ marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            className="input"
            style={{ width: 220 }}
            value={indicador}
            onChange={(e) => setIndicador(e.target.value)}
            aria-label="Filtrar por quem indicou"
          >
            <option value="todos">Todos os indicadores</option>
            <option value="sem">Sem indicador identificado</option>
            {clientesOrdenados.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="Buscar indicado, empresa, nicho"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar indicação"
          />
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio
          icone="users"
          titulo={
            status === "enviadas"
              ? "Nenhuma indicação enviada para Vendas ainda"
              : total
                ? "Nenhuma indicação com esses filtros"
                : "Nenhuma indicação ainda"
          }
          mensagem={
            total
              ? "Ajuste os filtros ou a busca."
              : "Envie os links para os clientes, importe as respostas da página ou cadastre manualmente."
          }
        />
      ) : (
        <CartaoTabela>
          <thead>
            <tr>
              <th>Chegou em</th>
              <th>Indicado</th>
              <th>Empresa · nicho</th>
              <th>O que busca</th>
              <th>Quem indicou</th>
              <th>Atendimento</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map(({ i, r }) => {
              const st = i.status || "novo";
              const tentativas = (i.tentativas ?? []).length;
              return (
                <tr key={i.id}>
                  <td className="mono small">{dataBR(diaDaIndicacao(i))}</td>
                  <td>
                    <div>{i.lead_nome || "—"}</div>
                    <div className="tiny">
                      <ContatosIndicado whatsapp={i.lead_whatsapp} email={i.lead_email} />
                    </div>
                  </td>
                  <td>
                    <div className="small">{i.empresa || "—"}</div>
                    <div className="muted tiny">{i.nicho || ""}</div>
                  </td>
                  <td className="small" style={{ maxWidth: 220 }}>
                    {i.necessidade || "—"}
                  </td>
                  <td>
                    {r.cliente ? (
                      <>
                        <div className="small">{r.cliente.nome}</div>
                        <div className="muted tiny">
                          {r.via === "link"
                            ? `pelo link ${i.referrer_code || ""}`
                            : r.via === "manual"
                              ? "vinculado manualmente"
                              : "pelo nome informado"}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="small">{i.referrer_name || "—"}</div>
                        <div className="tiny" style={{ color: "var(--os-aviso)" }}>
                          não identificado
                        </div>
                      </>
                    )}
                  </td>
                  <td className="small">
                    {i.enviado_vendas_em ? (
                      <>
                        <div className="muted tiny">Enviada p/ Vendas</div>
                        <div className="mono tiny">{dataHoraBR(i.enviado_vendas_em)}</div>
                      </>
                    ) : i.iniciado_em ? (
                      <>
                        <div>{i.responsavel || "—"}</div>
                        <div className="muted tiny">desde {dataHoraBR(i.iniciado_em)}</div>
                        {tentativas > 0 && (
                          <div className="muted tiny">{tentativas} tentativa(s) sem sucesso</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="muted tiny">não iniciado</div>
                        <div className="muted tiny">
                          prefere {rotuloHorario(i.melhor_horario) || "—"}
                          {i.data_preferida ? ` · ${dataBR(i.data_preferida)}` : ""}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    {i.enviado_vendas_em ? (
                      <Selo tom="ok">Enviada para Vendas</Selo>
                    ) : pode ? (
                      <select
                        className="input"
                        style={{ width: 150 }}
                        value={st}
                        onChange={(e) => void acoes.mudarStatus(i, e.target.value)}
                        aria-label="Status"
                      >
                        {STATUS_INDICACAO.map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Selo tom={TOM_STATUS_INDICACAO[st] ?? "neutro"}>{rotuloStatusIndicacao(st)}</Selo>
                    )}
                  </td>
                  <td>
                    <div
                      className="row gap-1"
                      style={{ flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 260, marginLeft: "auto" }}
                    >
                      {pode && !i.enviado_vendas_em && !i.iniciado_em && (
                        <button type="button" className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => acoes.iniciar(i)}>
                          Iniciar atendimento
                        </button>
                      )}
                      <button type="button" className="btn btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => setAberto(i.id)}>
                        Abrir
                      </button>
                      {pode && !i.enviado_vendas_em && (
                        <button type="button" className="btn btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => acoes.enviarParaVendas(i)}>
                          Enviar p/ Vendas
                        </button>
                      )}
                      {pode && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ color: "var(--os-erro)" }}
                          onClick={() => acoes.excluir(i)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </CartaoTabela>
      )}

      {importarAberto && (
        <ModalImportarIndicacoes
          existentes={dados.indicacoes}
          temIndicador={(o) =>
            !!resolverIndicador(
              { indicador_id: null, referrer_code: o.referrerCode ?? null, referrer_name: o.referrerName ?? null },
              dados.clientes,
              dados.indicadores,
            ).cliente
          }
          t={t}
          recarregar={recarregar}
          onClose={() => setImportarAberto(false)}
        />
      )}

      {linkAberto && (
        <ModalLinkPublico
          titulo="Indicar a babel"
          texto="Compartilhe este link com quem quiser indicar a babel para alguém. Quem abrir vê a página de indicação e deixa nome, WhatsApp e segmento."
          rotulo="Link da página de indicação"
          link={LINK_INDICAR}
          msgCopia="Link de indicação copiado."
          t={t}
          onClose={() => setLinkAberto(false)}
        />
      )}
      {acoes.elemento}
    </AbaCasca>
  );
}
