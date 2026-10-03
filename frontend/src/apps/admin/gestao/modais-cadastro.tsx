/**
 * Cadastros que o artefato tem e o app deixava em "em breve" (levantamento de 2026-09-22,
 * `plano-integracao/DIFF-ARTEFATO-X-APP.md`).
 *
 *  - `ModalFuncionario` — artefato `modalFuncionario` :2839. Atende aos DOIS botões: "+ Novo
 *    funcionário" (aba Implementação) e "+ Novo programador" (aba P&D), que no artefato são o mesmo
 *    modal com a área pré-escolhida (:2840).
 *
 * O banco já tinha `gestao_funcionarios` (nome, cargo, whatsapp, email, ativo, area): aqui não há
 * migração, só tela.
 */

import { useState } from "react";
import { apagar, atualizar, gravarConfig, indicacaoPorOrigem, inserir, mensagemDeErro } from "./dados";
import { ymd, type Funcionario, type Indicacao, type PropsAba, type ToastApi } from "./tipos";
import {
  ErroImportacao,
  emailValido,
  idEstavelIndicacao,
  lerImportacaoIndicacoes,
  linhasRodizio,
  mascararWhatsapp,
  moverLinhaRodizio,
  pessoasDoRodizio,
  type LinhaRodizio,
} from "./calculos";
import { ModalConfirmar } from "./acoes-atendimento";
import { Campo, Modal } from "./ui-gestao";

/** Áreas que o artefato oferece (:2846-2848). O rótulo mudou para P&D; o valor gravado, não. */
const AREAS_FUNCIONARIO: Array<[string, string]> = [
  ["implementacao", "Implementação"],
  ["programador", "P&D"],
];


export function ModalFuncionario({
  funcionario,
  areaPadrao = "implementacao",
  dados,
  t,
  recarregar,
  onClose,
}: {
  /** Sem funcionário = cadastrar. Com = editar (aí aparece o Excluir). */
  funcionario?: Funcionario;
  areaPadrao?: string;
  dados: PropsAba["dados"];
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
}) {
  const novo = !funcionario;
  const [nome, setNome] = useState(funcionario?.nome ?? "");
  const [area, setArea] = useState(funcionario?.area ?? areaPadrao);
  const [cargo, setCargo] = useState(funcionario?.cargo ?? "");
  const [ativo, setAtivo] = useState(funcionario?.ativo !== false);
  const [whatsapp, setWhatsapp] = useState(funcionario?.whatsapp ?? "");
  const [email, setEmail] = useState(funcionario?.email ?? "");
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  async function salvar() {
    const n = nome.trim();
    if (!n) {
      t.error("Informe o nome.");
      return;
    }
    if (!emailValido(email.trim())) {
      t.error("Confira o e-mail.");
      return;
    }
    setSalvando(true);
    try {
      const campos = {
        nome: n,
        cargo: cargo.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        ativo,
        area,
      };
      if (novo) {
        await inserir("gestao_funcionarios", campos);
      } else {
        await atualizar("gestao_funcionarios", funcionario.id, campos);
        // Renomear arrasta o nome para onde ele está gravado como texto (artefato :2877-2882):
        // as implementações guardam o NOME, não o id, então sem isto a pessoa "sumiria" dos registros.
        if (funcionario.nome && funcionario.nome !== n) {
          for (const i of dados.implementacoes) {
            const mudou: Record<string, unknown> = {};
            if (i.responsavel === funcionario.nome) mudou.responsavel = n;
            if (i.programador === funcionario.nome) mudou.programador = n;
            if (Object.keys(mudou).length > 0) await atualizar("gestao_implementacoes", i.id, mudou);
          }
        }
      }
      t.success(novo ? "Funcionário cadastrado." : "Funcionário salvo.");
      onClose();
      await recarregar(novo ? ["funcionarios"] : ["funcionarios", "implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar o funcionário."));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!funcionario) return;
    setSalvando(true);
    try {
      await apagar("gestao_funcionarios", funcionario.id);
      t.success("Funcionário excluído.");
      onClose();
      await recarregar(["funcionarios"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui excluir o funcionário."));
    } finally {
      setSalvando(false);
    }
  }

  const ehProgramador = area === "programador";

  return (
    <Modal
      titulo={novo ? (ehProgramador ? "Novo programador" : "Novo funcionário") : "Editar funcionário"}
      onClose={onClose}
      rodape={
        <>
          {!novo && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginRight: "auto", color: "var(--os-erro)" }}
              onClick={() => setConfirmandoExclusao(true)}
            >
              Excluir
            </button>
          )}
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
        Funcionários da implementação são responsáveis pelo atendimento; programadores assumem a parte técnica
        na aba P&D.
      </p>
      {confirmandoExclusao && funcionario && (
        // artefato :2864-2866: a caixa "Excluir funcionário", com o texto e o botão do artefato.
        <ModalConfirmar
          titulo="Excluir funcionário"
          texto={`Excluir ${funcionario.nome}? Os atendimentos em que ele é responsável continuam com o nome registrado.`}
          rotulo="Excluir"
          perigo
          onConfirmar={excluir}
          onClose={() => setConfirmandoExclusao(false)}
        />
      )}

      <Campo rotulo="Nome">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="Área">
        <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
          {AREAS_FUNCIONARIO.map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Função">
        <input className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} />
      </Campo>
      <Campo rotulo="Situação">
        <select className="input" value={ativo ? "1" : "0"} onChange={(e) => setAtivo(e.target.value === "1")}>
          <option value="1">Ativo</option>
          <option value="0">Inativo</option>
        </select>
      </Campo>
      <Campo rotulo="WhatsApp">
        <input
          className="input"
          value={whatsapp}
          onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
          placeholder="(11) 91234-5678"
        />
      </Campo>
      <Campo rotulo="E-mail">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
    </Modal>
  );
}

