import { useEffect, useState } from 'react'
import { supabase, erroDaFuncao } from '../lib/supabase'
import { Transcricao, Dossie as PainelDossie, GaleriaFotos, DossieBlocos } from '../componentes/Conversa'
import AgendarMentoria from '../componentes/AgendarMentoria'
import Diagnostico from '../componentes/Diagnostico'
import Icone from '../componentes/Icone'

const STATUS = {
  novo: { rotulo: 'Novo', cor: 'text-sky border-sky/40' },
  em_contato: { rotulo: 'Em contato', cor: 'text-amber border-amber/40' },
  retorno: { rotulo: 'Retorno', cor: 'text-violet border-violet/40' },
  reuniao_marcada: { rotulo: 'Mentoria marcada', cor: 'text-sinal border-sinal/40' },
  negociacao: { rotulo: 'Negociação', cor: 'text-sky-300 border-sky/50' },
  convertido: { rotulo: 'Cliente', cor: 'text-sinal border-sinal/60' },
  descartado: { rotulo: 'Descartado', cor: 'text-ink-3 border-line' },
}

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal'

// O funil inteiro em etapas, na ordem em que o lead anda por elas.
// Cada lead mora em UMA etapa — a regra está em etapaDoLead().
const ETAPAS = [
  { id: 'fila', rotulo: 'Fila', icone: 'lista', vazio: 'Fila vazia — use a Prospecção para buscar empresas.' },
  { id: 'contato', rotulo: 'Contato', icone: 'fone', vazio: 'Ninguém em conversa ainda — os contatados aparecem aqui.' },
  { id: 'retorno', rotulo: 'Retornos', icone: 'relogio', vazio: 'Nenhum retorno marcado.' },
  { id: 'mentoria', rotulo: 'Mentoria', icone: 'calcheck', vazio: 'Nenhuma mentoria agendada.' },
  { id: 'negociacao', rotulo: 'Negociação', icone: 'equipe', vazio: 'Ninguém em negociação — depois da mentoria, o lead vem para cá.' },
  { id: 'clientes', rotulo: 'Clientes', icone: 'bandeira', vazio: 'Nenhum cliente fechado ainda — quando fechar, o pós-venda mora aqui.' },
]

// Em qual etapa do funil este lead está?
// A data de retorno puxa o lead para "Retornos" enquanto ele ainda está na
// prospecção; das etapas de mentoria em diante, vale o status (a data aparece
// no cartão). Cliente convertido vive na régua de pós-venda.
function etapaDoLead(l) {
  if (l.status === 'descartado') return 'descartados'
  if (l.status === 'convertido') return 'clientes'
  if (l.status === 'negociacao') return 'negociacao'
  if (l.status === 'reuniao_marcada') return 'mentoria'
  if (l.proxima_acao_em) return 'retorno'
  if (l.status === 'em_contato') return 'contato'
  return 'fila'
}

