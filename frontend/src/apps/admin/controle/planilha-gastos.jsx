import { useMemo, useState } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

// Planilha de gastos LLM — app Controle (admin). Escolhe período, gera grade
// estilo planilha (dia × modelo, subtotal por dia, total geral) e baixa .xlsx.
// Fonte: custos_llm_dia (alimentada pela edge cron-coletar-custos-llm).
// Conversão pra R$: PTAX venda do BCB do dia do gasto (fill-forward em fds/feriado).

const BORDA = '1px solid rgba(255,255,255,0.09)';
const COLUNAS = [
  { letra: 'A', titulo: 'Dia', alinhamento: 'left', largura: 96 },
  { letra: 'B', titulo: 'Modelo', alinhamento: 'left', largura: 230 },
  { letra: 'C', titulo: 'Provedor', alinhamento: 'left', largura: 110 },
  { letra: 'D', titulo: 'Requisições', alinhamento: 'right', largura: 96 },
  { letra: 'E', titulo: 'Tokens entrada', alinhamento: 'right', largura: 110 },
  { letra: 'F', titulo: 'Tokens saída', alinhamento: 'right', largura: 105 },
  { letra: 'G', titulo: 'Tokens raciocínio', alinhamento: 'right', largura: 120 },
  { letra: 'H', titulo: 'Custo (US$)', alinhamento: 'right', largura: 100 },
  { letra: 'I', titulo: 'Custo (R$)', alinhamento: 'right', largura: 100 },
];

