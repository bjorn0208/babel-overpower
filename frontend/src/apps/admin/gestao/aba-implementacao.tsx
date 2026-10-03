/**
 * Aba Implementação — artefato `viewImplementacao` :2054-2155 (lista) e `viewImplDetalhe` :2318-2444 (detalhe).
 *
 * Na ordem do artefato: cabeçalho com as contagens (e "N concluída(s) em <mês>"), 5 KPIs, faixas de aviso
 * (voltaram do P&D; faltam funcionários), filtros (status, responsável, busca), tabela com Andamento
 * ("Dia X de 15", "Passou dos 15 dias", "Testar e fazer a call") e Próxima reunião, e a tabela de funcionários.
 * As ações (Iniciar, Teste realizado, Retornar ao P&D, Remover, Excluir do histórico…) moram em
 * `acoes-atendimento.tsx`, as mesmas do detalhe. "Concluir e enviar ao P&D" fica só no detalhe (artefato :2475).
 *
 * Decisões que valem acima do artefato:
 *  - D-1 + Theus (2026-09-24): quem envia o cliente é o gestor, pela aba Clientes; aqui não há "+ Enviar cliente".
 *  - D-2: a área aparece como "P&D".
 *  - D-3: o envio cai na fila sem responsável e alguém clica "Assumir" (registrado em `extras.assumidos`).
 *  - O botão de estado da aba Clientes abre o atendimento aqui (`consumirAbertura`, navegacao-gestao.ts).
 */

import { useMemo, useState } from "react";
import { useAcoesAtendimento } from "./acoes-atendimento";
import { BarraAndamento } from "./barra-andamento";
import { atualizar, mensagemDeErro } from "./dados";
import {
  DIAS_ATENDIMENTO,
  andamentoLista,
  dataHoraAs,
  diaAtualDe,
  diarioDoContexto,
  diasPreenchidos,
  implementacoesVisiveis,
  listaImplementacao,
  nomeClienteImpl,
  nomesDaArea,
  pendenciasProg,
  proximaReuniaoImpl,
  statusImplDe,
} from "./dados-atendimento";
import { DetalheAtendimento } from "./detalhe-atendimento";
import { ModalFuncionario } from "./modais-cadastro";
import { useMinhaPessoa } from "./minha-pessoa";
import { consumirAbertura } from "./navegacao-gestao";
import { PainelFuncionarios } from "./painel-funcionarios";
import { dataBR, hojeLocal, rotuloMes, ymd, type Implementacao, type PropsAba } from "./tipos";
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

/** Chips do artefato :2094-2096. */
const STATUS: Array<[string, string]> = [
  ["ativos", "Em aberto"],
  ["aguardando", "Aguardando início"],
  ["andamento", "Em andamento"],
  ["programador", "Com o P&D"],
  ["validacao", "Em validação"],
  ["concluida", "Histórico"],
  ["todos", "Todas"],
];

