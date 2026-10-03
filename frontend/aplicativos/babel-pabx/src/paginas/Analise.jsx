import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cn } from '../componentes/ui'
import MentorDetalhe from './MentorDetalhe'

const caixa = 'rounded-xl bg-surface border border-line'
const PERIODOS = [['hoje', 'Hoje'], ['semana', '7 dias'], ['mes', 'Mês'], ['ano', 'Ano']]
const COLUNAS = [
  ['ligacoes', 'Ligações'], ['atendidas', 'Atendidas'], ['acima_30s', '+30s'],
  ['acima_60s', '+1min'], ['media_dia', 'Média/dia'], ['agendadas', 'Agendadas'],
  ['vendidas', 'Vendas'], ['pontos', 'Pontos'],
]

export default function Analise({ usuarioInicial, aoConsumirInicial }) {
  const [periodo, setPeriodo] = useState('mes')
  const [dados, setDados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [selecionados, setSelecionados] = useState(new Set())
  const [aberto, setAberto] = useState(null)

  useEffect(() => {
    if (usuarioInicial) { setAberto(usuarioInicial); aoConsumirInicial?.() }
  }, [usuarioInicial])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    supabase.rpc('analise_vendedores', { _periodo: periodo }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setErro(error.message)
      else { setErro(null); setDados(data || []) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [periodo])

  function alternar(uid) {
    const novo = new Set(selecionados)
    novo.has(uid) ? novo.delete(uid) : novo.add(uid)
    setSelecionados(novo)
  }

  const comparando = selecionados.size >= 2
  const linhas = comparando ? dados.filter((d) => selecionados.has(d.user_id)) : dados
  // no modo comparação, destaca o líder de cada métrica
  const lider = {}
  if (comparando) {
    for (const [chave] of COLUNAS) {
      lider[chave] = Math.max(...linhas.map((l) => Number(l[chave]) || 0))
    }
  }
  const detalhe = dados.find((d) => d.user_id === aberto)

  if (erro) return <p className="text-center text-danger p-10">{erro}</p>

  // Tela individual do mentor (métricas + ligações + transcrições)
  if (detalhe) {
    return (
      <MentorDetalhe mentor={detalhe} periodo={periodo} aoVoltar={() => setAberto(null)} />
    )
  }

  return (
    <div className="max-w-lg md:max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex gap-1.5">
        {PERIODOS.map(([id, rotulo]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            className={cn('flex-1 rounded-lg py-2 text-sm font-semibold border',
              periodo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2')}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && <p className="text-center text-ink-2 p-10">Carregando…</p>}

      {!carregando && (
        <>
          <p className="text-xs text-ink-3 px-1">
            {comparando
              ? `Comparando ${linhas.length} mentores — o melhor de cada métrica fica em verde. Desmarque para voltar.`
              : 'Toque no nome para abrir a tela do mentor (ligações e transcrições) · marque 2+ caixas para comparar.'}
          </p>
          <div className={`${caixa} overflow-x-auto`}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-line">
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-2 py-2.5">Mentor</th>
                  {COLUNAS.map(([chave, rotulo]) => (
                    <th key={chave} className="px-2 py-2.5 text-right">{rotulo}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right">vs mês ant.</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((d) => (
                  <tr key={d.user_id}
                    className={cn('border-b border-line/60 last:border-0',
                      aberto === d.user_id && 'bg-sinal/5')}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selecionados.has(d.user_id)}
                        onChange={() => alternar(d.user_id)} className="accent-[#22c55e]" />
                    </td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => setAberto(aberto === d.user_id ? null : d.user_id)}
                        className="font-medium text-left hover:text-sinal transition">
                        {d.nome} <span className="text-[10px] text-ink-3 tnum">{d.ramal}</span>
                      </button>
                    </td>
                    {COLUNAS.map(([chave]) => (
                      <td key={chave} className={cn('px-2 py-2.5 text-right tnum',
                        comparando && Number(d[chave]) === lider[chave] && lider[chave] > 0
                          ? 'text-sinal font-bold' : 'text-ink-2')}>
                        {d[chave]}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right tnum">
                      {d.variacao_pct === null
                        ? <span className="text-ink-3">—</span>
                        : Number(d.variacao_pct) >= 0
                          ? <span className="text-sinal">▲ {d.variacao_pct}%</span>
                          : <span className="text-danger">▼ {Math.abs(d.variacao_pct)}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {comparando && (
            <button onClick={() => setSelecionados(new Set())}
              className="w-full rounded-lg border border-line py-2 text-sm text-ink-2">
              Limpar seleção ({selecionados.size})
            </button>
          )}
        </>
      )}
    </div>
  )
}
