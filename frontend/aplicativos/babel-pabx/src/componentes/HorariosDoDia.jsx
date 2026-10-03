import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'

// Horários livres para oferecer AO VIVO, no meio da ligação: o vendedor
// pergunta "que horas fica bom?" e já tem a resposta na tela, sem sair da
// chamada. Se o dia de hoje acabou (ou está cheio), mostra o próximo dia
// que tenha vaga — nunca deixa o vendedor sem opção para dar ao cliente.

const HOJE = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function rotuloDia(d) {
  const dias = Math.round((d - HOJE()) / 86400000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

export default function HorariosDoDia() {
  const [apresentadores, setApresentadores] = useState([])
  const [quem, setQuem] = useState('')
  const [dia, setDia] = useState(null)      // Date do dia que está sendo mostrado
  const [livres, setLivres] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    supabase.from('apresentadores_config')
      .select('user_id, duracao_min, profiles(nome)').eq('ativo', true)
      .then(({ data }) => {
        setApresentadores(data || [])
        if (data?.length) setQuem(data[0].user_id)
      })
  }, [])

  // procura o primeiro dia com vaga, começando por hoje (olha até 7 dias)
  useEffect(() => {
    if (!quem) return
    let vivo = true
    ;(async () => {
      setBuscando(true); setLivres([]); setDia(null)
      for (let i = 0; i < 7; i++) {
        const d = new Date(HOJE().getTime() + i * 86400000)
        const { data } = await supabase.rpc('horarios_disponiveis', { _apresentador: quem, _dia: iso(d) })
        if (!vivo) return
        const vagas = (data || []).filter((s) => s.livre)
        if (vagas.length) { setDia(d); setLivres(vagas); break }
      }
      if (vivo) setBuscando(false)
    })()
    return () => { vivo = false }
  }, [quem])

  if (!apresentadores.length) return null

  return (
    <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3 flex items-center gap-1.5">
          <Icone nome="cal" tam={12} className="text-sinal" />
          Horários livres {dia ? `· ${rotuloDia(dia)}` : ''}
        </p>
        {apresentadores.length > 1 && (
          <select value={quem} onChange={(e) => setQuem(e.target.value)}
            className="max-w-[9rem] rounded-lg bg-surface-2 border border-line pl-2 pr-6 py-1 text-[11px] outline-none truncate">
            {apresentadores.map((a) => (
              <option key={a.user_id} value={a.user_id}>{a.profiles?.nome?.split(' ')[0]}</option>
            ))}
          </select>
        )}
      </div>

      {buscando && <p className="text-xs text-ink-3">Procurando…</p>}
      {!buscando && !livres.length && (
        <p className="text-xs text-ink-3 leading-snug">
          Sem horário livre nos próximos 7 dias. Marque o retorno e combine depois.
        </p>
      )}
      {livres.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {livres.slice(0, 12).map((s) => (
              <span key={s.inicio}
                className="rounded-lg border border-sinal/40 bg-sinal/10 text-sinal
                  px-2.5 py-1.5 text-xs font-bold tnum">
                {hora(s.inicio)}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-ink-3">
            Ofereça um destes. Ao desligar, o botão “Reunião…” marca de verdade.
          </p>
        </>
      )}
    </div>
  )
}
