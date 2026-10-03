/**
 * Aba Suporte — artefato `viewSuporte` :993-1065 (reuniões) e `painelSuporteRecebidos` :2714-2775 (clientes
 * recebidos da implementação), com o detalhe compartilhado (detalhe-atendimento.tsx).
 *
 * Recebidos: como no artefato, a lista sai das implementações CONCLUÍDAS que não foram excluídas do suporte
 * (`suporte_removido`), com o atendimento de cada uma quando ele já existe. Sem atendimento, a linha aparece como
 * "Aguardando início" e o atendimento é criado ao abrir ou iniciar (`garantirAtend` :2002-2005). Colunas
 * Andamento ("Dia X de 15") e Próxima reunião, "(rodízio)" no responsável, pílulas "Nome · N" do rodízio.
 * Proteção do app (fora do artefato): atendimento sem implementação conhecida também aparece, para não sumir.
 *
 * Reuniões: cartão com dia da semana, "remarcada de", "Nova data", ✎ Editar e ✕ Excluir (com confirmação).
 *
 * Mantido do app (INVENTADO, à espera da decisão do Theus — PLANO seção 5): "Concluir atendimento" também na lista.
 */

import { useState } from "react";
import { usePessoasSuporte } from "./pessoas-suporte";
import { useAcoesAtendimento } from "./acoes-atendimento";
import { BarraAndamento } from "./barra-andamento";
import { equipeSuporte, ordenarReunioes, proximoSuporte, resumoReunioes } from "./calculos";
import { mensagemDeErro } from "./dados";
import {
  andamentoLista,
  clientesPorPessoa,
  dataHoraAs,
  diaSemana,
  diarioDoContexto,
  diasPreenchidos,
  filtrarLinhasSuporte,
  linhasSuporte,
  proximaReuniaoSup,
  statusSupDe,
  tomReuniao,
  type LinhaSuporte,
} from "./dados-atendimento";
import { DetalheAtendimento } from "./detalhe-atendimento";
import { garantirAtendimento } from "./suporte-atendimento";
import { LinhaAcoesReuniao } from "./linha-acoes-reuniao";
import { ModalEquipe } from "./modais-cadastro";
import { ModalReuniao, pessoasDaArea } from "./modais-reuniao";
import { useMinhaPessoa } from "./minha-pessoa";
import { VistaChamados } from "./chamados-lista";
import { ModalNovoChamado } from "./modal-novo-chamado";
import { DetalheChamado } from "./detalhe-chamado";
import { ChamadosDoCliente } from "./chamados-do-cliente";
import { consumirAbertura } from "./navegacao-gestao";
import {
  STATUS_REUNIAO,
  TIPOS_REUNIAO,
  dataBR,
  hojeLocal,
  podeEscrever,
  rotuloMes,
  ymd,
  type PropsAba,
  type Reuniao,
  type SuporteAtend,
} from "./tipos";
import { AbaCasca, BotaoAcao, CabecalhoAba, Faixa, Ponto, Segmentado, Selo, Vazio } from "./ui-gestao";

const QUANDO: Array<[string, string]> = [
  ["proximas", "Próximas"],
  ["mes", "Mês selecionado"],
  ["todas", "Todas"],
];
const STATUS: Array<[string, string]> = [
  ["todos", "Todos os status"],
  ...STATUS_REUNIAO.map((s): [string, string] => [s, s]),
];
const SUP_STATUS: Array<[string, string]> = [
  ["ativos", "Em aberto"],
  ["aguardando", "Aguardando início"],
  ["andamento", "Em andamento"],
  ["concluida", "Concluídos"],
  ["todos", "Todos"],
];

