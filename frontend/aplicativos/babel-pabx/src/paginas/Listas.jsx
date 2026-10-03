import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import { lerArquivoDeLeads, montarLeadsDaPlanilha } from '../lib/planilha'

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm'
const botaoMini = 'text-xs border rounded-full px-2.5 py-1 inline-flex items-center gap-1 font-semibold'

const NOMES_DESFECHO = {
  nao_atendeu: 'Não atendeu', caixa_postal: 'Caixa postal', ocupado: 'Ocupado/caiu',
  numero_errado: 'Nº errado', sem_interesse: 'Sem interesse', desligou: 'Desligou',
  em_contato: 'Passou o contato',
  retorno: 'Retorno', reuniao: 'Reunião',
}
const NOMES_SITUACAO = {
  pendente: 'nunca ligado', em_cadencia: 'na cadência', retorno: 'retorno marcado',
  reuniao: 'reunião marcada', esgotado: 'esgotado', descartado: 'fora',
}

// Listas colaborativas (spec 2026-08-06): qualquer um cria, adiciona contatos
// e convida colegas; quem toca "Participar" entra. A cadência recicla sozinha.
export default function Listas({ perfil, aoSessaoLista, aoAbrirLead, aoVoltarDiscador }) {
  const [listas, setListas] = useState([])
  const [aberta, setAberta] = useState(null)   // lista aberta em detalhe
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [msg, setMsg] = useState('')
  const [importando, setImportando] = useState(false)

  async function carregar() {
    const { data } = await supabase.rpc('listas_minhas')
    setListas(data || [])
    return data || []
  }
  useEffect(() => { carregar() }, [])

  async function criar(e) {
    e.preventDefault()
    if (!nome.trim()) return
    const { data: id, error } = await supabase.rpc('lista_criar', { _nome: nome, _descricao: descricao || null })
    if (error) { setMsg(error.message); return }
    setCriando(false); setNome(''); setDescricao('')
    const novas = await carregar()
    setAberta(novas.find((l) => l.id === id) || null)
  }

  // Planilha vira lista: cria com o nome do arquivo e já importa tudo dentro.
  async function planilhaViraLista(e) {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    setImportando(true); setMsg('')
    try {
      const { mapa, dados, erro } = await lerArquivoDeLeads(arq)
      if (erro) { setMsg(erro); setImportando(false); return }
      const user = (await supabase.auth.getUser()).data.user
      const { leads, puladas } = montarLeadsDaPlanilha({
        mapa, dados, userId: user.id, origem: 'planilha', arquivo: arq.name,
      })
      if (!leads.length) { setMsg('Nenhuma linha aproveitável na planilha.'); setImportando(false); return }

      const nome = arq.name.replace(/\.(xlsx|xls|csv)$/i, '').slice(0, 60)
      const { data: listaId, error: erroLista } = await supabase.rpc('lista_criar',
        { _nome: nome, _descricao: `Importada de ${arq.name}` })
      if (erroLista) { setMsg(erroLista.message); setImportando(false); return }

      // não duplica quem já está na base; os repetidos entram na lista mesmo assim
      const tels = leads.map((l) => l.telefone).filter(Boolean)
      const jaExistem = new Map()
      for (let i = 0; i < tels.length; i += 200) {
        const { data } = await supabase.from('leads').select('id, telefone').in('telefone', tels.slice(i, i + 200))
        for (const x of data || []) jaExistem.set(x.telefone, x.id)
      }
      const novos = leads.filter((l) => !l.telefone || !jaExistem.has(l.telefone))
      const inseridos = []
      let erroGravar = ''
      for (let i = 0; i < novos.length; i += 100) {
        const { data, error } = await supabase.from('leads').insert(novos.slice(i, i + 100)).select('id')
        if (error) { erroGravar = error.message; break }
        inseridos.push(...(data || []))
      }
      const ids = [...inseridos.map((x) => x.id), ...jaExistem.values()]
      let naLista = 0
      for (let i = 0; i < ids.length; i += 200) {
        const { data: n } = await supabase.rpc('lista_adicionar_leads',
          { _lista: listaId, _leads: ids.slice(i, i + 200) })
        naLista += n || 0
      }
      const partes = [`Lista "${nome}" criada com ${naLista} contato(s)`]
      if (jaExistem.size) partes.push(`${jaExistem.size} já existiam na base`)
      if (puladas) partes.push(`${puladas} linha(s) puladas`)
      setMsg(erroGravar ? `Parou num erro: ${erroGravar}` : partes.join(' · '))
      const novas = await carregar()
      setAberta(novas.find((l) => l.id === listaId) || null)
    } catch (err) {
      setMsg(`Não consegui ler o arquivo: ${err.message}`)
    }
    setImportando(false)
  }

  async function responder(lista, aceitar) {
    await supabase.rpc('lista_responder', { _lista: lista.id, _aceitar: aceitar })
    carregar()
  }

  const convites = listas.filter((l) => l.situacao_minha === 'convidado')
  const ativas = listas.filter((l) => l.situacao_minha === 'dona' || l.situacao_minha === 'participante')

  if (aberta) {
    return <ListaDetalhe lista={aberta} perfil={perfil} aoVoltar={() => { setAberta(null); carregar() }}
      aoSessaoLista={aoSessaoLista} aoAbrirLead={aoAbrirLead} aoMudou={carregar}
      aoVoltarDiscador={aoVoltarDiscador} />
  }

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setCriando(!criando)} className={`flex-1 ${caixa} py-3 font-semibold text-sm`}>
          <Icone nome="mais" tam={13} className="inline mr-1.5 -mt-0.5" />Nova lista
        </button>
        <label className={`flex-1 ${caixa} py-3 font-semibold text-sm text-center cursor-pointer ${
          importando ? 'opacity-60' : ''}`}>
          <Icone nome="arquivo" tam={13} className="inline mr-1.5 -mt-0.5" />
          {importando ? 'Importando…' : 'Subir planilha'}
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden" disabled={importando} onChange={planilhaViraLista} />
        </label>
      </div>
      <p className="text-[11px] text-ink-3 px-1 leading-snug">
        A planilha vira uma lista com o nome do arquivo, pronta para discar. Aceita .xlsx e .csv,
        com ou sem cabeçalho.
      </p>
      {criando && (
        <form onSubmit={criar} className={`${caixa} p-3 space-y-2`}>
          <input required placeholder="Nome da lista (ex.: Pet shops SP)" value={nome}
            onChange={(e) => setNome(e.target.value)} className={campo} />
          <input placeholder="Descrição (opcional)" value={descricao}
            onChange={(e) => setDescricao(e.target.value)} className={campo} />
          <p className="text-[11px] text-ink-3 px-1">
            Depois de criar: adicione contatos (por nicho, prospecção ou planilha) e convide colegas —
            quem aceitar trabalha a lista junto, com histórico compartilhado.
          </p>
          {msg && <p className="text-xs text-danger px-1">{msg}</p>}
          <button className="w-full rounded-lg bg-sinal py-2 font-semibold text-white">Criar lista</button>
        </form>
      )}

      {convites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sinal">Convites</p>
          {convites.map((l) => (
            <div key={l.id} className={`${caixa} border-sinal/40 bg-sinal/5 p-3 space-y-2`}>
              <div>
                <p className="font-semibold text-sm">{l.nome}</p>
                <p className="text-xs text-ink-2">
                  de {l.dona_nome?.split(' ')[0] || 'colega'} · {l.contatos} contatos
                  {l.descricao ? ` · ${l.descricao}` : ''}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => responder(l, true)}
                  className="flex-1 rounded-lg bg-sinal py-2 text-xs font-bold text-white">
                  <Icone nome="check" tam={11} className="inline mr-1 -mt-0.5" />Participar
                </button>
                <button onClick={() => responder(l, false)}
                  className="flex-1 rounded-lg border border-line py-2 text-xs font-semibold text-ink-2">
                  <Icone nome="x" tam={11} className="inline mr-1 -mt-0.5" />Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ativas.length === 0 && convites.length === 0 && (
        <p className="text-sm text-ink-3 text-center py-8">
          Nenhuma lista ainda. Crie a primeira e convide a equipe — a cadência liga de novo sozinha
          até a pessoa aceitar a call.
        </p>
      )}

      {ativas.map((l) => {
        const pct = l.contatos > 0 ? Math.round((l.trabalhados / l.contatos) * 100) : 0
        return (
          <div key={l.id} className={`${caixa} p-3 space-y-2`}>
            <button onClick={() => setAberta(l)} className="w-full text-left space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm truncate">{l.nome} <span className="text-ink-3 text-xs">›</span></p>
                <span className="text-[10px] text-ink-3 shrink-0 inline-flex items-center gap-1">
                  <Icone nome="equipe" tam={11} />{l.membros}
                  {l.situacao_minha === 'dona' ? ' · sua' : ` · de ${l.dona_nome?.split(' ')[0] || ''}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <span className="block h-full bg-sinal" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-ink-2 tnum">
                {l.trabalhados}/{l.contatos} trabalhados · <b className={l.prontos > 0 ? 'text-sinal' : 'text-ink-3'}>{l.prontos} prontos</b>
                {l.retornos > 0 ? ` · ${l.retornos} retornos` : ''}
                {l.reunioes > 0 ? ` · ${l.reunioes} reuniões` : ''}
              </p>
            </button>
            <button onClick={() => aoSessaoLista?.(l)} disabled={l.prontos === 0}
              className="w-full rounded-lg bg-sinal py-2 text-xs font-bold text-white disabled:opacity-30">
              <Icone nome="play" tam={11} className="inline mr-1 -mt-0.5" />
              {l.prontos > 0 ? 'Sessão da lista' : 'Nenhum contato pronto agora'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────── detalhe de uma lista ─────────────────────────
function ListaDetalhe({ lista, perfil, aoVoltar, aoSessaoLista, aoAbrirLead, aoMudou, aoVoltarDiscador }) {
  const [info, setInfo] = useState(lista)  // contagens sempre frescas (o bug do "0 prontos")
  const [contatos, setContatos] = useState([])
  const [membros, setMembros] = useState([])
  const [equipe, setEquipe] = useState([])
  const [convidando, setConvidando] = useState('')
  const [nichos, setNichos] = useState([])
  const [nichoAdd, setNichoAdd] = useState('')
  const [qtdAdd, setQtdAdd] = useState(50)
  const [addAberto, setAddAberto] = useState(false)
  const [subindo, setSubindo] = useState(false)
  const [cadAberta, setCadAberta] = useState(false)
  const [cad, setCad] = useState(lista.cadencia || {})
  const [msg, setMsg] = useState('')
  const souDona = lista.situacao_minha === 'dona'

  async function carregar() {
    supabase.rpc('listas_minhas').then(({ data }) => {
      const fresca = (data || []).find((l) => l.id === lista.id)
      if (fresca) setInfo(fresca)
    })
    const [{ data: cs }, { data: ms }, { data: eq }] = await Promise.all([
      supabase.from('lista_contatos')
        .select('*, leads(id, empresa, telefone, nicho, cidade, proxima_acao_em)')
        .eq('lista_id', lista.id)
        .order('ultima_tentativa_em', { ascending: false, nullsFirst: false }).limit(400),
      supabase.from('lista_membros').select('user_id, situacao').eq('lista_id', lista.id),
      supabase.from('profiles').select('user_id, nome, ativo'),
    ])
    setContatos(cs || []); setMembros(ms || []); setEquipe(eq || [])
  }
  useEffect(() => { carregar() }, [lista.id])
  const nomeDe = (uid) => equipe.find((p) => p.user_id === uid)?.nome?.split(' ')[0] || '—'

  // nichos disponíveis na fila geral — para puxar contatos para a lista
  useEffect(() => {
    supabase.rpc('nichos_disponiveis').then(({ data }) => setNichos(data || []))
  }, [])

  async function adicionarPorNicho() {
    if (!nichoAdd) return
    setMsg('')
    const { data: n, error } = await supabase.rpc('lista_adicionar_por_nicho', {
      _lista: lista.id, _nicho: nichoAdd, _qtd: Number(qtdAdd) || 50,
    })
    if (error) { setMsg(error.message); return }
    setMsg(`${n} contato${n === 1 ? '' : 's'} adicionado${n === 1 ? '' : 's'} do nicho "${nichoAdd}" — prontos para a sessão.`)
    carregar(); aoMudou?.()
  }

  // Planilha direto na lista: cadastra os leads e já põe na fila DESTA lista,
  // sem passar pelo CRM. Usa o mesmo leitor da Prospecção (lib/planilha).
  async function subirPlanilha(e) {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    setSubindo(true); setMsg('')
    try {
      const { mapa, dados, erro } = await lerArquivoDeLeads(arq)
      if (erro) { setMsg(erro); setSubindo(false); return }
      const user = (await supabase.auth.getUser()).data.user
      const { leads, puladas } = montarLeadsDaPlanilha({
        mapa, dados, userId: user.id, origem: 'planilha', arquivo: arq.name,
      })
      if (!leads.length) { setMsg('Nenhuma linha aproveitável na planilha.'); setSubindo(false); return }

      // não duplica quem já está na base (pelo telefone)
      const tels = leads.map((l) => l.telefone).filter(Boolean)
      const jaExistem = new Set()
      for (let i = 0; i < tels.length; i += 200) {
        const { data } = await supabase.from('leads').select('id, telefone').in('telefone', tels.slice(i, i + 200))
        for (const x of data || []) jaExistem.add(x.telefone)
      }
      const novos = leads.filter((l) => !l.telefone || !jaExistem.has(l.telefone))

      const inseridos = []
      let erroGravar = ''
      for (let i = 0; i < novos.length; i += 100) {
        const { data, error } = await supabase.from('leads').insert(novos.slice(i, i + 100)).select('id')
        if (error) { erroGravar = error.message; break }
        inseridos.push(...(data || []))
      }
      // leads repetidos já existentes também entram na lista (é o que a pessoa espera)
      const repetidos = []
      const telsRepetidos = leads.filter((l) => l.telefone && jaExistem.has(l.telefone)).map((l) => l.telefone)
      for (let i = 0; i < telsRepetidos.length; i += 200) {
        const { data } = await supabase.from('leads').select('id').in('telefone', telsRepetidos.slice(i, i + 200))
        repetidos.push(...(data || []))
      }
      const ids = [...inseridos, ...repetidos].map((x) => x.id)
      let naLista = 0
      for (let i = 0; i < ids.length; i += 200) {
        const { data: n } = await supabase.rpc('lista_adicionar_leads',
          { _lista: lista.id, _leads: ids.slice(i, i + 200) })
        naLista += n || 0
      }
      const partes = [`${naLista} contato(s) na lista`]
      if (inseridos.length) partes.push(`${inseridos.length} cadastrados agora`)
      if (repetidos.length) partes.push(`${repetidos.length} já existiam na base`)
      if (puladas) partes.push(`${puladas} linha(s) puladas`)
      setMsg(erroGravar ? `Parou num erro: ${erroGravar}` : partes.join(' · '))
      carregar(); aoMudou?.()
    } catch (err) {
      setMsg(`Não consegui ler o arquivo: ${err.message}`)
    }
    setSubindo(false)
  }

  async function convidar() {
    if (!convidando) return
    const { error } = await supabase.rpc('lista_convidar', { _lista: lista.id, _user: convidando })
    if (error) { setMsg(error.message); return }
    setConvidando(''); carregar()
  }

  async function salvarCadencia() {
    const { error } = await supabase.from('listas').update({ cadencia: cad }).eq('id', lista.id)
    if (error) { setMsg(error.message); return }
    setCadAberta(false); setMsg('Cadência salva.')
  }

  async function resetar() {
    if (!window.confirm('Recolocar todos os contatos esgotados na cadência (zera as tentativas deles)?')) return
    const { data: n } = await supabase.rpc('lista_resetar_cadencia', { _lista: lista.id })
    setMsg(`${n} contato${n === 1 ? '' : 's'} de volta na cadência.`)
    carregar(); aoMudou?.()
  }

  async function excluir() {
    if (!window.confirm(`Apagar a lista "${lista.nome}"? Os leads continuam no CRM; some só a lista. Isso não tem volta.`)) return
    await supabase.from('listas').delete().eq('id', lista.id)
    aoVoltar()
  }

  async function sair() {
    if (!window.confirm(`Sair da lista "${lista.nome}"?`)) return
    await supabase.from('lista_membros').delete()
      .eq('lista_id', lista.id).eq('user_id', perfil.user_id)
    aoVoltar()
  }

  const foraDaEquipe = equipe.filter((p) => p.ativo !== false
    && !membros.some((m) => m.user_id === p.user_id))
  const participantes = membros.filter((m) => m.situacao === 'participante')
  const convidados = membros.filter((m) => m.situacao === 'convidado')

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={aoVoltar} className="w-9 h-9 rounded-lg border border-line text-ink-2 font-bold shrink-0">‹</button>
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate">{lista.nome}</p>
          <p className="text-[11px] text-ink-2 truncate">
            {souDona ? 'sua lista' : `de ${lista.dona_nome?.split(' ')[0] || ''}`}
            {lista.descricao ? ` · ${lista.descricao}` : ''}
          </p>
        </div>
        <button onClick={() => aoSessaoLista?.(info)} disabled={info.prontos === 0}
          className="shrink-0 rounded-lg bg-sinal px-3 py-2 text-xs font-bold text-white disabled:opacity-30">
          <Icone nome="play" tam={11} className="inline mr-1 -mt-0.5" />Sessão
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
        <span className="border border-line rounded-full px-2.5 py-1 text-ink-2 tnum">{info.contatos} contatos</span>
        <span className="border border-line rounded-full px-2.5 py-1 text-ink-2 tnum">{info.trabalhados} trabalhados</span>
        <span className={`rounded-full px-2.5 py-1 tnum border ${info.prontos > 0 ? 'border-sinal/40 bg-sinal/10 text-sinal' : 'border-line text-ink-3'}`}>{info.prontos} prontos</span>
        {info.retornos > 0 && <span className="border border-line rounded-full px-2.5 py-1 text-ink-2 tnum">{info.retornos} retornos</span>}
        {info.esgotados > 0 && <span className="border border-line rounded-full px-2.5 py-1 text-ink-3 tnum">{info.esgotados} esgotados</span>}
      </div>

      {/* adicionar contatos */}
      <div className={`${caixa} p-3 space-y-2`}>
        <button onClick={() => setAddAberto(!addAberto)} className="w-full text-left text-sm font-semibold">
          <Icone nome="mais" tam={12} className="inline mr-1.5 -mt-0.5 text-sinal" />Adicionar contatos
        </button>
        {addAberto && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <select value={nichoAdd} onChange={(e) => setNichoAdd(e.target.value)} className={campo + ' flex-1'}>
                <option value="">Nicho da fila geral…</option>
                {nichos.map((n) => <option key={n.nicho} value={n.nicho}>{n.nicho} ({n.disponiveis})</option>)}
              </select>
              <input type="number" min="1" max="500" value={qtdAdd} onChange={(e) => setQtdAdd(e.target.value)}
                className="w-20 rounded-lg bg-surface-2 border border-line px-2 py-2 text-sm outline-none tnum" />
              <button onClick={adicionarPorNicho} disabled={!nichoAdd}
                className="rounded-lg bg-sinal px-3 text-xs font-bold text-white disabled:opacity-30">Puxar</button>
            </div>
            <label className={`block w-full rounded-lg py-2.5 text-center text-xs font-bold cursor-pointer ${
              subindo ? 'bg-surface-2 text-ink-3' : 'bg-sinal text-white'}`}>
              {subindo ? 'Lendo e cadastrando…' : 'Subir planilha (.xlsx ou .csv)'}
              <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden" disabled={subindo} onChange={subirPlanilha} />
            </label>
            <p className="text-[11px] text-ink-3 leading-snug">
              A planilha entra direto nesta lista. Reconheço empresa, telefone, cidade, nicho, e-mail e
              mais — e se não houver cabeçalho, identifico nome e telefone pelo conteúdo. Quem já está
              na base entra na lista sem duplicar.
            </p>
          </div>
        )}
      </div>

      {/* cadência */}
      <div className={`${caixa} p-3 space-y-2`}>
        <button onClick={() => setCadAberta(!cadAberta)} className="w-full text-left text-sm font-semibold">
          <Icone nome="ajuste" tam={12} className="inline mr-1.5 -mt-0.5 text-sinal" />Cadência
          <span className="text-[11px] text-ink-3 font-normal"> — quando o sistema liga de novo sozinho</span>
        </button>
        {cadAberta && (
          <div className="space-y-1.5">
            {['nao_atendeu', 'caixa_postal', 'ocupado', 'desligou'].map((d) => (
              <div key={d} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-ink-2">{NOMES_DESFECHO[d]}</span>
                <span className="text-ink-3">a cada</span>
                <input type="number" min="0.5" step="0.5" disabled={!souDona}
                  value={cad?.[d]?.h ?? ''} onChange={(e) => setCad({ ...cad, [d]: { ...cad[d], h: Number(e.target.value) } })}
                  className="w-16 rounded-lg bg-surface-2 border border-line px-2 py-1.5 outline-none tnum disabled:opacity-50" />
                <span className="text-ink-3">h · máx</span>
                <input type="number" min="1" max="20" disabled={!souDona}
                  value={cad?.[d]?.max ?? ''} onChange={(e) => setCad({ ...cad, [d]: { ...cad[d], max: Number(e.target.value) } })}
                  className="w-14 rounded-lg bg-surface-2 border border-line px-2 py-1.5 outline-none tnum disabled:opacity-50" />
                <span className="text-ink-3">×</span>
              </div>
            ))}
            {souDona && (
              <button onClick={salvarCadencia} className="w-full rounded-lg bg-sinal py-2 text-xs font-bold text-white">
                Salvar cadência
              </button>
            )}
            {info.esgotados > 0 && souDona && (
              <button onClick={resetar} className="w-full rounded-lg border border-line py-2 text-xs font-semibold text-ink-2">
                <Icone nome="hist" tam={11} className="inline mr-1 -mt-0.5" />Rodar a lista de novo ({info.esgotados} esgotados)
              </button>
            )}
          </div>
        )}
      </div>

      {/* equipe da lista */}
      <div className={`${caixa} p-3 space-y-2`}>
        <p className="text-sm font-semibold">
          <Icone nome="equipe" tam={12} className="inline mr-1.5 -mt-0.5 text-sinal" />Equipe
        </p>
        <div className="flex flex-wrap gap-1.5">
          {participantes.map((m) => (
            <span key={m.user_id} className="text-[11px] border border-line rounded-full px-2.5 py-1 text-ink">
              {nomeDe(m.user_id)}{m.user_id === lista.criada_por ? ' · dona' : ''}
            </span>
          ))}
          {convidados.map((m) => (
            <span key={m.user_id} className="text-[11px] border border-line rounded-full px-2.5 py-1 text-ink-3">
              {nomeDe(m.user_id)} · convidado
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <select value={convidando} onChange={(e) => setConvidando(e.target.value)} className={campo + ' flex-1'}>
            <option value="">Convidar colega…</option>
            {foraDaEquipe.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
          </select>
          <button onClick={convidar} disabled={!convidando}
            className="rounded-lg bg-sinal px-3 text-xs font-bold text-white disabled:opacity-30">Convidar</button>
        </div>
      </div>

      {msg && <p className="text-xs text-sinal px-1">{msg}</p>}

      {/* contatos */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Contatos</p>
        {contatos.length === 0 && <p className="text-xs text-ink-3">Nenhum contato ainda — adicione acima.</p>}
        {contatos.map((c) => (
          <button key={c.lead_id} onClick={() => aoAbrirLead?.(c.lead_id)}
            className={`w-full text-left ${caixa} px-3 py-2 flex items-center gap-2 ${
              c.situacao === 'descartado' || c.situacao === 'esgotado' ? 'opacity-50' : ''}`}>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{c.leads?.empresa || '—'}</span>
              <span className="block text-[11px] text-ink-3 truncate tnum">
                {c.tentativas > 0
                  ? `${c.tentativas}× · ${NOMES_DESFECHO[c.ultimo_desfecho] || c.ultimo_desfecho || ''} · ${NOMES_SITUACAO[c.situacao] || c.situacao}`
                  : NOMES_SITUACAO[c.situacao] || c.situacao}
                {c.situacao === 'em_cadencia' && c.proxima_tentativa_em
                  ? ` · volta ${new Date(c.proxima_tentativa_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
                {c.situacao === 'retorno' && c.travado_por ? ` · de ${nomeDe(c.travado_por)}` : ''}
              </span>
            </span>
            <span className="text-ink-3 text-xs shrink-0">›</span>
          </button>
        ))}
      </div>

      {aoVoltarDiscador && (
        <button onClick={aoVoltarDiscador}
          className={`w-full ${caixa} py-2.5 text-sm font-semibold text-ink-2`}>
          <Icone nome="fone" tam={13} className="inline mr-1.5 -mt-0.5" />Voltar para o discador
        </button>
      )}

      <div className="flex gap-1.5 pt-2">
        {souDona ? (
          <button onClick={excluir} className={`${botaoMini} border-line text-ink-3 hover:text-danger hover:border-danger/40`}>
            <Icone nome="lixo" tam={10} />Apagar lista
          </button>
        ) : (
          <button onClick={sair} className={`${botaoMini} border-line text-ink-3`}>
            <Icone nome="x" tam={10} />Sair da lista
          </button>
        )}
      </div>
    </div>
  )
}