/**
 * Equipe de suporte e a ordem do rodízio — artefato `modalEquipe` :4221. Cada cliente concluído na implementação vai para
 * a próxima pessoa da lista. Grava em `gestao_config`, chave `equipe`, no formato `{pessoas: [...]}` (o mesmo que
 * `equipeSuporte()` lê), preservando `membros`.
 *
 * 2026-09-25 (Adrian): "se já está cadastrado no app Equipe, qual o sentido de escrever ali?". Antes era uma caixa de
 * texto (um nome por linha); agora as pessoas vêm do app Equipe (`membros`, calculos.linhasRodizio) e aqui só se
 * escolhe quem entra no rodízio e a ordem. Nome antigo digitado que não está no app Equipe aparece marcado e só pode sair.
 */
export function ModalEquipe({
  valorAtual,
  deAcessos = [],
  proximo,
  t,
  recarregar,
  onClose,
}: {
  /** Mantido por compatibilidade com quem chama; a lista agora sai de `valorAtual` (pessoas + membros). */
  pessoas?: string[];
  /**
   * O valor atual de gestao_config 'equipe'. Salvar preserva as outras chaves (ex.: `membros`, o registro de quem a
   * Equipe do tenant pôs no rodízio — GESTAO-PELA-EQUIPE.sql) e troca só `pessoas`.
   */
  valorAtual?: unknown;
  /** Quem tem Suporte pela aba Acessos (gestao_pessoas_suporte) — entram na lista mesmo fora do app Equipe. */
  deAcessos?: string[];
  /** Quem pega o próximo cliente, para a tela mostrar antes de salvar. */
  proximo?: string | null;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
}) {
  const [linhas, setLinhas] = useState<LinhaRodizio[]>(() => linhasRodizio({ equipe: valorAtual }, deAcessos));
  const [salvando, setSalvando] = useState(false);
  const lista = pessoasDoRodizio(linhas);
  const marcar = (i: number, noRodizio: boolean) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, noRodizio } : l)));

  async function salvar() {
    setSalvando(true);
    try {
      const base = valorAtual && typeof valorAtual === "object" && !Array.isArray(valorAtual) ? (valorAtual as Record<string, unknown>) : {};
      await gravarConfig("equipe", { ...base, pessoas: lista });
      t.success(lista.length === 0 ? "Rodízio esvaziado." : `Rodízio salvo: ${lista.length} pessoa(s).`);
      onClose();
      await recarregar(["config"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar o rodízio."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Equipe de suporte"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void salvar()}>
            Salvar rodízio
          </button>
        </>
      }
    >
      <p className="muted small">
        As pessoas vêm do app Equipe (quem tem a função Suporte na Gestão). Marque quem entra no rodízio e use as setas
        para a ordem: cada cliente concluído na implementação vai para a próxima pessoa marcada.
      </p>
      {linhas.length === 0 ? (
        <p className="small">Ninguém com a função Suporte no app Equipe ainda. Adicione a pessoa lá e volte aqui.</p>
      ) : (
        <div className="col gap-2">
          {linhas.map((l, i) => (
            <div key={l.nome} className="row gap-2" style={{ alignItems: "center" }}>
              <label className="row gap-2" style={{ flex: 1, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={l.noRodizio}
                  disabled={l.foraDaEquipe && !l.noRodizio}
                  onChange={(e) => marcar(i, e.target.checked)}
                />
                <span className={l.noRodizio ? "" : "muted"}>{l.nome}</span>
                {l.foraDaEquipe && <span className="muted tiny">(não está no app Equipe — desmarque para tirar)</span>}
              </label>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Subir ${l.nome}`} disabled={i === 0}
                onClick={() => setLinhas((ls) => moverLinhaRodizio(ls, i, -1))}>↑</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Descer ${l.nome}`} disabled={i === linhas.length - 1}
                onClick={() => setLinhas((ls) => moverLinhaRodizio(ls, i, 1))}>↓</button>
            </div>
          ))}
        </div>
      )}
      <p className="muted small">
        {lista.length === 0
          ? "Sem ninguém marcado, o rodízio para e os clientes concluídos ficam sem suporte definido."
          : `${lista.length} pessoa(s) no rodízio${proximo ? ` · o próximo cliente vai para ${proximo}` : ""}.`}
      </p>
    </Modal>
  );
}

/**
 * Link de uma página pública — artefato `modalLinkPublico` :1483.
 * Usado pelo botão "Indicar" (:1479) e pelo link da página de venda realizada (:1474).
 * R2-A2 (Serjão, 2026-09-24): as páginas antigas do artefato NÃO gravam nada. Até o Theus publicar as páginas novas
 * (borda-formularios/artefatos-prontos, que gravam direto no app), os endereços ficam VAZIOS e os botões de link
 * somem da tela — para ninguém mandar a um parceiro um link que perde a venda. Depois de publicar, é só colar aqui.
 */
export const LINK_INDICAR = "https://www.babel-os.com/indicacao.html";
export const LINK_VENDA_REALIZADA = "https://www.babel-os.com/venda-realizada.html";

export function ModalLinkPublico({
  titulo,
  texto,
  rotulo,
  link,
  msgCopia,
  t,
  onClose,
}: {
  titulo: string;
  texto: string;
  rotulo: string;
  link: string;
  msgCopia: string;
  t: ToastApi;
  onClose: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      t.success(msgCopia);
    } catch {
      t.error("Selecione o link e use Ctrl+C para copiar.");
    }
  }

  return (
    <Modal
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Fechar
          </button>
          <a className="btn btn-sm" href={link} target="_blank" rel="noopener noreferrer">
            Abrir página
          </a>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void copiar()}>
            {copiado ? "Copiado" : "Copiar link"}
          </button>
        </>
      }
    >
      <p className="muted small">{texto}</p>
      <Campo rotulo={rotulo}>
        <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      </Campo>
      <p className="muted small">
        Para qualquer pessoa conseguir abrir, a página precisa estar compartilhada como pública: abra a
        página, clique em <b>Compartilhar</b> e libere o acesso por link.
      </p>
    </Modal>
  );
}

