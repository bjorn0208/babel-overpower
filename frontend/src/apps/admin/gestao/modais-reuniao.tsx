/**
 * Os três modais de reunião que o artefato tem e o app não tinha (levantamento de 2026-09-22,
 * `plano-integracao/DIFF-ARTEFATO-X-APP.md`). Até aqui o app só sabia MEXER em reunião que já existia
 * (`linha-acoes-reuniao.tsx`: relato, cancelar, remarcar) — não sabia CRIAR nenhuma.
 *
 *  - `ModalReuniao`      — artefato `modalReuniao` :4118. Serve às duas coleções, como no original:
 *                          `gestao_impl_reunioes` (implementação, programação e indicado) e
 *                          `gestao_reunioes` (cliente/suporte). O contexto vem de `ctxReu` :4107.
 *  - `ModalReuEquipe`    — artefato `modalReuEquipe` :3888. Reunião interna do time, com participantes.
 *  - `ModalAta`          — artefato `modalAta` :3923. Fecha a reunião e **cada encaminhamento vira uma
 *                          tarefa** ligada à reunião (`gestao_tarefas.reuniao_id`).
 *
 * O banco já tinha as três tabelas e o app já as carregava (`dados.ts:137-143`): aqui não há migração,
 * só tela. Responsável continua OPCIONAL no envio, como no artefato (:4131-4132 usa "— escolher —") e
 * como o Diego pediu.
 */

import { useMemo, useState } from "react";
import { atualizar, inserir, mensagemDeErro } from "./dados";
import { equipeSuporte } from "./calculos";
import {
  STATUS_REUNIAO,
  STATUS_REUNIAO_EQUIPE,
  TIPOS_IMPL_REUNIAO,
  TIPOS_IND_REUNIAO,
  TIPOS_REUNIAO,
  TIPOS_REUNIAO_EQUIPE,
  dataBR,
  hojeLocal,
  ymd,
  type Dados,
  type ImplReuniao,
  type PropsAba,
  type Reuniao,
  type ReuniaoEquipe,
  type ToastApi,
} from "./tipos";
import { nomesContexto } from "./logica-atendimento";
import { Campo, Modal } from "./ui-gestao";

// ---------------------------------------------------------------------------
// Contexto: as duas coleções e as três áreas, como `ctxReu` (:4107) + os desvios de :4120-4123
// ---------------------------------------------------------------------------

/** Onde a reunião mora e de quem ela é. */
export type AreaReuniao = "impl" | "prog" | "ind" | "cliente";

export interface ContextoReuniao {
  tabela: string;
  chave: "implReunioes" | "reunioes";
  rotuloResp: string;
  tipos: readonly string[];
  tipoPadrao: string;
  nota: string;
}

export function contextoDe(area: AreaReuniao): ContextoReuniao {
  if (area === "cliente") {
    return {
      tabela: "gestao_reunioes",
      chave: "reunioes",
      rotuloResp: "Responsável pelo suporte",
      tipos: TIPOS_REUNIAO,
      tipoPadrao: "Acompanhamento",
      nota: "Agende o alinhamento com o cliente. O relato do que foi abordado é preenchido ao concluir.",
    };
  }
  if (area === "prog") {
    return {
      tabela: "gestao_impl_reunioes",
      chave: "implReunioes",
      rotuloResp: "Programador responsável",
      tipos: TIPOS_IMPL_REUNIAO,
      tipoPadrao: "Kickoff",
      // Artefato :4120: a reunião do P&D usa a nota da implementação (só troca quem é o responsável).
      nota: "Agende a reunião de implementação. O relato é preenchido ao concluir.",
    };
  }
  if (area === "ind") {
    return {
      tabela: "gestao_impl_reunioes",
      chave: "implReunioes",
      rotuloResp: "Responsável pelo atendimento",
      tipos: TIPOS_IND_REUNIAO,
      tipoPadrao: "Primeiro contato",
      nota: "Agende a conversa com o indicado. O relato é preenchido ao concluir.",
    };
  }
  return {
    tabela: "gestao_impl_reunioes",
    chave: "implReunioes",
    rotuloResp: "Responsável pela implementação",
    tipos: TIPOS_IMPL_REUNIAO,
    tipoPadrao: "Kickoff",
    nota: "Agende a reunião de implementação. O relato é preenchido ao concluir.",
  };
}

