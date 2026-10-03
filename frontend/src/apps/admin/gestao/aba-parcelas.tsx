/**
 * Aba Parcelas do setup — entrada e parcelas do setup de cada cliente, com marcar como paga,
 * desfazer, editar e excluir (soft delete). Original: financeiro.html:861-896 (viewSetup),
 * 4063-4093 (modalParcela), 891-896 (selCliente).
 *
 * Lote 6 (2026-09-24, igual ao artefato): cadastro e edição no modal do artefato, com a nota "Preencha a data do
 * pagamento…"; "Excluir" só dentro do modal (a linha não tem mais "Apagar"); parcela de cliente que não existe
 * (excluído) não aparece nem entra nos totais (:864). Mantido por decisão do Theus: Histórico de pagamentos.
 * Excluir sem perguntar, igual ao artefato (:4083-4084; lote de cores 2026-09-24): é soft delete (`deleted_at`),
 * reversível, e o Histórico de pagamentos guarda a versão paga.
 *
 * Grava só por dados.ts: `inserir`/`atualizar` (não há função estreita para parcela; a tabela
 * tem só 4 campos próprios) e `apagar` (soft delete, `deleted_at`). Marcar pago = atualizar
 * `pago_em`; nunca apaga a linha (regra da casa: pago não some; excluir é só o soft delete).
 *
 * Layout: cabeçalho + `Modal` (como o artefato) + `CartaoTabela` (`AbaComissoes.tsx:19-24`) com badge de
 * status (`calculos.ts:SELO_STATUS`, igual ao usado em `aba-painel.tsx`).
 */

import { useMemo, useState } from "react";
import { parseMoedaBR } from "@/lib/moeda";
import { ROTULO_STATUS, SELO_STATUS, statusVenc } from "./calculos";
import { apagar, atualizar, inserir, mensagemDeErro } from "./dados";
import { HistoricoPagamentos } from "./historico-pagamentos";
import {
  dataBR,
  formatBRL,
  hojeLocal,
  parseData,
  podeEscrever,
  ymd,
  type Parcela,
  type PropsAba,
} from "./tipos";
import { AbaCasca, CabecalhoAba, Campo, CartaoTabela, Modal, Vazio } from "./ui-gestao";

/** Opções fixas do original (financeiro.html:4067): não é texto livre, é um <select>. */
const DESCRICOES_PARCELA = ["Entrada", "Parcela", "À vista", "30 dias", "60 dias", "90 dias"];

const FORM_VAZIO = { clienteId: "", descricao: DESCRICOES_PARCELA[0], valor: "", vencimento: "", pagoEm: "" };

