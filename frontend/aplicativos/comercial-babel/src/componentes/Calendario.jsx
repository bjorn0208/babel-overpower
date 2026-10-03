import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// O calendário do mentor: o mês inteiro à vista, os dias com apresentação
// marcados, e o dia aberto embaixo com o que fazer em cada uma.
//
// Remarcar aqui é o mesmo problema de marcar: o índice único em
// (pessoa_id, inicio) é quem garante que ninguém encavale. A tela mostra só
// horários livres, mas quem decide é o banco.

const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}
const chaveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Horários livres de um dia, pela grade do mentor, tirando o que já está preso.
function horariosLivres(dia, grade, ocupados, ignorar) {
  const faixas = grade?.faixas ?? [['09:00', '12:00'], ['14:00', '18:00']]
  const duracao = grade?.duracao ?? 30
  const dias = grade?.dias ?? [1, 2, 3, 4, 5]
  if (!dias.includes(dia.getDay())) return []
  const tomados = new Set(ocupados.filter((o) => o !== ignorar))
  const saida = []
  for (const [de, ate] of faixas) {
    for (let m = minutos(de); m + duracao <= minutos(ate); m += duracao) {
      const q = new Date(dia)
      q.setHours(0, 0, 0, 0)
      q.setMinutes(m)
      const iso = q.toISOString()
      if (tomados.has(iso)) continue
      saida.push({ iso, rotulo: q.toTimeString().slice(0, 5), passado: q.getTime() < Date.now() })
    }
  }
  return saida
}

