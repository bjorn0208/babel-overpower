import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from './Icone'

// Calendário do mês para marcar o retorno vendo a SUA agenda: cada dia mostra
// quantos compromissos você já tem (retornos, mentorias e pós-venda). Serve
// para não empilhar cinco retornos no mesmo horário sem perceber.

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const HORAS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']

const chaveDia = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function gradeDoMes(mes) {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const ini = new Date(primeiro)
  ini.setDate(1 - primeiro.getDay())
  const semanas = []
  for (let s = 0; s < 6; s++) {
    const linha = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(ini)
      dt.setDate(ini.getDate() + s * 7 + d)
      linha.push(dt)
    }
    if (linha.some((dt) => dt.getMonth() === mes.getMonth())) semanas.push(linha)
  }
  return semanas
}

export default function CalendarioRetorno({ aoEscolher }) {
  const [mes, setMes] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [ocupacao, setOcupacao] = useState({})   // 'AAAA-MM-DD' → [horas ocupadas]
  const [diaSel, setDiaSel] = useState(null)

  // o que JÁ está marcado no mês para quem está logado (o ramal da sessão)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const eu = (await supabase.auth.getUser()).data.user?.id
      if (!eu) return
      const ini = new Date(mes)
      const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 0, 23, 59, 59, 999)
      const [{ data: rets }, { data: evs }, { data: pos }] = await Promise.all([
        supabase.from('leads').select('proxima_acao_em')
          .eq('atribuido_a', eu).not('proxima_acao_em', 'is', null)
          .not('status', 'in', '(convertido,descartado)')
          .gte('proxima_acao_em', ini.toISOString()).lte('proxima_acao_em', fim.toISOString()),
        supabase.from('agenda_eventos').select('inicio')
          .neq('status', 'cancelado')
          .or(`vendedor.eq.${eu},criado_por.eq.${eu}`)
          .gte('inicio', ini.toISOString()).lte('inicio', fim.toISOString()),
        supabase.from('leads').select('posvenda_proximo_em')
          .eq('atribuido_a', eu).not('posvenda_proximo_em', 'is', null)
          .gte('posvenda_proximo_em', ini.toISOString()).lte('posvenda_proximo_em', fim.toISOString()),
      ])
      if (!vivo) return
      const mapa = {}
      const junta = (iso) => {
        const d = new Date(iso)
        const k = chaveDia(d)
        const h = `${String(d.getHours()).padStart(2, '0')}:00`
        mapa[k] = mapa[k] || []
        mapa[k].push(h)
      }
      ;(rets || []).forEach((r) => junta(r.proxima_acao_em))
      ;(evs || []).forEach((e) => junta(e.inicio))
      ;(pos || []).forEach((p) => junta(p.posvenda_proximo_em))
      setOcupacao(mapa)
    })()
    return () => { vivo = false }
  }, [mes])

  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mudarMes = (n) => { setDiaSel(null); setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() + n); return d }) }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => mudarMes(-1)}
          className="w-7 h-7 rounded-md border border-line text-ink-2 font-bold">‹</button>
        <span className="text-xs font-bold capitalize">{nomeMes}</span>
        <button type="button" onClick={() => mudarMes(1)}
          className="w-7 h-7 rounded-md border border-line text-ink-2 font-bold">›</button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-ink-3 font-bold">
        {DIAS.map((d) => <span key={d}>{d}</span>)}
      </div>
      {gradeDoMes(mes).map((semana, i) => (
        <div key={i} className="grid grid-cols-7 gap-0.5">
          {semana.map((dt) => {
            const k = chaveDia(dt)
            const qtd = (ocupacao[k] || []).length
            const doMes = dt.getMonth() === mes.getMonth()
            const passado = dt < hoje
            return (
              <button key={k} type="button" disabled={passado}
                onClick={() => setDiaSel(k)}
                className={`min-h-[2.1rem] rounded-md border text-[11px] tnum flex flex-col items-center justify-center leading-none transition ${
                  diaSel === k ? 'border-sinal bg-sinal/15 text-sinal font-bold'
                    : k === chaveDia(hoje) ? 'border-sinal/40 text-ink'
                    : 'border-line text-ink-2'} ${doMes ? '' : 'opacity-25'} ${passado ? 'opacity-25' : ''}`}>
                {dt.getDate()}
                {qtd > 0 && <span className="text-[8px] text-sinal font-bold mt-0.5">●{qtd}</span>}
              </button>
            )
          })}
        </div>
      ))}

      {diaSel && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] text-ink-3">
            Horário em {new Date(`${diaSel}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            {(ocupacao[diaSel] || []).length > 0 && (
              <span className="text-sinal"> · {ocupacao[diaSel].length} já marcado(s)</span>
            )}
          </p>
          <div className="grid grid-cols-4 gap-1">
            {HORAS.map((h) => {
              const ocupado = (ocupacao[diaSel] || []).includes(h)
              return (
                <button key={h} type="button"
                  onClick={() => aoEscolher(new Date(`${diaSel}T${h}:00`))}
                  title={ocupado ? 'Você já tem compromisso neste horário' : ''}
                  className={`rounded-md py-1.5 text-[11px] font-bold tnum border ${
                    ocupado ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
                  {h.slice(0, 2)}h{ocupado ? <Icone nome="relogio" tam={9} className="inline ml-0.5 -mt-0.5" /> : ''}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-ink-3">
            Horário em vermelho já tem compromisso seu — dá para marcar mesmo assim.
          </p>
        </div>
      )}
    </div>
  )
}