/** Quem pode ser responsável, por área (artefato `nomesFuncionarios` :1941 e `nomesComercial` :2199). */
export function pessoasDaArea(dados: Dados, area: AreaReuniao): string[] {
  // Reunião de suporte com o cliente: artefato `ctxReu` → `equipe()` :566-571 — a equipe de suporte cadastrada
  // ou, se não houver, os nomes de suporte que já estão nos clientes.
  if (area === "cliente") {
    const eq = equipeSuporte(dados.config);
    if (eq.length > 0) return eq;
    const nomes = dados.clientes.map((c) => (c.suporte ?? "").trim()).filter(Boolean);
    return [...new Set(nomes)].sort();
  }
  // Indicado: artefato :4122 usa `nomesComercial` (vendedores internos ativos; sem eles, todos os ativos).
  if (area === "ind") return nomesContexto("ind", dados);
  const areaFunc = area === "prog" ? "programador" : "implementacao";
  const nomes = dados.funcionarios
    .filter((f) => f.ativo !== false && (f.area ?? "implementacao") === areaFunc)
    .map((f) => f.nome);
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Todo o time, para participantes da reunião de equipe (artefato `pessoasTime`). */
function pessoasDoTime(dados: Dados): string[] {
  const nomes = dados.funcionarios.filter((f) => f.ativo !== false).map((f) => f.nome);
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Nova / editar reunião — artefato :4118
// ---------------------------------------------------------------------------

export function ModalReuniao({
  area,
  reuniao,
  implId,
  clienteIdFixo,
  nomeFixo,
  atendId,
  responsavelPadrao,
  tipoInicial,
  dados,
  t,
  recarregar,
  onClose,
}: {
  area: AreaReuniao;
  /** Sem reunião = criar. Com reunião = editar (aí aparece o campo Status, como no artefato :4135). */
  reuniao?: ImplReuniao | Reuniao;
  /** Implementação/indicação dona da reunião, quando a área não é "cliente". */
  implId?: string | null;
  /** Quando a tela já sabe de quem é a reunião, o cliente não se escolhe (artefato :4127). */
  clienteIdFixo?: string | null;
  nomeFixo?: string;
  /** Reunião de alinhamento ligada ao atendimento de suporte (artefato :3196 e :4152, `atendId`). */
  atendId?: string | null;
  /** Preset do artefato ao agendar pelo detalhe (:3196-3198): o responsável do atendimento. */
  responsavelPadrao?: string | null;
  /** Preset do tipo (suporte: "Onboarding", artefato :3196). */
  tipoInicial?: string;
  dados: Dados;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
}) {
  const ctx = contextoDe(area);
  const novo = !reuniao;
  const pessoasBase = useMemo(() => pessoasDaArea(dados, area), [dados, area]);

  const clientesOrdenados = useMemo(
    () => dados.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.clientes],
  );
  // Artefato `optsCli` (:4094): sem opção vazia — sem cliente definido, vem o primeiro da lista.
  const [clienteId, setClienteId] = useState(
    reuniao?.cliente_id ?? clienteIdFixo ?? (area === "cliente" ? clientesOrdenados[0]?.id ?? "" : ""),
  );
  const [data, setData] = useState(reuniao?.data ?? ymd(hojeLocal()));
  const [hora, setHora] = useState(reuniao?.hora ?? "");
  const [responsavel, setResponsavel] = useState(reuniao?.responsavel ?? responsavelPadrao ?? "");
  const [tipo, setTipo] = useState(reuniao?.tipo ?? tipoInicial ?? ctx.tipoPadrao);
  // Quem já está na reunião (ou veio de preset) continua na lista, mesmo fora do cadastro.
  const pessoas = responsavel && !pessoasBase.includes(responsavel) ? [...pessoasBase, responsavel] : pessoasBase;
  const [status, setStatus] = useState(reuniao?.status ?? "Agendada");
  const [resumo, setResumo] = useState(reuniao?.resumo ?? "");
  const [salvando, setSalvando] = useState(false);

  const escolheCliente = !clienteIdFixo && area === "cliente";

  async function salvar() {
    // Mesmas duas exigências do artefato (:4143-4144) — e responsável NÃO é uma delas.
    if (escolheCliente && !clienteId) {
      t.error("Escolha o cliente.");
      return;
    }
    if (!data) {
      t.error("Informe o dia da reunião.");
      return;
    }
    setSalvando(true);
    try {
      const campos: Record<string, unknown> = {
        cliente_id: clienteId || clienteIdFixo || null,
        data,
        hora: hora || null,
        responsavel: responsavel || null,
        tipo,
        status: novo ? "Agendada" : status,
        resumo: resumo.trim() || null,
      };
      if (ctx.chave === "implReunioes") {
        campos.impl_id = implId ?? (reuniao as ImplReuniao | undefined)?.impl_id ?? null;
        campos.area = area === "cliente" ? "impl" : area;
      }
      if (ctx.chave === "reunioes") {
        const vinculo = atendId ?? (reuniao as Reuniao | undefined)?.atend_id ?? null;
        if (vinculo) campos.atend_id = vinculo;
      }
      if (novo) await inserir(ctx.tabela, campos);
      else await atualizar(ctx.tabela, reuniao.id, campos);
      t.success(novo ? "Reunião agendada." : "Reunião salva.");
      onClose();
      await recarregar([ctx.chave]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a reunião."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Nova reunião" : "Editar reunião"}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void salvar()}>
            Salvar
          </button>
        </>
      }
    >
      <p className="muted small">{ctx.nota}</p>

      {escolheCliente ? (
        <Campo rotulo="Cliente">
          <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            {clientesOrdenados.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
      ) : nomeFixo ? (
        <Campo rotulo={area === "ind" ? "Indicado" : "Cliente"}>
          <div className="small" style={{ fontWeight: 600, padding: "6px 0" }}>
            {nomeFixo}
          </div>
        </Campo>
      ) : null}

      <Campo rotulo="Dia">
        <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Campo rotulo="Horário">
        <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </Campo>

      <Campo rotulo={ctx.rotuloResp}>
        <select className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
          {/* Opcional de propósito: sem responsável, a reunião fica na fila do setor. */}
          <option value="">— escolher —</option>
          {pessoas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {pessoas.length === 0 && (
          <span className="muted small">
            Ninguém cadastrado nesta área ainda — dá para agendar assim mesmo e definir depois.
          </span>
        )}
      </Campo>

      <Campo rotulo="Tipo de reunião">
        <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {ctx.tipos.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Campo>

      {!novo && (
        <Campo rotulo="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_REUNIAO.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="Como foi a reunião · o que foi abordado">
        <textarea
          className="input"
          rows={3}
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          placeholder="Preencha ao concluir a reunião."
        />
      </Campo>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Nova / editar reunião da EQUIPE — artefato :3888
// ---------------------------------------------------------------------------

export function ModalReuEquipe({
  reuniao,
  dados,
  t,
  recarregar,
  onClose,
}: {
  reuniao?: ReuniaoEquipe;
  dados: Dados;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
}) {
  const novo = !reuniao;
  // Quem já está na reunião entra na lista mesmo se saiu do cadastro (artefato :3891).
  const pessoas = useMemo(() => {
    const base = pessoasDoTime(dados);
    for (const p of reuniao?.participantes ?? []) if (!base.includes(p)) base.push(p);
    return base;
  }, [dados, reuniao]);

  const [titulo, setTitulo] = useState(reuniao?.titulo ?? "");
  const [tipo, setTipo] = useState(reuniao?.tipo ?? "Semanal de implementação");
  const [duracao, setDuracao] = useState(reuniao?.duracao ?? "");
  const [data, setData] = useState(reuniao?.data ?? ymd(hojeLocal()));
  const [hora, setHora] = useState(reuniao?.hora ?? "");
  const [status, setStatus] = useState<string>(reuniao?.status ?? "Agendada");
  const [participantes, setParticipantes] = useState<string[]>(reuniao?.participantes ?? []);
  const [pauta, setPauta] = useState(reuniao?.pauta ?? "");
  const [salvando, setSalvando] = useState(false);

  const alternar = (p: string) =>
    setParticipantes((atual) => (atual.includes(p) ? atual.filter((x) => x !== p) : [...atual, p]));

  async function salvar() {
    if (!data) {
      t.error("Informe o dia da reunião.");
      return;
    }
    setSalvando(true);
    try {
      const campos: Record<string, unknown> = {
        // Sem título, vale o tipo — como no artefato (:3916).
        titulo: titulo.trim() || tipo,
        tipo,
        data,
        hora: hora || null,
        duracao: duracao || null,
        pauta: pauta.trim() || null,
        participantes,
        status: novo ? "Agendada" : status,
      };
      if (novo) await inserir("gestao_reunioes_equipe", campos);
      else await atualizar("gestao_reunioes_equipe", reuniao.id, campos);
      t.success(novo ? "Reunião da equipe agendada." : "Reunião salva.");
      onClose();
      await recarregar(["reunioesEquipe"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a reunião da equipe."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Nova reunião da equipe" : "Editar reunião da equipe"}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void salvar()}>
            Salvar
          </button>
        </>
      }
    >
      <p className="muted small">
        Reunião interna do time. Ao concluir, registre a ata e os encaminhamentos, que viram tarefas.
      </p>

      <Campo rotulo="Título">
        <input
          className="input"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Sem título, vale o tipo da reunião."
        />
      </Campo>
      <Campo rotulo="Tipo">
        <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_REUNIAO_EQUIPE.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Duração (min)">
        <input className="input" type="number" min={0} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
      </Campo>
      <Campo rotulo="Dia">
        <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Campo rotulo="Horário">
        <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </Campo>

      {!novo && (
        <Campo rotulo="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_REUNIAO_EQUIPE.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="Participantes">
        {pessoas.length === 0 ? (
          <span className="muted small">
            Ninguém cadastrado ainda — cadastre funcionários na aba Implementação ou a equipe na aba Suporte.
          </span>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {pessoas.map((p) => (
                <label key={p} className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={participantes.includes(p)} onChange={() => alternar(p)} />
                  {p}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 6, alignSelf: "flex-start" }}
              onClick={() => setParticipantes(pessoas)}
            >
              Marcar todo o time
            </button>
          </>
        )}
      </Campo>

      <Campo rotulo="Pauta">
        <textarea
          className="input"
          rows={3}
          value={pauta}
          onChange={(e) => setPauta(e.target.value)}
          placeholder="Um assunto por linha."
        />
      </Campo>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ata — artefato :3923. Cada encaminhamento vira uma tarefa ligada à reunião.
// ---------------------------------------------------------------------------

interface Encaminhamento {
  titulo: string;
  responsavel: string;
  prazo: string;
}

const ENCAMINHAMENTO_VAZIO: Encaminhamento = { titulo: "", responsavel: "", prazo: "" };

export function ModalAta({
  reuniao,
  dados,
  t,
  recarregar,
  onClose,
}: {
  reuniao: ReuniaoEquipe;
  dados: Dados;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
}) {
  const pessoas = useMemo(() => pessoasDoTime(dados), [dados]);
  // Tarefas que esta reunião já gerou antes (artefato :3925): mostradas, não recriadas.
  const jaCriadas = useMemo(
    () => dados.tarefas.filter((x) => x.reuniao_id === reuniao.id),
    [dados.tarefas, reuniao.id],
  );

  const [ata, setAta] = useState(reuniao.ata ?? "");
  const [linhas, setLinhas] = useState<Encaminhamento[]>([{ ...ENCAMINHAMENTO_VAZIO }]);
  const [salvando, setSalvando] = useState(false);

  const mudar = (i: number, campo: keyof Encaminhamento, valor: string) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  // Uma linha só: em vez de sumir, esvazia (artefato :3946-3947).
  const remover = (i: number) =>
    setLinhas((atual) => (atual.length > 1 ? atual.filter((_, j) => j !== i) : [{ ...ENCAMINHAMENTO_VAZIO }]));

  async function salvar() {
    const texto = ata.trim();
    const novas = linhas.filter((l) => l.titulo.trim());
    if (!texto && novas.length === 0) {
      t.error("Escreva a ata ou pelo menos um encaminhamento.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar("gestao_reunioes_equipe", reuniao.id, { status: "Concluída", ata: texto || null });
      // Uma tarefa por encaminhamento, ligada à reunião pelo `reuniao_id` (artefato :3960).
      for (const l of novas) {
        await inserir("gestao_tarefas", {
          titulo: l.titulo.trim(),
          responsavel: l.responsavel || null,
          prazo: l.prazo || null,
          prioridade: "media",
          area: "geral",
          status: "afazer",
          reuniao_id: reuniao.id,
        });
      }
      t.success(
        novas.length === 0
          ? "Ata salva."
          : `Ata salva e ${novas.length} tarefa${novas.length > 1 ? "s criadas." : " criada."}`,
      );
      onClose();
      await recarregar(["reunioesEquipe", "tarefas"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a ata."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Ata da reunião"
      largura={640}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void salvar()}>
            {reuniao.status === "Concluída" ? "Salvar ata" : "Concluir reunião"}
          </button>
        </>
      }
    >
      <p className="muted small">
        {reuniao.titulo || reuniao.tipo} · {dataBR(reuniao.data)} {reuniao.hora || ""}
        {(reuniao.participantes ?? []).length > 0 ? ` · ${(reuniao.participantes ?? []).join(", ")}` : ""}
      </p>

      <Campo rotulo="O que foi discutido e decidido">
        <textarea
          className="input"
          rows={5}
          value={ata}
          onChange={(e) => setAta(e.target.value)}
          placeholder={(reuniao.pauta ?? "").trim() || "Decisões, números revisados, riscos levantados."}
        />
      </Campo>

      <Campo rotulo="Encaminhamentos · cada linha vira uma tarefa">
        {jaCriadas.length > 0 && (
          <ul className="muted small" style={{ margin: "0 0 8px", paddingLeft: 18 }}>
            {jaCriadas.map((x) => (
              <li key={x.id}>
                {x.titulo} — {x.responsavel || "sem responsável"}
                {x.status === "concluida" ? " (concluída)" : ""}
              </li>
            ))}
          </ul>
        )}
        {linhas.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              className="input"
              style={{ flex: 2 }}
              value={l.titulo}
              onChange={(e) => mudar(i, "titulo", e.target.value)}
              placeholder="Encaminhamento"
              aria-label="Encaminhamento"
            />
            <select
              className="input"
              style={{ flex: 1 }}
              value={l.responsavel}
              onChange={(e) => mudar(i, "responsavel", e.target.value)}
              aria-label="Responsável"
            >
              <option value="">— responsável —</option>
              {pessoas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ flex: 1 }}
              type="date"
              value={l.prazo}
              onChange={(e) => mudar(i, "prazo", e.target.value)}
              aria-label="Prazo"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remover(i)} aria-label="Remover linha">
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setLinhas((atual) => [...atual, { ...ENCAMINHAMENTO_VAZIO }])}
        >
          + Encaminhamento
        </button>
      </Campo>
    </Modal>
  );
}
