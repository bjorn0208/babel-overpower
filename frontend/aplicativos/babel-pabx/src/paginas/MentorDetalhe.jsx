import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cn } from '../componentes/ui'
import { Transcricao, Dossie } from '../componentes/Conversa'

const caixa = 'rounded-xl bg-surface border border-line'
const PERIODOS = [['hoje', 'Hoje'], ['semana', '7 dias'], ['mes', 'Mês'], ['ano', 'Ano']]

function pct(parte, total) {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : '—'
}

function duracao(seg) {
  if (!seg) return '0s'
  const m = Math.floor(seg / 60)
  return m ? `${m}min ${seg % 60}s` : `${seg}s`
}

function dataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fone(f) {
  const n = (f || '').replace(/\D/g, '').replace(/^55/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return f || 'Desconhecido'
}

// Início do período no fuso local, espelhando o que o RPC calcula no servidor
function inicioDoPeriodo(periodo) {
  const d = new Date()
  if (periodo === 'hoje') { d.setHours(0, 0, 0, 0); return d }
  if (periodo === 'semana') { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d }
  if (periodo === 'ano') return new Date(d.getFullYear(), 0, 1)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export default function MentorDetalhe({ mentor, periodo, aoVoltar }) {
  const [chamadas, setChamadas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState(null)
  const [urlAudio, setUrlAudio] = useState(null)
  const [filtro, setFiltro] = useState('periodo')   // periodo | dia | intervalo
  const [dia, setDia] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [busca, setBusca] = useState('')
  const [soComTranscricao, setSoComTranscricao] = useState(false)

  useEffect(() => {
    let vivo = true
    async function carregar() {
      setCarregando(true)
      let q = supabase.from('calls')
        .select('id, numero_externo, direcao, status, duracao_seg, iniciada_em, transcricao, transcricao_turnos, transcricao_status, gravacao_path, observacao, dossie, nota_ia, nota_justificativa, lead_id, leads(empresa, contato_nome, dossie)')
        .eq('user_id', mentor.user_id)
        .order('iniciada_em', { ascending: false })
        .limit(500)

      if (filtro === 'dia' && dia) {
        const ini = new Date(`${dia}T00:00:00`)
        q = q.gte('iniciada_em', ini.toISOString())
             .lt('iniciada_em', new Date(ini.getTime() + 86400000).toISOString())
      } else if (filtro === 'intervalo' && de && ate) {
        const ini = new Date(`${de}T00:00:00`)
        const fim = new Date(`${ate}T00:00:00`)
        q = q.gte('iniciada_em', ini.toISOString())
             .lt('iniciada_em', new Date(fim.getTime() + 86400000).toISOString())
      } else {
        q = q.gte('iniciada_em', inicioDoPeriodo(periodo).toISOString())
      }

      const { data } = await q
      if (!vivo) return
      setChamadas(data || [])
      setCarregando(false)
    }
    carregar()
    return () => { vivo = false }
  }, [mentor.user_id, periodo, filtro, dia, de, ate])

  async function abrir(c) {
    if (aberta === c.id) { setAberta(null); setUrlAudio(null); return }
    setAberta(c.id)
    setUrlAudio(null)
    if (c.gravacao_path) {
      const { data } = await supabase.storage.from('gravacoes').createSignedUrl(c.gravacao_path, 3600)
      setUrlAudio(data?.signedUrl || null)
    }
  }

  const lista = useMemo(() => {
    let l = chamadas
    if (soComTranscricao) l = l.filter((c) => c.transcricao)
    const termo = busca.trim().toLowerCase()
    if (termo) {
      const digitos = termo.replace(/\D/g, '')
      l = l.filter((c) =>
        (c.transcricao || '').toLowerCase().includes(termo) ||
        (digitos && (c.numero_externo || '').includes(digitos)))
    }
    return l
  }, [chamadas, busca, soComTranscricao])

  const resumo = useMemo(() => {
    const avaliadas = lista.filter((c) => c.nota_ia != null)
    return {
      total: lista.length,
      atendidas: lista.filter((c) => c.status === 'atendida').length,
      a30: lista.filter((c) => (c.duracao_seg || 0) > 30).length,
      a60: lista.filter((c) => (c.duracao_seg || 0) > 60).length,
      transcritas: lista.filter((c) => c.transcricao).length,
      tempo: lista.reduce((s, c) => s + (c.duracao_seg || 0), 0),
      notaMedia: avaliadas.length
        ? (avaliadas.reduce((s, c) => s + Number(c.nota_ia), 0) / avaliadas.length).toFixed(1)
        : null,
    }
  }, [lista])

  // nível global do mentor (média de todas as notas, fora do filtro de período)
  const [nivel, setNivel] = useState(null)
  useEffect(() => {
    supabase.rpc('nivel_mentor', { _user: mentor.user_id }).then(({ data }) => setNivel(data))
  }, [mentor.user_id])

  const v = mentor
  const rotuloPeriodo = PERIODOS.find(([id]) => id === periodo)?.[1] || periodo

  return (
    <div className="max-w-lg md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <button onClick={aoVoltar} className="text-sm text-ink-2 hover:text-sinal transition">
        ← Voltar para a comparação
      </button>

      {/* ---------- cabeçalho + métricas do período ---------- */}
      <div className={`${caixa} p-4 space-y-3`}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-xl font-bold">{v.nome}</h2>
          <span className="text-xs text-ink-3 tnum">ramal {v.ramal}</span>
          {nivel?.avaliadas > 0 && (
            <span className="text-[10px] font-bold border border-violet/50 text-violet rounded-full px-2 py-0.5"
              title={`Média geral ${nivel.media} em ${nivel.avaliadas} ligações avaliadas pela IA`}>
              NÍVEL {nivel.nivel} · nota {nivel.media}
            </span>
          )}
          <span className="ml-auto text-xs text-ink-3">{rotuloPeriodo}</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
          {[
            ['Ligações', v.ligacoes, `média ${v.media_dia}/dia`],
            ['Atendidas', v.atendidas, `taxa ${pct(v.atendidas, v.ligacoes)}`],
            ['+30s', v.acima_30s, `${pct(v.acima_30s, v.atendidas)} das atendidas`],
            ['+1min', v.acima_60s, `${pct(v.acima_60s, v.atendidas)} das atendidas`],
            ['Agendadas', v.agendadas, 'reuniões'],
            ['Vendas', v.vendidas, 'conversões'],
          ].map(([rotulo, valor, sub]) => (
            <div key={rotulo} className="rounded-lg bg-surface-2 border border-line px-2 py-2.5">
              <p className="text-xl font-bold tnum">{valor}</p>
              <p className="text-[11px] font-medium text-ink-2">{rotulo}</p>
              <p className="text-[10px] text-ink-3">{sub}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm border-t border-line pt-3">
          <span className="text-ink-2">Pontos: <b className="text-sinal tnum">{v.pontos}</b></span>
          <span className="text-ink-3 tnum text-xs">
            mês atual {v.pontos_mes_atual} · anterior {v.pontos_mes_anterior}
          </span>
          {v.variacao_pct === null || v.variacao_pct === undefined ? (
            <span className="text-ink-3 text-xs">sem base no mês anterior</span>
          ) : Number(v.variacao_pct) >= 0 ? (
            <span className="text-sinal font-bold text-xs">▲ {v.variacao_pct}% vs mês passado</span>
          ) : (
            <span className="text-danger font-bold text-xs">▼ {Math.abs(v.variacao_pct)}% vs mês passado</span>
          )}
        </div>
      </div>

      {/* ---------- filtros da lista ---------- */}
      <div className={`${caixa} p-3 space-y-2`}>
        <div className="flex gap-1.5">
          {[['periodo', `${rotuloPeriodo}`], ['dia', 'Um dia'], ['intervalo', 'Intervalo']].map(([id, rot]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold border',
                filtro === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2')}>
              {rot}
            </button>
          ))}
        </div>
        {filtro === 'dia' && (
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm" />
        )}
        {filtro === 'intervalo' && (
          <div className="flex items-center gap-2">
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
              className="flex-1 rounded-lg bg-surface-2 border border-line px-2 py-2 text-sm" />
            <span className="text-xs text-ink-3">até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
              className="flex-1 rounded-lg bg-surface-2 border border-line px-2 py-2 text-sm" />
          </div>
        )}
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no texto da conversa ou por número…"
          className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={soComTranscricao} className="accent-[#22c55e]"
            onChange={(e) => setSoComTranscricao(e.target.checked)} />
          Só ligações com conversa gravada
        </label>
      </div>

      {/* ---------- resumo da seleção ---------- */}
      {!carregando && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 px-1">
          <span><b className="text-ink tnum">{resumo.total}</b> ligações</span>
          <span><b className="text-ink tnum">{resumo.atendidas}</b> atendidas</span>
          <span><b className="text-ink tnum">{resumo.a30}</b> +30s</span>
          <span><b className="text-ink tnum">{resumo.a60}</b> +1min</span>
          <span><b className="text-ink tnum">{resumo.transcritas}</b> com transcrição</span>
          <span>tempo total <b className="text-ink tnum">{duracao(resumo.tempo)}</b></span>
          {resumo.notaMedia && <span>nota média <b className="text-violet tnum">{resumo.notaMedia}</b></span>}
        </div>
      )}

      {/* ---------- lista de ligações ---------- */}
      {carregando && <p className="text-center text-ink-2 p-10">Carregando ligações…</p>}
      {!carregando && lista.length === 0 && (
        <p className="text-center text-ink-2 p-10">Nenhuma ligação com esses filtros.</p>
      )}
      <div className="space-y-2">
        {lista.map((c) => (
          <div key={c.id} className={`${caixa} overflow-hidden`}>
            <button onClick={() => abrir(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className={cn('text-lg', c.direcao === 'entrada' ? 'text-sky' : 'text-sinal')}>
                {c.direcao === 'entrada' ? '↓' : '↑'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{fone(c.numero_externo)}</span>
                <span className="block text-xs text-ink-2 tnum">
                  {dataHora(c.iniciada_em)} · {duracao(c.duracao_seg)}
                  {c.nota_ia != null && (
                    <span className={cn('ml-1.5 font-bold tnum',
                      c.nota_ia >= 7 ? 'text-sinal' : c.nota_ia >= 5 ? 'text-amber' : 'text-danger')}>
                      · nota {Number(c.nota_ia).toFixed(1)}
                    </span>
                  )}
                  {c.transcricao ? ' · conversa' : ''}
                </span>
              </span>
              <span className={cn('text-xs font-medium', c.status === 'atendida' ? 'text-sinal' : 'text-danger')}>
                {c.status === 'atendida' ? 'Atendida' : 'Perdida'}
              </span>
            </button>
            {aberta === c.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-line pt-3">
                {c.observacao && (
                  <p className="text-sm text-amber/90 bg-amber/5 border border-amber-500/20 rounded-lg px-3 py-2">
                    {c.observacao}
                  </p>
                )}
                {urlAudio && <audio controls src={urlAudio} className="w-full h-10" />}
                {c.nota_justificativa && (
                  <p className="text-xs text-ink-2 rounded-lg bg-surface-2 border border-line px-3 py-2">
                    ‍<b>Avaliação da IA{c.nota_ia != null ? ` (${Number(c.nota_ia).toFixed(1)})` : ''}:</b>{' '}
                    {c.nota_justificativa}
                  </p>
                )}
                {(c.dossie || c.transcricao) && (
                  <Dossie dossie={c.dossie} titulo="O que a IA captou desta conversa"
                    vazio="A IA não captou dados novos nesta conversa." />
                )}
                {(c.transcricao_turnos?.length || c.transcricao) ? (
                  <div className="rounded-lg bg-surface-2 border border-line p-3 max-h-[28rem] overflow-y-auto">
                    <p className="text-[11px] uppercase tracking-wide text-ink-3 mb-2">Conversa</p>
                    <Transcricao turnos={c.transcricao_turnos} texto={c.transcricao}
                      nomeLead={c.dossie?.nome_atendente || c.leads?.contato_nome} />
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">
                    {c.transcricao_status === 'pendente' ? 'Transcrição em processamento…'
                      : c.transcricao_status === 'sem_audio' ? 'Sem áudio (ninguém atendeu).'
                      : 'Sem transcrição disponível.'}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