export default function Calendario({ pessoa, agenda, aoMudar }) {
  const hoje = new Date()
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [diaAberto, setDiaAberto] = useState(() => chaveDia(hoje))
  const [remarcando, setRemarcando] = useState(null)   // id do agendamento
  const [confirmando, setConfirmando] = useState(null) // id a desmarcar
  const [relatando, setRelatando] = useState(null)     // id sendo marcado como atendido
  const [briefing, setBriefing] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  const porDia = useMemo(() => {
    const m = {}
    for (const g of agenda) {
      const d = new Date(g.inicio)
      const k = chaveDia(d)
      ;(m[k] ??= []).push(g)
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
    return m
  }, [agenda])

  const todosOsInicios = useMemo(
    () => agenda.map((g) => new Date(g.inicio).toISOString()), [agenda])

  // A malha do mês, começando no domingo da semana do dia 1.
  const celulas = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const inicio = new Date(primeiro)
    inicio.setDate(1 - primeiro.getDay())
    return Array.from({ length: 42 }, (_, k) => {
      const d = new Date(inicio)
      d.setDate(inicio.getDate() + k)
      return d
    })
  }, [mes])

  const lista = porDia[diaAberto] ?? []

  async function desmarcar(id) {
    setOcupado(true); setAviso('')
    const { error } = await supabase.from('comercial_agendamentos')
      .update({ estado: 'desmarcado' }).eq('id', id)
    setOcupado(false); setConfirmando(null)
    if (error) { setAviso('Não consegui desmarcar. Tenta de novo.'); return }
    aoMudar()
  }

  // Marcar como atendida SEM contar como foi transformaria o estado num
  // contador — e contador não ensina ninguém. Por isso o briefing é a
  // condição, não um extra opcional.
  async function atender(id) {
    if (briefing.trim().length < 20) {
      setAviso('Conta em pelo menos uma frase como foi a conversa.'); return
    }
    setOcupado(true); setAviso('')
    const { error } = await supabase.from('comercial_agendamentos').update({
      estado: 'realizado',
      briefing: briefing.trim(),
      realizado_em: new Date().toISOString(),
    }).eq('id', id)
    setOcupado(false)
    if (error) { setAviso('Não consegui salvar. Tenta de novo.'); return }
    setRelatando(null); setBriefing('')
    aoMudar()
  }

  async function remarcar(id, novoIso) {
    setOcupado(true); setAviso('')
    const { error } = await supabase.from('comercial_agendamentos')
      .update({ inicio: novoIso }).eq('id', id)
    setOcupado(false)
    if (error) {
      setAviso(error.code === '23505'
        ? 'Já existe apresentação nesse horário.'
        : 'Não consegui remarcar. Tenta de novo.')
      return
    }
    setRemarcando(null)
    aoMudar()
  }

  const dataAberta = (() => {
    const [a, m, d] = diaAberto.split('-').map(Number)
    return new Date(a, m, d)
  })()

  return (
    <div className="rounded-xl bg-superficie border border-linha p-5
                    grid gap-6 md:grid-cols-[300px_1fr] md:items-start">
      <div>
      {/* cabeçalho do mês */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          className="text-tinta-3 hover:text-tinta transition-colors px-2">‹</button>
        <p className="fala text-xl text-tinta flex-1 text-center">
          {MESES[mes.getMonth()]} <span className="text-tinta-3">{mes.getFullYear()}</span>
        </p>
        <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          className="text-tinta-3 hover:text-tinta transition-colors px-2">›</button>
      </div>

      {/* malha */}
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {NOMES_DIA.map((n) => (
          <div key={n} className="text-[10px] uppercase tracking-wider text-tinta-3 pb-1">{n}</div>
        ))}
        {celulas.map((d) => {
          const k = chaveDia(d)
          const doMes = d.getMonth() === mes.getMonth()
          const marcados = porDia[k]?.length ?? 0
          const ehHoje = k === chaveDia(hoje)
          const aberto = k === diaAberto
          return (
            <button
              key={k} type="button" onClick={() => { setDiaAberto(k); setRemarcando(null); setConfirmando(null) }}
              className={'aspect-square rounded-lg text-[13px] tabular-nums relative transition-colors ' +
                (aberto ? 'bg-violeta/20 text-tinta border border-violeta/60'
                  : doMes ? 'text-tinta-2 hover:bg-superficie-2' : 'text-tinta-3/40')}
            >
              {d.getDate()}
              {ehHoje && !aberto && (
                <span className="absolute inset-x-0 bottom-1 mx-auto w-1 h-1 rounded-full bg-tinta-3" />
              )}
              {marcados > 0 && (
                <span className="absolute top-1 right-1 min-w-3.5 h-3.5 px-1 rounded-full
                                 bg-linear-to-r from-violeta to-ciano text-[9px] leading-[14px]
                                 text-fundo font-medium">
                  {marcados}
                </span>
              )}
            </button>
          )
        })}
      </div>

      </div>

      {/* o dia aberto */}
      <div className="md:pl-6 md:border-l md:border-linha pt-5 border-t border-linha
                      md:pt-0 md:border-t-0 md:min-h-[260px]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3">
          {NOMES_DIA[dataAberta.getDay()]}, {dataAberta.getDate()} de {MESES[dataAberta.getMonth()]}
        </p>

        {aviso && <p className="mt-3 text-sm text-violeta-claro">{aviso}</p>}

        {lista.length === 0 ? (
          <p className="mt-3 text-[13px] text-tinta-3">Nada marcado neste dia.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {lista.map((g) => {
              const d = new Date(g.inicio)
              const livres = horariosLivres(dataAberta, pessoa.grade, todosOsInicios, g.inicio)
              return (
                <div key={g.id} className="rounded-lg bg-superficie-2 border border-linha p-3">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-ciano-claro tabular-nums">{d.toTimeString().slice(0, 5)}</span>
                    <span className="text-tinta">{g.nome || 'sem nome'}</span>
                    {g.whatsapp && (
                      <a href={`https://wa.me/55${String(g.whatsapp).replace(/\D/g, '')}`}
                        target="_blank" rel="noreferrer"
                        className="text-[12px] text-tinta-3 hover:text-ciano transition-colors">
                        {g.whatsapp}
                      </a>
                    )}
                    <div className="ml-auto flex gap-3 text-[12px]">
                      {g.estado === 'realizado' ? (
                        <span className="text-[11px] uppercase tracking-wider" style={{ color: '#39C4FF' }}>
                          atendida
                        </span>
                      ) : (
                        <button type="button" disabled={ocupado}
                          onClick={() => {
                            setRelatando(relatando === g.id ? null : g.id)
                            setBriefing(''); setRemarcando(null); setConfirmando(null); setAviso('')
                          }}
                          className="text-tinta-2 hover:text-tinta transition-colors">
                          {relatando === g.id ? 'cancelar' : 'atendida'}
                        </button>
                      )}
                      <button type="button" disabled={ocupado}
                        onClick={() => { setRemarcando(remarcando === g.id ? null : g.id); setConfirmando(null); setRelatando(null) }}
                        className="text-violeta hover:text-violeta-claro transition-colors">
                        {remarcando === g.id ? 'cancelar' : 'remarcar'}
                      </button>
                      {confirmando === g.id ? (
                        <button type="button" disabled={ocupado} onClick={() => desmarcar(g.id)}
                          className="text-red-300 hover:text-red-200 transition-colors">
                          confirmar
                        </button>
                      ) : (
                        <button type="button" disabled={ocupado}
                          onClick={() => { setConfirmando(g.id); setRemarcando(null) }}
                          className="text-tinta-3 hover:text-red-300 transition-colors">
                          desmarcar
                        </button>
                      )}
                    </div>
                  </div>

                  {g.briefing && relatando !== g.id && (
                    <div className="mt-3 pt-3 border-t border-linha">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-tinta-3">
                        como foi
                        {g.realizado_em
                          ? ` · ${new Date(g.realizado_em).toLocaleDateString('pt-BR')}`
                          : ''}
                      </p>
                      <p className="mt-1.5 text-[13px] text-tinta-2 leading-relaxed whitespace-pre-wrap">
                        {g.briefing}
                      </p>
                    </div>
                  )}

                  {relatando === g.id && (
                    <div className="mt-3 pt-3 border-t border-linha">
                      <p className="text-[11px] text-tinta-2 mb-2">
                        Como foi a conversa? O que ele contou que não estava no formulário,
                        o que travou, e qual é o próximo passo.
                      </p>
                      <textarea
                        rows={4} autoFocus
                        className="w-full rounded-lg bg-superficie border border-linha px-3 py-2
                                   text-[13px] text-tinta focus:border-violeta/70 outline-none resize-none"
                        placeholder="ex.: confirmou os R$ 350k, mas 200k são de recorrência antiga. Travou no preço; quer voltar depois do fechamento do mês."
                        value={briefing} onChange={(e) => setBriefing(e.target.value)}
                      />
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <button type="button" disabled={ocupado} onClick={() => atender(g.id)}
                          className="rounded-full px-5 py-2 text-[13px] font-medium disabled:opacity-50"
                          style={{ background: 'linear-gradient(90deg,#7A45E8,#39C4FF)', color: '#061020' }}>
                          {ocupado ? 'salvando…' : 'salvar e marcar como atendida'}
                        </button>
                        <span className="text-[11px] text-tinta-3">{briefing.trim().length}/20 mínimo</span>
                      </div>
                    </div>
                  )}

                  {confirmando === g.id && (
                    <p className="mt-2 text-[12px] text-tinta-3">
                      Desmarcar libera o horário para outro lead. Toque em “confirmar”.
                    </p>
                  )}

                  {remarcando === g.id && (
                    <div className="mt-3">
                      <p className="text-[11px] text-tinta-3 mb-2">
                        horários livres em {dataAberta.getDate()}/{dataAberta.getMonth() + 1}
                        {' '}— para outro dia, abra o dia no calendário e volte aqui
                      </p>
                      {livres.length === 0 ? (
                        <p className="text-[12px] text-tinta-3">Nenhum horário livre neste dia.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {livres.map((h) => (
                            <button key={h.iso} type="button" disabled={ocupado}
                              onClick={() => remarcar(g.id, h.iso)}
                              className={'rounded-full border px-3 py-1.5 text-[13px] tabular-nums transition-colors ' +
                                (h.passado
                                  ? 'border-linha text-tinta-3/50'
                                  : 'border-linha text-tinta-2 hover:border-violeta/60 hover:text-tinta')}>
                              {h.rotulo}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
