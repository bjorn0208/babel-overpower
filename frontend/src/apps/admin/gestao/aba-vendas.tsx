/**
 * Aba Vendas — time comercial e parceiros: vendas do mês, vendedores, conferência do pagamento.
 * Regras seguidas: só classes de bundle.css + ui-gestao.tsx; dados via dados.ts (grave, confirme, depois recarregar);
 * contas via calculos.ts; nada de cor ou medida nova. Original: financeiro.html:1622-1725 (viewVendas),
 * :1727-1767 (modalVendedor), :1790-1913 (modalVenda), :1914-1927 (vendaParaCliente).
 *
 * Decisão do Theus (CLAUDE.md): venda já vem do formulário público — esta tela é só gestão/lista/edição interna.
 * Decisão do Theus (2026-09-24): o app não guarda comprovante. O vendedor preenche a página de venda por fora e o
 * preenchimento chega aqui; o botão "Venda Realizada" (filtro Parceiro, artefato :1474) só entrega esse endereço para copiar.
 *
 * Lote 6 (2026-09-24, igual ao artefato): filtro por vendedor; coluna Contato; marca "veio de Indicações";
 * filtro de tipo dentro do painel Vendedores, com "Venda Realizada" nos Parceiros; excluir venda e vendedor só
 * dentro do modal, com a confirmação do artefato; vendedor novo ganha código (V-NOME-XXXX); máscaras de
 * WhatsApp, data e moeda; validação de e-mail; sem paginação; KPIs e vendedores continuam sem venda.
 * Financeiro vê os botões de gravar (artefato :3254); o banco só aceita depois do FLUXO-EMPURRADO.sql.
 */

import { useMemo, useState } from "react";
import { dataDeBR, emailValido, mascararData, mascararWhatsapp } from "./calculos";
import { useConfirmacao } from "./confirmacao";
import { atualizar, apagar, inserir, mensagemDeErro } from "./dados";
import { norm, waLink } from "./logica-indicacao";
import { ModalCliente } from "./aba-clientes";
import { LINK_VENDA_REALIZADA, ModalLinkPublico } from "./modais-cadastro";
import {
  PLANOS,
  STATUS_VENDA,
  dataBR,
  dataHoraBR,
  formatBRL,
  formatBRLInteiro,
  hojeLocal,
  podeEscrever,
  rotuloMes,
  type Papel,
  type PropsAba,
  type ToastApi,
  type Vendedor,
  type Venda,
} from "./tipos";
import {
  AbaCasca,
  CabecalhoAba,
  Campo,
  CartaoTabela,
  Kpi,
  LinhaKpis,
  Modal,
  Segmentado,
  Selo,
  Vazio,
} from "./ui-gestao";

const TIPOS: Array<[string, string]> = [
  ["todos", "Todos"],
  ["interno", "Time interno"],
  ["parceiro", "Parceiros"],
];
const STATUS: Array<[string, string]> = [["todos", "Todas"], ...STATUS_VENDA];
/** ORDEM_PLANOS (:1576). */
const ORDEM_PLANOS = ["vip", "profissional", "basico"];

/**
 * Quem grava vendas e vendedores. O artefato deixa o Financeiro gravar (:3254); a RLS atual só deixa o
 * Comercial, e `plano-integracao/2026-09-24/FLUXO-EMPURRADO.sql` (ainda não aplicado) acrescenta o Financeiro.
 * A tela já mostra os botões ao Financeiro; até o SQL entrar, o banco recusa e o erro aparece (nada finge sucesso).
 */
const podeGravarVendas = (papeis: Papel[]): boolean =>
  podeEscrever(papeis, "vendas") || papeis.includes("financeiro");

/** resolverVendedor — original :1583-1590 (sem o `vendedorCodigo`: gestao_vendas não tem essa coluna). */
function resolverVendedor(v: Venda, vendedores: Vendedor[]): Vendedor | null {
  if (v.vendedor_id) {
    const a = vendedores.find((x) => x.id === v.vendedor_id);
    if (a) return a;
  }
  const n = norm(v.vendedor_nome);
  if (!n) return null;
  const achados = vendedores.filter((x) => norm(x.nome) === n);
  return achados.length === 1 ? achados[0] : null;
}

