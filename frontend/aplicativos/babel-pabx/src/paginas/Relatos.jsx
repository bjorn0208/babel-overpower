import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import { cn } from '../componentes/ui'

const caixa = 'rounded-xl bg-surface border border-line'

// Mural de bugs e melhorias: a equipe relata o que quebrou e o que quer
// diferente — escrevendo, gravando um áudio ou mandando o print. Todo mundo
// vê o mesmo quadro, e o "resolvido" fecha o ciclo sem ninguém precisar
// perguntar no WhatsApp se já foi arrumado.

// O celular não grava webm; o iPhone só aceita mp4/aac. Pega o 1º que o
// navegador desta pessoa realmente suporta em vez de assumir um formato.
const FORMATOS_AUDIO = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg']
function formatoAudio() {
  if (typeof MediaRecorder === 'undefined') return null
  return FORMATOS_AUDIO.find((f) => MediaRecorder.isTypeSupported?.(f)) || ''
}

function quando(iso) {
  const d = new Date(iso)
  const min = Math.round((Date.now() - d) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 1440) return `há ${Math.round(min / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const ehImagem = (t) => String(t || '').startsWith('image/')

// Arquivo no bucket privado só abre por URL assinada — vale 1 h, gerada na
// hora em que o cartão aparece na tela.
function useUrlAssinada(path) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let vivo = true
    supabase.storage.from('relatos').createSignedUrl(path, 3600)
      .then(({ data }) => { if (vivo) setUrl(data?.signedUrl || null) })
    return () => { vivo = false }
  }, [path])
  return url
}

function Anexo({ anexo }) {
  const url = useUrlAssinada(anexo.path)
  if (!url) return <span className="text-[11px] text-ink-3">carregando anexo…</span>
  if (ehImagem(anexo.tipo)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block shrink-0">
        <img src={url} alt={anexo.nome} loading="lazy"
          className="h-24 w-24 rounded-lg object-cover border border-line hover:border-sinal transition" />
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[11px] font-semibold text-ink-2 hover:border-sinal hover:text-sinal transition max-w-[12rem]">
      <Icone nome="arquivo" tam={13} className="shrink-0" />
      <span className="truncate">{anexo.nome}</span>
    </a>
  )
}

function Audio({ path }) {
  const url = useUrlAssinada(path)
  if (!url) return <p className="text-[11px] text-ink-3">carregando áudio…</p>
  return <audio src={url} controls preload="none" className="w-full h-9" />
}

// ---------- gravador ----------
function Gravador({ audio, aoGravar, aoLimpar }) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState('')
  const rec = useRef(null)
  const trilha = useRef(null)

  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [gravando])

  // sair da aba no meio da gravação deixaria o microfone ligado
  useEffect(() => () => trilha.current?.getTracks().forEach((t) => t.stop()), [])

  async function comecar() {
    setErro('')
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
      trilha.current = fluxo
      const tipo = formatoAudio()
      const mr = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined)
      const pedacos = []
      mr.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(pedacos, { type: mr.mimeType || 'audio/webm' })
        fluxo.getTracks().forEach((t) => t.stop())
        aoGravar({ blob, url: URL.createObjectURL(blob), segundos })
      }
      mr.start()
      rec.current = mr
      setSegundos(0)
      setGravando(true)
    } catch {
      setErro('O navegador bloqueou o microfone. Libere a permissão e tente de novo.')
    }
  }

  function parar() {
    rec.current?.stop()
    setGravando(false)
  }

  if (audio) {
    return (
      <div className="flex items-center gap-2">
        <audio src={audio.url} controls className="flex-1 h-9" />
        <button type="button" onClick={aoLimpar} title="Apagar o áudio"
          className="shrink-0 rounded-lg border border-line px-2.5 py-2 text-ink-3 hover:text-danger hover:border-danger/50 transition">
          <Icone nome="lixo" tam={14} />
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={gravando ? parar : comecar}
        className={cn('w-full rounded-lg py-2.5 text-sm font-bold transition flex items-center justify-center gap-2',
          gravando ? 'bg-danger text-white' : 'border border-line text-ink-2 hover:border-sinal hover:text-sinal')}>
        <Icone nome={gravando ? 'parar' : 'mic'} tam={14} />
        {gravando ? `Gravando… ${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')} · tocar para parar`
          : 'Gravar áudio explicando'}
      </button>
      {erro && <p className="text-[11px] text-amber">{erro}</p>}
    </div>
  )
}

