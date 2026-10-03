import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, NIVEIS } from '../lib/supabase'
import { Marca, Halo } from '../componentes/Marca'
import EditorPerfil, { GRADE_PADRAO } from '../componentes/EditorPerfil'
import Calendario from '../componentes/Calendario'
import Agenda from '../componentes/Agenda'

// Chaves que são dinheiro. Antes eu testava /faturamento|ticket|ads/ e
// "leads_dia" batia — porque "leads" contém "ads". Lista explícita não erra.
const EM_REAIS = new Set(['faturamento_mensal', 'ticket_medio', 'investimento_ads'])

const brl = (n) => Number(n).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

export default function Painel({ slug }) {
  const [pessoa, setPessoa] = useState(undefined)
  const [campanhas, setCampanhas] = useState([])
  const [inscricoes, setInscricoes] = useState([])
  const [agenda, setAgenda] = useState([])
  const [perguntas, setPerguntas] = useState([])
  const [aberta, setAberta] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [copiado, setCopiado] = useState('')
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(null)
  const [fotoNova, setFotoNova] = useState(null)   // { arquivo, previa }
  const [salvando, setSalvando] = useState(false)
  const [avisoPerfil, setAvisoPerfil] = useState('')

  const carregar = useCallback(async () => {
    const { data: p } = await supabase.from('comercial_pessoas')
      .select('*').eq('slug', slug).maybeSingle()
    setPessoa(p ?? null)
    if (!p) return

    const [{ data: c }, { data: i }, { data: q }, { data: ag }] = await Promise.all([
      supabase.from('comercial_campanhas').select('*')
        .eq('pessoa_id', p.id).order('criado_em', { ascending: true }),
      supabase.from('comercial_inscricoes').select('*')
        .eq('pessoa_id', p.id).order('score', { ascending: false, nullsFirst: false }),
      supabase.from('comercial_perguntas').select('*').order('id'),
      // o calendário mostra o mês inteiro, então vem tudo o que não foi desmarcado
      supabase.from('comercial_agendamentos').select('*')
        .eq('pessoa_id', p.id).neq('estado', 'desmarcado').order('inicio'),
    ])
    setCampanhas(c ?? [])
    setInscricoes(i ?? [])
    setPerguntas(q ?? [])
    setAgenda(ag ?? [])
  }, [slug])

  useEffect(() => { carregar() }, [carregar])

  const media = useMemo(() => {
    const comNota = inscricoes.filter((i) => i.score != null)
    return comNota.length
      ? Math.round(comNota.reduce((s, i) => s + i.score, 0) / comNota.length) : null
  }, [inscricoes])

  const lista = useMemo(
    () => (filtro ? inscricoes.filter((i) => i.nivel === filtro) : inscricoes),
    [inscricoes, filtro],
  )

  const contagem = useMemo(() => {
    const m = {}
    for (const i of inscricoes) m[i.campanha_id] = (m[i.campanha_id] ?? 0) + 1
    return m
  }, [inscricoes])

  // Os links seguem a numeração que o Matheus pediu: diagnostico1, diagnostico2…
  // O slug só precisa ser único dentro da pessoa, então cada mentor tem o seu.
  async function novaCampanha() {
    setCriando(true)
    const usados = new Set(campanhas.map((c) => c.slug))
    let n = 1
    while (usados.has(`diagnostico${n}`)) n++
    const { error } = await supabase.from('comercial_campanhas').insert({
      pessoa_id: pessoa.id, nome: `Diagnóstico ${n}`, slug: `diagnostico${n}`,
    })
    setCriando(false)
    if (!error) carregar()
  }

  function abrirEdicao() {
    setRascunho({
      whatsapp: pessoa.whatsapp ?? '',
      descricao: pessoa.descricao ?? '',
      foto_url: pessoa.foto_url ?? null,
      grade: pessoa.grade ?? GRADE_PADRAO,
    })
    setFotoNova(null)
    setAvisoPerfil('')
    setEditando(true)
  }

  function escolherFoto(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    if (arquivo.size > 4 * 1024 * 1024) { setAvisoPerfil('A foto passou de 4 MB.'); return }
    setAvisoPerfil('')
    setFotoNova({ arquivo, previa: URL.createObjectURL(arquivo) })
  }

  async function salvarPerfil() {
    if (!rascunho.grade?.dias?.length) {
      setAvisoPerfil('Marque ao menos um dia que você atende.'); return
    }
    setSalvando(true)
    let foto_url = rascunho.foto_url

    if (fotoNova) {
      const ext = (fotoNova.arquivo.name.split('.').pop() || 'jpg').toLowerCase()
      const caminho = `${pessoa.slug}-${Date.now()}.${ext}`
      const { error: e1 } = await supabase.storage
        .from('comercial-fotos').upload(caminho, fotoNova.arquivo, { upsert: true })
      if (!e1) foto_url = supabase.storage.from('comercial-fotos').getPublicUrl(caminho).data.publicUrl
    }

    const { error } = await supabase.from('comercial_pessoas').update({
      whatsapp: rascunho.whatsapp?.trim() || null,
      descricao: rascunho.descricao?.trim() || null,
      foto_url,
      grade: rascunho.grade,
    }).eq('id', pessoa.id)

    setSalvando(false)
    if (error) { setAvisoPerfil('Não consegui salvar. Tenta de novo.'); return }
    setEditando(false)
    carregar()
  }

  function copiar(texto, id) {
    navigator.clipboard?.writeText(texto)
    setCopiado(id)
    setTimeout(() => setCopiado(''), 1600)
  }

  async function reprocessar(id) {
    await supabase.functions.invoke('comercial-qualificar', { body: { inscricao_id: id } })
    carregar()
  }

  if (pessoa === undefined) {
    return <Moldura><p className="text-tinta-2">carregando…</p></Moldura>
  }
  if (!pessoa) {
    return (
      <Moldura>
        <p className="fala text-4xl">esse painel não existe.</p>
        <p className="mt-4 text-tinta-2">
          Confere o endereço, ou crie o seu em <span className="text-tinta">/cadastro</span>.
        </p>
      </Moldura>
    )
  }

  return (
    <Moldura largo>
      <header className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-8 border-b border-linha">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3">painel de</p>
          <h1 className="fala text-4xl mt-1">{pessoa.nome}</h1>
        </div>
        <div className="flex gap-8 ml-auto">
          <Numero rotulo="inscrições" valor={inscricoes.length} />
          <Numero rotulo="score médio" valor={media ?? '—'} />
        </div>
      </header>

      {/* ---- campanhas ---- */}
      <section className="mt-9">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-tinta-3">seus links</h2>
          <div className="flex-1 h-px bg-linha" />
          <button
            type="button" onClick={novaCampanha} disabled={criando}
            className="text-sm text-violeta hover:text-violeta-claro transition-colors disabled:opacity-50"
          >
            + gerar campanha
          </button>
        </div>

        {campanhas.length === 0 ? (
          <p className="text-tinta-3 text-sm">
            Nenhum link ainda. Gere o primeiro e espalhe — quem responder cai aqui.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {campanhas.map((c) => {
              // o link do lead não carrega o nome do mentor: é só /diagnostico1
              const url = `${window.location.origin}/${c.slug}`
              return (
                <div key={c.id} className="rounded-xl bg-superficie border border-linha p-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-tinta">{c.nome}</span>
                    <span className="text-[11px] text-tinta-3 ml-auto tabular-nums">
                      {contagem[c.id] ?? 0} {(contagem[c.id] ?? 0) === 1 ? 'inscrição' : 'inscrições'}
                    </span>
                  </div>
                  <button
                    type="button" onClick={() => copiar(url, c.id)}
                    className="mt-2 w-full text-left text-[12px] text-tinta-3 hover:text-ciano
                               transition-colors truncate"
                  >
                    {copiado === c.id ? '✓ link copiado' : url}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ---- meu cartão e minha agenda ---- */}
      <section className="mt-11">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-tinta-3">
            meu cartão e minha agenda
          </h2>
          <div className="flex-1 h-px bg-linha" />
          <button
            type="button" onClick={() => (editando ? setEditando(false) : abrirEdicao())}
            className="text-sm text-violeta hover:text-violeta-claro transition-colors"
          >
            {editando ? 'fechar' : 'editar'}
          </button>
        </div>

        {editando && rascunho ? (
          <div className="rounded-xl bg-superficie border border-linha p-5 space-y-6">
            <EditorPerfil
              valor={rascunho} aoMudar={setRascunho}
              aoEscolherFoto={escolherFoto} previaFoto={fotoNova?.previa}
            />
            {avisoPerfil && <p className="text-sm text-violeta-claro">{avisoPerfil}</p>}
            <button
              type="button" disabled={salvando} onClick={salvarPerfil}
              className="rounded-full bg-linear-to-r from-violeta to-ciano px-7 py-3
                         text-[15px] font-medium text-fundo hover:opacity-90 disabled:opacity-50"
            >
              {salvando ? 'salvando…' : 'salvar'}
            </button>
          </div>
        ) : (
          <div className="rounded-xl bg-superficie border border-linha p-5 flex items-center gap-5 flex-wrap">
            {pessoa.foto_url
              ? <img src={pessoa.foto_url} alt="" className="w-14 h-14 rounded-full object-cover border border-violeta/40" />
              : <div className="w-14 h-14 rounded-full border border-violeta/40 bg-superficie-2 grid place-items-center fala text-violeta-claro">{pessoa.nome[0]}</div>}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-tinta-2 line-clamp-1">
                {pessoa.descricao || 'sem apresentação — o lead vê só o seu nome'}
              </p>
              <p className="text-[12px] text-tinta-3 mt-1">
                {resumoGrade(pessoa.grade)}
                {pessoa.whatsapp ? ` · ${pessoa.whatsapp}` : ' · sem WhatsApp — o botão do diagnóstico não aparece'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---- agenda ---- */}
      <section className="mt-11">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-tinta-3">
            minha agenda
          </h2>
          <div className="flex-1 h-px bg-linha" />
          <span className="text-[12px] text-tinta-3 tabular-nums">
            {agenda.filter((g) => new Date(g.inicio) >= new Date()).length} pela frente
          </span>
        </div>
        <Calendario pessoa={pessoa} agenda={agenda} aoMudar={carregar} />
      </section>

      {/* ---- inscrições ---- */}
      <section className="mt-11">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-tinta-3">quem entrou</h2>
          <div className="flex-1 h-px bg-linha" />
          <div className="flex gap-1.5">
            {[['', 'todos'], ['A', 'quentes'], ['B', 'mornos'], ['C', 'frios']].map(([v, r]) => (
              <button
                key={r} type="button" onClick={() => setFiltro(v)}
                className={'rounded-full px-3 py-1 text-[12px] transition-colors ' + (filtro === v
                  ? 'bg-violeta/15 text-violeta-claro' : 'text-tinta-3 hover:text-tinta-2')}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="text-tinta-3 text-sm">Ninguém aqui ainda.</p>
        ) : (
          <div className="space-y-2">
            {lista.map((i) => (
              <Cartao
                key={i.id} insc={i} perguntas={perguntas}
                aberto={aberta === i.id}
                alternar={() => setAberta(aberta === i.id ? null : i.id)}
                reprocessar={() => reprocessar(i.id)}
                aoMudar={carregar}
                campanhas={campanhas}
                campanhaDoLead={campanhas.find((c) => c.id === i.campanha_id)?.slug}
                pessoa={pessoa}
                marcacao={agenda.find((g) => g.inscricao_id === i.id)}
              />
            ))}
          </div>
        )}
      </section>
    </Moldura>
  )
}

function Cartao({ insc, perguntas, aberto, alternar, reprocessar, aoMudar,
                 campanhas = [], campanhaDoLead, pessoa, marcacao }) {
  const [agendando, setAgendando] = useState(false)
  const [copiadoLink, setCopiadoLink] = useState(false)
  // o endereço público do diagnóstico deste lead
  const endereco = insc.codigo && campanhaDoLead
    ? `${window.location.origin}/${campanhaDoLead}/${insc.codigo}` : null
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  function abrirEdicao() {
    setRascunho({
      nome: insc.nome ?? '', whatsapp: insc.whatsapp ?? '', empresa: insc.empresa ?? '',
      respostas: { ...(insc.respostas ?? {}) },
    })
    setAviso(''); setEditando(true)
  }

  async function salvar() {
    setOcupado(true); setAviso('')
    // nome, whatsapp e empresa moram em coluna própria E dentro de respostas —
    // a coluna é para a lista carregar rápido. Os dois lados andam juntos.
    const respostas = {
      ...rascunho.respostas,
      nome: rascunho.nome, whatsapp: rascunho.whatsapp, empresa: rascunho.empresa,
    }
    const { error } = await supabase.from('comercial_inscricoes').update({
      nome: rascunho.nome || null,
      whatsapp: rascunho.whatsapp || null,
      empresa: rascunho.empresa || null,
      respostas,
      atualizado_em: new Date().toISOString(),
    }).eq('id', insc.id)
    setOcupado(false)
    if (error) { setAviso('Não consegui salvar. Tenta de novo.'); return }
    setEditando(false)
    aoMudar()
  }

  async function salvarEReanalisar() {
    await salvar()
    setOcupado(true)
    await supabase.functions.invoke('comercial-qualificar', { body: { inscricao_id: insc.id } })
    setOcupado(false)
    aoMudar()
  }

  async function buscarFoto() {
    setOcupado(true); setAviso('')
    const { error } = await supabase.functions.invoke('comercial-foto', {
      body: { inscricao_id: insc.id },
    })
    setOcupado(false)
    if (error) { setAviso('Não consegui consultar o Google agora.'); return }
    aoMudar()
  }

  async function excluir() {
    setOcupado(true); setAviso('')
    const { error } = await supabase.from('comercial_inscricoes').delete().eq('id', insc.id)
    setOcupado(false); setConfirmando(false)
    if (error) { setAviso('Não consegui excluir. Tenta de novo.'); return }
    aoMudar()
  }

  const n = NIVEIS[insc.nivel] ?? NIVEIS.C
  const a = insc.analise
  const semAnalise = insc.score == null
  // Lead que parou no meio ainda é lead: aparece com o que já contou e com
  // a etapa em que desistiu — é por onde o mentor recomeça a conversa.
  const parcial = !insc.completa

  return (
    <article className={'rounded-xl bg-superficie border transition-colors ' +
      (aberto ? 'border-linha-forte' : 'border-linha')}>
      <button type="button" onClick={alternar} className="w-full text-left p-4 flex items-center gap-4">
        {insc.foto_url && (
          <img src={insc.foto_url} alt="" loading="lazy"
            className="w-11 h-11 rounded-lg object-cover shrink-0 border border-linha" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            {/* o nome abre o diagnóstico dele; o resto do cartão só expande */}
            {endereco ? (
              <a href={endereco} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-tinta hover:text-ciano transition-colors underline
                           decoration-dotted underline-offset-4 decoration-tinta-3/50">
                {insc.nome || 'sem nome'}
              </a>
            ) : (
              <span className="text-tinta">{insc.nome || 'sem nome'}</span>
            )}
            {insc.empresa && <span className="text-tinta-3 text-sm">· {insc.empresa}</span>}
          </div>
          <p className="mt-1 text-[13px] text-tinta-2 line-clamp-1">
            {parcial
              ? `parou na etapa ${insc.etapa || 1} de 8 — não terminou`
              : semAnalise ? 'sem análise — a IA não respondeu' : (a?.resumo ?? '')}
          </p>
        </div>

        {parcial ? (
          <span className="text-[11px] uppercase tracking-wider text-amber-300/70 shrink-0">
            incompleto
          </span>
        ) : semAnalise ? (
          <span className="text-[12px] text-tinta-3 shrink-0">—</span>
        ) : (
          <div className="text-right shrink-0">
            <div className={'text-2xl tabular-nums ' + n.cor}>{insc.score}</div>
            <div className="text-[10px] uppercase tracking-wider text-tinta-3">
              {n.rotulo} · coer. {insc.coerencia}
            </div>
          </div>
        )}
      </button>

      {aberto && (
        <div className="px-4 pb-5 border-t border-linha pt-5 space-y-6">
          {parcial ? (
            <p className="text-[13px] text-tinta-2 leading-relaxed">
              Não terminou o formulário — por isso não tem análise. O que ele já
              contou está aqui embaixo, e o WhatsApp também.
            </p>
          ) : semAnalise ? (
            <button type="button" onClick={reprocessar}
              className="rounded-full border border-linha-forte px-4 py-2 text-sm
                         text-tinta-2 hover:text-tinta transition-colors">
              reprocessar análise
            </button>
          ) : (
            <>
              <div className={'rounded-lg border p-3 text-[13px] ' + n.borda + ' ' + n.fundo}>
                <span className={n.cor}>Nível {insc.nivel} · {n.rotulo}</span>
                <span className="text-tinta-2"> — {a.acao}</span>
              </div>

              {a.isca && (
                <Bloco titulo="a isca dos 10 primeiros segundos">
                  <p className="fala text-xl text-tinta leading-snug">“{a.isca}”</p>
                </Bloco>
              )}

              {a.coerencia?.conflitos?.length > 0 && (
                <Bloco titulo={`coerência ${a.coerencia.nota}/100 — o que não fecha`}>
                  <div className="space-y-3">
                    {a.coerencia.conflitos.map((c, k) => (
                      <div key={k} className="border-l-2 border-violeta/40 pl-3">
                        <p className="text-tinta text-[14px]">{c.titulo}</p>
                        <p className="text-tinta-2 text-[13px] mt-0.5">{c.achado}</p>
                        <p className="text-ciano-claro text-[13px] mt-1.5">↳ {c.pergunta}</p>
                      </div>
                    ))}
                  </div>
                </Bloco>
              )}

              {a.mentoria?.dores?.length > 0 && (
                <Bloco titulo="roteiro da mentoria">
                  <div className="space-y-3">
                    {a.mentoria.dores.map((d, k) => (
                      <div key={k}>
                        <p className="text-tinta text-[14px]">Dor {String(k + 1).padStart(2, '0')}: {d.dor}</p>
                        <p className="text-tinta-2 text-[13px] mt-0.5">Solução: {d.solucao}</p>
                      </div>
                    ))}
                    {a.mentoria.ponto_chave && (
                      <p className="text-[13px] text-violeta-claro pt-1">
                        ▸ Ponto chave: {a.mentoria.ponto_chave}
                      </p>
                    )}
                  </div>
                </Bloco>
              )}

              <Bloco titulo="de onde vieram os pontos">
                <div className="space-y-2">
                  {Object.entries(a.blocos ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <div className="flex items-baseline gap-2 text-[13px]">
                        <span className="text-tinta-2 w-28 shrink-0">{k}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-superficie-2 overflow-hidden">
                          <div className="h-full rounded-full bg-linear-to-r from-violeta to-ciano"
                            style={{ width: `${Math.round((v.pontos / v.teto) * 100)}%` }} />
                        </div>
                        <span className="text-tinta-3 tabular-nums w-16 text-right">{v.pontos}/{v.teto}</span>
                      </div>
                      {v.porque && <p className="text-[12px] text-tinta-3 ml-30 mt-0.5">{v.porque}</p>}
                    </div>
                  ))}
                </div>
              </Bloco>

              {a.numeros && (
                <Bloco titulo="números que ela deu">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                    {Object.entries(a.numeros).filter(([, v]) => v != null).map(([k, v]) => (
                      <span key={k} className="text-tinta-2">
                        {k.replace(/_/g, ' ')}:{' '}
                        <span className="text-tinta tabular-nums">
                          {EM_REAIS.has(k) ? brl(v) : v}
                        </span>
                      </span>
                    ))}
                  </div>
                </Bloco>
              )}
            </>
          )}

          {/* ---- a ficha no Google ---- */}
          <div className="flex items-start gap-4 flex-wrap">
            {insc.foto_url && (
              <img src={insc.foto_url} alt="" className="w-24 h-24 rounded-xl object-cover border border-linha" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3 mb-1">
                ficha no google
              </p>
              {insc.foto_conf?.melhor ? (
                <p className="text-[13px] text-tinta-2">
                  {insc.foto_conf.aceita ? '✓' : '✗'} {insc.foto_conf.melhor}
                  {insc.foto_conf.nota ? ` · ★ ${insc.foto_conf.nota} (${insc.foto_conf.avaliacoes ?? 0})` : ''}
                  {!insc.foto_conf.aceita && (
                    <span className="text-tinta-3"> — recusada, não bate com o nome da empresa</span>
                  )}
                </p>
              ) : (
                <p className="text-[13px] text-tinta-3">{insc.foto_origem ?? 'ainda não procurei'}</p>
              )}
              {insc.foto_conf?.endereco && (
                <p className="text-[12px] text-tinta-3 mt-0.5">{insc.foto_conf.endereco}</p>
              )}
              <button type="button" disabled={ocupado} onClick={buscarFoto}
                className="mt-2 text-[13px] text-ciano hover:text-ciano-claro transition-colors">
                {ocupado ? 'procurando…' : insc.foto_conf ? 'procurar de novo' : 'procurar no Google'}
              </button>
            </div>
          </div>

          {/* ---- o link do diagnóstico, para reenviar ---- */}
          {insc.codigo && campanhas.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3 mb-2">
                link do diagnóstico dele
              </p>
              <button type="button"
                onClick={() => {
                  const url = endereco ?? ''
                  navigator.clipboard?.writeText(url)
                  setCopiadoLink(true)
                  setTimeout(() => setCopiadoLink(false), 1600)
                }}
                className="text-[13px] text-tinta-2 hover:text-ciano transition-colors break-all text-left">
                {copiadoLink ? '✓ link copiado' : endereco}
              </button>

              <div className="mt-4 flex gap-3 flex-wrap">
                <a href={`${endereco}?imprimir=1`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px]
                             font-medium hover:opacity-90 transition-opacity"
                  style={{ background: 'linear-gradient(90deg,#7A45E8,#39C4FF)', color: '#061020' }}>
                  ↓ baixar o PDF do diagnóstico
                </a>
                <a href={endereco} target="_blank" rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-linha-forte
                             px-5 py-2.5 text-[14px] text-tinta-2 hover:text-tinta transition-colors">
                  abrir a página
                </a>
              </div>
            </div>
          )}

          {/* ---- ações ---- */}
          <div className="flex items-center gap-4 flex-wrap text-[13px]">
            <button type="button" disabled={ocupado}
              onClick={() => (editando ? setEditando(false) : abrirEdicao())}
              className="text-violeta hover:text-violeta-claro transition-colors">
              {editando ? 'cancelar edição' : 'editar'}
            </button>
            {!editando && !marcacao && pessoa && (
              <button type="button" onClick={() => setAgendando((v) => !v)}
                className="text-ciano hover:text-ciano-claro transition-colors">
                {agendando ? 'fechar agenda' : 'agendar mentoria'}
              </button>
            )}
            {!editando && (
              <button type="button" disabled={ocupado} onClick={reprocessar}
                className="text-tinta-3 hover:text-tinta-2 transition-colors">
                reanalisar
              </button>
            )}
            {confirmando ? (
              <button type="button" disabled={ocupado} onClick={excluir}
                className="ml-auto text-red-300 hover:text-red-200 transition-colors">
                confirmar exclusão
              </button>
            ) : (
              <button type="button" disabled={ocupado} onClick={() => setConfirmando(true)}
                className="ml-auto text-tinta-3 hover:text-red-300 transition-colors">
                excluir
              </button>
            )}
          </div>
          {confirmando && (
            <p className="text-[12px] text-tinta-3">
              Excluir apaga a inscrição e a análise para sempre. O agendamento dela, se houver, continua na agenda.
            </p>
          )}
          {aviso && <p className="text-sm text-violeta-claro">{aviso}</p>}

          {/* já marcado: mostra quando */}
          {marcacao && (
            <div className="rounded-lg border p-3 text-[13px]"
              style={{ borderColor: 'rgba(57,196,255,.35)', background: 'rgba(57,196,255,.06)' }}>
              <span className="text-ciano-claro">
                mentoria marcada · {new Date(marcacao.inicio).toLocaleDateString('pt-BR', {
                  weekday: 'short', day: '2-digit', month: 'short' })}
                {' às '}{new Date(marcacao.inicio).toTimeString().slice(0, 5)}
              </span>
              <span className="text-tinta-3"> — remarcar ou desmarcar pelo calendário lá em cima.</span>
            </div>
          )}

          {/* agendar por aqui: os leads da planilha entraram sem escolher horário */}
          {agendando && pessoa && !marcacao && (
            <div className="rounded-xl bg-superficie-2 border border-linha p-4">
              <Agenda pessoa={pessoa} inscricaoId={insc.id}
                nome={insc.nome} whatsapp={insc.whatsapp}
                aoMarcar={() => { setAgendando(false); aoMudar() }} />
            </div>
          )}

          {editando && rascunho ? (
            <Bloco titulo="editando as respostas">
              <div className="space-y-3">
                {['nome', 'whatsapp', 'empresa'].map((c) => (
                  <div key={c}>
                    <p className="text-[11px] text-tinta-3 mb-1">{c}</p>
                    <input
                      className="w-full rounded-lg bg-superficie-2 border border-linha px-3 py-2
                                 text-[14px] text-tinta focus:border-violeta/70 outline-none"
                      value={rascunho[c]} onChange={(e) => setRascunho({ ...rascunho, [c]: e.target.value })}
                    />
                  </div>
                ))}
                {perguntas.filter((q) => !['nome', 'whatsapp', 'empresa'].includes(q.chave)).map((q) => {
                  const v = rascunho.respostas[q.chave]
                  const texto = Array.isArray(v) ? v.join(', ') : (v ?? '')
                  return (
                    <div key={q.id}>
                      <p className="text-[11px] text-tinta-3 mb-1">{q.rotulo}</p>
                      <textarea
                        rows={q.tipo === 'longo' ? 3 : 1}
                        className="w-full rounded-lg bg-superficie-2 border border-linha px-3 py-2
                                   text-[14px] text-tinta focus:border-violeta/70 outline-none resize-none"
                        value={texto}
                        onChange={(e) => setRascunho({
                          ...rascunho,
                          respostas: { ...rascunho.respostas, [q.chave]: e.target.value },
                        })}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-5 flex gap-3 flex-wrap">
                <button type="button" disabled={ocupado} onClick={salvarEReanalisar}
                  className="rounded-full bg-linear-to-r from-violeta to-ciano px-6 py-2.5
                             text-[14px] font-medium text-fundo hover:opacity-90 disabled:opacity-50">
                  {ocupado ? 'salvando…' : 'salvar e reanalisar'}
                </button>
                <button type="button" disabled={ocupado} onClick={salvar}
                  className="rounded-full border border-linha-forte px-6 py-2.5 text-[14px]
                             text-tinta-2 hover:text-tinta transition-colors disabled:opacity-50">
                  só salvar
                </button>
              </div>
              <p className="mt-3 text-[12px] text-tinta-3">
                Mudou um número? “Salvar e reanalisar” refaz o score, a coerência e o plano com o valor novo.
              </p>
            </Bloco>
          ) : (
          <Bloco titulo="as respostas, na íntegra">
            <div className="space-y-3">
              {perguntas.map((q) => {
                const v = insc.respostas?.[q.chave]
                const txt = Array.isArray(v) ? v.join(', ') : v
                if (!txt) return null
                return (
                  <div key={q.id}>
                    <p className="text-[11px] text-tinta-3">{q.rotulo}</p>
                    <p className="text-[13px] text-tinta-2">{txt}</p>
                  </div>
                )
              })}
            </div>
          </Bloco>
          )}

          {insc.whatsapp && (
            <a
              href={`https://wa.me/55${String(insc.whatsapp).replace(/\D/g, '')}`}
              target="_blank" rel="noreferrer"
              className="inline-block rounded-full bg-linear-to-r from-violeta to-ciano
                         px-6 py-2.5 text-sm font-medium text-fundo hover:opacity-90 transition-opacity"
            >
              chamar no WhatsApp
            </a>
          )}
        </div>
      )}
    </article>
  )
}

const Bloco = ({ titulo, children }) => (
  <div>
    <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3 mb-2">{titulo}</p>
    {children}
  </div>
)

const Numero = ({ rotulo, valor }) => (
  <div>
    <div className="text-3xl tabular-nums text-tinta">{valor}</div>
    <div className="text-[11px] uppercase tracking-wider text-tinta-3">{rotulo}</div>
  </div>
)

// A grade em uma linha, do jeito que se fala: "seg a sex · 09:00–12:00 e 14:00–18:00 · 30 min"
function resumoGrade(g) {
  if (!g?.dias?.length) return 'nenhum dia aberto — o lead não consegue marcar'
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const dias = [...g.dias].sort((a, b) => a - b)
  const seguidos = dias.every((d, k) => k === 0 || d === dias[k - 1] + 1)
  const quais = seguidos && dias.length > 2
    ? `${nomes[dias[0]]} a ${nomes[dias[dias.length - 1]]}`
    : dias.map((d) => nomes[d]).join(', ')
  const faixas = (g.faixas ?? []).map(([a, b]) => `${a}–${b}`).join(' e ')
  return `${quais} · ${faixas} · ${g.duracao ?? 30} min`
}

const Moldura = ({ children, largo }) => (
  <div className="min-h-full relative px-5 py-12">
    <Halo />
    <div className={'relative z-10 mx-auto ' + (largo ? 'max-w-3xl' : 'max-w-xl')}>
      <div className="mb-10"><Marca /></div>
      {children}
    </div>
  </div>
)
