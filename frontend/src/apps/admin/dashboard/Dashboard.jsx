import { useState, useMemo } from 'react';
import { Icon, useToast, useTween, MiniChart } from '@/bundle/bundle-shared';

export function Dashboard() {
  const [periodo, setPeriodo] = useState('30d');
  const t = useToast();

  // KPIs reais injetados por useDadosBundle (fallback para mock se ausente).
  // window.RAGENTIC_DATA pode não ter sido injetado → optional chaining evita crash.
  const dataByPeriod = window.RAGENTIC_DATA?.KPIS_ADMIN || {
    '7d':  { tenants: 234, agentes: 89, msgs: 12420, custo: 842, pts: 7  },
    '30d': { tenants: 234, agentes: 89, msgs: 84200, custo: 3420, pts: 30 },
    '90d': { tenants: 234, agentes: 89, msgs: 251000, custo: 9840, pts: 12 },
    'total':{ tenants: 234, agentes: 89, msgs: 482000, custo: 18420, pts: 24 },
  };
  // Período sem dado (ex.: KPIS_ADMIN injetado só com alguns períodos) → cai num
  // objeto seguro pra não estourar em cur.pts / cur.tenants undefined.
  const cur = dataByPeriod[periodo] || dataByPeriod['30d'] || { tenants: 0, agentes: 0, msgs: 0, custo: 0, pts: 0 };

  const cresc = useMemo(() => Array.from({length: cur?.pts ?? 0}, (_, i) => {
    return 180 + Math.round(20 * Math.sin(i / 2) + i * 1.6 + Math.random() * 4);
  }), [periodo]);
  const cstos = useMemo(() => Array.from({length: cur?.pts ?? 0}, (_, i) => {
    return 80 + Math.round(40 * Math.sin(i / 3.2) + i * 3 + Math.random() * 16);
  }), [periodo]);

  const Kpi = ({ titulo, valor, sub, trend, icon, format = (v) => v.toLocaleString('pt-BR') }) => {
    const tweened = useTween(valor, 800);
    return (
      <div className="os-card lift" style={{ padding: 18, flex: 1 }}>
        <div className="row gap-2" style={{ justifyContent:'space-between' }}>
          <div className="title-section">{titulo}</div>
          <div className="row center" style={{
            width:30, height:30, borderRadius:8,
            background:'linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))'
          }}><Icon name={icon} size={14} /></div>
        </div>
        <div className="kpi-num" style={{ fontSize: 32, marginTop: 6, marginBottom: 2, letterSpacing:'-0.02em' }}>
          {format(Math.round(tweened))}
        </div>
        <div className="row gap-2 small">
          <span className={`badge ${trend > 0 ? 'badge-success' : trend < 0 ? 'badge-err' : ''}`} style={{ fontSize: 10 }}>
            <Icon name={trend > 0 ? 'trending' : 'trendingDown'} size={10} /> {Math.abs(trend)}%
          </span>
          <span className="muted small">{sub}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent:'space-between', alignItems:'flex-end', marginBottom: 18 }}>
        <div>
          <div className="h1">Bom dia, <span className="os-aurora-text">Theus</span>.</div>
          <div className="muted small" style={{ marginTop: 4 }}>Visão geral da plataforma em tempo real.</div>
        </div>
        <div className="tabs">
          {['7d','30d','90d','total'].map(p => (
            <span key={p} className={`tab ${periodo===p?'tab-on':''}`} onClick={() => setPeriodo(p)}>{p === 'total' ? 'Tudo' : p}</span>
          ))}
        </div>
      </div>

      <div className="row gap-3" style={{ marginBottom: 16 }}>
        <Kpi titulo="Tenants ativos" valor={cur.tenants} sub="vs. período anterior" trend={+8} icon="users" />
        <Kpi titulo="Agentes vivos"  valor={cur.agentes} sub="rodando 24/7"        trend={+4} icon="bot" />
        <Kpi titulo="Mensagens"      valor={cur.msgs}    sub="trocadas no período" trend={+22} icon="message" />
        <Kpi titulo="Custo tokens"   valor={cur.custo}   sub="USD em LLM"          trend={-3} icon="dollar"
             format={(v) => '$' + v.toLocaleString('pt-BR')} />
      </div>

      <div className="row gap-3">
        <div className="os-card" style={{ padding: 18, flex: 1.4 }}>
          <div className="row" style={{ justifyContent:'space-between', marginBottom: 10 }}>
            <div>
              <div className="h3">Crescimento de tenants</div>
              <div className="muted small">Acumulado por dia</div>
            </div>
            <span className="badge badge-info">+18 este mês</span>
          </div>
          <MiniChart data={cresc} type="area" height={200} />
        </div>
        <div className="os-card" style={{ padding: 18, flex: 1 }}>
          <div className="row" style={{ justifyContent:'space-between', marginBottom: 10 }}>
            <div>
              <div className="h3">Custo operacional</div>
              <div className="muted small">USD em tokens LLM</div>
            </div>
            <span className="badge badge-warn">-3% economia</span>
          </div>
          <MiniChart data={cstos} type="area" height={200}
            color="oklch(0.78 0.18 80)" color2="oklch(0.6 0.18 80)" />
        </div>
      </div>

      <div className="row gap-3" style={{ marginTop: 16 }}>
        <div className="os-card" style={{ padding: 18, flex: 1 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Top tenants por uso</div>
          {(window.RAGENTIC_DATA?.TENANTS ?? []).filter(x => x.status !== 'excluido').slice(0,5).sort((a,b) => b.tokens - a.tokens).map((tt, i) => (
            <div key={tt.id} className="row gap-3" style={{ padding: '8px 0', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div className="dim mono" style={{ width: 18 }}>{i+1}</div>
              <div className="avatar" style={{ background:'#5b8bea', width: 28, height: 28, fontSize: 11 }}>{tt.avatar}</div>
              <div style={{ flex:1 }}>
                <div className="h3" style={{ fontSize: 13 }}>{tt.nome}</div>
                <div className="muted tiny">{tt.plano}</div>
              </div>
              <div className="mono small">{tt.tokens.toLocaleString('pt-BR')} tok</div>
              <div style={{ width: 80 }}><MiniChart data={Array.from({length:8},()=>Math.random()*100+20)} height={28} /></div>
            </div>
          ))}
        </div>

        <div className="os-card" style={{ padding: 18, flex: 0.8 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Saúde do motor</div>
          {[
            { l: 'Porteiro (gemma-3-27b-it)', s: 'ok', v: '+91% acurácia' },
            { l: 'Síntese (gemini-2.5-flash)', s: 'ok', v: 'P95 1.2s' },
            { l: 'Z-API ↔ webhook', s: 'ok', v: '0 falhas' },
            { l: 'Embedding (text-embed-3)', s: 'warn', v: 'fila 124' },
            { l: 'Postgres RLS', s: 'ok', v: '< 50ms' },
          ].map((row, i) => (
            <div key={i} className="row gap-3" style={{ padding: '10px 0', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span className={`dot dot-${row.s === 'ok' ? 'on' : 'warn'}`}></span>
              <div style={{ flex:1 }} className="small">{row.l}</div>
              <span className="mono tiny muted">{row.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
