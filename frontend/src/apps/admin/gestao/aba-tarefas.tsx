/**
 * Aba Tarefas do time — artefato `viewTarefas` e sub-visões (financeiro.html:3420-3966, citado `art.:linha`).
 * Lote 5 do plano PLANO-APP-IGUAL-AO-ARTEFATO.md (2026-09-24): quadro, semana, reuniões da equipe, por
 * pessoa, pendências da operação, 5 indicadores do topo, bloqueio com motivo, exclusão, cliente na tarefa,
 * filtro inicial na própria pessoa. Relatório: app-gestao/PROGRESSO-LOTE-TAREFAS-2026-09-24.md.
 *
 * Contas puras em logica-tarefas.ts (testáveis). Modais em modais-tarefas.tsx.
 *
 * Decisões acima do artefato:
 *  - "Programador" aparece como "P&D" (pedido D-2 do Diego; AREAS_TAREFA de tipos.ts).
 *  - Excluir = soft delete (`apagar` de dados.ts, marca `deleted_at`).
 *  - Aviso de sucesso só depois de o banco confirmar (dados.ts `confirma`).
 *  - Identidade da babel: sem faixa lateral colorida (DESIGN.md). A prioridade e o tipo de evento da
 *    Semana viram PONTO/SELO (classes dot/badge de bundle.css), sempre com o nome ao lado.
 *  - Permissões pela RLS real (plano-integracao/MIGRACAO-RASCUNHO.sql:788-800): tarefa só
 *    implementação/suporte/admin gravam; reunião da equipe e ata só admin. O artefato deixa todo papel
 *    com a aba criar (art.:3239-3243). Aqui o que o banco recusaria fica desabilitado, com a nota.
 *
 * Quadro: colunas kanban-col/kanban-card de bundle.css:381-399.
 */

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pendenciaJaTemTarefa, pendenciasOperacao, type Pendencia } from "./logica-atendimento";
import { inicioDaSemana, tarefaAberta, tarefasSemResponsavel } from "./calculos";
import { apagar, atualizar, lerTabela, mensagemDeErro } from "./dados";
import {
  cargaDoTime,
  destinoPendencia,
  diaSemanaDe,
  filtrarPendencias,
  iniciaisTf,
  kpisTarefas,
  moverPedeMotivo,
  nomeClienteTf,
  ordenarTarefasTf,
  patchStatusTarefa,
  pessoasTime,
  podeAbrirPendencia,
  presetDaPendencia,
  presetNovaTarefa,
  responsavelInicialTf,
  reuEquipeVencida,
  reunioesEquipeDaVisao,
  rotuloPrazoTf,
  rotuloSemana,
  semanaDoTime,
  statusReuEquipe,
  statusVizinho,
  tarefaPassaFiltro,
  tomEncaminhamento,
  tomStatusReuEquipe,
  DIAS_SEMANA_TF,
  type AlvoEvento,
  type FiltroReuEquipe,
  type PresetTarefa,
} from "./logica-tarefas";
import {
  AREAS_TAREFA,
  PRIORIDADES,
  STATUS_TAREFA,
  abasPermitidas,
  dataBR,
  hojeLocal,
  podeEscrever,
  ymd,
  type Aba,
  type Acesso,
  type PrioridadeTarefa,
  type PropsAba,
  type ReuniaoEquipe,
  type StatusTarefa,
  type Tarefa,
} from "./tipos";
import { ModalAtaTime, ModalConfirmar, ModalReuEquipeTime, ModalTarefa, ModalTexto } from "./modais-tarefas";
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
  usarArrastarParaRolar,
} from "./ui-gestao";

/** Quantas pendências aparecem antes do "Mostrar mais" (art.:3610). */
const LIMITE_PENDENCIAS = 6;

/** art.:3425 TF_JANELA_CONCL: dias que uma concluída continua visível no quadro. */
const JANELA_CONCLUIDA_DIAS = 14;

/** Cores da legenda da Semana (art.:3691-3693), só com tokens da babel. */
const COR_EVENTO: Record<string, string> = {
  equipe: "var(--os-acento-2)",
  impl: "var(--os-acento-1)",
  prog: "var(--os-aviso)",
  sup: "var(--os-sucesso)",
  com: "var(--txt-3)",
  tarefa: "var(--os-erro)",
};
const ROTULO_EVENTO: Record<string, string> = {
  equipe: "Equipe",
  impl: "Implementação",
  prog: "P&D",
  sup: "Suporte",
  com: "Comercial",
  tarefa: "Prazo de tarefa",
};

const VISOES: Array<[string, string]> = [
  ["quadro", "Quadro"],
  ["semana", "Semana"],
  ["reunioes", "Reuniões da equipe"],
  ["pessoas", "Por pessoa"],
];

const FILTROS_REU: Array<[FiltroReuEquipe, string]> = [
  ["proximas", "Agendadas"],
  ["realizadas", "Realizadas"],
  ["todas", "Todas"],
];

/** dot-err/dot-warn/dot-off de bundle.css:206-210. */
const DOT_PRIORIDADE: Record<PrioridadeTarefa, string> = { alta: "dot-err", media: "dot-warn", baixa: "dot-off" };

const rotuloArea = (a: string | null) => AREAS_TAREFA.find(([k]) => k === (a || "geral"))?.[1] ?? a ?? "";
const rotuloStatus = (s: string | null) => STATUS_TAREFA.find(([k]) => k === s)?.[1] ?? s ?? "";

