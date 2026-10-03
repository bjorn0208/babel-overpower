/**
 * Aba Painel — faturamento, previsibilidade, setup a receber, MRR, atrasos, atividade e suporte do mês.
 * Original: financeiro.html:698-824 (viewPainel). Regras: só classes de bundle.css + ui-gestao.tsx; contas via
 * calculos.ts; nada de cor ou medida nova.
 *
 * Lote 6 (2026-09-24, igual ao artefato):
 *  - ordem dos blocos do artefato: KPIs → Faturamento e previsão → (Setup a receber | Setup por cliente) →
 *    Atividade babel → Suporte → Próximos vencimentos;
 *  - "Setup a receber" (parcelas em aberto do mês até +5) e "Leads por mês" desenhados;
 *  - "Setup por cliente" em barra horizontal empilhada, com a legenda Recebido / Em aberto;
 *  - Suporte com os 4 KPIs e as próximas reuniões com cliente e responsável; o bloco aparece também para o
 *    Financeiro (no artefato o Financeiro vê as reuniões no Painel, :3239-3243);
 *  - sem o KPI inventado "Clientes com uso X de N" e sem a tela vazia que escondia os KPIs.
 */

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  barrasFaturamento,
  barrasSetupAReceber,
  proximosVencimentos,
  resumo,
  resumoReunioes,
  serieAtividade,
  serieMes,
  setupPorCliente,
  statusVenc,
  totaisAtividade,
  ROTULO_STATUS,
  SELO_STATUS,
  type Barra,
} from "./calculos";
import { lerTabela } from "./dados";
import { Amostra, GraficoBarras, GraficoBarrasHorizontais } from "./grafico-barras";
import {
  dataBR,
  formatBRL,
  formatBRLInteiro,
  formatInt,
  hojeLocal,
  mesCurto,
  mesLongo,
  mesParaData,
  addMeses,
  nomeMes,
  podeLer,
  ymd,
  type PropsAba,
  type Reuniao,
} from "./tipos";
import { AbaCasca, CabecalhoAba, Faixa, Kpi, LinhaKpis } from "./ui-gestao";

/** Cabeçalho de seção do Painel (artefato `.head` com h2 de 17px + parágrafo, :769-770 e :792-793). */
function CabecalhoSecao({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div style={{ marginTop: 26, marginBottom: 14 }}>
      <div className="h2" style={{ fontSize: 17 }}>
        {titulo}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        {subtitulo}
      </div>
    </div>
  );
}

