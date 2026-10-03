/**
 * Modais da aba "Tarefas do time" (lote 5, 2026-09-24). Arquivo NOVO: os modais de reunião de equipe e
 * ata de `modais-reuniao.tsx` continuam lá, sem mudança (são de outro lote); a aba Tarefas passa a
 * usar as versões daqui, que tiram as pessoas de `pessoasTime` (funcionários + equipe de suporte +
 * vendedores internos, art.:3429) e mostram o status de cada encaminhamento já criado (T33, T34).
 *
 * Confirmações como no artefato: uma janela com o texto e "Voltar"/ação (art.:3988 `confirmar`),
 * não "clicar duas vezes". Sucesso só depois de o banco confirmar (dados.ts `confirma`).
 */

import { useMemo, useState } from "react";
import { atualizar, inserir, mensagemDeErro } from "./dados";
import {
  clientesParaTarefa,
  notaModalTarefa,
  pessoasTime,
  tomEncaminhamento,
  type PresetTarefa,
} from "./logica-tarefas";
import {
  AREAS_TAREFA,
  PRIORIDADES,
  STATUS_REUNIAO_EQUIPE,
  STATUS_TAREFA,
  TIPOS_REUNIAO_EQUIPE,
  dataBR,
  dataHoraBR,
  hojeLocal,
  ymd,
  type Dados,
  type PrioridadeTarefa,
  type PropsAba,
  type ReuniaoEquipe,
  type StatusTarefa,
  type Tarefa,
  type ToastApi,
} from "./tipos";
import { Campo, Modal, Selo } from "./ui-gestao";

const rotuloStatus = (s: string | null) => STATUS_TAREFA.find(([k]) => k === s)?.[1] ?? s ?? "";

// ---------------------------------------------------------------------------
// Confirmação — art.:3988 `confirmar`
// ---------------------------------------------------------------------------