/**
 * Importar indicações — artefato `modalImportInd` :1504.
 * Cola da planilha de respostas (com a linha de títulos), CSV, TSV ou JSON. "Conferir" mostra quantas
 * entrariam antes de gravar; "Importar" grava. Linha sem nome e sem WhatsApp é descartada.
 */
export function ModalImportarIndicacoes({
  existentes,
  temIndicador,
  t,
  recarregar,
  onClose,
}: {
  /** Indicações já no banco: reimportar a mesma linha atualiza, não duplica (artefato :1554-1558). */
  existentes: Indicacao[];
  /** O indicador desta linha é identificado? (artefato `resolverIndicador(o).cli`, :1545) */
  temIndicador: (o: Record<string, string>) => boolean;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [conferido, setConferido] = useState<string | null>(null);
  const porOrigem = new Map(existentes.filter((i) => i.id_origem).map((i) => [i.id_origem as string, i]));
  const idDe = (o: Record<string, string>) => o.id || idEstavelIndicacao(o);
  const [salvando, setSalvando] = useState(false);
  /** Linha de progresso do artefato (:1553-1567): "Importando… i de N" e, no fim, "Concluído: X de N". */
  const [progresso, setProgresso] = useState<string | null>(null);

  function ler(bruto = texto): Array<Record<string, string>> | null {
    if (!bruto.trim()) {
      t.error("Cole os dados ou escolha um arquivo.");
      return null;
    }
    try {
      const arr = lerImportacaoIndicacoes(bruto);
      if (arr.length === 0) {
        t.error("Nenhuma indicação encontrada.");
        return null;
      }
      return arr;
    } catch (e) {
      t.error(e instanceof ErroImportacao ? e.message : "Não consegui entender os dados colados.");
      return null;
    }
  }

  /** Artefato `conferir` :1540-1549: "N linhas · X novas · Y com código de link · Z com indicador identificado." */
  function conferir(bruto = texto): Array<Record<string, string>> | null {
    const arr = ler(bruto);
    if (!arr) {
      setConferido(null);
      return null;
    }
    const novas = arr.filter((o) => !porOrigem.has(idDe(o))).length;
    const comLink = arr.filter((o) => o.referrerCode).length;
    const ident = arr.filter((o) => temIndicador(o)).length;
    setConferido(
      `${arr.length} linha${arr.length > 1 ? "s" : ""} · ${novas} nova${novas === 1 ? "" : "s"} · ` +
        `${comLink} com código de link · ${ident} com indicador identificado.`,
    );
    return arr;
  }

  /**
   * Importa linha a linha e PULA a linha que falhar, como o artefato (:1553-1567): uma linha ruim não impede as
   * outras. Sucesso só conta a linha que o banco devolveu (inserir/atualizar confirmam 1 linha). No fim diz
   * "Concluído: X de N" e quais linhas falharam.
   *
   * A1 (auditoria do Serjão, 2026-09-24): se a indicação daquela linha foi EXCLUÍDA (soft delete), ela não está
   * em `existentes` e inserir de novo dava 23505 (id_origem único). No artefato o documento apagado deixa de
   * existir e a reimportação o cria de novo; o equivalente aqui é RESTAURAR a linha excluída (deleted_at = null)
   * com os dados da planilha e o status do arquivo (ou "novo"), zerando o que era do atendimento antigo.
   */
  async function importar() {
    const arr = conferir();
    if (!arr) return;
    setSalvando(true);
    let gravadas = 0;
    let n = 0;
    const falhas: string[] = [];
    for (const o of arr) {
      n++;
      setProgresso(`Importando… ${n} de ${arr.length}`);
      try {
        // Colunas de data: só vai data válida. "Carimbo" vira o dia de calendário local (decisão 4, sem fuso).
        const momento = /^\d{4}-\d{2}-\d{2}T/.test(o.createdAt ?? "") ? new Date(o.createdAt) : null;
        const dados = {
          lead_nome: o.leadName ?? null,
          lead_whatsapp: o.leadWhatsapp ?? null,
          lead_email: o.leadEmail ?? null,
          empresa: o.company ?? null,
          nicho: o.niche ?? null,
          necessidade: o.need ?? null,
          melhor_horario: o.bestTime ?? null,
          data_preferida: /^\d{4}-\d{2}-\d{2}$/.test(o.preferredDate ?? "") ? o.preferredDate : null,
          referrer_name: o.referrerName ?? null,
          referrer_code: o.referrerCode ?? null,
          data_indicacao: momento && !isNaN(momento.getTime()) ? ymd(momento) : null,
        };
        const existente = porOrigem.get(idDe(o));
        if (existente) {
          // Artefato :1556: a linha que já existe mantém status, anotações e indicador escolhidos pelo time.
          await atualizar("gestao_indicacoes", existente.id, dados);
        } else {
          const novaOuNao = {
            ...dados,
            status: o.status || "novo",
            origem: o.origem || "pagina",
          };
          // A1: a mesma origem pode existir EXCLUÍDA; aí restaura em vez de inserir (que daria 23505).
          const doBanco = await indicacaoPorOrigem(idDe(o));
          if (doBanco && !doBanco.deleted_at) {
            // R2-A1 (Serjão, rodada 2): a linha está VIVA, só não estava na lista desta tela (lista desatualizada).
            // Trata como existente: atualiza os dados do lead e mantém status, atendimento e venda ligada.
            await atualizar("gestao_indicacoes", doBanco.id, dados);
          } else if (doBanco) {
            const excluida = doBanco;
            await atualizar("gestao_indicacoes", excluida.id, {
              ...novaOuNao,
              deleted_at: null,
              // documento "novo" como no artefato: nada do atendimento que foi excluído volta junto
              indicador_id: null,
              obs: null,
              responsavel: null,
              inicio: null,
              inicio_hora: null,
              iniciado_em: null,
              enviado_vendas_em: null,
              venda_id: null,
              tentativas: [],
              dias: {},
            });
          } else {
            await inserir("gestao_indicacoes", { ...novaOuNao, id_origem: idDe(o) });
          }
        }
        gravadas++;
      } catch (e) {
        const motivo = mensagemDeErro(e, "falhou");
        falhas.push(`linha ${n} (${o.leadName || o.leadWhatsapp || "sem nome"}): ${motivo}`);
        console.error("[Gestão] importação: linha", n, motivo);
      }
    }
    const fim = `Concluído: ${gravadas} de ${arr.length} importada${arr.length === 1 ? "" : "s"}.`;
    setProgresso(
      falhas.length
        ? `${fim} Não entraram: ${falhas.slice(0, 5).join("; ")}${falhas.length > 5 ? `; e mais ${falhas.length - 5}` : ""}.`
        : fim,
    );
    if (gravadas === arr.length) t.success(fim);
    else t.error(`${fim} ${falhas.length} linha(s) não foram gravadas (detalhe no quadro de importação).`);
    setSalvando(false);
    if (gravadas > 0) await recarregar(["indicacoes"]);
  }

  return (
    <Modal
      titulo="Importar indicações"
      largura={640}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => conferir()}>
            Conferir
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => void importar()}>
            {salvando ? "Importando…" : "Importar"}
          </button>
        </>
      }
    >
      <p className="muted small">
        Selecione as linhas na planilha de respostas <b>incluindo a linha de títulos</b>, copie e cole aqui.
        Também aceita CSV ou JSON. Colunas reconhecidas: Seu nome, Seu WhatsApp, Seu e-mail, Sua empresa,
        Nicho, O que você busca resolver, Melhor horário, Melhor dia, Quem te indicou, Código, Carimbo de
        data/hora e Status.
      </p>
      <Campo rotulo="Dados">
        <textarea
          className="input"
          rows={8}
          spellCheck={false}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setConferido(null);
          }}
          placeholder="Carimbo de data/hora	Quem te indicou	Seu nome	Seu WhatsApp	…"
        />
      </Campo>
      <Campo rotulo="Ou escolha um arquivo (.csv, .tsv, .json)">
        <input
          className="input"
          type="file"
          accept=".csv,.tsv,.txt,.json,text/csv,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const leitor = new FileReader();
            leitor.onload = () => {
              // :1521: ao escolher o arquivo, já confere sozinho
              const conteudo = String(leitor.result ?? "").replace(/^\uFEFF/, "");
              setTexto(conteudo);
              setProgresso(null);
              conferir(conteudo);
            };
            leitor.onerror = () => t.error("Não consegui ler o arquivo.");
            leitor.readAsText(f, "utf-8");
          }}
        />
      </Campo>
      {conferido !== null && <p className="small">{conferido}</p>}
      {progresso !== null && <p className="small">{progresso}</p>}
    </Modal>
  );
}
