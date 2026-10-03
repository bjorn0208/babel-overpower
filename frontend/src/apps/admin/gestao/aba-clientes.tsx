/**
 * Aba Clientes — cadastro, setup recebido e a receber, mensalidade, situação e indicações.
 * Regras seguidas: só classes de bundle.css + ui-gestao.tsx; dados via dados.ts (grave, confirme, depois recarregar);
 * contas via calculos.ts; nada de cor ou medida nova. Original: financeiro.html:830-859 (viewClientes),
 * :4014-4062 (modalCliente), :1250-1276 (seção de indicações do cliente), :2022-2039 (botaoImplCliente).
 *
 * Lote 6 (2026-09-24, igual ao artefato):
 *  - "Excluir cliente" volta, dentro do modal e com a confirmação do artefato (:4039-4043). Decisão do Theus:
 *    apagar é soft delete (`apagar()` marca `deleted_at`); as parcelas e mensalidades dele deixam de aparecer.
 *    Cancelar continua sendo a situação "Cancelado" (mantém o histórico pago).
 *  - Sem os botões "cancelar"/"reativar" na linha (a situação muda pelo modal) e sem paginação.
 *  - Coluna "Início cobrança"; valores sem centavos (`money`); situação verde se ativo, neutra se cancelado.
 *  - Coluna Implementação: se já tem implementação aberta, o botão mostra o estado e abre o atendimento.
 * Mantidos por decisão: situação "Sócio" (Theus, 21/09, dado real) e o campo "Implementador" (o artefato lê
 * `c.implementador` ao enviar para a implementação, :2036).
 */

import { useEffect, useMemo, useState } from "react";
import { usePessoasSuporte } from "./pessoas-suporte";
import type React from "react";
import { ativo } from "./calculos";
import { useConfirmacao } from "./confirmacao";
import {
  apagar,
  atualizar,
  carregarImplDosClientes,
  enviarImplementacao,
  inserir,
  mensagemDeErro,
  type ImplDoCliente,
} from "./dados";
import { TOM_STATUS_INDICACAO, indicacoesPorCliente, norm, rotuloStatusIndicacao } from "./logica-indicacao";
import { contagemDoCliente } from "./logica-chamados";
import { ChamadosDoCliente } from "./chamados-do-cliente";
import { DetalheChamado } from "./detalhe-chamado";
import { abrirAtendimentoEm } from "./navegacao-gestao";
import { useAcoesIndicacao } from "./painel-indicacao";
import {
  abasPermitidas,
  dataBR,
  dataHoraBR,
  formatBRLInteiro,
  podeEscrever,
  rotuloMes,
  type Cliente,
  type Indicacao,
  type Parcela,
  type PropsAba,
  type Situacao,
  type ToastApi,
} from "./tipos";
import { AbaCasca, CabecalhoAba, Campo, CartaoTabela, Modal, Selo, Vazio } from "./ui-gestao";

const SITUACOES: Situacao[] = ["Vigente", "Sem plano", "Cancelado", "Sócio"];

/** Rótulo do estado da implementação, igual ao artefato :2026 (Programador → P&D, pedido D-2 do Diego). */
const ROTULO_IMPL: Record<string, string> = {
  andamento: "Em implementação",
  programador: "Com o P&D",
  validacao: "Em validação",
  aguardando: "Aguardando implementação",
};

/** pagoPor — original financeiro.html:835 (soma de parcelas com pagamento, por cliente). */
function recebidoPorCliente(parcelas: Parcela[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of parcelas) {
    if (!p.pago_em) continue;
    m.set(p.cliente_id, (m.get(p.cliente_id) ?? 0) + (Number(p.valor) || 0));
  }
  return m;
}

/**
 * Botão da coluna Implementação: caixa de largura fixa (todas as linhas com o mesmo botão, na mesma coluna) e
 * altura do `btn` (36px, bundle.css:146), com o rótulo longo em até duas linhas DENTRO da caixa. Antes o
 * `btn-sm` (28px) deixava "Aguardando implementação" quebrar e vazar para fora do botão; sem quebra, a tabela
 * passava da janela e escondia o ✎.
 */
const BOTAO_IMPL: React.CSSProperties = {
  width: 150,
  height: "auto",
  minHeight: 36,
  padding: "2px 10px", // 2 linhas de 12px x 1.2 + 2px + borda = 36px: a caixa não cresce
  lineHeight: 1.2,
  whiteSpace: "normal",
  textAlign: "center",
};