const NOTA_SEM_TAREFA =
  "Seu papel só consulta: criar, mover e excluir tarefa é da implementação, do suporte e do admin.";
const NOTA_SEM_REUNIAO = "Só o admin marca, edita, cancela e registra a ata das reuniões da equipe.";

/** Troca de aba da gestão pelo mesmo evento que o dock usa (os/dock/aba-alvo.ts, `useAbaAlvo` em Gestao.tsx). */
function irParaAba(aba: Aba) {
  window.dispatchEvent(new CustomEvent("ragentic:ir-para-aba", { detail: { slug: "gestao", aba } }));
}

const resetBotao: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
};

/** Avatar de iniciais (art.:336-338): fundo roxo-soft e letra roxa = --os-acento-2-soft / --os-acento-2-brilho
 *  (bundle.css:10 e :15); sem responsável = tracejado neutro (--os-vidro-borda-forte, :25). */
const avatarEstilo: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  fontWeight: 600,
  flexShrink: 0,
  background: "var(--os-acento-2-soft)",
  color: "var(--os-acento-2-brilho)",
};
const avatarVazioEstilo: React.CSSProperties = {
  ...avatarEstilo,
  background: "var(--os-vidro)",
  color: "var(--txt-3)",
  border: "1px dashed var(--os-vidro-borda-forte)",
};

function Avatar({ nome }: { nome: string | null | undefined }) {
  return (
    <span aria-hidden title={nome || "Sem responsável"} style={nome ? avatarEstilo : avatarVazioEstilo}>
      {nome ? iniciaisTf(nome) : "?"}
    </span>
  );
}

type ModalTarefaEstado = { tarefa: Tarefa | null; preset: PresetTarefa | null };