export function AbaParcelas({ dados, papeis, t, recarregar }: PropsAba) {
  const hoje = useMemo(() => hojeLocal(), []);
  const pode = podeEscrever(papeis, "parcelas");

  const [cliente, setCliente] = useState("todos");
  const [aberto, setAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const clientesOrdenados = useMemo(
    () => [...dados.clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.clientes],
  );

  // linhas visíveis (filtro de cliente) com o status de vencimento — sem venc, cai em "emdia" (original :864).
  // Parcela de cliente que não existe mais (excluído) não aparece nem soma (:864, `if(!c)return`).
  const idsClientes = useMemo(() => new Set(dados.clientes.map((c) => c.id)), [dados.clientes]);
  const linhas = useMemo(() => {
    const out = dados.parcelas
      .filter((p) => idsClientes.has(p.cliente_id))
      .filter((p) => cliente === "todos" || p.cliente_id === cliente)
      .map((p) => {
        const venc = parseData(p.vencimento);
        const status = venc ? statusVenc(venc, p.pago_em ? true : null, hoje) : ("emdia" as const);
        return { p, status };
      });
    out.sort((a, b) => (a.p.vencimento || "").localeCompare(b.p.vencimento || ""));
    return out;
  }, [dados.parcelas, cliente, hoje, idsClientes]);

  let pago = 0;
  let aberto2 = 0;
  for (const { p } of linhas) {
    if (p.pago_em) pago += Number(p.valor) || 0;
    else aberto2 += Number(p.valor) || 0;
  }

  const nomeCliente = (id: string) => dados.clientes.find((c) => c.id === id)?.nome || "—";

  const abrirNova = () => {
    setEditId(null);
    setForm({ ...FORM_VAZIO, clienteId: cliente !== "todos" ? cliente : "" });
    setAberto(true);
  };
  const abrirEdicao = (p: Parcela) => {
    setEditId(p.id);
    setForm({
      clienteId: p.cliente_id,
      descricao: p.descricao || DESCRICOES_PARCELA[0],
      valor: p.valor != null ? String(p.valor) : "",
      vencimento: p.vencimento || "",
      pagoEm: p.pago_em || "",
    });
    setAberto(true);
  };
  const fechar = () => {
    setAberto(false);
    setEditId(null);
  };

  const salvar = async () => {
    const valor = parseMoedaBR(form.valor);
    if (!form.clienteId) {
      t.error("Escolha o cliente.");
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      t.error("Informe o valor da parcela.");
      return;
    }
    setSalvando(true);
    try {
      const campos = {
        cliente_id: form.clienteId,
        descricao: form.descricao,
        valor,
        vencimento: form.vencimento || null,
        pago_em: form.pagoEm || null,
      };
      if (editId) await atualizar("gestao_parcelas", editId, campos);
      else await inserir("gestao_parcelas", campos);
      t.success("Parcela salva.");
      await recarregar(["parcelas"]);
      fechar();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a parcela."));
    } finally {
      setSalvando(false);
    }
  };

  const marcar = async (p: Parcela) => {
    try {
      await atualizar("gestao_parcelas", p.id, { pago_em: ymd(hoje) });
      t.success("Parcela marcada como paga.");
      await recarregar(["parcelas"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui marcar a parcela."));
    }
  };
  const desfazer = async (p: Parcela) => {
    try {
      await atualizar("gestao_parcelas", p.id, { pago_em: null });
      t.success("Pagamento desfeito.");
      await recarregar(["parcelas"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui desfazer o pagamento."));
    }
  };

  /** Excluir, só de dentro do modal (:4079, :4083-4084). Soft delete; o histórico guarda a versão paga. */
  const excluirParcela = async (id: string) => {
    try {
      await apagar("gestao_parcelas", id, "Não consegui excluir a parcela.");
      t.success("Parcela excluída.");
      fechar();
      await recarregar(["parcelas"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui excluir a parcela."));
    }
  };

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Parcelas do setup"
        subtitulo={`${formatBRL(pago)} recebidos · ${formatBRL(aberto2)} em aberto`}
        filtros={
          <select
            className="input"
            style={{ width: 240 }}
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            aria-label="Filtrar por cliente"
          >
            <option value="todos">Todos os clientes</option>
            {clientesOrdenados.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        }
        acoes={
          <>
            <HistoricoPagamentos
              tamanho="md"
              tabela="gestao_parcelas"
              clienteId={cliente !== "todos" ? cliente : undefined}
            />
            {pode && (
              <button type="button" className="btn btn-primary" onClick={abrirNova}>
                + Nova parcela
              </button>
            )}
          </>
        }
      />

      {pode && aberto && (
        <Modal
          titulo={editId ? "Editar parcela" : "Nova parcela de setup"}
          onClose={fechar}
          largura={520}
          rodape={
            <>
              {editId && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: "var(--os-erro)" }}
                    disabled={salvando}
                    onClick={() => void excluirParcela(editId)}
                  >
                    Excluir
                  </button>
                  <div className="flex-1" />
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={fechar} disabled={salvando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          <div className="muted small">
            Preencha a data do pagamento quando a parcela cair — ela entra no faturamento naquele dia.
          </div>
          <Campo rotulo="Cliente">
            <select
              className="input"
              value={form.clienteId}
              onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))}
            >
              <option value="">Escolha…</option>
              {clientesOrdenados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="row gap-2">
            <div className="flex-1">
              <Campo rotulo="Descrição">
                <select
                  className="input"
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                >
                  {DESCRICOES_PARCELA.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Campo>
            </div>
            <div className="flex-1">
              <Campo rotulo="Valor (R$)">
                <input
                  className="input mono"
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                />
              </Campo>
            </div>
          </div>
          <div className="row gap-2">
            <div className="flex-1">
              <Campo rotulo="Vencimento">
                <input
                  className="input"
                  type="date"
                  value={form.vencimento}
                  onChange={(e) => setForm((f) => ({ ...f, vencimento: e.target.value }))}
                />
              </Campo>
            </div>
            <div className="flex-1">
              <Campo rotulo="Data do pagamento">
                <input
                  className="input"
                  type="date"
                  value={form.pagoEm}
                  onChange={(e) => setForm((f) => ({ ...f, pagoEm: e.target.value }))}
                />
              </Campo>
            </div>
          </div>
        </Modal>
      )}

      {linhas.length === 0 ? (
        <Vazio
          icone="wallet"
          titulo="Nenhuma parcela lançada"
          mensagem="Cadastre a entrada e as parcelas do setup de cada cliente."
        />
      ) : (
        <CartaoTabela>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Descrição</th>
              <th style={{ textAlign: "right" }}>Valor</th>
              <th>Vencimento</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th></th>
              {pode && <th></th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ p, status }) => (
              <tr key={p.id}>
                <td>{nomeCliente(p.cliente_id)}</td>
                <td className="muted small">{p.descricao || "Parcela"}</td>
                <td className="mono small" style={{ textAlign: "right" }}>
                  {formatBRL(Number(p.valor) || 0)}
                </td>
                <td className="small">{dataBR(p.vencimento)}</td>
                <td className="small">{p.pago_em ? dataBR(p.pago_em) : "—"}</td>
                <td>
                  <span className={SELO_STATUS[status]}>{ROTULO_STATUS[status]}</span>
                </td>
                <td>
                  <HistoricoPagamentos tabela="gestao_parcelas" linhaId={p.id} />
                </td>
                {pode && (
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                      {p.pago_em ? (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => void desfazer(p)}>
                          Desfazer
                        </button>
                      ) : (
                        <button type="button" className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => void marcar(p)}>
                          Marcar pago
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label="Editar parcela"
                        title="Editar"
                        onClick={() => abrirEdicao(p)}
                      >
                        ✎
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </CartaoTabela>
      )}
    </AbaCasca>
  );
}
