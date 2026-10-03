/**
 * Aba P&D (antiga Programador, D-2) — artefato `viewProgramador` :2482-2560 (lista) e o detalhe compartilhado.
 *
 * Na ordem do artefato: cabeçalho com as contagens (e "N concluído(s) em <mês>"), 4 KPIs, faixa "Time de
 * suporte vazio", filtros (status, programador, busca), tabela com Datas, Responsáveis, Pedidos em aberto e
 * Status, e a tabela de programadores. Some da lista o que o P&D excluiu dos concluídos (`oculto_prog`, :2484).
 * As ações (Iniciar com programador, data e hora; Concluir; Retornar à implementação; Remover; Excluir) moram em
 * `acoes-atendimento.tsx`, as mesmas do detalhe.
 *
 * D-3: a fila do P&D é aberta — quem pega clica em "Assumir" (registrado em `extras.assumidosProg`).
 */

import { useMemo, useState } from "react";
import { usePessoasSuporte } from "./pessoas-suporte";
import { useAcoesAtendimento } from "./acoes-atendimento";
import { equipeSuporte, proximoSuporte } from "./calculos";
import { atualizar, mensagemDeErro } from "./dados";
import {
  dataHoraAs,
  diarioDoContexto,
  isoParaBR,
  listaProgramador,
  nomeClienteImpl,
  nomesDaArea,
  pendenciasProg,
  programadorVisiveis,
  statusImplDe,
} from "./dados-atendimento";
import { DetalheAtendimento } from "./detalhe-atendimento";
import { DetalheChamado } from "./detalhe-chamado";
import { ChamadosDoCliente } from "./chamados-do-cliente";
import { numeroChamado, tempoDesde } from "./logica-chamados";
import { useMinhaPessoa } from "./minha-pessoa";
import { ModalFuncionario } from "./modais-cadastro";
import { consumirAbertura } from "./navegacao-gestao";
import { PainelFuncionarios } from "./painel-funcionarios";
import { rotuloMes, ymd, type Implementacao, type PropsAba } from "./tipos";
import {
  AbaCasca,
  BotaoAcao,
  CabecalhoAba,
  CartaoTabela,
  Faixa,
  Kpi,
  LinhaKpis,
  Segmentado,
  Selo,
  Vazio,
} from "./ui-gestao";

/** Chips do artefato :2520-2521 (D-2: "Com o P&D"). */
const VISOES: Array<[string, string]> = [
  ["programador", "Com o P&D"],
  ["pedidos", "Com pedidos em aberto"],
  ["implementacao", "Na implementação"],
  ["concluida", "Concluídos"],
  ["todos", "Todos"],
];

