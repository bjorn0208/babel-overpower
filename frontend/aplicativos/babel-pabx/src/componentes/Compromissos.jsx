import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from './Icone'

// Diz "hoje 14:00", "amanhã 09:00" ou "qua 06/08 09:00" — o mentor precisa
// saber QUANDO sem abrir o lead.
function quando(iso) {
  const d = new Date(iso)
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dias = Math.round((dia - hoje) / 86400000)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (dias === 0) return hora
  if (dias === 1) return `amanhã ${hora}`
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${hora}`
}

// Compromissos na tela do telefone: retornos (vencidos, de hoje e dos próximos
// dias) e mentorias marcadas — um toque já liga, sem caçar em outras abas.
// A janela vai até 14 dias à frente de propósito: retorno marcado para outro
// dia não aparecia em lugar nenhum, e o mentor achava que tinha se perdido.
const DIAS_A_FRENTE = 14

export default function Compromissos({ perfil, aoLigar, aoAbrirLead }) {
  const [retornos, setRetornos] = useState([])
  const [mentorias, setMentorias] = useState([])
  const [posvendas, setPosvendas] = useState([])

  useEffect(() => {
    // recarrega sozinho: o telefone fica montado o tempo todo, então sem isto
    // um retorno marcado agora só apareceria no próximo login
    async function carregar() {
      const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0)
      const limite = new Date(inicioHoje.getTime() + DIAS_A_FRENTE * 86400000)
      const [{ data: rets }, { data: evs }, { data: pos }] = await Promise.all([
        // o compromisso é a DATA, não o status: mudar o lead para "Em contato"
        // depois de marcar o retorno fazia o compromisso sumir de todas as telas
        supabase.from('leads')
          .select('id, empresa, telefone, cidade, nicho, avaliacao, proxima_acao_em, status, dossie')
          .eq('atribuido_a', perfil.user_id)
          .not('proxima_acao_em', 'is', null)
          .not('status', 'in', '(convertido,descartado)')
          .lte('proxima_acao_em', limite.toISOString())
          .order('proxima_acao_em').limit(25),
        supabase.from('agenda_eventos')
          .select('id, titulo, inicio, sala_reuniao, vendedor, criado_por, leads(empresa)')
          .eq('status', 'marcado')
          .gte('inicio', inicioHoje.toISOString()).lte('inicio', limite.toISOString())
          .or(`vendedor.eq.${perfil.user_id},criado_por.eq.${perfil.user_id}`)
          .order('inicio').limit(25),
        // pós-venda: cliente com contato de relacionamento vencendo
        supabase.from('leads')
          .select('id, empresa, telefone, cidade, nicho, posvenda_proximo_em, status, dossie')
          .eq('atribuido_a', perfil.user_id).eq('status', 'convertido')
          .not('posvenda_proximo_em', 'is', null)
          .lte('posvenda_proximo_em', limite.toISOString())
          .order('posvenda_proximo_em').limit(25),
      ])
      setRetornos(rets || [])
      setMentorias(evs || [])
      setPosvendas(pos || [])
    }
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [perfil.user_id])

  if (retornos.length === 0 && mentorias.length === 0 && posvendas.length === 0) {
    return (
      <div className="w-full rounded-xl bg-surface border border-line p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-2 flex items-center gap-1.5">
          <Icone nome="cal" tam={12} className="text-ink-3" /> Agendados
          <span className="normal-case tracking-normal text-ink-3 font-normal">· nada por enquanto</span>
        </p>
      </div>
    )
  }

  const agora = new Date()
  const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999)
  const vencidos = retornos.filter((l) => new Date(l.proxima_acao_em) <= agora).length
    + posvendas.filter((l) => new Date(l.posvenda_proximo_em) <= agora).length
  const paraHoje = retornos.filter((l) => new Date(l.proxima_acao_em) <= fimHoje).length
    + mentorias.filter((e) => new Date(e.inicio) <= fimHoje).length
    + posvendas.filter((l) => new Date(l.posvenda_proximo_em) <= fimHoje).length

  return (
    <div className="w-full rounded-xl bg-surface border border-line p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-2 flex items-center gap-1.5">
        <Icone nome="cal" tam={12} className="text-sinal" /> Agendados
        <span className="normal-case tracking-normal text-ink-3 font-normal">
          {paraHoje > 0 ? `· ${paraHoje} para hoje` : '· nada para hoje'}
        </span>
        {vencidos > 0 && (
          <span className="ml-auto rounded-full bg-sinal text-white text-[10px] font-bold px-2 py-0.5 tnum">
            {vencidos} vencido{vencidos > 1 ? 's' : ''}
          </span>
        )}
      </p>

      {retornos.map((l) => {
        const vencido = new Date(l.proxima_acao_em) <= agora
        const hoje = new Date(l.proxima_acao_em) <= fimHoje
        return (
          <div key={l.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
            vencido ? 'border-sinal/50 bg-sinal/10'
              : hoje ? 'border-sinal/25 bg-sinal/5' : 'border-line'}`}>
            <span className="flex-1 min-w-0" role={aoAbrirLead ? 'button' : undefined}
              onClick={aoAbrirLead ? () => aoAbrirLead(l.id) : undefined}
              title="Ver o contato deste lead">
              <span className="block text-sm font-medium truncate"><Icone nome="relogio" tam={12} className="inline mr-1 -mt-0.5 text-sinal" />{l.empresa} <span className="text-ink-3 text-xs">›</span></span>
              <span className={`block text-[11px] ${
                vencido ? 'text-sinal font-semibold' : hoje ? 'text-sinal/80' : 'text-ink-3'}`}>
                {vencido ? 'retorno vencido — ligar agora'
                  : `retornar ${quando(l.proxima_acao_em)}`}
              </span>
            </span>
            {l.telefone && (
              <button onClick={() => aoLigar(l)}
                className="shrink-0 text-xs font-bold border border-sinal/50 bg-sinal/10 text-sinal rounded-full px-3 py-1.5">
                <Icone nome="fone" tam={11} className="inline mr-1 -mt-0.5" />Ligar
              </button>
            )}
          </div>
        )
      })}

      {posvendas.map((l) => {
        const vencido = new Date(l.posvenda_proximo_em) <= agora
        return (
          <div key={`pv${l.id}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
            vencido ? 'border-sinal/40 bg-sinal/5' : 'border-line'}`}>
            <span className="flex-1 min-w-0" role={aoAbrirLead ? 'button' : undefined}
              onClick={aoAbrirLead ? () => aoAbrirLead(l.id) : undefined}
              title="Ver o contato deste lead">
              <span className="block text-sm font-medium truncate"><Icone nome="equipe" tam={12} className="inline mr-1 -mt-0.5 text-ink-2" />{l.empresa} <span className="text-ink-3 text-xs">›</span></span>
              <span className={`block text-[11px] ${vencido ? 'text-sinal font-semibold' : 'text-ink-3'}`}>
                {vencido ? 'pós-venda — hora de falar com o cliente'
                  : `pós-venda ${quando(l.posvenda_proximo_em)}`}
              </span>
            </span>
            {l.telefone && (
              <button onClick={() => aoLigar(l)}
                className="shrink-0 text-xs font-bold border border-sinal/50 bg-sinal/10 text-sinal rounded-full px-3 py-1.5">
                <Icone nome="fone" tam={11} className="inline mr-1 -mt-0.5" />Ligar
              </button>
            )}
          </div>
        )
      })}

      {mentorias.map((ev) => (
        <div key={ev.id} className="flex items-center gap-2 rounded-lg border border-sinal/30 bg-sinal/5 px-3 py-2">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate"><Icone nome="calcheck" tam={12} className="inline mr-1 -mt-0.5 text-sinal" />{ev.titulo}</span>
            <span className="block text-[11px] text-sinal tnum">
              {quando(ev.inicio)}
              {ev.vendedor === perfil.user_id ? ' · você apresenta' : ''}
            </span>
          </span>
          {ev.sala_reuniao && (
            <a href={`/?sala=${ev.sala_reuniao}`}
              className="shrink-0 text-xs font-bold border border-sinal/50 bg-sinal/10 text-sinal rounded-full px-3 py-1.5">
              <Icone nome="play" tam={11} className="inline mr-1 -mt-0.5" />Sala
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