const num = (v) => Number(v ?? 0);
const fmtInt = (v) => num(v).toLocaleString('pt-BR');
const fmtMoeda = (v) => num(v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtDia = (iso) => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};
const isoHoje = () => new Date().toISOString().slice(0, 10);
const isoDiasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Busca a PTAX venda por dia no BCB e devolve mapa iso→taxa com fill-forward. */
async function buscarCambioPorDia(dataInicio, dataFim) {
  const paraBcb = (iso) => {
    const [ano, mes, dia] = iso.split('-');
    return `${mes}-${dia}-${ano}`;
  };
  // Folga de 6 dias pra trás garante cotação de dia útil anterior a fds/feriado.
  const inicioComFolga = new Date(new Date(`${dataInicio}T12:00:00Z`).getTime() - 6 * 86400000)
    .toISOString().slice(0, 10);
  const url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/'
    + `CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)`
    + `?@dataInicial='${paraBcb(inicioComFolga)}'&@dataFinalCotacao='${paraBcb(dataFim)}'`
    + '&$format=json&$select=cotacaoVenda,dataHoraCotacao&$orderby=dataHoraCotacao';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BCB respondeu ${res.status}`);
  const corpo = await res.json();
  const porDiaUtil = new Map();
  for (const c of corpo?.value ?? []) {
    porDiaUtil.set(String(c.dataHoraCotacao).slice(0, 10), num(c.cotacaoVenda));
  }
  if (porDiaUtil.size === 0) throw new Error('BCB sem cotação no período');

  const mapa = new Map();
  let ultima = null;
  for (let t = new Date(`${inicioComFolga}T12:00:00Z`).getTime();
    t <= new Date(`${dataFim}T12:00:00Z`).getTime(); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (porDiaUtil.has(iso)) ultima = porDiaUtil.get(iso);
    if (ultima != null) mapa.set(iso, ultima);
  }
  return mapa;
}

/** Agrupa as linhas cruas por dia e soma subtotais + total geral (US$ e R$). */
function agruparPorDia(linhas, cambio) {
  const taxa = (dia) => cambio?.get(dia) ?? null;
  const dias = new Map();
  for (const l of linhas) {
    if (!dias.has(l.dia)) dias.set(l.dia, []);
    dias.get(l.dia).push(l);
  }
  const soma = (lista, campo) => lista.reduce((acc, l) => acc + num(l[campo]), 0);
  const somaBrl = (lista) => lista.reduce((acc, l) => {
    const t = taxa(l.dia);
    return t == null ? acc : acc + num(l.custo_usd) * t;
  }, 0);
  const grupos = [...dias.entries()].map(([dia, modelos]) => ({
    dia,
    taxa: taxa(dia),
    modelos,
    subtotal: {
      requisicoes: soma(modelos, 'requisicoes'),
      tokens_entrada: soma(modelos, 'tokens_entrada'),
      tokens_saida: soma(modelos, 'tokens_saida'),
      tokens_raciocinio: soma(modelos, 'tokens_raciocinio'),
      custo_usd: soma(modelos, 'custo_usd'),
      custo_brl: somaBrl(modelos),
    },
  }));
  const total = {
    requisicoes: soma(linhas, 'requisicoes'),
    tokens_entrada: soma(linhas, 'tokens_entrada'),
    tokens_saida: soma(linhas, 'tokens_saida'),
    tokens_raciocinio: soma(linhas, 'tokens_raciocinio'),
    custo_usd: soma(linhas, 'custo_usd'),
    custo_byok_usd: soma(linhas, 'custo_byok_usd'),
    custo_brl: somaBrl(linhas),
  };
  return { grupos, total };
}

function Celula({ children, alinhamento = 'left', forte = false, indice = false }) {
  return (
    <td className={indice ? '' : 'mono'} style={{
      border: BORDA, padding: '5px 9px', fontSize: 12, textAlign: alinhamento,
      fontWeight: forte ? 700 : 400, whiteSpace: 'nowrap',
      color: indice ? 'rgba(255,255,255,0.35)' : undefined,
      background: indice ? 'rgba(255,255,255,0.03)' : undefined,
    }}>{children}</td>
  );
}

export function PlanilhaGastos() {
  const [dataInicio, setDataInicio] = useState(isoDiasAtras(6));
  const [dataFim, setDataFim] = useState(isoHoje());
  const [linhas, setLinhas] = useState(null);
  const [cambio, setCambio] = useState(null); // Map iso→PTAX venda, null = indisponível
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState('');
  const [avisoCambio, setAvisoCambio] = useState('');

  const gerar = async () => {
    setCarregando(true);
    setErro('');
    setAvisoCambio('');
    const [resposta, mapaCambio] = await Promise.all([
      supabase
        .from('custos_llm_dia')
        .select('dia, modelo, provedor, requisicoes, tokens_entrada, tokens_saida, tokens_raciocinio, custo_usd, custo_byok_usd')
        .gte('dia', dataInicio)
        .lte('dia', dataFim)
        .order('dia', { ascending: true })
        .order('custo_usd', { ascending: false }),
      buscarCambioPorDia(dataInicio, dataFim).catch(() => null),
    ]);
    if (resposta.error) setErro(resposta.error.message);
    if (!mapaCambio) setAvisoCambio('Câmbio do BCB indisponível agora — valores só em US$.');
    setCambio(mapaCambio);
    setLinhas(resposta.error ? [] : (resposta.data ?? []));
    setCarregando(false);
  };

  const sincronizar = async () => {
    setSincronizando(true);
    setErro('');
    const { data, error } = await supabase.functions.invoke('cron-coletar-custos-llm', { body: {} });
    if (error || !data?.ok) setErro(data?.erro || error?.message || 'falha ao sincronizar com o OpenRouter');
    else if (linhas !== null) await gerar();
    setSincronizando(false);
  };

  const { grupos, total } = useMemo(
    () => (linhas?.length ? agruparPorDia(linhas, cambio) : { grupos: [], total: null }),
    [linhas, cambio],
  );

  const brl = (usd, taxa) => (taxa == null ? '—' : fmtMoeda(num(usd) * taxa));

  const baixarExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [['Dia', 'Modelo', 'Provedor', 'Requisições', 'Tokens entrada', 'Tokens saída', 'Tokens raciocínio', 'Custo (US$)', 'Câmbio (R$/US$)', 'Custo (R$)', 'Custo BYOK (US$)']];
    const brlNum = (usd, taxa) => (taxa == null ? '' : Number((num(usd) * taxa).toFixed(6)));
    for (const g of grupos) {
      for (const m of g.modelos) {
        aoa.push([fmtDia(g.dia), m.modelo, m.provedor, num(m.requisicoes), num(m.tokens_entrada),
          num(m.tokens_saida), num(m.tokens_raciocinio), num(m.custo_usd), g.taxa ?? '',
          brlNum(m.custo_usd, g.taxa), num(m.custo_byok_usd)]);
      }
      aoa.push([`Total ${fmtDia(g.dia)}`, '', '', g.subtotal.requisicoes, g.subtotal.tokens_entrada,
        g.subtotal.tokens_saida, g.subtotal.tokens_raciocinio, g.subtotal.custo_usd, g.taxa ?? '',
        cambio ? Number(g.subtotal.custo_brl.toFixed(6)) : '', '']);
    }
    aoa.push(['TOTAL GERAL', '', '', total.requisicoes, total.tokens_entrada,
      total.tokens_saida, total.tokens_raciocinio, total.custo_usd, '',
      cambio ? Number(total.custo_brl.toFixed(6)) : '', total.custo_byok_usd]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos LLM');
    XLSX.writeFile(wb, `gastos-llm-${dataInicio}-a-${dataFim}.xlsx`);
  };

  const inputData = {
    background: 'rgba(255,255,255,0.05)', border: BORDA, borderRadius: 8,
    color: 'inherit', padding: '6px 10px', fontSize: 12.5, colorScheme: 'dark',
  };

  return (
    <div className="os-card" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="h3">Gastos por dia</div>
          <div className="muted tiny" style={{ marginTop: 2 }}>
            Custo LLM (OpenRouter) por dia e modelo. Dias fecham na virada UTC (21:00 BRT). R$ pela PTAX venda do dia (BCB).
          </div>
        </div>
        <div className="row gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={dataInicio} max={dataFim} style={inputData}
            onChange={(e) => setDataInicio(e.target.value)} aria-label="Data inicial" />
          <span className="muted small">até</span>
          <input type="date" value={dataFim} min={dataInicio} max={isoHoje()} style={inputData}
            onChange={(e) => setDataFim(e.target.value)} aria-label="Data final" />
          <button className="btn" onClick={gerar} disabled={carregando}>
            <Icon name="file" size={13} /> {carregando ? 'Gerando…' : 'Gerar planilha'}
          </button>
          <button className="btn" onClick={sincronizar} disabled={sincronizando} title="Puxar os últimos 30 dias do OpenRouter agora">
            <Icon name="refresh" size={13} /> {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
          </button>
          {linhas?.length > 0 && (
            <button className="btn" onClick={baixarExcel} title="Baixar o período gerado em .xlsx">
              <Icon name="download" size={13} /> Baixar Excel
            </button>
          )}
        </div>
      </div>

      {erro && <div className="tiny" style={{ color: 'oklch(0.75 0.19 25)', marginBottom: 8 }}>{erro}</div>}
      {avisoCambio && <div className="tiny" style={{ color: 'oklch(0.83 0.14 95)', marginBottom: 8 }}>{avisoCambio}</div>}

      {linhas === null && !carregando && (
        <div className="muted small">Escolhe o período e clica em “Gerar planilha”.</div>
      )}
      {linhas?.length === 0 && !carregando && (
        <div className="muted small">
          Sem gasto registrado nesse período. O OpenRouter só entrega os últimos 30 dias — daqui pra frente o histórico fica guardado e cresce.
        </div>
      )}

      {linhas?.length > 0 && (
        <div style={{ overflowX: 'auto', border: BORDA, borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1000 }}>
            <thead>
              <tr>
                <Celula indice alinhamento="center"> </Celula>
                {COLUNAS.map((c) => <Celula key={c.letra} indice alinhamento="center">{c.letra}</Celula>)}
              </tr>
              <tr style={{ position: 'sticky', top: 0, background: 'rgba(20,20,26,0.97)' }}>
                <Celula indice alinhamento="center">#</Celula>
                {COLUNAS.map((c) => (
                  <td key={c.titulo} style={{
                    border: BORDA, padding: '6px 9px', fontSize: 12, fontWeight: 700,
                    textAlign: c.alinhamento, minWidth: c.largura, whiteSpace: 'nowrap',
                  }}>{c.titulo}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return grupos.flatMap((g) => [
                  ...g.modelos.map((m, i) => {
                    n += 1;
                    return (
                      <tr key={`${g.dia}-${m.modelo}-${i}`}>
                        <Celula indice alinhamento="center">{n}</Celula>
                        <Celula>{i === 0 ? fmtDia(g.dia) : ''}</Celula>
                        <Celula>{m.modelo}</Celula>
                        <Celula>{m.provedor}</Celula>
                        <Celula alinhamento="right">{fmtInt(m.requisicoes)}</Celula>
                        <Celula alinhamento="right">{fmtInt(m.tokens_entrada)}</Celula>
                        <Celula alinhamento="right">{fmtInt(m.tokens_saida)}</Celula>
                        <Celula alinhamento="right">{fmtInt(m.tokens_raciocinio)}</Celula>
                        <Celula alinhamento="right">{fmtMoeda(m.custo_usd)}</Celula>
                        <Celula alinhamento="right">{brl(m.custo_usd, g.taxa)}</Celula>
                      </tr>
                    );
                  }),
                  (n += 1,
                  <tr key={`${g.dia}-subtotal`} style={{ background: 'rgba(255,255,255,0.045)' }}>
                    <Celula indice alinhamento="center">{n}</Celula>
                    <Celula forte>Total {fmtDia(g.dia)}</Celula>
                    <Celula> </Celula>
                    <Celula> </Celula>
                    <Celula alinhamento="right" forte>{fmtInt(g.subtotal.requisicoes)}</Celula>
                    <Celula alinhamento="right" forte>{fmtInt(g.subtotal.tokens_entrada)}</Celula>
                    <Celula alinhamento="right" forte>{fmtInt(g.subtotal.tokens_saida)}</Celula>
                    <Celula alinhamento="right" forte>{fmtInt(g.subtotal.tokens_raciocinio)}</Celula>
                    <Celula alinhamento="right" forte>{fmtMoeda(g.subtotal.custo_usd)}</Celula>
                    <Celula alinhamento="right" forte>{g.taxa == null ? '—' : fmtMoeda(g.subtotal.custo_brl)}</Celula>
                  </tr>),
                ]);
              })()}
              <tr style={{ background: 'linear-gradient(90deg, var(--os-acento-1-soft), var(--os-acento-2-soft))' }}>
                <Celula indice alinhamento="center"> </Celula>
                <Celula forte>TOTAL GERAL</Celula>
                <Celula>{grupos.length} {grupos.length === 1 ? 'dia' : 'dias'}</Celula>
                <Celula> </Celula>
                <Celula alinhamento="right" forte>{fmtInt(total.requisicoes)}</Celula>
                <Celula alinhamento="right" forte>{fmtInt(total.tokens_entrada)}</Celula>
                <Celula alinhamento="right" forte>{fmtInt(total.tokens_saida)}</Celula>
                <Celula alinhamento="right" forte>{fmtInt(total.tokens_raciocinio)}</Celula>
                <Celula alinhamento="right" forte>{fmtMoeda(total.custo_usd)}</Celula>
                <Celula alinhamento="right" forte>{cambio == null ? '—' : fmtMoeda(total.custo_brl)}</Celula>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