export function AbaSuporte({ dados, papeis, mes, t, recarregar, meuNome, uid }: PropsAba) {
  // responsável do chamado e rodízio: app Equipe + quem tem Suporte em Acessos (revisão final I3)
  const pessoasSup = usePessoasSuporte(dados.config);
  const [quando, setQuando] = useState("proximas");
  const [novaReuniao, setNovaReuniao] = useState(false);
  const [editarReuniao, setEditarReuniao] = useState<Reuniao | null>(null);
  const [equipeAberta, setEquipeAberta] = useState(false);
  const [status, setStatus] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [supStatus, setSupStatus] = useState("ativos");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  // Pedido de outra aba (navegacao-gestao.ts): aceita o id do atendimento ou o da implementação de origem.
  const [aberto, setAberto] = useState<string | null>(() => {
    const id = consumirAbertura("suporte");
    if (!id) return null;
    return dados.suporteAtend.find((a) => a.id === id || a.impl_id === id)?.id ?? null;
  });
  // Chamados (spec 7b): duas vistas no topo, Chamados (padrão) e Acompanhamento 15 dias (a de antes, sem mudança).
  const [vista, setVista] = useState<"chamados" | "acompanhamento">("chamados");
  const [novoChamado, setNovoChamado] = useState(false);
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);
  const [clienteHistorico, setClienteHistorico] = useState<string | null>(null);
  const minhaPessoa = useMinhaPessoa(uid);

  const acoes = useAcoesAtendimento({
    dados,
    papeis,
    t,
    recarregar,
    meuNome,
    // Artefato :2908: depois de iniciar, abre o detalhe do atendimento.
    aoIniciar: (_ctx, id) => setAberto(id),
  });
  const pode = acoes.pode;

  const r = resumoReunioes(dados.reunioes, mes, hojeLocal());
  const podeReu = podeEscrever(papeis, "reunioes");

  // Nome do cliente: o papel Suporte não lê `gestao_clientes` (RLS); usa o nome gravado no atendimento/implementação.
  const nomeCliente = (id: string | null): string =>
    dados.clientes.find((c) => c.id === id)?.nome ??
    dados.suporteAtend.find((a) => a.cliente_id === id && a.cliente_nome)?.cliente_nome ??
    dados.implementacoes.find((i) => i.cliente_id === id && i.cliente_nome)?.cliente_nome ??
    "Cliente removido";

  // ---- clientes recebidos da implementação -------------------------------------------------------------
  const equipe = equipeSuporte(dados.config);
  const proximo = proximoSuporte(dados.config);
  const linhas = linhasSuporte(dados.implementacoes, dados.suporteAtend);
  const contarSup = { aguardando: 0, andamento: 0, concluida: 0 };
  for (const l of linhas) contarSup[l.status]++;
  const porPessoa = clientesPorPessoa(linhas);
  const listaSup = filtrarLinhasSuporte(linhas, supStatus, cliente);
  const hoje = hojeLocal();
  const h0 = ymd(hoje);

  /** garantirAtend (artefato :2002): o atendimento existe? senão, cria agora e devolve. */
  async function comAtendimento(l: LinhaSuporte, fazer: (at: SuporteAtend) => void) {
    if (l.at) {
      fazer(l.at);
      return;
    }
    if (!l.im) return;
    setAbrindo(l.im.id);
    try {
      // A3: conclusão que falhou no meio (ou dado antigo) se conserta aqui, como o artefato (:3200-3201).
      const at = await garantirAtendimento(l.im, dados.suporteAtend, {
        nomeCliente: dados.clientes.find((c) => c.id === l.im?.cliente_id)?.nome ?? l.im.cliente_nome ?? "",
      });
      await recarregar(["suporteAtend"]);
      fazer(at);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui abrir o atendimento no suporte."));
    } finally {
      setAbrindo(null);
    }
  }

  // ---- reuniões do time com os clientes ---------------------------------------------------------------
  let listaReu = dados.reunioes.filter((rr) => {
    if (cliente !== "todos" && rr.cliente_id !== cliente) return false;
    if (status !== "todos" && rr.status !== status) return false;
    if (quando === "mes") return !!rr.data && rr.data.slice(0, 7) === mes;
    if (quando === "proximas") return !!rr.data && rr.data >= h0 && rr.status === "Agendada";
    return true;
  });
  listaReu = [...listaReu].sort(ordenarReunioes);
  if (quando === "todas") listaReu.reverse();

  // Filtro de cliente (artefato `selCliente`): clientes cadastrados + os que chegaram pela implementação.
  const opcoesCliente = new Map<string, string>();
  for (const c of dados.clientes) opcoesCliente.set(c.id, c.nome);
  for (const l of linhas) if (l.clienteId && !opcoesCliente.has(l.clienteId)) opcoesCliente.set(l.clienteId, nomeCliente(l.clienteId));
  const clientesOrdenados = [...opcoesCliente.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

  const registroAberto = aberto ? dados.suporteAtend.find((a) => a.id === aberto) : null;
  if (aberto && registroAberto) {
    return (
      <AbaCasca>
        <DetalheAtendimento
          ctx="sup"
          registro={registroAberto}
          dados={dados}
          papeis={papeis}
          t={t}
          recarregar={recarregar}
          meuNome={meuNome}
          onVoltar={() => setAberto(null)}
        />
      </AbaCasca>
    );
  }

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Suporte"
        // O cabeçalho das reuniões é do acompanhamento de 15 dias; na vista Chamados ele confundia (prova de tela, 25/09).
        subtitulo={
          vista === "chamados"
            ? "Um chamado por problema, com a linha do tempo completa: quem fez, quando e o quê."
            : `Reuniões do time com os clientes · ${rotuloMes(mes)}: ${r.contagem["Concluída"]} concluídas, ${r.contagem.Agendada} agendadas, ${r.contagem.Remarcada} remarcadas, ${r.contagem.Cancelada} canceladas.`
        }
        acoes={
          vista === "chamados" ? undefined : <>
            <button type="button" className="btn" onClick={() => setEquipeAberta(true)}>
              Equipe
            </button>
            {podeReu && (
              <button type="button" className="btn btn-primary" onClick={() => setNovaReuniao(true)}>
                + Nova reunião
              </button>
            )}
          </>
        }
      />

      <Segmentado opcoes={[["chamados", "Chamados"], ["acompanhamento", "Acompanhamento 15 dias"]]} valor={vista} onChange={setVista} />
      {vista === "chamados" ? (
        <VistaChamados dados={dados} papeis={papeis} abrirChamado={setChamadoAberto} onNovo={() => setNovoChamado(true)} verCliente={setClienteHistorico} />
      ) : (
        <>
          <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
            <div className="row gap-2" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
              <div className="h3">Clientes recebidos da implementação</div>
              <span className="muted tiny">
                {contarSup.aguardando} aguardando início · {contarSup.andamento} em andamento · {contarSup.concluida}{" "}
                concluídos. Distribuídos em rodízio, na ordem da Equipe.
              </span>
            </div>
            {equipe.length > 0 ? (
              <div className="row gap-2" style={{ flexWrap: "wrap", margin: "10px 0 12px", alignItems: "center" }}>
                {equipe.map((nome) => (
                  <span key={nome} className={proximo && proximo.nome === nome ? "badge badge-aurora" : "badge"}>
                    {nome} · {porPessoa[nome] ?? 0}
                  </span>
                ))}
                {proximo && (
                  <span className="muted tiny">
                    Próximo a receber: <b>{proximo.nome}</b>
                  </span>
                )}
              </div>
            ) : (
              <p className="muted small" style={{ margin: "6px 0 12px" }}>
                Cadastre o time em “Equipe” para ativar o rodízio automático.
              </p>
            )}
            <Segmentado opcoes={SUP_STATUS} valor={supStatus} onChange={setSupStatus} />
            {listaSup.length === 0 ? (
              <p className="muted small" style={{ marginTop: 10 }}>
                {linhas.length ? "Nenhum cliente com esse filtro." : "Nenhum cliente recebido ainda."}
              </p>
            ) : (
              <div style={{ marginTop: 10, overflow: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Cliente</th>
                      <th style={{ textAlign: "left" }}>Recebido em</th>
                      <th style={{ textAlign: "left" }}>Responsável</th>
                      <th style={{ textAlign: "left" }}>Status</th>
                      <th style={{ textAlign: "left" }}>Andamento</th>
                      <th style={{ textAlign: "left" }}>Próxima reunião</th>
                      <th style={{ textAlign: "right" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {listaSup.map((l) => {
                      const chave = l.im?.id ?? l.at?.id ?? "";
                      const st = statusSupDe(l.status);
                      const email = dados.clientes.find((c) => c.id === l.clienteId)?.email ?? "";
                      const pr = proximaReuniaoSup(dados.reunioes, l.at?.id ?? null, l.clienteId, h0);
                      const rodizio = !!l.im?.suporte_auto && !!l.resp && l.resp === l.im?.suporte_responsavel;
                      const ocupado = abrindo === l.im?.id;
                      return (
                        <tr key={chave}>
                          <td>
                            <div className="small">
                              {l.im ? (dados.clientes.find((c) => c.id === l.clienteId)?.nome ?? l.im.cliente_nome ?? "Cliente removido") : nomeCliente(l.clienteId)}
                            </div>
                            <div className="muted tiny gestao-email">{email}</div>
                          </td>
                          <td className="mono small">{dataHoraAs(l.recebido)}</td>
                          <td className="small">
                            {l.resp ? (
                              <>
                                {l.resp}
                                {rodizio && <span className="muted tiny"> (rodízio)</span>}
                              </>
                            ) : (
                              <span className="muted">não definido</span>
                            )}
                          </td>
                          <td>
                            <Selo tom={st.tom}>{st.rotulo}</Selo>
                          </td>
                          <td style={{ minWidth: 170 }}>
                            {l.status === "aguardando" ? (
                              <span className="muted tiny">
                                {(() => {
                                  const nt = l.at && Array.isArray(l.at.tentativas) ? l.at.tentativas.length : 0;
                                  return nt ? `${nt} tentativa${nt > 1 ? "s" : ""} de contato sem sucesso` : "ainda sem contato";
                                })()}
                              </span>
                            ) : l.status === "andamento" && l.at ? (
                              <BarraAndamento
                                andamento={andamentoLista(l.at.inicio, hoje)}
                                rodape={`${diasPreenchidos(diarioDoContexto("sup", l.at))} dia(s) com registro`}
                              />
                            ) : (
                              <span className="muted tiny">Concluído em {dataHoraAs(l.at?.concluido_em)}</span>
                            )}
                          </td>
                          <td>
                            {pr ? (
                              <>
                                <div className="mono small">
                                  {dataBR(pr.data)} {pr.hora ?? ""}
                                </div>
                                <div className="muted tiny">{pr.tipo ?? ""}</div>
                              </>
                            ) : (
                              <span className="muted tiny">—</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                              {pode.sup && l.status === "aguardando" && (
                                <BotaoAcao
                                  primario
                                  desabilitado={ocupado}
                                  onClick={() => void comAtendimento(l, (at) => acoes.abrir({ tipo: "sup-iniciar", at }))}
                                >
                                  Iniciar atendimento
                                </BotaoAcao>
                              )}
                              {pode.sup && l.status === "aguardando" && (
                                <BotaoAcao
                                  desabilitado={ocupado}
                                  titulo="Para quando o cliente já está em dia e o acompanhamento não precisa acontecer"
                                  onClick={() => void comAtendimento(l, (at) => acoes.abrir({ tipo: "sup-concluir-direto", at }))}
                                >
                                  Concluir sem acompanhamento
                                </BotaoAcao>
                              )}
                              {pode.sup && l.status === "andamento" && l.at && (
                                <BotaoAcao primario onClick={() => acoes.abrir({ tipo: "sup-concluir", at: l.at as SuporteAtend })}>
                                  Concluir atendimento
                                </BotaoAcao>
                              )}
                              <BotaoAcao desabilitado={ocupado} onClick={() => void comAtendimento(l, (at) => setAberto(at.id))}>
                                {ocupado ? "abrindo…" : "Abrir"}
                              </BotaoAcao>
                              {pode.supExcluir && l.im && (
                                <BotaoAcao perigo onClick={() => acoes.abrir({ tipo: "sup-excluir", im: l.im as NonNullable<typeof l.im> })}>
                                  Excluir
                                </BotaoAcao>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {r.semRelato > 0 && (
            <Faixa tom="aviso">
              <b>
                {r.semRelato} {r.semRelato > 1 ? "reuniões" : "reunião"} sem relato
              </b>{" "}
              — marcadas como concluídas mas ainda sem o resumo do que foi abordado.
            </Faixa>
          )}

          <div className="os-card row gap-3" style={{ padding: "14px 16px", marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Segmentado opcoes={QUANDO} valor={quando} onChange={setQuando} />
            <Segmentado opcoes={STATUS} valor={status} onChange={setStatus} />
            <div className="flex-1" />
            <select
              className="input"
              style={{ width: 220 }}
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              aria-label="Filtrar por cliente"
            >
              <option value="todos">Todos os clientes</option>
              {clientesOrdenados.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>

          {listaReu.length === 0 ? (
            <Vazio
              icone="calendar"
              titulo="Nenhuma reunião aqui"
              mensagem="Ajuste os filtros acima ou agende a primeira reunião com o botão + Nova reunião."
            />
          ) : (
            listaReu.map((rr) => {
              const st = rr.status || "Agendada";
              const atrasada = st === "Agendada" && !!rr.data && rr.data < h0;
              const origem = rr.origem_id ? dados.reunioes.find((x) => x.id === rr.origem_id) : null;
              return (
                <div key={rr.id} className="os-card row gap-3" style={{ padding: 14, marginBottom: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ width: 96, flexShrink: 0 }}>
                    {/* cor do status no ponto, no lugar da borda lateral do .meet (financeiro.html:274-277) */}
                    <div className="small row gap-1" style={{ fontWeight: 600, alignItems: "center" }}>
                      <Ponto tom={tomReuniao(st)} />
                      {rr.data ? dataBR(rr.data) : "sem data"}
                    </div>
                    <div className="muted tiny">{rr.hora || "--:--"}</div>
                    <div className="muted tiny">{diaSemana(rr.data)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="small" style={{ fontWeight: 600 }}>
                      {nomeCliente(rr.cliente_id)}
                    </div>
                    <div className="muted tiny" style={{ marginTop: 2 }}>
                      {rr.tipo || "Acompanhamento"} · responsável: {rr.responsavel || "não definido"}
                      {rr.origem_id ? ` · remarcada de ${origem ? dataBR(origem.data) : "—"}` : ""}
                    </div>
                    {st === "Concluída" && (rr.resumo ?? "").trim() && (
                      <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                        <b>Como foi a reunião</b> {rr.resumo}
                      </div>
                    )}
                    {st === "Concluída" && !(rr.resumo ?? "").trim() && (
                      <p className="small" style={{ marginTop: 6, color: "var(--os-aviso)" }}>
                        Falta preencher o relato desta reunião.
                      </p>
                    )}
                    {(st === "Cancelada" || st === "Remarcada") && (rr.motivo ?? "").trim() && (
                      <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                        <b>Motivo</b> {rr.motivo}
                      </div>
                    )}
                    {st === "Remarcada" && rr.remarcada_para && (
                      <p className="muted small" style={{ marginTop: 6 }}>
                        Nova data: {dataBR(rr.remarcada_para)}
                      </p>
                    )}
                    {atrasada && (
                      <p className="small" style={{ marginTop: 6, color: "var(--os-aviso)" }}>
                        Data já passou e a reunião segue como agendada.
                      </p>
                    )}
                  </div>
                  <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Selo tom={tomReuniao(st)}>{st}</Selo>
                    {podeReu && (
                      <LinhaAcoesReuniao
                        reuniao={rr}
                        nomeCliente={nomeCliente(rr.cliente_id)}
                        t={t}
                        recarregar={recarregar}
                        tabela="gestao_reunioes"
                        pessoas={pessoasDaArea(dados, "cliente")}
                        tipos={TIPOS_REUNIAO}
                        tipoPadrao="Acompanhamento"
                        onEditar={() => setEditarReuniao(rr)}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}

          {acoes.modais}

          {equipeAberta && (
            <ModalEquipe
              pessoas={equipe}
              valorAtual={dados.config.equipe}
              deAcessos={pessoasSup.deAcessos}
              proximo={proximo?.nome ?? null}
              t={t}
              recarregar={recarregar}
              onClose={() => setEquipeAberta(false)}
            />
          )}

          {(novaReuniao || editarReuniao) && (
            <ModalReuniao
              area="cliente"
              reuniao={editarReuniao ?? undefined}
              dados={dados}
              t={t}
              recarregar={recarregar}
              onClose={() => {
                setNovaReuniao(false);
                setEditarReuniao(null);
              }}
            />
          )}
        </>
      )}
      {novoChamado && (
        <ModalNovoChamado t={t} equipe={pessoasSup.equipe} responsavelPadrao={minhaPessoa || meuNome || ""} onClose={() => setNovoChamado(false)}
          onCriado={async (id) => { setNovoChamado(false); await recarregar(["chamados"]); setChamadoAberto(id); }} />
      )}
      {clienteHistorico && (
        <ChamadosDoCliente clienteId={clienteHistorico} chamados={dados.chamados} papeis={papeis} t={t} onClose={() => setClienteHistorico(null)}
          onAbrir={(id) => { setClienteHistorico(null); setChamadoAberto(id); }} />
      )}
      {chamadoAberto && (() => {
        const c = dados.chamados.find((x) => x.id === chamadoAberto);
        return c ? <DetalheChamado chamado={c} papeis={papeis} t={t} equipe={pessoasSup.equipe} onFicha={(id) => { setChamadoAberto(null); setClienteHistorico(id); }} onClose={() => setChamadoAberto(null)} recarregar={() => recarregar(["chamados"])} /> : null;
      })()}
    </AbaCasca>
  );
}