export function ModalConfirmar({
  titulo,
  mensagem,
  rotulo,
  perigo,
  onClose,
  aoConfirmar,
}: {
  titulo: string;
  mensagem: string;
  rotulo: string;
  perigo?: boolean;
  onClose: () => void;
  /** Deve lançar em caso de erro; a janela só fecha quando a gravação volta. */
  aoConfirmar: () => Promise<void>;
}) {
  const [indo, setIndo] = useState(false);
  const confirmar = async () => {
    setIndo(true);
    try {
      await aoConfirmar();
    } finally {
      setIndo(false);
    }
  };
  return (
    <Modal
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-sm" onClick={onClose} autoFocus={perigo}>
            Voltar
          </button>
          <button
            type="button"
            className={perigo ? "btn btn-sm" : "btn btn-primary btn-sm"}
            style={perigo ? { color: "var(--os-erro)" } : undefined}
            disabled={indo}
            onClick={() => void confirmar()}
          >
            {indo ? "Aguarde…" : rotulo}
          </button>
        </>
      }
    >
      <p className="small" style={{ lineHeight: 1.55, color: "var(--txt-2)" }}>
        {mensagem}
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pergunta com caixa de texto — art.:3831 `modalBloqueio` e art.:3813 (cancelar reunião da equipe)
// ---------------------------------------------------------------------------

export function ModalTexto({
  titulo,
  nota,
  rotuloCampo,
  inicial,
  placeholder,
  rotuloOk,
  obrigatorio,
  mensagemFalta,
  onClose,
  aoConfirmar,
}: {
  titulo: string;
  nota: string;
  rotuloCampo: string;
  inicial?: string | null;
  placeholder: string;
  rotuloOk: string;
  /** Sem texto, avisa e não segue (o bloqueio exige; o cancelamento não). */
  obrigatorio?: boolean;
  mensagemFalta?: string;
  onClose: () => void;
  aoConfirmar: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState(inicial ?? "");
  const [falta, setFalta] = useState(false);
  const [indo, setIndo] = useState(false);
  const ok = async () => {
    const v = texto.trim();
    if (obrigatorio && !v) {
      setFalta(true);
      return;
    }
    setIndo(true);
    try {
      await aoConfirmar(v);
    } finally {
      setIndo(false);
    }
  };
  return (
    <Modal
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Voltar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={indo} onClick={() => void ok()}>
            {indo ? "Aguarde…" : rotuloOk}
          </button>
        </>
      }
    >
      <p className="muted small">{nota}</p>
      <Campo rotulo={rotuloCampo}>
        <textarea
          className="input"
          rows={3}
          value={texto}
          autoFocus
          aria-label={rotuloCampo}
          onChange={(e) => {
            setTexto(e.target.value);
            setFalta(false);
          }}
          placeholder={placeholder}
        />
      </Campo>
      {falta && (
        <p className="small" role="alert" style={{ color: "var(--os-erro)" }}>
          {mensagemFalta}
        </p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tarefa — art.:3843-3886 `modalTarefa`, com o cliente, a nota do topo, o preenchimento e o Excluir
// ---------------------------------------------------------------------------

export function ModalTarefa({
  tarefa,
  preset,
  dados,
  podeEditar,
  t,
  onClose,
  aoSalvar,
  aoPedirExclusao,
}: {
  tarefa: Tarefa | null;
  preset: PresetTarefa | null;
  dados: Dados;
  /** false: só consulta (o banco recusaria a gravação para este papel). */
  podeEditar: boolean;
  t: ToastApi;
  onClose: () => void;
  aoSalvar: () => void;
  aoPedirExclusao: (tarefa: Tarefa) => void;
}) {
  const novo = !tarefa;
  const base = tarefa ?? null;
  const [titulo, setTitulo] = useState(base?.titulo ?? preset?.titulo ?? "");
  const [descricao, setDescricao] = useState(base?.descricao ?? preset?.descricao ?? "");
  const [responsavel, setResponsavel] = useState(base?.responsavel ?? preset?.responsavel ?? "");
  const [prazo, setPrazo] = useState(base?.prazo ?? preset?.prazo ?? "");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>(
    base?.prioridade ?? preset?.prioridade ?? "media",
  );
  const [area, setArea] = useState(base?.area ?? preset?.area ?? "geral");
  const [status, setStatus] = useState<StatusTarefa>(base?.status ?? "afazer");
  const [clienteId, setClienteId] = useState(base?.cliente_id ?? preset?.cliente_id ?? "");
  const [bloqueio, setBloqueio] = useState(base?.bloqueio ?? "");
  const [salvando, setSalvando] = useState(false);

  const pessoas = useMemo(() => {
    const p = pessoasTime(dados);
    return responsavel && !p.includes(responsavel) ? [...p, responsavel] : p;
  }, [dados, responsavel]);
  const clientes = useMemo(() => {
    const c = clientesParaTarefa(dados);
    return clienteId && !c.some(([id]) => id === clienteId) ? [...c, [clienteId, "Cliente sem nome visível"] as [string, string]] : c;
  }, [dados, clienteId]);
  const reuniao = base?.reuniao_id ? (dados.reunioesEquipe.find((r) => r.id === base.reuniao_id) ?? null) : null;
  const nota = notaModalTarefa(base, preset, reuniao, dataHoraBR);

  const salvar = async () => {
    const tit = titulo.trim();
    if (!tit) {
      t.error("Escreva o que precisa ser feito.");
      return;
    }
    if (status === "bloqueada" && !bloqueio.trim()) {
      t.error("Diga o que está bloqueando a tarefa.");
      return;
    }
    setSalvando(true);
    try {
      const campos: Record<string, unknown> = {
        titulo: tit,
        descricao: descricao.trim() || null,
        responsavel: responsavel || null,
        prazo: prazo || null,
        prioridade,
        area,
        status,
        cliente_id: clienteId || null,
        bloqueio: status === "bloqueada" ? bloqueio.trim() : null,
        concluido_em:
          status === "concluida"
            ? base?.status === "concluida" && base.concluido_em
              ? base.concluido_em
              : new Date().toISOString()
            : null,
      };
      if (novo) {
        // Não duplicar (art.:3548): se a pendência já virou tarefa enquanto esta tela estava aberta, para aqui.
        if (preset?.origem_key && dados.tarefas.some((x) => x.origem_key === preset.origem_key)) {
          t.error("Essa pendência já virou tarefa.");
          return;
        }
        campos.impl_id = preset?.impl_id || null;
        campos.origem_key = preset?.origem_key || null;
        await inserir("gestao_tarefas", campos);
      } else {
        await atualizar("gestao_tarefas", base!.id, campos);
      }
      t.success(novo ? `Tarefa criada${responsavel ? ` para ${responsavel}` : ""}.` : "Tarefa salva.");
      aoSalvar();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a tarefa."));
    } finally {
      setSalvando(false);
    }
  };

  const so = !podeEditar;
  return (
    <Modal
      titulo={novo ? "Nova tarefa" : so ? "Tarefa" : "Editar tarefa"}
      onClose={onClose}
      largura={520}
      rodape={
        so ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Fechar
          </button>
        ) : (
          <>
            {!novo && (
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginRight: "auto", color: "var(--os-erro)" }}
                onClick={() => aoPedirExclusao(base!)}
              >
                Excluir
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void salvar()}>
              {novo ? "Criar tarefa" : "Salvar"}
            </button>
          </>
        )
      }
    >
      <p className="muted small">{nota}</p>
      {so && (
        <p className="muted small">
          Só consulta: criar, editar e excluir tarefa é da implementação, do suporte e do admin.
        </p>
      )}
      <fieldset disabled={so} style={{ border: 0, padding: 0, margin: 0 }} className="col gap-3">
        <Campo rotulo="O que precisa ser feito">
          <input
            className="input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
            aria-label="O que precisa ser feito"
          />
        </Campo>
        <div className="row gap-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo rotulo="Responsável">
              <select className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">— sem responsável —</option>
                {pessoas.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo rotulo="Prazo">
              <input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </Campo>
          </div>
        </div>
        <div className="row gap-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo rotulo="Prioridade">
              <select
                className="input"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
              >
                {PRIORIDADES.map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo rotulo="Área">
              <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS_TAREFA.map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </div>
        <div className="row gap-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo rotulo="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusTarefa)}>
                {STATUS_TAREFA.map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo rotulo="Cliente (opcional)">
              <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">— nenhum —</option>
                {clientes.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </div>
        {status === "bloqueada" && (
          <Campo rotulo="Motivo do bloqueio">
            <input
              className="input"
              value={bloqueio}
              onChange={(e) => setBloqueio(e.target.value)}
              placeholder="O que falta para seguir"
            />
          </Campo>
        )}
        <Campo rotulo="Detalhes">
          <textarea
            className="input"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Contexto, links, o que conta como pronto."
            style={{ minHeight: 70 }}
          />
        </Campo>
      </fieldset>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reunião da equipe — art.:3888-3921, com as pessoas de `pessoasTime`
// ---------------------------------------------------------------------------

export function ModalReuEquipeTime({
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
  const pessoas = useMemo(() => {
    const base = pessoasTime(dados);
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
      largura={520}
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
        <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Título" />
      </Campo>
      <div className="row gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Campo rotulo="Tipo">
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_REUNIAO_EQUIPE.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Campo rotulo="Duração (min)">
            <input className="input" type="number" min={0} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Campo rotulo="Dia">
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Campo rotulo="Horário">
            <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Campo>
        </div>
      </div>
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
          <span className="muted small">Cadastre funcionários na aba Implementação ou a equipe na aba Suporte.</span>
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
// Ata — art.:3923-3966. Cada encaminhamento vira uma tarefa ligada à reunião; linha vazia é ignorada.
// ---------------------------------------------------------------------------

interface Encaminhamento {
  titulo: string;
  responsavel: string;
  prazo: string;
}
const VAZIO: Encaminhamento = { titulo: "", responsavel: "", prazo: "" };

export function ModalAtaTime({
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
  const pessoas = useMemo(() => pessoasTime(dados), [dados]);
  const jaCriadas = useMemo(
    () => dados.tarefas.filter((x) => x.reuniao_id === reuniao.id),
    [dados.tarefas, reuniao.id],
  );
  const hoje = hojeLocal();
  const [ata, setAta] = useState(reuniao.ata ?? "");
  const [linhas, setLinhas] = useState<Encaminhamento[]>([{ ...VAZIO }]);
  const [salvando, setSalvando] = useState(false);

  const mudar = (i: number, campo: keyof Encaminhamento, valor: string) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const remover = (i: number) =>
    setLinhas((atual) => (atual.length > 1 ? atual.filter((_, j) => j !== i) : [{ ...VAZIO }]));

  async function salvar() {
    const texto = ata.trim();
    const novas = linhas.filter((l) => l.titulo.trim());
    if (!texto && novas.length === 0) {
      t.error("Escreva a ata ou pelo menos um encaminhamento.");
      return;
    }
    setSalvando(true);
    let criadas = 0;
    try {
      await atualizar("gestao_reunioes_equipe", reuniao.id, { status: "Concluída", ata: texto || null });
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
        criadas++;
      }
      t.success(
        novas.length === 0 ? "Ata salva." : `Ata salva e ${novas.length} tarefa${novas.length > 1 ? "s criadas." : " criada."}`,
      );
      onClose();
      await recarregar(["reunioesEquipe", "tarefas"]);
    } catch (e) {
      // Diz o que ficou gravado: a ata e as tarefas já confirmadas não são refeitas no silêncio.
      const base = mensagemDeErro(e, "Não consegui salvar a ata.");
      t.error(criadas > 0 ? `${base} (${criadas} de ${novas.length} tarefa(s) já tinham sido criadas.)` : base);
      await recarregar(["reunioesEquipe", "tarefas"]);
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
        {reuniao.titulo || reuniao.tipo} · {dataBR(reuniao.data)}
        {reuniao.hora ? ` ${reuniao.hora}` : ""}
        {(reuniao.participantes ?? []).length > 0 ? ` · ${(reuniao.participantes ?? []).join(", ")}` : ""}
      </p>
      <Campo rotulo="O que foi discutido e decidido">
        <textarea
          className="input"
          rows={5}
          value={ata}
          onChange={(e) => setAta(e.target.value)}
          aria-label="O que foi discutido e decidido"
          placeholder={(reuniao.pauta ?? "").trim() || "Decisões, números revisados, riscos levantados."}
        />
      </Campo>
      <Campo rotulo="Encaminhamentos · cada linha vira uma tarefa">
        {jaCriadas.length > 0 && (
          <ul className="small" style={{ margin: "0 0 8px", paddingLeft: 0, listStyle: "none" }}>
            {jaCriadas.map((x) => (
              <li key={x.id} className="row gap-2" style={{ alignItems: "center", marginBottom: 4 }}>
                <Selo tom={x.status === "concluida" ? "ok" : tomEncaminhamento(x, hoje)}>{rotuloStatus(x.status)}</Selo>
                <span>{x.titulo}</span>
                <span className="muted tiny">{x.responsavel || "sem responsável"}</span>
              </li>
            ))}
          </ul>
        )}
        {linhas.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: "2 1 180px" }}
              value={l.titulo}
              onChange={(e) => mudar(i, "titulo", e.target.value)}
              placeholder="Encaminhamento"
              aria-label="Encaminhamento"
            />
            <select
              className="input"
              style={{ flex: "1 1 120px" }}
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
              style={{ flex: "1 1 120px" }}
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
          onClick={() => setLinhas((atual) => [...atual, { ...VAZIO }])}
        >
          + Encaminhamento
        </button>
      </Campo>
    </Modal>
  );
}
