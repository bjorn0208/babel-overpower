/**
 * Tela de detalhe do atendimento — reaproveitada pelos 4 contextos: implementação, P&D, suporte e indicação.
 * Original: artefato `viewImplDetalhe` :2318-2444, `botoesAtend` :2445-2481, `painelProgramador` :2284-2317,
 * `painelMovimentos` :2262-2269, `wireImpl` :2794-2837 (campos que salvam sozinhos).
 *
 * Na ordem do artefato:
 *  1. "← Voltar para a lista" e cabeçalho: nome, datas por contexto, e-mail e telefone, conclusão; selo e
 *     botões de ação (`botoesAtend`).
 *  2. Painel do P&D (impl/prog, depois da primeira ida ao P&D): "Vindo da implementação" com o recado, pedidos em
 *     aberto e "Anotações gerais do programador" (lado P&D); ou "P&D" com início, motivo da devolução e o que
 *     foi entregue (lado implementação). Cada lado mostra o histórico do outro, só leitura.
 *  3. Movimentações entre implementação e P&D.
 *  4. Atendimento (responsável, data e horário de início editáveis, status) + tentativas de contato; Reuniões do
 *     atendimento, com "+ Agendar reunião" e as ações de cada reunião (✎/✕ inclusive).
 *  5. Diário de 15 dias; botões do rodapé; "Resultado da validação" / "Observação do suporte".
 *
 * Indicação (ctx "ind"): cabeçalho, "Dados da indicação", o painel de atendimento e os botões são da aba
 * Indicações (painel-indicacao.tsx, outro agente); aqui só entram tentativas, reuniões e diário.
 *
 * D-2: a área aparece como "P&D"; a pessoa continua "programador".
 */

import { useEffect, useRef, useState } from "react";
import { usePessoasSuporte } from "./pessoas-suporte";
import type React from "react";
import { useAcoesAtendimento, ModalConfirmar, type AcaoAtendimento, type PermissoesAcoes } from "./acoes-atendimento";
import { dataDeBR, horaValida, mascararData, mascararHora } from "./calculos";
import {
  CANAIS_TENTATIVA,
  CAMPOS_DIARIO,
  ROTULO_REUNIOES,
  agoraHM,
  atendimentoAtivo,
  chaveDadosDoContexto,
  comecouAtendimento,
  criarGravadorAtendimento,
  dataHoraAs,
  diaSemana,
  diarioDoContexto,
  diarioSomenteLeitura,
  extrasImplementacao,
  hojeBR,
  inicioDoContexto,
  isoParaBR,
  listaTentativas,
  movimentos,
  nomeDoRegistro,
  nomesContexto,
  pendenciasProg,
  quandoTentativa,
  registrarTentativa,
  removerTentativa,
  reunioesDoAtendimento,
  statusDetalhe,
  tabelaDoContexto,
  tomReuniao,
  type Contexto,
  type GravadorAtendimento,
  type RegistroAtendimento,
} from "./dados-atendimento";
import { atualizar, definirSuporteCliente, mensagemDeErro } from "./dados";
import { DiarioAtendimento, HistoricoOutroLado } from "./diario-atendimento";
import { LinhaAcoesReuniao } from "./linha-acoes-reuniao";
import { ModalReuniao, contextoDe, pessoasDaArea, type AreaReuniao } from "./modais-reuniao";
import { ordenarReunioes } from "./calculos";
import {
  dataBR,
  hojeLocal,
  podeEscrever,
  podeLer,
  ymd,
  type Dados,
  type ImplReuniao,
  type Implementacao,
  type Papel,
  type PropsAba,
  type Reuniao,
  type SuporteAtend,
  type Tentativa,
  type ToastApi,
  type TomSelo,
} from "./tipos";
import { BotaoAcao, Campo, Modal, Selo } from "./ui-gestao";
import { ChamadosDoCliente } from "./chamados-do-cliente";
import { DetalheChamado } from "./detalhe-chamado";
import { ModalNovoChamado } from "./modal-novo-chamado";
import { contagemDoCliente } from "./logica-chamados";

type Registro = RegistroAtendimento;

const CARD: React.CSSProperties = { padding: 18, marginBottom: 16 };

/** caixaTxt — artefato :2248: título + texto. Sem borda lateral colorida (DESIGN.md): o tom vai no selo. */
function CaixaTexto({ titulo, texto, tom }: { titulo: string; texto: string | null | undefined; tom: TomSelo }) {
  return (
    <div className="os-card" style={{ padding: "10px 14px", marginTop: 10 }}>
      <Selo tom={tom}>{titulo}</Selo>
      <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
        {texto ?? ""}
      </div>
    </div>
  );
}

/** Campo só de leitura no estilo `mini-form` do artefato (rótulo em cima, valor embaixo). */
function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="col gap-1" style={{ minWidth: 180, flex: 1 }}>
      <span className="label">{rotulo}</span>
      <div className="small" style={{ padding: "2px 0" }}>
        {children}
      </div>
    </div>
  );
}