export function AbaProgramador({ dados, papeis, mes, t, recarregar, meuNome, uid }: PropsAba) {
  // responsável do chamado e rodízio: app Equipe + quem tem Suporte em Acessos (revisão final I3)
  const pessoasSup = usePessoasSuporte(dados.config);
  // Pedido de outra aba (navegacao-gestao.ts) abre direto o atendimento, como `ver-prog` do artefato (:3145).
  const [aberto, setAberto] = useState<string | null>(() => consumirAbertura("programador"));
  const [visao, setVisao] = useState("programador");
  const [resp, setResp] = useState("todos");
  const [q, setQ] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  // Chamados escalados (spec 7b): a RLS já entrega ao P&D só os que passaram por ele; aqui, os que estão com ele agora.
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);
  const [fichaCliente, setFichaCliente] = useState<string | null>(null);
  const escalados = dados.chamados.filter((c) => c.status === "aguardando_equipe");

  const acoes = useAcoesAtendimento({
    dados,
    papeis,
    t,
    recarregar,
    meuNome,
    // Artefato :2996: depois de iniciar, abre o detalhe.
    aoIniciar: (_ctx, id) => setAberto(id),
  });
  const pode = acoes.pode;

  const todas = useMemo(() => programadorVisiveis(dados.implementacoes), [dados.implementacoes]);
  const comProg = todas.filter((i) => i.status === "programador");
  const emImpl = todas.filter((i) => i.status === "andamento" || i.status === "aguardando");
  let pedAbertos = 0;
  for (const i of todas) if (i.status !== "concluida") pedAbertos += pendenciasProg(diarioDoContexto("impl", i)).length;
  const concluidosMes = todas.filter(
    (i) => i.status === "concluida" && i.prog_concluido_em && ymd(new Date(i.prog_concluido_em)).slice(0, 7) === mes,
  ).length;
  const nx = proximoSuporte(dados.config);
  const programadores = nomesDaArea(dados.funcionarios, "programador");
  // A4: só assume quem tem o acesso ligado a um programador cadastrado (Acessos › "No time como").
  // Sem isso, como no artefato, o programador é escolhido em "Iniciar atendimento".
  const minhaPessoa = useMinhaPessoa(uid);
  const possoAssumir = !!minhaPessoa && programadores.includes(minhaPessoa);

  const lista = useMemo(
    () => listaProgramador(todas, dados.clientes, { status: visao, resp, q }),
    [todas, dados.clientes, visao, resp, q],
  );

  const nomeCliente = (i: Implementacao) => nomeClienteImpl(i, dados.clientes);
  const emailCliente = (i: Implementacao) => dados.clientes.find((c) => c.id === i.cliente_id)?.email ?? "";

  /** D-3: pegar para si um item da fila do P&D, com registro de quem e quando. */
  async function assumir(i: Implementacao) {
    // A4: o responsável é a PESSOA do time ligada ao seu acesso (artefato `minhaPessoa` :3269), não o nome do perfil.
    if (!possoAssumir) return;
    setSalvando(i.id);
    const agora = new Date().toISOString();
    try {
      const anteriores = (i.extras?.assumidosProg as unknown[] | undefined) ?? [];
      await atualizar("gestao_implementacoes", i.id, {
        programador: minhaPessoa,
        extras: { ...(i.extras ?? {}), assumidosProg: [...anteriores, { em: agora, por: meuNome || minhaPessoa }] },
      });
      t.success(`${nomeCliente(i)}: você assumiu no P&D.`);
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui assumir."));
    } finally {
      setSalvando(null);
    }
  }

  const registroAberto = aberto ? dados.implementacoes.find((i) => i.id === aberto) : null;
  if (aberto && registroAberto) {
    return (
      <AbaCasca>
        <DetalheAtendimento
          ctx="prog"
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

  const aguardandoInicio = comProg.filter((i) => !i.prog_iniciado_em).length;

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="P&D"
        subtitulo={`${comProg.length} com o P&D · ${emImpl.length} ainda na implementação · ${concluidosMes} concluído${concluidosMes === 1 ? "" : "s"} em ${rotuloMes(mes)}.`}
        acoes={
          pode.funcionarios && (
            <button type="button" className="btn" onClick={() => setCadastroAberto(true)}>
              + Novo programador
            </button>
          )
        }
      />

      {escalados.length > 0 && (
        <div className="os-card" style={{ padding: "14px 16px", marginBottom: 16 }}>
          <div className="h3">Chamados escalados ({escalados.length})</div>
          <div style={{ marginTop: 8, overflow: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Nº</th><th>Cliente</th><th>Título</th><th>Desde</th></tr></thead>
              <tbody>
                {escalados.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setChamadoAberto(c.id)}>
                    <td>{numeroChamado(c.numero)}</td><td>{c.cliente_nome}</td><td>{c.titulo}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{tempoDesde(c.status_desde, new Date())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LinhaKpis>
        <Kpi
          rotulo="Com o P&D"
          valor={String(comProg.length)}
          sub={
            comProg.length
              ? `${aguardandoInicio} aguardando início · ${comProg.length - aguardandoInicio} em andamento`
              : "nenhum no momento"
          }
          destaque
        />
        <Kpi rotulo="Pedidos em aberto" valor={String(pedAbertos)} sub="pedidos do diário sem data de resolução" />
        <Kpi rotulo="Ainda na implementação" valor={String(emImpl.length)} sub="vão chegar aqui ao serem concluídos" />
        <Kpi
          rotulo="Concluídos no mês"
          valor={String(concluidosMes)}
          sub={nx ? `próximo do suporte: ${nx.nome}` : "cadastre o time de suporte"}
        />
      </LinhaKpis>

      {equipeSuporte(dados.config).length === 0 && (
        <Faixa tom="aviso">
          <b>Time de suporte vazio.</b> Cadastre as pessoas em Suporte › Equipe para que os clientes concluídos sejam
          distribuídos automaticamente.
        </Faixa>
      )}

      <div className="os-card row gap-3" style={{ padding: "14px 16px", marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmentado opcoes={VISOES} valor={visao} onChange={setVisao} />
        {/* filtros da direita num grupo: quebram juntos, alinhados à direita (antes a busca caía sozinha à esquerda) */}
        <div className="row gap-2" style={{ marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            className="input"
            style={{ width: 220 }}
            value={resp}
            onChange={(e) => setResp(e.target.value)}
            aria-label="Filtrar por programador"
          >
            <option value="todos">Todos os programadores</option>
            <option value="sem">Sem programador</option>
            {programadores.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="Buscar cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar cliente"
          />
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio
          icone="cpu"
          titulo="Nenhum cliente aqui"
          mensagem={
            visao === "programador"
              ? "Os clientes aparecem aqui quando a implementação clica em “Concluir e enviar ao P&D”."
              : "Ajuste os filtros ou a busca."
          }
        />
      ) : (
        <CartaoTabela>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Cliente</th>
              <th style={{ textAlign: "left" }}>Datas</th>
              <th style={{ textAlign: "left" }}>Responsáveis</th>
              <th style={{ textAlign: "right" }}>Pedidos em aberto</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "right" }} />
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const st = statusImplDe(i);
              const pp = pendenciasProg(diarioDoContexto("impl", i)).length;
              const fechado = i.status === "concluida" || i.status === "validacao";
              return (
                <tr key={i.id}>
                  <td>
                    <div className="small">{nomeCliente(i)}</div>
                    <div className="muted tiny gestao-email">{emailCliente(i)}</div>
                  </td>
                  <td>
                    <div className="muted tiny">Implementação</div>
                    <div className="mono small">{dataHoraAs(i.enviado_em)}</div>
                    <div className="muted tiny" style={{ marginTop: 4 }}>
                      P&D
                    </div>
                    <div className="mono small">{i.enviado_prog_em ? dataHoraAs(i.enviado_prog_em) : "—"}</div>
                  </td>
                  <td className="small">
                    <div>
                      <span className="muted">Implementação:</span> {i.responsavel || "—"}
                    </div>
                    <div>
                      <span className="muted">Programador:</span>{" "}
                      {i.programador || <span className="muted">não definido</span>}
                    </div>
                    {i.prog_iniciado_em && (
                      <div className="muted tiny">
                        início{" "}
                        {i.prog_inicio
                          ? `${isoParaBR(i.prog_inicio)}${i.prog_inicio_hora ? ` às ${i.prog_inicio_hora}` : ""}`
                          : dataHoraAs(i.prog_iniciado_em)}
                      </div>
                    )}
                  </td>
                  <td
                    className="mono small"
                    style={{ textAlign: "right", ...(pp ? { color: "var(--os-aviso)", fontWeight: 700 } : {}) }}
                  >
                    {pp}
                  </td>
                  <td>
                    <Selo tom={st.tom}>{st.rotulo}</Selo>
                    {fechado && (
                      <div className="muted tiny" style={{ marginTop: 2 }}>
                        {dataHoraAs(i.prog_concluido_em || i.concluido_em)}
                        {i.suporte_responsavel ? ` · ${i.suporte_responsavel}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap", maxWidth: 320, marginLeft: "auto" }}>
                      {pode.impl && i.status === "programador" && (
                        <>
                          {/* D-3: a fila do P&D também é aberta — quem pega, assume. */}
                          {!i.programador && possoAssumir && (
                            <BotaoAcao
                              desabilitado={salvando === i.id}
                              titulo={`Assumir como ${minhaPessoa}`}
                              onClick={() => void assumir(i)}
                            >
                              {salvando === i.id ? "assumindo…" : "Assumir"}
                            </BotaoAcao>
                          )}
                          {!i.prog_iniciado_em ? (
                            <BotaoAcao primario onClick={() => acoes.abrir({ tipo: "prog-iniciar", im: i })}>
                              Iniciar atendimento
                            </BotaoAcao>
                          ) : (
                            <BotaoAcao primario onClick={() => acoes.abrir({ tipo: "prog-concluir", im: i })}>Concluir</BotaoAcao>
                          )}
                          <BotaoAcao onClick={() => acoes.abrir({ tipo: "prog-devolver-impl", im: i })}>
                            Retornar à implementação
                          </BotaoAcao>
                        </>
                      )}
                      <BotaoAcao onClick={() => setAberto(i.id)}>Abrir</BotaoAcao>
                      {pode.impl && i.status === "programador" && (
                        <BotaoAcao perigo onClick={() => acoes.abrir({ tipo: "prog-remover", im: i })}>
                          Remover
                        </BotaoAcao>
                      )}
                      {pode.impl && fechado && (
                        <BotaoAcao perigo onClick={() => acoes.abrir({ tipo: "prog-excluir-hist", im: i })}>
                          Excluir
                        </BotaoAcao>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </CartaoTabela>
      )}

      <PainelFuncionarios area="programador" dados={dados} podeEditar={pode.funcionarios} t={t} recarregar={recarregar} />

      {acoes.modais}

      {chamadoAberto && (() => {
        const c = dados.chamados.find((x) => x.id === chamadoAberto);
        return c ? <DetalheChamado chamado={c} papeis={papeis} t={t} equipe={pessoasSup.equipe} onFicha={(id) => { setChamadoAberto(null); setFichaCliente(id); }} onClose={() => setChamadoAberto(null)} recarregar={() => recarregar(["chamados"])} /> : null;
      })()}
      {fichaCliente && <ChamadosDoCliente clienteId={fichaCliente} chamados={dados.chamados} papeis={papeis} t={t} onClose={() => setFichaCliente(null)} onAbrir={(id) => { setFichaCliente(null); setChamadoAberto(id); }} />}

      {cadastroAberto && (
        <ModalFuncionario
          areaPadrao="programador"
          dados={dados}
          t={t}
          recarregar={recarregar}
          onClose={() => setCadastroAberto(false)}
        />
      )}
    </AbaCasca>
  );
}