/** codigoVendedor — :1591-1596: V-PRIMEIRONOME-XXXX, sem repetir código já usado. */
function codigoVendedor(nome: string, vendedores: Vendedor[]): string {
  const base =
    norm(nome)
      .split(" ")[0]
      .replace(/[^a-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 10) || "VEND";
  const usados = new Set(vendedores.map((v) => String(v.codigo || "").toUpperCase()));
  let codigo = "";
  do {
    codigo = `V-${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  } while (usados.has(codigo));
  return codigo;
}

/** mascaraMoeda / moedaDeTexto — :1604-1612: só dígitos, em centavos. */
function mascararMoeda(valor: string): string {
  const d = valor.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
  return d ? formatBRL(Number(d) / 100) : "";
}
const moedaDeTexto = (t: string): number => {
  const d = t.replace(/\D/g, "");
  return d ? Number(d) / 100 : 0;
};

/** Selo do tipo de vendedor (:1665): parceiro = aviso, time interno = roxo (aurora na babel). */
const tomTipo = (tipo: string | null) => ((tipo || "interno") === "parceiro" ? "aviso" : "aurora");
const rotuloTipo = (tipo: string | null) => ((tipo || "interno") === "parceiro" ? "Parceiro" : "Time interno");

interface TotaisMes {
  qtd: number;
  setup: number;
  mensalidade: number;
  pendentes: number;
}

/** doMes / setupMes / mrrMes / pend — original :1624-1628. */
function totaisDoMes(vendas: Venda[], mes: string): TotaisMes {
  const t: TotaisMes = { qtd: 0, setup: 0, mensalidade: 0, pendentes: 0 };
  for (const v of vendas) {
    if ((v.status || "pendente") === "pendente") t.pendentes++;
    if (v.data_venda && v.data_venda.slice(0, 7) === mes && v.status !== "recusada") {
      t.qtd++;
      t.setup += Number(v.setup) || 0;
      if (v.plano && PLANOS[v.plano]) t.mensalidade += PLANOS[v.plano].valor;
    }
  }
  return t;
}

interface TotaisVendedor {
  total: number;
  noMes: number;
  setupNoMes: number;
}

/** porVend — original :1629-1634: conta vendas confirmadas (fora negociação/recusada) por vendedor. */
function totaisPorVendedor(
  combinados: Array<{ v: Venda; vd: Vendedor | null }>,
  mes: string,
): Map<string, TotaisVendedor> {
  const m = new Map<string, TotaisVendedor>();
  for (const { v, vd } of combinados) {
    if (!vd || v.status === "recusada" || v.status === "negociacao") continue;
    const o = m.get(vd.id) ?? { total: 0, noMes: 0, setupNoMes: 0 };
    o.total++;
    if (v.data_venda && v.data_venda.slice(0, 7) === mes) {
      o.noMes++;
      o.setupNoMes += Number(v.setup) || 0;
    }
    m.set(vd.id, o);
  }
  return m;
}

/** WhatsApp com wa.me e e-mail com mailto (:1668, :1712-1713). */
function Contato({ whatsapp, email }: { whatsapp: string | null; email: string | null }) {
  const wa = waLink(whatsapp);
  if (!whatsapp && !email) return <span className="muted tiny">—</span>;
  return (
    <div className="tiny">
      {whatsapp &&
        (wa ? (
          <a className="fmt-link" href={wa} target="_blank" rel="noopener noreferrer">
            {whatsapp}
          </a>
        ) : (
          whatsapp
        ))}
      {whatsapp && email && <br />}
      {email && (
        <a className="fmt-link" href={`mailto:${email}`}>
          {email}
        </a>
      )}
    </div>
  );
}

export function AbaVendas({ dados, papeis, mes, t, recarregar }: PropsAba) {
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [vendedorFiltro, setVendedorFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [modalVenda, setModalVenda] = useState<"novo" | Venda | null>(null);
  const [modalVendedor, setModalVendedor] = useState<"novo" | Vendedor | null>(null);
  const [criarClienteDe, setCriarClienteDe] = useState<Venda | null>(null);
  const [linkAberto, setLinkAberto] = useState(false);
  const pode = podeGravarVendas(papeis);
  const podeClientes = podeEscrever(papeis, "clientes");
  const conf = useConfirmacao();

  const combinados = useMemo(
    () => dados.vendas.map((v) => ({ v, vd: resolverVendedor(v, dados.vendedores) })),
    [dados.vendas, dados.vendedores],
  );
  const totais = useMemo(() => totaisDoMes(dados.vendas, mes), [dados.vendas, mes]);
  const porVendedor = useMemo(() => totaisPorVendedor(combinados, mes), [combinados, mes]);
  const clientePorId = useMemo(() => new Set(dados.clientes.map((c) => c.id)), [dados.clientes]);

  const vendedoresVisiveis = useMemo(
    () =>
      dados.vendedores
        .filter((v) => tipo === "todos" || (v.tipo || "interno") === tipo)
        .sort(
          (a, b) =>
            (porVendedor.get(b.id)?.noMes ?? 0) - (porVendedor.get(a.id)?.noMes ?? 0) ||
            a.nome.localeCompare(b.nome, "pt-BR"),
        ),
    [dados.vendedores, tipo, porVendedor],
  );
  const vendedoresOrdenados = useMemo(
    () => [...dados.vendedores].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.vendedores],
  );

  const q = norm(busca);
  const listaVendas = useMemo(
    () =>
      combinados
        .filter(({ v }) => status === "todos" || (v.status || "pendente") === status)
        .filter(({ vd }) => {
          // filtro de vendedor (:1672-1674)
          if (vendedorFiltro === "sem") return !vd;
          if (vendedorFiltro !== "todos") return vd?.id === vendedorFiltro;
          return true;
        })
        .filter(({ v, vd }) => {
          if (!q) return true;
          const alvo = norm(
            [v.cliente_nome, v.empresa, v.nicho, v.email, v.whatsapp, v.vendedor_nome, vd?.nome]
              .filter(Boolean)
              .join(" "),
          );
          return alvo.includes(q);
        })
        .sort(
          (a, b) =>
            (b.v.data_venda || "").localeCompare(a.v.data_venda || "") ||
            (b.v.criado_em || "").localeCompare(a.v.criado_em || ""),
        ),
    [combinados, status, vendedorFiltro, q],
  );

  async function mudarStatusVenda(v: Venda, novo: string) {
    try {
      await atualizar("gestao_vendas", v.id, { status: novo });
      await recarregar(["vendas"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui mudar o status da venda."));
    }
  }

  /** Excluir venda — :1824-1827 (soft delete). */
  function excluirVenda(v: Venda) {
    conf.pedir({
      titulo: "Excluir venda",
      mensagem: `Excluir a venda de ${v.cliente_nome || "este cliente"}? Essa ação não pode ser desfeita.`,
      rotulo: "Excluir",
      perigo: true,
      aoConfirmar: async () => {
        try {
          await apagar("gestao_vendas", v.id, "Não consegui excluir a venda.");
          t.success("Venda excluída.");
          setModalVenda(null);
          await recarregar(["vendas"]);
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui excluir a venda."));
        }
      },
    });
  }

  /** Excluir vendedor — :1750-1754 (soft delete). */
  function excluirVendedor(vd: Vendedor, qtd: number) {
    conf.pedir({
      titulo: "Excluir vendedor",
      mensagem: `Excluir ${vd.nome}?${qtd ? ` As ${qtd} vendas dele continuam registradas, mas ficam sem vendedor identificado.` : ""}`,
      rotulo: "Excluir",
      perigo: true,
      aoConfirmar: async () => {
        try {
          await apagar("gestao_vendedores", vd.id, "Não consegui excluir o vendedor.");
          t.success("Vendedor excluído.");
          setModalVendedor(null);
          await recarregar(["vendedores"]);
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui excluir o vendedor."));
        }
      },
    });
  }

  async function criarClienteDaVenda(id: string, v: Venda) {
    try {
      await atualizar("gestao_vendas", v.id, {
        cliente_id: id,
        status: v.status === "pendente" ? "conferida" : v.status,
      });
      await recarregar(["vendas", "clientes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Cliente criado, mas não consegui vincular à venda."));
    }
  }

  const qtdVendasDe = (vd: Vendedor) => combinados.filter((x) => x.vd?.id === vd.id).length;

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Vendas"
        subtitulo={`Time comercial e parceiros · ${rotuloMes(mes)}.`}
        acoes={
          pode && (
            <>
              <button type="button" className="btn" onClick={() => setModalVendedor("novo")}>
                + Novo vendedor
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setModalVenda("novo")}>
                + Registrar venda
              </button>
            </>
          )
        }
      />

      <LinhaKpis>
        <Kpi
          destaque
          rotulo="Vendas no mês"
          valor={String(totais.qtd)}
          sub={totais.qtd ? "pela data da venda" : "nenhuma venda no mês"}
        />
        <Kpi rotulo="Setup vendido" valor={formatBRLInteiro(totais.setup)} sub="no mês" />
        <Kpi
          rotulo="Mensalidade contratada"
          valor={formatBRLInteiro(totais.mensalidade)}
          sub="soma dos planos vendidos no mês"
        />
        <Kpi
          rotulo="Aguardando conferência"
          valor={String(totais.pendentes)}
          sub={totais.pendentes ? "confira o pagamento" : "tudo conferido"}
        />
      </LinhaKpis>

      <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="row gap-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div className="h3">Vendedores</div>
          <Segmentado opcoes={TIPOS} valor={tipo} onChange={setTipo} />
          {tipo === "parceiro" && LINK_VENDA_REALIZADA && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setLinkAberto(true)}
            >
              Venda Realizada
            </button>
          )}
        </div>
        {tipo === "parceiro" && (
          <div className="muted small" style={{ marginTop: 8 }}>
            Envie o link de <b>Venda Realizada</b> aos parceiros: quando fecharem uma venda, eles preenchem a página e
            mandam os dados para a babel.
          </div>
        )}
        {dados.vendedores.length === 0 ? (
          <div className="muted small" style={{ marginTop: 8 }}>
            Nenhum vendedor cadastrado. Clique em “+ Novo vendedor” para começar.
          </div>
        ) : vendedoresVisiveis.length === 0 ? (
          <div className="muted small" style={{ marginTop: 8 }}>
            Nenhum vendedor nesse filtro.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <CartaoTabela>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Contato</th>
                  <th style={{ textAlign: "right" }}>Vendas no mês</th>
                  <th style={{ textAlign: "right" }}>Setup no mês</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vendedoresVisiveis.map((v) => {
                  const st = porVendedor.get(v.id) ?? { total: 0, noMes: 0, setupNoMes: 0 };
                  return (
                    <tr key={v.id}>
                      <td>
                        <div>{v.nome}</div>
                        <div className="row gap-1" style={{ marginTop: 2 }}>
                          <Selo tom={tomTipo(v.tipo)}>{rotuloTipo(v.tipo)}</Selo>
                          {v.ativo === false && <Selo>Inativo</Selo>}
                        </div>
                      </td>
                      <td>
                        <Contato whatsapp={v.whatsapp} email={v.email} />
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {st.noMes}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {formatBRLInteiro(st.setupNoMes)}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {st.total}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {pode && (
                          <button type="button" className="btn btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => setModalVendedor(v)}>
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </CartaoTabela>
          </div>
        )}
      </div>

      <div
        className="os-card row gap-3"
        style={{ padding: "14px 16px", marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}
      >
        <Segmentado opcoes={STATUS} valor={status} onChange={setStatus} />
        <div className="row gap-2" style={{ marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            className="input"
            style={{ width: 220 }}
            value={vendedorFiltro}
            onChange={(e) => setVendedorFiltro(e.target.value)}
            aria-label="Filtrar por vendedor"
          >
            <option value="todos">Todos os vendedores</option>
            <option value="sem">Vendedor não identificado</option>
            {vendedoresOrdenados.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="Buscar cliente, empresa, nicho"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar venda"
          />
        </div>
      </div>

      {listaVendas.length === 0 ? (
        <Vazio
          icone="dollar"
          titulo={dados.vendas.length ? "Nenhuma venda com esses filtros" : "Nenhuma venda registrada"}
          mensagem={
            dados.vendas.length
              ? "Ajuste os filtros ou a busca."
              : "Clique em “+ Registrar venda” para lançar a primeira."
          }
        />
      ) : (
        <CartaoTabela>
          <thead>
            <tr>
              <th>Data</th>
              <th>Vendedor</th>
              <th>Cliente · empresa</th>
              <th>Contato</th>
              <th>Plano</th>
              <th style={{ textAlign: "right" }}>Setup</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {listaVendas.map(({ v, vd }) => {
              const st = v.status || "pendente";
              const plano = v.plano ? PLANOS[v.plano] : undefined;
              const cadastrado = !!v.cliente_id && clientePorId.has(v.cliente_id);
              return (
                <tr key={v.id}>
                  <td className="mono small">{dataBR(v.data_venda)}</td>
                  <td>
                    {vd ? (
                      <>
                        <div className="small">{vd.nome}</div>
                        <div className="muted tiny">{rotuloTipo(vd.tipo)}</div>
                      </>
                    ) : (
                      <>
                        <div className="small">{v.vendedor_nome || "—"}</div>
                        <div className="tiny" style={{ color: "var(--os-aviso)" }}>
                          não identificado
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="small">{v.cliente_nome || "—"}</div>
                    <div className="muted tiny">{[v.empresa, v.nicho].filter(Boolean).join(" · ")}</div>
                    {v.origem === "indicacao" && (
                      <div className="tiny" style={{ color: "var(--os-acento-2)" }}>
                        veio de Indicações
                      </div>
                    )}
                    {cadastrado && (
                      <div className="tiny" style={{ color: "var(--os-sucesso)" }}>
                        cadastrado em Clientes
                      </div>
                    )}
                  </td>
                  <td>
                    <Contato whatsapp={v.whatsapp} email={v.email} />
                  </td>
                  <td>
                    {plano ? (
                      <>
                        <Selo tom="aurora">{plano.nome}</Selo>
                        <div className="muted tiny" style={{ marginTop: 2 }}>
                          {formatBRLInteiro(plano.valor)}/mês
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {st === "negociacao" && !v.setup ? "—" : formatBRL(Number(v.setup) || 0)}
                  </td>
                  <td>
                    {pode ? (
                      <select
                        className="input"
                        style={{ width: 170 }}
                        value={st}
                        onChange={(e) => void mudarStatusVenda(v, e.target.value)}
                        aria-label="Status da venda"
                      >
                        {STATUS_VENDA.map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      STATUS_VENDA.find(([k]) => k === st)?.[1] || st
                    )}
                  </td>
                  <td>
                    {pode && (
                      <div className="row gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {!cadastrado && podeClientes && (
                          <button type="button" className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => setCriarClienteDe(v)}>
                            Criar cliente
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          aria-label="Editar venda"
                          title="Editar"
                          onClick={() => setModalVenda(v)}
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </CartaoTabela>
      )}

      {modalVenda && (
        <ModalVenda
          venda={modalVenda === "novo" ? null : modalVenda}
          vendedores={dados.vendedores}
          t={t}
          onClose={() => setModalVenda(null)}
          onSalvo={() => void recarregar(["vendas"])}
          onExcluir={excluirVenda}
        />
      )}
      {modalVendedor && (
        <ModalVendedor
          vendedor={modalVendedor === "novo" ? null : modalVendedor}
          vendedores={dados.vendedores}
          qtdVendas={modalVendedor === "novo" ? 0 : qtdVendasDe(modalVendedor)}
          t={t}
          onClose={() => setModalVendedor(null)}
          onSalvo={() => void recarregar(["vendedores"])}
          onExcluir={excluirVendedor}
        />
      )}
      {criarClienteDe && (
        <ModalCliente
          cliente={null}
          preset={{
            nome: criarClienteDe.cliente_nome || criarClienteDe.empresa || undefined,
            email: criarClienteDe.email ?? undefined,
            telefone: criarClienteDe.whatsapp ?? undefined,
            fechamento: criarClienteDe.data_venda ?? undefined,
            setup: criarClienteDe.setup ?? undefined,
            mensalidade: criarClienteDe.plano ? (PLANOS[criarClienteDe.plano]?.valor ?? undefined) : undefined,
            situacao: "Vigente",
            obs:
              [
                criarClienteDe.empresa,
                criarClienteDe.nicho,
                criarClienteDe.plano ? `Plano ${PLANOS[criarClienteDe.plano]?.nome}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          }}
          t={t}
          onClose={() => setCriarClienteDe(null)}
          onSalvo={(id) => void criarClienteDaVenda(id, criarClienteDe)}
        />
      )}

      {linkAberto && LINK_VENDA_REALIZADA && (
        <ModalLinkPublico
          titulo="Venda Realizada"
          texto="Compartilhe este link com os parceiros. Quando fecharem uma venda, eles preenchem vendedor, data, setup, plano e os dados do cliente, e a venda aparece aqui na aba Vendas."
          rotulo="Link da página de venda realizada"
          link={LINK_VENDA_REALIZADA}
          msgCopia="Link de venda realizada copiado."
          t={t}
          onClose={() => setLinkAberto(false)}
        />
      )}
      {conf.elemento}
    </AbaCasca>
  );
}