const ROTULO_RESP: Record<Contexto, string> = {
  impl: "Responsável pela implementação",
  prog: "Programador responsável",
  sup: "Responsável no suporte",
  ind: "Responsável pelo atendimento",
};

/** Colunas de responsável e início por contexto (artefato CTX_ATEND :2181-2210). */
function colunasDoContexto(ctx: Contexto): { resp: string; inicio: string; hora: string } {
  if (ctx === "prog") return { resp: "programador", inicio: "prog_inicio", hora: "prog_inicio_hora" };
  return { resp: "responsavel", inicio: "inicio", hora: "inicio_hora" };
}

function valorColuna(r: Registro, coluna: string): string {
  const v = (r as unknown as Record<string, unknown>)[coluna];
  return typeof v === "string" ? v : "";
}

export function DetalheAtendimento({
  ctx,
  registro,
  dados,
  papeis,
  t,
  recarregar,
  onVoltar,
  meuNome = null,
}: {
  ctx: Contexto;
  registro: Registro;
  dados: Dados;
  papeis: Papel[];
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onVoltar: () => void;
  /** Quem está logado (assina o envio ao P&D, D-1). */
  meuNome?: string | null;
}) {
  // responsável do chamado e rodízio: app Equipe + quem tem Suporte em Acessos (revisão final I3)
  const pessoasSup = usePessoasSuporte(dados.config);
  // B7 (auditoria, rodada 2): um gravador só para esta tela aberta, compartilhado por diário, tentativas,
  // painel de atendimento, anotações do P&D e ações — todos escrevem no mesmo registro (e, no P&D, em `extras`).
  const gravadorRef = useRef<GravadorAtendimento<Registro> | null>(null);
  if (!gravadorRef.current) gravadorRef.current = criarGravadorAtendimento<Registro>(registro);
  const gravador = gravadorRef.current;
  useEffect(() => {
    gravador.sincronizar(registro);
  }, [registro, gravador]);

  const acoes = useAcoesAtendimento({ dados, papeis, t, recarregar, meuNome, aoSair: onVoltar, gravador });

  // Chamados do cliente no acompanhamento de 15 dias (spec 7b): só no contexto "sup" e para quem lê chamados.
  const [verChamados, setVerChamados] = useState(false);
  const [abrirNovo, setAbrirNovo] = useState(false);
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);
  const sa = ctx === "sup" ? (registro as SuporteAtend) : null;
  const mostraChamados = !!sa?.cliente_id && podeLer(papeis, "chamados");
  const podeAbrirChamado = papeis.includes("admin") || papeis.includes("suporte");
  const cont = mostraChamados && sa?.cliente_id ? contagemDoCliente(dados.chamados, sa.cliente_id) : null;
  // Ficha do cliente também na Implementação e no P&D (25/09): só com cliente_id; na indicação não (o indicado ainda não é cliente).
  const clienteFicha = ctx === "ind" ? null : (registro as Implementacao | SuporteAtend).cliente_id ?? null;
  const fichaForaDoSup = ctx !== "sup" && !!clienteFicha;

  const pode = podeEscrever(papeis, chaveDadosDoContexto(ctx));
  const nome = nomeDoRegistro(ctx, registro, dados.clientes);
  const { rotulo: statusRotulo, tom: statusTom } = statusDetalhe(ctx, registro);
  const iniciado = comecouAtendimento(ctx, registro);
  const ativo = atendimentoAtivo(ctx, registro);
  const somenteLeitura = diarioSomenteLeitura(ctx, registro);
  const inicioIso = inicioDoContexto(ctx, registro);

  const im = ctx === "impl" || ctx === "prog" ? (registro as Implementacao) : null;
  const listaMovimentos = im ? movimentos(im) : [];
  const extras = im ? extrasImplementacao(im) : null;
  const status = (registro as Implementacao | SuporteAtend).status;
  const concluida = ctx !== "ind" && status === "concluida";
  const obsFinal = ctx === "ind" ? null : (registro as Implementacao | SuporteAtend).obs_final;

  return (
    <div>
      {ctx !== "ind" && (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onVoltar} style={{ marginBottom: 12 }}>
            ← Voltar para a lista
          </button>
          <Cabecalho ctx={ctx} registro={registro} dados={dados} nome={nome}>
            <Selo tom={statusTom}>{statusRotulo}</Selo>
            <BotoesAtend ctx={ctx} registro={registro} dados={dados} rodape={false} abrir={acoes.abrir} pode={acoes.pode} />
          </Cabecalho>
        </>
      )}

      {sa && mostraChamados && cont && (
        <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <span className="muted tiny">Chamados: {cont.abertos} em aberto · {cont.fechados} fechados</span>
          <BotaoAcao onClick={() => setVerChamados(true)}>Ver chamados</BotaoAcao>
          {podeAbrirChamado && <BotaoAcao onClick={() => setAbrirNovo(true)}>Abrir chamado</BotaoAcao>}
        </div>
      )}

      {fichaForaDoSup && (
        <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <BotaoAcao onClick={() => setVerChamados(true)}>Ficha do cliente</BotaoAcao>
        </div>
      )}

      {im && (extras?.implConcluidoEm || im.enviado_prog_em) && (
        <PainelProgramador ctx={ctx} im={im} gravador={gravador} pode={pode} t={t} recarregar={recarregar} />
      )}

      {im && listaMovimentos.length > 0 && (
        <div className="os-card" style={CARD}>
          <div className="row gap-2" style={{ alignItems: "baseline", marginBottom: 10 }}>
            <div className="h3">Movimentações entre implementação e P&D</div>
            <span className="muted tiny">{listaMovimentos.length} registro(s)</span>
          </div>
          <div className="col gap-2">
            {listaMovimentos.map((mv, i) => (
              <div key={i} className="row gap-2" style={{ alignItems: "flex-start" }}>
                <span className="muted tiny mono" style={{ minWidth: 150 }}>
                  {dataHoraAs(mv.em)}
                </span>
                <div>
                  <Selo tom={mv.tom}>{mv.titulo}</Selo>
                  {mv.texto && String(mv.texto).trim() && (
                    <div className="small" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {mv.texto}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row gap-3" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <PainelAtendimento
            ctx={ctx}
            registro={registro}
            gravador={gravador}
            dados={dados}
            papeis={papeis}
            pode={pode}
            somenteLeitura={somenteLeitura}
            iniciado={iniciado}
            status={{ rotulo: statusRotulo, tom: statusTom }}
            t={t}
            recarregar={recarregar}
          />
        </div>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <PainelReunioes ctx={ctx} registro={registro} dados={dados} papeis={papeis} nome={nome} t={t} recarregar={recarregar} />
        </div>
      </div>

      <DiarioAtendimento
        ctx={ctx}
        registro={registro}
        gravador={gravador}
        inicioIso={inicioIso}
        somenteLeitura={somenteLeitura || !pode}
        ativo={ativo}
        iniciado={iniciado}
        t={t}
        recarregar={recarregar}
      />

      {ctx !== "ind" && (
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
          <BotoesAtend ctx={ctx} registro={registro} dados={dados} rodape abrir={acoes.abrir} pode={acoes.pode} />
        </div>
      )}
      {concluida && (obsFinal ?? "").trim() && (
        <CaixaTexto titulo={ctx === "sup" ? "Observação do suporte" : "Resultado da validação"} texto={obsFinal} tom="ok" />
      )}

      {acoes.modais}

      {clienteFicha && verChamados && (
        <ChamadosDoCliente clienteId={clienteFicha} chamados={dados.chamados} papeis={papeis} t={t} onClose={() => setVerChamados(false)}
          onAbrir={(id) => { setVerChamados(false); setChamadoAberto(id); }} />
      )}
      {sa?.cliente_id && abrirNovo && (
        <ModalNovoChamado t={t} equipe={pessoasSup.equipe} responsavelPadrao={meuNome ?? ""} clienteFixo={{ id: sa.cliente_id, nome: sa.cliente_nome ?? "Cliente" }} atendId={sa.id}
          onClose={() => setAbrirNovo(false)} onCriado={async (id) => { setAbrirNovo(false); await recarregar(["chamados"]); setChamadoAberto(id); }} />
      )}
      {chamadoAberto && (() => {
        const c = dados.chamados.find((x) => x.id === chamadoAberto);
        return c ? <DetalheChamado chamado={c} papeis={papeis} t={t} equipe={pessoasSup.equipe} onFicha={() => { setChamadoAberto(null); setVerChamados(true); }} onClose={() => setChamadoAberto(null)} recarregar={() => recarregar(["chamados"])} /> : null;
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho — artefato :2326-2339
// ---------------------------------------------------------------------------

function Cabecalho({
  ctx,
  registro,
  dados,
  nome,
  children,
}: {
  ctx: Contexto;
  registro: Registro;
  dados: Dados;
  nome: string;
  children: React.ReactNode;
}) {
  const r = registro as Implementacao | SuporteAtend;
  const c = dados.clientes.find((x) => x.id === r.cliente_id) ?? null;
  const linhas: React.ReactNode[] = [];
  if (ctx === "sup") {
    linhas.push(
      <>
        Recebido no suporte em <b className="mono">{dataHoraAs(r.enviado_em)}</b>
      </>,
    );
  } else {
    const i = registro as Implementacao;
    if (ctx === "prog") {
      linhas.push(
        <>
          Recebido da implementação em{" "}
          <b className="mono">{dataHoraAs(i.enviado_prog_em || (extrasImplementacao(i).implConcluidoEm ?? null))}</b>
        </>,
      );
      linhas.push(
        <>
          Enviado para implementação em <b className="mono">{dataHoraAs(i.enviado_em)}</b>
        </>,
      );
    } else {
      linhas.push(
        <>
          Enviado para implementação em <b className="mono">{dataHoraAs(i.enviado_em)}</b>
        </>,
      );
      if (i.enviado_prog_em)
        linhas.push(
          <>
            Última ida ao P&D em <b className="mono">{dataHoraAs(i.enviado_prog_em)}</b>
          </>,
        );
    }
  }
  // Artefato :2336: e-mail e telefone do cliente vêm logo depois das datas.
  const contato = `${c?.email ? ` · ${c.email}` : ""}${c?.telefone ? ` · ${c.telefone}` : ""}`;
  const im = registro as Implementacao;
  return (
    <div
      className="row gap-3"
      style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}
    >
      <div>
        <div className="h2">{nome}</div>
        <div className="muted small" style={{ marginTop: 4, lineHeight: 1.6 }}>
          {linhas.map((l, k) => (
            <div key={k}>
              {l}
              {k === linhas.length - 1 ? contato : ""}
            </div>
          ))}
          {r.status === "concluida" && (
            <div>
              {ctx === "sup" ? "Atendimento concluído" : "Concluída"} em{" "}
              <b className="mono">{dataHoraAs(r.concluido_em)}</b>
              {ctx !== "sup" && im.suporte_responsavel ? ` · agora com ${im.suporte_responsavel} no suporte` : ""}
            </div>
          )}
        </div>
      </div>
      <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botões de ação — artefato `botoesAtend` :2445-2481 (cabeçalho e rodapé)
// ---------------------------------------------------------------------------

function Btn({
  children,
  onClick,
  primario,
  perigo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primario?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      className={primario ? "btn btn-primary btn-sm" : "btn btn-sm"}
      style={perigo ? { color: "var(--os-erro)" } : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function BotoesAtend({
  ctx,
  registro,
  dados,
  rodape,
  abrir,
  pode,
}: {
  ctx: Contexto;
  registro: Registro;
  dados: Dados;
  rodape: boolean;
  abrir: (a: AcaoAtendimento) => void;
  pode: PermissoesAcoes;
}) {
  if (ctx === "ind") return null;
  if (ctx === "sup") {
    const at = registro as SuporteAtend;
    const imDoAt = at.impl_id ? dados.implementacoes.find((i) => i.id === at.impl_id) : undefined;
    return (
      <>
        {pode.sup && at.status === "aguardando" && !rodape && (
          <Btn primario onClick={() => abrir({ tipo: "sup-iniciar", at })}>
            Iniciar atendimento
          </Btn>
        )}
        {pode.sup && at.status === "andamento" && (
          <Btn primario onClick={() => abrir({ tipo: "sup-concluir", at })}>
            Concluir atendimento
          </Btn>
        )}
        {pode.sup && at.status === "concluida" && !rodape && (
          <Btn onClick={() => abrir({ tipo: "sup-reabrir", at })}>Reabrir atendimento</Btn>
        )}
        {pode.supExcluir && !rodape && imDoAt && (
          <Btn perigo onClick={() => abrir({ tipo: "sup-excluir", im: imDoAt })}>
            Excluir
          </Btn>
        )}
      </>
    );
  }
  const im = registro as Implementacao;
  if (!pode.impl) {
    return ctx === "impl" && im.status === "programador" && !rodape ? <span className="muted tiny">Com o P&D</span> : null;
  }
  if (ctx === "prog") {
    if (im.status !== "programador") {
      if (rodape) return null;
      return (
        <>
          <span className="muted tiny">
            {im.status === "validacao"
              ? "Com a implementação (validação)"
              : im.status === "concluida"
                ? "Enviado ao suporte"
                : "Ainda com a implementação"}
          </span>
          {(im.status === "validacao" || im.status === "concluida") && (
            <Btn perigo onClick={() => abrir({ tipo: "prog-excluir-hist", im })}>
              Excluir
            </Btn>
          )}
        </>
      );
    }
    return (
      <>
        {!im.prog_iniciado_em && !rodape && (
          <Btn primario onClick={() => abrir({ tipo: "prog-iniciar", im })}>
            Iniciar atendimento
          </Btn>
        )}
        {im.prog_iniciado_em && (
          <Btn primario onClick={() => abrir({ tipo: "prog-concluir", im })}>
            Concluir parte do P&D
          </Btn>
        )}
        <Btn onClick={() => abrir({ tipo: "prog-devolver-impl", im })}>Retornar à implementação</Btn>
        {!rodape && (
          <Btn perigo onClick={() => abrir({ tipo: "prog-remover", im })}>
            Remover
          </Btn>
        )}
      </>
    );
  }
  return (
    <>
      {im.status === "aguardando" && !rodape && (
        <Btn primario onClick={() => abrir({ tipo: "impl-iniciar", im })}>
          Iniciar atendimento
        </Btn>
      )}
      {im.status === "andamento" && (
        <Btn primario onClick={() => abrir({ tipo: "impl-concluir", im })}>
          Concluir e enviar ao P&D
        </Btn>
      )}
      {im.status === "validacao" && (
        <>
          <Btn onClick={() => abrir({ tipo: "impl-retornar", im })}>Retornar ao P&D</Btn>
          <Btn primario onClick={() => abrir({ tipo: "impl-finalizar", im })}>
            Teste realizado, enviar ao suporte
          </Btn>
        </>
      )}
      {im.status === "programador" && !rodape && <span className="muted tiny">Com o P&D</span>}
      {im.status === "concluida" && !rodape && (
        <>
          <Btn onClick={() => abrir({ tipo: "impl-reabrir", im })}>Reabrir em validação</Btn>
          <Btn perigo onClick={() => abrir({ tipo: "impl-excluir-hist", im })}>
            Excluir
          </Btn>
        </>
      )}
      {im.status !== "concluida" && !rodape && (
        <Btn perigo onClick={() => abrir({ tipo: "impl-remover", im })}>
          Remover
        </Btn>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Painel do P&D — artefato `painelProgramador` :2284-2317
// ---------------------------------------------------------------------------

function PainelProgramador({
  ctx,
  im,
  gravador,
  pode,
  t,
  recarregar,
}: {
  ctx: Contexto;
  im: Implementacao;
  gravador: GravadorAtendimento<Registro>;
  pode: boolean;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const extras = extrasImplementacao(im);
  const notas = typeof extras.notasProg === "string" ? extras.notasProg : "";

  if (ctx === "prog") {
    const pend = pendenciasProg(diarioDoContexto("impl", im));
    const ult = (im.retornos ?? []).slice(-1)[0];
    return (
      <div className="os-card" style={CARD}>
        <div className="h3">Vindo da implementação</div>
        <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 10 }}>
          <Info rotulo="Responsável na implementação">{im.responsavel || "—"}</Info>
          <Info rotulo="Recebido da implementação">
            <span className="mono">{im.enviado_prog_em ? dataHoraAs(im.enviado_prog_em) : "—"}</span>
          </Info>
        </div>
        {ult ? (
          <CaixaTexto titulo={`Último retorno da implementação · ${dataHoraAs(ult.em)}`} texto={ult.motivo} tom="aviso" />
        ) : (
          (extras.obsParaProg ?? "").trim() && (
            <CaixaTexto titulo="Recado da implementação" texto={extras.obsParaProg} tom="aurora" />
          )
        )}
        <div className="h3" style={{ fontSize: 14, marginTop: 14 }}>
          Pedidos em aberto no diário da implementação
        </div>
        {pend.length === 0 ? (
          <p className="muted small" style={{ marginTop: 6 }}>
            Nenhum pedido sem data de resolução.
          </p>
        ) : (
          <div className="col gap-1" style={{ marginTop: 6 }}>
            {pend.map((p) => (
              <div key={p.dia} className="row gap-2" style={{ alignItems: "baseline" }}>
                <span className="muted tiny" style={{ minWidth: 150 }}>
                  Dia {p.dia} · pedido em {isoParaBR(p.data)}
                </span>
                <span className="small">{p.texto || "sem descrição"}</span>
              </div>
            ))}
          </div>
        )}
        <AnotacoesProg
          key={`${im.id}|${notas}`}
          im={im}
          notas={notas}
          gravador={gravador}
          somenteLeitura={im.status === "concluida" || !pode}
          t={t}
          recarregar={recarregar}
        />
        <HistoricoOutroLado
          titulo="Histórico da implementação"
          campos={CAMPOS_DIARIO.impl}
          diario={diarioDoContexto("impl", im)}
          inicioIso={im.inicio}
        />
      </div>
    );
  }

  const devolucao = (extras.devolucoes ?? []).slice(-1)[0];
  const entrega = (extras.entregas ?? []).slice(-1)[0];
  const entregou = entrega ? entrega.obs : extras.obsProgFinal;
  return (
    <div className="os-card" style={CARD}>
      <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <div className="h3">P&D</div>
        {im.status === "validacao" && im.prog_concluido_em && (
          <Selo tom="ok">Entregou em {dataHoraAs(im.prog_concluido_em)}</Selo>
        )}
      </div>
      <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 10 }}>
        <Info rotulo="Programador responsável">{im.programador || "não definido"}</Info>
        <Info rotulo="Início do P&D">
          <span className="mono">
            {im.prog_iniciado_em
              ? `${im.prog_inicio ? isoParaBR(im.prog_inicio) : ""}${im.prog_inicio_hora ? ` às ${im.prog_inicio_hora}` : ""}`
              : "ainda não iniciou"}
          </span>
        </Info>
      </div>
      {im.status === "validacao" && im.ultima_volta === "devolucao" && devolucao && (
        <CaixaTexto
          titulo={`Motivo da devolução · ${dataHoraAs(devolucao.em)}`}
          texto={devolucao.motivo}
          tom="aviso"
        />
      )}
      {im.status === "validacao" && im.ultima_volta !== "devolucao" && (entrega || extras.obsProgFinal) && (
        <CaixaTexto titulo="O que o P&D entregou" texto={entregou} tom="ok" />
      )}
      {notas.trim() && <CaixaTexto titulo="Anotações gerais do programador" texto={notas} tom="neutro" />}
      <HistoricoOutroLado
        titulo="Histórico do P&D"
        campos={CAMPOS_DIARIO.prog}
        diario={diarioDoContexto("prog", im)}
        inicioIso={im.prog_inicio}
      />
    </div>
  );
}

/** "Anotações gerais do programador" — artefato :2298-2300: salva sozinho ao sair do campo (`extras.notasProg`). */
function AnotacoesProg({
  im,
  notas,
  gravador,
  somenteLeitura,
  t,
  recarregar,
}: {
  im: Implementacao;
  notas: string;
  gravador: GravadorAtendimento<Registro>;
  somenteLeitura: boolean;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const [texto, setTexto] = useState(notas);
  const [salvo, setSalvo] = useState("");

  async function salvar() {
    const v = texto.trim();
    if (v === notas.trim()) return;
    try {
      await gravador.gravar((atual) =>
        atualizar("gestao_implementacoes", im.id, { extras: { ...(atual.extras ?? {}), notasProg: v } }),
      );
      setSalvo(`Salvo às ${agoraHM()}`);
      setTimeout(() => setSalvo(""), 4000);
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar as anotações. O texto continua aqui — tente de novo."));
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <Campo rotulo="Anotações gerais do programador">
        <textarea
          className="input"
          rows={3}
          value={texto}
          readOnly={somenteLeitura}
          placeholder="Observações técnicas que valem para todo o atendimento"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => void salvar()}
        />
      </Campo>
      {salvo && <p className="muted tiny">{salvo}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atendimento + tentativas — artefato :2346-2372 e `wireImpl` :2797-2813
// ---------------------------------------------------------------------------

function PainelAtendimento({
  ctx,
  registro,
  gravador,
  dados,
  papeis,
  pode,
  somenteLeitura,
  iniciado,
  status,
  t,
  recarregar,
}: {
  ctx: Contexto;
  registro: Registro;
  gravador: GravadorAtendimento<Registro>;
  dados: Dados;
  papeis: Papel[];
  pode: boolean;
  somenteLeitura: boolean;
  iniciado: boolean;
  status: { rotulo: string; tom: TomSelo };
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const col = colunasDoContexto(ctx);
  const resp = valorColuna(registro, col.resp);
  const [modalAberto, setModalAberto] = useState(false);
  const [excluir, setExcluir] = useState<string | null>(null);
  const [salvo, setSalvo] = useState("");
  const tentativas = [...listaTentativas(ctx, registro)].sort((a, b) => (a.quando < b.quando ? 1 : -1));
  const ro = somenteLeitura || !pode;

  async function gravarCampo(patch: Record<string, unknown>) {
    try {
      await gravador.gravar(() => atualizar(tabelaDoContexto(ctx), registro.id, patch));
      // Artefato :2807-2809: trocar o responsável do suporte grava também o suporte do cliente.
      // Pela função estreita (PERMISSOES-IGUAL-ARTEFATO.sql): o papel Suporte grava só essa coluna do cliente.
      const sa = registro as SuporteAtend;
      if (ctx === "sup" && typeof patch.responsavel === "string" && patch.responsavel && sa.cliente_id) {
        await definirSuporteCliente(sa.cliente_id, patch.responsavel);
      }
      setSalvo(`Salvo às ${agoraHM()}`);
      setTimeout(() => setSalvo(""), 4000);
      await recarregar([chaveDadosDoContexto(ctx)]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar."));
    }
  }

  const nomes = nomesContexto(ctx, dados);
  const opcoes = resp && !nomes.includes(resp) ? [...nomes, resp] : nomes;

  async function remover(id: string) {
    try {
      await gravador.gravar((atual) => removerTentativa(ctx, atual, id));
      await recarregar([chaveDadosDoContexto(ctx)]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui excluir a tentativa."));
    }
  }

  return (
    <div className="os-card" style={CARD}>
      {ctx !== "ind" && (
        <>
          <div className="h3">{ctx === "prog" ? "Atendimento do P&D" : "Atendimento"}</div>
          <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ flex: "1 1 200px" }}>
              <Campo rotulo={ROTULO_RESP[ctx]}>
                <select
                  className="input"
                  value={resp}
                  disabled={ro}
                  onChange={(e) => void gravarCampo({ [col.resp]: e.target.value || null })}
                >
                  <option value="">— escolher —</option>
                  {opcoes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <Campo rotulo="Status">
                <div style={{ padding: "6px 0" }}>
                  <Selo tom={status.tom}>{status.rotulo}</Selo>
                </div>
              </Campo>
            </div>
          </div>
          {iniciado ? (
            <CamposInicio
              key={`${registro.id}|${valorColuna(registro, col.inicio)}|${valorColuna(registro, col.hora)}`}
              inicio={valorColuna(registro, col.inicio)}
              hora={valorColuna(registro, col.hora)}
              somenteLeitura={ro}
              t={t}
              onSalvar={(campo, v) => void gravarCampo({ [campo === "inicio" ? col.inicio : col.hora]: v })}
            />
          ) : (
            <p className="muted small" style={{ marginTop: 8 }}>
              Atendimento ainda não iniciado.
            </p>
          )}
          {salvo && <p className="muted tiny">{salvo}</p>}
        </>
      )}

      <div
        className="row gap-2"
        style={{ alignItems: "center", justifyContent: "space-between", marginTop: ctx === "ind" ? 0 : 14 }}
      >
        <div className="h3" style={{ fontSize: 14 }}>
          Tentativas de contato sem sucesso
        </div>
        {pode && (
          <button type="button" className="btn btn-sm" onClick={() => setModalAberto(true)}>
            + Registrar tentativa
          </button>
        )}
      </div>
      {tentativas.length === 0 ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          Nenhuma tentativa registrada.
        </p>
      ) : (
        <div className="col gap-2" style={{ marginTop: 8 }}>
          {tentativas.map((tent) => (
            <div key={tent.id} className="row gap-2" style={{ alignItems: "flex-start" }}>
              <span className="muted tiny mono" style={{ minWidth: 150 }}>
                {dataHoraAs(tent.quando)}
              </span>
              <div style={{ flex: 1 }}>
                <div className="small">{tent.obs || "Sem retorno"}</div>
                <div className="muted tiny">
                  {tent.canal}
                  {tent.por ? ` · por ${tent.por}` : ""}
                </div>
              </div>
              {pode && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label="Excluir tentativa"
                  title="Excluir tentativa"
                  onClick={() => setExcluir(tent.id)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {excluir && (
        <ModalConfirmar
          titulo="Excluir tentativa"
          texto="Excluir esta tentativa de contato?"
          rotulo="Excluir"
          perigo
          onConfirmar={() => remover(excluir)}
          onClose={() => setExcluir(null)}
        />
      )}

      {modalAberto && (
        <ModalTentativa
          nomes={nomes}
          responsavel={resp}
          t={t}
          onClose={() => setModalAberto(false)}
          onSalvar={async (dadosTentativa) => {
            await gravador.gravar((atual) => registrarTentativa(ctx, atual, dadosTentativa));
            setModalAberto(false);
            await recarregar([chaveDadosDoContexto(ctx)]);
          }}
        />
      )}
    </div>
  );
}

/** Data e horário de início editáveis (artefato :2353-2357, validação :2800-2804). Salva ao sair do campo. */
function CamposInicio({
  inicio,
  hora,
  somenteLeitura,
  t,
  onSalvar,
}: {
  inicio: string;
  hora: string;
  somenteLeitura: boolean;
  t: ToastApi;
  onSalvar: (campo: "inicio" | "hora", valor: string | null) => void;
}) {
  const [data, setData] = useState(isoParaBR(inicio));
  const [hh, setHh] = useState(hora);

  function sairData() {
    const v = data.trim();
    if (v === isoParaBR(inicio)) return;
    if (v && !dataDeBR(v)) {
      t.error("Use o formato dd/mm/aaaa.");
      return;
    }
    onSalvar("inicio", v ? dataDeBR(v) : null);
  }
  function sairHora() {
    const v = hh.trim();
    if (v === hora) return;
    if (v && !horaValida(v)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      return;
    }
    onSalvar("hora", v || null);
  }

  return (
    <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 10 }}>
      <div style={{ flex: "1 1 200px" }}>
        <Campo rotulo="Data que iniciou o atendimento">
          <input
            className="input"
            inputMode="numeric"
            maxLength={10}
            placeholder="dd/mm/aaaa"
            value={data}
            readOnly={somenteLeitura}
            onChange={(e) => setData(mascararData(e.target.value))}
            onBlur={sairData}
          />
        </Campo>
      </div>
      <div style={{ flex: "1 1 160px" }}>
        <Campo rotulo="Horário (24h)">
          <input
            className="input"
            inputMode="numeric"
            maxLength={5}
            placeholder="hh:mm"
            value={hh}
            readOnly={somenteLeitura}
            onChange={(e) => setHh(mascararHora(e.target.value))}
            onBlur={sairHora}
          />
        </Campo>
      </div>
    </div>
  );
}

/** modalTentativa — artefato :2935-2963: data dd/mm/aaaa e horário 24h obrigatórios. */
function ModalTentativa({
  nomes,
  responsavel,
  t,
  onClose,
  onSalvar,
}: {
  nomes: string[];
  responsavel: string;
  t: ToastApi;
  onClose: () => void;
  onSalvar: (dados: Omit<Tentativa, "id">) => Promise<void>;
}) {
  const [data, setData] = useState(hojeBR());
  const [hora, setHora] = useState(agoraHM());
  const [canal, setCanal] = useState<string>(CANAIS_TENTATIVA[0]);
  const [por, setPor] = useState(responsavel);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const pessoas = responsavel && !nomes.includes(responsavel) ? [...nomes, responsavel] : nomes;

  async function salvar() {
    const dt = dataDeBR(data);
    if (!dt) {
      t.error("Informe a data no formato dd/mm/aaaa.");
      return;
    }
    const hm = hora.trim();
    if (!horaValida(hm)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      return;
    }
    setSalvando(true);
    try {
      await onSalvar({ quando: quandoTentativa(dt, hm), canal, por, obs: obs.trim() });
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui registrar a tentativa."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Tentativa de contato sem sucesso"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Registrar"}
          </button>
        </>
      }
    >
      <p className="muted small">Registre cada vez que o cliente não respondeu.</p>
      <div className="row gap-3" style={{ flexWrap: "wrap" }}>
        <Campo rotulo="Data">
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
      <Campo rotulo="Canal">
        <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
          {CANAIS_TENTATIVA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Quem tentou">
        <select className="input" value={por} onChange={(e) => setPor(e.target.value)}>
          <option value="">—</option>
          {pessoas.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Observação">
        <textarea
          className="input"
          rows={4}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: mensagem visualizada e sem resposta; ligação caiu na caixa postal."
        />
      </Campo>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reuniões do atendimento — artefato :2374-2407 (+ "+ Agendar reunião" :2380 e :3191-3198)
// ---------------------------------------------------------------------------

function areaDoContexto(ctx: Contexto): AreaReuniao {
  if (ctx === "sup") return "cliente";
  return ctx;
}

function PainelReunioes({
  ctx,
  registro,
  dados,
  papeis,
  nome,
  t,
  recarregar,
}: {
  ctx: Contexto;
  registro: Registro;
  dados: Dados;
  papeis: Papel[];
  nome: string;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<ImplReuniao | Reuniao | null>(null);
  const area = areaDoContexto(ctx);
  const cr = contextoDe(area);
  const tabela = ctx === "sup" ? "gestao_reunioes" : "gestao_impl_reunioes";
  // PENDÊNCIA DE BANCO (indicação): o papel Comercial não lê nem grava `gestao_impl_reunioes`.
  const podeReu = podeEscrever(papeis, ctx === "sup" ? "reunioes" : "implReunioes");
  const reunioes = reunioesDoAtendimento(ctx, registro.id, dados).sort(ordenarReunioes).reverse();
  const h0 = ymd(hojeLocal());

  const r = registro as Implementacao & SuporteAtend;
  const clienteId = ctx === "ind" ? null : r.cliente_id;
  const respPadrao =
    ctx === "prog" ? (registro as Implementacao).programador : (registro as { responsavel?: string | null }).responsavel ?? null;

  return (
    <div className="os-card" style={CARD}>
      <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="h3">{ROTULO_REUNIOES[ctx]}</div>
        {podeReu && (
          <button type="button" className="btn btn-sm" onClick={() => setNova(true)}>
            + Agendar reunião
          </button>
        )}
      </div>
      {reunioes.length === 0 ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          Nenhuma reunião agendada.
        </p>
      ) : (
        <div className="col gap-2" style={{ marginTop: 10 }}>
          {reunioes.map((reu) => {
            const st = reu.status || "Agendada";
            const atrasada = st === "Agendada" && (reu.data ?? "") < h0;
            return (
              <div
                key={reu.id}
                className="row gap-3"
                style={{ padding: "10px 0", borderTop: "1px solid var(--os-vidro-borda)", alignItems: "flex-start", flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 86 }}>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {reu.data ? dataBR(reu.data) : "sem data"}
                  </div>
                  <div className="muted tiny">{reu.hora || "--:--"}</div>
                  <div className="muted tiny">{diaSemana(reu.data)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    <span className="small" style={{ fontWeight: 600 }}>
                      {reu.tipo || "Reunião"}
                    </span>
                    <Selo tom={tomReuniao(st)}>{st}</Selo>
                  </div>
                  <div className="muted tiny" style={{ marginTop: 2 }}>
                    responsável: {reu.responsavel || "não definido"}
                  </div>
                  {st === "Concluída" && (reu.resumo ?? "").trim() && (
                    <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      <b>Como foi</b> {reu.resumo}
                    </div>
                  )}
                  {st === "Concluída" && !(reu.resumo ?? "").trim() && (
                    <p className="small" style={{ marginTop: 6, color: "var(--os-aviso)" }}>
                      Falta o relato desta reunião.
                    </p>
                  )}
                  {(st === "Cancelada" || st === "Remarcada") && (reu.motivo ?? "").trim() && (
                    <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      <b>Motivo</b> {reu.motivo}
                    </div>
                  )}
                  {atrasada && (
                    <p className="small" style={{ marginTop: 6, color: "var(--os-aviso)" }}>
                      Data já passou e a reunião segue como agendada.
                    </p>
                  )}
                  {podeReu && (
                    <div style={{ marginTop: 8 }}>
                      <LinhaAcoesReuniao
                        reuniao={reu}
                        nomeCliente={nome}
                        t={t}
                        recarregar={recarregar}
                        tabela={tabela}
                        pessoas={pessoasDaArea(dados, ctx === "sup" ? "cliente" : ((reu as ImplReuniao).area as AreaReuniao) || area)}
                        tipos={cr.tipos}
                        tipoPadrao={cr.tipoPadrao}
                        onEditar={() => setEditando(reu)}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(nova || editando) && (
        <ModalReuniao
          area={area}
          reuniao={editando ?? undefined}
          implId={ctx === "sup" ? null : registro.id}
          clienteIdFixo={clienteId}
          nomeFixo={nome}
          atendId={ctx === "sup" ? registro.id : null}
          responsavelPadrao={respPadrao}
          tipoInicial={ctx === "sup" ? "Onboarding" : undefined}
          dados={dados}
          t={t}
          recarregar={recarregar}
          onClose={() => {
            setNova(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}
