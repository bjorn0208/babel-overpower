/**
 * PpPagamentoPlanos — seletor de pagamento alimentado pelos planos do Postgres
 * (dados_pagamento.planos, F2/DEC-042). Zero conta no client: toda opção exibida
 * veio pronta de calcular_plano_pagamento e foi congelada na geração do contrato.
 *
 * Mono-produto: à vista × parcelado (select de parcelas do plano).
 * Multi-produto: lead escolhe pagar tudo JUNTO (1 plano da soma) ou SEPARADO
 * (1 plano por produto, cada um com seu próprio parcelamento).
 */

import type { EscolhaPagamento, OpcaoNomeada, OpcaoPlano, PlanoPagamento, PlanosPagamento } from "./tipos";
import { brlCent } from "./helpers";

function rotuloOpcao(o: OpcaoPlano): string {
  const entrada = o.entrada_centavos > 0 ? `entrada de ${brlCent(o.entrada_centavos)} + ` : "";
  return `${entrada}${o.parcelas}× de ${brlCent(o.valor_parcela_centavos)}`;
}

function SelectParcelas({
  plano,
  valor,
  onChange,
}: {
  plano: PlanoPagamento;
  valor: number | null;
  onChange: (parcelas: number) => void;
}) {
  const opcoes = plano.opcoes.filter((o) => o.parcelas > 1);
  // Δ 2026-09-08 — com UMA opção não há escolha a fazer: o select virava uma caixa
  // com um item só, sugerindo alternativas que não existem. É o caso do plano fixo
  // (entrada de R$ 117,00 + 5× de R$ 147,00): o valor já está escrito no card acima.
  if (opcoes.length <= 1) return null;
  return (
    <select
      className="pp-input"
      style={{ marginTop: 8, width: "100%", fontSize: 13 }}
      value={valor ?? opcoes[opcoes.length - 1].parcelas}
      onChange={(e) => onChange(Number(e.target.value))}
      onClick={(e) => e.stopPropagation()}
    >
      {opcoes.map((o) => (
        <option key={o.parcelas} value={o.parcelas}>
          {rotuloOpcao(o)}
        </option>
      ))}
    </select>
  );
}

