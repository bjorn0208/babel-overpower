import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from './Icone'
import { cn } from './ui'

// Conquistas da sala, no estilo do Xbox 360: a placa entra deslizando do alto,
// fica alguns segundos e sai. Aparece para TODO MUNDO ao mesmo tempo — é isso
// que faz o placar virar competição de verdade.
//
// O som é sintetizado aqui (dois acordes curtos e um brilho agudo). O toque
// original do console é material protegido; este tem o mesmo efeito — o time
// levanta a cabeça — sem usar o que não é nosso.

const ICONE = { meta: 'trofeu', reuniao: 'calcheck', ultrapassagem: 'raio' }
const TEMPO_NA_TELA = 6500

function tocarConquista() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const agora = ctx.currentTime
    const mestre = ctx.createGain()
    mestre.gain.value = 0.22
    mestre.connect(ctx.destination)

    // dois toques ascendentes (o "tun-tum" da conquista) e um brilho por cima
    const notas = [
      { f: 784, t: 0, d: 0.16 },      // sol
      { f: 1047, t: 0.10, d: 0.34 },  // dó, sustentado
      { f: 1568, t: 0.16, d: 0.28 },  // brilho agudo, mais baixo
    ]
    notas.forEach(({ f, t, d }, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = i === 2 ? 'triangle' : 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, agora + t)
      g.gain.exponentialRampToValueAtTime(i === 2 ? 0.25 : 0.6, agora + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, agora + t + d)
      osc.connect(g); g.connect(mestre)
      osc.start(agora + t); osc.stop(agora + t + d + 0.05)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch { /* som é enfeite: se o navegador não deixar, a placa aparece igual */ }
}

export default function Notificacoes() {
  const [fila, setFila] = useState([])
  const vistos = useRef(new Set())

  useEffect(() => {
    let canal = null
    let vivo = true

    async function ligar() {
      // O canal precisa do token ANTES de assinar: esta placa monta junto com o
      // app, antes de a sessão chegar ao tempo real, e sem isso o RLS bloqueia
      // os eventos em silêncio — assina "com sucesso" e nunca recebe nada.
      const { data: { session } } = await supabase.auth.getSession()
      if (!vivo) return
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      // as que já existiam quando a tela abriu não devem reaparecer a cada F5
      const { data } = await supabase.from('notificacoes').select('id')
        .gte('criado_em', new Date(Date.now() - 3600000).toISOString())
      if (!vivo) return
      ;(data || []).forEach((n) => vistos.current.add(n.id))

      canal = supabase.channel('conquistas')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' },
          (payload) => {
            const n = payload.new
            if (vistos.current.has(n.id)) return
            vistos.current.add(n.id)
            setFila((f) => [...f, n])
            tocarConquista()
            setTimeout(() => setFila((f) => f.filter((x) => x.id !== n.id)), TEMPO_NA_TELA)
          })
        .subscribe()
    }
    ligar()
    return () => { vivo = false; if (canal) supabase.removeChannel(canal) }
  }, [])

  if (!fila.length) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2
      pointer-events-none w-[min(92vw,26rem)]">
      {fila.map((n) => (
        <div key={n.id}
          className="w-full flex items-center gap-3 rounded-2xl border border-sinal/50
            bg-surface/95 backdrop-blur px-3.5 py-2.5 shadow-2xl anim-conquista">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-sinal/15 border border-sinal/40
            grid place-items-center text-sinal">
            <Icone nome={ICONE[n.tipo] || 'trofeu'} tam={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold leading-tight truncate">{n.titulo}</span>
            {n.texto && (
              <span className="block text-[11px] text-ink-2 leading-tight truncate">{n.texto}</span>
            )}
          </span>
          {n.tipo === 'meta' && (
            <span className={cn('shrink-0 tnum text-lg font-extrabold italic text-sinal')}>
              {n.valor}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