// ---------- formulário ----------
function NovoRelato({ perfil, aoCriar }) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState('bug')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [audio, setAudio] = useState(null)
  const [arquivos, setArquivos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  function limpar() {
    setTipo('bug'); setTitulo(''); setDescricao('')
    setAudio(null); setArquivos([]); setErro(''); setAberto(false)
  }

  async function enviar() {
    if (!titulo.trim()) { setErro('Escreva um título curto para o relato.'); return }
    setEnviando(true); setErro('')
    try {
      const id = crypto.randomUUID()
      const anexos = []
      for (const arq of arquivos) {
        const path = `${id}/${Date.now()}-${arq.name.replace(/[^\w.\-]/g, '_')}`
        const { error } = await supabase.storage.from('relatos')
          .upload(path, arq, { contentType: arq.type || 'application/octet-stream' })
        if (error) throw new Error(`anexo ${arq.name}: ${error.message}`)
        anexos.push({ path, nome: arq.name, tipo: arq.type })
      }
      let audioPath = null
      if (audio) {
        const ext = (audio.blob.type.split('/')[1] || 'webm').split(';')[0]
        audioPath = `${id}/audio.${ext}`
        const { error } = await supabase.storage.from('relatos')
          .upload(audioPath, audio.blob, { contentType: audio.blob.type })
        if (error) throw new Error(`áudio: ${error.message}`)
      }
      const { error } = await supabase.from('relatos').insert({
        id, autor: perfil.user_id, autor_nome: perfil.nome, tipo,
        titulo: titulo.trim(), descricao: descricao.trim() || null,
        anexos, audio_path: audioPath,
      })
      if (error) throw new Error(error.message)
      limpar()
      aoCriar()
    } catch (e) {
      setErro(`Não deu para enviar — ${e.message}`)
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="w-full rounded-xl bg-sinal py-3 font-bold text-white flex items-center justify-center gap-2">
        <Icone nome="bandeira" tam={15} />Relatar bug ou melhoria
      </button>
    )
  }

  return (
    <div className={`${caixa} p-3 space-y-2.5 anim-in`}>
      <div className="flex rounded-lg border border-line p-0.5 text-xs font-semibold">
        {[['bug', 'Bug — algo quebrado'], ['melhoria', 'Melhoria — ideia nova']].map(([v, r]) => (
          <button key={v} onClick={() => setTipo(v)}
            className={cn('flex-1 rounded-md py-1.5 transition',
              tipo === v ? (v === 'bug' ? 'bg-danger text-white' : 'bg-sinal text-white') : 'text-ink-2')}>
            {r}
          </button>
        ))}
      </div>

      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120}
        placeholder={tipo === 'bug' ? 'O que aconteceu? (ex.: ligação cai ao atender)' : 'O que melhoraria? (ex.: filtro por cidade no CRM)'}
        className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />

      <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3}
        placeholder="Conte os detalhes: em que tela, o que você fez antes, o que esperava que acontecesse."
        className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal resize-y" />

      <Gravador audio={audio} aoGravar={setAudio} aoLimpar={() => setAudio(null)} />

      <div>
        <label className="w-full block rounded-lg border border-line px-3 py-2.5 text-sm font-semibold text-ink-2 text-center cursor-pointer hover:border-sinal hover:text-sinal transition">
          <Icone nome="arquivo" tam={14} className="inline mr-1.5 -mt-0.5" />
          Anexar print ou arquivo
          <input type="file" multiple className="hidden"
            onChange={(e) => setArquivos((a) => [...a, ...Array.from(e.target.files || [])])} />
        </label>
        {arquivos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {arquivos.map((a, i) => (
              <span key={`${a.name}-${i}`}
                className="flex items-center gap-1 rounded-lg bg-surface-2 border border-line px-2 py-1 text-[11px] max-w-[12rem]">
                <span className="truncate">{a.name}</span>
                <button onClick={() => setArquivos((lista) => lista.filter((_, j) => j !== i))}
                  className="text-ink-3 hover:text-danger shrink-0">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {erro && <p className="text-xs text-amber">{erro}</p>}

      <div className="flex gap-2">
        <button onClick={limpar} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-ink-2">
          Cancelar
        </button>
        <button onClick={enviar} disabled={enviando}
          className="flex-[2] rounded-lg bg-sinal py-2.5 text-sm font-bold text-white disabled:opacity-40">
          {enviando ? 'Enviando…' : 'Enviar relato'}
        </button>
      </div>
    </div>
  )
}

// ---------- cartão ----------
function CartaoRelato({ relato, perfil, ehAdmin, aoMudar }) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const concluido = relato.status === 'concluido'
  // só quem relatou (confirma que resolveu para ele) ou o admin (que
  // consertou) mexem no relato — a regra é a mesma no banco
  const podeMexer = relato.autor === perfil.user_id || ehAdmin

  async function alternar() {
    setSalvando(true); setErro('')
    const { error } = await supabase.from('relatos').update(
      concluido
        ? { status: 'aberto', concluido_por: null, concluido_por_nome: null, concluido_em: null }
        : { status: 'concluido', concluido_por: perfil.user_id, concluido_por_nome: perfil.nome, concluido_em: new Date().toISOString() },
    ).eq('id', relato.id)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    aoMudar()
  }

  async function apagar() {
    if (!confirm('Apagar este relato para todo mundo?')) return
    const { error } = await supabase.from('relatos').delete().eq('id', relato.id)
    if (error) { setErro(error.message); return }
    aoMudar()
  }

  return (
    <div className={cn(caixa, 'p-3 space-y-2', concluido && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <span className={cn('shrink-0 mt-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
          relato.tipo === 'bug' ? 'bg-danger/15 text-danger' : 'bg-sinal/15 text-sinal')}>
          {relato.tipo === 'bug' ? 'Bug' : 'Melhoria'}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('font-semibold text-sm break-words', concluido && 'line-through')}>{relato.titulo}</p>
          <p className="text-[11px] text-ink-3">
            {relato.autor_nome || 'alguém da equipe'} · {quando(relato.criado_em)}
          </p>
        </div>
        {podeMexer && (
          <button onClick={apagar} title="Apagar relato"
            className="shrink-0 text-ink-3 hover:text-danger transition"><Icone nome="lixo" tam={13} /></button>
        )}
      </div>

      {relato.descricao && (
        <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap break-words">{relato.descricao}</p>
      )}

      {relato.audio_path && <Audio path={relato.audio_path} />}

      {relato.anexos?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {relato.anexos.map((a) => <Anexo key={a.path} anexo={a} />)}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button onClick={alternar} disabled={salvando || !podeMexer}
          title={podeMexer ? '' : 'Só quem relatou ou o admin marcam como resolvido'}
          className={cn('flex items-center gap-2 text-xs font-bold transition disabled:opacity-50',
            concluido ? 'text-sinal' : 'text-ink-2 hover:text-sinal')}>
          <span className={cn('w-4 h-4 rounded border grid place-items-center shrink-0',
            concluido ? 'bg-sinal border-sinal text-white' : 'border-line')}>
            {concluido && <Icone nome="check" tam={10} />}
          </span>
          {concluido ? 'Resolvido' : 'Marcar como resolvido'}
        </button>
        {concluido && relato.concluido_em && (
          <span className="text-[10px] text-ink-3 text-right truncate">
            por {relato.concluido_por_nome || '—'} · {quando(relato.concluido_em)}
          </span>
        )}
      </div>
      {erro && <p className="text-[11px] text-amber">{erro}</p>}
    </div>
  )
}

// ---------- página ----------
export default function Relatos({ perfil, ehAdmin }) {
  const [relatos, setRelatos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('aberto') // 'aberto' | 'concluido' | 'todos'

  async function carregar() {
    const { data } = await supabase.from('relatos').select('*')
      .order('criado_em', { ascending: false }).limit(200)
    setRelatos(data || [])
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  const lista = relatos.filter((r) => filtro === 'todos' || r.status === filtro)
  const abertos = relatos.filter((r) => r.status === 'aberto').length

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <NovoRelato perfil={perfil} aoCriar={carregar} />

      <div className="flex rounded-lg border border-line p-0.5 text-xs font-semibold">
        {[['aberto', `Abertos${abertos ? ` (${abertos})` : ''}`], ['concluido', 'Resolvidos'], ['todos', 'Todos']].map(([v, r]) => (
          <button key={v} onClick={() => setFiltro(v)}
            className={cn('flex-1 rounded-md py-1.5 transition', filtro === v ? 'bg-sinal text-white' : 'text-ink-2')}>
            {r}
          </button>
        ))}
      </div>

      {carregando && <p className="text-center text-ink-3 py-10 text-sm">Carregando…</p>}
      {!carregando && lista.length === 0 && (
        <p className="text-center text-ink-3 py-10 text-sm leading-relaxed">
          {filtro === 'concluido' ? 'Nada resolvido por aqui ainda.'
            : filtro === 'aberto' ? 'Nenhum bug ou melhoria em aberto — o quadro está limpo.'
              : 'Ninguém relatou nada ainda. Seja o primeiro: escreva, grave um áudio ou mande o print.'}
        </p>
      )}

      {lista.map((r) => (
        <CartaoRelato key={r.id} relato={r} perfil={perfil} ehAdmin={ehAdmin} aoMudar={carregar} />
      ))}
    </div>
  )
}
