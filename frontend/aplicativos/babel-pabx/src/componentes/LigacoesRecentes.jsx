import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from './Icone'
import { cn } from './ui'

// "Alguém já ligou para esta empresa nos últimos dias?"
//
// Sem isso o vendedor descobre no meio da conversa que um colega ligou ontem —
// e o cliente percebe que a empresa não se fala. Aqui a informação chega antes
// de discar: quem ligou, quando e no que deu.

const DIAS = 3

const NOMES_DESF = {
  nao_atendeu: 'não atendeu', caixa_postal: 'caixa postal', ocupado: 'ocupado',
  numero_errado: 'número errado', sem_interesse: 'sem interesse', desligou: 'desligou',
  em_contato: 'passou o contato', retorno: 'marcou retorno', reuniao: 'marcou reunião',
}

function quando(iso) {
  const d = new Date(iso)
  const horas = Math.round((Date.now() - d) / 3600000)
  if (horas < 1) return 'agora há pouco'
  if (horas < 24) return `há ${horas} h`
  const dias = Math.round(horas / 24)
  return dias === 1 ? 'ontem' : `há ${dias} dias`
}

export default function LigacoesRecentes({ leadId, telefone, ignorarChamadaId }) {
  const [ligacoes, setLigacoes] = useState([])
  const [nomes, setNomes] = useState({})

  useEffect(() => {
    if (!leadId && !telefone) { setLigacoes([]); return }
    let vivo = true
    async function carregar() {
      const desde = new Date(Date.now() - DIAS * 86400000).toISOString()
      // por lead E por número: a mesma empresa pode ter sido ligada por outro
      // cadastro (planilha importada duas vezes), e o telefone é o que não mente
      const so = String(telefone || '').replace(/\D/g, '').replace(/^55/, '')
      let q = supabase.from('calls')
        .select('id, user_id, criado_em, duracao_seg, desfecho, status')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(6)
      q = leadId && so
        ? q.or(`lead_id.eq.${leadId},numero_externo.like.%${so}`)
        : leadId ? q.eq('lead_id', leadId) : q.like('numero_externo', `%${so}`)
      const { data } = await q
      if (!vivo) return
      const lista = (data || []).filter((c) => c.id !== ignorarChamadaId)
      setLigacoes(lista)
      const ids = [...new Set(lista.map((c) => c.user_id).filter(Boolean))]
      if (ids.length) {
        const { data: pessoas } = await supabase.from('profiles')
          .select('user_id, nome').in('user_id', ids)
        if (vivo) {
          setNomes(Object.fromEntries((pessoas || []).map((p) => [p.user_id, p.nome])))
        }
      }
    }
    carregar()
    return () => { vivo = false }
  }, [leadId, telefone, ignorarChamadaId])

  if (!ligacoes.length) return null

  // conversa de verdade (alguém atendeu e falou) pesa mais que tentativa
  const conversou = ligacoes.some((c) => (c.duracao_seg || 0) >= 20)

  return (
    <div className={cn('rounded-lg border px-3 py-2 space-y-1',
      conversou ? 'border-amber/50 bg-amber/10' : 'border-line bg-surface-2')}>
      <p className={cn('text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5',
        conversou ? 'text-amber' : 'text-ink-3')}>
        <Icone nome="hist" tam={11} />
        {conversou
          ? 'Alguém já falou com esta empresa'
          : `Já tentaram nos últimos ${DIAS} dias`}
      </p>
      {ligacoes.slice(0, 4).map((c) => {
        const quem = (nomes[c.user_id] || 'alguém da equipe').split(' ')[0]
        const dur = c.duracao_seg || 0
        return (
          <p key={c.id} className="text-[11px] leading-snug text-ink-2">
            <b className="text-ink">{quem}</b> ligou {quando(c.criado_em)}
            {dur >= 20 ? ` · falou ${Math.floor(dur / 60)}m${String(dur % 60).padStart(2, '0')}s` : ''}
            {c.desfecho ? ` · ${NOMES_DESF[c.desfecho] || c.desfecho}` : ''}
          </p>
        )
      })}
    </div>
  )
}
