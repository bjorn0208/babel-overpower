/**
 * Aba Atividade babel — tokens e leads por cliente e mês, SÓ LEITURA: o sistema informa o consumo
 * real (rpc `gestao_atividade_uso` sobre logs_requisicao_llm e leads, por `gestao_clientes.profile_id`);
 * `AtividadeFinal` já chega pronta em `dados.atividade` (`carregarAtividade`/`atividadeDeUso`).
 * Original: financeiro.html:931-991 (viewAtividade). Decisão do Theus (2026-09-22): ninguém digita
 * tokens/leads aqui; a sobreposição manual (`dados.salvarAtividade`) continua existindo no banco e
 * na camada de dados, mas não tem mais campo na tela.
 *
 * Gráficos: `GraficoBarras` (grafico-barras.tsx) reaproveitado com os 2 tipos que já existem em
 * `calculos.ts` (`"setup"`/`"mensalidade"`) só pela cor (setup = var(--os-acento-2), mensalidade = var(--os-acento-1); tokens usam a cor do setup e leads a da mensalidade, artefato :955-960); tokens e leads não
 * têm tipo próprio no gráfico compartilhado — ver nota em PROGRESSO-LOTE-E.md. `barrasDeSerie` é
 * local (converte `serieAtividade` de calculos.ts para o formato `Barra`; não existe lá porque
 * calculos.ts não conhece o tipo `Barra` de UI dessa forma genérica).
 *
 * Lote 6 (2026-09-24, igual ao artefato): KPIs, gráficos e tabela aparecem sempre (sem a tela vazia que os
 * escondia); subtítulo do artefato; "Clientes com lançamento X de N" conta sobre a lista filtrada (:951), com o
 * sub adaptado à decisão (o consumo vem do banco, não há nada "a preencher"); "Quem mais usou em «mês»" considera
 * todos os clientes (:936-939). Mantido por decisão do Theus: o aviso da idade do consumo (B10).
 */

import { useEffect, useMemo, useState } from "react";
import { ativo, frescorAtividade, serieAtividade, totaisAtividade, type Barra, type TipoBarra } from "./calculos";
import { carregarAtividadeAtualizadaEm } from "./dados";
import { Amostra, GraficoBarras } from "./grafico-barras";
import { formatInt, mesCurto, mesParaData, nomeMes, rotuloMes, type PropsAba } from "./tipos";
import { AbaCasca, CabecalhoAba, CartaoTabela, Kpi, LinhaKpis } from "./ui-gestao";

/** serieAtividade() (calculos.ts) → Barra[] de GraficoBarras: 1 segmento sólido por mês. */
function barrasDeSerie(
  serie: Array<{ mes: Date; chave: string; tokens: number; leads: number }>,
  campo: "tokens" | "leads",
  tipo: TipoBarra,
  mesAtivo: string,
): Barra[] {
  return serie.map((x) => ({
    rotulo: mesCurto(x.mes),
    agora: x.chave === mesAtivo,
    total: x[campo],
    segmentos: [{ valor: x[campo], tipo, previsto: false }],
  }));
}