export function AbaClientes({ dados, papeis, mes, t, recarregar }: PropsAba) {
  // responsável do chamado e rodízio: app Equipe + quem tem Suporte em Acessos (revisão final I3)
  const pessoasSup = usePessoasSuporte(dados.config);
  const [busca, setBusca] = useState("");
  // D-1 (Diego, 2026-09-22): o gestor EMPURRA o cliente para a implementação daqui, em vez de o
  // implementador ir buscá-lo na lista. O registro de quem enviou e quando fica na própria linha.
  const [enviando, setEnviando] = useState<string | null>(null);
  const [modal, setModal] = useState<"novo" | Cliente | null>(null);
  // Chamados do cliente (spec 7d): todos que usam a aba veem, só leitura para quem não é do Suporte.
  const [fichaCliente, setFichaCliente] = useState<string | null>(null);
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);
  const pode = podeEscrever(papeis, "clientes");
  const podeIndicacoes = podeEscrever(papeis, "indicacoes");
  const conf = useConfirmacao();
  const acoesInd = useAcoesIndicacao({ dados, t, recarregar });

  const recebido = useMemo(() => recebidoPorCliente(dados.parcelas), [dados.parcelas]);

  /**
   * Estado da implementação de cada cliente (artefato `impAtivaDoCliente`/`botaoImplCliente` :2022-2029).
   * Vem de uma função estreita do banco, porque Comercial e Financeiro não leem a tabela de implementações.
   * Relê quando as implementações mudam (tempo real) e depois de cada envio.
   */
  const [implDoCliente, setImplDoCliente] = useState<Map<string, ImplDoCliente>>(new Map());
  const [versaoImpl, setVersaoImpl] = useState(0);
  useEffect(() => {
    let vivo = true;
    carregarImplDosClientes()
      .then((l) => vivo && setImplDoCliente(new Map(l.map((x) => [x.cliente_id, x]))))
      .catch((e) => vivo && t.error(mensagemDeErro(e, "Não consegui ler o estado da implementação dos clientes.")));
    return () => {
      vivo = false;
    };
    // `t` fica de fora de propósito: o aviso não deve disparar nova leitura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.implementacoes, versaoImpl]);

  /**
   * D-1: o gestor (Admin, Comercial ou Financeiro) empurra o cliente para a implementação. O banco cria a linha
   * "aguardando" com o carimbo, o implementador do cliente como responsável (se houver) e quem enviou.
   * Sem implementador, cai na fila aberta e alguém da implementação assume (D-3).
   */
  async function enviarParaImplementacao(c: Cliente) {
    setEnviando(c.id);
    try {
      await enviarImplementacao(c.id);
      t.success(`${c.nome} enviado para Implementação em ${dataHoraBR(new Date().toISOString())}.`);
      setVersaoImpl((v) => v + 1);
      await recarregar(["implementacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui enviar o cliente para a implementação."));
    } finally {
      setEnviando(null);
    }
  }

  /** ver-impl (:3120, :3143): vai para a aba Implementação com o atendimento aberto. */
  function verImplementacao(im: ImplDoCliente) {
    if (!abasPermitidas(papeis).includes("implementacao")) {
      t.info("Você não tem acesso à aba Implementação.");
      return;
    }
    abrirAtendimentoEm("implementacao", im.impl_id);
  }

  /** Excluir cliente — :4039-4043. Soft delete (decisão do Theus). */
  function excluirCliente(c: Cliente) {
    conf.pedir({
      titulo: "Excluir cliente",
      mensagem: `Excluir ${c.nome}? As parcelas e mensalidades lançadas para ele também deixam de aparecer.`,
      rotulo: "Excluir cliente",
      perigo: true,
      aoConfirmar: async () => {
        try {
          await apagar("gestao_clientes", c.id, "Não consegui excluir o cliente.");
          t.success("Cliente excluído.");
          setModal(null);
          await recarregar(["clientes"]);
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui excluir o cliente."));
        }
      },
    });
  }

  const indicacoes = useMemo(
    () => indicacoesPorCliente(dados.indicacoes, dados.clientes, dados.indicadores),
    [dados.indicacoes, dados.clientes, dados.indicadores],
  );

  const q = norm(busca);
  const lista = useMemo(
    () =>
      dados.clientes
        .filter((c) => !q || norm(c.nome).includes(q) || norm(c.email).includes(q))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.clientes, q],
  );

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Clientes"
        subtitulo={`${dados.clientes.length} cadastrados · ${rotuloMes(mes)}`}
        filtros={
          <input
            className="input"
            style={{ width: 260 }}
            placeholder="Buscar cliente ou e-mail"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar cliente"
          />
        }
        acoes={
          pode && (
            <button type="button" className="btn btn-primary" onClick={() => setModal("novo")}>
              + Novo cliente
            </button>
          )
        }
      />

      {lista.length === 0 ? (
        <Vazio
          icone="building"
          titulo="Nenhum cliente encontrado"
          mensagem="Ajuste a busca ou cadastre o primeiro cliente."
        />
      ) : (
        <CartaoTabela>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Fechamento</th>
              <th style={{ textAlign: "right" }}>Setup</th>
              <th style={{ textAlign: "right" }}>Recebido</th>
              <th style={{ textAlign: "right" }}>A receber</th>
              <th style={{ textAlign: "right" }}>Mensalidade</th>
              <th>Início cobrança</th>
              <th>Situação</th>
              <th style={{ textAlign: "right" }}>Indicações</th>
              <th style={{ textAlign: "right" }}>Implementação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const setup = Number(c.setup) || 0;
              const rec = recebido.get(c.id) ?? 0;
              const falta = setup - rec;
              const ind = indicacoes.get(c.id) ?? [];
              const fecharam = ind.filter((i) => i.status === "fechou").length;
              const im = implDoCliente.get(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <div>
                      <a href="#" title="Abrir a ficha do cliente" style={{ cursor: "pointer" }} onClick={(e) => { e.preventDefault(); setFichaCliente(c.id); }}>{c.nome}</a>
                    </div>
                    <div className="muted tiny gestao-email">{c.email || "—"}</div>
                    {/* chamados embaixo do nome (não em coluna própria): a coluna alargava a tabela 91px (MEDIR-TABELAS, 25/09) */}
                    {(() => { const k = contagemDoCliente(dados.chamados, c.id); return k.abertos + k.fechados === 0 ? null : (
                      <a href="#" className="tiny" onClick={(e) => { e.preventDefault(); setFichaCliente(c.id); }}>
                        Chamados: {k.abertos} {k.abertos === 1 ? "aberto" : "abertos"} · {k.fechados} {k.fechados === 1 ? "fechado" : "fechados"}
                      </a>); })()}
                  </td>
                  <td className="mono small">{dataBR(c.fechamento)}</td>
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {formatBRLInteiro(setup)}
                  </td>
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {formatBRLInteiro(rec)}
                  </td>
                  <td
                    className="mono small"
                    style={{ textAlign: "right", color: falta > 0 ? "var(--os-aviso)" : "var(--txt-3)" }}
                  >
                    {formatBRLInteiro(falta)}
                  </td>
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {formatBRLInteiro(Number(c.mensalidade) || 0)}
                  </td>
                  <td className="mono small">{dataBR(c.inicio_cobranca)}</td>
                  <td>
                    <Selo tom={ativo(c) ? "ok" : "neutro"}>{c.situacao || "Vigente"}</Selo>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {ind.length ? (
                      <>
                        <div className="mono small">{ind.length}</div>
                        <div className="muted tiny">{fecharam} fecharam</div>
                      </>
                    ) : (
                      <span className="muted tiny">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row gap-1" style={{ justifyContent: "flex-end", alignItems: "center" }}>
                      {im && im.status !== "concluida" ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={BOTAO_IMPL}
                          title={`Enviado em ${dataHoraBR(im.enviado_em)}`}
                          onClick={() => verImplementacao(im)}
                        >
                          {ROTULO_IMPL[im.status ?? ""] ?? "Aguardando implementação"}
                        </button>
                      ) : (
                        pode && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={BOTAO_IMPL}
                            disabled={enviando === c.id}
                            title={
                              im?.concluido_em
                                ? `Implementação anterior concluída em ${dataHoraBR(im.concluido_em)}`
                                : undefined
                            }
                            onClick={() => void enviarParaImplementacao(c)}
                          >
                            {enviando === c.id ? "Enviando…" : "Enviar p/ implementação"}
                          </button>
                        )
                      )}
                      {pode && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          aria-label={`Editar ${c.nome}`}
                          title="Editar"
                          onClick={() => setModal(c)}
                        >
                          ✎
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

      {modal && (
        <ModalCliente
          cliente={modal === "novo" ? null : modal}
          t={t}
          onClose={() => setModal(null)}
          onSalvo={() => void recarregar(["clientes"])}
          onExcluir={pode ? excluirCliente : undefined}
          extra={
            modal !== "novo" && (
              <SecaoIndicacoesCliente
                cliente={modal}
                lista={indicacoes.get(modal.id) ?? []}
                podeRegistrar={podeIndicacoes}
                onNova={() => acoesInd.nova({ indicador_id: modal.id, referrer_name: modal.nome })}
                onAbrir={(i) => acoesInd.editar(i)}
              />
            )
          }
        />
      )}
      {acoesInd.elemento}
      {conf.elemento}
      {fichaCliente && <ChamadosDoCliente clienteId={fichaCliente} chamados={dados.chamados} papeis={papeis} t={t} onClose={() => setFichaCliente(null)} onAbrir={(id) => { setFichaCliente(null); setChamadoAberto(id); }} />}
      {chamadoAberto && (() => { const c = dados.chamados.find((x) => x.id === chamadoAberto); return c ? <DetalheChamado chamado={c} papeis={papeis} t={t} equipe={pessoasSup.equipe} onFicha={(id) => { setChamadoAberto(null); setFichaCliente(id); }} onClose={() => setChamadoAberto(null)} recarregar={() => recarregar(["chamados"])} /> : null; })()}
    </AbaCasca>
  );
}

// ---------------------------------------------------------------------------
// Seção "Indicações de «cliente»" no modal — :1250-1276 (secaoIndicacoesCliente, ligarSecaoIndicacoes)
// ---------------------------------------------------------------------------

function SecaoIndicacoesCliente({
  cliente,
  lista,
  podeRegistrar,
  onNova,
  onAbrir,
}: {
  cliente: Cliente;
  lista: Indicacao[];
  podeRegistrar: boolean;
  onNova: () => void;
  onAbrir: (i: Indicacao) => void;
}) {
  const fecharam = lista.filter((i) => i.status === "fechou").length;
  return (
    <div className="os-vidro" style={{ padding: 14, borderRadius: 12 }}>
      <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <div className="h3" style={{ fontSize: 14 }}>
          Indicações de {cliente.nome}
        </div>
        <span className="muted small">
          {lista.length} {lista.length === 1 ? "indicação" : "indicações"} · {fecharam} fecharam
        </span>
        <div className="flex-1" />
        {podeRegistrar && (
          <button type="button" className="btn btn-sm" style={{ whiteSpace: "nowrap" }} onClick={onNova}>
            + Registrar indicação
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <div className="muted small">Nenhuma indicação registrada ainda.</div>
      ) : (
        <div className="col gap-1">
          {lista.map((i) => {
            const st = i.status || "novo";
            return (
              <button
                key={i.id}
                type="button"
                className="os-linha-clicavel row gap-2"
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 6px",
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  cursor: podeRegistrar ? "pointer" : "default",
                  alignItems: "flex-start",
                }}
                onClick={() => podeRegistrar && onAbrir(i)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {i.lead_nome || "—"}
                  </div>
                  <div className="muted tiny">
                    {[i.empresa, i.nicho].filter(Boolean).join(" · ") || "sem empresa informada"}
                    {i.lead_whatsapp ? ` · ${i.lead_whatsapp}` : ""} · {dataBR(i.data_indicacao || i.criado_em)}
                  </div>
                  {i.necessidade && <div className="muted tiny">{i.necessidade}</div>}
                </div>
                <Selo tom={TOM_STATUS_INDICACAO[st] ?? "neutro"}>{rotuloStatusIndicacao(st)}</Selo>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal criar/editar — original financeiro.html:4014-4062 (modalCliente).
// Exportado: aba-vendas.tsx reaproveita para o "Criar cliente" a partir de uma venda fechada.
// ---------------------------------------------------------------------------

export type PresetCliente = Partial<
  Pick<Cliente, "nome" | "email" | "telefone" | "fechamento" | "setup" | "mensalidade" | "situacao" | "obs">
>;

export function ModalCliente({
  cliente,
  preset,
  t,
  onClose,
  onSalvo,
  onExcluir,
  extra,
}: {
  cliente: Cliente | null;
  preset?: PresetCliente;
  t: ToastApi;
  onClose: () => void;
  /** Chamado com o id do cliente (novo ou editado) depois de gravar com sucesso. */
  onSalvo: (id: string) => void;
  /** "Excluir cliente" (:4034): só na edição; quem chama pede a confirmação. */
  onExcluir?: (c: Cliente) => void;
  /** Conteúdo abaixo do formulário (a seção de indicações do cliente, :4032). */
  extra?: React.ReactNode;
}) {
  const novo = !cliente;
  const base = cliente ?? preset;
  const [nome, setNome] = useState(base?.nome ?? "");
  const [email, setEmail] = useState(cliente?.email ?? base?.email ?? "");
  const [telefone, setTelefone] = useState(cliente?.telefone ?? base?.telefone ?? "");
  const [fechamento, setFechamento] = useState(cliente?.fechamento ?? base?.fechamento ?? "");
  const [implementacao, setImplementacao] = useState(cliente?.implementacao ?? "");
  const [setup, setSetup] = useState(String(cliente?.setup ?? base?.setup ?? ""));
  const [mensalidade, setMensalidade] = useState(String(cliente?.mensalidade ?? base?.mensalidade ?? ""));
  const [inicioCobranca, setInicioCobranca] = useState(cliente?.inicio_cobranca ?? "");
  const [situacao, setSituacao] = useState<Situacao>(cliente?.situacao ?? base?.situacao ?? "Vigente");
  const [suporte, setSuporte] = useState(cliente?.suporte ?? "");
  const [implementador, setImplementador] = useState(cliente?.implementador ?? "");
  const [obs, setObs] = useState(cliente?.obs ?? base?.obs ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const n = nome.trim();
    if (!n) {
      t.error("Informe o nome do cliente.");
      return;
    }
    setSalvando(true);
    try {
      const campos = {
        nome: n,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        fechamento: fechamento || null,
        implementacao: implementacao || null,
        setup: setup === "" ? null : Number(setup),
        mensalidade: mensalidade === "" ? null : Number(mensalidade),
        inicio_cobranca: inicioCobranca || null,
        situacao,
        suporte: suporte.trim() || null,
        implementador: implementador.trim() || null,
        obs: obs.trim() || null,
      };
      const linha = novo
        ? await inserir("gestao_clientes", campos)
        : await atualizar("gestao_clientes", cliente.id, campos);
      t.success(novo ? "Cliente cadastrado." : "Cliente atualizado.");
      onSalvo(String(linha.id));
      onClose();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar o cliente."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Novo cliente" : "Editar cliente"}
      onClose={onClose}
      largura={600}
      rodape={
        <>
          {!novo && onExcluir && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--os-erro)" }}
                disabled={salvando}
                onClick={() => onExcluir(cliente)}
              >
                Excluir cliente
              </button>
              <div className="flex-1" />
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="muted small">
        O valor da mensalidade e o início da cobrança geram as competências automaticamente.
      </div>
      <Campo rotulo="Nome do cliente">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="E-mail">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Telefone">
            <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Data do fechamento">
            <input
              className="input"
              type="date"
              value={fechamento ?? ""}
              onChange={(e) => setFechamento(e.target.value)}
            />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Data da implementação">
            <input
              className="input"
              type="date"
              value={implementacao ?? ""}
              onChange={(e) => setImplementacao(e.target.value)}
            />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Valor do setup (R$)">
            <input
              className="input mono"
              type="number"
              step="0.01"
              min="0"
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
            />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Valor da mensalidade (R$)">
            <input
              className="input mono"
              type="number"
              step="0.01"
              min="0"
              value={mensalidade}
              onChange={(e) => setMensalidade(e.target.value)}
            />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Início da cobrança">
            <input
              className="input"
              type="date"
              value={inicioCobranca ?? ""}
              onChange={(e) => setInicioCobranca(e.target.value)}
            />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Situação">
            <select className="input" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
              {SITUACOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Suporte responsável">
            <input className="input" value={suporte} onChange={(e) => setSuporte(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Implementador">
            <input className="input" value={implementador} onChange={(e) => setImplementador(e.target.value)} />
          </Campo>
        </div>
      </div>
      <Campo rotulo="Observações">
        <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
      {extra}
    </Modal>
  );
}
