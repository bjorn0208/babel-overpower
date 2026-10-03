import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm'

function fmtQuando(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Agendar mentoria — o fluxo único do sistema: escolhe quem dá a mentoria
// (mentores ativos em Gestão → Equipe), o dia e um horário livre na grade
// anti-conflito. Usado no desfecho da ligação e na tela do lead.
export default function AgendarMentoria({ lead, numero, aoAgendar }) {
  const [mentores, setMentores] = useState([])
  const [mentorSel, setMentorSel] = useState('')
  const [dia, setDia] = useState('')
  const [slots, setSlots] = useState([])
  const [slotEscolhido, setSlotEscolhido] = useState(null)
  const [agendando, setAgendando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('apresentadores_config')
      .select('user_id, duracao_min, profiles(nome)')
      .eq('ativo', true)
      .then(({ data }) => setMentores(data || []))
  }, [])

  useEffect(() => {
    setSlots([]); setSlotEscolhido(null)
    if (!mentorSel || !dia) return
    supabase.rpc('horarios_disponiveis', { _apresentador: mentorSel, _dia: dia })
      .then(({ data }) => setSlots(data || []))
  }, [mentorSel, dia])

  async function agendar() {
    if (!slotEscolhido) { setErro('Escolha um horário livre.'); return }
    setAgendando(true); setErro('')
    const { error } = await supabase.rpc('agendar_apresentacao', {
      _apresentador: mentorSel, _inicio: slotEscolhido,
      _titulo: `Mentoria — ${lead?.empresa || numero || ''}`.trim(),
      _lead_id: lead?.id ?? null,
    })
    setAgendando(false)
    if (error) {
      setErro(error.message)
      // o horário pode ter acabado de ser ocupado — atualiza a grade
      const { data } = await supabase.rpc('horarios_disponiveis', { _apresentador: mentorSel, _dia: dia })
      setSlots(data || []); setSlotEscolhido(null)
      return
    }
    if (lead?.id) await supabase.rpc('mudar_status_lead', { _lead_id: lead.id, _status: 'reuniao_marcada' })
    aoAgendar?.(`Mentoria agendada para ${fmtQuando(slotEscolhido)}`)
  }

  return (
    <div className="space-y-2">
      <select value={mentorSel} onChange={(e) => setMentorSel(e.target.value)} className={campo}>
        <option value="">Quem dá a mentoria?</option>
        {mentores.map((a) => (
          <option key={a.user_id} value={a.user_id}>{a.profiles?.nome} · call de {a.duracao_min} min</option>
        ))}
      </select>
      {mentores.length === 0 && (
        <p className="text-[11px] text-amber">Ninguém com mentorias ativas — o admin ativa em Gestão → Equipe.</p>
      )}
      {mentorSel && <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={campo} />}
      {mentorSel && dia && slots.length === 0 && (
        <p className="text-[11px] text-ink-3">Este mentor não atende neste dia — escolha outra data.</p>
      )}
      {slots.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {slots.map((s) => (
            <button type="button" key={s.inicio} disabled={!s.livre} onClick={() => setSlotEscolhido(s.inicio)}
              title={s.livre ? 'Horário livre' : 'Horário ocupado'}
              className={`rounded-lg py-1.5 text-xs font-semibold border tnum ${
                slotEscolhido === s.inicio
                  ? 'border-sinal bg-sinal text-white'
                  : s.livre ? 'border-sinal/40 text-sinal'
                    : 'border-danger/30 text-danger/60 line-through cursor-not-allowed'}`}>
              {new Date(s.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </button>
          ))}
        </div>
      )}
      {slotEscolhido && (
        <button onClick={agendar} disabled={agendando}
          className="w-full rounded-lg bg-sinal py-2 font-semibold text-white disabled:opacity-50">
          {agendando ? 'Agendando…' : 'Agendar mentoria'}
        </button>
      )}
      {erro && <p className="text-xs text-danger">{erro}</p>}
    </div>
  )
}