export default function Leads({ perfil, ehAdmin, aoLigar, leadInicial, aoConsumirLeadInicial, aoVoltarDiscador }) {
  const [modo, setModo] = useState('lista') // lista | dossie | prospectar
  const [visao, setVisao] = useState('fila')
  const [leads, setLeads] = useState([])
  const [verTodos, setVerTodos] = useState(false)
  const [mentorFiltro, setMentorFiltro] = useState('')
  const [equipe, setEquipe] = useState([])
  const [mentoriasHoje, setMentoriasHoje] = useState(0)
  const [lead, setLead] = useState(null)
  const [aviso, setAviso] = useState('')
  const [nichoFiltro, setNichoFiltro] = useState('')

  async function carregar() {
    let q = supabase.from('leads').select('*').order('atualizado_em', { ascending: false }).limit(500)
    if (!(ehAdmin && verTodos)) q = q.or(`atribuido_a.eq.${perfil.user_id},atribuido_a.is.null`)
    const { data } = await q
    setLeads(data || [])
  }
  useEffect(() => { carregar() }, [verTodos])

  // Outra tela pediu para abrir um lead (agenda, telefone, placar…):
  // busca a ficha e cai direto no dossiê, sem passar pela lista.
  useEffect(() => {
    if (!leadInicial) return
    supabase.from('leads').select('*').eq('id', leadInicial).single()
      .then(({ data }) => {
        if (data) { setLead(data); setModo('dossie') }
        aoConsumirLeadInicial?.()
      })
  }, [leadInicial])

  // admin: nomes da equipe, para filtrar o funil por mentor
  useEffect(() => {
    if (!ehAdmin) return
    supabase.from('profiles').select('user_id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setEquipe(data || []))
  }, [ehAdmin])

  // mentorias de hoje (para a régua "Hoje" no topo)
  useEffect(() => {
    const ini = new Date(); ini.setHours(0, 0, 0, 0)
    const fim = new Date(); fim.setHours(23, 59, 59, 999)
    let q = supabase.from('agenda_eventos').select('id', { count: 'exact', head: true })
      .eq('status', 'marcado').eq('tipo', 'apresentacao')
      .gte('inicio', ini.toISOString()).lte('inicio', fim.toISOString())
    if (!(ehAdmin && verTodos)) q = q.or(`vendedor.eq.${perfil.user_id},criado_por.eq.${perfil.user_id}`)
    q.then(({ count }) => setMentoriasHoje(count || 0))
  }, [verTodos])

  async function puxarProximo() {
    setAviso('')
    // Os DOIS parâmetros vão sempre, mesmo nulos: o banco tem duas versões da
    // função (com e sem _lote) e, omitindo _lote, o PostgREST não sabe qual
    // chamar e devolve PGRST203 — era o "Erro ao puxar lead" de 07/08.
    const { data, error } = await supabase.rpc('puxar_proximo_lead', { _nicho: null, _lote: null })
    if (error) { setAviso('Erro ao puxar lead.'); return }
    if (!data?.id) { setAviso('Fila vazia — importe leads na Prospecção.'); return }
    setLead(data); setModo('dossie'); carregar()
  }

  function abrir(l) { setLead(l); setModo('dossie') }

  if (modo === 'prospectar') {
    return <Prospeccao aoVoltar={() => { setModo('lista'); carregar() }}
      aoAbrirLead={(l) => { setLead(l); setModo('dossie') }} />
  }
  if (modo === 'dossie' && lead) {
    return (
      <Dossie
        lead={lead}
        perfil={perfil}
        aoLigar={aoLigar}
        aoVoltar={() => { setModo('lista'); setLead(null); carregar() }}
        aoAtualizar={(novo) => setLead(novo)}
      />
    )
  }

  const agora = new Date()
  const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999)

  // um dono para cada lead: mina (ou de todos, no modo admin) + fila comum.
  // Contato com DONO (importado/prospectado por alguém) só aparece para o
  // próprio dono — na fila comum entra apenas o estoque sem dono da equipe.
  let visiveis = leads.filter((l) => (ehAdmin && verTodos)
    || l.atribuido_a === perfil.user_id
    || (l.atribuido_a == null && l.status === 'novo' && (!l.dono || l.dono === perfil.user_id)))
  if (ehAdmin && verTodos && mentorFiltro) {
    visiveis = visiveis.filter((l) => l.atribuido_a === mentorFiltro || (l.atribuido_a == null && l.status === 'novo'))
  }

  const porEtapa = { fila: [], contato: [], retorno: [], mentoria: [], negociacao: [], clientes: [], descartados: [] }
  for (const l of visiveis) porEtapa[etapaDoLead(l)].push(l)
  porEtapa.retorno.sort((a, b) => new Date(a.proxima_acao_em) - new Date(b.proxima_acao_em))
  porEtapa.clientes.sort((a, b) => new Date(a.posvenda_proximo_em || '2999-01-01') - new Date(b.posvenda_proximo_em || '2999-01-01'))
  const descartados = porEtapa.descartados

  // régua "Hoje": o que precisa de ação agora, atravessando as etapas
  const retornosHoje = porEtapa.retorno.filter((l) => new Date(l.proxima_acao_em) <= fimHoje)
  const retornosVencidos = retornosHoje.filter((l) => new Date(l.proxima_acao_em) <= agora)
  const posvendaHoje = porEtapa.clientes.filter((l) => l.posvenda_proximo_em && new Date(l.posvenda_proximo_em) <= fimHoje)

  // nichos presentes na etapa atual (para o filtro)
  const nichos = [...new Set(porEtapa[visao].map((l) => (l.nicho || '').trim()).filter(Boolean))].sort()
  let itens = porEtapa[visao]
  if (nichoFiltro) itens = itens.filter((l) => (l.nicho || '').trim() === nichoFiltro)

  const nomeMentor = (uid) => equipe.find((m) => m.user_id === uid)?.nome?.split(' ')[0]

  return (
    <div className="max-w-lg md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      {/* ───── HOJE: o dia de trabalho num relance ───── */}
      <div className={`${caixa} px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-xs`}>
        <span className="font-semibold uppercase tracking-wide text-ink-2">Hoje</span>
        <button onClick={() => setVisao('retorno')} className={retornosVencidos.length ? 'text-amber font-semibold' : 'text-ink-2'}>
          {retornosHoje.length} retorno{retornosHoje.length === 1 ? '' : 's'}
          {retornosVencidos.length > 0 && ` (${retornosVencidos.length} vencido${retornosVencidos.length === 1 ? '' : 's'})`}
        </button>
        <button onClick={() => setVisao('mentoria')} className="text-ink-2">
          {mentoriasHoje} mentoria{mentoriasHoje === 1 ? '' : 's'}
        </button>
        <button onClick={() => setVisao('clientes')} className={posvendaHoje.length ? 'text-sinal font-semibold' : 'text-ink-2'}>
          {posvendaHoje.length} pós-venda{posvendaHoje.length === 1 ? '' : 's'}
        </button>
      </div>

      {/* ───── etapas do funil ───── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
        {ETAPAS.map((v) => (
          <button key={v.id} onClick={() => { setVisao(v.id); setNichoFiltro('') }}
            className={`rounded-lg py-2 text-xs font-semibold border ${
              visao === v.id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            <Icone nome={v.icone} tam={12} className="inline mr-1 -mt-0.5" />{v.rotulo}
            <span className="block text-sm font-bold">{porEtapa[v.id].length}</span>
          </button>
        ))}
      </div>

      {visao === 'fila' && (
        <>
          <div className="flex gap-2">
            <button onClick={puxarProximo} className="flex-[2] rounded-xl bg-sinal py-3.5 font-bold text-white">
              <Icone nome="play" tam={13} className="inline mr-1.5 -mt-0.5" />Puxar próximo lead
            </button>
            <button onClick={() => setModo('prospectar')} className={`flex-1 ${caixa} py-3.5 font-semibold text-sm`}>
              Prospectar
            </button>
          </div>
          {/* atalho de volta: puxou o lead aqui, liga sem procurar a aba */}
          <button onClick={() => aoVoltarDiscador?.()}
            className={`w-full ${caixa} py-2.5 text-sm font-semibold text-ink-2`}>
            <Icone nome="fone" tam={13} className="inline mr-1.5 -mt-0.5" />Voltar para o discador
          </button>
          {aviso && <p className="text-sm text-amber">{aviso}</p>}
        </>
      )}
      {ehAdmin && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
            Toda a equipe
          </label>
          {verTodos && equipe.length > 0 && (
            <select value={mentorFiltro} onChange={(e) => setMentorFiltro(e.target.value)}
              className="flex-1 rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-xs outline-none">
              <option value="">Todos os mentores</option>
              {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
            </select>
          )}
        </div>
      )}

      {nichos.length > 1 && (
        <div className="flex items-center gap-2">
          <select value={nichoFiltro} onChange={(e) => setNichoFiltro(e.target.value)}
            className="flex-1 rounded-lg bg-surface-2 border border-line px-2 py-2 text-sm outline-none focus:border-sinal">
            <option value="">Todos os nichos ({porEtapa[visao].length})</option>
            {nichos.map((n) => (
              <option key={n} value={n}>{n} ({porEtapa[visao].filter((l) => (l.nicho || '').trim() === n).length})</option>
            ))}
          </select>
          {nichoFiltro && (
            <button onClick={() => setNichoFiltro('')} className="text-xs text-ink-2 underline whitespace-nowrap">limpar</button>
          )}
        </div>
      )}

      {itens.length === 0 && (
        <p className="text-sm text-ink-3 text-center py-8">
          {ETAPAS.find((v) => v.id === visao)?.vazio}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-2.5">
      {itens.map((l) => (
        // min-w-0: item de grid tem largura mínima "auto" — sem isto, um chip
        // comprido no cartão esticava a tela inteira no celular
        <div key={l.id} className="min-w-0">
        <button onClick={() => abrir(l)} className={`w-full text-left ${caixa} px-4 py-3 hover:border-sinal/40 transition`}>
          <span className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              {l.foto_url && (
                <img src={l.foto_url} alt="" loading="lazy"
                  className="w-9 h-9 rounded-lg object-cover border border-line shrink-0" />
              )}
              <span className="block font-medium truncate">{l.empresa}</span>
            </span>
            <span className="flex items-center gap-1.5 shrink min-w-0">
              {ehAdmin && verTodos && l.atribuido_a && (
                <span className="text-[10px] text-ink-3 truncate max-w-[5.5rem]">{nomeMentor(l.atribuido_a)}</span>
              )}
              {l.dono && (
                <span className="text-[10px] border border-sky/40 text-sky rounded-full px-2 py-0.5 whitespace-nowrap"
                  title="Contato importado/prospectado por esta pessoa — só ela puxa no discador">
                  de {l.dono === perfil.user_id ? (perfil.nome?.split(' ')[0] || 'você') : (nomeMentor(l.dono) || 'colega')}
                </span>
              )}
              <span className={`text-[10px] border rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS[l.status].cor}`}>
                {STATUS[l.status].rotulo}
              </span>
              {ehAdmin && visao === 'fila' && (
                <span
                  role="button"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (confirm(`Excluir "${l.empresa}" da fila?`)) {
                      await supabase.from('leads').delete().eq('id', l.id)
                      carregar()
                    }
                  }}
                  className="text-ink-3 hover:text-danger px-1 text-sm"
                  title="Excluir da fila"
                ><Icone nome="lixo" tam={12} /></span>
              )}
            </span>
          </span>
          <span className="block text-xs text-ink-2">
            {l.telefone ? formatarFone(l.telefone) : 'sem telefone'}
            {l.cidade ? ` · ${l.cidade}` : ''}{l.nicho ? ` · ${l.nicho}` : ''}
          </span>
          {l.proxima_acao_em && !['convertido', 'descartado'].includes(l.status) && (
            <span className={`block text-xs mt-0.5 ${new Date(l.proxima_acao_em) <= agora ? 'text-amber font-semibold' : 'text-violet'}`}>
              {new Date(l.proxima_acao_em) <= agora ? 'Retorno VENCIDO — ligar agora'
                : `Retornar em ${new Date(l.proxima_acao_em).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
          {l.status === 'convertido' && l.posvenda_proximo_em && (
            <span className={`block text-xs mt-0.5 ${new Date(l.posvenda_proximo_em) <= agora ? 'text-amber font-semibold' : 'text-sinal/80'}`}>
              {new Date(l.posvenda_proximo_em) <= agora ? 'Contato de pós-venda VENCIDO'
                : `Próximo contato ${new Date(l.posvenda_proximo_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
              {l.posvenda_intervalo_dias ? ` · a cada ${l.posvenda_intervalo_dias} dias` : ''}
            </span>
          )}
          {l.motivador && <span className="block text-xs text-sinal/80 mt-0.5">{l.motivador}</span>}
        </button>
        {visao === 'clientes' && <RegistrarPosvenda lead={l} aoFeito={carregar} />}
        </div>
      ))}
      </div>

      {descartados.length > 0 && (
        <details className="text-xs text-ink-3">
          <summary className="cursor-pointer">Descartados ({descartados.length})</summary>
          <div className="pt-2 space-y-1.5">
            {descartados.map((l) => (
              <button key={l.id} onClick={() => abrir(l)} className="block w-full text-left text-ink-2">
                • {l.empresa}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// Registro de um toque de pós-venda: anota o que foi conversado e reagenda o
// próximo contato. É isso que mantém o cliente vivo — sem registro, a régua
// fica vencida e o cartão cobra.
function RegistrarPosvenda({ lead, aoFeito }) {
  const [aberto, setAberto] = useState(false)
  const [obs, setObs] = useState('')
  const [dias, setDias] = useState(String(lead.posvenda_intervalo_dias || 30))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    setSalvando(true); setErro('')
    const { error } = await supabase.rpc('registrar_contato_posvenda', {
      _lead_id: lead.id, _obs: obs.trim() || null, _dias: parseInt(dias) || null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setAberto(false); setObs('')
    aoFeito()
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="mt-1 w-full text-xs font-semibold border border-sinal/40 text-sinal rounded-lg py-1.5">
        Registrar contato de pós-venda
      </button>
    )
  }
  return (
    <div className={`${caixa} mt-1 p-3 space-y-2`}>
      <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)}
        placeholder="Como o cliente está? O que foi conversado?"
        className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
      <div className="flex items-center gap-2 text-xs text-ink-2">
        <span>Falar de novo em</span>
        <input type="number" min="1" max="365" value={dias} onChange={(e) => setDias(e.target.value)}
          className="w-16 rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-center outline-none" />
        <span>dias</span>
      </div>
      {erro && <p className="text-xs text-danger">{erro}</p>}
      <div className="flex gap-2">
        <button onClick={salvar} disabled={salvando}
          className="flex-1 rounded-lg bg-sinal py-2 text-sm font-bold text-white disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar contato'}
        </button>
        <button onClick={() => setAberto(false)} className={`${caixa} px-4 text-sm`}>Fechar</button>
      </div>
    </div>
  )
}

function Dossie({ lead, perfil, aoLigar, aoVoltar, aoAtualizar }) {
  const [eventos, setEventos] = useState([])
  const [chamadas, setChamadas] = useState([])
  const [nota, setNota] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [retornando, setRetornando] = useState(false)
  const [levantando, setLevantando] = useState(false)
  const [msgLevantar, setMsgLevantar] = useState('')
  const [verDiagnostico, setVerDiagnostico] = useState(false)

  // Dossiê de prospecção: levanta dados públicos da empresa (botão, sem automático).
  // O levantamento leva ~1 min; se a resposta se perder no caminho, o servidor
  // costuma ter concluído mesmo assim — então buscamos o resultado no banco em
  // vez de mostrar erro (foi o que aconteceu com o Fabrício em 03/08).
  async function levantarDados() {
    setLevantando(true); setMsgLevantar('')
    const { data, error } = await supabase.functions.invoke('enriquecer', {
      body: { lead_id: lead.id },
    })
    if (!error && data?.ok) {
      setLevantando(false)
      aoAtualizar({ ...lead, dossie: data.dossie, foto_url: data.foto_url || lead.foto_url })
      if (data.avisos?.length) setMsgLevantar(`Parcial: ${data.avisos.join(' · ')}`)
      return
    }
    const msgReal = await erroDaFuncao(error, data)
    if (msgReal) { setLevantando(false); setMsgLevantar(msgReal); return }

    // resposta perdida: confere no banco se o levantamento gravou
    setMsgLevantar('A resposta demorou — conferindo se o levantamento concluiu…')
    const antes = lead.dossie?.dados_levantados_em
    for (let i = 0; i < 10; i++) {
      await new Promise((ok) => setTimeout(ok, 6000))
      const { data: fresco } = await supabase.from('leads')
        .select('dossie, foto_url').eq('id', lead.id).single()
      if (fresco?.dossie?.dados_levantados_em && fresco.dossie.dados_levantados_em !== antes) {
        setLevantando(false); setMsgLevantar('')
        aoAtualizar({ ...lead, dossie: fresco.dossie, foto_url: fresco.foto_url || lead.foto_url })
        return
      }
    }
    setLevantando(false)
    setMsgLevantar('Não deu para concluir agora. Tente de novo em alguns minutos.')
  }
  const [dataRetorno, setDataRetorno] = useState('')
  const [transAberta, setTransAberta] = useState(null)

  async function carregarLinha() {
    const [{ data: evs }, { data: calls }] = await Promise.all([
      supabase.from('lead_eventos').select('*').eq('lead_id', lead.id).order('criado_em', { ascending: false }).limit(50),
      supabase.from('calls').select('id, direcao, status, duracao_seg, iniciada_em, transcricao, transcricao_turnos, transcricao_status, dossie')
        .eq('lead_id', lead.id).order('iniciada_em', { ascending: false }).limit(20),
    ])
    setEventos(evs || []); setChamadas(calls || [])
  }
  useEffect(() => { carregarLinha() }, [lead.id])

  async function mudarStatus(s) {
    const { error } = await supabase.rpc('mudar_status_lead', { _lead_id: lead.id, _status: s })
    if (!error) { aoAtualizar({ ...lead, status: s }); carregarLinha() }
  }

  async function salvarNota() {
    if (!nota.trim()) return
    await supabase.from('lead_eventos').insert({
      lead_id: lead.id, tipo: 'nota', descricao: nota.trim(),
      autor: (await supabase.auth.getUser()).data.user.id,
    })
    setNota(''); carregarLinha()
  }

  async function marcarRetorno(quando) {
    const { error } = await supabase.rpc('agendar_retorno', {
      _lead_id: lead.id, _quando: quando.toISOString(),
    })
    if (!error) {
      setRetornando(false); setDataRetorno('')
      aoAtualizar({ ...lead, status: 'retorno', proxima_acao_em: quando.toISOString() })
      carregarLinha()
    }
  }
  // atalhos: somam dias e mantêm um horário comercial padrão (09:00)
  function retornoEmDias(dias) {
    const d = new Date(Date.now() + dias * 86400000)
    d.setHours(9, 0, 0, 0)
    marcarRetorno(d)
  }

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      {verDiagnostico && (
        <Diagnostico lead={lead} perfil={perfil} aoFechar={() => setVerDiagnostico(false)} />
      )}
      <button onClick={aoVoltar} className="text-sm text-ink-2">← Voltar</button>

      <div className={`${caixa} p-4 space-y-1`}>
        {lead.foto_url && (
          <img src={lead.foto_url} alt="" loading="lazy"
            className="w-full h-36 object-cover rounded-lg border border-line mb-2" />
        )}
        <GaleriaFotos fotos={lead.dossie?.fotos} />
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{lead.empresa}</h2>
          <span className={`text-xs border rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS[lead.status].cor}`}>
            {STATUS[lead.status].rotulo}
          </span>
        </div>
        <p className="text-sm text-ink-2">{lead.telefone ? formatarFone(lead.telefone) : 'sem telefone'}</p>
        {lead.endereco && <p className="text-xs text-ink-2">{lead.endereco}</p>}
        <p className="text-xs text-ink-2">
          {lead.cidade}{lead.estado ? `/${lead.estado}` : ''}
          {lead.avaliacao ? ` · ★ ${lead.avaliacao} (${lead.num_avaliacoes || '?'} avaliações)` : ''}
          {lead.nicho ? ` · ${lead.nicho}` : ''}
        </p>
        {chamadas.length > 0 && (
          <p className="text-xs text-ink-2">
            {chamadas.length} {chamadas.length === 1 ? 'ligação' : 'ligações'} · última em{' '}
            {new Date(chamadas[0].iniciada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' '}({chamadas[0].status === 'atendida' ? 'atendida' : 'não atendida'})
          </p>
        )}
        {lead.proxima_acao_em && !['convertido', 'descartado'].includes(lead.status) && (
          <p className="text-xs text-violet font-medium">
            Próximo contato: {new Date(lead.proxima_acao_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {lead.site && <a href={lead.site} target="_blank" rel="noreferrer" className="text-xs text-sinal underline">site</a>}
        <div className="pt-1.5 flex flex-wrap gap-1.5">
          <button onClick={levantarDados} disabled={levantando}
            className="text-xs border border-sky/40 text-sky rounded-full px-3 py-1 disabled:opacity-50">
            {levantando ? 'Levantando… (leva ~1 min)' : 'Levantar dados da empresa'}
          </button>
          {lead.dossie?.dados_levantados_em && (
            <button onClick={() => setVerDiagnostico(true)}
              className="text-xs font-semibold border border-sinal/50 text-sinal rounded-full px-3 py-1">
              Diagnóstico Digital
            </button>
          )}
        </div>
        {msgLevantar && <p className="text-[11px] text-amber">{msgLevantar}</p>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => aoLigar(lead)}
          disabled={!lead.telefone}
          className="flex-[2] rounded-xl bg-sinal py-3 font-bold text-white disabled:opacity-40"
        >
          Ligar
        </button>
        <button onClick={() => { setAgendando(!agendando); setRetornando(false) }} className={`flex-1 ${caixa} py-3 font-semibold text-sm`}>
          Agendar
        </button>
        <button onClick={() => { setRetornando(!retornando); setAgendando(false) }} className={`flex-1 ${caixa} py-3 font-semibold text-sm`}>
          Retorno
        </button>
      </div>

      {retornando && (
        <div className={`${caixa} p-3 space-y-2`}>
          <p className="text-sm font-semibold">Ligar de novo quando?</p>
          <div className="flex flex-wrap gap-1.5">
            {[['Amanhã 9h', 1], ['1 semana', 7], ['15 dias', 15], ['1 mês', 30], ['3 meses', 90]].map(([rotulo, dias]) => (
              <button key={rotulo} onClick={() => retornoEmDias(dias)}
                className="text-xs border border-violet/40 text-violet rounded-full px-3 py-1.5">
                {rotulo}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-3">ou escolha data e horário exatos:</p>
          <div className="flex gap-2">
            <input type="datetime-local" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} className={campo} />
            <button onClick={() => dataRetorno && marcarRetorno(new Date(dataRetorno))} disabled={!dataRetorno}
              className="rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-40">
              Marcar
            </button>
          </div>
          <p className="text-[11px] text-ink-3">
            O lead sai da fila e ressurge sozinho na data/hora marcada, e também vira compromisso na sua Agenda.
          </p>
        </div>
      )}

      {agendando && (
        <div className={`${caixa} p-3 space-y-2`}>
          <p className="text-sm font-semibold">Agendar mentoria</p>
          <AgendarMentoria lead={lead}
            aoAgendar={() => {
              setAgendando(false)
              aoAtualizar({ ...lead, status: 'reuniao_marcada' }); carregarLinha()
            }} />
        </div>
      )}

      {lead.status === 'convertido' && lead.babel_user_id && (
        <Implementacao lead={lead} aoFeito={carregarLinha} />
      )}

      {lead.status === 'convertido' && (
        <div className={`${caixa} p-3 space-y-1.5`}>
          <p className="text-sm font-semibold">Pós-venda</p>
          {lead.posvenda_proximo_em && (
            <p className="text-xs text-ink-2">
              Próximo contato: <b className={new Date(lead.posvenda_proximo_em) <= new Date() ? 'text-amber' : 'text-sinal'}>
                {new Date(lead.posvenda_proximo_em).toLocaleDateString('pt-BR')}
              </b>
              {lead.posvenda_intervalo_dias ? ` · a cada ${lead.posvenda_intervalo_dias} dias` : ''}
            </p>
          )}
          <RegistrarPosvenda lead={lead}
            aoFeito={async () => {
              carregarLinha()
              const { data } = await supabase.from('leads').select('*').eq('id', lead.id).single()
              if (data) aoAtualizar(data)
            }} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {Object.keys(STATUS).filter((s) => s !== lead.status).map((s) => (
          <button key={s} onClick={() => mudarStatus(s)}
            className={`text-xs border rounded-full px-2.5 py-1 ${STATUS[s].cor}`}>
            → {STATUS[s].rotulo}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Anotar algo sobre este lead…" className={campo} />
        <button onClick={salvarNota} className={`${caixa} px-4 font-semibold text-sm`}>Salvar</button>
      </div>

      {lead.dossie && Object.keys(lead.dossie).length > 0 && (
        <div className={`${caixa} p-4 space-y-2`}>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">
            Dossiê do contato — tudo que já descobrimos
          </p>
          <DossieBlocos dossie={lead.dossie} />
          <p className="text-[10px] text-ink-3">
            Levantamento público + o que cada conversa revelou. Cada ligação abaixo
            mostra o que foi captado naquele dia.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">
          Linha do tempo — evolução do contato
        </p>
        {chamadas.map((c) => (
          <div key={`c${c.id}`} className={`${caixa} px-4 py-3 text-sm`}>
            <div className="flex justify-between gap-2">
              <span>Ligação {c.direcao === 'saida' ? 'feita' : 'recebida'} · {c.status || '—'} · {c.duracao_seg || 0}s</span>
              <span className="text-xs text-ink-3">{formatarData(c.iniciada_em)}</span>
            </div>
            {c.dossie?.resumo && (
              <p className="text-xs text-ink-2 mt-1.5 italic">“{c.dossie.resumo}”</p>
            )}
            {(c.transcricao || c.dossie) && (
              <button onClick={() => setTransAberta(transAberta === c.id ? null : c.id)}
                className="text-xs text-sinal underline mt-1">
                {transAberta === c.id ? 'ocultar conversa' : 'ver conversa completa'}
              </button>
            )}
            {transAberta === c.id && (
              <div className="mt-2 space-y-3">
                <PainelDossie dossie={c.dossie} titulo="Captado nesta conversa" />
                {(c.transcricao_turnos?.length || c.transcricao) && (
                  <div className="rounded-lg bg-surface-2 border border-line p-3 max-h-96 overflow-y-auto">
                    <Transcricao turnos={c.transcricao_turnos} texto={c.transcricao}
                      nomeLead={c.dossie?.nome_atendente || lead.contato_nome} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {eventos.map((e) => (
          <div key={e.id} className="px-4 py-2 text-sm text-ink-2 border-l-2 border-line">
            <span>{e.descricao}</span>
            <span className="block text-xs text-ink-3">{formatarData(e.criado_em)}</span>
          </div>
        ))}
        {eventos.length === 0 && chamadas.length === 0 && (
          <p className="text-xs text-ink-3">Ainda sem histórico — ele se escreve sozinho a cada ligação.</p>
        )}
      </div>
    </div>
  )
}

function Prospeccao({ aoVoltar, aoAbrirLead }) {
  const [modoProsp, setModoProsp] = useState('maps') // maps | manual | planilha
  // Prospecção desagua em LISTA (spec 2026-08-06): escolha uma e tudo que for
  // importado já entra na fila de discagem dela, em qualquer um dos 3 modos.
  const [listaDestino, setListaDestino] = useState('')
  const [listasProsp, setListasProsp] = useState([])
  useEffect(() => {
    supabase.rpc('listas_minhas').then(({ data }) => setListasProsp((data || [])
      .filter((l) => l.situacao_minha === 'dona' || l.situacao_minha === 'participante')))
  }, [])
  const [nicho, setNicho] = useState('')
  const [cidade, setCidade] = useState('')
  const [estado, setEstado] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState([])
  const [marcados, setMarcados] = useState(new Set())
  const [importados, setImportados] = useState(new Set())
  const [mensagem, setMensagem] = useState('')

  // Toque na empresa → abre a ficha completa (dados, histórico de ligações,
  // gestão do próximo contato). Vale para o que acabou de ser importado e
  // para o que já estava na base de outra prospecção.
  async function abrirFicha(r) {
    let q = supabase.from('leads').select('*').limit(1)
    if (r.maps_place_id) q = q.eq('maps_place_id', r.maps_place_id)
    else if (r.telefone) q = q.eq('telefone', r.telefone)
    else { setMensagem('Empresa sem identificação para localizar na base.'); return }
    const { data } = await q
    if (data?.[0]) { aoAbrirLead(data[0]); return }
    setMensagem(`"${r.empresa}" ainda não está na base — selecione e importe para abrir a ficha.`)
  }

  async function buscar(e) {
    e.preventDefault()
    setBuscando(true); setMensagem(''); setResultados([]); setImportados(new Set())
    const { data, error } = await supabase.functions.invoke('prospectar', {
      body: { nicho, cidade, estado, quantidade: 20 },
    })
    setBuscando(false)
    if (error || data?.erro) {
      setMensagem(await erroDaFuncao(error, data) || 'Erro na busca. Confira as chaves de API em Gestão.')
      return
    }
    setResultados(data.resultados || [])
    setMarcados(new Set((data.resultados || []).map((_, i) => i)))
    if (!data.resultados?.length) {
      setMensagem(data.pulados_ja_na_base > 0
        ? `Tudo que o Google devolveu (${data.pulados_ja_na_base}) você já tem na base — tente outra cidade ou outro termo.`
        : 'Nada encontrado para essa busca.')
    } else if (data.pulados_ja_na_base > 0) {
      setMensagem(`${data.pulados_ja_na_base} já estavam na base e foram pulados — estes são novos.`)
    }
  }

  function alternar(i) {
    const novo = new Set(marcados)
    novo.has(i) ? novo.delete(i) : novo.add(i)
    setMarcados(novo)
  }

  function remover(i) {
    setResultados(resultados.filter((_, j) => j !== i))
    setMarcados(new Set([...marcados].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))))
    setImportados(new Set([...importados].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))))
  }

  async function importar() {
    const user = (await supabase.auth.getUser()).data.user
    const indices = [...marcados].filter((i) => !importados.has(i))
    const escolhidos = indices.map((i) => ({
      // dono: quem prospecta fica com o contato só para si (regra de 18/08)
      ...resultados[i], origem: 'maps', criado_por: user.id, dono: user.id,
    }))
    if (!escolhidos.length) return
    const { error } = await supabase.from('leads')
      .upsert(escolhidos, { onConflict: 'maps_place_id', ignoreDuplicates: true })
    if (error) { setMensagem('Erro ao importar.'); return }
    if (listaDestino) {
      const placeIds = escolhidos.map((r) => r.maps_place_id).filter(Boolean)
      if (placeIds.length) {
        const { data: ids } = await supabase.from('leads').select('id').in('maps_place_id', placeIds)
        if (ids?.length) await supabase.rpc('lista_adicionar_leads',
          { _lista: listaDestino, _leads: ids.map((x) => x.id) })
      }
    }
    setImportados(new Set([...importados, ...indices]))
    setMensagem(`${escolhidos.length} lead(s) importados — a lista continua aqui para você conferir. Quem já é cliente (convertido) é bloqueado automaticamente.`)
  }

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <button onClick={aoVoltar} className="text-sm text-ink-2">← Voltar</button>

      {/* três jeitos de alimentar o funil: buscar no Maps, digitar, ou subir planilha */}
      <div className="flex gap-1.5">
        {[['maps', 'Maps'], ['manual', 'Manual'], ['planilha', 'Planilha']].map(([id, rotulo]) => (
          <button key={id} onClick={() => setModoProsp(id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition ${
              modoProsp === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {listasProsp.length > 0 && (
        <select value={listaDestino} onChange={(e) => setListaDestino(e.target.value)}
          className="w-full rounded-lg bg-surface-2 border border-line px-2 py-2 text-sm outline-none">
          <option value="">Sem lista — vai só para a fila geral</option>
          {listasProsp.map((l) => <option key={l.id} value={l.id}>Adicionar à lista: {l.nome}</option>)}
        </select>
      )}

      {modoProsp === 'manual' && <CadastroManual aoAbrirLead={aoAbrirLead} listaDestino={listaDestino} />}
      {modoProsp === 'planilha' && <ImportarPlanilha aoAbrirLead={aoAbrirLead} listaDestino={listaDestino} />}

      {modoProsp === 'maps' && (
      <form onSubmit={buscar} className={`${caixa} p-4 space-y-3`}>
        <h2 className="font-semibold">Prospectar no Google Maps</h2>
        <input required placeholder="Nicho (ex.: clínica odontológica)" value={nicho} onChange={(e) => setNicho(e.target.value)} className={campo} />
        <div className="flex gap-2">
          <input required placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} />
          <input placeholder="UF" value={estado} maxLength={2} onChange={(e) => setEstado(e.target.value.toUpperCase())} className={`${campo.replace('w-full ', '')} w-20`} />
        </div>
        <button disabled={buscando} className="w-full rounded-lg bg-sinal py-2.5 font-semibold text-white disabled:opacity-50">
          {buscando ? 'Buscando…' : 'Buscar empresas'}
        </button>
      </form>
      )}
      {modoProsp === 'maps' && mensagem && <p className="text-sm text-amber">{mensagem}</p>}

      {modoProsp === 'maps' && resultados.length > 0 && (
        <>
          <button onClick={importar}
            disabled={[...marcados].filter((i) => !importados.has(i)).length === 0}
            className="w-full rounded-xl bg-sinal py-3 font-bold text-white disabled:opacity-40">
            Importar {[...marcados].filter((i) => !importados.has(i)).length} selecionado(s)
          </button>
          <div className="space-y-2">
            {resultados.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 ${caixa} px-4 py-3 ${importados.has(i) ? 'opacity-70 border-sinal/40' : ''}`}>
                {importados.has(i) ? (
                  <span className="mt-0.5 text-sinal font-bold">✓</span>
                ) : (
                  <input type="checkbox" checked={marcados.has(i)} onChange={() => alternar(i)} className="mt-1" />
                )}
                <span className="flex-1 cursor-pointer" role="button" onClick={() => abrirFicha(r)}
                  title="Abrir a ficha desta empresa">
                  <span className="block font-medium">
                    {r.empresa}
                    {importados.has(i) && <span className="text-xs text-sinal font-normal"> · importado</span>}
                  </span>
                  <span className="block text-xs text-ink-2">
                    {r.telefone ? formatarFone(r.telefone) : 'sem telefone'}
                    {r.avaliacao ? ` · ★ ${r.avaliacao}` : ''}
                  </span>
                  {r.endereco && <span className="block text-xs text-ink-3">{r.endereco}</span>}
                  {importados.has(i) && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-sinal border border-sinal/40 rounded-full px-2 py-0.5">
                      Abrir ficha
                    </span>
                  )}
                </span>
                {!importados.has(i) && (
                  <button onClick={() => remover(i)} className="text-ink-3 text-sm px-1" title="Tirar da lista">✕</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ───────────────── Cadastro manual e planilha ─────────────────
// A pessoa preenche o que tiver: só empresa é obrigatória. Instagram, CNPJ e
// e-mail não são colunas da tabela — moram no dossiê, onde o levantamento de
// dados e o Diagnóstico já os leem.

// Telefone BR, de qualquer jeito que vier, vira o formato de discagem:
// DDD + número. Tira DDI 55 e o "0" de discagem interurbana quando sobram;
// e quando é celular (DDD + 8 dígitos começando em 6-9) e falta o 9, insere.
function normalizarTelefoneBR(bruto) {
  let d = String(bruto || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)                    // DDI 55
  if ((d.length === 11 || d.length === 12) && d[0] === '0') d = d.slice(1)    // "0" de interurbano
  if (d.length === 10 && '6789'.includes(d[2])) d = d.slice(0, 2) + '9' + d.slice(2) // 9º dígito faltando
  return d
}

function montarLead(c, userId, origem) {
  const dossie = {}
  if (c.instagram) dossie.instagram = c.instagram.trim()
  if (c.cnpj) dossie.cnpj = c.cnpj.trim()
  if (c.email) dossie.email = c.email.trim()
  if (c.observacoes) dossie.observacoes = c.observacoes.trim()
  // Todo lead sai com o MESMO conjunto de chaves (valor ou null) — o insert
  // em lote do PostgREST rejeita o lote inteiro se um objeto tiver chaves
  // diferentes do outro (uma planilha real quase sempre tem linha sem cidade,
  // sem nicho etc.; isso sozinho zerava toda importação).
  const lead = { origem, criado_por: userId, status: 'novo' }
  for (const k of ['empresa', 'cidade', 'estado', 'nicho', 'site', 'endereco', 'contato_nome']) {
    lead[k] = (c[k] && String(c[k]).trim()) || null
  }
  lead.telefone = normalizarTelefoneBR(c.telefone) || null
  lead.dossie = Object.keys(dossie).length ? dossie : null
  return lead
}

// Botões que acompanham cada lead recém-criado: abrir a ficha ou já disparar
// o levantamento de dados públicos (mesmo botão que existe dentro da ficha).
function LeadCriado({ lead, aoAbrirLead }) {
  const [estado, setEstado] = useState('') // '' | levantando | ok | erro
  const [msgErro, setMsgErro] = useState('')
  async function levantar() {
    setEstado('levantando'); setMsgErro('')
    const { data, error } = await supabase.functions.invoke('enriquecer', { body: { lead_id: lead.id } })
    if (!error && data?.ok) { setEstado('ok'); return }
    setEstado('erro')
    setMsgErro(await erroDaFuncao(error, data) || 'Falhou — tente de novo.')
  }
  return (
    <div className={`flex items-center gap-2 ${caixa} px-3 py-2`}>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{lead.empresa}</span>
        <span className="block text-[11px] text-ink-3">
          {lead.telefone ? formatarFone(lead.telefone) : 'sem telefone'}
          {lead.dossie?.instagram ? ` · ${lead.dossie.instagram}` : ''}
        </span>
        {msgErro && <span className="block text-[11px] text-amber">{msgErro}</span>}
      </span>
      <button onClick={() => aoAbrirLead?.(lead)}
        className="shrink-0 text-[11px] font-semibold text-sinal border border-sinal/40 rounded-full px-2.5 py-1">
        Ficha
      </button>
      <button onClick={levantar} disabled={estado === 'levantando' || estado === 'ok'}
        className="shrink-0 text-[11px] font-semibold text-sky border border-sky/40 rounded-full px-2.5 py-1 disabled:opacity-60">
        {estado === 'levantando' ? 'Levantando…' : estado === 'ok' ? '✓ Levantado' : estado === 'erro' ? '↻ Tentar de novo' : 'Levantar dados'}
      </button>
    </div>
  )
}

function CadastroManual({ aoAbrirLead, listaDestino }) {
  const vazio = { empresa: '', telefone: '', cidade: '', estado: '', nicho: '', site: '', instagram: '', cnpj: '', email: '', contato_nome: '', observacoes: '' }
  const [c, setC] = useState(vazio)
  const [salvando, setSalvando] = useState(false)
  const [criados, setCriados] = useState([])
  const [msg, setMsg] = useState('')
  const muda = (k) => (e) => setC({ ...c, [k]: e.target.value })

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true); setMsg('')
    const user = (await supabase.auth.getUser()).data.user
    const { data, error } = await supabase.from('leads')
      .insert(montarLead(c, user.id, 'manual')).select().single()
    setSalvando(false)
    if (error) { setMsg('Erro ao salvar — confira os dados.'); return }
    if (listaDestino && data?.id) {
      await supabase.rpc('lista_adicionar_leads', { _lista: listaDestino, _leads: [data.id] })
    }
    setCriados([data, ...criados])
    setC(vazio)
    setMsg(listaDestino ? '✓ Lead cadastrado — já está na lista e na fila de discagem.'
      : '✓ Lead cadastrado — já está na Fila do CRM.')
  }

  return (
    <div className="space-y-3">
      <form onSubmit={salvar} className={`${caixa} p-4 space-y-2`}>
        <h2 className="font-semibold">Cadastrar lead manualmente</h2>
        <p className="text-[11px] text-ink-3">Só o nome da empresa é obrigatório — preencha o que tiver.</p>
        <input required placeholder="Empresa *" value={c.empresa} onChange={muda('empresa')} className={campo} />
        <div className="flex gap-2">
          <input placeholder="Telefone / WhatsApp" value={c.telefone} onChange={muda('telefone')} className={campo} />
          <input placeholder="Contato (nome)" value={c.contato_nome} onChange={muda('contato_nome')} className={campo} />
        </div>
        <div className="flex gap-2">
          <input placeholder="Cidade" value={c.cidade} onChange={muda('cidade')} className={campo} />
          <input placeholder="UF" maxLength={2} value={c.estado}
            onChange={(e) => setC({ ...c, estado: e.target.value.toUpperCase() })} className={`${campo.replace('w-full ', '')} w-20`} />
        </div>
        <div className="flex gap-2">
          <input placeholder="Nicho (ex.: energia solar)" value={c.nicho} onChange={muda('nicho')} className={campo} />
          <input placeholder="CNPJ" value={c.cnpj} onChange={muda('cnpj')} className={campo} />
        </div>
        <div className="flex gap-2">
          <input placeholder="Instagram (@perfil)" value={c.instagram} onChange={muda('instagram')} className={campo} />
          <input placeholder="E-mail" type="email" value={c.email} onChange={muda('email')} className={campo} />
        </div>
        <input placeholder="Site" value={c.site} onChange={muda('site')} className={campo} />
        <input placeholder="Observações" value={c.observacoes} onChange={muda('observacoes')} className={campo} />
        <button disabled={salvando || !c.empresa.trim()}
          className="w-full rounded-lg bg-sinal py-2.5 font-semibold text-white disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Cadastrar lead'}
        </button>
      </form>
      {msg && <p className="text-sm text-sinal">{msg}</p>}
      {criados.map((l) => <LeadCriado key={l.id} lead={l} aoAbrirLead={aoAbrirLead} />)}
    </div>
  )
}

// ───── planilha: aceita .csv (Excel/Sheets → exportar) e .xlsx direto ─────
// Reconhece as colunas pelo cabeçalho, sem exigir ordem nem nome exato.
const COLUNAS_PLANILHA = {
  // ordem não importa mais para o casamento (ver mapearCabecalho): quando
  // duas colunas batem no mesmo cabeçalho, vence o apelido mais específico —
  // "nome do contato" não cai mais em "empresa" só por conter "nome".
  empresa: ['empresa', 'nome fantasia', 'razao social', 'nome da empresa', 'nome do negocio',
    'nome do estabelecimento', 'estabelecimento', 'negocio', 'company', 'business name', 'nome'],
  telefone: ['telefone comercial', 'contato telefone', 'numero whatsapp', 'whatsapp numero',
    'telefone whatsapp', 'numero de telefone', 'phone number', 'telefone', 'whatsapp', 'celular',
    'fone', 'zap', 'tel', 'numero', 'número', 'phone', 'mobile', 'cel'],
  cidade: ['cidade', 'municipio', 'município', 'city'],
  estado: ['estado', 'sigla uf', 'uf', 'state'],
  nicho: ['tipo de negocio', 'categoria de negocio', 'nicho', 'segmento', 'ramo', 'categoria',
    'atividade', 'niche', 'setor', 'industry'],
  site: ['website', 'homepage', 'pagina', 'página', 'site', 'link', 'url'],
  instagram: ['instagram', 'insta', 'rede social', 'perfil', 'ig'],
  cnpj: ['cnpj', 'documento'],
  email: ['e-mail', 'e mail', 'correio eletronico', 'email', 'mail'],
  endereco: ['endereco', 'endereço', 'logradouro', 'localizacao', 'address', 'rua'],
  contato_nome: ['nome do contato', 'nome contato', 'responsavel', 'responsável', 'proprietario',
    'proprietaria', 'decisor', 'atendente', 'contato', 'dono'],
  observacoes: ['observacoes', 'observações', 'anotacoes', 'comentarios', 'comentários',
    'informacoes', 'descricao', 'descrição', 'observacao', 'notas', 'obs', 'info'],
}
const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

// Casa cada cabeçalho com o campo nosso mais específico — quando mais de um
// apelido bate no mesmo título ("nome do contato" contém tanto "nome" quanto
// "contato"), vence o apelido mais comprido, não o primeiro campo da lista.
function mapearCabecalho(cabecalho) {
  const mapa = {}
  cabecalho.forEach((titulo, i) => {
    const t = semAcento(titulo)
    if (!t) return
    let melhor = null
    for (const [campo, apelidos] of Object.entries(COLUNAS_PLANILHA)) {
      for (const a of apelidos) {
        if ((t === a || t.includes(a)) && (!melhor || a.length > melhor.tam)) melhor = { campo, tam: a.length }
      }
    }
    if (melhor) mapa[i] = melhor.campo
  })
  return mapa
}

// Fallback para planilhas sem cabeçalho reconhecível: olha o CONTEÚDO das
// células (até 30 linhas de amostra) — coluna majoritariamente "dígitos
// parecidos com telefone" vira telefone; a primeira coluna de texto livre
// (não e-mail, não link) que sobrar vira empresa. Cobre arquivo com só duas
// colunas soltas, sem título, na ordem que for.
function celulaPareceTelefone(v) {
  const limpo = String(v ?? '').replace(/[\s().\-+]/g, '')
  return /^\d{8,13}$/.test(limpo)
}
function detectarColunasPorConteudo(linhas) {
  const nCols = linhas.reduce((m, l) => Math.max(m, l.length), 0)
  const amostra = linhas.slice(0, 30)
  let colTelefone = -1, melhorTel = 0
  for (let c = 0; c < nCols; c++) {
    const vals = amostra.map((l) => l[c]).filter((v) => v && String(v).trim())
    if (vals.length < 2) continue
    const score = vals.filter(celulaPareceTelefone).length / vals.length
    if (score > 0.6 && score > melhorTel) { melhorTel = score; colTelefone = c }
  }
  let colEmpresa = -1
  for (let c = 0; c < nCols; c++) {
    if (c === colTelefone) continue
    const vals = amostra.map((l) => l[c]).filter((v) => v && String(v).trim())
    if (vals.length < 2) continue
    const score = vals.filter((v) => /[a-zA-Zà-úÀ-Ú]{2,}/.test(String(v))
      && !/@/.test(String(v)) && !/^https?:/i.test(String(v))).length / vals.length
    if (score > 0.6) { colEmpresa = c; break }
  }
  return { colTelefone, colEmpresa }
}

// CSV honesto: aspas, vírgula OU ponto-e-vírgula (Excel BR exporta com ;)
function lerCsv(texto) {
  const semBom = texto.replace(/^\ufeff/, '')
  const sep = (semBom.split('\n')[0].match(/;/g) || []).length >
    (semBom.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  const linhas = []
  let linha = [], celula = '', dentroAspas = false
  for (let i = 0; i < semBom.length; i++) {
    const ch = semBom[i]
    if (dentroAspas) {
      if (ch === '"' && semBom[i + 1] === '"') { celula += '"'; i++ }
      else if (ch === '"') dentroAspas = false
      else celula += ch
    } else if (ch === '"') dentroAspas = true
    else if (ch === sep) { linha.push(celula); celula = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && semBom[i + 1] === '\n') i++
      linha.push(celula); celula = ''
      if (linha.some((c) => c.trim())) linhas.push(linha)
      linha = []
    } else celula += ch
  }
  linha.push(celula)
  if (linha.some((c) => c.trim())) linhas.push(linha)
  return linhas
}

function ImportarPlanilha({ aoAbrirLead, listaDestino }) {
  const [processando, setProcessando] = useState(false)
  const [criados, setCriados] = useState([])
  const [msg, setMsg] = useState('')
  const [categoria, setCategoria] = useState('')
  const [nichosSugeridos, setNichosSugeridos] = useState([])

  // categorias já em uso, para sugerir (e reaproveitar) em vez de duplicar
  useEffect(() => {
    supabase.rpc('nichos_disponiveis').then(({ data }) => setNichosSugeridos(data || []))
  }, [])

  async function receber(e) {
    const arq = e.target.files?.[0]
    e.target.value = '' // permite subir o mesmo arquivo de novo
    if (!arq) return
    setProcessando(true); setMsg(''); setCriados([])
    try {
      let linhas
      if (/\.(xlsx|xls)$/i.test(arq.name)) {
        const XLSX = await import('xlsx') // só baixa a biblioteca quando precisa
        const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' })
        linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
          .map((l) => l.map((c) => String(c ?? '')))
          .filter((l) => l.some((c) => c.trim()))
      } else {
        linhas = lerCsv(await arq.text())
      }
      if (!linhas || linhas.length < 1) { setMsg('Planilha vazia ou sem linhas de dados.'); setProcessando(false); return }

      let mapa = mapearCabecalho(linhas[0])
      let dadosLinhas = linhas.slice(1)
      // primeira linha não tinha cabeçalho reconhecível (ou é a própria
      // primeira linha de dados) — tenta identificar as colunas pelo conteúdo
      if (!Object.values(mapa).includes('empresa') && !Object.values(mapa).includes('telefone')) {
        const { colTelefone, colEmpresa } = detectarColunasPorConteudo(linhas)
        if (colTelefone >= 0 || colEmpresa >= 0) {
          mapa = {}
          if (colTelefone >= 0) mapa[colTelefone] = 'telefone'
          if (colEmpresa >= 0) mapa[colEmpresa] = 'empresa'
          dadosLinhas = linhas // sem cabeçalho: a 1ª linha também é dado
        }
      }
      if (!Object.values(mapa).includes('empresa') && !Object.values(mapa).includes('telefone')) {
        setMsg('Não encontrei nome nem telefone no arquivo — confira se essas informações estão nele.')
        setProcessando(false); return
      }

      const user = (await supabase.auth.getUser()).data.user
      const vistos = new Set()
      const candidatos = []
      let puladas = 0
      for (const l of dadosLinhas) {
        const c = {}
        for (const [i, campo] of Object.entries(mapa)) {
          if (l[i] && String(l[i]).trim()) c[campo] = String(l[i])
        }
        const lead = montarLead(c, user.id, 'planilha')
        if (!lead.nicho && categoria.trim()) lead.nicho = categoria.trim()
        lead.lote_importacao = arq.name
        if (!lead.empresa && !lead.telefone) { puladas++; continue }
        if (!lead.empresa) lead.empresa = formatarFone(lead.telefone) // nunca sem nome na lista
        const chave = lead.telefone || semAcento(lead.empresa)
        if (vistos.has(chave)) { puladas++; continue } // repetida dentro do arquivo
        vistos.add(chave)
        candidatos.push(lead)
      }

      // não duplica quem já está na base (pelo telefone)
      const tels = candidatos.map((c) => c.telefone).filter(Boolean)
      const jaExistem = new Set()
      for (let i = 0; i < tels.length; i += 200) {
        const { data } = await supabase.from('leads').select('telefone').in('telefone', tels.slice(i, i + 200))
        for (const x of data || []) jaExistem.add(x.telefone)
      }
      const novos = candidatos.filter((c) => !c.telefone || !jaExistem.has(c.telefone))

      const inseridos = []
      let erroGravar = ''
      for (let i = 0; i < novos.length; i += 100) {
        const { data, error } = await supabase.from('leads').insert(novos.slice(i, i + 100)).select()
        if (error) { erroGravar = error.message; break }
        inseridos.push(...(data || []))
      }
      if (listaDestino && inseridos.length) {
        await supabase.rpc('lista_adicionar_leads',
          { _lista: listaDestino, _leads: inseridos.map((x) => x.id) })
      }
      setCriados(inseridos)
      if (erroGravar) {
        setMsg(`Gravei ${inseridos.length} e travei num erro: ${erroGravar}`)
      } else {
        const partes = [listaDestino
          ? `${inseridos.length} lead(s) cadastrados — já estão na lista e na fila de discagem`
          : `${inseridos.length} lead(s) cadastrados — já estão na Fila do CRM e em "Importados" no Discador`]
        if (categoria.trim()) partes.push(`categoria "${categoria.trim()}" aplicada a quem veio sem nicho`)
        if (candidatos.length - novos.length > 0) partes.push(`${candidatos.length - novos.length} já existiam (mesmo telefone)`)
        if (puladas > 0) partes.push(`${puladas} linha(s) puladas (sem empresa/telefone ou repetidas)`)
        setMsg(partes.join(' · '))
      }
    } catch (err) {
      setMsg(`Não consegui ler o arquivo: ${err.message}`)
    }
    setProcessando(false)
  }

  return (
    <div className="space-y-3">
      <div className={`${caixa} p-4 space-y-2`}>
        <h2 className="font-semibold">Importar planilha</h2>
        <p className="text-[11px] text-ink-3">
          Aceita <b>.xlsx</b> (Excel) e <b>.csv</b> (no Google Sheets: Arquivo → Fazer download → CSV).
          Reconheço cabeçalhos como <b>empresa, telefone, cidade, UF, nicho, site, instagram, cnpj,
          e-mail, endereço, contato e observações</b> em qualquer ordem — e se o arquivo não tiver
          cabeçalho nenhum, identifico nome e telefone pelo conteúdo das próprias colunas. Telefone
          sem o 9º dígito é corrigido automaticamente. Cada um preenche o que tiver; ao enviar, os
          leads já entram cadastrados.
        </p>
        <div>
          <label className="block text-[11px] font-semibold text-ink-2 mb-1">
            Categoria (nicho) desta planilha
          </label>
          <input list="categorias-planilha" value={categoria} onChange={(e) => setCategoria(e.target.value)}
            placeholder="ex.: energia solar — ou escolha uma já usada" className={campo} />
          <datalist id="categorias-planilha">
            {nichosSugeridos.map((n) => <option key={n.nicho} value={n.nicho} />)}
          </datalist>
          <p className="text-[11px] text-ink-3 mt-1">
            Se a planilha já tiver a coluna "nicho", ela manda linha a linha — isso aqui só preenche
            quem vier em branco. O nome do arquivo enviado também aparece em "Importados" no Discador,
            para puxar contatos só desta planilha.
          </p>
        </div>
        <label className={`block w-full rounded-lg py-3 text-center text-sm font-semibold cursor-pointer ${
          processando ? 'bg-surface-2 text-ink-3' : 'bg-sinal text-white'}`}>
          {processando ? 'Lendo e cadastrando…' : 'Escolher arquivo (.xlsx ou .csv)'}
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden" disabled={processando} onChange={receber} />
        </label>
      </div>
      {msg && <p className="text-sm text-sinal">{msg}</p>}
      {criados.length > 0 && (
        <p className="text-[11px] text-ink-3">
          Toque em para o levantamento de dados públicos de cada um (leva ~1 min por lead).
        </p>
      )}
      {criados.map((l) => <LeadCriado key={l.id} lead={l} aoAbrirLead={aoAbrirLead} />)}
    </div>
  )
}

function formatarFone(f) {
  const n = (f || '').replace(/\D/g, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return f
}
function formatarData(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Implementação do cliente novo: material bruto (conversa de WhatsApp
// exportada, textos, tabelas) vira base de conhecimento na Babel dele.
function Implementacao({ lead, aoFeito }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')

  function lerArquivo(e) {
    const arq = e.target.files?.[0]
    if (!arq) return
    const leitor = new FileReader()
    leitor.onload = () => setTexto((t) => (t ? t + '\n\n' : '') + String(leitor.result || ''))
    leitor.readAsText(arq, 'utf-8')
  }

  async function enviar() {
    setEnviando(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('babelos', {
      body: {
        acao: 'semear_conhecimento',
        lead_id: lead.id,
        user_id: lead.babel_user_id,
        texto_bruto: texto,
      },
    })
    setEnviando(false)
    if (error || !data?.ok) { setMsg(data?.erro || 'Falha ao processar o material.'); return }
    setMsg(`✓ ${data.blocos_criados} bloco(s) de conhecimento criados na Babel do cliente — a curadoria refina o resto.`)
    setTexto('')
    aoFeito?.()
  }

  return (
    <div className={`${caixa} p-3 space-y-2`}>
      <p className="text-sm font-semibold">Implementação — base de conhecimento</p>
      <p className="text-[11px] text-ink-3">
        Cole uma conversa de WhatsApp exportada (.txt), textos do site, tabela de preços —
        a IA transforma em blocos e envia direto para a Babel do cliente.
      </p>
      <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="Cole aqui o material bruto do cliente…" className={campo} />
      <div className="flex gap-2">
        <label className={`flex-1 ${caixa} py-2 text-center text-xs font-semibold cursor-pointer text-ink-2`}>
          Anexar .txt
          <input type="file" accept=".txt,text/plain" className="hidden" onChange={lerArquivo} />
        </label>
        <button onClick={enviar} disabled={enviando || texto.trim().length < 40}
          className="flex-[2] rounded-lg bg-sinal py-2 text-sm font-bold text-white disabled:opacity-40">
          {enviando ? 'Processando com IA…' : 'Processar e enviar'}
        </button>
      </div>
      {msg && <p className="text-xs text-sinal">{msg}</p>}
    </div>
  )
}
