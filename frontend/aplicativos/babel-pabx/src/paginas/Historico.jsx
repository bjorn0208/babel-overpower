import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'

// verde a partir de 7, âmbar de 5 a 7, vermelho abaixo — a mesma régua da
// tela de Análise, para a nota significar o mesmo em todo lugar
const cnNota = (n) => 'text-2xl font-extrabold tnum ' + (
  n >= 7 ? 'text-sinal' : n >= 5 ? 'text-amber' : 'text-danger')

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatarDuracao(seg) {
  if (!seg) return '0s'
  const m = Math.floor(seg / 60)
  return m ? `${m}min ${seg % 60}s` : `${seg}s`
}

export default function Historico({ ehAdmin }) {
  const [chamadas, setChamadas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState(null)
  const [urlAudio, setUrlAudio] = useState(null)
  const [filtroDia, setFiltroDia] = useState('')
  const [filtroRamal, setFiltroRamal] = useState('')
  const [equipe, setEquipe] = useState([])
  // A tela mostrava só as 100 mais recentes, sem dizer que havia mais. Quem
  // tinha 300 ligações achava que o sistema tinha perdido 200 (caso Arianne,
  // 10/08). Agora o total aparece e o resto vem por página.
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [carregandoMais, setCarregandoMais] = useState(false)

  useEffect(() => {
    if (!ehAdmin) return
    supabase.from('profiles').select('nome, ramal')
      .not('ramal', 'is', null).order('ramal')
      .then(({ data }) => setEquipe(data || []))
  }, [ehAdmin])

  const POR_PAGINA = 100

  // uma função só para a 1ª página e para "carregar mais": a consulta é a
  // mesma, muda a faixa
  async function buscar(pag) {
    let q = supabase
      .from('calls')
      .select('*, leads(empresa)', { count: 'exact' })
      .order('iniciada_em', { ascending: false })
      .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1)
    if (filtroRamal) q = q.eq('ramal', filtroRamal)
    if (filtroDia) {
      const inicio = new Date(`${filtroDia}T00:00:00`)
      const fim = new Date(inicio.getTime() + 86400000)
      q = q.gte('iniciada_em', inicio.toISOString()).lt('iniciada_em', fim.toISOString())
    }
    return q
  }

  useEffect(() => {
    let vivo = true
    async function carregar() {
      setCarregando(true)
      const { data, count } = await buscar(0)
      if (!vivo) return
      setChamadas(data || [])
      setTotal(count || 0)
      setPagina(0)
      setCarregando(false)
    }
    carregar()
    return () => { vivo = false }
  }, [filtroDia, filtroRamal]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarMais() {
    setCarregandoMais(true)
    const { data, count } = await buscar(pagina + 1)
    setChamadas((atuais) => [...atuais, ...(data || [])])
    setTotal(count || 0)
    setPagina((p) => p + 1)
    setCarregandoMais(false)
  }

  // Sua régua geral: média de TODAS as suas ligações avaliadas (não só as da
  // página) — a mesma conta do nível de mentor, direto do banco.
  const [minhaNota, setMinhaNota] = useState(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return
      supabase.rpc('nivel_mentor', { _user: data.user.id })
        .then(({ data: n }) => setMinhaNota(n))
    })
  }, [])

  const [copiado, setCopiado] = useState(null)
  function copiarNumero(e, c) {
    e.stopPropagation()
    navigator.clipboard.writeText(c.numero_externo || '')
    setCopiado(c.id)
    setTimeout(() => setCopiado(null), 1500)
  }

  async function abrir(chamada) {
    if (aberta === chamada.id) { setAberta(null); setUrlAudio(null); return }
    setAberta(chamada.id)
    setUrlAudio(null)
    if (chamada.gravacao_path) {
      const { data } = await supabase.storage.from('gravacoes').createSignedUrl(chamada.gravacao_path, 3600)
      setUrlAudio(data?.signedUrl || null)
    }
  }

  const filtros = (
    <div className="flex gap-2">
      <input type="date" value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)}
        className="flex-1 rounded-lg bg-surface border border-line px-3 py-2 text-sm text-ink" />
      {ehAdmin && (
        <select value={filtroRamal} onChange={(e) => setFiltroRamal(e.target.value)}
          className="flex-1 rounded-lg bg-surface border border-line px-3 py-2 text-sm text-ink">
          <option value="">Toda a equipe</option>
          {equipe.map((v) => (
            <option key={v.ramal} value={v.ramal}>{v.nome} ({v.ramal})</option>
          ))}
        </select>
      )}
      {(filtroDia || filtroRamal) && (
        <button onClick={() => { setFiltroDia(''); setFiltroRamal('') }}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-2">✕</button>
      )}
    </div>
  )

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-2">
      {minhaNota?.avaliadas > 0 && (
        <div className="rounded-xl bg-surface border border-line px-4 py-3 flex items-center gap-3">
          <span className={cnNota(Number(minhaNota.media))}>{Number(minhaNota.media).toFixed(1)}</span>
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-ink-3 font-bold">
              Sua nota média
            </span>
            <span className="block text-xs text-ink-2 tnum">
              {minhaNota.avaliadas} conversa{minhaNota.avaliadas === 1 ? '' : 's'} avaliada{minhaNota.avaliadas === 1 ? '' : 's'} · nível {minhaNota.nivel}
            </span>
          </span>
        </div>
      )}
      {filtros}
      {carregando && <p className="text-center text-ink-2 p-10">Carregando…</p>}
      {!carregando && !chamadas.length && (
        <p className="text-center text-ink-2 p-10">
          {filtroDia || filtroRamal ? 'Nenhuma chamada com esses filtros.' : 'Nenhuma chamada ainda.'}
        </p>
      )}
      {!carregando && chamadas.length > 0 && (
        <p className="text-xs text-ink-3 px-1 tnum">
          mostrando {chamadas.length} de {total} chamada{total === 1 ? '' : 's'}
          {' · '}{chamadas.filter((c) => c.status === 'atendida').length} atendida{chamadas.filter((c) => c.status === 'atendida').length === 1 ? '' : 's'} nesta lista
        </p>
      )}
      {!carregando && chamadas.map((c) => (
        <div key={c.id} className="rounded-xl bg-surface border border-line overflow-hidden">
          <button onClick={() => abrir(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <span className={`text-lg ${c.direcao === 'entrada' ? 'text-sky' : 'text-sinal'}`}>
              {c.direcao === 'entrada' ? '↓' : '↑'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium truncate">
                {c.leads?.empresa || c.numero_externo || 'Desconhecido'}
              </span>
              <span className="block text-xs text-ink-2 tnum">
                {c.leads?.empresa ? `${c.numero_externo} · ` : ''}
                {formatarData(c.iniciada_em)} · {formatarDuracao(c.duracao_seg)}
                {ehAdmin && c.ramal ? ` · ramal ${c.ramal}` : ''}
              </span>
            </span>
            {c.numero_externo && (
              <span role="button" title="Copiar número" onClick={(e) => copiarNumero(e, c)}
                className={`shrink-0 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                  copiado === c.id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-3'}`}>
                {copiado === c.id ? 'copiado!' : <Icone nome="copiar" tam={13} />}
              </span>
            )}
            {/* a nota à vista na lista — sem precisar abrir a conversa */}
            {c.nota_ia != null && (
              <span title="Nota da ligação (IA)"
                className={`shrink-0 text-sm font-extrabold tnum ${
                  c.nota_ia >= 7 ? 'text-sinal' : c.nota_ia >= 5 ? 'text-amber' : 'text-danger'}`}>
                {Number(c.nota_ia).toFixed(1)}
              </span>
            )}
            <span className={`text-xs font-medium ${c.status === 'atendida' ? 'text-sinal' : 'text-danger'}`}>
              {c.status === 'atendida' ? 'Atendida' : 'Perdida'}
            </span>
          </button>
          {aberta === c.id && (
            <div className="px-4 pb-4 space-y-3 border-t border-line pt-3">
              {/* avaliação da ligação: nota, o que foi bem e o que melhorar.
                  Antes só o admin via isso (Análise → mentor); é feedback de
                  quem fez a ligação, então mora aqui também. */}
              {c.nota_ia != null && (
                <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cnNota(c.nota_ia)}>{Number(c.nota_ia).toFixed(1)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-ink-3 font-bold">
                      Nota da ligação
                    </span>
                  </div>
                  {c.nota_justificativa && (
                    <p className="text-xs text-ink-2 leading-relaxed">{c.nota_justificativa}</p>
                  )}
                  {c.pontos_fortes?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-sinal font-bold mb-1">Fez bem</p>
                      <ul className="space-y-0.5">
                        {c.pontos_fortes.map((t, i) => (
                          <li key={i} className="text-xs text-ink-2 leading-snug">• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.pontos_melhoria?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-amber font-bold mb-1">
                        Para a próxima
                      </p>
                      <ul className="space-y-0.5">
                        {c.pontos_melhoria.map((t, i) => (
                          <li key={i} className="text-xs text-ink-2 leading-snug">• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {c.observacao && (
                <p className="text-sm text-amber/90 bg-amber/5 border border-amber-500/20 rounded-lg px-3 py-2">
                  {c.observacao}
                </p>
              )}
              {urlAudio && <audio controls src={urlAudio} className="w-full h-10" />}
              {c.transcricao ? (
                <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{c.transcricao}</p>
              ) : (
                <p className="text-sm text-ink-3">
                  {c.transcricao_status === 'pendente' ? 'Transcrição em processamento…' : 'Sem transcrição disponível.'}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {!carregando && chamadas.length < total && (
        <button onClick={carregarMais} disabled={carregandoMais}
          className="w-full rounded-xl border border-line py-3 text-sm font-semibold text-ink-2
            hover:border-sinal/50 hover:text-sinal transition disabled:opacity-40">
          {carregandoMais ? 'Carregando…' : `Carregar mais (faltam ${total - chamadas.length})`}
        </button>
      )}
    </div>
  )
}