/** Painel com título e nota à direita (artefato `.panel > header`). */
function Painel({
  titulo,
  nota,
  children,
  estilo,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
  estilo?: React.CSSProperties;
}) {
  return (
    <div className="os-card" style={{ padding: 18, minWidth: 0, ...estilo }}>
      <div className="row gap-2" style={{ alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
        <div className="h3">{titulo}</div>
        {nota && <span className="muted small">{nota}</span>}
      </div>
      {children}
    </div>
  );
}

/** Duas colunas que viram uma em janela estreita (artefato `.grid2`). */
function Grade2({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

export function AbaPainel({ dados, mes, papeis }: PropsAba) {
  const hoje = useMemo(() => hojeLocal(), []);
  const fin = useMemo(
    () => ({
      clientes: dados.clientes,
      parcelas: dados.parcelas,
      mensalidades: dados.mensalidades,
    }),
    [dados.clientes, dados.parcelas, dados.mensalidades],
  );
  const r = useMemo(() => resumo(mes, fin, hoje), [mes, fin, hoje]);
  const serie = useMemo(() => serieMes(mes, 5, 6, fin, hoje), [mes, fin, hoje]);
  const barras = useMemo(() => barrasFaturamento(serie, mes, mesCurto), [serie, mes]);
  const proximos = useMemo(() => proximosVencimentos(fin, mes, hoje), [fin, mes, hoje]);
  const ref = mesParaData(mes);

  // Setup a receber (:732-734): setup previsto do mês do topo até +5 meses
  const barrasReceber = useMemo(
    () => barrasSetupAReceber(serieMes(mes, 0, 5, fin, hoje), mesCurto),
    [mes, fin, hoje],
  );

  // Setup por cliente (:721-730): recebido sólido + em aberto hachurado, os 8 maiores
  const linhasSetup = useMemo(
    () => setupPorCliente(fin).map((l) => ({ rotulo: l.rotulo, a: l.recebido, b: l.aberto })),
    [fin],
  );

  // Atividade babel (:766-785): `dados.atividade` vem da casca (Gestao.tsx) para quem lê atividade.
  const leAtividade = podeLer(papeis, "atividade");
  const totAtividade = useMemo(() => totaisAtividade(mes, dados.atividade), [mes, dados.atividade]);
  const serieAtiv = useMemo(() => serieAtividade(mes, 6, dados.atividade), [mes, dados.atividade]);
  const barrasAtiv = (campo: "tokens" | "leads"): Barra[] =>
    serieAtiv.map((x) => ({
      rotulo: mesCurto(x.mes),
      agora: x.chave === mes,
      total: x[campo],
      // cores do artefato: tokens = --bar-setup, leads = --bar-mens (:777, :781)
      segmentos: [{ valor: x[campo], tipo: campo === "tokens" ? "setup" : "mensalidade", previsto: false }],
    }));

  // Suporte (:787-809). Quem lê reuniões (suporte/admin) já as tem em `dados.reunioes`. O Financeiro vê este
  // bloco no artefato; aqui a tela pede as reuniões ao banco e mostra o que a RLS devolver. Hoje a política
  // `reunioes_le` só deixa suporte/admin: para o Financeiro volta vazio até a RLS mudar (pendência de banco).
  const leReunioes = podeLer(papeis, "reunioes");
  const [reunioesExtra, setReunioesExtra] = useState<Reuniao[]>([]);
  useEffect(() => {
    if (leReunioes) return;
    let vivo = true;
    lerTabela<Reuniao>("gestao_reunioes", "data")
      .then((l) => vivo && setReunioesExtra(l))
      .catch(() => vivo && setReunioesExtra([]));
    return () => {
      vivo = false;
    };
  }, [leReunioes]);
  const reunioes = leReunioes ? dados.reunioes : reunioesExtra;
  const rSuporte = useMemo(() => resumoReunioes(reunioes, mes, hoje), [reunioes, mes, hoje]);
  const nomeCliente = (id: string | null) => dados.clientes.find((c) => c.id === id)?.nome ?? "—";

  return (
    <AbaCasca>
      {r.atrasoQtd > 0 && (
        <Faixa tom="aviso">
          <b>
            {r.atrasoQtd} cobrança{r.atrasoQtd > 1 ? "s" : ""} em atraso
          </b>{" "}
          — {formatBRL(r.atrasoValor)} vencidos há mais de 3 dias.
        </Faixa>
      )}
      <CabecalhoAba
        titulo={mesLongo(ref)}
        subtitulo="Faturamento realizado, previsão de mensalidades e setups a receber."
      />

      <LinhaKpis>
        <Kpi
          rotulo="Faturamento do mês"
          valor={formatBRLInteiro(r.faturamento)}
          sub={`Setup ${formatBRLInteiro(r.fatSetup)} · Mensal. ${formatBRLInteiro(r.fatMens)}`}
        />
        <Kpi
          destaque
          rotulo={`Previsibilidade — ${nomeMes(addMeses(ref, 1))}`}
          valor={formatBRLInteiro(r.previsibilidade)}
          sub={`MRR ${formatBRLInteiro(r.mrr)} + setup ${formatBRLInteiro(r.setupProx)}`}
        />
        <Kpi
          rotulo="Setup a receber no mês"
          valor={formatBRLInteiro(r.setupReceber)}
          sub={`parcelas em aberto que vencem em ${nomeMes(ref)}`}
        />
        <Kpi
          rotulo="Mensalidades a receber"
          valor={formatBRLInteiro(r.mensReceber)}
          sub={`recebidas: ${formatBRLInteiro(r.mensRecebida)}`}
        />
        <Kpi
          rotulo="MRR contratado"
          valor={formatBRLInteiro(r.mrr)}
          sub={`${r.clientesAtivos} clientes ativos · ${r.novos} novos no mês`}
        />
      </LinhaKpis>

      <Painel
        titulo="Faturamento e previsão"
        nota="12 meses · barras sólidas = recebido, hachuradas = previsto"
        estilo={{ marginBottom: 16 }}
      >
        <div className="row gap-3 small muted" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <span className="row gap-1">
            <Amostra tipo="mensalidade" /> Mensalidade recebida
          </span>
          <span className="row gap-1">
            <Amostra tipo="setup" /> Setup recebido
          </span>
          <span className="row gap-1">
            <Amostra tipo="mensalidade" previsto /> Mensalidade prevista
          </span>
          <span className="row gap-1">
            <Amostra tipo="setup" previsto /> Setup previsto
          </span>
        </div>
        <GraficoBarras
          id="painel-fat"
          barras={barras}
          aria="Faturamento e previsão por mês"
          altura={250}
          larguraMaxBarra={34}
          dicaCompleta={{ titulo: (i) => mesLongo(serie[i].mes) }}
        />
      </Painel>

      <Grade2>
        <Painel titulo="Setup a receber" nota="parcelas em aberto, por vencimento">
          <GraficoBarras
            id="painel-setup-receber"
            barras={barrasReceber}
            aria="Setup a receber por mês"
            altura={200}
            larguraMaxBarra={38}
            larguraPorBarra={72}
            larguraMinima={400}
          />
        </Painel>
        <Painel titulo="Setup por cliente" nota="quanto já entrou e quanto falta">
          <div className="row gap-3 small muted" style={{ flexWrap: "wrap", marginBottom: 8 }}>
            <span className="row gap-1">
              <Amostra tipo="mensalidade" /> Recebido
            </span>
            <span className="row gap-1">
              <Amostra tipo="setup" previsto /> Em aberto
            </span>
          </div>
          <GraficoBarrasHorizontais
            id="painel-setup-cliente"
            linhas={linhasSetup}
            aria="Setup recebido e em aberto por cliente"
            formato={formatBRLInteiro}
          />
        </Painel>
      </Grade2>

      <CabecalhoSecao titulo="Atividade babel" subtitulo="Consumo de tokens e leads atendidos pela plataforma." />
      {!leAtividade ? (
        <div className="muted small" style={{ marginBottom: 16 }}>
          Atividade não faz parte do seu acesso.
        </div>
      ) : (
        <>
          <LinhaKpis>
            <Kpi
              rotulo={`Tokens em ${nomeMes(ref)}`}
              valor={formatInt(totAtividade.tokens)}
              sub={`${totAtividade.clientes} clientes com lançamento`}
            />
            <Kpi
              rotulo="Leads atendidos no mês"
              valor={formatInt(totAtividade.leads)}
              sub="consumo informado pelo sistema (aba Atividade babel)"
            />
          </LinhaKpis>
          <Grade2>
            <Painel titulo="Tokens por mês" nota="últimos 6 meses">
              <GraficoBarras
                id="painel-tokens"
                barras={barrasAtiv("tokens")}
                aria="Tokens por mês"
                altura={180}
                larguraMaxBarra={34}
                larguraPorBarra={72}
                larguraMinima={380}
                formatoTotal={formatInt}
                formatoDica={formatInt}
              />
            </Painel>
            <Painel titulo="Leads por mês" nota="últimos 6 meses">
              <GraficoBarras
                id="painel-leads"
                barras={barrasAtiv("leads")}
                aria="Leads por mês"
                altura={180}
                larguraMaxBarra={34}
                larguraPorBarra={72}
                larguraMinima={380}
                formatoTotal={formatInt}
                formatoDica={formatInt}
              />
            </Painel>
          </Grade2>
        </>
      )}

      <CabecalhoSecao titulo="Suporte" subtitulo={`Reuniões do time com os clientes em ${mesLongo(ref)}.`} />
      <LinhaKpis>
        <Kpi
          rotulo="Reuniões concluídas"
          valor={String(rSuporte.contagem.Concluída)}
          cor="var(--os-sucesso)"
          sub={rSuporte.semRelato ? `${rSuporte.semRelato} ainda sem relato` : "todas com relato preenchido"}
        />
        <Kpi
          rotulo="Agendadas"
          valor={String(rSuporte.contagem.Agendada)}
          cor="var(--os-acento-2-brilho)"
          sub={`${rSuporte.proximas.length} próximas na agenda`}
        />
        <Kpi
          rotulo="Remarcadas"
          valor={String(rSuporte.contagem.Remarcada)}
          sub="no mês selecionado"
          cor="var(--os-aviso)"
        />
        <Kpi
          rotulo="Canceladas"
          valor={String(rSuporte.contagem.Cancelada)}
          sub="no mês selecionado"
          cor="var(--os-erro)"
        />
      </LinhaKpis>
      <Painel titulo="Próximas reuniões" nota="agenda do time de suporte" estilo={{ marginBottom: 16 }}>
        {rSuporte.proximas.length === 0 ? (
          <div className="muted small" style={{ padding: "12px 0" }}>
            Nenhuma reunião agendada. Use a aba <b>Suporte</b> para marcar.
          </div>
        ) : (
          rSuporte.proximas.map((rn, i) => (
            <div
              key={rn.id}
              className="row gap-3"
              style={{
                padding: "8px 0",
                borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none",
                flexWrap: "wrap",
              }}
            >
              <span className="badge badge-aurora">
                {dataBR(rn.data)}
                {rn.hora ? ` · ${rn.hora}` : ""}
              </span>
              <span className="h3" style={{ fontSize: 13 }}>
                {nomeCliente(rn.cliente_id)}
              </span>
              <span className="muted small" style={{ flex: 1, minWidth: 0 }}>
                {rn.tipo || "Acompanhamento"}
              </span>
              <span className="muted small">{rn.responsavel || "sem responsável"}</span>
            </div>
          ))
        )}
      </Painel>

      <Painel titulo="Próximos vencimentos" nota="setup e mensalidades ainda em aberto">
        {proximos.length === 0 && (
          <div className="muted small" style={{ padding: "12px 0" }}>
            Nada em aberto.
          </div>
        )}
        {proximos.map((p, i) => {
          const st = statusVenc(p.venc, null, hoje);
          return (
            <div
              key={i}
              className="row gap-3"
              style={{
                padding: "8px 0",
                borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <span className={SELO_STATUS[st]} title={ROTULO_STATUS[st]}>
                {dataBR(ymd(p.venc))}
              </span>
              <span className="h3" style={{ fontSize: 13 }}>
                {p.quem}
              </span>
              <span className="muted small" style={{ flex: 1, minWidth: 0 }}>
                {p.oQue}
              </span>
              <span className="mono small">{formatBRL(p.valor)}</span>
            </div>
          );
        })}
      </Painel>
    </AbaCasca>
  );
}