// ---------------------------------------------------------------------------
// Modal vendedor — original financeiro.html:1727-1767 (modalVendedor).
// ---------------------------------------------------------------------------

function ModalVendedor({
  vendedor,
  vendedores,
  qtdVendas,
  t,
  onClose,
  onSalvo,
  onExcluir,
}: {
  vendedor: Vendedor | null;
  vendedores: Vendedor[];
  qtdVendas: number;
  t: ToastApi;
  onClose: () => void;
  onSalvo: () => void;
  onExcluir: (vd: Vendedor, qtd: number) => void;
}) {
  const novo = !vendedor;
  const [nome, setNome] = useState(vendedor?.nome ?? "");
  const [whatsapp, setWhatsapp] = useState(vendedor?.whatsapp ?? "");
  const [email, setEmail] = useState(vendedor?.email ?? "");
  const [tipo, setTipo] = useState(vendedor?.tipo ?? "interno");
  const [ativo, setAtivo] = useState(vendedor?.ativo !== false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const n = nome.trim();
    if (!n) {
      t.error("Informe o nome do vendedor.");
      return;
    }
    const mail = email.trim();
    if (!emailValido(mail)) {
      t.error("Confira o e-mail.");
      return;
    }
    setSalvando(true);
    try {
      const campos = { nome: n, whatsapp: whatsapp.trim() || null, email: mail || null, tipo, ativo };
      if (novo) await inserir("gestao_vendedores", { ...campos, codigo: codigoVendedor(n, vendedores) });
      else await atualizar("gestao_vendedores", vendedor.id, campos);
      t.success(novo ? "Vendedor cadastrado." : "Vendedor atualizado.");
      onSalvo();
      onClose();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar o vendedor."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Novo vendedor" : "Editar vendedor"}
      onClose={onClose}
      largura={460}
      rodape={
        <>
          {!novo && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--os-erro)" }}
                disabled={salvando}
                onClick={() => onExcluir(vendedor, qtdVendas)}
              >
                Excluir
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
        {novo
          ? "Cadastre quem vende pelo time interno ou como parceiro."
          : `${qtdVendas} venda${qtdVendas === 1 ? "" : "s"} registrada${qtdVendas === 1 ? "" : "s"}.`}
        {!novo && vendedor.codigo ? ` Código: ${vendedor.codigo}.` : ""}
      </div>
      <Campo rotulo="Nome">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="WhatsApp">
            <input
              className="input"
              inputMode="numeric"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
            />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="E-mail">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Tipo">
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="interno">Time interno</option>
              <option value="parceiro">Parceiro externo</option>
            </select>
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Situação">
            <select className="input" value={ativo ? "1" : "0"} onChange={(e) => setAtivo(e.target.value === "1")}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </Campo>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal venda — original financeiro.html:1790-1913 (modalVenda), sem comprovante (o app não guarda arquivo).
// ---------------------------------------------------------------------------

function ModalVenda({
  venda,
  vendedores,
  t,
  onClose,
  onSalvo,
  onExcluir,
}: {
  venda: Venda | null;
  vendedores: Vendedor[];
  t: ToastApi;
  onClose: () => void;
  onSalvo: () => void;
  onExcluir: (v: Venda) => void;
}) {
  const novo = !venda;
  const vdAtual = venda ? resolverVendedor(venda, vendedores) : null;
  const [vendedorId, setVendedorId] = useState(vdAtual?.id ?? "");
  const [vendedorNome, setVendedorNome] = useState(venda?.vendedor_nome ?? "");
  // :1803 — dd/mm/aaaa com máscara; venda nova já vem com hoje
  const [dataVenda, setDataVenda] = useState(
    venda?.data_venda ? dataBR(venda.data_venda) : novo ? dataBR(ymdHoje()) : "",
  );
  const [setup, setSetup] = useState(venda?.setup ? formatBRL(Number(venda.setup)) : "");
  const [plano, setPlano] = useState(venda?.plano ?? "");
  const [clienteNome, setClienteNome] = useState(venda?.cliente_nome ?? "");
  const [empresa, setEmpresa] = useState(venda?.empresa ?? "");
  const [nicho, setNicho] = useState(venda?.nicho ?? "");
  const [whatsapp, setWhatsapp] = useState(venda?.whatsapp ?? "");
  const [email, setEmail] = useState(venda?.email ?? "");
  const [status, setStatus] = useState(venda?.status ?? "pendente");
  const [obs, setObs] = useState(venda?.obs ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const negociacao = status === "negociacao";
    const dtxt = dataVenda.trim();
    const dataISO = dtxt ? dataDeBR(dtxt) : "";
    if ((dtxt && !dataISO) || (!dataISO && !negociacao)) {
      t.error("Informe a data da venda no formato dd/mm/aaaa.");
      return;
    }
    const cliente = clienteNome.trim();
    if (!cliente) {
      t.error("Informe o nome do cliente.");
      return;
    }
    if (!negociacao && !plano) {
      t.error("Escolha o plano mensal.");
      return;
    }
    const mail = email.trim();
    if (!emailValido(mail)) {
      t.error("Confira o e-mail do cliente.");
      return;
    }
    setSalvando(true);
    try {
      const vendedorCadastrado = vendedores.find((v) => v.id === vendedorId);
      const campos = {
        vendedor_id: vendedorId || null,
        vendedor_nome: vendedorNome.trim() || vendedorCadastrado?.nome || null,
        data_venda: dataISO || null,
        setup: moedaDeTexto(setup),
        plano: plano || null,
        cliente_nome: cliente,
        empresa: empresa.trim() || null,
        nicho: nicho.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: mail || null,
        status,
        obs: obs.trim() || null,
      };
      if (novo) await inserir("gestao_vendas", { ...campos, origem: "manual" });
      else await atualizar("gestao_vendas", venda.id, campos);
      t.success(novo ? "Venda registrada." : "Venda atualizada.");
      onSalvo();
      onClose();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a venda."));
    } finally {
      setSalvando(false);
    }
  }

  const nota = novo
    ? "Registre a venda."
    : `Recebida em ${dataHoraBR(venda.criado_em).slice(0, 10)}${
        venda.origem === "pagina" ? " pela página de vendas" : venda.origem === "indicacao" ? " vinda de Indicações" : ""
      }.`;

  return (
    <Modal
      titulo={novo ? "Registrar venda" : `Venda de ${venda.cliente_nome || ""}`}
      onClose={onClose}
      largura={600}
      rodape={
        <>
          {!novo && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--os-erro)" }}
                disabled={salvando}
                onClick={() => onExcluir(venda)}
              >
                Excluir
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
        {nota}
        {status === "negociacao" && " Ao fechar, preencha data, setup e plano e mude o status."}
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Vendedor cadastrado">
            <select
              className="input"
              value={vendedorId}
              onChange={(e) => {
                setVendedorId(e.target.value);
                const x = vendedores.find((v) => v.id === e.target.value);
                if (x) setVendedorNome(x.nome);
              }}
            >
              <option value="">— não identificado —</option>
              {vendedores
                .slice()
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
            </select>
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Nome do vendedor ou parceiro">
            <input className="input" value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Data da venda">
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              placeholder="dd/mm/aaaa"
              value={dataVenda}
              onChange={(e) => setDataVenda(mascararData(e.target.value))}
            />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Preço da venda (setup)">
            <input
              className="input mono"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={setup}
              onChange={(e) => setSetup(mascararMoeda(e.target.value))}
            />
          </Campo>
        </div>
      </div>
      <Campo rotulo="Plano mensal">
        <select className="input" value={plano} onChange={(e) => setPlano(e.target.value)}>
          <option value="">Selecione o plano</option>
          {ORDEM_PLANOS.map((k) => (
            <option key={k} value={k}>
              {PLANOS[k].nome} — {formatBRL(PLANOS[k].valor)}/mês
            </option>
          ))}
        </select>
        <div className="muted tiny" style={{ marginTop: 4 }}>
          {ORDEM_PLANOS.map((k, i) => (
            <span key={k}>
              {i > 0 && " · "}
              <b>{PLANOS[k].nome}:</b> {PLANOS[k].leads} = {formatBRL(PLANOS[k].valor)}
            </span>
          ))}
        </div>
      </Campo>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Nome do cliente">
            <input className="input" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Nome da empresa">
            <input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Nicho">
            <input className="input" value={nicho} onChange={(e) => setNicho(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="WhatsApp">
            <input
              className="input"
              inputMode="numeric"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
            />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="E-mail">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Status">
            <select className="input" value={status ?? "pendente"} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_VENDA.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <Campo rotulo="Anotações do time">
        <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
    </Modal>
  );
}

/** Hoje como AAAA-MM-DD local (sem fuso), para o padrão da data da venda nova. */
function ymdHoje(): string {
  const d = hojeLocal();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
