import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// A agenda do mentor. Os horários nascem da grade que ele definiu no cadastro;
// o que já foi marcado some da lista.
//
// A trava de verdade não é esta tela — é o índice único em
// (pessoa_id, inicio) no banco. Duas pessoas clicando no mesmo minuto: a
// segunda leva 23505 e vê o aviso. Conferir antes de inserir é corrida perdida.

const DIAS_A_FRENTE = 21
const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

// Gera os blocos livres dos próximos dias, respeitando a grade do mentor.
function blocosDaGrade(grade, ocupados) {
  const dias = grade?.dias ?? [1, 2, 3, 4, 5]
  const faixas = grade?.faixas ?? [['09:00', '12:00'], ['14:00', '18:00']]
  const duracao = grade?.duracao ?? 30
  const agora = Date.now()
  const tomados = new Set(ocupados)
  const porDia = []

  for (let d = 0; d < DIAS_A_FRENTE; d++) {
    const dia = new Date()
    dia.setDate(dia.getDate() + d)
    dia.setHours(0, 0, 0, 0)
    if (!dias.includes(dia.getDay())) continue

    const horarios = []
    for (const [de, ate] of faixas) {
      for (let m = minutos(de); m + duracao <= minutos(ate); m += duracao) {
        const quando = new Date(dia)
        quando.setMinutes(m)
        // Uma hora de antecedência mínima: ninguém marca para daqui a 5 minutos.
        if (quando.getTime() < agora + 3600e3) continue
        const iso = quando.toISOString()
        if (tomados.has(iso)) continue
        horarios.push({ iso, rotulo: quando.toTimeString().slice(0, 5) })
      }
    }
    if (horarios.length) porDia.push({ dia, horarios })
  }
  return porDia
}

export default function Agenda({ pessoa, inscricaoId, nome, whatsapp, aoMarcar }) {
  const [ocupados, setOcupados] = useState(null)
  const [diaAberto, setDiaAberto] = useState(0)
  const [escolhido, setEscolhido] = useState(null)
  const [marcando, setMarcando] = useState(false)
  const [marcado, setMarcado] = useState(null)
  const [aviso, setAviso] = useState('')

  const carregarOcupados = useCallback(async () => {
    const { data } = await supabase
      .from('comercial_agendamentos')
      .select('inicio')                       // só o horário — nada de quem marcou
      .eq('pessoa_id', pessoa.id)
      .neq('estado', 'desmarcado')
      .gte('inicio', new Date().toISOString())
    setOcupados((data ?? []).map((r) => new Date(r.inicio).toISOString()))
  }, [pessoa.id])

  useEffect(() => { carregarOcupados() }, [carregarOcupados])

  const dias = useMemo(
    () => (ocupados === null ? [] : blocosDaGrade(pessoa.grade, ocupados)),
    [pessoa.grade, ocupados],
  )

  async function marcar() {
    if (!escolhido) return
    setMarcando(true)
    setAviso('')
    const { error } = await supabase.from('comercial_agendamentos').insert({
      pessoa_id: pessoa.id,
      inscricao_id: inscricaoId ?? null,
      inicio: escolhido,
      duracao_min: pessoa.grade?.duracao ?? 30,
      nome: nome ?? null,
      whatsapp: whatsapp ?? null,
    })
    setMarcando(false)

    if (error) {
      // 23505 = o índice único pegou. Alguém marcou primeiro, nesse instante.
      if (error.code === '23505') {
        setAviso('Esse horário acabou de ser tomado. Escolhe outro?')
        setEscolhido(null)
        carregarOcupados()
      } else {
        setAviso('Não consegui marcar agora. Tenta de novo.')
      }
      return
    }
    setMarcado(escolhido)
    aoMarcar?.(escolhido)
  }

  if (marcado) {
    const d = new Date(marcado)
    return (
      <div className="sobe">
        <p className="text-[11px] uppercase tracking-[0.26em] text-tinta-3">apresentação marcada</p>
        <p className="fala text-3xl text-tinta mt-3">
          {NOMES_DIA[d.getDay()]}, {d.getDate()} de {NOMES_MES[d.getMonth()]} · {d.toTimeString().slice(0, 5)}
        </p>
        <p className="mt-3 text-tinta-2 text-[15px] leading-relaxed">
          {pessoa.nome} recebeu o seu diagnóstico e te chama no WhatsApp para confirmar.
        </p>
      </div>
    )
  }

  if (ocupados === null) return <p className="text-tinta-3 text-sm">carregando horários…</p>
  if (!dias.length) {
    return (
      <p className="text-tinta-2 text-[15px]">
        {pessoa.nome} está sem horário aberto nos próximos dias — vai te chamar no WhatsApp.
      </p>
    )
  }

  const dia = dias[Math.min(diaAberto, dias.length - 1)]

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.26em] text-tinta-3">
        agendar a apresentação online
      </p>

      {/* dias */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {dias.map((d, k) => {
          const sel = k === Math.min(diaAberto, dias.length - 1)
          return (
            <button
              key={d.dia.toISOString()} type="button"
              onClick={() => { setDiaAberto(k); setEscolhido(null) }}
              className={'shrink-0 rounded-2xl border px-4 py-2.5 text-center transition-colors ' + (sel
                ? 'border-ciano/70 bg-ciano/10 text-tinta'
                : 'border-linha bg-superficie-2 text-tinta-2 hover:border-linha-forte')}
            >
              <div className="text-[10px] uppercase tracking-widest text-tinta-3">
                {NOMES_DIA[d.dia.getDay()]}
              </div>
              <div className="text-lg tabular-nums leading-tight">{d.dia.getDate()}</div>
              <div className="text-[10px] text-tinta-3">{NOMES_MES[d.dia.getMonth()]}</div>
            </button>
          )
        })}
      </div>

      {/* horários */}
      <div className="mt-4 flex flex-wrap gap-2">
        {dia.horarios.map((h) => {
          const sel = escolhido === h.iso
          return (
            <button
              key={h.iso} type="button" onClick={() => { setEscolhido(h.iso); setAviso('') }}
              className={'rounded-full border px-4 py-2 text-[14px] tabular-nums transition-colors ' + (sel
                ? 'border-violeta/70 bg-violeta/15 text-violeta-claro'
                : 'border-linha bg-superficie-2 text-tinta-2 hover:border-linha-forte')}
            >
              {h.rotulo}
            </button>
          )
        })}
      </div>

      {aviso && <p className="mt-4 text-sm text-violeta-claro">{aviso}</p>}

      <button
        type="button" disabled={!escolhido || marcando} onClick={marcar}
        className="mt-6 rounded-full bg-linear-to-r from-violeta to-ciano px-7 py-3
                   text-[15px] font-medium text-fundo transition-opacity
                   hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {marcando ? 'marcando…' : escolhido ? 'confirmar este horário' : 'escolha um horário'}
      </button>
    </div>
  )
}