export function AbaAtividade({ dados, mes, papeis }: PropsAba) {
  const [busca, setBusca] = useState("");
  // Idade do consumo (B10). Consulta barata (um `max()` sobre o cache) e isolada: se falhar, `null`,
  // e o `frescorAtividade` trata isso como "não deu para saber" — em tom de aviso, nunca em silêncio.
  const [atualizadaEm, setAtualizadaEm] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void carregarAtividadeAtualizadaEm(papeis).then((v) => {
      if (vivo) setAtualizadaEm(v);
    });
    return () => {
      vivo = false;
    };
  }, [papeis]);
  const frescor = frescorAtividade(atualizadaEm);
  const tot = totaisAtividade(mes, dados.atividade);
  const serie = useMemo(() => serieAtividade(mes, 6, dados.atividade), [mes, dados.atividade]);

  const ativos = useMemo(() => dados.clientes.filter(ativo), [dados.clientes]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ativos
      .filter((c) => !q || c.nome.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ativos, busca]);

  const valorDe = (clienteId: string) =>
    dados.atividade.find((a) => a.cliente_id === clienteId && a.competencia === mes) ?? null;

  const rank = useMemo(() => {
    return dados.clientes
      .map((c) => {
        const a = valorDe(c.id);
        return { nome: c.nome, tokens: a?.tokens ?? 0, leads: a?.leads ?? 0 };
      })
      .filter((r) => r.tokens > 0 || r.leads > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.clientes, dados.atividade, mes]);

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Atividade babel"
        subtitulo={`Tokens consumidos e leads atendidos por cliente em ${rotuloMes(mes)}.`}
        filtros={
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="Buscar cliente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar cliente"
          />
        }
      />

      <>
          <LinhaKpis>
            <Kpi rotulo="Tokens no mês" valor={formatInt(tot.tokens)} sub="soma de todos os clientes" />
            <Kpi rotulo="Leads atendidos no mês" valor={formatInt(tot.leads)} sub="soma de todos os clientes" />
            <Kpi
              rotulo="Clientes com lançamento"
              valor={`${tot.clientes} de ${lista.length}`}
              sub={`${Math.max(0, lista.length - tot.clientes)} sem consumo registrado no mês`}
            />
          </LinhaKpis>

          <div className="row gap-3" style={{ flexWrap: "wrap", marginBottom: 16, alignItems: "stretch" }}>
            <div className="os-card" style={{ padding: 18, flex: 1, minWidth: 320 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                <div className="h3">Tokens por mês</div>
                <span className="row gap-1 small muted">
                  <Amostra tipo="setup" /> últimos 6 meses
                </span>
              </div>
              <GraficoBarras
                id="ativ-tokens"
                barras={barrasDeSerie(serie, "tokens", "setup", mes)}
                aria="Tokens por mês"
                altura={190}
                larguraMaxBarra={36}
                larguraPorBarra={74}
                formatoTotal={formatInt}
                formatoDica={formatInt}
              />
            </div>
            <div className="os-card" style={{ padding: 18, flex: 1, minWidth: 320 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                <div className="h3">Leads por mês</div>
                <span className="row gap-1 small muted">
                  <Amostra tipo="mensalidade" /> últimos 6 meses
                </span>
              </div>
              <GraficoBarras
                id="ativ-leads"
                barras={barrasDeSerie(serie, "leads", "mensalidade", mes)}
                aria="Leads por mês"
                altura={190}
                larguraMaxBarra={36}
                larguraPorBarra={74}
                formatoTotal={formatInt}
                formatoDica={formatInt}
              />
            </div>
          </div>

          {rank.length > 0 && (
            <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
              <div className="h3" style={{ marginBottom: 8 }}>
                Quem mais usou em {nomeMes(mesParaData(mes))}
              </div>
              {rank.map((r, i) => (
                <div
                  key={r.nome}
                  className="row gap-3"
                  style={{ padding: "8px 0", borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }} className="small">
                    {r.nome}
                  </div>
                  <div className="muted tiny">{formatInt(r.leads)} leads</div>
                  <div className="mono small">{formatInt(r.tokens)} tokens</div>
                </div>
              ))}
            </div>
          )}

          {/* B10 (auditoria): a frase antiga dizia "atualizado periodicamente" e a tela não tinha como
              saber se isso era verdade. Agora ela diz a idade do dado e avisa quando passa do limite. */}
          <div className="os-card" style={{ padding: "10px 14px", marginBottom: 16 }}>
            <span className={frescor.velho ? "small" : "muted small"} style={frescor.velho ? { color: "var(--os-aviso)" } : undefined}>
              {frescor.velho ? "⚠ " : ""}
              {frescor.rotulo}
              {frescor.velho ? " O número abaixo pode estar desatualizado — avise quem cuida do sistema." : ""}
            </span>
            <br />
            <span className="muted small">
              O consumo vem do sistema — não há nada para digitar aqui. Trocar o mês no topo abre
              outro período.
            </span>
          </div>

          {
            <CartaoTabela>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Suporte</th>
                  <th style={{ textAlign: "right", width: 150 }}>Tokens no mês</th>
                  <th style={{ textAlign: "right", width: 150 }}>Leads no mês</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const a = valorDe(c.id);
                  return (
                    <tr key={c.id}>
                      <td>{c.nome}</td>
                      <td className="muted small">{c.suporte || "—"}</td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {formatInt(a?.tokens ?? 0)}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {formatInt(a?.leads ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total do mês</td>
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {formatInt(tot.tokens)}
                  </td>
                  <td className="mono small" style={{ textAlign: "right" }}>
                    {formatInt(tot.leads)}
                  </td>
                </tr>
              </tfoot>
            </CartaoTabela>
          }
      </>
    </AbaCasca>
  );
}