export function AbaTarefas({ dados, papeis, t, recarregar, uid }: PropsAba) {
  const ehAdmin = papeis.includes("admin");
  const abas = useMemo(() => abasPermitidas(papeis), [papeis]);
  const podeTarefa = podeEscrever(papeis, "tarefas");
  const podeReu = podeEscrever(papeis, "reunioesEquipe");
  const hoje = useMemo(() => hojeLocal(), []);

  const [visao, setVisao] = useState("quadro");
  // arrastar com o mouse para rolar o quadro (colunas, na horizontal) e a semana (7 dias, na horizontal)
  const arrastarQuadro = usarArrastarParaRolar();
  const arrastarSemana = usarArrastarParaRolar();
  const [responsavel, setResponsavelBruto] = useState("todos");
  const [area, setArea] = useState("todas");
  const [busca, setBusca] = useState("");
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [filtroReu, setFiltroReu] = useState<FiltroReuEquipe>("proximas");
  const [verTodasPend, setVerTodasPend] = useState(false);

  const [modalTarefa, setModalTarefa] = useState<ModalTarefaEstado | null>(null);
  const [bloqueando, setBloqueando] = useState<Tarefa | null>(null);
  const [excluindo, setExcluindo] = useState<Tarefa | null>(null);
  const [reuEquipeAberta, setReuEquipeAberta] = useState<ReuniaoEquipe | "nova" | null>(null);
  const [ataAberta, setAtaAberta] = useState<ReuniaoEquipe | null>(null);
  const [cancelandoReu, setCancelandoReu] = useState<ReuniaoEquipe | null>(null);
  const [excluindoReu, setExcluindoReu] = useState<ReuniaoEquipe | null>(null);

  // Filtro inicial na própria pessoa (art.:4377): quem não é admin abre filtrado em `gestao_acessos.pessoa`.
  // A RLS deixa cada um ler a própria linha (acessos_le, MIGRACAO-RASCUNHO.sql:815). Se a pessoa já mexeu
  // no filtro antes de a leitura voltar, a escolha dela vale.
  const mexeu = useRef(false);
  const setResponsavel = (v: string) => {
    mexeu.current = true;
    setResponsavelBruto(v);
  };
  useEffect(() => {
    if (ehAdmin || !uid) return;
    let vivo = true;
    lerTabela<Acesso>("gestao_acessos", "criado_em")
      .then((linhas) => {
        const inicial = responsavelInicialTf(false, linhas.find((a) => a.id === uid)?.pessoa);
        if (vivo && !mexeu.current && inicial !== "todos") setResponsavelBruto(inicial);
      })
      .catch(() => {
        /* sem a linha, fica "Todo o time" — como o artefato quando não há pessoa ligada */
      });
    return () => {
      vivo = false;
    };
  }, [ehAdmin, uid]);

  const pessoas = useMemo(() => pessoasTime(dados), [dados]);
  const opcoesPessoa = responsavel !== "todos" && responsavel !== "sem" && !pessoas.includes(responsavel)
    ? [...pessoas, responsavel]
    : pessoas;

  const pendencias = useMemo(() => pendenciasOperacao(dados, hoje), [dados, hoje]);
  const kpis = useMemo(() => kpisTarefas(dados, hoje, pendencias), [dados, hoje, pendencias]);
  const pendVisiveis = useMemo(
    () => filtrarPendencias(pendencias, abas, responsavel, area),
    [pendencias, abas, responsavel, area],
  );
  const pendSemTarefa = pendVisiveis.filter((x) => !pendenciaJaTemTarefa(dados, x.chave)).length;

  const filtradas = useMemo(
    () => dados.tarefas.filter((tr) => tarefaPassaFiltro(tr, { responsavel, area, busca }, dados)),
    [dados, responsavel, area, busca],
  );

  const inicioSem = useMemo(() => inicioDaSemana(hoje, semanaOffset), [hoje, semanaOffset]);
  const semana = useMemo(
    () => semanaDoTime(dados, inicioSem, responsavel === "sem" ? "todos" : responsavel),
    [dados, inicioSem, responsavel],
  );
  const cargas = useMemo(() => cargaDoTime(dados, hoje, pessoas), [dados, hoje, pessoas]);
  const cargaMaxima = Math.max(1, ...cargas.map((c) => c.carga));
  const semDono = useMemo(() => tarefasSemResponsavel(dados), [dados]);

  // ---- ações -------------------------------------------------------------------------------------

  const novaTarefa = () => setModalTarefa({ tarefa: null, preset: presetNovaTarefa(responsavel, area) });

  /** art.:3799: a pendência abre a tela "Nova tarefa" já preenchida; só grava ao clicar "Criar tarefa". */
  const tarefaDaPendencia = (p: Pendencia) =>
    setModalTarefa({ tarefa: null, preset: presetDaPendencia(p, dados, hojeLocal()) });

  const abrirPendencia = (p: Pendencia) => {
    const d = destinoPendencia(p, dados);
    if (!d) return;
    if (d.tipo === "ata") {
      const r = dados.reunioesEquipe.find((x) => x.id === d.reuniaoId);
      if (r && podeReu) setAtaAberta(r);
      else {
        setVisao("reunioes");
        setFiltroReu("todas");
      }
      return;
    }
    irParaAba(d.aba);
  };

  async function gravarStatus(tr: Tarefa, novo: StatusTarefa, motivo?: string) {
    try {
      await atualizar("gestao_tarefas", tr.id, patchStatusTarefa(novo, new Date().toISOString(), motivo));
      if (novo === "concluida") t.success("Tarefa concluída.");
      await recarregar(["tarefas"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui mover a tarefa."));
      throw e;
    }
  }

  const mover = (tr: Tarefa, dir: -1 | 1) => {
    const novo = statusVizinho(tr, dir);
    if (moverPedeMotivo(novo)) {
      setBloqueando(tr);
      return;
    }
    void gravarStatus(tr, novo).catch(() => {});
  };

  const abrirEvento = (alvo: AlvoEvento) => {
    if (alvo.tipo === "tarefa") {
      const tr = dados.tarefas.find((x) => x.id === alvo.id);
      if (tr) setModalTarefa({ tarefa: tr, preset: null });
    } else if (alvo.tipo === "reuEquipe") {
      const r = dados.reunioesEquipe.find((x) => x.id === alvo.id);
      if (r && podeReu) setReuEquipeAberta(r);
      else {
        setVisao("reunioes");
        setFiltroReu("todas");
      }
    } else if (abas.includes(alvo.aba)) irParaAba(alvo.aba);
  };

  const eventoClicavel = (alvo: AlvoEvento) => alvo.tipo !== "aba" || abas.includes(alvo.aba);

  const reagendar = async (r: ReuniaoEquipe) => {
    try {
      await atualizar("gestao_reunioes_equipe", r.id, { status: "Agendada", motivo: null });
      t.success("Reunião voltou para agendada.");
      await recarregar(["reunioesEquipe"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui reagendar a reunião."));
    }
  };

  // ---- tela --------------------------------------------------------------------------------------

  const mostraFiltroPessoa = visao === "quadro" || visao === "semana";

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Tarefas do time"
        subtitulo="O que cada pessoa precisa fazer na implementação, no suporte e nas reuniões da equipe."
        acoes={
          <div className="row gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!podeReu}
              title={podeReu ? undefined : NOTA_SEM_REUNIAO}
              onClick={() => setReuEquipeAberta("nova")}
            >
              + Reunião da equipe
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!podeTarefa}
              title={podeTarefa ? undefined : NOTA_SEM_TAREFA}
              onClick={novaTarefa}
            >
              + Nova tarefa
            </button>
          </div>
        }
      />
      {!podeTarefa && (
        <p className="muted small" style={{ margin: "-8px 0 12px" }}>
          {NOTA_SEM_TAREFA}
        </p>
      )}

      {/* Os 5 indicadores do topo — art.:3569-3576 */}
      <LinhaKpis>
        <Kpi
          rotulo="Tarefas em aberto"
          valor={String(kpis.abertas)}
          sub={kpis.bloqueadas ? `${kpis.bloqueadas} bloqueada${kpis.bloqueadas > 1 ? "s" : ""}` : "nenhuma bloqueada"}
          destaque
        />
        <Kpi
          rotulo="Atrasadas"
          valor={String(kpis.atrasadas)}
          cor={kpis.atrasadas ? "var(--os-erro)" : undefined}
          sub={kpis.atrasadas ? "prazo já passou" : "tudo dentro do prazo"}
        />
        <Kpi rotulo="Vencem em 7 dias" valor={String(kpis.vencem7)} sub={`até ${dataBR(kpis.ate)}`} />
        <Kpi
          rotulo="Pendências da operação"
          valor={String(kpis.pendenciasAbertas)}
          sub={kpis.pendenciasAbertas ? "geradas pela implementação e reuniões" : "nada pendente"}
        />
        <Kpi
          rotulo="Próxima reunião da equipe"
          valor={
            kpis.proximaEquipe
              ? `${dataBR(kpis.proximaEquipe.data).slice(0, 5)}${kpis.proximaEquipe.hora ? ` ${kpis.proximaEquipe.hora}` : ""}`
              : "—"
          }
          sub={kpis.proximaEquipe ? kpis.proximaEquipe.titulo || kpis.proximaEquipe.tipo || "" : "nenhuma agendada"}
        />
      </LinhaKpis>

      <div className="os-card row gap-3" style={{ padding: "14px 16px", marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmentado opcoes={VISOES} valor={visao} onChange={setVisao} />
        {/* filtros da direita num grupo: quebram juntos, alinhados à direita (antes a busca caía sozinha à esquerda) */}
        <div className="row gap-2" style={{ marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {mostraFiltroPessoa && (
            <select
              className="input"
              style={{ width: 170 }}
              value={visao === "semana" && responsavel === "sem" ? "todos" : responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              aria-label="Filtrar por pessoa"
            >
              <option value="todos">Todo o time</option>
              {visao === "quadro" && <option value="sem">Sem responsável</option>}
              {opcoesPessoa.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
          {visao === "quadro" && (
            <>
              <select
                className="input"
                style={{ width: 180 }}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                aria-label="Filtrar por área"
              >
                <option value="todas">Todas as áreas</option>
                {AREAS_TAREFA.map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ width: 220 }}
                placeholder="Buscar tarefa ou cliente"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar tarefa ou cliente"
              />
            </>
          )}
        </div>
      </div>

      {visao === "quadro" && (
        <>
          {/* Pendências da operação — art.:3601-3628. Só no Quadro, filtradas pelo papel, pela pessoa e pela área. */}
          {pendVisiveis.length > 0 && (
            <details className="os-card" open={pendSemTarefa > 0} style={{ padding: "12px 16px", marginBottom: 16 }}>
              <summary style={{ cursor: "pointer" }}>
                <b>Pendências da operação</b>{" "}
                <span className="muted small">
                  {pendSemTarefa} sem tarefa · geradas pela implementação, P&D e reuniões
                </span>
              </summary>
              <div style={{ marginTop: 10 }}>
                {(verTodasPend ? pendVisiveis : pendVisiveis.slice(0, LIMITE_PENDENCIAS)).map((x) => {
                  const tarefa = pendenciaJaTemTarefa(dados, x.chave);
                  const destino = destinoPendencia(x, dados);
                  return (
                    <div
                      key={x.chave}
                      className="row gap-3"
                      style={{ padding: "8px 0", borderTop: "1px solid var(--os-vidro-borda)", alignItems: "center", flexWrap: "wrap" }}
                    >
                      {/* coluna fixa do selo: sem ela, cada título começava num x diferente (largura do selo) */}
                      <span style={{ width: 112, flexShrink: 0 }}>
                        <Selo tom="neutro">{rotuloArea(x.area)}</Selo>
                      </span>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontWeight: 600 }}>{x.titulo}</div>
                        <div className="muted small">
                          {x.cliente} · {x.detalhe}
                        </div>
                      </div>
                      <span className="row gap-2" style={{ alignItems: "center", minWidth: 140 }}>
                        <Avatar nome={x.responsavel} />
                        <span className="muted small">{x.responsavel || "sem responsável"}</span>
                      </span>
                      <span className="row gap-2" style={{ alignItems: "center" }}>
                        {podeAbrirPendencia(x, destino, abas) && (
                          <BotaoAcao onClick={() => abrirPendencia(x)}>Abrir</BotaoAcao>
                        )}
                        {tarefa ? (
                          <span className="small" style={{ color: "var(--os-sucesso)", fontWeight: 600 }}>
                            Tarefa: {rotuloStatus(tarefa.status)}
                          </span>
                        ) : (
                          podeTarefa && <BotaoAcao onClick={() => tarefaDaPendencia(x)}>+ Tarefa</BotaoAcao>
                        )}
                      </span>
                    </div>
                  );
                })}
                {pendVisiveis.length > LIMITE_PENDENCIAS && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() => setVerTodasPend((v) => !v)}
                  >
                    {verTodasPend ? "Mostrar menos" : `Mostrar mais ${pendVisiveis.length - LIMITE_PENDENCIAS}`}
                  </button>
                )}
              </div>
            </details>
          )}

          {dados.tarefas.length === 0 ? (
            <Vazio
              icone="clipboard"
              titulo="Nenhuma tarefa ainda"
              mensagem="Crie a primeira com “+ Nova tarefa”, transforme uma pendência da operação em tarefa ou registre os encaminhamentos de uma reunião da equipe."
            />
          ) : (
            <div ref={arrastarQuadro} className="row gap-3" style={{ overflowX: "auto", alignItems: "flex-start", paddingBottom: 8 }}>
              {STATUS_TAREFA.map(([st, rotulo], idx) => {
                let col = filtradas.filter((tr) => (tr.status || "afazer") === st);
                let ocultas = 0;
                if (st === "concluida") {
                  col = [...col].sort((a, b) => (b.concluido_em || "").localeCompare(a.concluido_em || ""));
                  const limite = new Date(hoje.getTime() - JANELA_CONCLUIDA_DIAS * 86_400_000).toISOString();
                  const recentes = col.filter((tr) => (tr.concluido_em || "") >= limite);
                  ocultas = col.length - recentes.length;
                  col = recentes;
                } else {
                  col = [...col].sort(ordenarTarefasTf);
                }
                return (
                  <section key={st} className="kanban-col" style={{ flexShrink: 0 }} aria-label={rotulo}>
                    <div className="kanban-col-head">
                      <span className="h3" style={{ fontSize: 13 }}>
                        {rotulo}
                      </span>
                      <span className="muted tiny">{col.length}</span>
                    </div>
                    <div className="col gap-2" style={{ padding: 10, overflowY: "auto" }}>
                      {col.length === 0 && (
                        <div className="muted tiny">
                          {st === "concluida" ? `Nada concluído nos últimos ${JANELA_CONCLUIDA_DIAS} dias.` : "Nenhuma tarefa."}
                        </div>
                      )}
                      {col.map((tr) => (
                        <CartaoTarefa
                          key={tr.id}
                          tr={tr}
                          idx={idx}
                          hoje={hoje}
                          cliente={nomeClienteTf(dados, tr.cliente_id)}
                          reuniao={tr.reuniao_id ? dados.reunioesEquipe.find((r) => r.id === tr.reuniao_id) ?? null : null}
                          pode={podeTarefa}
                          abrir={() => setModalTarefa({ tarefa: tr, preset: null })}
                          mover={(dir) => mover(tr, dir)}
                        />
                      ))}
                      {ocultas > 0 && (
                        <div className="muted tiny">
                          + {ocultas} concluída{ocultas > 1 ? "s" : ""} há mais de {JANELA_CONCLUIDA_DIAS} dias.
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {visao === "semana" && (
        /* Semana — art.:3667-3707. Sete dias começando na segunda; cada compromisso abre a sua tela. */
        <>
          <div className="os-card row gap-3" style={{ padding: "10px 16px", marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <BotaoAcao titulo="Semana anterior" onClick={() => setSemanaOffset((n) => n - 1)}>
              ◀ Anterior
            </BotaoAcao>
            <b style={{ minWidth: 150, textAlign: "center" }}>{rotuloSemana(inicioSem)}</b>
            {semanaOffset !== 0 && <BotaoAcao onClick={() => setSemanaOffset(0)}>Esta semana</BotaoAcao>}
            <BotaoAcao titulo="Próxima semana" onClick={() => setSemanaOffset((n) => n + 1)}>
              Próxima ▶
            </BotaoAcao>
            <div className="flex-1" />
            <div className="row gap-3 muted small" style={{ flexWrap: "wrap" }}>
              {Object.entries(COR_EVENTO).map(([k, cor]) => (
                <span key={k} className="row gap-1" style={{ alignItems: "center" }}>
                  <span aria-hidden className="dot" style={{ background: cor }} />
                  {ROTULO_EVENTO[k]}
                </span>
              ))}
            </div>
          </div>
          <div ref={arrastarSemana} className="row gap-2" style={{ alignItems: "stretch", overflowX: "auto" }}>
            {semana.map((eventos, i) => {
              const d = new Date(inicioSem.getFullYear(), inicioSem.getMonth(), inicioSem.getDate() + i);
              const chave = ymd(d);
              const ehHoje = chave === ymd(hoje);
              const fds = d.getDay() === 0 || d.getDay() === 6;
              return (
                <section
                  key={chave}
                  className="os-card"
                  aria-label={`${DIAS_SEMANA_TF[d.getDay()]} ${dataBR(chave)}`}
                  style={{ flex: "1 0 150px", padding: 10, opacity: fds ? 0.75 : 1, outline: ehHoje ? "1px solid var(--os-acento-1)" : undefined }}
                >
                  <h4 className="small" style={{ margin: "0 0 8px" }}>
                    {DIAS_SEMANA_TF[d.getDay()].slice(0, 3)} <b>{dataBR(chave).slice(0, 5)}</b>
                    {ehHoje && (
                      <>
                        {" "}
                        <Selo tom="info">hoje</Selo>
                      </>
                    )}
                  </h4>
                  {eventos.length === 0 ? (
                    <span className="muted small">Livre</span>
                  ) : (
                    eventos.map((e, j) => {
                      const clicavel = eventoClicavel(e.alvo);
                      const corpo = (
                        <>
                          <span className="row gap-1" style={{ alignItems: "center" }}>
                            <span aria-hidden className="dot" style={{ background: COR_EVENTO[e.tipo], flexShrink: 0 }} />
                            {e.hora && <span className="mono small">{e.hora}</span>}
                            <span className="muted tiny">{ROTULO_EVENTO[e.tipo]}</span>
                          </span>
                          <span
                            className="small"
                            style={{ display: "block", fontWeight: 600, textDecoration: e.feito ? "line-through" : undefined }}
                          >
                            {e.titulo}
                          </span>
                          <span className="muted small" style={{ display: "block" }}>
                            {e.quem}
                          </span>
                        </>
                      );
                      const estilo: React.CSSProperties = {
                        display: "block",
                        width: "100%",
                        padding: "4px 6px",
                        marginBottom: 6,
                        borderRadius: 8,
                        opacity: e.feito ? 0.6 : 1,
                      };
                      return clicavel ? (
                        <button key={j} type="button" style={{ ...resetBotao, ...estilo }} onClick={() => abrirEvento(e.alvo)}>
                          {corpo}
                        </button>
                      ) : (
                        <div key={j} style={estilo}>
                          {corpo}
                        </div>
                      );
                    })
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {visao === "reunioes" && (
        /* Reuniões da equipe — art.:3709-3754 */
        <>
          <div className="os-card row gap-3" style={{ padding: "10px 16px", marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Segmentado opcoes={FILTROS_REU} valor={filtroReu} onChange={setFiltroReu} />
            <span className="muted small flex-1" style={{ textAlign: "right" }}>
              Encaminhamentos registrados na ata viram tarefas no quadro.
              {!podeReu ? ` ${NOTA_SEM_REUNIAO}` : ""}
            </span>
          </div>
          <ListaReunioes
            lista={reunioesEquipeDaVisao(dados.reunioesEquipe, filtroReu)}
            filtro={filtroReu}
            tarefas={dados.tarefas}
            hoje={hoje}
            podeReu={podeReu}
            abrirTarefa={(tr) => setModalTarefa({ tarefa: tr, preset: null })}
            ata={(r) => setAtaAberta(r)}
            cancelar={(r) => setCancelandoReu(r)}
            reagendar={(r) => void reagendar(r)}
            editar={(r) => setReuEquipeAberta(r)}
            excluir={(r) => setExcluindoReu(r)}
          />
        </>
      )}

      {visao === "pessoas" && (
        /* Por pessoa — art.:3756-3783, sobre o time inteiro (funcionários, suporte e vendedores internos). */
        cargas.length === 0 ? (
          <Vazio
            icone="clipboard"
            titulo="Nenhuma pessoa cadastrada"
            mensagem="Cadastre funcionários na aba Implementação, a equipe de suporte na aba Suporte e os vendedores internos em Vendas."
          />
        ) : (
          <>
            {semDono > 0 && (
              // faixa amarela, como a .banner do artefato (art.:3770)
              <Faixa tom="aviso">
                <b>
                  {semDono} tarefa{semDono > 1 ? "s" : ""} sem responsável.
                </b>{" "}
                Abra o quadro e filtre por “Sem responsável”.
              </Faixa>
            )}
            <CartaoTabela>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th style={{ textAlign: "right" }}>Tarefas abertas</th>
                  <th style={{ textAlign: "right" }}>Atrasadas</th>
                  <th style={{ textAlign: "right" }}>Vencem em 7 dias</th>
                  <th style={{ textAlign: "right" }}>Bloqueadas</th>
                  <th style={{ textAlign: "right" }}>Implementações</th>
                  <th style={{ textAlign: "right" }}>Reuniões em 7 dias</th>
                  <th>Carga</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cargas.map((l) => {
                  const pct = Math.round((l.carga / cargaMaxima) * 100);
                  return (
                    <tr key={l.nome}>
                      <td>
                        <span className="row gap-2" style={{ alignItems: "center" }}>
                          <Avatar nome={l.nome} />
                          {l.nome}
                        </span>
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {l.tarefas}
                      </td>
                      <td
                        className="mono small"
                        style={{ textAlign: "right", ...(l.atrasadas ? { color: "var(--os-erro)", fontWeight: 600 } : {}) }}
                      >
                        {l.atrasadas}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {l.vencemEm7}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {l.bloqueadas}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {l.implementacoes}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {l.reunioesEm7}
                      </td>
                      <td title={`${l.carga} itens em aberto`}>
                        {/* .progress da babel (bundle.css:2218-2219, degradê do acento); carga alta em erro (art.:382-384) */}
                        <div className="progress" style={{ width: 90 }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              ...(pct >= 80 && l.carga >= 6 ? { background: "var(--os-erro)" } : null),
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <BotaoAcao
                          onClick={() => {
                            setVisao("quadro");
                            setResponsavel(l.nome);
                            setArea("todas");
                            setBusca("");
                          }}
                        >
                          Ver tarefas
                        </BotaoAcao>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </CartaoTabela>
          </>
        )
      )}

      {/* ---- modais ---------------------------------------------------------------------------- */}

      {modalTarefa && (
        <ModalTarefa
          tarefa={modalTarefa.tarefa}
          preset={modalTarefa.preset}
          dados={dados}
          podeEditar={podeTarefa}
          t={t}
          onClose={() => setModalTarefa(null)}
          aoSalvar={() => {
            setModalTarefa(null);
            void recarregar(["tarefas"]);
          }}
          aoPedirExclusao={(tr) => {
            setModalTarefa(null);
            setExcluindo(tr);
          }}
        />
      )}

      {bloqueando && (
        <ModalTexto
          titulo="O que está bloqueando?"
          nota={bloqueando.titulo}
          rotuloCampo="Motivo do bloqueio"
          inicial={bloqueando.bloqueio}
          placeholder="Ex.: aguardando o cliente enviar o acesso ao WhatsApp Business."
          rotuloOk="Marcar como bloqueada"
          obrigatorio
          mensagemFalta="Diga o que está bloqueando a tarefa."
          onClose={() => setBloqueando(null)}
          aoConfirmar={async (motivo) => {
            await gravarStatus(bloqueando, "bloqueada", motivo).then(
              () => setBloqueando(null),
              () => {},
            );
          }}
        />
      )}

      {excluindo && (
        <ModalConfirmar
          titulo="Excluir tarefa"
          mensagem={`Excluir “${excluindo.titulo || "esta tarefa"}”? Não dá para desfazer.`}
          rotulo="Excluir"
          perigo
          onClose={() => setExcluindo(null)}
          aoConfirmar={async () => {
            try {
              await apagar("gestao_tarefas", excluindo.id);
              t.success("Tarefa excluída.");
              setExcluindo(null);
              await recarregar(["tarefas"]);
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui excluir a tarefa."));
            }
          }}
        />
      )}

      {reuEquipeAberta && (
        <ModalReuEquipeTime
          reuniao={reuEquipeAberta === "nova" ? undefined : reuEquipeAberta}
          dados={dados}
          t={t}
          recarregar={recarregar}
          onClose={() => setReuEquipeAberta(null)}
        />
      )}

      {ataAberta && (
        <ModalAtaTime reuniao={ataAberta} dados={dados} t={t} recarregar={recarregar} onClose={() => setAtaAberta(null)} />
      )}

      {cancelandoReu && (
        <ModalTexto
          titulo="Cancelar reunião da equipe"
          nota={`${cancelandoReu.titulo || cancelandoReu.tipo || ""} · ${dataBR(cancelandoReu.data)}`}
          rotuloCampo="Motivo do cancelamento"
          inicial={cancelandoReu.motivo}
          placeholder="Ex.: metade do time em treinamento com cliente."
          rotuloOk="Cancelar reunião"
          onClose={() => setCancelandoReu(null)}
          aoConfirmar={async (motivo) => {
            try {
              await atualizar("gestao_reunioes_equipe", cancelandoReu.id, { status: "Cancelada", motivo: motivo || null });
              t.success("Reunião cancelada.");
              setCancelandoReu(null);
              await recarregar(["reunioesEquipe"]);
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui cancelar a reunião."));
            }
          }}
        />
      )}

      {excluindoReu && (
        <ModalConfirmar
          titulo="Excluir reunião da equipe"
          mensagem={(() => {
            const n = dados.tarefas.filter((x) => x.reuniao_id === excluindoReu.id).length;
            return (
              `Excluir “${excluindoReu.titulo || excluindoReu.tipo || "reunião"}” de ${dataBR(excluindoReu.data)}?` +
              (n ? ` As ${n} tarefa(s) criadas a partir dela continuam no quadro.` : "")
            );
          })()}
          rotulo="Excluir"
          perigo
          onClose={() => setExcluindoReu(null)}
          aoConfirmar={async () => {
            try {
              await apagar("gestao_reunioes_equipe", excluindoReu.id);
              t.success("Reunião excluída.");
              setExcluindoReu(null);
              await recarregar(["reunioesEquipe"]);
            } catch (e) {
              t.error(mensagemDeErro(e, "Não consegui excluir a reunião."));
            }
          }}
        />
      )}
    </AbaCasca>
  );
}

// ---------------------------------------------------------------------------
// Cartão da tarefa — art.:3650-3665 `tfCard`
// ---------------------------------------------------------------------------

function CartaoTarefa({
  tr,
  idx,
  hoje,
  cliente,
  reuniao,
  pode,
  abrir,
  mover,
}: {
  tr: Tarefa;
  idx: number;
  hoje: Date;
  cliente: string | null;
  reuniao: ReuniaoEquipe | null;
  pode: boolean;
  abrir: () => void;
  mover: (dir: -1 | 1) => void;
}) {
  const st = tr.status || "afazer";
  const prazo = rotuloPrazoTf(tr, hoje);
  const prioridade = tr.prioridade ?? "media";
  const altaAberta = prioridade === "alta" && tarefaAberta(tr);
  return (
    <article className="kanban-card col gap-2" style={st === "concluida" ? { opacity: 0.7 } : undefined}>
      <button
        type="button"
        // concluída: esmaecida e riscada, como .tcard.feita (art.:326-327)
        style={{ ...resetBotao, fontWeight: 600, textDecoration: st === "concluida" ? "line-through" : undefined }}
        onClick={abrir}
      >
        {tr.titulo || "Sem título"}
      </button>
      <div className="row gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <Selo tom="neutro">{rotuloArea(tr.area)}</Selo>
        {cliente && <span className="tiny muted">{cliente}</span>}
        {prazo.texto && <Selo tom={prazo.tom}>{prazo.texto}</Selo>}
        {altaAberta ? (
          <Selo tom="erro">Prioridade alta</Selo>
        ) : (
          <span className="row gap-1 tiny muted" style={{ alignItems: "center" }} title="Prioridade">
            <span aria-hidden className={`dot ${DOT_PRIORIDADE[prioridade]}`} />
            {PRIORIDADES.find(([k]) => k === prioridade)?.[1]}
          </span>
        )}
      </div>
      {st === "bloqueada" && (tr.bloqueio ?? "").trim() && (
        <div className="tiny" style={{ color: "var(--os-erro)" }}>
          Bloqueio: {tr.bloqueio}
        </div>
      )}
      {reuniao && (
        <div className="tiny muted">
          Da reunião {reuniao.titulo || reuniao.tipo || ""} · {dataBR(reuniao.data)}
        </div>
      )}
      <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="row gap-2" style={{ alignItems: "center", minWidth: 0 }}>
          <Avatar nome={tr.responsavel} />
          <span className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {tr.responsavel || "sem responsável"}
          </span>
        </span>
        {pode && (
          <span className="row gap-1">
            {idx > 0 && (
              <BotaoAcao titulo={`Voltar para ${STATUS_TAREFA[idx - 1][1]}`} onClick={() => mover(-1)}>
                ◀
              </BotaoAcao>
            )}
            {idx < STATUS_TAREFA.length - 1 && (
              <BotaoAcao titulo={`Avançar para ${STATUS_TAREFA[idx + 1][1]}`} onClick={() => mover(1)}>
                ▶
              </BotaoAcao>
            )}
          </span>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Lista de reuniões da equipe — art.:3709-3754 (cartão completo e ações)
// ---------------------------------------------------------------------------

function ListaReunioes({
  lista,
  filtro,
  tarefas,
  hoje,
  podeReu,
  abrirTarefa,
  ata,
  cancelar,
  reagendar,
  editar,
  excluir,
}: {
  lista: ReuniaoEquipe[];
  filtro: FiltroReuEquipe;
  tarefas: Tarefa[];
  hoje: Date;
  podeReu: boolean;
  abrirTarefa: (t: Tarefa) => void;
  ata: (r: ReuniaoEquipe) => void;
  cancelar: (r: ReuniaoEquipe) => void;
  reagendar: (r: ReuniaoEquipe) => void;
  editar: (r: ReuniaoEquipe) => void;
  excluir: (r: ReuniaoEquipe) => void;
}) {
  if (lista.length === 0)
    return (
      <Vazio
        icone="clipboard"
        titulo={filtro === "proximas" ? "Nenhuma reunião da equipe agendada" : "Nenhuma reunião aqui"}
        mensagem="Use “+ Reunião da equipe” para marcar a daily, a semanal de implementação ou um alinhamento."
      />
    );
  return (
    <div className="col gap-3">
      {lista.map((r) => {
        const st = statusReuEquipe(r);
        const encs = tarefas.filter((x) => x.reuniao_id === r.id);
        const vencida = reuEquipeVencida(r, hoje);
        const meta = [r.titulo && r.tipo && r.tipo !== r.titulo ? r.tipo : "", r.duracao ? `${r.duracao} min` : ""]
          .filter(Boolean)
          .join(" · ");
        return (
          <article key={r.id} className="os-card row gap-3" style={{ padding: "14px 16px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="col" style={{ minWidth: 90 }}>
              <b className="small">{r.data ? dataBR(r.data) : "sem data"}</b>
              <span className="mono small">{r.hora || "--:--"}</span>
              <span className="muted tiny">{diaSemanaDe(r.data)}</span>
            </div>
            <div className="col gap-2" style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 600 }}>{r.titulo || r.tipo || "Reunião da equipe"}</div>
              {meta && <div className="muted small">{meta}</div>}
              {(r.participantes ?? []).length > 0 && (
                <div className="row gap-1" style={{ flexWrap: "wrap" }}>
                  {(r.participantes ?? []).map((p) => (
                    <Selo key={p} tom="neutro">
                      {p}
                    </Selo>
                  ))}
                </div>
              )}
              {(r.pauta ?? "").trim() && (
                <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                  <b>Pauta</b> {r.pauta}
                </div>
              )}
              {(r.ata ?? "").trim() && (
                <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                  <b>Ata</b> {r.ata}
                </div>
              )}
              {st === "Concluída" && !(r.ata ?? "").trim() && (
                <p className="small" style={{ margin: 0, color: "var(--os-aviso)" }}>
                  Falta registrar a ata desta reunião.
                </p>
              )}
              {vencida && (
                <p className="small" style={{ margin: 0, color: "var(--os-aviso)" }}>
                  A data já passou e a reunião segue como agendada.
                </p>
              )}
              {st === "Cancelada" && (r.motivo ?? "").trim() && (
                <div className="small">
                  <b>Motivo</b> {r.motivo}
                </div>
              )}
              {encs.length > 0 && (
                <div className="small">
                  <b>Encaminhamentos</b>
                  <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
                    {encs.map((x) => (
                      <li key={x.id} className="row gap-2" style={{ alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                        <Selo tom={tomEncaminhamento(x, hoje)}>{rotuloStatus(x.status)}</Selo>
                        <button type="button" style={{ ...resetBotao, fontSize: 12.5 }} onClick={() => abrirTarefa(x)}>
                          {x.titulo}
                        </button>
                        <span className="muted tiny">
                          {x.responsavel || "sem responsável"}
                          {x.prazo ? ` · até ${dataBR(x.prazo)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Selo tom={tomStatusReuEquipe(st)}>{st}</Selo>
              {podeReu && (
                <>
                  {st === "Agendada" && (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => ata(r)}>
                        Concluir e registrar ata
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelar(r)}>
                        Cancelar
                      </button>
                    </>
                  )}
                  {st === "Concluída" && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => ata(r)}>
                      {(r.ata ?? "").trim() ? "Editar ata" : "Registrar ata"}
                    </button>
                  )}
                  {st === "Cancelada" && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => reagendar(r)}>
                      Reagendar
                    </button>
                  )}
                  <BotaoAcao titulo="Editar reunião" onClick={() => editar(r)}>
                    ✎
                  </BotaoAcao>
                  <BotaoAcao titulo="Excluir reunião" perigo onClick={() => excluir(r)}>
                    ✕
                  </BotaoAcao>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
