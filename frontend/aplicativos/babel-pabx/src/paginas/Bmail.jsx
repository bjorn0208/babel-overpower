import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import { prepararCorpo, montarSrcdoc } from '../lib/corpoSeguro'
import { ASSUNTO_MARKETING, TEXTO_MARKETING, montarEmailHtml, corpoTexto } from '../lib/email-marketing'

// B-Mail — a caixa de e-mail da Babel dentro do PABX.
//
// O navegador nunca fala JMAP direto: tudo passa pela ponte (servidor/bmail.js),
// que é onde ficam o escopo de conta, o registro de auditoria e os guardrails
// de envio.
//
// Sobre o desenho: caixa de e-mail é tela de leitura, não painel de controle.
// Por isso quase não há caixa dentro de caixa — a separação vem de espaço em
// branco e de um fio fino, não de borda em tudo. O vermelho aparece só onde
// há ação ou coisa não lida; o resto é cinza para o texto ganhar o foco.

const PONTE = import.meta.env.VITE_BMAIL_API || 'https://bmail.babel-os.com/api/mail'

// O servidor cria as pastas em inglês (Inbox, Sent Items…). Traduzimos pelo
// PAPEL e não pelo nome: o papel é padronizado no protocolo, então continua
// certo mesmo que alguém renomeie a pasta. Renomear no servidor seria pior —
// mudaria o nome para qualquer outro cliente de e-mail que use a mesma caixa.
const PASTAS = {
  sent: { nome: 'Enviadas', icone: 'seta' },
  inbox: { nome: 'Entrada', icone: 'email' },
  drafts: { nome: 'Rascunho', icone: 'lapis' },
  trash: { nome: 'Lixeira', icone: 'lixo' },
  junk: { nome: 'Lixo eletrônico', icone: 'trava' },
  archive: { nome: 'Arquivados', icone: 'arquivo' },
}
const daPasta = (p) => PASTAS[p.role] || { nome: p.name, icone: 'email' }

// A ordem da barra é a que o Theus pediu, não a que o servidor devolve — o
// servidor ordena por um critério interno dele. Pasta sem papel conhecido
// (criada à mão) cai no fim, em ordem alfabética.
// "Com estrela" não é pasta de verdade: é um filtro por marca, como no Gmail.
const ESTRELADAS = { id: '@estreladas', role: '@estreladas', name: 'Com estrela',
  totalEmails: 0, unreadEmails: 0 }
PASTAS['@estreladas'] = { nome: 'Com estrela', icone: 'trofeu' }

const ORDEM = Object.keys(PASTAS)
const ordenarPastas = (lista) => [...lista].sort((a, b) => {
  const ia = ORDEM.indexOf(a.role)
  const ib = ORDEM.indexOf(b.role)
  if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  return String(a.name).localeCompare(String(b.name), 'pt-BR')
})