function CartaoModo({
  ativo,
  titulo,
  detalhe,
  onClick,
  children,
}: {
  ativo: boolean;
  titulo: string;
  detalhe: React.ReactNode;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`pp-pay-card ${ativo ? "is-on" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="pp-pay-radio" />
      <div style={{ flex: 1 }}>
        <div className="pp-pay-title">{titulo}</div>
        <div className="pp-pay-detail">{detalhe}</div>
        {ativo && children}
      </div>
    </div>
  );
}

/** Seletor à vista × parcelado de UM plano (usado no junto e em cada produto do separado). */
function SeletorPlano({
  plano,
  modo,
  parcelas,
  onEscolher,
}: {
  plano: PlanoPagamento;
  modo: "avista" | "parcelado" | null;
  parcelas: number | null;
  onEscolher: (modo: "avista" | "parcelado", parcelas: number | null) => void;
}) {
  const temParcelado = plano.opcoes.some((o) => o.parcelas > 1);
  const padraoParcelas = plano.max_parcelas;
  // Única forma de parcelar: o card descreve o plano em vez de pedir uma escolha.
  const parceladas = plano.opcoes.filter((o) => o.parcelas > 1);
  const opcaoUnica = parceladas.length === 1 ? parceladas[0] : null;
  const opcaoAtual =
    plano.opcoes.find((o) => o.parcelas === (parcelas ?? padraoParcelas)) ??
    plano.opcoes[plano.opcoes.length - 1];
  return (
    <>
      <CartaoModo
        ativo={modo === "avista"}
        titulo="À vista"
        detalhe={
          <>
            Pague <span className="pp-pay-num">{brlCent(plano.total_centavos)}</span> via PIX no
            ato da assinatura.
          </>
        }
        onClick={() => onEscolher("avista", null)}
      />
      {temParcelado && (
        <CartaoModo
          ativo={modo === "parcelado"}
          titulo="Parcelado"
          detalhe={
            modo === "parcelado" && opcaoAtual ? (
              <span className="pp-pay-num">{rotuloOpcao(opcaoAtual)}</span>
            ) : opcaoUnica ? (
              // Plano fixo: mostra o que é, sem convidar a escolher o que não dá.
              <span className="pp-pay-num">{rotuloOpcao(opcaoUnica)}</span>
            ) : (
              <>Em até <span className="pp-pay-num">{padraoParcelas}×</span>. Toque pra escolher as parcelas.</>
            )
          }
          onClick={() => onEscolher("parcelado", parcelas ?? padraoParcelas)}
        >
          <SelectParcelas
            plano={plano}
            valor={parcelas ?? padraoParcelas}
            onChange={(n) => onEscolher("parcelado", n)}
          />
        </CartaoModo>
      )}
    </>
  );
}

function detalheOpcaoNomeada(o: OpcaoNomeada): string {
  if (o.parcelas > 1 && o.entrada_centavos > 0) {
    return `entrada de ${brlCent(o.entrada_centavos)} + ${o.parcelas}× de ${brlCent(o.valor_parcela_centavos)}`;
  }
  if (o.parcelas > 1) return `${o.parcelas}× de ${brlCent(o.valor_parcela_centavos)}`;
  return "pagamento único";
}

/** Produto com opções nomeadas (total próprio por opção): um cartão por opção. */
function SeletorOpcoesNomeadas({
  opcoes,
  escolhida,
  onEscolher,
}: {
  opcoes: OpcaoNomeada[];
  escolhida: string | null;
  onEscolher: (id: string) => void;
}) {
  return (
    <>
      {opcoes.map((o) => (
        <CartaoModo
          key={o.id}
          ativo={escolhida === o.id}
          titulo={o.rotulo}
          detalhe={
            <>
              <span className="pp-pay-num">{brlCent(o.total_centavos)}</span> · {detalheOpcaoNomeada(o)}
              {o.observacao ? <><br />{o.observacao}</> : null}
            </>
          }
          onClick={() => onEscolher(o.id)}
        />
      ))}
    </>
  );
}

export function PagamentoComPlanos({
  planos,
  escolha,
  setEscolha,
}: {
  planos: PlanosPagamento;
  escolha: EscolhaPagamento | null;
  setEscolha: (e: EscolhaPagamento) => void;
}) {
  const multi = planos.separado.length > 1;
  const composicao = escolha?.composicao ?? "junto";

  const nomeadas = planos.junto.opcoes_nomeadas ?? [];
  if (!multi && nomeadas.length > 0) {
    return (
      <SeletorOpcoesNomeadas
        opcoes={nomeadas}
        escolhida={escolha?.modo === "opcao" ? escolha.opcao_id ?? null : null}
        onEscolher={(id) => setEscolha({ modo: "opcao", opcao_id: id, parcelas: null, composicao: "junto" })}
      />
    );
  }

  if (!multi) {
    return (
      <SeletorPlano
        plano={planos.junto}
        modo={escolha?.modo === "opcao" ? null : escolha?.modo ?? null}
        parcelas={escolha?.parcelas ?? null}
        onEscolher={(modo, parcelas) => setEscolha({ modo, parcelas, composicao: "junto" })}
      />
    );
  }

  const porProduto = escolha?.por_produto ?? [];
  function escolherProduto(produtoId: string, modo: "avista" | "parcelado", parcelas: number | null) {
    const resto = porProduto.filter((p) => p.produto_id !== produtoId);
    const novo = [...resto, { produto_id: produtoId, modo, parcelas }];
    setEscolha({
      modo: novo.some((p) => p.modo === "parcelado") ? "parcelado" : "avista",
      parcelas: null,
      composicao: "separado",
      por_produto: novo,
    });
  }

  return (
    <>
      {/* Nível 1: pagar tudo junto ou separado? */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <CartaoModo
          ativo={composicao === "junto"}
          titulo="Pagar tudo junto"
          detalhe={<>Total <span className="pp-pay-num">{brlCent(planos.junto.total_centavos)}</span></>}
          onClick={() => setEscolha({ modo: "avista", parcelas: null, composicao: "junto" })}
        />
        <CartaoModo
          ativo={composicao === "separado"}
          titulo="Pagar separado"
          detalhe={<>Cada produto com sua condição.</>}
          onClick={() => setEscolha({ modo: "avista", parcelas: null, composicao: "separado", por_produto: [] })}
        />
      </div>

      {/* Nível 2 */}
      {composicao === "junto" ? (
        <SeletorPlano
          plano={planos.junto}
          modo={escolha?.composicao === "junto" && escolha.modo && escolha.modo !== "opcao" ? escolha.modo : null}
          parcelas={escolha?.parcelas ?? null}
          onEscolher={(modo, parcelas) => setEscolha({ modo, parcelas, composicao: "junto" })}
        />
      ) : (
        planos.separado.map((plano) => {
          const item = plano.por_produto?.[0];
          if (!item) return null;
          const escolhaItem = porProduto.find((p) => p.produto_id === item.produto_id);
          return (
            <div key={item.produto_id} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--pp-ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                {item.nome ?? "Produto"}
              </div>
              <SeletorPlano
                plano={plano}
                modo={escolhaItem?.modo ?? null}
                parcelas={escolhaItem?.parcelas ?? null}
                onEscolher={(modo, parcelas) => escolherProduto(item.produto_id, modo, parcelas)}
              />
            </div>
          );
        })
      )}
    </>
  );
}

/** Avançar liberado? junto = modo escolhido; separado = todos os produtos escolhidos. */
export function escolhaCompleta(planos: PlanosPagamento, escolha: EscolhaPagamento | null): boolean {
  if (!escolha?.modo) return false;
  if (escolha.modo === "opcao") {
    return !!planos.junto.opcoes_nomeadas?.some((o) => o.id === escolha.opcao_id);
  }
  if ((escolha.composicao ?? "junto") === "junto") return true;
  const ids = planos.separado.map((p) => p.por_produto?.[0]?.produto_id).filter(Boolean);
  return ids.every((id) => escolha.por_produto?.some((p) => p.produto_id === id && p.modo));
}
