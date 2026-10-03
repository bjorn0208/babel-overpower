import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import { cn } from '../componentes/ui'

// WhatsApp da empresa dentro do PABX.
//
// Caixa compartilhada: todo mundo vê as conversas e qualquer um responde — do
// mesmo jeito que o B-Mail. Quem respondeu fica gravado na mensagem.
//
// A tela é a mesma no computador e no celular, mudando só o arranjo: no
// computador lista e conversa lado a lado; no celular a conversa cobre a lista
// e volta pelo "‹". Mensagem nova chega por realtime — ninguém aperta atualizar.

function horaCurta(iso) {
  const d = new Date(iso)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  const dias = Math.round((hoje - dia) / 86400000)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (dias === 0) return hora
  if (dias === 1) return `ontem ${hora}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtFone(t) {
  const n = String(t || '').replace(/\D/g, '').replace(/^55/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return t
}

const ICONE_TIPO = {
  imagem: '📷', audio: '🎤', video: '🎬', documento: '📄',
  figurinha: '🙂', local: '📍', contato: '👤',
}

function Balao({ m, nomeAutor }) {
  const meu = m.de_mim
  const falhou = m.status === 'falhou'
  return (
    <div className={cn('flex', meu ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] md:max-w-[70%] rounded-2xl px-3 py-2 space-y-1',
        meu
          ? falhou ? 'bg-danger/15 border border-danger/40' : 'bg-sinal/15 border border-sinal/30'
          : 'bg-surface-2 border border-line')}>
        {m.tipo !== 'texto' && (
          <p className="text-[11px] text-ink-3">
            {ICONE_TIPO[m.tipo] || ''} {m.tipo}
          </p>
        )}
        {m.midia_url && /^image/.test(m.midia_mime || '') && (
          <img src={m.midia_url} alt="" className="rounded-lg max-h-56 object-contain" />
        )}
        {m.midia_url && /^audio/.test(m.midia_mime || '') && (
          <audio src={m.midia_url} controls className="h-9 w-56 max-w-full" />
        )}
        {m.midia_url && !/^(image|audio)/.test(m.midia_mime || '') && (
          <a href={m.midia_url} target="_blank" rel="noreferrer"
            className="text-xs text-sinal underline">abrir arquivo</a>
        )}
        {m.texto && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
        )}
        <p className={cn('text-[10px] flex items-center gap-1.5',
          falhou ? 'text-danger' : 'text-ink-3')}>
          {horaCurta(m.criado_em)}
          {meu && nomeAutor ? ` · ${nomeAutor}` : ''}
          {falhou && ' · não enviada'}
        </p>
        {falhou && m.erro && <p className="text-[10px] text-danger leading-snug">{m.erro}</p>}
      </div>
    </div>
  )
}

export default function Whatsapp({ aoAbrirLead, aoLigar }) {
  const [conversas, setConversas] = useState([])
  const [abertaId, setAbertaId] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [equipe, setEquipe] = useState({})
  const [novoNumero, setNovoNumero] = useState('')
  const fimRef = useRef(null)

  const aberta = conversas.find((c) => c.id === abertaId) || null

  useEffect(() => {
    supabase.from('profiles').select('user_id, nome')
      .then(({ data }) => setEquipe(Object.fromEntries((data || []).map((p) => [p.user_id, p.nome]))))
  }, [])

  async function carregarConversas() {
    const { data } = await supabase.from('wa_conversas')
      .select('*, leads(empresa)')
      .eq('arquivada', false)
      .order('ultima_em', { ascending: false, nullsFirst: false })
      .limit(200)
    setConversas(data || [])
  }
  useEffect(() => { carregarConversas() }, [])

  // mensagem nova em qualquer conversa: atualiza a lista; se for a conversa
  // aberta, entra na tela na hora
  useEffect(() => {
    const canal = supabase.channel('wa-tempo-real')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens' },
        async (payload) => {
          const m = payload.new
          if (m.conversa_id === abertaId) {
            setMensagens((atuais) => (
              atuais.some((x) => x.id === m.id) ? atuais : [...atuais, m]))
            // a conversa está na tela: ler é o que a pessoa acabou de fazer,
            // então o contador não pode acender
            if (!m.de_mim) await supabase.rpc('wa_marcar_lida', { _conversa: abertaId })
          }
          carregarConversas()
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' },
        () => carregarConversas())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [abertaId])

  async function abrir(c) {
    setAbertaId(c.id); setMensagens([]); setErro('')
    const { data } = await supabase.from('wa_mensagens')
      .select('*').eq('conversa_id', c.id).order('criado_em').limit(300)
    setMensagens(data || [])
    if (c.nao_lidas > 0) {
      await supabase.rpc('wa_marcar_lida', { _conversa: c.id })
      carregarConversas()
    }
  }

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length])

  async function enviar() {
    const corpo = texto.trim()
    if (!corpo || enviando) return
    setEnviando(true); setErro('')
    const { data, error } = await supabase.functions.invoke('whatsapp-enviar', {
      body: { conversa_id: abertaId, telefone: aberta?.telefone || novoNumero, texto: corpo },
    })
    setEnviando(false)
    if (error || data?.erro) {
      // a mensagem foi gravada como "não enviada": recarrego para ela aparecer
      setErro(data?.erro || 'Não deu para enviar agora.')
    } else {
      setTexto('')
    }
    if (abertaId) {
      const { data: msgs } = await supabase.from('wa_mensagens')
        .select('*').eq('conversa_id', abertaId).order('criado_em').limit(300)
      setMensagens(msgs || [])
    }
    carregarConversas()
  }

  async function abrirNumeroNovo() {
    const so = novoNumero.replace(/\D/g, '')
    if (so.length < 10) { setErro('Digite DDD + número.'); return }
    const tel = so.startsWith('55') ? so : `55${so}`
    const { data } = await supabase.from('wa_conversas').select('*').eq('telefone', tel).maybeSingle()
    if (data) { setNovoNumero(''); abrir(data); return }
    const { data: nova, error } = await supabase.from('wa_conversas')
      .insert({ telefone: tel }).select('*').single()
    if (error) { setErro(error.message); return }
    await supabase.rpc('wa_ligar_lead', { _conversa: nova.id })
    setNovoNumero('')
    await carregarConversas()
    abrir(nova)
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return conversas
    return conversas.filter((c) => (
      String(c.nome || '').toLowerCase().includes(t)
      || String(c.telefone || '').includes(t.replace(/\D/g, ''))
      || String(c.leads?.empresa || '').toLowerCase().includes(t)
    ))
  }, [conversas, busca])

  const lista = (
    <div className={cn('flex flex-col min-h-0 h-full', abertaId && 'hidden md:flex')}>
      <div className="shrink-0 space-y-2 pb-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, número ou empresa"
          className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
        <div className="flex gap-1.5">
          <input value={novoNumero} onChange={(e) => setNovoNumero(e.target.value)}
            inputMode="tel" placeholder="Nova conversa: DDD + número"
            className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
          <button onClick={abrirNumeroNovo}
            className="shrink-0 rounded-lg bg-sinal px-3 text-sm font-bold text-white">Abrir</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
        {filtradas.length === 0 && (
          <p className="text-center text-ink-3 text-sm py-10 leading-relaxed">
            Nenhuma conversa ainda. Assim que o número estiver conectado, o que
            chegar no WhatsApp da empresa aparece aqui.
          </p>
        )}
        {filtradas.map((c) => (
          <button key={c.id} onClick={() => abrir(c)}
            className={cn('w-full text-left rounded-xl border px-3 py-2.5 transition',
              c.id === abertaId ? 'border-sinal/50 bg-sinal/10' : 'border-line bg-surface hover:bg-surface-2')}>
            <div className="flex items-baseline gap-2">
              <span className="flex-1 min-w-0 font-semibold text-sm truncate">
                {c.nome || c.leads?.empresa || fmtFone(c.telefone)}
              </span>
              {c.ultima_em && <span className="text-[10px] text-ink-3 shrink-0">{horaCurta(c.ultima_em)}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-xs text-ink-3 truncate">
                {c.ultima_mensagem || 'sem mensagens'}
              </span>
              {c.nao_lidas > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-sinal text-white
                  text-[10px] font-bold grid place-items-center tnum">{c.nao_lidas}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const conversa = (
    <div className={cn('flex flex-col min-h-0 h-full', !abertaId && 'hidden md:flex')}>
      {!aberta ? (
        <div className="flex-1 grid place-items-center text-ink-3 text-sm px-6 text-center">
          Escolha uma conversa à esquerda — ou abra uma nova pelo número.
        </div>
      ) : (
        <>
          <div className="shrink-0 flex items-center gap-2 pb-2 border-b border-line">
            <button onClick={() => setAbertaId(null)}
              className="md:hidden rounded-lg border border-line px-2 py-1.5 text-ink-2">‹</button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {aberta.nome || aberta.leads?.empresa || fmtFone(aberta.telefone)}
              </p>
              <p className="text-[11px] text-ink-3 truncate tnum">
                {fmtFone(aberta.telefone)}
                {aberta.leads?.empresa ? ` · ${aberta.leads.empresa}` : ''}
              </p>
            </div>
            {aberta.lead_id && aoAbrirLead && (
              <button onClick={() => aoAbrirLead(aberta.lead_id)} title="Abrir a ficha no CRM"
                className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-ink-2">
                <Icone nome="alvo" tam={14} />
              </button>
            )}
            {aoLigar && (
              <button title="Ligar para este número"
                onClick={() => aoLigar({
                  id: aberta.lead_id, empresa: aberta.nome || aberta.leads?.empresa || '',
                  telefone: aberta.telefone,
                })}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-ink-2">
                <Icone nome="fone" tam={14} />
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-3 space-y-2 pr-0.5">
            {mensagens.length === 0 && (
              <p className="text-center text-ink-3 text-xs py-8">Nenhuma mensagem nesta conversa.</p>
            )}
            {mensagens.map((m) => (
              <Balao key={m.id} m={m}
                nomeAutor={m.autor ? String(equipe[m.autor] || '').split(' ')[0] : ''} />
            ))}
            <div ref={fimRef} />
          </div>

          {erro && <p className="text-[11px] text-amber shrink-0 pb-1 leading-snug">{erro}</p>}

          <div className="shrink-0 flex items-end gap-2 pt-2 border-t border-line">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
              rows={1} placeholder="Escreva a mensagem — Enter envia"
              className="flex-1 min-w-0 rounded-xl bg-surface-2 border border-line px-3 py-2.5 text-sm
                outline-none focus:border-sinal resize-none max-h-32" />
            <button onClick={enviar} disabled={!texto.trim() || enviando}
              className="shrink-0 rounded-xl bg-sinal px-4 py-2.5 font-bold text-white text-sm disabled:opacity-40">
              {enviando ? '…' : <Icone nome="seta" tam={15} />}
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="p-4 md:p-6 h-[calc(100dvh-8.5rem)] md:h-[calc(100dvh-6.5rem)]">
      <div className="h-full min-h-0 md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-4">
        {lista}
        {conversa}
      </div>
    </div>
  )
}