// Data que se lê de relance: hoje vira hora, esta semana vira dia da semana,
// o resto vira data curta. Ninguém precisa do ano de um e-mail de ontem.
function quando(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dias = Math.round((hoje - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  if (dias <= 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (dias === 1) return 'ontem'
  if (dias < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

const iniciais = (nome, email) => {
  const base = (nome || email || '?').trim()
  const partes = base.split(/[\s@.]+/).filter(Boolean)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}

// Tom do avatar derivado do endereço: o mesmo remetente tem sempre a mesma
// cor, o que ajuda a reconhecer a conversa antes mesmo de ler o nome. Fica
// na faixa de cinzas frios para não competir com o vermelho da marca.
function tomDoAvatar(chave) {
  let n = 0
  for (const c of String(chave || '')) n = (n * 31 + c.charCodeAt(0)) % 360
  return `hsl(${n} 14% 32%)`
}

// A caixa é compartilhada e a ponte guarda a credencial dela — por isso ela
// exige o login do PABX antes de responder qualquer coisa. O token vai em
// toda chamada; sem ele a ponte devolve 401 e a tela pede para entrar.
async function pedir(caminho, opcoes = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  // Enviar passa por criar a mensagem, submeter e arquivar em Enviados —
  // leva mais que uma leitura, e cortar no meio deixaria o e-mail em limbo.
  const prazo = /^(enviar|responder)/.test(caminho) ? 30000 : 12000
  const r = await fetch(`${PONTE}/${caminho}`, {
    ...opcoes,
    headers: { ...(opcoes.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(prazo),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok || corpo.erro) throw new Error(corpo.erro || `HTTP ${r.status}`)
  return corpo
}

function Avatar({ nome, email, tam = 38 }) {
  return (
    <span
      className="shrink-0 grid place-items-center rounded-full font-semibold text-white select-none"
      style={{ width: tam, height: tam, background: tomDoAvatar(email || nome), fontSize: tam * 0.36 }}
    >
      {iniciais(nome, email)}
    </span>
  )
}

// ─────────────────── corpo da mensagem, isolado ───────────────────
// iframe sandbox SEM allow-scripts e SEM allow-same-origin: mesmo que o
// sanitizador falhasse, nada ali dentro alcança o PABX. O sanitizador é a
// segunda camada; a CSP dentro do srcdoc é a terceira.
function CorpoMensagem({ html, texto }) {
  const [verImagens, setVerImagens] = useState(false)

  const { srcdoc, bloqueadas } = useMemo(() => {
    if (!html) return { srcdoc: null, bloqueadas: 0 }
    const r = prepararCorpo(html, { exibirImagens: verImagens, proxy: `${PONTE}/proxy-image` })
    return {
      srcdoc: montarSrcdoc(r.html, { proxy: `${PONTE}/proxy-image` }),
      bloqueadas: r.imagensBloqueadas,
    }
  }, [html, verImagens])

  if (!html) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink-2">
        {texto || '(sem conteúdo)'}
      </pre>
    )
  }

  return (
    <div className="space-y-3">
      {bloqueadas > 0 && !verImagens && (
        <div className="flex items-center gap-2.5 rounded-xl bg-amber/10 px-3.5 py-2.5">
          <Icone nome="trava" tam={14} className="text-amber shrink-0" />
          <span className="flex-1 text-[12px] text-ink-2 leading-snug">
            {bloqueadas === 1 ? 'Uma imagem foi bloqueada' : `${bloqueadas} imagens foram bloqueadas`} —
            elas avisariam o remetente que você leu.
          </span>
          <button onClick={() => setVerImagens(true)}
            className="shrink-0 rounded-full bg-amber/20 px-3 py-1 text-[11px] font-bold text-amber
              hover:bg-amber/30 transition">
            Exibir
          </button>
        </div>
      )}
      <iframe title="conteúdo da mensagem" sandbox="" srcDoc={srcdoc}
        className="w-full min-h-[18rem] rounded-xl bg-white" />
    </div>
  )
}

// Um compositor só, para os três casos: escrever do zero, responder e
// encaminhar. Muda o que vem preenchido, não a mecânica — assim o envio, o
// tratamento de erro e o arquivo em Enviadas têm um caminho único.
//
// Ao responder, os cabeçalhos que amarram o fio vão junto; sem eles a resposta
// abre como mensagem solta no cliente do outro lado e a conversa se parte.
function Compositor({ modo = 'novo', email = null, aoFechar, aoEnviado }) {
  const respondendo = modo === 'responder'
  const encaminhando = modo === 'encaminhar'

  const assuntoInicial = (() => {
    if (respondendo) {
      return /^re:/i.test(email?.subject || '') ? email.subject : `Re: ${email?.subject || ''}`
    }
    if (encaminhando) {
      return /^enc:/i.test(email?.subject || '') ? email.subject : `Enc: ${email?.subject || ''}`
    }
    return ''
  })()

  // Encaminhar leva o original junto, citado — é o que a pessoa do outro lado
  // precisa para entender do que se trata.
  const textoInicial = encaminhando
    ? `\n\n---------- Mensagem encaminhada ----------\nDe: ${
        email?.from?.name || ''} <${email?.from?.email || ''}>\nAssunto: ${
        email?.subject || ''}\n\n${email?.texto || '(mensagem em HTML)'}`
    : ''

  const [para, setPara] = useState(respondendo ? (email?.from?.email || '') : '')
  const [assunto, setAssunto] = useState(assuntoInicial)
  const [texto, setTexto] = useState(textoInicial)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  // Modelo Babel OS: o texto abaixo vira o e-mail DESENHADO (hero em gradiente,
  // cartões, botão). Fica desligado por padrão — mensagem interna não precisa
  // de campanha em volta.
  const [modelo, setModelo] = useState(false)
  const [nomeDestino, setNomeDestino] = useState('')

  function aplicarModelo() {
    setAssunto(ASSUNTO_MARKETING)
    setTexto(TEXTO_MARKETING)
    setModelo(true)
  }

  const destinoOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para.trim())

  async function enviar() {
    if (!destinoOk || !texto.trim() || enviando) return
    setEnviando(true); setErro('')
    try {
      await pedir('responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para: para.trim(),
          assunto: assunto.trim() || '(sem assunto)',
          texto: modelo ? corpoTexto(texto, { primeiroNome: nomeDestino }) : texto,
          html: modelo
            ? montarEmailHtml(texto, { primeiroNome: nomeDestino })
            : '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65">'
              + texto.split('\n').map((l) => `<p>${l.replace(/[<>&]/g, (c) => (
                { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) || '&nbsp;'}</p>`).join('')
              + '</div>',
          // só a resposta entra no fio; encaminhar e escrever novo começam outro
          responder_a: respondendo
            ? { messageId: email?.messageId, references: email?.references }
            : null,
        }),
      })
      aoEnviado()
    } catch (e) {
      setErro(String(e.message || e))
    }
    setEnviando(false)
  }

  const campo = 'w-full rounded-xl bg-bg/60 px-4 py-2.5 text-[14px] outline-none '
    + 'ring-1 ring-line focus:ring-sinal/60 transition placeholder:text-ink-3'

  return (
    <div className="rounded-2xl bg-surface-2 p-4 space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
        {respondendo ? 'Responder' : encaminhando ? 'Encaminhar' : 'Nova mensagem'}
      </p>

      <input value={para} onChange={(e) => setPara(e.target.value)}
        readOnly={respondendo} placeholder="Para: nome@empresa.com.br"
        autoFocus={!respondendo}
        className={`${campo} ${respondendo ? 'opacity-70' : ''}`} />

      {!respondendo && !encaminhando && (
        modelo ? (
          <div className="flex items-center gap-2 rounded-xl bg-sinal/10 ring-1 ring-sinal/30 px-3 py-2">
            <span className="text-[11px] font-bold text-sinal shrink-0">🗼 Modelo Babel OS</span>
            <input value={nomeDestino} onChange={(e) => setNomeDestino(e.target.value)}
              placeholder="Primeiro nome de quem recebe"
              className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-ink-3" />
            <button onClick={() => setModelo(false)} title="Voltar ao e-mail simples"
              className="text-[11px] text-ink-3 underline shrink-0">tirar</button>
          </div>
        ) : (
          <button onClick={aplicarModelo}
            className="w-full rounded-xl ring-1 ring-line px-3 py-2 text-[12px] font-semibold text-ink-2
              hover:ring-sinal/50 hover:text-sinal transition text-left">
            🗼 Usar o modelo Babel OS <span className="text-ink-3 font-normal">· e-mail desenhado, com logo e botão</span>
          </button>
        )
      )}

      <input value={assunto} onChange={(e) => setAssunto(e.target.value)}
        placeholder="Assunto" className={campo} />

      <textarea autoFocus={respondendo} value={texto} onChange={(e) => setTexto(e.target.value)}
        rows={encaminhando ? 10 : 7} placeholder="Escreva sua mensagem…"
        className={`${campo} text-[15px] leading-relaxed resize-y`} />

      {erro && <p className="text-[12px] text-danger leading-snug">{erro}</p>}

      <div className="flex items-center gap-2 pt-0.5">
        <button onClick={enviar} disabled={!destinoOk || !texto.trim() || enviando}
          className="inline-flex items-center gap-2 rounded-full bg-sinal px-5 py-2.5 text-[13px]
            font-semibold text-white transition hover:brightness-110
            disabled:opacity-35 disabled:hover:brightness-100">
          <Icone nome="seta" tam={13} />
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
        <button onClick={aoFechar} disabled={enviando}
          className="rounded-full px-4 py-2.5 text-[13px] text-ink-3 hover:text-ink-2 transition">
          Descartar
        </button>
        {para && !destinoOk && (
          <span className="text-[11px] text-ink-3">endereço incompleto</span>
        )}
      </div>
    </div>
  )
}

export default function Bmail() {
  const [estado, setEstado] = useState('carregando')
  const [erro, setErro] = useState('')
  const [pastas, setPastas] = useState([])
  const [pastaSel, setPastaSel] = useState(null)
  const [lista, setLista] = useState([])
  const [aberta, setAberta] = useState(null)
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [compondo, setCompondo] = useState(null)   // {modo:'novo'|'responder'|'encaminhar', email}
  const [aviso, setAviso] = useState('')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState(() => new Set())
  const [recarga, setRecarga] = useState(0)
  const [eu, setEu] = useState(null)   // quem está usando a caixa compartilhada

  useEffect(() => {
    (async () => {
      try {
        pedir('eu').then(setEu).catch(() => {})
        const p = ordenarPastas(await pedir('mailboxes'))
        // a virtual entra logo depois da Entrada
        const i = p.findIndex((x) => x.role === 'inbox')
        p.splice(i < 0 ? p.length : i + 1, 0, ESTRELADAS)
        setPastas(p)
        setPastaSel(p.find((x) => x.role === 'inbox')?.id || p[0]?.id || null)
        setEstado('pronto')
      } catch (e) {
        setErro(String(e.message || e))
        setEstado('sem-ponte')
      }
    })()
  }, [])

  useEffect(() => {
    if (!pastaSel) return
    let vivo = true
    ;(async () => {
      setCarregandoLista(true); setAberta(null); setCompondo(null); setMarcados(new Set())
      try {
        const r = pastaSel === '@estreladas'
          ? await pedir('marcadas?limit=50')
          : await pedir(`threads?mailboxId=${encodeURIComponent(pastaSel)}&limit=50`)
        if (vivo) setLista(r.threads || [])
      } catch (e) {
        if (vivo) { setLista([]); setErro(String(e.message || e)) }
      }
      if (vivo) setCarregandoLista(false)
    })()
    return () => { vivo = false }
  }, [pastaSel, recarga])

  async function abrir(t) {
    setAberta({ carregando: true, resumo: t })
    setCompondo(null)
    try {
      const r = await pedir(`thread?id=${encodeURIComponent(t.threadId || t.id)}`)
      setAberta({ resumo: t, emails: r.emails || [] })
      if (t.unread) {
        // otimista: a lista muda antes da resposta do servidor
        setLista((l) => l.map((x) => (x.id === t.id ? { ...x, unread: false } : x)))
        setPastas((ps) => ps.map((p) => (p.id === pastaSel
          ? { ...p, unreadEmails: Math.max(0, (p.unreadEmails || 1) - 1) } : p)))
        pedir('marcar', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [t.id], set: { seen: true } }),
        }).catch(() => setLista((l) => l.map((x) => (x.id === t.id ? { ...x, unread: true } : x))))
      }
    } catch (e) {
      setAberta({ resumo: t, erro: String(e.message || e) })
    }
  }

  // Todas as ações são otimistas: a lista muda na hora e o servidor confirma
  // depois. Se falhar, recarrega e o estado volta ao que é verdade — melhor do
  // que travar a tela esperando resposta a cada clique.
  function tirarDaLista(ids) {
    setLista((l) => l.filter((t) => !ids.includes(t.id)))
    setMarcados(new Set())
  }

  async function mover(ids, para) {
    if (!ids.length) return
    tirarDaLista(ids)
    try {
      await pedir('mover', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, para }),
      })
      const nomes = { trash: 'Movida para a Lixeira', junk: 'Marcada como spam',
        archive: 'Arquivada', inbox: 'Movida para a Entrada' }
      setAviso(ids.length > 1
        ? `${ids.length} mensagens · ${nomes[para] || 'movidas'}`
        : nomes[para] || 'Movida')
      setTimeout(() => setAviso(''), 3500)
      setPastas(await (async () => {
        pedir('eu').then(setEu).catch(() => {})
        const p = ordenarPastas(await pedir('mailboxes'))
        const i = p.findIndex((x) => x.role === 'inbox')
        p.splice(i < 0 ? p.length : i + 1, 0, ESTRELADAS)
        return p
      })())
    } catch (e) {
      setErro(String(e.message || e))
      setRecarga((n) => n + 1)
    }
  }

  async function alternar(ids, campo, valor) {
    if (!ids.length) return
    setLista((l) => l.map((t) => (ids.includes(t.id)
      ? { ...t, [campo === 'seen' ? 'unread' : 'flagged']: campo === 'seen' ? !valor : valor }
      : t)))
    setMarcados(new Set())
    try {
      await pedir('marcar', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, set: { [campo]: valor } }),
      })
    } catch {
      setRecarga((n) => n + 1)
    }
  }

  // Caixa compartilhada: quem assume vira o responsável, e a etiqueta aparece
  // para todo mundo. É o que evita dois vendedores responderem o mesmo lead.
  async function assumir(ids, soltar = false) {
    if (!ids.length) return
    setLista((l) => l.map((t) => (ids.includes(t.id)
      ? { ...t, dono: soltar ? null : eu?.etiqueta } : t)))
    setMarcados(new Set())
    try {
      await pedir('assumir', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, soltar }),
      })
    } catch {
      setRecarga((n) => n + 1)
    }
  }

  const alternarMarca = (id) => setMarcados((m) => {
    const novo = new Set(m)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    return novo
  })

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((t) => [t.subject, t.snippet, t.from?.name, t.from?.email]
      .some((v) => String(v || '').toLowerCase().includes(q)))
  }, [lista, busca])

  if (estado === 'sem-ponte') {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="max-w-md text-center space-y-4">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface-2">
            <Icone nome="email" tam={24} className="text-ink-3" />
          </span>
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">Caixa fora de alcance</p>
            <p className="text-sm text-ink-2 leading-relaxed">
              O B-Mail conversa com o servidor da Babel através de uma ponte local,
              e ela não está respondendo.
            </p>
          </div>
          <pre className="rounded-xl bg-surface-2 p-3.5 text-left text-[11px] leading-relaxed
            text-ink-2 overflow-x-auto">{`cd bmail/servidor && node bmail.js &`}</pre>
          <p className="text-[11px] text-ink-3">{erro}</p>
        </div>
      </div>
    )
  }

  if (estado === 'carregando') {
    return (
      <div className="h-full grid place-items-center">
        <p className="text-sm text-ink-3">Abrindo sua caixa…</p>
      </div>
    )
  }

  const pastaAtual = pastas.find((p) => p.id === pastaSel)

  // Navegação como a do Gmail: a lista ocupa a área toda e, ao abrir uma
  // mensagem, ela TOMA O LUGAR da lista em vez de dividir a tela com ela.
  // Ler e-mail é leitura corrida — texto espremido numa coluna estreita cansa,
  // e newsletter em tabela quebra. Voltar traz a lista de volta no mesmo lugar.
  const lendo = Boolean(aberta)

  return (
    <div className="h-full grid gap-4 p-4 md:p-5
      grid-rows-[auto_minmax(0,1fr)]
      md:grid-cols-[12rem_minmax(0,1fr)] md:grid-rows-1">

      {/* ── pastas ─────────────────────────────────────────────── */}
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {pastas.map((p) => {
          const info = daPasta(p)
          const ativa = pastaSel === p.id
          return (
            <button key={p.id} onClick={() => { setPastaSel(p.id); setAberta(null); setCompondo(null) }}
              className={`group relative shrink-0 md:w-full flex items-center gap-2.5 rounded-xl
                px-3 py-2.5 text-left text-[13px] transition ${
                ativa ? 'bg-surface text-ink font-semibold' : 'text-ink-2 hover:bg-surface/60'}`}>
              {ativa && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2
                  rounded-r-full bg-sinal" />
              )}
              <Icone nome={info.icone} tam={15}
                className={ativa ? 'text-sinal shrink-0' : 'text-ink-3 shrink-0'} />
              <span className="flex-1 truncate">{info.nome}</span>
              {p.unreadEmails > 0 && (
                <span className="shrink-0 rounded-full bg-sinal px-1.5 text-[10px] font-bold
                  leading-[1.35rem] text-white tnum">{p.unreadEmails}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── área principal: OU a lista, OU a mensagem aberta ───── */}
      <section className="min-h-0 flex flex-col rounded-2xl bg-surface overflow-hidden">

        {/* cabeçalho muda conforme o que está sendo mostrado */}
        <header className="shrink-0 flex items-center gap-3 px-4 md:px-5 py-3.5
          border-b border-line-soft">
          {lendo ? (
            <>
              <button onClick={() => { setAberta(null); setCompondo(null) }}
                title="Voltar para a lista"
                className="shrink-0 grid h-9 w-9 place-items-center rounded-full
                  text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                <Icone nome="seta" tam={16} className="rotate-180" />
              </button>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">
                {pastaAtual ? daPasta(pastaAtual).nome : ''}
              </span>
            </>
          ) : (
            marcados.size > 0 ? (
              <>
                <button onClick={() => setMarcados(new Set())} title="Limpar seleção"
                  className="shrink-0 grid h-8 w-8 place-items-center rounded-full
                    text-ink-2 hover:bg-surface-2 transition">
                  <Icone nome="x" tam={15} />
                </button>
                <span className="shrink-0 text-[13px] font-semibold tnum">
                  {marcados.size} selecionada{marcados.size > 1 ? 's' : ''}
                </span>
                <span className="flex-1" />
                {[
                  ['arquivo', 'Arquivar', () => mover([...marcados], 'archive')],
                  ['lixo', 'Excluir', () => mover([...marcados], 'trash')],
                  ['trava', 'Marcar como spam', () => mover([...marcados], 'junk')],
                  ['check', 'Marcar como lida', () => alternar([...marcados], 'seen', true)],
                  ['email', 'Marcar como não lida', () => alternar([...marcados], 'seen', false)],
                  ['equipe', 'Assumir as selecionadas', () => assumir([...marcados])],
                ].map(([ic, titulo, acao]) => (
                  <button key={titulo} onClick={acao} title={titulo}
                    className="shrink-0 grid h-8 w-8 place-items-center rounded-full
                      text-ink-2 hover:bg-surface-2 hover:text-ink transition">
                    <Icone nome={ic} tam={15} />
                  </button>
                ))}
              </>
            ) : (
              <>
              <h2 className="shrink-0 text-[15px] font-semibold">
                {pastaAtual ? daPasta(pastaAtual).nome : ''}
              </h2>
              <div className="relative flex-1 max-w-sm">
                <Icone nome="busca" tam={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar nesta pasta"
                  className="w-full rounded-full bg-surface-2 pl-8 pr-3 py-1.5 text-[12px]
                    outline-none ring-1 ring-transparent focus:ring-line transition
                    placeholder:text-ink-3" />
              </div>
              <span className="shrink-0 hidden lg:inline text-[11px] text-ink-3 tnum">
                {filtrada.length > 0
                  && `${filtrada.length} ${filtrada.length === 1 ? 'mensagem' : 'mensagens'}`}
              </span>
              <button onClick={() => setRecarga((n) => n + 1)} title="Atualizar"
                className="shrink-0 grid h-8 w-8 place-items-center rounded-full
                  text-ink-2 hover:bg-surface-2 hover:text-ink transition">
                <Icone nome="rediscar" tam={15} />
              </button>
              <button onClick={() => setCompondo({ modo: 'novo' })}
                className="shrink-0 inline-flex items-center gap-2 rounded-full bg-sinal
                  px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110">
                <Icone nome="lapis" tam={13} />
                <span className="hidden sm:inline">Escrever</span>
              </button>
              </>
            )
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ─────────── LISTA ─────────── */}
          {!lendo && (
            <>
              {compondo?.modo === 'novo' && (
                <div className="p-4 md:p-5 border-b border-line-soft">
                  <Compositor modo="novo" aoFechar={() => setCompondo(null)}
                    aoEnviado={() => {
                      setCompondo(null)
                      setAviso('Mensagem enviada.')
                      setTimeout(() => setAviso(''), 4000)
                    }} />
                </div>
              )}
              {aviso && !compondo && (
                <div className="m-4 md:m-5 rounded-xl bg-sinal/12 px-4 py-2.5 text-[12px] text-sinal">
                  {aviso}
                </div>
              )}
              {carregandoLista && (
                <p className="px-4 py-12 text-center text-[13px] text-ink-3">Carregando…</p>
              )}
              {!carregandoLista && filtrada.length === 0 && (
                <div className="px-6 py-16 text-center space-y-1.5">
                  <p className="text-[13px] text-ink-2">
                    {busca ? 'Nada encontrado' : 'Nenhuma mensagem aqui'}
                  </p>
                  {!busca && (
                    <p className="text-[11px] text-ink-3">
                      As mensagens aparecem assim que chegarem.
                    </p>
                  )}
                </div>
              )}

              {filtrada.map((t) => {
                const sel = marcados.has(t.id)
                return (
                  // A linha inteira é clicável para abrir, mas caixa, estrela e
                  // ações são botões próprios — por isso o container é uma div
                  // com onClick, e não um <button> (botão dentro de botão é
                  // HTML inválido e quebra o clique no Safari).
                  <div key={t.id} role="button" tabIndex={0}
                    onClick={() => abrir(t)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') abrir(t) }}
                    className={`group relative w-full cursor-pointer px-3 md:px-4 py-3 flex
                      items-center gap-2.5 border-b border-line-soft/60 transition
                      ${sel ? 'bg-sinal/8' : 'hover:bg-surface-2/70'}`}>

                    {sel && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-sinal" />}

                    <button onClick={(ev) => { ev.stopPropagation(); alternarMarca(t.id) }}
                      title={sel ? 'Desmarcar' : 'Selecionar'}
                      className={`shrink-0 grid h-[18px] w-[18px] place-items-center rounded
                        border transition ${sel
                          ? 'border-sinal bg-sinal text-white'
                          : 'border-line text-transparent hover:border-ink-3'}`}>
                      <Icone nome="check" tam={11} />
                    </button>

                    <button onClick={(ev) => { ev.stopPropagation(); alternar([t.id], 'flagged', !t.flagged) }}
                      title={t.flagged ? 'Tirar a estrela' : 'Marcar com estrela'}
                      className={`shrink-0 grid h-6 w-6 place-items-center rounded-full transition
                        ${t.flagged ? 'text-amber' : 'text-ink-3/40 hover:text-ink-3'}`}>
                      <Icone nome="trofeu" tam={14} />
                    </button>

                    <Avatar nome={t.from?.name} email={t.from?.email} tam={34} />

                    <span className="flex-1 min-w-0 md:flex md:items-baseline md:gap-3">
                      <span className="block md:w-48 md:shrink-0 flex items-center gap-1.5">
                        <span className={`min-w-0 truncate text-[13px] ${
                          t.unread ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                          {t.from?.name || t.from?.email || 'sem remetente'}
                        </span>
                        {t.dono && (
                          <span title={`Com ${t.dono}`}
                            className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold
                              uppercase tracking-wide ${t.dono === eu?.etiqueta
                                ? 'bg-sinal/20 text-sinal' : 'bg-line text-ink-3'}`}>
                            {t.dono}
                          </span>
                        )}
                      </span>
                      <span className="block md:flex-1 md:min-w-0 md:truncate">
                        <span className={`text-[13px] ${
                          t.unread ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                          {t.subject}
                        </span>
                        <span className="hidden md:inline text-[13px] text-ink-3">
                          {' — '}{t.snippet}
                        </span>
                        <span className="md:hidden block truncate text-[11px] text-ink-3">
                          {t.snippet}
                        </span>
                      </span>
                    </span>

                    {/* data some no hover e dá lugar às ações, como no Gmail */}
                    <span className="shrink-0 flex items-center gap-2 md:group-hover:hidden">
                      {t.hasAttachment && <Icone nome="arquivo" tam={12} className="text-ink-3" />}
                      {t.unread && <span className="h-1.5 w-1.5 rounded-full bg-sinal" />}
                      <span className={`text-[11px] tnum ${
                        t.unread ? 'font-semibold text-ink-2' : 'text-ink-3'}`}>
                        {quando(t.receivedAt)}
                      </span>
                    </span>

                    <span className="hidden md:group-hover:flex shrink-0 items-center gap-0.5">
                      {[
                        ['arquivo', 'Arquivar', () => mover([t.id], 'archive')],
                        ['lixo', 'Excluir', () => mover([t.id], 'trash')],
                        ['trava', 'Spam', () => mover([t.id], 'junk')],
                        [t.unread ? 'check' : 'email',
                          t.unread ? 'Marcar como lida' : 'Marcar como não lida',
                          () => alternar([t.id], 'seen', t.unread)],
                        ['equipe',
                          t.dono === eu?.etiqueta ? 'Largar (não é mais minha)' : 'Assumir esta conversa',
                          () => assumir([t.id], t.dono === eu?.etiqueta)],
                      ].map(([ic, titulo, acao]) => (
                        <button key={titulo} title={titulo}
                          onClick={(ev) => { ev.stopPropagation(); acao() }}
                          className="grid h-7 w-7 place-items-center rounded-full text-ink-3
                            hover:bg-line hover:text-ink transition">
                          <Icone nome={ic} tam={13} />
                        </button>
                      ))}
                    </span>
                  </div>
                )
              })}
            </>
          )}

          {/* ─────────── MENSAGEM ABERTA ─────────── */}
          {lendo && (
            <>
              {aviso && (
                <div className="m-4 md:m-5 rounded-xl bg-sinal/12 px-4 py-2.5 text-[12px] text-sinal">
                  {aviso}
                </div>
              )}
              {aberta.carregando && (
                <p className="p-10 text-center text-[13px] text-ink-3">Abrindo…</p>
              )}
              {aberta.erro && (
                <p className="p-10 text-center text-[13px] text-danger">{aberta.erro}</p>
              )}

              {aberta.emails?.length > 0 && (
                // largura de leitura: texto muito largo cansa a vista, então a
                // coluna para de crescer mesmo em tela grande
                <article className="mx-auto max-w-3xl p-5 md:p-8 space-y-7">
                  <h1 className="text-[21px] md:text-[26px] font-semibold leading-snug text-balance">
                    {aberta.emails[0].subject || '(sem assunto)'}
                  </h1>

                  {aberta.emails.map((e, i) => (
                    <div key={e.id}
                      className={i > 0 ? 'pt-7 border-t border-line-soft space-y-4' : 'space-y-4'}>
                      <header className="flex items-center gap-3">
                        <Avatar nome={e.from?.name} email={e.from?.email} tam={44} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold">
                            {e.from?.name || e.from?.email}
                          </p>
                          <p className="truncate text-[11px] text-ink-3">
                            {e.from?.name ? e.from.email : ''}
                            {e.to?.length ? ` · para ${e.to.map((x) => x.name || x.email).join(', ')}` : ''}
                          </p>
                        </div>
                        <time className="shrink-0 text-[11px] text-ink-3 tnum">
                          {new Date(e.receivedAt).toLocaleString('pt-BR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </time>
                      </header>

                      <CorpoMensagem html={e.html} texto={e.texto} />

                      {e.anexos?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {e.anexos.map((a) => (
                            <span key={a.blobId}
                              className="inline-flex items-center gap-2 rounded-xl bg-surface-2
                                px-3 py-2 text-[11px] text-ink-2">
                              <Icone nome="arquivo" tam={13} className="text-ink-3" />
                              <span className="truncate max-w-[12rem]">{a.nome}</span>
                              <span className="text-ink-3 tnum">
                                {Math.round((a.tamanho || 0) / 1024)} KB
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {compondo?.email?.id === e.id ? (
                        <Compositor modo={compondo.modo} email={e}
                          aoFechar={() => setCompondo(null)}
                          aoEnviado={() => {
                            setCompondo(null)
                            setAviso(compondo.modo === 'encaminhar'
                              ? 'Mensagem encaminhada.' : 'Resposta enviada.')
                            setTimeout(() => setAviso(''), 4000)
                          }} />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setCompondo({ modo: 'responder', email: e })}
                            className="inline-flex items-center gap-2 rounded-full bg-surface-2
                              px-4 py-2 text-[13px] font-medium text-ink-2 transition
                              hover:bg-line hover:text-ink">
                            <Icone nome="seta" tam={13} />
                            Responder
                          </button>
                          <button onClick={() => setCompondo({ modo: 'encaminhar', email: e })}
                            className="inline-flex items-center gap-2 rounded-full bg-surface-2
                              px-4 py-2 text-[13px] font-medium text-ink-2 transition
                              hover:bg-line hover:text-ink">
                            <Icone nome="rediscar" tam={13} />
                            Encaminhar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </article>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
