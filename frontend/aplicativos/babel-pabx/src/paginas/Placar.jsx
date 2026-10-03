import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'

const caixa = 'rounded-xl bg-surface border border-line'
const MEDALHAS = ['1º', '2º', '3º']

// barra do funil: discadas → atendidas → conversas → retornos → reuniões
function BarraFunil({ rotulo, valor, base, destaque }) {
  const pct = base > 0 ? Math.max(2, Math.round((valor / base) * 100)) : 0
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-2">{rotulo}</span>
        <span className={`tnum font-bold ${destaque && valor > 0 ? 'text-sinal' : 'text-ink'}`}>{valor}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <span className={`block h-full ${destaque ? 'bg-sinal' : 'bg-ink-3'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Placar da equipe — pontos vêm de dados REAIS do PABX:
// ligação feita = 1 · atendida = 2 · reunião marcada = 10 · conversão = 50
const REGRAS = [
  { pts: 1, rotulo: 'Ligação feita', desc: 'cada tentativa de ligação conta', cor: 'text-sky-300' },
  { pts: 2, rotulo: 'Ligação atendida', desc: 'quando a pessoa atende e conversa', cor: 'text-sinal' },
  { pts: 3, rotulo: 'Retorno atendido', desc: 'ligou no retorno que marcou e a pessoa atendeu — soma aos 3 de cima, dando 6', cor: 'text-sinal' },
  { pts: 10, rotulo: 'Reunião marcada', desc: 'agendou uma mentoria', cor: 'text-violet' },
  { pts: 50, rotulo: 'Conversão', desc: 'lead virou cliente (fechou!)', cor: 'text-amber' },
]

export default function Placar({ perfil, ehAdmin, aoAbrirAnalise, aoAbrirLead }) {
  const [periodo, setPeriodo] = useState('hoje') // hoje | semana
  const [ranking, setRanking] = useState([])
  const [meuDia, setMeuDia] = useState({ agenda: [], retornos: [] })
  const [verRegras, setVerRegras] = useState(false)
  const [inicio, setInicio] = useState(null) // marco zero: nada antes disso conta
  const [funil, setFunil] = useState([])     // funil-desfecho do dia, por vendedor

  useEffect(() => {
    supabase.rpc('funil_dia').then(({ data }) => setFunil(data || []))
  }, [])

  async function carregar() {
    // período calculado no servidor (fuso Brasília), imune ao relógio do aparelho
    const { data } = await supabase.rpc('placar', { _periodo: periodo })
    setRanking(data || [])
  }
  useEffect(() => { carregar() }, [periodo])

  useEffect(() => {
    supabase.rpc('placar_inicio').then(({ data }) => setInicio(data || null))
  }, [])

  useEffect(() => {
    async function meu() {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      const amanha = new Date(hoje.getTime() + 86400000)
      const [{ data: ag }, { data: ret }] = await Promise.all([
        supabase.from('agenda_eventos').select('titulo, inicio')
          .eq('vendedor', perfil.user_id).eq('status', 'marcado')
          .gte('inicio', hoje.toISOString()).lt('inicio', amanha.toISOString()).order('inicio'),
        supabase.from('leads').select('id, empresa')
          .eq('atribuido_a', perfil.user_id).eq('status', 'retorno')
          .lte('proxima_acao_em', new Date().toISOString()).limit(10),
      ])
      setMeuDia({ agenda: ag || [], retornos: ret || [] })
    }
    meu()
  }, [])

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex gap-1.5">
        {[['hoje', 'Hoje'], ['semana', '7 dias'], ['30dias', '30 dias'], ['total', 'Total']].map(([id, rotulo]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold border ${
              periodo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {rotulo}
          </button>
        ))}
      </div>
      {/* funil do dia (spec 2026-08-06): nasce dos desfechos de 1 toque */}
      {(() => {
        const meu = funil.find((f) => f.user_id === perfil.user_id)
        if (!meu || !meu.discadas) return null
        return (
          <div className={`${caixa} p-4 space-y-2.5`}>
            <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
              <Icone nome="raio" tam={13} className="text-sinal" />Meu funil de hoje
            </p>
            <BarraFunil rotulo="Discadas" valor={Number(meu.discadas)} base={Number(meu.discadas)} />
            <BarraFunil rotulo={`Atendidas · ${Math.round((meu.atendidas / meu.discadas) * 100)}%`}
              valor={Number(meu.atendidas)} base={Number(meu.discadas)} />
            <BarraFunil rotulo="Conversas de 1min+" valor={Number(meu.conversas)} base={Number(meu.discadas)} />
            <BarraFunil rotulo="Retornos marcados" valor={Number(meu.retornos)} base={Number(meu.discadas)} destaque />
            <BarraFunil rotulo="Reuniões marcadas" valor={Number(meu.reunioes)} base={Number(meu.discadas)} destaque />
            <p className="text-[10px] text-ink-3 tnum pt-0.5">
              Desfechos: {meu.nao_atendeu} não atendeu · {meu.caixa_postal} caixa postal · {meu.ocupado} ocupado
              · {meu.em_contato} passou o contato · {meu.sem_interesse} sem interesse
              · {meu.desligou} desligou · {meu.numero_errado} nº errado
            </p>
          </div>
        )
      })()}

      {ehAdmin && funil.length > 0 && (
        <div className={`${caixa} p-3 overflow-x-auto`}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Icone nome="equipe" tam={13} className="text-sinal" />Funil da equipe hoje
          </p>
          <table className="w-full text-[11px] tnum min-w-[430px]">
            <thead><tr className="text-ink-3 text-left">
              <th className="py-1 pr-2 font-semibold">Vendedor</th>
              <th className="py-1 pr-2 font-semibold text-right">Disc</th>
              <th className="py-1 pr-2 font-semibold text-right">Atend</th>
              <th className="py-1 pr-2 font-semibold text-right">1min+</th>
              <th className="py-1 pr-2 font-semibold text-right">Ret</th>
              <th className="py-1 pr-2 font-semibold text-right">Reun</th>
              <th className="py-1 font-semibold text-right">S/ int</th>
            </tr></thead>
            <tbody>
              {funil.map((f) => (
                <tr key={f.user_id} className="border-t border-line-soft">
                  <td className="py-1.5 pr-2 font-sans font-medium truncate max-w-[120px]">{f.nome?.split(' ')[0]}</td>
                  <td className="py-1.5 pr-2 text-right">{f.discadas}</td>
                  <td className="py-1.5 pr-2 text-right">{f.atendidas}</td>
                  <td className="py-1.5 pr-2 text-right">{f.conversas}</td>
                  <td className={`py-1.5 pr-2 text-right ${f.retornos > 0 ? 'text-sinal font-bold' : ''}`}>{f.retornos}</td>
                  <td className={`py-1.5 pr-2 text-right ${f.reunioes > 0 ? 'text-sinal font-bold' : ''}`}>{f.reunioes}</td>
                  <td className="py-1.5 text-right">{f.sem_interesse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button onClick={() => setVerRegras(!verRegras)}
        className="w-full text-xs text-ink-3 text-center underline">
        Ranking por pontos — {verRegras ? 'ocultar' : 'como funciona?'}
      </button>
      {verRegras && (
        <div className={`${caixa} p-4 space-y-2`}>
          <p className="text-sm font-semibold">Como você ganha pontos</p>
          {REGRAS.map((r) => (
            <div key={r.pts} className="flex items-center gap-3">
              <span className={`text-base font-bold w-12 text-right ${r.cor}`}>+{r.pts}</span>
              <span className="flex-1">
                <span className="block text-sm">{r.rotulo}</span>
                <span className="block text-xs text-ink-3">{r.desc}</span>
              </span>
            </div>
          ))}
          <div className="border-t border-line pt-2 mt-1 space-y-1">
            <p className="text-xs text-ink-2">
              O placar premia <b className="text-ink">resultado</b>, não só volume: marcar 1 reunião
              (10 pts) vale mais que 10 ligações discadas (10 pts), e 1 conversão (50 pts) vale por 25 ligações.
            </p>
            <p className="text-xs text-ink-2">
              <b className="text-ink">Exemplo:</b> 28 ligações + 10 atendidas = 28 + 20 = <b className="text-sinal">48 pontos</b>.
              Se 3 dessas atendidas forem retornos que você marcou, são <b className="text-sinal">+9</b>.
            </p>
            <p className="text-[11px] text-ink-3">Zera a cada dia (aba Hoje); as abas 7 dias e 30 dias somam os últimos 7 e 30 dias corridos.</p>
            {inicio && (
              <p className="text-[11px] text-ink-3">
                A contagem começou em{' '}
                <b className="text-ink-2">
                  {new Date(`${inicio}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </b>
                {' '}— o que veio antes disso não entra no placar.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {ranking.map((r, i) => {
          // dias que o período cobre — é o divisor da média de pontos por dia
          const dias = periodo === 'hoje' ? 1 : periodo === 'semana' ? 7 : periodo === '30dias' ? 30
            : Math.max(1, inicio ? Math.floor((Date.now() - new Date(`${inicio}T00:00:00`)) / 86400000) + 1 : 1)
          return (
          <div key={r.user_id}
            className={`${caixa} px-4 py-3 flex items-center gap-3 ${r.user_id === perfil.user_id ? 'border-sinal/40' : ''}`}>
            <span className="text-xl w-8 text-center">{MEDALHAS[i] || `${i + 1}º`}</span>
            <span className="flex-1 min-w-0">
              {aoAbrirAnalise ? (
                <button onClick={() => aoAbrirAnalise(r.user_id)}
                  className="block font-medium truncate text-left hover:text-sinal transition w-full"
                  title="Abrir análise deste mentor">
                  {r.nome} <span className="text-[10px] text-ink-3">›</span>
                </button>
              ) : (
                <span className="block font-medium truncate">{r.nome}</span>
              )}
              <span className="block text-xs text-ink-2">
                {r.ligacoes} ligações · {r.atendidas} atendidas · {r.reunioes} reuniões · {r.conversoes} conversões{r.retornos_atendidos > 0 ? ` · ${r.retornos_atendidos} retornos` : ''}
              </span>
            </span>
            {/* nota média (IA) de todas as ligações avaliadas — mesma régua do Histórico */}
            {r.nota_media != null && (
              <span title="Nota média das ligações avaliadas pela IA (desde o início)"
                className={`shrink-0 text-sm font-extrabold tnum ${
                  r.nota_media >= 7 ? 'text-sinal' : r.nota_media >= 5 ? 'text-amber' : 'text-danger'}`}>
                {Number(r.nota_media).toFixed(1)}
              </span>
            )}
            <span className="flex flex-col items-end leading-none">
              <span className="text-lg font-bold text-sinal">{r.pontos}</span>
              <span className="text-[10px] text-ink-3 uppercase tracking-wide">pontos</span>
              {dias > 1 && (
                <span className="text-[10px] text-ink-2 tnum mt-0.5"
                  title={`Média de pontos por dia nos ${dias} dias do período`}>
                  {Math.round((r.pontos || 0) / dias)}/dia
                </span>
              )}
            </span>
          </div>
          )
        })}
        {ranking.length === 0 && <p className="text-sm text-ink-3 text-center py-6">Sem atividade no período.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Meu dia</p>
        {meuDia.agenda.map((a, i) => (
          <p key={i} className="text-sm text-ink-2">
            {new Date(a.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — {a.titulo}
          </p>
        ))}
        {meuDia.retornos.map((r) => (
          <p key={r.id} className="text-sm text-amber">↩️ Retorno vencido: {r.empresa}</p>
        ))}
        {meuDia.agenda.length === 0 && meuDia.retornos.length === 0 && (
          <p className="text-xs text-ink-3">Nada pendente — bora prospectar!</p>
        )}
      </div>

      <RaioX perfil={perfil} ehAdmin={ehAdmin} aoAbrirLead={aoAbrirLead} />
    </div>
  )
}

const INTERESSE_COR = {
  alto: 'border-sinal/50 text-sinal bg-sinal/10',
  medio: 'border-amber/50 text-amber bg-amber/10',
  baixo: 'border-line text-ink-2 bg-surface',
  nenhum: 'border-danger/40 text-danger/80 bg-danger/5',
}

// Raio-X por mentor: para quem ligou, o que está virgem, quem agendou
// e os motivadores extraídos das conversas (perfil de cliente).
function RaioX({ perfil, ehAdmin, aoAbrirLead }) {
  const [vendedores, setVendedores] = useState([])
  const [alvo, setAlvo] = useState(perfil.user_id)
  const [ligacoes, setLigacoes] = useState([])
  const [leads, setLeads] = useState([])
  const [agendados, setAgendados] = useState([])
  const [analisando, setAnalisando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!ehAdmin) return
    supabase.from('profiles').select('user_id, nome').eq('ativo', true).order('ramal')
      .then(({ data }) => setVendedores(data || []))
  }, [ehAdmin])

  async function carregar() {
    const [{ data: cs }, { data: ls }, { data: ag }] = await Promise.all([
      supabase.from('calls')
        .select('id, numero_externo, lead_id, duracao_seg, iniciada_em')
        .eq('user_id', alvo).eq('direcao', 'saida')
        .order('iniciada_em', { ascending: false }).limit(500),
      supabase.from('leads').select('*').eq('atribuido_a', alvo).limit(500),
      supabase.from('agenda_eventos').select('id, titulo, inicio, status, leads(empresa)')
        .eq('vendedor', alvo).eq('tipo', 'apresentacao').order('inicio', { ascending: false }).limit(100),
    ])
    setLigacoes(cs || []); setLeads(ls || []); setAgendados(ag || [])
  }
  useEffect(() => { carregar() }, [alvo])

  async function analisar() {
    setAnalisando(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('analisar-motivadores', { body: {} })
    setAnalisando(false)
    if (error || data?.erro) { setMsg(data?.erro || 'Erro na análise.'); return }
    setMsg(data.processados
      ? `${data.processados} conversa(s) analisada(s) — motivadores atualizados.`
      : 'Nada novo para analisar (precisa de chamadas transcritas ligadas a leads).')
    carregar()
  }

  const porLead = new Map()
  ligacoes.forEach((c) => {
    if (c.lead_id) porLead.set(c.lead_id, (porLead.get(c.lead_id) || 0) + 1)
  })
  const contatados = leads.filter((l) => porLead.has(l.id) || l.status !== 'novo')
  const semContato = leads.filter((l) => !porLead.has(l.id) && l.status === 'novo')
  const avulsas = ligacoes.filter((c) => !c.lead_id).length
  const comMotivador = leads.filter((l) => l.motivador)
  const taxa = contatados.length ? Math.round((agendados.length / contatados.length) * 100) : 0

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2 flex-1">
          Raio-X {ehAdmin ? 'do mentor' : '— meu perfil de ligações'}
        </p>
        {ehAdmin && (
          <select value={alvo} onChange={(e) => setAlvo(e.target.value)}
            className="rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-xs outline-none">
            {vendedores.map((v) => <option key={v.user_id} value={v.user_id}>{v.nome}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['Ligações', ligacoes.length],
          ['Contatados', contatados.length],
          ['Sem contato', semContato.length],
          ['Agendaram', agendados.length],
          ['Taxa agend.', `${taxa}%`],
          ['Avulsas', avulsas],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className={`${caixa} px-3 py-2.5 text-center`}>
            <p className="text-lg font-bold text-sinal leading-none">{valor}</p>
            <p className="text-[10px] text-ink-3 mt-1">{rotulo}</p>
          </div>
        ))}
      </div>

      {ehAdmin && (
        <button onClick={analisar} disabled={analisando}
          className={`w-full ${caixa} py-2.5 text-sm font-semibold disabled:opacity-50`}>
          {analisando ? 'Analisando conversas…' : 'Analisar motivadores das conversas'}
        </button>
      )}
      {msg && <p className="text-xs text-amber">{msg}</p>}

      {comMotivador.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Motivadores (perfil de cliente)
          </p>
          {comMotivador.map((l) => (
            <div key={l.id} role="button" onClick={() => aoAbrirLead?.(l.id)} title="Ver o contato deste lead"
              className={`rounded-lg border px-3 py-2 text-xs cursor-pointer active:opacity-80 ${INTERESSE_COR[l.interesse] || INTERESSE_COR.baixo}`}>
              <b>{l.empresa}</b> — {l.motivador}
              {l.interesse ? <span className="opacity-70"> · interesse {l.interesse}</span> : null}
            </div>
          ))}
        </div>
      )}

      {agendados.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Agendaram call</p>
          {agendados.map((a) => (
            <p key={a.id} className="text-xs text-ink-2">
              {a.leads?.empresa || a.titulo} · {new Date(a.inicio).toLocaleDateString('pt-BR')} · {a.status}
            </p>
          ))}
        </div>
      )}

      {contatados.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Para quem ligou ({contatados.length})
          </p>
          {contatados.slice(0, 30).map((l) => (
            <div key={l.id} role="button" onClick={() => aoAbrirLead?.(l.id)} title="Ver o contato deste lead"
              className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer active:opacity-80">
              <span className="flex-1 truncate">{l.empresa} <span className="text-ink-3">›</span></span>
              <span className="text-ink-3">{porLead.get(l.id) || 0}x</span>
              <span className="text-ink-3">{l.status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {semContato.length > 0 && (
        <details className="text-xs text-ink-2">
          <summary className="cursor-pointer text-ink-3">
            Números novos ainda sem contato ({semContato.length})
          </summary>
          <div className="pt-1.5 space-y-1">
            {semContato.slice(0, 30).map((l) => (
              <p key={l.id} role="button" onClick={() => aoAbrirLead?.(l.id)}
                className="cursor-pointer active:opacity-80" title="Ver o contato deste lead">• {l.empresa} ›</p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