export function AbaImplementacao({ dados, papeis, mes, t, recarregar, meuNome, uid }: PropsAba) {
  // Pedido de outra aba (Clientes → "Em implementação" etc.) abre direto o atendimento (artefato `ver-impl` :3143).
  const [aberto, setAberto] = useState<string | null>(() => consumirAbertura("implementacao"));
  const [status, setStatus] = useState("ativos");
  const [resp, setResp] = useState("todos");
  const [q, setQ] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const acoes = useAcoesAtendimento({
    dados,
    papeis,
    t,
    recarregar,
    meuNome,
    // Artefato :2908: depois de iniciar, abre o detalhe.
    aoIniciar: (_ctx, id) => setAberto(id),
  });
  const pode = acoes.pode;

  const hoje = hojeLocal();
  const h0 = ymd(hoje);
  const todas = useMemo(() => implementacoesVisiveis(dados.implementacoes), [dados.implementacoes]);
  const cont = { aguardando: 0, andamento: 0, programador: 0, validacao: 0 };
  for (const i of todas) if (i.status && i.status in cont) cont[i.status as keyof typeof cont]++;
  const concluidasMes = todas.filter(
    (i) => i.status === "concluida" && i.concluido_em && ymd(new Date(i.concluido_em)).slice(0, 7) === mes,
  ).length;
  const reuProx = dados.implReunioes
    .filter((r) => r.area !== "ind" && r.area !== "prog" && r.status === "Agendada" && (r.data ?? "") >= h0)
    .sort((a, b) => `${a.data ?? ""} ${a.hora ?? ""}`.localeCompare(`${b.data ?? ""} ${b.hora ?? ""}`));
  const atrasadas = todas.filter((i) => i.status === "andamento" && diaAtualDe(i.inicio, hoje) > DIAS_ATENDIMENTO).length;
  const funcionariosImpl = nomesDaArea(dados.funcionarios, "implementacao");
  // A4: só assume quem tem o acesso ligado a uma pessoa da implementação (Acessos › "No time como").
  // Sem isso, como no artefato, o responsável é escolhido em "Iniciar atendimento".
  const minhaPessoa = useMinhaPessoa(uid);
  const possoAssumir = !!minhaPessoa && funcionariosImpl.includes(minhaPessoa);

  const lista = useMemo(
    () => listaImplementacao(todas, dados.clientes, { status, resp, q }),
    [todas, dados.clientes, status, resp, q],
  );

  const nomeCliente = (i: Implementacao) => nomeClienteImpl(i, dados.clientes);
  const emailCliente = (i: Implementacao) => dados.clientes.find((c) => c.id === i.cliente_id)?.email ?? "";

  /**
   * D-3: pegar para si um atendimento que está na fila sem dono. Grava o responsável e deixa o
   * registro de quem assumiu e quando, no mesmo formato `{em, por}` dos outros encaminhamentos.
   */
  async function assumir(i: Implementacao) {
    // A4: o responsável é a PESSOA do time ligada ao seu acesso (artefato `minhaPessoa` :3269), não o nome do perfil.
    if (!possoAssumir) return;
    setSalvando(i.id);
    const agora = new Date().toISOString();
    try {
      const anteriores = (i.extras?.assumidos as unknown[] | undefined) ?? [];
      await atualizar("gestao_implementacoes", i.id, {
        responsavel: minhaPessoa,
        extras: { ...(i.extras ?? {}), assumidos: [...anteriores, { em: agora, por: meuNome || minhaPessoa }] },
      });
      t.success(`${nomeCliente(i)}: você assumiu o atendimento.`);
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui assumir o atendimento."));
    } finally {
      setSalvando(null);
    }
  }

  const registroAberto = aberto ? dados.implementacoes.find((i) => i.id === aberto) : null;
  if (aberto && registroAberto) {
    return (
      <AbaCasca>
        <DetalheAtendimento
          ctx="impl"
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
        titulo="Implementação"
        subtitulo={`${cont.aguardando} aguardando início · ${cont.andamento} em andamento · ${cont.programador} com o P&D · ${cont.validacao} em validação · ${concluidasMes} concluída${concluidasMes === 1 ? "" : "s"} em ${rotuloMes(mes)}.`}
        acoes={
          pode.funcionarios && (
            <button type="button" className="btn" onClick={() => setCadastroAberto(true)}>
              + Novo funcionário
            </button>
          )
        }
      />

      <LinhaKpis>
        <Kpi
          rotulo="Aguardando início"
          valor={String(cont.aguardando)}
          sub={cont.aguardando ? "clique em Iniciar atendimento" : "nenhum na fila"}
          destaque
        />
        <Kpi
          rotulo="Em andamento"
          valor={String(cont.andamento)}
          cor={atrasadas ? "var(--os-aviso)" : undefined}
          sub={
            atrasadas
              ? `${atrasadas} passaram dos ${DIAS_ATENDIMENTO} dias`
              : `dentro do prazo de ${DIAS_ATENDIMENTO} dias`
          }
        />
        <Kpi
          rotulo="P&D / validação"
          valor={String(cont.programador + cont.validacao)}
          sub={`${cont.programador} com o P&D · ${cont.validacao} para testar`}
        />
        <Kpi rotulo="Concluídas no mês" valor={String(concluidasMes)} sub="foram para o histórico e para o suporte" />
        <Kpi
          rotulo="Reuniões agendadas"
          valor={String(reuProx.length)}
          sub={reuProx.length ? `próxima: ${dataBR(reuProx[0].data)} ${reuProx[0].hora ?? ""}` : "nenhuma marcada"}
        />
      </LinhaKpis>

      {cont.validacao > 0 && (
        <Faixa tom="aviso">
          <b>{cont.validacao > 1 ? `${cont.validacao} clientes voltaram` : `${cont.validacao} cliente voltou`} do P&D.</b>{" "}
          Teste tudo, faça a call com o cliente e clique em “Teste realizado, enviar ao suporte”, ou retorne ao P&D
          quantas vezes for preciso.
        </Faixa>
      )}
      {funcionariosImpl.length === 0 && (
        <Faixa tom="aviso">
          <b>Cadastre os funcionários da implementação.</b> Eles aparecem como responsáveis pelo atendimento e pelas
          reuniões.
        </Faixa>
      )}

      <div className="os-card row gap-3" style={{ padding: "14px 16px", marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmentado opcoes={STATUS} valor={status} onChange={setStatus} />
        {/* filtros da direita num grupo: quebram juntos, alinhados à direita (antes a busca caía sozinha à esquerda) */}
        <div className="row gap-2" style={{ marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            className="input"
            style={{ width: 220 }}
            value={resp}
            onChange={(e) => setResp(e.target.value)}
            aria-label="Filtrar por responsável"
          >
            <option value="todos">Todos os responsáveis</option>
            <option value="sem">Sem responsável</option>
            {funcionariosImpl.map((n) => (
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
          icone="layers"
          titulo={
            status === "concluida"
              ? "Histórico vazio"
              : todas.length
                ? "Nenhum cliente com esses filtros"
                : "Nenhum cliente na implementação"
          }
          mensagem={todas.length ? "Ajuste os filtros ou a busca." : "Na aba Clientes, use o botão “Enviar p/ implementação”."}
        />
      ) : (
        <CartaoTabela>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Cliente</th>
              <th style={{ textAlign: "left" }}>Enviado em</th>
              <th style={{ textAlign: "left" }}>Responsável</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Andamento</th>
              <th style={{ textAlign: "left" }}>Próxima reunião</th>
              <th style={{ textAlign: "right" }} />
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const st = statusImplDe(i);
              const pr = proximaReuniaoImpl(dados.implReunioes, i.id, h0);
              return (
                <tr key={i.id}>
                  <td>
                    <div className="small">{nomeCliente(i)}</div>
                    <div className="muted tiny gestao-email">{emailCliente(i)}</div>
                  </td>
                  <td className="mono small">{dataHoraAs(i.enviado_em)}</td>
                  <td className="small">{i.responsavel || <span className="muted">não definido</span>}</td>
                  <td>
                    <Selo tom={st.tom}>{st.rotulo}</Selo>
                  </td>
                  <td style={{ minWidth: 170 }}>
                    <AndamentoImpl i={i} hoje={hoje} />
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
                      {/* D-3 (Theus, 2026-09-22): o envio vai para a FILA, sem responsável; quem pega clica em "Assumir". */}
                      {pode.impl && possoAssumir && !i.responsavel && i.status !== "concluida" && (
                        <BotaoAcao
                          desabilitado={salvando === i.id}
                          titulo={`Assumir como ${minhaPessoa}`}
                          onClick={() => void assumir(i)}
                        >
                          {salvando === i.id ? "assumindo…" : "Assumir"}
                        </BotaoAcao>
                      )}
                      {pode.impl && i.status === "aguardando" && (
                        <BotaoAcao primario onClick={() => acoes.abrir({ tipo: "impl-iniciar", im: i })}>Iniciar atendimento</BotaoAcao>
                      )}
                      {pode.impl && i.status === "validacao" && (
                        <>
                          <BotaoAcao primario onClick={() => acoes.abrir({ tipo: "impl-finalizar", im: i })}>
                            Teste realizado, enviar ao suporte
                          </BotaoAcao>
                          <BotaoAcao onClick={() => acoes.abrir({ tipo: "impl-retornar", im: i })}>Retornar ao P&D</BotaoAcao>
                        </>
                      )}
                      <BotaoAcao onClick={() => setAberto(i.id)}>Abrir</BotaoAcao>
                      {pode.impl &&
                        (i.status === "concluida" ? (
                          <BotaoAcao perigo onClick={() => acoes.abrir({ tipo: "impl-excluir-hist", im: i })}>
                            Excluir
                          </BotaoAcao>
                        ) : (
                          <BotaoAcao perigo onClick={() => acoes.abrir({ tipo: "impl-remover", im: i })}>
                            Remover
                          </BotaoAcao>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </CartaoTabela>
      )}

      <PainelFuncionarios area="implementacao" dados={dados} podeEditar={pode.funcionarios} t={t} recarregar={recarregar} />

      {acoes.modais}

      {cadastroAberto && (
        <ModalFuncionario
          areaPadrao="implementacao"
          dados={dados}
          t={t}
          recarregar={recarregar}
          onClose={() => setCadastroAberto(false)}
        />
      )}
    </AbaCasca>
  );
}

/** Coluna "Andamento" — artefato :2112-2135. */
function AndamentoImpl({ i, hoje }: { i: Implementacao; hoje: Date }) {
  if (i.status === "aguardando") {
    const nt = Array.isArray(i.tentativas) ? i.tentativas.length : 0;
    return (
      <span className="muted tiny">
        {nt ? `${nt} tentativa${nt > 1 ? "s" : ""} de contato sem sucesso` : "ainda sem contato"}
      </span>
    );
  }
  if (i.status === "andamento") {
    const a = andamentoLista(i.inicio, hoje);
    const n = diasPreenchidos(diarioDoContexto("impl", i));
    return <BarraAndamento andamento={a} rodape={`${n} dia${n === 1 ? "" : "s"} com registro`} />;
  }
  if (i.status === "programador") {
    const pp = pendenciasProg(diarioDoContexto("impl", i)).length;
    return (
      <div className="muted tiny" style={{ lineHeight: 1.5 }}>
        <div>{i.prog_iniciado_em ? `P&D iniciou em ${dataHoraAs(i.prog_iniciado_em)}` : "Aguardando o P&D iniciar"}</div>
        <div>Enviado ao P&D em {dataHoraAs(i.enviado_prog_em)}</div>
        {i.programador && <div>Programador: {i.programador}</div>}
        {pp > 0 && <div>{pp} pedido(s) em aberto</div>}
      </div>
    );
  }
  if (i.status === "validacao") {
    const devolucoes = (i.extras?.devolucoes as Array<{ em: string; motivo?: string }> | undefined) ?? [];
    const dv = devolucoes[devolucoes.length - 1];
    const idas = (i.retornos ?? []).length;
    return (
      <div className="muted tiny" style={{ lineHeight: 1.5 }}>
        {i.ultima_volta === "devolucao" && dv ? (
          <>
            <div>P&D devolveu em {dataHoraAs(dv.em)}</div>
            <b style={{ color: "var(--os-aviso)" }}>{(dv.motivo ?? "").slice(0, 70)}</b>
          </>
        ) : (
          <>
            <div>P&D concluiu em {dataHoraAs(i.prog_concluido_em)}</div>
            <b style={{ color: "var(--os-aviso)" }}>Testar e fazer a call</b>
          </>
        )}
        {idas > 0 && <div>{idas} ida(s) de volta ao P&D</div>}
      </div>
    );
  }
  return (
    <div className="muted tiny" style={{ lineHeight: 1.5 }}>
      <div>Concluída em {dataHoraAs(i.concluido_em)}</div>
      {i.suporte_responsavel && <div>Suporte: {i.suporte_responsavel}</div>}
    </div>
  );
}
