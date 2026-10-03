import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import GestaoFunis from './GestaoFunis'
import { iniciarPonte } from '../lib/ponte'
import Equipe from './Equipe'
import { PERGUNTAS_PADRAO, chaveDaPergunta, carregarPerguntas } from '../lib/perguntas-call'
import { ROTEIRO_PADRAO, carregarRoteiro, normalizarRoteiro } from '../lib/roteiro-call'
import GestaoWhatsapp from './GestaoWhatsapp'

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal'

const SECOES = [
  { id: 'operacao', rotulo: 'Operação' },
  { id: 'equipe', rotulo: 'Equipe' },
  { id: 'mentoria', rotulo: 'Mentoria' },
  { id: 'scripts', rotulo: 'Scripts' },
  { id: 'whatsapp', rotulo: 'WhatsApp' },
  { id: 'chaves', rotulo: 'Chaves' },
]

export default function Gestao() {
  const [secao, setSecao] = useState('operacao')
  return (
    <div className="max-w-lg md:max-w-3xl mx-auto">
      <div className="flex gap-1.5 p-4 pb-0">
        {SECOES.map((s) => (
          <button key={s.id} onClick={() => setSecao(s.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold border ${
              secao === s.id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {s.rotulo}
          </button>
        ))}
      </div>
      {secao === 'operacao' && <Operacao />}
      {secao === 'equipe' && <Equipe />}
      {secao === 'mentoria' && <><GestaoFunis /><PerguntasCall /><RoteiroCall /></>}
      {secao === 'scripts' && <Scripts />}
      {secao === 'whatsapp' && <GestaoWhatsapp />}
      {secao === 'chaves' && <Chaves />}
    </div>
  )
}

// Perguntas da call — o que o mentor pergunta na qualificação do trilho da
// sala de reunião, na ordem escolhida. Resposta vai pro dossiê e pra
// biblioteca da conta criada na Babel OS.
function PerguntasCall() {
  const [lista, setLista] = useState(PERGUNTAS_PADRAO)
  const [salvo, setSalvo] = useState('')

  useEffect(() => {
    carregarPerguntas(supabase).then(setLista)
  }, [])

  function set(i, k, v) { setLista(lista.map((p, j) => (j === i ? { ...p, [k]: v } : p))) }
  function mover(i, dir) {
    const j = i + dir
    if (j < 0 || j >= lista.length) return
    const nova = [...lista]; [nova[i], nova[j]] = [nova[j], nova[i]]; setLista(nova)
  }
  async function salvar() {
    const limpa = lista
      .filter((p) => p.rotulo?.trim())
      .map((p) => ({ ...p, rotulo: p.rotulo.trim(), chave: p.chave || chaveDaPergunta(p.rotulo) }))
    setLista(limpa)
    const { error } = await supabase.from('config').upsert(
      { chave: 'perguntas_call', valor: JSON.stringify(limpa), atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' })
    setSalvo(error ? 'Erro ao salvar.' : 'Perguntas salvas — já valem na próxima call.')
    setTimeout(() => setSalvo(''), 4000)
  }

  return (
    <div className="p-4 pt-2">
      <div className="rounded-2xl bg-surface border border-line p-4 space-y-3">
        <div>
          <p className="font-bold">Perguntas da call</p>
          <p className="text-xs text-ink-2">
            O que aparece na qualificação da sala de reunião, na ordem. Cada
            resposta entra no dossiê do lead e na biblioteca da Babel OS dele.
          </p>
        </div>
        {lista.map((p, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input value={p.rotulo} placeholder="Pergunta"
              onChange={(e) => set(i, 'rotulo', e.target.value)}
              className="flex-1 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
            <select value={p.tipo || 'curta'} onChange={(e) => set(i, 'tipo', e.target.value)}
              className="rounded-lg bg-surface-2 border border-line px-2 py-2 text-xs">
              <option value="curta">curta</option>
              <option value="longa">longa</option>
            </select>
            <button onClick={() => mover(i, -1)} className="text-ink-3 text-xs px-1">↑</button>
            <button onClick={() => mover(i, 1)} className="text-ink-3 text-xs px-1">↓</button>
            <button onClick={() => setLista(lista.filter((_, j) => j !== i))}
              className="text-danger text-sm px-1">✕</button>
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={() => setLista([...lista, { chave: '', rotulo: '', tipo: 'curta' }])}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink-2">+ Pergunta</button>
          <button onClick={salvar}
            className="flex-1 rounded-lg bg-sinal py-2 font-semibold text-sm text-white">
            Salvar perguntas
          </button>
        </div>
        {salvo && <p className="text-xs text-sinal">{salvo}</p>}
      </div>
    </div>
  )
}

function RoteiroCall() {
  const [partes, setPartes] = useState(ROTEIRO_PADRAO)
  const [salvo, setSalvo] = useState('')

  useEffect(() => { carregarRoteiro(supabase).then(setPartes) }, [])

  const trocarParte = (i, k, v) => setPartes(partes.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const trocarPasso = (i, j, k, v) => setPartes(partes.map((p, x) => (x !== i ? p : {
    ...p, passos: p.passos.map((s2, y) => (y === j ? { ...s2, [k]: v } : s2)),
  })))
  function moverPasso(i, j, dir) {
    const k = j + dir
    const p = partes[i]
    if (k < 0 || k >= p.passos.length) return
    const passos = [...p.passos]; [passos[j], passos[k]] = [passos[k], passos[j]]
    setPartes(partes.map((x, y) => (y === i ? { ...x, passos } : x)))
  }
  const removerPasso = (i, j) => setPartes(partes.map((p, x) => (
    x === i ? { ...p, passos: p.passos.filter((_, y) => y !== j) } : p)))
  const novoPasso = (i) => setPartes(partes.map((p, x) => (
    x === i ? { ...p, passos: [...p.passos, { de: 'voce', titulo: '', fala: '' }] } : p)))

  async function salvar() {
    const limpo = normalizarRoteiro(partes)
    if (!limpo) { setSalvo('Cada parte precisa de um nome e ao menos uma fala.'); return }
    setPartes(limpo)
    const { error } = await supabase.from('config').upsert(
      { chave: 'roteiro_call', valor: JSON.stringify(limpo), atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' })
    setSalvo(error ? 'Erro ao salvar.' : 'Roteiro salvo — vale já na próxima ligação da equipe.')
    setTimeout(() => setSalvo(''), 5000)
  }

  async function restaurar() {
    if (!window.confirm('Voltar ao roteiro original da Babel? O que você escreveu se perde.')) return
    setPartes(ROTEIRO_PADRAO)
    await supabase.from('config').upsert(
      { chave: 'roteiro_call', valor: JSON.stringify(ROTEIRO_PADRAO), atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' })
    setSalvo('Roteiro de fábrica restaurado.')
    setTimeout(() => setSalvo(''), 5000)
  }

  return (
    <div className="p-4 pt-2">
      <div className="rounded-2xl bg-surface border border-line p-4 space-y-4">
        <div>
          <p className="font-bold">Roteiro da ligação</p>
          <p className="text-xs text-ink-2">
            O que a equipe lê na tela durante a chamada, nos dois botões. Marque
            quem fala cada linha: <b>você</b> aparece em destaque para ler em voz
            alta e <b>a outra pessoa</b> fica apagada, só como deixa. Nas frases
            valem <b>{'{vendedor}'}</b>, <b>{'{decisor}'}</b> e <b>{'{empresa}'}</b>,
            trocados na hora da ligação.
          </p>
        </div>

        {partes.map((parte, i) => (
          <div key={parte.id || i} className="rounded-xl border border-line p-3 space-y-2.5">
            <div className="flex gap-2">
              <input value={parte.rotulo} placeholder="Nome do botão (ex.: Atendente)"
                onChange={(e) => trocarParte(i, 'rotulo', e.target.value)}
                className="flex-[2] min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm font-semibold outline-none focus:border-sinal" />
              <input value={parte.resumo} placeholder="Objetivo (ex.: passar pelo filtro)"
                onChange={(e) => trocarParte(i, 'resumo', e.target.value)}
                className="flex-[2] min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-xs outline-none focus:border-sinal" />
            </div>

            {parte.passos.map((passo, j) => (
              <div key={j} className="flex gap-2 items-start">
                <select value={passo.de} onChange={(e) => trocarPasso(i, j, 'de', e.target.value)}
                  title="Quem fala esta linha"
                  className="shrink-0 rounded-lg bg-surface-2 border border-line px-2 py-2 text-xs">
                  <option value="voce">você fala</option>
                  <option value="eles">eles falam</option>
                </select>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input value={passo.titulo} placeholder="Título do passo (ex.: Abertura de impacto)"
                    onChange={(e) => trocarPasso(i, j, 'titulo', e.target.value)}
                    className="w-full rounded-lg bg-surface-2 border border-line px-3 py-1.5 text-xs outline-none focus:border-sinal" />
                  <textarea value={passo.fala} rows={2} placeholder="A frase"
                    onChange={(e) => trocarPasso(i, j, 'fala', e.target.value)}
                    className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal resize-y" />
                </div>
                <div className="shrink-0 flex flex-col items-center">
                  <button onClick={() => moverPasso(i, j, -1)} className="text-ink-3 text-xs px-1">↑</button>
                  <button onClick={() => moverPasso(i, j, 1)} className="text-ink-3 text-xs px-1">↓</button>
                  <button onClick={() => removerPasso(i, j)} className="text-danger text-sm px-1">✕</button>
                </div>
              </div>
            ))}

            <button onClick={() => novoPasso(i)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2">+ Passo</button>
          </div>
        ))}

        <div className="flex gap-2">
          <button onClick={restaurar}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink-2">Voltar ao original</button>
          <button onClick={salvar}
            className="flex-1 rounded-lg bg-sinal py-2 font-semibold text-sm text-white">
            Salvar roteiro
          </button>
        </div>
        {salvo && <p className="text-xs text-sinal">{salvo}</p>}
      </div>
    </div>
  )
}

function Operacao() {
  const [maximo, setMaximo] = useState('')
  const [salvo, setSalvo] = useState('')
  const [posvendaDias, setPosvendaDias] = useState('')
  const [salvoPosvenda, setSalvoPosvenda] = useState('')
  const [emLigacao, setEmLigacao] = useState([])
  const [perfis, setPerfis] = useState({})
  const [equipe, setEquipe] = useState([])
  const [implementador, setImplementador] = useState('')
  const [salvoImpl, setSalvoImpl] = useState('')

  useEffect(() => {
    supabase.from('config').select('valor').eq('chave', 'max_simultaneas').single()
      .then(({ data }) => setMaximo(data?.valor || '15'))
    supabase.from('config').select('valor').eq('chave', 'posvenda_dias_padrao').maybeSingle()
      .then(({ data }) => setPosvendaDias(data?.valor || '30'))
    supabase.from('profiles').select('ramal, nome, avatar_url')
      .then(({ data }) => {
        const mapa = {}
        for (const p of data || []) mapa[p.ramal] = p
        setPerfis(mapa)
      })
  }, [])

  // quem está em ligação agora (o servidor publica a cada ~20s)
  useEffect(() => {
    async function ler() {
      const { data } = await supabase.from('config').select('valor, atualizado_em')
        .eq('chave', 'em_ligacao').single()
      try { setEmLigacao(JSON.parse(data?.valor || '[]')) } catch { setEmLigacao([]) }
    }
    ler()
    const t = setInterval(ler, 10000)
    return () => clearInterval(t)
  }, [])

  // implementador: quem recebe o cliente novo após a venda na call
  useEffect(() => {
    supabase.from('profiles').select('user_id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setEquipe(data || []))
    supabase.from('config').select('valor').eq('chave', 'implementador').maybeSingle()
      .then(({ data }) => setImplementador(data?.valor || ''))
  }, [])

  async function salvarImplementador(valor) {
    setImplementador(valor)
    const { error } = await supabase.from('config').upsert(
      { chave: 'implementador', valor, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' },
    )
    setSalvoImpl(error ? 'Erro ao salvar.' : 'Implementador salvo — clientes novos vão para ele.')
    setTimeout(() => setSalvoImpl(''), 4000)
  }

  async function salvarMaximo(e) {
    e.preventDefault()
    const n = Math.max(1, Math.min(15, parseInt(maximo) || 2))
    setMaximo(String(n))
    const { error } = await supabase.from('config')
      .update({ valor: String(n), atualizado_em: new Date().toISOString() })
      .eq('chave', 'max_simultaneas')
    setSalvo(error ? 'Erro ao salvar.' : `Limite salvo: ${n} ligações simultâneas (aplica em ~20s).`)
  }

  // Pós-venda: de quanto em quanto tempo voltar a falar com o cliente novo.
  // Vale para clientes que ainda não têm cadência própria; cada registro de
  // contato pode ajustar o intervalo daquele cliente.
  async function salvarPosvenda(e) {
    e.preventDefault()
    const n = Math.max(1, Math.min(365, parseInt(posvendaDias) || 30))
    setPosvendaDias(String(n))
    const { error } = await supabase.from('config')
      .upsert({ chave: 'posvenda_dias_padrao', valor: String(n), atualizado_em: new Date().toISOString() })
    setSalvoPosvenda(error ? 'Erro ao salvar.' : `Cadência salva: contato a cada ${n} dias.`)
    setTimeout(() => setSalvoPosvenda(''), 4000)
  }

  return (
    <div className="p-4 space-y-4">
      <div className={`${caixa} p-4 space-y-2`}>
        <p className="text-sm font-semibold">Em ligação agora</p>
        {emLigacao.length === 0 && <p className="text-xs text-ink-3">Ninguém em ligação neste momento.</p>}
        {emLigacao.map((c, i) => {
          const p = perfis[c.ramal]
          return (
            <div key={i} className="flex items-center gap-3">
              {p?.avatar_url ? (
                <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-line" />
              ) : (
                <span className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-sm font-bold text-ink-2">
                  {(p?.nome || c.ramal)[0]?.toUpperCase()}
                </span>
              )}
              <span className="flex-1 text-sm">
                <b>{p?.nome || `Ramal ${c.ramal}`}</b>
                <span className="text-ink-2"> → {c.numero || '—'}</span>
              </span>
              <span className={`text-xs font-semibold ${c.em_chamada ? 'text-sinal' : 'text-amber'}`}>
                {c.em_chamada ? `● ${Math.floor(c.seg / 60)}:${String(c.seg % 60).padStart(2, '0')}` : 'chamando…'}
              </span>
            </div>
          )
        })}
        <p className="text-[10px] text-ink-3">Atualiza a cada ~20 segundos. Ligações por pessoa: veja o Placar → Raio-X.</p>
      </div>

      <form onSubmit={salvarMaximo} className={`${caixa} p-4 space-y-2`}>
        <p className="text-sm font-semibold">Linhas simultâneas (canais da BR-DID)</p>
        <p className="text-xs text-ink-2">
          Quantas ligações de saída podem acontecer ao mesmo tempo. Deixe igual ao número de
          <b> canais que você contratou no número (11) 5286-3430</b> — hoje são <b>2</b>.
          Quando comprar mais canais na BR-DID, aumente aqui e o sistema passa a permitir na hora.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMaximo(String(Math.max(1, (parseInt(maximo) || 2) - 1)))}
            className="w-10 h-10 rounded-lg border border-line text-lg font-bold text-ink-2">−</button>
          <input type="number" min={1} max={15} value={maximo} onChange={(e) => setMaximo(e.target.value)}
            className={`${campo.replace('w-full ', '')} w-20 text-center text-lg font-bold`} />
          <button type="button" onClick={() => setMaximo(String(Math.min(15, (parseInt(maximo) || 2) + 1)))}
            className="w-10 h-10 rounded-lg border border-line text-lg font-bold text-ink-2">+</button>
          <button className="flex-1 rounded-lg bg-sinal py-2.5 font-semibold text-white">Salvar</button>
        </div>
        <p className="text-[11px] text-ink-3">
          Ao atingir o limite, o próximo mentor vê <i>"Todas as linhas ocupadas — aguarde uma liberar"</i>
          {' '}em vez de a chamada cair sozinha. Aplica em ~20 segundos após salvar.
        </p>
        {salvo && <p className="text-xs text-sinal">{salvo}</p>}
      </form>

      <form onSubmit={salvarPosvenda} className={`${caixa} p-4 space-y-2`}>
        <p className="text-sm font-semibold">Pós-venda — cadência padrão</p>
        <p className="text-xs text-ink-2">
          De quanto em quanto tempo a equipe deve voltar a falar com um cliente fechado.
          Todo cliente novo entra nessa régua; o intervalo pode ser ajustado por cliente
          a cada contato registrado no CRM.
        </p>
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={365} value={posvendaDias} onChange={(e) => setPosvendaDias(e.target.value)}
            className={`${campo.replace('w-full ', '')} w-20 text-center text-lg font-bold`} />
          <span className="text-sm text-ink-2">dias</span>
          <button className="flex-1 rounded-lg bg-sinal py-2.5 font-semibold text-white">Salvar</button>
        </div>
        {salvoPosvenda && <p className="text-xs text-sinal">{salvoPosvenda}</p>}
      </form>

      <div className={`${caixa} p-4 space-y-2`}>
        <p className="text-sm font-semibold">Implementador (recebe o cliente após a venda)</p>
        <p className="text-xs text-ink-2">
          Quando o pagamento é validado na call, o lead vira cliente e é transferido
          para esta pessoa fazer a implementação (coleta de materiais + base de conhecimento).
        </p>
        <select value={implementador} onChange={(e) => salvarImplementador(e.target.value)}
          className={`${campo}`}>
          <option value="">— ninguém (fica com o mentor que fechou)</option>
          {equipe.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
        </select>
        {salvoImpl && <p className="text-xs text-sinal">{salvoImpl}</p>}
      </div>
    </div>
  )
}

const FLUXO_PADRAO = [
  { id: 'abertura', nome: 'Abertura', meta: 'Confirmar que fala com o responsável e prender a atenção' },
  { id: 'descoberta', nome: 'Descoberta', meta: 'Entender a situação e a dor atual do cliente' },
  { id: 'apresentacao', nome: 'Apresentação', meta: 'Conectar a solução à dor e despertar interesse' },
  { id: 'objecao', nome: 'Objeção', meta: 'Dissolver dúvidas e resistências' },
  { id: 'fechamento', nome: 'Fechamento', meta: 'Propor o agendamento da mentoria gratuita' },
  { id: 'confirmacao', nome: 'Confirmação', meta: 'Capturar dia e horário e encerrar' },
]

// Tipos de campanha — cada um pré-configura objetivo, abertura, fluxo e formulário
const TIPOS_CAMPANHA = {
  agendar: {
    rotulo: 'Agendar', dica: 'Marcar mentoria gratuita com o especialista',
    objetivo: 'Agendar uma mentoria gratuita com o especialista da empresa',
    abertura: '[alegre] Oi, tudo bem? Aqui é a Bel, da Babel! Falo com o responsável pela {empresa}?',
    fluxo: FLUXO_PADRAO,
    formulario: [
      { rotulo: 'nome_responsavel', pergunta: 'com quem eu falo?', obrigatorio: true },
      { rotulo: 'melhor_dia_horario', pergunta: 'qual o melhor dia e horário pra você?', obrigatorio: false },
      { rotulo: 'tem_interesse', pergunta: '', obrigatorio: false },
    ],
  },
  vender: {
    rotulo: 'Vender', dica: 'Fechar a venda na própria ligação',
    objetivo: 'Vender o produto/serviço nesta ligação ou garantir o compromisso de compra',
    abertura: '[alegre] Oi, tudo bem? Aqui é a Bel, da Babel! Falo com o responsável pela {empresa}?',
    fluxo: [
      { id: 'abertura', nome: 'Abertura', meta: 'Confirmar que fala com o decisor e prender a atenção' },
      { id: 'descoberta', nome: 'Descoberta', meta: 'Entender a necessidade e o momento de compra' },
      { id: 'oferta', nome: 'Oferta', meta: 'Apresentar a oferta certa para a necessidade dela' },
      { id: 'objecao', nome: 'Objeção', meta: 'Dissolver dúvidas de preço, confiança e momento' },
      { id: 'fechamento', nome: 'Fechamento', meta: 'Pedir o pedido e combinar pagamento/entrega' },
      { id: 'despedida', nome: 'Despedida', meta: 'Confirmar o combinado e agradecer' },
    ],
    formulario: [
      { rotulo: 'nome_responsavel', pergunta: 'com quem eu falo?', obrigatorio: true },
      { rotulo: 'produto_interesse', pergunta: '', obrigatorio: false },
      { rotulo: 'fechou_compra', pergunta: '', obrigatorio: false },
    ],
  },
  apresentar: {
    rotulo: 'Apresentar', dica: 'Dar a conhecer a empresa/novidade, sem pressão',
    objetivo: 'Apresentar a empresa e despertar curiosidade, deixando a porta aberta',
    abertura: '[alegre] Oi, tudo bem? Aqui é a Bel, da Babel! Posso te roubar um minutinho?',
    fluxo: [
      { id: 'abertura', nome: 'Abertura', meta: 'Se apresentar e pedir um minuto com simpatia' },
      { id: 'contexto', nome: 'Contexto', meta: 'Entender rapidamente o que a empresa faz' },
      { id: 'apresentacao', nome: 'Apresentação', meta: 'Contar o essencial que desperte curiosidade' },
      { id: 'interesse', nome: 'Interesse', meta: 'Medir o interesse e responder dúvidas leves' },
      { id: 'proximo_passo', nome: 'Próximo passo', meta: 'Oferecer material/contato sem pressão' },
      { id: 'despedida', nome: 'Despedida', meta: 'Agradecer e encerrar bem' },
    ],
    formulario: [
      { rotulo: 'nome_responsavel', pergunta: 'com quem eu falo?', obrigatorio: false },
      { rotulo: 'nivel_interesse', pergunta: '', obrigatorio: false },
    ],
  },
  cobrar: {
    rotulo: 'Cobrar', dica: 'Lembrete cordial de pagamento + data concreta',
    objetivo: 'Lembrar com cordialidade o pagamento em aberto e conseguir uma DATA concreta de pagamento',
    abertura: '[caloroso] Oi, tudo bem? Aqui é a Bel, da Babel. Eu falo com {nome}?',
    fluxo: [
      { id: 'identificacao', nome: 'Identificação', meta: 'CONFIRMAR que fala com a pessoa certa antes de qualquer valor' },
      { id: 'motivo', nome: 'Motivo', meta: 'Avisar do valor em aberto com leveza e respeito' },
      { id: 'situacao', nome: 'Situação', meta: 'Ouvir o lado da pessoa sem julgar' },
      { id: 'acordo', nome: 'Acordo', meta: 'Chegar numa data concreta de pagamento' },
      { id: 'confirmacao', nome: 'Confirmação', meta: 'Repetir a data combinada e confirmar' },
      { id: 'despedida', nome: 'Despedida', meta: 'Agradecer e encerrar cordial' },
    ],
    formulario: [
      { rotulo: 'confirmou_identidade', pergunta: '', obrigatorio: true },
      { rotulo: 'data_pagamento', pergunta: 'consegue me dizer uma data que fica boa pra você?', obrigatorio: true },
      { rotulo: 'motivo_atraso', pergunta: '', obrigatorio: false },
    ],
  },
  pos_venda: {
    rotulo: 'Pós-venda', dica: 'Agradecer, medir satisfação e cuidar',
    objetivo: 'Agradecer a compra, medir a satisfação (nota 0-10) e captar problemas ou indicações',
    abertura: '[alegre] Oi, tudo bem? Aqui é a Bel, da Babel! Falo com {nome}? É rapidinho, prometo!',
    fluxo: [
      { id: 'abertura', nome: 'Abertura', meta: 'Confirmar a pessoa e agradecer pela confiança' },
      { id: 'satisfacao', nome: 'Satisfação', meta: 'Pedir a nota de zero a dez e o porquê' },
      { id: 'problemas', nome: 'Problemas', meta: 'Escutar dificuldades de verdade e anotar tudo' },
      { id: 'oportunidade', nome: 'Oportunidade', meta: 'Se o clima estiver ótimo: indicação ou novidade' },
      { id: 'despedida', nome: 'Despedida', meta: 'Agradecer de coração e encerrar' },
    ],
    formulario: [
      { rotulo: 'nota', pergunta: 'de zero a dez, que nota você dá pra sua experiência?', obrigatorio: true },
      { rotulo: 'feedback', pergunta: 'o que a gente pode melhorar?', obrigatorio: false },
      { rotulo: 'indicacao', pergunta: '', obrigatorio: false },
    ],
  },
  convidar: {
    rotulo: 'Convidar', dica: 'Chamar pessoas para um evento e confirmar presença',
    objetivo: 'Convidar para o evento (detalhes na base de conhecimento) e confirmar presença',
    abertura: '[alegre] Oi, tudo bem? Aqui é a Bel, da Babel! Tenho um convite especial pra você — tem um minutinho?',
    fluxo: [
      { id: 'abertura', nome: 'Abertura', meta: 'Se apresentar e anunciar que tem um convite' },
      { id: 'convite', nome: 'Convite', meta: 'Contar o evento com entusiasmo (o quê, quando, onde)' },
      { id: 'interesse', nome: 'Interesse', meta: 'Responder dúvidas sobre o evento' },
      { id: 'confirmacao', nome: 'Confirmação', meta: 'Confirmar presença e acompanhantes' },
      { id: 'despedida', nome: 'Despedida', meta: 'Combinar o lembrete e encerrar animada' },
    ],
    formulario: [
      { rotulo: 'confirmou_presenca', pergunta: 'posso contar com você?', obrigatorio: true },
      { rotulo: 'acompanhantes', pergunta: 'vai levar alguém?', obrigatorio: false },
    ],
  },
  pesquisa: {
    rotulo: 'Pesquisa', dica: 'Levantamento de dados — só perguntar e anotar',
    objetivo: 'Coletar as respostas do formulário com rapidez e simpatia, sem vender nada',
    abertura: '[alegre] Oi, tudo bem? Aqui é a Bel, da Babel! Tô fazendo uma pesquisa rapidinha, são dois minutinhos — posso?',
    fluxo: [
      { id: 'abertura', nome: 'Abertura', meta: 'Pedir permissão com simpatia (dois minutinhos)' },
      { id: 'perguntas', nome: 'Perguntas', meta: 'Fazer UMA pergunta do formulário por vez, agradecendo cada resposta' },
      { id: 'agradecimento', nome: 'Agradecimento', meta: 'Agradecer o tempo e encerrar bem' },
    ],
    formulario: [
      { rotulo: 'pergunta_1', pergunta: 'edite aqui a primeira pergunta da pesquisa', obrigatorio: true },
      { rotulo: 'pergunta_2', pergunta: 'edite aqui a segunda pergunta', obrigatorio: false },
    ],
  },
}

// Editor do formulário de captura — cada dado com sua pergunta e obrigatoriedade
function EditorFormulario({ formulario, aoMudar }) {
  const campos = formulario || []
  function set(i, k, v) { aoMudar(campos.map((c, j) => (j === i ? { ...c, [k]: v } : c))) }
  function remover(i) { aoMudar(campos.filter((_, j) => j !== i)) }
  function adicionar() { aoMudar([...campos, { rotulo: '', pergunta: '', obrigatorio: false }]) }
  return (
    <div className="space-y-2">
      {campos.map((c, i) => (
        <div key={i} className="rounded-lg bg-surface-2 border border-line p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input value={c.rotulo} onChange={(e) => set(i, 'rotulo', e.target.value)} placeholder="nome do dado (ex.: email)"
              className="flex-1 rounded bg-surface-2 border border-line px-2 py-1 text-sm outline-none" />
            <label className="flex items-center gap-1 text-[11px] text-ink-2 whitespace-nowrap">
              <input type="checkbox" checked={!!c.obrigatorio} onChange={(e) => set(i, 'obrigatorio', e.target.checked)} />
              obrig.
            </label>
            <button type="button" onClick={() => remover(i)} className="text-ink-3 hover:text-danger px-1">✕</button>
          </div>
          <input value={c.pergunta} onChange={(e) => set(i, 'pergunta', e.target.value)}
            placeholder="como a IA deve perguntar (ex.: qual o melhor e-mail pra te enviar o link?)"
            className="w-full rounded bg-surface-2 border border-line px-2 py-1 text-xs text-ink-2 outline-none" />
        </div>
      ))}
      <button type="button" onClick={adicionar} className="text-xs text-sinal">+ pergunta</button>
    </div>
  )
}

// Editor de etapas do fluxo — usado na criação e por campanha
function EditorFluxo({ fluxo, aoMudar }) {
  const etapas = fluxo || FLUXO_PADRAO
  function set(i, campo, valor) {
    aoMudar(etapas.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)))
  }
  function remover(i) { aoMudar(etapas.filter((_, j) => j !== i)) }
  function mover(i, dir) {
    const j = i + dir
    if (j < 0 || j >= etapas.length) return
    const cp = [...etapas];[cp[i], cp[j]] = [cp[j], cp[i]]; aoMudar(cp)
  }
  function adicionar() {
    aoMudar([...etapas, { id: 'etapa' + (etapas.length + 1), nome: 'Nova etapa', meta: '' }])
  }
  return (
    <div className="space-y-2">
      {etapas.map((e, i) => (
        <div key={i} className="rounded-lg bg-surface-2 border border-line p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-3 w-4">{i + 1}</span>
            <input value={e.nome} onChange={(ev) => set(i, 'nome', ev.target.value)}
              className="flex-1 rounded bg-surface-2 border border-line px-2 py-1 text-sm outline-none" />
            <button type="button" onClick={() => mover(i, -1)} className="text-ink-3 px-1">↑</button>
            <button type="button" onClick={() => mover(i, 1)} className="text-ink-3 px-1">↓</button>
            <button type="button" onClick={() => remover(i)} className="text-ink-3 hover:text-danger px-1">✕</button>
          </div>
          <input value={e.meta} onChange={(ev) => set(i, 'meta', ev.target.value)} placeholder="meta desta etapa"
            className="w-full rounded bg-surface-2 border border-line px-2 py-1 text-xs text-ink-2 outline-none" />
        </div>
      ))}
      <button type="button" onClick={adicionar} className="text-xs text-sinal">+ etapa</button>
    </div>
  )
}

export function IaLigadora() {
  const [subaba, setSubaba] = useState('campanhas') // campanhas | conhecimento | ligacoes
  const [campanhas, setCampanhas] = useState([])
  const [chamadas, setChamadas] = useState([])
  const [criando, setCriando] = useState(false)
  const [aberta, setAberta] = useState(null) // id da campanha com resultados abertos
  const [transAberta, setTransAberta] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState({
    nome: '', tipo: 'agendar',
    objetivo: TIPOS_CAMPANHA.agendar.objetivo,
    persona: 'Bel, a consultora comercial da Babel — mulher brasileira, voz alegre, simpática e direta',
    abertura: TIPOS_CAMPANHA.agendar.abertura,
    voz_id: '', base_conhecimento: '',
    fluxo: TIPOS_CAMPANHA.agendar.fluxo,
    formulario: TIPOS_CAMPANHA.agendar.formulario,
  })

  function aplicarTipo(id) {
    const t = TIPOS_CAMPANHA[id]
    setForm((f) => ({ ...f, tipo: id, objetivo: t.objetivo, abertura: t.abertura,
      fluxo: t.fluxo, formulario: t.formulario }))
  }
  const [fluxoAberto, setFluxoAberto] = useState(null) // id da campanha com fluxo aberto
  const [formAberto, setFormAberto] = useState(null) // id da campanha com formulário aberto
  const [contAberto, setContAberto] = useState(null) // id da campanha com contatos abertos

  async function carregar() {
    const [{ data: cs }, { data: ch }] = await Promise.all([
      supabase.from('campanhas_ia').select('*').order('criado_em', { ascending: false }),
      supabase.from('ia_chamadas').select('*, leads(empresa), campanhas_ia(nome)').order('atualizado_em', { ascending: false }).limit(100),
    ])
    setCampanhas(cs || []); setChamadas(ch || [])
  }
  useEffect(() => { carregar() }, [])

  async function criar(e) {
    e.preventDefault()
    const formulario = form.formulario.filter((c) => c.rotulo.trim())
    const { error } = await supabase.from('campanhas_ia').insert({
      nome: form.nome, tipo: form.tipo, objetivo: form.objetivo, persona: form.persona,
      abertura: form.abertura,
      campos: formulario.map((c) => c.rotulo.trim()),
      formulario,
      voz_id: form.voz_id || null,
      base_conhecimento: form.base_conhecimento || null,
      fluxo: form.fluxo,
    })
    if (!error) { setCriando(false); carregar() }
  }

  async function salvarFluxo(campanhaId, fluxo) {
    await supabase.from('campanhas_ia').update({ fluxo }).eq('id', campanhaId)
    carregar()
  }
  async function salvarFormulario(campanhaId, formulario) {
    await supabase.from('campanhas_ia').update({
      formulario, campos: formulario.filter((c) => c.rotulo?.trim()).map((c) => c.rotulo.trim()),
    }).eq('id', campanhaId)
    carregar()
  }

  async function alternarStatus(c) {
    const novo = c.status === 'ativa' ? 'pausada' : 'ativa'
    await supabase.from('campanhas_ia').update({ status: novo }).eq('id', c.id)
    carregar()
  }

  async function adicionarLeads(c) {
    setMensagem('')
    const { data: leads } = await supabase.from('leads')
      .select('id, telefone').in('status', ['novo', 'em_contato'])
      .not('telefone', 'is', null).limit(50)
    const { data: jaTem } = await supabase.from('ia_chamadas')
      .select('lead_id').eq('campanha_id', c.id)
    const usados = new Set((jaTem || []).map((x) => x.lead_id))
    const novos = (leads || []).filter((l) => !usados.has(l.id))
      .map((l) => ({ campanha_id: c.id, lead_id: l.id, numero: l.telefone }))
    if (!novos.length) { setMensagem('Nenhum lead novo para adicionar (status novo/em contato).'); return }
    const { error } = await supabase.from('ia_chamadas').insert(novos)
    setMensagem(error ? 'Erro ao adicionar.' : `${novos.length} número(s) na fila da campanha.`)
  }

  const ROTULO_ST = {
    pendente: 'na fila', ligando: 'ligando…', concluida: 'concluída',
    sem_resposta: 'não atendeu', falhou: 'falhou',
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[['campanhas', 'Campanhas'], ['conhecimento', 'Base'], ['ligacoes', 'Ligações'],
          ['ajustes', 'Ajustes'], ['simulador', 'Testar'], ['relatorio', 'Relatório']].map(([id, r]) => (
          <button key={id} onClick={() => setSubaba(id)}
            className={`flex-1 min-w-[30%] rounded-lg py-2 text-xs font-semibold border ${
              subaba === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {r}
          </button>
        ))}
      </div>

      {subaba === 'ligacoes' && <HistoricoIA chamadas={chamadas} recarregar={carregar} />}
      {subaba === 'conhecimento' && <Conhecimento campanhas={campanhas} />}
      {subaba === 'ajustes' && <Ajustes campanhas={campanhas} recarregar={carregar} />}
      {subaba === 'simulador' && <Simulador campanhas={campanhas} />}
      {subaba === 'relatorio' && <RelatorioIA campanhas={campanhas} />}
      {subaba === 'campanhas' && <>
      <p className="text-xs text-ink-2">
        A IA liga sozinha pelos números da fila, conversa com voz natural (Fish Audio),
        captura os dados que você definir e anota tudo no dossiê do lead.
        Precisa de uma chave <b>OpenRouter</b> cadastrada na aba Chaves (é o cérebro).
      </p>
      <button onClick={() => setCriando(!criando)} className={`w-full ${caixa} py-2.5 text-sm font-semibold`}>
        + Nova campanha
      </button>

      {criando && (
        <form onSubmit={criar} className={`${caixa} p-3 space-y-2`}>
          <p className="text-xs font-semibold text-ink-2">Tipo de campanha (pré-configura tudo — depois edite à vontade)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {Object.entries(TIPOS_CAMPANHA).map(([id, t]) => (
              <button key={id} type="button" onClick={() => aplicarTipo(id)}
                className={`rounded-lg px-2 py-2 text-left border ${
                  form.tipo === id ? 'border-sinal/50 bg-sinal/10' : 'border-line'}`}>
                <span className={`block text-xs font-semibold ${form.tipo === id ? 'text-sinal' : ''}`}>{t.rotulo}</span>
                <span className="block text-[10px] text-ink-3 leading-tight">{t.dica}</span>
              </button>
            ))}
          </div>
          <input required placeholder="Nome da campanha" value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })} className={campo} />
          <textarea required rows={2} placeholder="Objetivo (o que a IA deve conseguir na ligação)"
            value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} className={campo} />
          <textarea required rows={2} value={form.persona}
            onChange={(e) => setForm({ ...form, persona: e.target.value })} className={campo} />
          <textarea required rows={2} value={form.abertura}
            onChange={(e) => setForm({ ...form, abertura: e.target.value })} className={campo} />
          <div className="rounded-lg bg-surface-2 border border-line p-2 space-y-2">
            <p className="text-xs font-semibold text-ink-2">Formulário — o que a IA coleta e como pergunta</p>
            <EditorFormulario formulario={form.formulario} aoMudar={(f) => setForm({ ...form, formulario: f })} />
          </div>
          <textarea rows={5} value={form.base_conhecimento}
            placeholder={'Base de conhecimento — os FATOS que a IA pode afirmar (produto, preços, horários, quem é quem). O que não estiver aqui, ela responde "o especialista detalha na mentoria" em vez de inventar.'}
            onChange={(e) => setForm({ ...form, base_conhecimento: e.target.value })} className={campo} />
          <input placeholder="ID de voz da Fish (vazio = voz padrão da Bel, feminina alegre)" value={form.voz_id}
            onChange={(e) => setForm({ ...form, voz_id: e.target.value })} className={campo} />
          <div className="rounded-lg bg-surface-2 border border-line p-2 space-y-2">
            <p className="text-xs font-semibold text-ink-2">Fluxo da ligação (a IA conduz por estas etapas)</p>
            <EditorFluxo fluxo={form.fluxo} aoMudar={(f) => setForm({ ...form, fluxo: f })} />
          </div>
          <button className="w-full rounded-lg bg-sinal py-2 font-semibold text-white">Criar campanha</button>
        </form>
      )}
      {mensagem && <p className="text-xs text-amber">{mensagem}</p>}

      {campanhas.map((c) => {
        const doCamp = chamadas.filter((ch) => ch.campanha_id === c.id)
        const feitas = doCamp.filter((ch) => ch.status === 'concluida').length
        return (
          <div key={c.id} className={`${caixa} px-4 py-3 space-y-2`}>
            <div className="flex items-center gap-2">
              <span className="flex-1">
                <span className="block font-medium text-sm">
                  {c.nome}{' '}
                  <span className="text-[9px] font-bold text-violet bg-violet/10 border border-violet/30 rounded px-1.5 py-px align-middle">
                    {TIPOS_CAMPANHA[c.tipo]?.rotulo || c.tipo || 'agendar'}
                  </span>
                </span>
                <span className="block text-xs text-ink-3">
                  {doCamp.length} na fila · {feitas} concluídas · {c.hora_inicio}h–{c.hora_fim}h
                </span>
              </span>
              <button onClick={() => alternarStatus(c)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                  c.status === 'ativa' ? 'border-sinal/50 text-sinal' : 'border-amber/50 text-amber'}`}>
                {c.status === 'ativa' ? '● Rodando' : '▶ Ativar'}
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setContAberto(contAberto === c.id ? null : c.id)}
                className={`text-xs rounded-full px-2.5 py-1 border font-semibold ${
                  contAberto === c.id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-sinal/40 text-sinal'}`}>
                {contAberto === c.id ? 'fechar contatos' : 'contatos'}
              </button>
              <button onClick={() => adicionarLeads(c)} className="text-xs border border-line text-ink-2 rounded-full px-2.5 py-1">
                + Leads da fila (novo/em contato)
              </button>
              <button onClick={() => setFluxoAberto(fluxoAberto === c.id ? null : c.id)} className="text-xs border border-line text-ink-2 rounded-full px-2.5 py-1">
                {fluxoAberto === c.id ? 'fechar fluxo' : 'fluxo'}
              </button>
              <button onClick={() => setFormAberto(formAberto === c.id ? null : c.id)} className="text-xs border border-line text-ink-2 rounded-full px-2.5 py-1">
                {formAberto === c.id ? 'fechar formulário' : 'formulário'}
              </button>
              <button onClick={() => setAberta(aberta === c.id ? null : c.id)} className="text-xs border border-line text-ink-2 rounded-full px-2.5 py-1">
                {aberta === c.id ? 'ocultar resultados' : 'ver resultados'}
              </button>
            </div>
            {contAberto === c.id && <ContatosCampanha campanhaId={c.id} recarregar={carregar} />}
            {fluxoAberto === c.id && (
              <div className="rounded-lg bg-surface-2 border border-line p-2 space-y-2">
                <p className="text-xs font-semibold text-ink-2">Etapas que a IA percorre nesta campanha</p>
                <EditorFluxo fluxo={c.fluxo || FLUXO_PADRAO} aoMudar={(f) => salvarFluxo(c.id, f)} />
                <p className="text-[10px] text-ink-3">As mudanças salvam ao editar. Valem para as próximas ligações.</p>
              </div>
            )}
            {formAberto === c.id && (
              <div className="rounded-lg bg-surface-2 border border-line p-2 space-y-2">
                <p className="text-xs font-semibold text-ink-2">Perguntas que a IA faz para coletar dados</p>
                <EditorFormulario formulario={c.formulario || []} aoMudar={(f) => salvarFormulario(c.id, f)} />
                <p className="text-[10px] text-ink-3">Marque "obrig." nos dados que a IA não pode deixar de coletar antes de encerrar.</p>
              </div>
            )}
            {aberta === c.id && doCamp.map((ch) => (
              <div key={ch.id} className="border-l-2 border-line pl-3 py-1 text-xs space-y-0.5">
                <p className="text-ink-2">
                  {ch.leads?.empresa || ch.numero} · <span className="text-ink-3">{ROTULO_ST[ch.status]}</span>
                  {ch.duracao_seg ? ` · ${ch.duracao_seg}s` : ''}
                  {ch.etapa_atual ? <span className="text-violet"> · chegou em: {ch.etapa_atual}</span> : ''}
                </p>
                {ch.capturado && Object.keys(ch.capturado).length > 0 && (
                  <p className="text-sinal">
                    {Object.entries(ch.capturado).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </p>
                )}
                {ch.transcricao && (
                  <button onClick={() => setTransAberta(transAberta === ch.id ? null : ch.id)} className="text-sinal underline">
                    {transAberta === ch.id ? 'ocultar conversa' : 'ver conversa'}
                  </button>
                )}
                {transAberta === ch.id && (
                  <p className="text-ink-2 whitespace-pre-wrap">{ch.transcricao}</p>
                )}
              </div>
            ))}
          </div>
        )
      })}
      </>}
    </div>
  )
}

// ---- Contatos da campanha: colar do Excel/Sheets, manual com briefing, fila ----

function parseLista(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out = []
  for (const l of linhas) {
    const partes = l.split(/\t|;/).map((p) => p.trim()).filter(Boolean)
    const pedacos = partes.length > 1 ? partes : l.split(',').map((p) => p.trim()).filter(Boolean)
    let tel = null; let idx = -1
    pedacos.forEach((p, i) => {
      const d = p.replace(/\D/g, '')
      if (!tel && d.length >= 10 && d.length <= 13) { tel = d; idx = i }
    })
    if (!tel) continue
    const nome = pedacos.slice(0, idx).join(' ').trim() || null
    const briefing = pedacos.slice(idx + 1).join(' · ').trim() || null
    out.push({ nome, telefone: tel, briefing })
  }
  return out
}

function ContatosCampanha({ campanhaId, recarregar }) {
  const [modo, setModo] = useState('fila') // fila | colar | manual
  const [fila, setFila] = useState([])
  const [textoLista, setTextoLista] = useState('')
  const [manual, setManual] = useState({ nome: '', telefone: '', briefing: '' })
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregarFila() {
    const { data } = await supabase.from('ia_chamadas')
      .select('id, numero, contato_nome, briefing, status')
      .eq('campanha_id', campanhaId).in('status', ['pendente', 'ligando'])
      .order('criado_em')
    setFila(data || [])
  }
  useEffect(() => { carregarFila() }, [campanhaId]) // eslint-disable-line

  const preview = parseLista(textoLista)

  async function importar() {
    if (!preview.length) return
    setSalvando(true); setMsg('')
    const jaTem = new Set(fila.map((f) => f.numero))
    const novos = preview.filter((p) => !jaTem.has(p.telefone)).map((p) => ({
      campanha_id: campanhaId, numero: p.telefone,
      contato_nome: p.nome, briefing: p.briefing, status: 'pendente',
    }))
    if (!novos.length) { setMsg('Todos esses números já estão na fila.'); setSalvando(false); return }
    const { error } = await supabase.from('ia_chamadas').insert(novos)
    setMsg(error ? 'Erro ao importar.' : `✓ ${novos.length} contato(s) na fila.`)
    setTextoLista(''); setSalvando(false)
    carregarFila(); recarregar()
  }

  async function adicionarManual(e) {
    e.preventDefault()
    const tel = manual.telefone.replace(/\D/g, '')
    if (tel.length < 10) { setMsg('Telefone inválido — use DDD + número.'); return }
    setSalvando(true); setMsg('')
    const { error } = await supabase.from('ia_chamadas').insert({
      campanha_id: campanhaId, numero: tel,
      contato_nome: manual.nome.trim() || null,
      briefing: manual.briefing.trim() || null, status: 'pendente',
    })
    setMsg(error ? 'Erro ao adicionar.' : `✓ ${manual.nome || tel} na fila.`)
    if (!error) setManual({ nome: '', telefone: '', briefing: '' })
    setSalvando(false)
    carregarFila(); recarregar()
  }

  async function remover(id) {
    await supabase.from('ia_chamadas').delete().eq('id', id).eq('status', 'pendente')
    carregarFila(); recarregar()
  }

  return (
    <div className="rounded-lg bg-surface-2 border border-line p-2.5 space-y-2">
      <div className="flex gap-1.5">
        {[['fila', `Fila (${fila.length})`], ['colar', 'Colar lista'], ['manual', 'Manual']].map(([id, r]) => (
          <button key={id} type="button" onClick={() => setModo(id)}
            className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold border ${
              modo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {r}
          </button>
        ))}
      </div>

      {modo === 'colar' && (
        <div className="space-y-2">
          <textarea rows={5} value={textoLista} onChange={(e) => setTextoLista(e.target.value)}
            placeholder={'Cole direto do Excel/Sheets — uma linha por contato:\nNome    Telefone    Briefing (opcional)\nMaria Souza\t11999998888\tDona da padaria, já pediu orçamento em maio'}
            className={campo + ' font-mono text-xs'} />
          {textoLista && (
            <p className="text-[11px] text-ink-2">
              {preview.length
                ? `✓ ${preview.length} contato(s) reconhecido(s) — ex.: ${preview[0].nome || 'sem nome'} · ${preview[0].telefone}${preview[0].briefing ? ' · com briefing' : ''}`
                : 'Nenhum telefone reconhecido (precisa de DDD + número, 10-13 dígitos).'}
            </p>
          )}
          <button onClick={importar} disabled={!preview.length || salvando}
            className="w-full rounded-lg bg-sinal py-2 text-xs font-semibold text-white disabled:opacity-40">
            {salvando ? 'Importando…' : `Importar ${preview.length || ''} contato(s)`}
          </button>
        </div>
      )}

      {modo === 'manual' && (
        <form onSubmit={adicionarManual} className="space-y-2">
          <div className="flex gap-2">
            <input placeholder="Nome (opcional)" value={manual.nome}
              onChange={(e) => setManual({ ...manual, nome: e.target.value })} className={campo + ' flex-1'} />
            <input required placeholder="Telefone c/ DDD" value={manual.telefone}
              onChange={(e) => setManual({ ...manual, telefone: e.target.value })} className={campo + ' flex-1'} />
          </div>
          <textarea rows={2} value={manual.briefing}
            onChange={(e) => setManual({ ...manual, briefing: e.target.value })}
            placeholder="Briefing (opcional): o que você sabe dessa pessoa — a Bel usa pra personalizar a conversa. Ex.: 'já foi cliente em 2024, saiu por preço, decisor é ele mesmo'"
            className={campo} />
          <button disabled={salvando} className="w-full rounded-lg bg-sinal py-2 text-xs font-semibold text-white disabled:opacity-40">
            Adicionar à fila
          </button>
        </form>
      )}

      {modo === 'fila' && (
        fila.length === 0
          ? <p className="text-[11px] text-ink-3 text-center py-2">Fila vazia — cole uma lista ou adicione manualmente.</p>
          : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {fila.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg bg-surface border border-line px-2.5 py-1.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs truncate">
                      {f.contato_nome || <span className="text-ink-3">sem nome</span>}
                      <span className="text-ink-3 tabular-nums"> · {f.numero}</span>
                      {f.status === 'ligando' && <span className="text-sinal"> · ligando…</span>}
                    </span>
                    {f.briefing && <span className="block text-[10px] text-ink-3 truncate">{f.briefing}</span>}
                  </span>
                  {f.status === 'pendente' && (
                    <button onClick={() => remover(f.id)} className="shrink-0 text-danger text-xs px-1"><Icone nome="lixo" tam={12} /></button>
                  )}
                </div>
              ))}
            </div>
          )
      )}

      {msg && <p className="text-[11px] text-sinal">{msg}</p>}
    </div>
  )
}

// ---- Configuração avançada da IA (padrões de Vapi/Retell/Bland/ElevenLabs) ----

const VOZ_BEL = '5661bf8cb97740fcb10d2f756abf7779'
const VOZ_MASC = '22836c79d6ea4bdeb1fdb2de70d3fb65'

const CFG_PADRAO = {
  piso_ms: 300, jitter_ms: 120, fim_turno: 'semantico', silencio_fixo_ms: 850,
  teto_pausa_ms: 2500, limiar_turno: 0.5, interromper_ms: 450, limiar_voz: 1500,
  fillers_ativos: true, uhum_fala_longa: true, chance_pensando: 0.3,
  ponte_resposta: true,
  ruido_ativo: true, temperatura: 0.7, voz_velocidade: 1.0, max_turnos: 20,
  transferir_ramal: '', recontato_horas: 72, wpp_followup: false,
  wpp_template: 'Oi {nome}! Aqui é da Babel Passando pra confirmar nosso papo: {dia_horario}. Qualquer coisa me chama por aqui!',
}

// "Ansiedade de turno" (padrão ElevenLabs): quão rápido a IA toma a vez
const PRESETS = {
  ansiosa: { piso_ms: 250, teto_pausa_ms: 1800, limiar_turno: 0.35, interromper_ms: 350 },
  normal: { piso_ms: 450, teto_pausa_ms: 2500, limiar_turno: 0.5, interromper_ms: 450 },
  paciente: { piso_ms: 700, teto_pausa_ms: 3200, limiar_turno: 0.65, interromper_ms: 600 },
}

function Deslizador({ rotulo, dica, valor, min, max, passo = 1, unidade = '', aoMudar }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2">{rotulo}</span>
        <span className="tabular-nums font-semibold text-sinal">{valor}{unidade}</span>
      </div>
      <input type="range" min={min} max={max} step={passo} value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))} className="w-full accent-sinal" />
      {dica && <p className="text-[10px] text-ink-3 leading-snug">{dica}</p>}
    </div>
  )
}

function Chavinha({ rotulo, dica, ligado, aoMudar }) {
  return (
    <button type="button" onClick={() => aoMudar(!ligado)} className="flex items-start gap-3 w-full text-left">
      <span className={`shrink-0 mt-0.5 w-9 h-5 rounded-full border transition-colors relative ${
        ligado ? 'bg-sinal/30 border-sinal' : 'bg-surface-2 border-line'}`}>
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
          ligado ? 'right-0.5 bg-sinal' : 'left-0.5 bg-ink-3'}`} />
      </span>
      <span>
        <span className="block text-xs text-ink">{rotulo}</span>
        {dica && <span className="block text-[10px] text-ink-3 leading-snug">{dica}</span>}
      </span>
    </button>
  )
}

function Ajustes({ campanhas, recarregar }) {
  const [campId, setCampId] = useState('')
  const [cfg, setCfg] = useState(CFG_PADRAO)
  const [vozTipo, setVozTipo] = useState('bel')
  const [vozId, setVozId] = useState('')
  const [modelo, setModelo] = useState('google/gemini-2.5-flash-lite')
  const [salvando, setSalvando] = useState(false)
  const [tocandoVoz, setTocandoVoz] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!campId && campanhas.length) setCampId(campanhas[0].id)
  }, [campanhas, campId])

  useEffect(() => {
    const camp = campanhas.find((c) => c.id === campId)
    if (!camp) return
    setCfg({ ...CFG_PADRAO, ...(camp.config || {}) })
    setModelo(camp.modelo_llm || 'google/gemini-2.5-flash-lite')
    const v = camp.voz_id
    if (!v || v === VOZ_BEL) { setVozTipo('bel'); setVozId('') }
    else if (v === VOZ_MASC) { setVozTipo('masc'); setVozId('') }
    else { setVozTipo('custom'); setVozId(v) }
  }, [campId, campanhas])

  const m = (parte) => setCfg((c) => ({ ...c, ...parte }))
  const vozEscolhida = vozTipo === 'bel' ? null : vozTipo === 'masc' ? VOZ_MASC : (vozId.trim() || null)

  const presetAtivo = Object.entries(PRESETS).find(([, p]) =>
    Object.entries(p).every(([k, v]) => cfg[k] === v))?.[0]

  async function salvar() {
    setSalvando(true); setMsg('')
    const { error } = await supabase.from('campanhas_ia').update({
      config: cfg, modelo_llm: modelo, voz_id: vozEscolhida,
    }).eq('id', campId)
    setMsg(error ? 'Erro ao salvar.' : '✓ Salvo — vale já na próxima ligação.')
    setSalvando(false)
    recarregar()
  }

  async function ouvirVoz() {
    setTocandoVoz(true)
    const { data } = await supabase.functions.invoke('simular', {
      body: { acao: 'voz', voz_id: vozEscolhida, velocidade: cfg.voz_velocidade,
        texto: '[alegre] Oi! Eu sou a voz da sua campanha na Babel. Prazer em falar com você!' },
    })
    if (data?.audio) {
      const a = new Audio(`data:${data.tipo};base64,${data.audio}`)
      a.onended = () => setTocandoVoz(false)
      a.play().catch(() => setTocandoVoz(false))
    } else setTocandoVoz(false)
  }

  const caixaG = 'rounded-xl bg-surface border border-line p-4 space-y-3'

  return (
    <div className="space-y-3 pb-24">
      <select value={campId} onChange={(e) => setCampId(e.target.value)} className={campo}>
        {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Ritmo de resposta</h3>
        <div className="flex gap-1.5">
          {[['ansiosa', 'Ansiosa'], ['normal', 'Normal'], ['paciente', 'Paciente']].map(([id, r]) => (
            <button key={id} type="button" onClick={() => m(PRESETS[id])}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border ${
                presetAtivo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
              {r}
            </button>
          ))}
        </div>
        <Deslizador rotulo="Pausa mínima antes de responder" valor={cfg.piso_ms} min={0} max={1500} passo={50} unidade="ms"
          dica="Responder instantâneo demais também denuncia robô — 400ms é o padrão do mercado."
          aoMudar={(v) => m({ piso_ms: v })} />
        <Deslizador rotulo="Variação aleatória (jitter)" valor={cfg.jitter_ms} min={0} max={400} passo={25} unidade="ms"
          dica="Gente nunca responde sempre no mesmo tempo."
          aoMudar={(v) => m({ jitter_ms: v })} />
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Fim de turno (quando ela entende que você terminou)</h3>
        <div className="flex gap-1.5">
          {[['semantico', 'Semântico (recomendado)'], ['fixo', 'Silêncio fixo']].map(([id, r]) => (
            <button key={id} type="button" onClick={() => m({ fim_turno: id })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border ${
                cfg.fim_turno === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
              {r}
            </button>
          ))}
        </div>
        {cfg.fim_turno === 'semantico' ? (
          <Deslizador rotulo="Sensibilidade do detector" valor={cfg.limiar_turno} min={0.2} max={0.8} passo={0.05}
            dica="Menor = responde mais rápido (arrisca cortar). Maior = espera mais certeza."
            aoMudar={(v) => m({ limiar_turno: v })} />
        ) : (
          <Deslizador rotulo="Silêncio para considerar fim de fala" valor={cfg.silencio_fixo_ms} min={400} max={1500} passo={50} unidade="ms"
            aoMudar={(v) => m({ silencio_fixo_ms: v })} />
        )}
        <Deslizador rotulo="Pausa máxima no meio da frase" valor={cfg.teto_pausa_ms} min={1500} max={4000} passo={100} unidade="ms"
          dica="Acima disso ela responde mesmo que a frase pareça incompleta."
          aoMudar={(v) => m({ teto_pausa_ms: v })} />
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Interrupção (você falar por cima dela)</h3>
        <Deslizador rotulo="Fala sustentada para interromper" valor={cfg.interromper_ms} min={200} max={900} passo={50} unidade="ms"
          dica='Menor = ela cala mais fácil. Um "uhum" curto nunca interrompe (padrão de mercado).'
          aoMudar={(v) => m({ interromper_ms: v })} />
        <Deslizador rotulo="Volume mínimo da voz (energia)" valor={cfg.limiar_voz} min={800} max={2500} passo={100}
          dica="Ambiente barulhento → aumente para não interromper à toa."
          aoMudar={(v) => m({ limiar_voz: v })} />
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Naturalidade</h3>
        <Chavinha rotulo="Ponte de resposta (delay percebido &lt; 400ms)"
          dica="Toca um som curto na voz dela (hm…, então…) no instante em que você para de falar, cobrindo o tempo do cérebro. É o que faz soar humano. Desligue pra ouvir o tempo real puro."
          ligado={!!cfg.ponte_resposta} aoMudar={(v) => m({ ponte_resposta: v })} />
        <Chavinha rotulo="Fillers na voz dela (uhum, então…, boa pergunta…)"
          dica="Cobrem o tempo de processamento — a técnica com maior efeito comprovado."
          ligado={cfg.fillers_ativos} aoMudar={(v) => m({ fillers_ativos: v })} />
        {cfg.fillers_ativos && (
          <>
            <Chavinha rotulo='"Uhum" após você falar muito tempo'
              ligado={cfg.uhum_fala_longa} aoMudar={(v) => m({ uhum_fala_longa: v })} />
            <Deslizador rotulo="Chance de filler ao pensar" valor={cfg.chance_pensando} min={0} max={0.7} passo={0.05}
              aoMudar={(v) => m({ chance_pensando: v })} />
          </>
        )}
        <Chavinha rotulo="Ruído de linha contínuo"
          dica="Mata o silêncio digital absoluto — um dos maiores delatores de IA (padrão Bland)."
          ligado={cfg.ruido_ativo} aoMudar={(v) => m({ ruido_ativo: v })} />
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Voz</h3>
        <div className="flex gap-1.5">
          {[['bel', 'Bel (feminina)'], ['masc', 'Masculina BR'], ['custom', 'Outra']].map(([id, r]) => (
            <button key={id} type="button" onClick={() => setVozTipo(id)}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold border ${
                vozTipo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
              {r}
            </button>
          ))}
        </div>
        {vozTipo === 'custom' && (
          <div className="space-y-1">
            <input value={vozId} onChange={(e) => setVozId(e.target.value)}
              placeholder="reference_id da voz (fish.audio/discover → copie o id da URL)" className={campo} />
            <p className="text-[10px] text-ink-3">Qualquer voz do fish.audio serve — abra a voz no site e copie o código da URL.</p>
          </div>
        )}
        <Deslizador rotulo="Velocidade da fala" valor={cfg.voz_velocidade} min={0.7} max={1.2} passo={0.05} unidade="×"
          aoMudar={(v) => m({ voz_velocidade: v })} />
        <button type="button" onClick={ouvirVoz} disabled={tocandoVoz}
          className="w-full rounded-lg border border-sinal/50 text-sinal py-2 text-xs font-semibold disabled:opacity-50">
          {tocandoVoz ? 'tocando…' : 'Ouvir amostra desta voz'}
        </button>
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Cérebro</h3>
        <div className="space-y-1.5">
          {[['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B — o mais rápido (0,4s) e recomendado p/ ligação'],
            ['google/gemini-2.5-flash-lite', 'Gemini Flash Lite — bom pt-BR, porém 1,7s até responder'],
            ['google/gemini-2.5-flash', 'Gemini Flash — mais esperto, mais lento']].map(([id, r]) => (
            <button key={id} type="button" onClick={() => setModelo(id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-xs border ${
                modelo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
              {r}
            </button>
          ))}
          <input value={modelo} onChange={(e) => setModelo(e.target.value)} className={campo}
            placeholder="ou digite qualquer modelo do OpenRouter" />
        </div>
        <Deslizador rotulo="Criatividade (temperatura)" valor={cfg.temperatura} min={0.3} max={1} passo={0.05}
          dica="Menor = mais fiel ao script. Maior = mais espontânea."
          aoMudar={(v) => m({ temperatura: v })} />
        <Deslizador rotulo="Máximo de turnos por ligação" valor={cfg.max_turnos} min={6} max={40} passo={1}
          aoMudar={(v) => m({ max_turnos: v })} />
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Transferência a quente</h3>
        <input value={cfg.transferir_ramal || ''} onChange={(e) => m({ transferir_ramal: e.target.value.replace(/\D/g, '') })}
          placeholder="Ramal do mentor (ex.: 1001) — vazio = desligado" className={campo} />
        <p className="text-[10px] text-ink-3 leading-snug">
          Se o cliente pedir pra falar com alguém AGORA, a Bel avisa e passa a ligação
          direto pro ramal — o webphone do mentor toca com o cliente na linha.
        </p>
      </div>

      <div className={caixaG}>
        <h3 className="text-sm font-semibold">Régua de recontato</h3>
        <Deslizador rotulo='"Ligar depois" volta pra fila em' valor={cfg.recontato_horas} min={0} max={240} passo={12} unidade="h"
          dica='Quando a pessoa diz "agora não dá", a Bel reagenda sozinha. 0 = desligado.'
          aoMudar={(v) => m({ recontato_horas: v })} />
      </div>

      <div className={caixaG}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">WhatsApp pós-agendamento</h3>
          <span className="text-[9px] font-bold text-amber bg-amber/10 border border-amber/40 rounded-full px-2 py-0.5">
            AGUARDANDO API
          </span>
        </div>
        <Chavinha rotulo="Enviar confirmação por WhatsApp quando agendar"
          dica="As mensagens ficam numa fila e disparam automaticamente assim que você conectar a API do WhatsApp."
          ligado={!!cfg.wpp_followup} aoMudar={(v) => m({ wpp_followup: v })} />
        {cfg.wpp_followup && (
          <textarea rows={3} value={cfg.wpp_template || ''}
            onChange={(e) => m({ wpp_template: e.target.value })}
            placeholder="Mensagem — use {nome} e {dia_horario}" className={campo} />
        )}
      </div>

      <div className="fixed bottom-16 md:bottom-4 left-0 right-0 px-4 md:pl-64 z-10">
        <div className="max-w-lg md:max-w-3xl mx-auto flex items-center gap-2">
          <button onClick={salvar} disabled={salvando}
            className="flex-1 rounded-xl bg-sinal py-3 font-semibold text-white shadow-lg disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar ajustes'}
          </button>
          {msg && <span className="text-xs text-sinal bg-surface border border-line rounded-lg px-3 py-2">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

// ---- Testar: ligação REAL pro seu ramal (pipeline completo) ou chat rápido ----

function Simulador({ campanhas }) {
  const [modo, setModo] = useState('ligacao')
  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        {[['ligacao', 'Conversar por voz'], ['chat', 'Texto rápido']].map(([id, r]) => (
          <button key={id} onClick={() => setModo(id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold border ${
              modo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {r}
          </button>
        ))}
      </div>
      {modo === 'ligacao' ? <TesteLigacao campanhas={campanhas} /> : <SimuladorChat campanhas={campanhas} />}
    </div>
  )
}

function TesteLigacao({ campanhas }) {
  const [campId, setCampId] = useState('')
  const [chamada, setChamada] = useState(null)   // registro ao vivo
  const [chamadaId, setChamadaId] = useState(null)
  const [contatoNome, setContatoNome] = useState('')   // vazio = ela descobre
  const [fase, setFase] = useState('pronto')     // pronto | iniciando | conversando | fim
  const [erro, setErro] = useState('')
  const ponteRef = useRef(null)
  const fimRef = useRef(null)

  useEffect(() => {
    if (!campId && campanhas.length) setCampId(campanhas[0].id)
  }, [campanhas, campId])

  useEffect(() => () => ponteRef.current?.parar(), [])   // sai da aba → encerra

  // acompanha a conversa ao vivo (o motor salva a transcrição a cada turno)
  useEffect(() => {
    if (!chamadaId) return
    const timer = setInterval(async () => {
      const { data } = await supabase.from('ia_chamadas')
        .select('status, transcricao, etapa_atual, capturado, metricas, gravacao_url, duracao_seg')
        .eq('id', chamadaId).single()
      if (data) setChamada(data)
      if (data && ['concluida', 'sem_resposta', 'falhou'].includes(data.status)) clearInterval(timer)
    }, 1500)
    return () => clearInterval(timer)
  }, [chamadaId])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chamada?.transcricao])

  async function iniciar() {
    setFase('iniciando'); setErro(''); setChamada(null)
    try {
      const { data, error } = await supabase.from('ia_chamadas').insert({
        campanha_id: campId, numero: 'sim',
        // Vazio = a Bel NÃO sabe com quem fala e precisa descobrir o nome —
        // que é o caso real da prospecção fria. Antes isto vinha preenchido
        // com o nome do usuário logado, então a regra de descobrir o nome
        // nunca era testada: ela já chegava chamando a pessoa pelo nome.
        contato_nome: contatoNome.trim() || null, status: 'ligando',
      }).select('id').single()
      if (error) throw new Error('Erro ao criar a simulação.')
      setChamadaId(data.id)
      ponteRef.current = await iniciarPonte({
        chamadaId: data.id,
        aoEstado: (e) => {
          if (e === 'conversando') setFase('conversando')
          if (e === 'encerrado') setFase('fim')
          if (e === 'sem-audio') {
            // O navegador não liberou o áudio: sem isto a tela dizia
            // "conectada" e a pessoa ficava esperando uma voz que não vinha.
            setErro('O navegador bloqueou o áudio. Toque na tela e clique em "Conversar com a Bel" de novo.')
            setFase('conversando')
          }
        },
      })
    } catch (e) {
      setErro(e?.name === 'NotAllowedError'
        ? 'Libere o microfone no navegador para conversar com a Bel.'
        : (e?.message || 'Não consegui iniciar a conversa.'))
      setFase('pronto')
    }
  }

  function encerrar() {
    ponteRef.current?.parar()
    setFase('fim')
  }

  const linhas = (chamada?.transcricao || '').split('\n').filter(Boolean)
  const metricas = chamada?.metricas || []
  let idxIA = -1
  const dados = Object.entries(chamada?.capturado || {}).filter(([k]) => k !== '_resultado')
  const resultado = chamada?.capturado?._resultado
  const rotEstado = !chamadaId ? null
    : fase === 'iniciando' ? 'conectando…'
    : fase === 'conversando' && !chamada?.transcricao ? 'CONECTADA — diga "alô"!'
    : fase === 'conversando' ? 'EM CONVERSA — ao vivo'
    : chamada?.status === 'concluida' ? 'concluída'
    : 'finalizando…'

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-ink-2">
        Conversa de voz <b>aqui no navegador</b> com o motor REAL da ligação —
        mesmo timing, fillers, ruído, interrupção e gravação. Fale como se tivesse
        atendido o telefone; a transcrição e os tempos aparecem ao vivo.
      </p>
      <div className="flex gap-2">
        <select value={campId} onChange={(e) => setCampId(e.target.value)}
          disabled={fase === 'conversando'} className={campo + ' flex-1'}>
          {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        {fase === 'conversando' ? (
          <button onClick={encerrar}
            className="shrink-0 rounded-lg bg-danger/90 px-4 py-2 text-xs font-semibold text-white">
            Desligar
          </button>
        ) : (
          <button onClick={iniciar} disabled={fase === 'iniciando' || !campId}
            className="shrink-0 rounded-lg bg-sinal px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {fase === 'iniciando' ? '…' : 'Conversar com a Bel'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)}
          disabled={fase === 'conversando'} className={campo + ' flex-1'}
          placeholder="Nome do contato — deixe VAZIO para a Bel ter que descobrir" />
      </div>
      <p className="text-[11px] text-ink-2">
        {contatoNome.trim()
          ? <>Ela já sabe que fala com <b>{contatoNome.trim()}</b> e vai só confirmar.</>
          : <>Vazio = cenário de <b>prospecção fria</b>: ela não sabe com quem fala e
             precisa perguntar o nome. É assim que a ligação real acontece.</>}
      </p>
      {erro && <p className="text-xs text-danger">{erro}</p>}

      {chamadaId && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-sinal/40 text-sinal px-2 py-0.5 font-semibold">{rotEstado}</span>
            {chamada?.etapa_atual && (
              <span className="rounded-full border border-violet/40 text-violet px-2 py-0.5">etapa: {chamada.etapa_atual}</span>
            )}
            {dados.map(([k, v]) => (
              <span key={k} className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
                <span className="text-ink-3">{k}:</span> <span className="text-sinal">{String(v)}</span>
              </span>
            ))}
            {resultado && resultado !== 'em_andamento' && (
              <span className="rounded-full border border-amber/40 text-amber px-2 py-0.5">resultado: {resultado}</span>
            )}
          </div>

          <div className="rounded-xl bg-surface border border-line p-3 min-h-[30vh] max-h-[50vh] overflow-y-auto space-y-2">
            {linhas.length === 0 && (
              <p className="text-xs text-ink-3 animate-pulse text-center py-6">aguardando a conversa começar…</p>
            )}
            {linhas.map((l, i) => {
              const deIA = l.startsWith('IA: ')
              const deCliente = l.startsWith('Cliente: ')
              const corpoBruto = l.replace(/^(IA|Cliente): /, '')
              if (!deIA && !deCliente) {
                return <p key={i} className="text-center text-[11px] text-ink-3">{corpoBruto}</p>
              }
              if (deIA) idxIA += 1
              const met = deIA && idxIA > 0 ? metricas[idxIA - 1] : null
              const emo = deIA ? corpoBruto.match(/^\[([^\]]+)\]\s*/) : null
              const corpo = emo ? corpoBruto.slice(emo[0].length) : corpoBruto
              return (
                <div key={i} className={`flex ${deCliente ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    deCliente ? 'bg-sinal/15 border border-sinal/30' : 'bg-surface-2 border border-line'}`}>
                    {emo && (
                      <span className="inline-block text-[9px] font-bold tracking-wider text-violet bg-violet/10 border border-violet/30 rounded px-1.5 mb-1">
                        {emo[1].toUpperCase()}
                      </span>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{corpo}</p>
                    {met && (
                      <p className="text-[9px] text-ink-3 tabular-nums mt-1">
                        ouvir {met.asr}s{met.primeiro_audio != null ? ` · 1ª fala ${met.primeiro_audio}s` : ' · fallback'}
                        {met.interrompida ? ' · interrompida' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={fimRef} />
          </div>

          {chamada?.status === 'concluida' && (
            <div className="flex items-center gap-3 text-xs text-ink-2">
              <span className="tabular-nums">{chamada.duracao_seg}s no total</span>
              <PlayerIA chamada={{ gravacao_url: chamada.gravacao_url }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---- Chat rápido: conversa por texto com o MESMO cérebro do telefone ----

function SimuladorChat({ campanhas }) {
  const [campId, setCampId] = useState('')
  const [msgs, setMsgs] = useState([])
  const [etapa, setEtapa] = useState(null)
  const [capturado, setCapturado] = useState({})
  const [resultado, setResultado] = useState('em_andamento')
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [tocando, setTocando] = useState(null)
  const fimRef = useRef(null)

  const camp = campanhas.find((c) => c.id === campId)

  useEffect(() => {
    if (!campId && campanhas.length) setCampId(campanhas[0].id)
  }, [campanhas, campId])

  useEffect(() => {
    if (!camp) return
    const ab = (camp.abertura || '').replace('{empresa}', 'sua empresa')
    setMsgs([{ de: 'ia', texto: ab }])
    setEtapa((camp.fluxo?.[0] || FLUXO_PADRAO[0]).id)
    setCapturado({}); setResultado('em_andamento')
  }, [campId]) // eslint-disable-line

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, pensando])

  function reiniciar() {
    if (!camp) return
    const ab = (camp.abertura || '').replace('{empresa}', 'sua empresa')
    setMsgs([{ de: 'ia', texto: ab }])
    setEtapa((camp.fluxo?.[0] || FLUXO_PADRAO[0]).id)
    setCapturado({}); setResultado('em_andamento')
  }

  async function enviar(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || pensando || !campId) return
    const novas = [...msgs, { de: 'eu', texto: t }]
    setMsgs(novas); setTexto(''); setPensando(true)
    const historico = novas.filter((m0) => m0.de !== 'sys').map((m0) => m0.de === 'eu'
      ? { role: 'user', content: m0.texto }
      : { role: 'assistant', content: JSON.stringify({ fala: m0.texto }) })
    const { data, error } = await supabase.functions.invoke('simular', {
      body: { acao: 'conversar', campanha_id: campId, mensagens: historico, etapa_atual: etapa },
    })
    setPensando(false)
    if (error || data?.erro) {
      setMsgs((ms) => [...ms, { de: 'sys', texto: `${data?.erro || 'Erro ao simular. Tente de novo.'}` }])
      return
    }
    setMsgs((ms) => [...ms, { de: 'ia', texto: data.fala || '', ms: data.ms, rag: data.rag_achados }])
    if (data.etapa) setEtapa(data.etapa)
    if (data.capturado) setCapturado((c) => ({ ...c, ...data.capturado }))
    if (data.resultado) setResultado(data.resultado)
    if (data.encerrar) {
      setMsgs((ms) => [...ms, { de: 'sys', texto: `Aqui a Bel encerraria a ligação — resultado: ${data.resultado}` }])
    }
  }

  async function ouvir(t, idx) {
    setTocando(idx)
    const { data } = await supabase.functions.invoke('simular', {
      body: { acao: 'voz', texto: t, voz_id: camp?.voz_id || null,
        velocidade: camp?.config?.voz_velocidade || 1 },
    })
    if (data?.audio) {
      const a = new Audio(`data:${data.tipo};base64,${data.audio}`)
      a.onended = () => setTocando(null)
      a.play().catch(() => setTocando(null))
    } else setTocando(null)
  }

  const fluxo = camp?.fluxo?.length ? camp.fluxo : FLUXO_PADRAO
  const etapaNome = fluxo.find((e) => e.id === etapa)?.nome || etapa
  const dados = Object.entries(capturado).filter(([k]) => k !== '_resultado')

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <select value={campId} onChange={(e) => setCampId(e.target.value)} className={campo + ' flex-1'}>
          {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button onClick={reiniciar} className="shrink-0 rounded-lg border border-line text-ink-2 px-3 text-xs">
          ↻ reiniciar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full border border-violet/40 text-violet px-2 py-0.5">etapa: {etapaNome}</span>
        {dados.map(([k, v]) => (
          <span key={k} className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
            <span className="text-ink-3">{k}:</span> <span className="text-sinal">{String(v)}</span>
          </span>
        ))}
        {resultado !== 'em_andamento' && (
          <span className="rounded-full border border-amber/40 text-amber px-2 py-0.5">resultado: {resultado}</span>
        )}
      </div>

      <div className="rounded-xl bg-surface border border-line p-3 h-[46vh] md:h-[52vh] overflow-y-auto space-y-2">
        {msgs.map((m0, i) => {
          if (m0.de === 'sys') {
            return <p key={i} className="text-center text-[11px] text-ink-3 py-1">{m0.texto}</p>
          }
          const emo = m0.de === 'ia' ? m0.texto.match(/^\[([^\]]+)\]\s*/) : null
          const corpo = emo ? m0.texto.slice(emo[0].length) : m0.texto
          return (
            <div key={i} className={`flex ${m0.de === 'eu' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m0.de === 'eu' ? 'bg-sinal/15 border border-sinal/30'
                  : 'bg-surface-2 border border-line'}`}>
                {emo && (
                  <span className="inline-block text-[9px] font-bold tracking-wider text-violet bg-violet/10 border border-violet/30 rounded px-1.5 mb-1">
                    {emo[1].toUpperCase()}
                  </span>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{corpo}</p>
                {m0.de === 'ia' && (
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => ouvir(m0.texto, i)} disabled={tocando !== null}
                      className="text-[10px] text-sinal disabled:opacity-40">
                      {tocando === i ? 'tocando…' : 'ouvir'}
                    </button>
                    {m0.ms != null && <span className="text-[9px] text-ink-3 tabular-nums">{(m0.ms / 1000).toFixed(1)}s</span>}
                    {m0.rag > 0 && <span className="text-[9px] text-sky">{m0.rag} fato(s) da base</span>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {pensando && <p className="text-xs text-ink-3 animate-pulse">Bel está pensando…</p>}
        <div ref={fimRef} />
      </div>

      <form onSubmit={enviar} className="flex gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Responda como se fosse o cliente…" className={campo + ' flex-1'} autoFocus />
        <button disabled={pensando || !texto.trim()}
          className="shrink-0 rounded-lg bg-sinal px-4 font-semibold text-white disabled:opacity-40">
          <Icone nome="seta" tam={14} />
        </button>
      </form>
      <p className="text-[10px] text-ink-3">
        Mesmo cérebro, mesmo prompt e mesma base de conhecimento da ligação real — só sem o telefone.
        O que ela responde aqui é o que ela diria na ligação.
      </p>
    </div>
  )
}

// ---- Histórico das ligações da IA (com player de áudio) ----

const RES_IA = {
  agendou: { t: 'Agendou', c: 'text-sinal border-sinal/40 bg-sinal/10' },
  reuniao_marcada: { t: 'Agendou', c: 'text-sinal border-sinal/40 bg-sinal/10' },
  transferida: { t: 'Transferida', c: 'text-sky border-sky/40 bg-sky/10' },
  sem_interesse: { t: 'Sem interesse', c: 'text-ink-2 border-line' },
  nao_perturbe: { t: 'Não perturbe', c: 'text-danger border-danger/40 bg-danger/10' },
  ligar_depois: { t: 'Ligar depois', c: 'text-amber border-amber/40 bg-amber/10' },
  caixa_postal: { t: 'Caixa postal', c: 'text-ink-3 border-line' },
  em_andamento: { t: 'Incompleta', c: 'text-ink-3 border-line' },
}

// ---- Relatório por campanha ----

function RelatorioIA({ campanhas }) {
  const [linhas, setLinhas] = useState([])
  const [wppFila, setWppFila] = useState(0)

  useEffect(() => {
    supabase.from('ia_chamadas')
      .select('campanha_id, status, duracao_seg, capturado')
      .order('criado_em', { ascending: false }).limit(2000)
      .then(({ data }) => setLinhas(data || []))
    supabase.from('wpp_fila').select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando_api')
      .then(({ count }) => setWppFila(count || 0))
  }, [])

  const porCamp = campanhas.map((c) => {
    const ls = linhas.filter((l) => l.campanha_id === c.id)
    const feitas = ls.filter((l) => ['concluida', 'sem_resposta', 'falhou'].includes(l.status))
    const atendidas = ls.filter((l) => l.status === 'concluida')
    const res = (r) => ls.filter((l) => l.capturado?._resultado === r).length
    const durTotal = atendidas.reduce((s, l) => s + (l.duracao_seg || 0), 0)
    const agendou = res('agendou') + res('transferida')
    return {
      camp: c, total: ls.length, feitas: feitas.length, atendidas: atendidas.length,
      agendou, semInteresse: res('sem_interesse'), naoPerturbe: res('nao_perturbe'),
      ligarDepois: res('ligar_depois'), caixaPostal: res('caixa_postal'),
      durMedia: atendidas.length ? Math.round(durTotal / atendidas.length) : 0,
      custo: (atendidas.length * 0.19).toFixed(2),
      txAtende: feitas.length ? Math.round((atendidas.length / feitas.length) * 100) : 0,
      txAgenda: atendidas.length ? Math.round((agendou / atendidas.length) * 100) : 0,
    }
  })

  const Metrica = ({ v, r, cor = '' }) => (
    <div className="rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-center">
      <span className={`block text-base font-bold tabular-nums ${cor}`}>{v}</span>
      <span className="block text-[9px] text-ink-3 uppercase tracking-wide">{r}</span>
    </div>
  )

  return (
    <div className="space-y-3">
      {wppFila > 0 && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5 text-xs text-amber">
          {wppFila} mensagem(ns) de WhatsApp na fila — serão enviadas quando a API for conectada.
        </div>
      )}
      {porCamp.map(({ camp, ...m }) => (
        <div key={camp.id} className="rounded-xl bg-surface border border-line p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{camp.nome}</span>
            <span className="text-[10px] text-violet">{TIPOS_CAMPANHA[camp.tipo]?.rotulo || camp.tipo}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Metrica v={m.total} r="na base" />
            <Metrica v={m.atendidas} r="atendidas" />
            <Metrica v={`${m.txAtende}%`} r="atendimento" />
            <Metrica v={`${m.txAgenda}%`} r="conversão" cor="text-sinal" />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Metrica v={m.agendou} r="agendou" cor="text-sinal" />
            <Metrica v={m.ligarDepois} r="ligar depois" cor="text-amber" />
            <Metrica v={m.semInteresse} r="sem interesse" />
            <Metrica v={m.naoPerturbe} r="não perturbe" cor="text-danger" />
          </div>
          <p className="text-[10px] text-ink-3 tabular-nums">
            {m.caixaPostal} caixa postal · {m.durMedia}s de conversa média · ~R$ {m.custo} gasto em IA
          </p>
        </div>
      ))}
      {!porCamp.length && (
        <p className="text-center text-sm text-ink-3 py-6">Nenhuma campanha ainda.</p>
      )}
    </div>
  )
}
const ST_IA = {
  pendente: 'na fila', ligando: 'ligando…', concluida: 'concluída',
  sem_resposta: 'não atendeu', falhou: 'falhou',
}

function PlayerIA({ chamada }) {
  const [url, setUrl] = useState(null)
  const [carregando, setCarregando] = useState(false)
  async function ouvir() {
    if (url) return
    setCarregando(true)
    const { data } = await supabase.storage.from('gravacoes')
      .createSignedUrl(chamada.gravacao_url, 3600)
    setUrl(data?.signedUrl || null)
    setCarregando(false)
  }
  if (!chamada.gravacao_url) return <span className="text-[11px] text-ink-3">sem áudio</span>
  if (!url) return (
    <button onClick={ouvir} disabled={carregando}
      className="text-[11px] font-semibold border border-sinal/50 text-sinal rounded-full px-3 py-1 disabled:opacity-50">
      {carregando ? 'carregando…' : '▶ ouvir gravação'}
    </button>
  )
  return <audio controls src={url} className="w-full h-9 mt-1" />
}

function HistoricoIA({ chamadas, recarregar }) {
  const [aberta, setAberta] = useState(null)
  const lista = (chamadas || []).filter((c) => c.status !== 'pendente')

  const fmtData = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-2">
          Toda ligação que a IA fez — com transcrição e áudio pra você ouvir.
        </p>
        <button onClick={recarregar} className="text-[11px] text-ink-2 border border-line rounded-full px-2.5 py-1">
          ↻ atualizar
        </button>
      </div>

      {lista.length === 0 && (
        <div className={`${caixa} p-6 text-center text-sm text-ink-3`}>
          Nenhuma ligação concluída ainda. Assim que a IA ligar, aparece aqui.
        </div>
      )}

      {lista.map((c) => {
        const res = RES_IA[c.capturado?._resultado]
        const dados = Object.entries(c.capturado || {}).filter(([k]) => k !== '_resultado')
        const abertoAgora = aberta === c.id
        return (
          <div key={c.id} className={`${caixa} p-3.5 space-y-2`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {c.leads?.empresa || c.numero}
                </p>
                <p className="text-[11px] text-ink-3 tabular-nums">
                  {c.numero} · {fmtData(c.atualizado_em)}
                  {c.campanhas_ia?.nome ? ` · ${c.campanhas_ia.nome}` : ''}
                </p>
              </div>
              {res
                ? <span className={`shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 border ${res.c}`}>{res.t}</span>
                : <span className="shrink-0 text-[10px] text-ink-3 rounded-full px-2 py-0.5 border border-line">{ST_IA[c.status] || c.status}</span>}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-ink-2 tabular-nums">
              {c.duracao_seg ? <span>{c.duracao_seg}s</span> : null}
              {c.etapa_atual ? <span className="text-violet">→ {c.etapa_atual}</span> : null}
            </div>

            {dados.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dados.map(([k, v]) => (
                  <span key={k} className="text-[11px] bg-surface-2 border border-line rounded-md px-2 py-0.5">
                    <span className="text-ink-3">{k}:</span> <span className="text-sinal">{String(v)}</span>
                  </span>
                ))}
              </div>
            )}

            <PlayerIA chamada={c} />

            {c.transcricao && (
              <>
                <button onClick={() => setAberta(abertoAgora ? null : c.id)}
                  className="text-[11px] text-sinal font-semibold">
                  {abertoAgora ? 'ocultar conversa' : 'ver conversa'}
                </button>
                {abertoAgora && (
                  <div className="rounded-lg bg-surface-2 border border-line p-2.5 max-h-64 overflow-y-auto">
                    <p className="text-xs text-ink-2 whitespace-pre-wrap leading-relaxed">{c.transcricao}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

const TIPOS = [
  { id: 'conhecimento', rotulo: 'Conhecimento', icone: 'arquivo', cor: 'text-sky border-sky/40' },
  { id: 'produto', rotulo: 'Produto', icone: 'alvo', cor: 'text-sinal border-sinal/40' },
  { id: 'objecao', rotulo: 'Objeção', icone: 'trava', cor: 'text-amber border-amber/40' },
  { id: 'processo', rotulo: 'Processo', icone: 'ajuste', cor: 'text-violet border-violet/40' },
  { id: 'institucional', rotulo: 'Institucional', icone: 'pino', cor: 'text-danger border-danger/40' },
]
const tipoInfo = (id) => TIPOS.find((t) => t.id === id) || TIPOS[0]
const VAZIO = { item_id: null, tipo: 'conhecimento', campanha_id: '', assunto: '', gatilhos: '', resposta: '' }

function Conhecimento({ campanhas }) {
  const [itens, setItens] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [form, setForm] = useState(VAZIO)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  async function invocar(body) {
    const { data } = await supabase.functions.invoke('conhecimento', { body })
    return data
  }
  async function carregar() { setItens((await invocar({ acao: 'listar' }))?.itens || []) }
  useEffect(() => { carregar() }, [])

  function novo(tipo) { setForm({ ...VAZIO, tipo }); setEditando(true); setMsg('') }
  function abrirEdicao(it) {
    setForm({
      item_id: it.item_id, tipo: it.tipo, campanha_id: it.campanha_id || '',
      assunto: it.assunto || '', gatilhos: it.gatilhos.join('\n'), resposta: it.resposta,
    })
    setEditando(true); setMsg('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(e) {
    e.preventDefault()
    const gatilhos = form.gatilhos.split('\n').map((g) => g.trim()).filter(Boolean)
    if (!gatilhos.length || !form.resposta.trim()) { setMsg('Escreva ao menos uma variação e a resposta.'); return }
    setSalvando(true); setMsg('')
    const r = await invocar({
      acao: 'salvar', item_id: form.item_id, tipo: form.tipo,
      campanha_id: form.campanha_id || null, assunto: form.assunto || null,
      gatilhos, resposta: form.resposta.trim(),
    })
    setSalvando(false)
    if (r?.erro) { setMsg(r.erro); return }
    setEditando(false); setForm(VAZIO); carregar()
  }

  async function excluir(item_id, assunto) {
    if (!confirm(`Excluir "${assunto || 'este item'}" da base?`)) return
    await invocar({ acao: 'excluir', item_id }); carregar()
  }

  const visiveis = filtro === 'todos' ? itens : itens.filter((i) => i.tipo === filtro)
  const contagem = (t) => itens.filter((i) => i.tipo === t).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-2">
        Tudo aqui alimenta a <b>mesma inteligência</b> da IA. Cadastre <b>variações</b> de como o cliente
        pode perguntar (uma por linha) + a <b>resposta certa</b>. A IA entende pelo significado e responde
        <b> só</b> com o que está na base — sem inventar.
      </p>

      {editando ? (
        <form onSubmit={salvar} className={`${caixa} p-3 space-y-2 border-sinal/40`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{form.item_id ? 'Editar item' : 'Novo item'}</p>
            <button type="button" onClick={() => { setEditando(false); setForm(VAZIO) }} className="text-xs text-ink-2">cancelar</button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {TIPOS.map((t) => (
              <button type="button" key={t.id} onClick={() => setForm({ ...form, tipo: t.id })}
                className={`text-xs rounded-full px-3 py-1 border ${form.tipo === t.id ? t.cor + ' bg-white/5' : 'border-line text-ink-3'}`}>
                <Icone nome={t.icone} tam={12} className="inline mr-1 -mt-0.5" />{t.rotulo}
              </button>
            ))}
          </div>
          <select value={form.campanha_id} onChange={(e) => setForm({ ...form, campanha_id: e.target.value })} className={campo}>
            <option value="">Vale para todas as campanhas</option>
            {campanhas.map((c) => <option key={c.id} value={c.id}>Só na campanha: {c.nome}</option>)}
          </select>
          <input placeholder="Assunto / nome (ex.: Preço, Plano Premium, Garantia)" value={form.assunto}
            onChange={(e) => setForm({ ...form, assunto: e.target.value })} className={campo} />
          <textarea rows={4} value={form.gatilhos} onChange={(e) => setForm({ ...form, gatilhos: e.target.value })} className={campo}
            placeholder={'Variações da pergunta (uma por linha):\nquanto custa\né caro?\ntem mensalidade?'} />
          <textarea rows={3} value={form.resposta} onChange={(e) => setForm({ ...form, resposta: e.target.value })} className={campo}
            placeholder="Resposta que a IA pode dar sobre este assunto" />
          {msg && <p className="text-xs text-amber">{msg}</p>}
          <button disabled={salvando} className="w-full rounded-lg bg-sinal py-2 font-semibold text-white disabled:opacity-50">
            {salvando ? 'Vetorizando…' : (form.item_id ? 'Salvar alterações' : 'Cadastrar')}
          </button>
        </form>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => novo(t.id)} className={`text-xs ${caixa} px-3 py-2 font-semibold`}>
              + <Icone nome={t.icone} tam={12} className="inline mx-1 -mt-0.5" />{t.rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap pt-1">
        <button onClick={() => setFiltro('todos')}
          className={`text-xs rounded-full px-3 py-1 border ${filtro === 'todos' ? 'border-slate-400 text-ink' : 'border-line text-ink-3'}`}>
          Todos ({itens.length})
        </button>
        {TIPOS.filter((t) => contagem(t.id) > 0).map((t) => (
          <button key={t.id} onClick={() => setFiltro(t.id)}
            className={`text-xs rounded-full px-3 py-1 border ${filtro === t.id ? t.cor : 'border-line text-ink-3'}`}>
            <Icone nome={t.icone} tam={12} className="inline mr-1 -mt-0.5" />{t.rotulo} ({contagem(t.id)})
          </button>
        ))}
      </div>

      {visiveis.map((it) => {
        const ti = tipoInfo(it.tipo)
        return (
          <div key={it.item_id} className={`${caixa} px-4 py-3 space-y-1.5`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm">
                <span className={`text-[10px] border rounded-full px-2 py-0.5 mr-1.5 ${ti.cor}`}>{ti.icone} {ti.rotulo}</span>
                {it.assunto}
              </p>
              <span className="flex gap-2 shrink-0">
                <button onClick={() => abrirEdicao(it)} className="text-xs text-sinal">editar</button>
                <button onClick={() => excluir(it.item_id, it.assunto)} className="text-xs text-ink-3 hover:text-danger">excluir</button>
              </span>
            </div>
            <p className="text-sm text-ink-2">{it.resposta}</p>
            <div className="flex flex-wrap gap-1">
              {it.gatilhos.map((g, i) => (
                <span key={i} className="text-[11px] bg-surface-2 border border-line rounded-full px-2 py-0.5 text-ink-2">{g}</span>
              ))}
            </div>
          </div>
        )
      })}
      {visiveis.length === 0 && <p className="text-xs text-ink-3 text-center py-4">Nada nesta categoria ainda.</p>}
    </div>
  )
}

function Scripts() {
  const [scripts, setScripts] = useState([])
  const [editando, setEditando] = useState(null) // null | 'novo' | id
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')

  async function carregar() {
    const { data } = await supabase.from('scripts').select('*').order('ordem')
    setScripts(data || [])
  }
  useEffect(() => { carregar() }, [])

  function abrirNovo() { setEditando('novo'); setTitulo(''); setConteudo('') }
  function abrirEdicao(s) { setEditando(s.id); setTitulo(s.titulo); setConteudo(s.conteudo) }

  async function salvar(e) {
    e.preventDefault()
    if (editando === 'novo') {
      await supabase.from('scripts').insert({ titulo, conteudo, ordem: scripts.length })
    } else {
      await supabase.from('scripts').update({ titulo, conteudo }).eq('id', editando)
    }
    setEditando(null); carregar()
  }

  async function alternarAtivo(s) {
    await supabase.from('scripts').update({ ativo: !s.ativo }).eq('id', s.id)
    carregar()
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-ink-2">
        O script aparece na tela do mentor durante a ligação. Use <code className="text-sinal">{'{empresa}'}</code> e{' '}
        <code className="text-sinal">{'{mentor}'}</code> — são trocados pelos nomes reais ({'{vendedor}'} antigo segue valendo).
      </p>
      <button onClick={abrirNovo} className={`w-full ${caixa} py-2.5 text-sm font-semibold`}>+ Novo script</button>

      {editando && (
        <form onSubmit={salvar} className={`${caixa} p-3 space-y-2`}>
          <input required placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
          <textarea required rows={8} placeholder="Texto do script…" value={conteudo} onChange={(e) => setConteudo(e.target.value)} className={campo} />
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-sinal py-2 font-semibold text-white">Salvar</button>
            <button type="button" onClick={() => setEditando(null)} className={`flex-1 ${caixa} py-2 text-sm`}>Cancelar</button>
          </div>
        </form>
      )}

      {scripts.map((s) => (
        <div key={s.id} className={`${caixa} px-4 py-3 flex items-center gap-3`}>
          <button onClick={() => abrirEdicao(s)} className="flex-1 text-left">
            <span className="block font-medium text-sm">{s.titulo}</span>
            <span className="block text-xs text-ink-3 truncate">{s.conteudo.slice(0, 60)}…</span>
          </button>
          <button onClick={() => alternarAtivo(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${s.ativo ? 'border-sinal/50 text-sinal' : 'border-danger/50 text-danger'}`}>
            {s.ativo ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      ))}
    </div>
  )
}

function Chaves() {
  const [chaves, setChaves] = useState([])
  const [provedor, setProvedor] = useState('rapidapi_maps')
  const [chave, setChave] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [mensagem, setMensagem] = useState('')

  async function carregar() {
    const { data } = await supabase.from('chaves_api').select('*').order('criado_em')
    setChaves(data || [])
  }
  useEffect(() => { carregar() }, [])

  async function adicionar(e) {
    e.preventDefault()
    const { error } = await supabase.from('chaves_api').insert({ provedor, chave: chave.trim(), rotulo })
    setMensagem(error ? 'Erro ao salvar.' : 'Chave cadastrada.')
    if (!error) { setChave(''); setRotulo(''); carregar() }
  }

  async function alternar(c) {
    await supabase.from('chaves_api').update({ ativa: !c.ativa }).eq('id', c.id)
    carregar()
  }

  const nomes = {
    rapidapi_maps: 'Google Maps (RapidAPI)',
    fish_audio: 'Fish Audio (voz da IA)',
    openrouter: 'OpenRouter (cérebro da IA)',
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-ink-2">
        Cadastre quantas chaves quiser do Google Maps — quando a cota de uma esgota
        (1.000 buscas/hora no plano grátis), o sistema pula sozinho para a próxima.
      </p>
      <form onSubmit={adicionar} className={`${caixa} p-3 space-y-2`}>
        <select value={provedor} onChange={(e) => setProvedor(e.target.value)} className={campo}>
          <option value="rapidapi_maps">Google Maps (RapidAPI)</option>
          <option value="fish_audio">Fish Audio (voz da IA)</option>
          <option value="openrouter">OpenRouter (cérebro da IA)</option>
        </select>
        <input required placeholder="Chave (x-rapidapi-key)" value={chave} onChange={(e) => setChave(e.target.value)} className={campo} />
        <input placeholder="Rótulo (ex.: conta 1)" value={rotulo} onChange={(e) => setRotulo(e.target.value)} className={campo} />
        {mensagem && <p className="text-xs text-sinal">{mensagem}</p>}
        <button className="w-full rounded-lg bg-sinal py-2 font-semibold text-white">Cadastrar chave</button>
      </form>

      {chaves.map((c) => (
        <div key={c.id} className={`${caixa} px-4 py-3 flex items-center gap-3`}>
          <span className="flex-1">
            <span className="block text-sm font-medium">{nomes[c.provedor] || c.provedor}{c.rotulo ? ` · ${c.rotulo}` : ''}</span>
            <span className="block text-xs text-ink-3">
              …{c.chave.slice(-6)}
              {c.esgotada_ate && new Date(c.esgotada_ate) > new Date()
                ? ` · cota esgotada até ${new Date(c.esgotada_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </span>
          </span>
          <button onClick={() => alternar(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${c.ativa ? 'border-sinal/50 text-sinal' : 'border-danger/50 text-danger'}`}>
            {c.ativa ? 'Ativa' : 'Inativa'}
          </button>
        </div>
      ))}
    </div>
  )
}
