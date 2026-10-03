import { useEffect, useRef, useState } from 'react'
import { supabase, erroDaFuncao } from '../lib/supabase'
import { linkProposta, linkWhatsappProposta } from '../lib/whatsapp'
import AgendarMentoria from './AgendarMentoria'
import Icone from './Icone'
import CalendarioRetorno from './CalendarioRetorno'

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm'

function fmtQuando(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Celular brasileiro: DDD + 9 dígitos começando em 9. Fixo (8 dígitos) não
// tem WhatsApp — o botão nem aparece, para ninguém abrir conversa que não existe.
function ehCelular(bruto) {
  const d = String(bruto || '').replace(/\D/g, '').replace(/^55/, '')
  return d.length === 11 && d[2] === '9'
}
const ehEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())

// Link da proposta e mensagem do WhatsApp: centralizados em lib/whatsapp.js
// (o mesmo texto sai do discador, do pós-ligação e da tela de Contatos).

// E-mail: curto e direto, com o link da proposta desenhada fazendo o trabalho
// visual. Sai pelo próprio PABX (Resend) — antes abria o programa do vendedor
// por `mailto:`, e metade nunca era enviada de fato. O `mailto:` fica de
// reserva para quando o envio pelo sistema não estiver disponível.
// Assunto que parece conversa, não campanha: quem atendeu a ligação
// reconhece o contexto, e o filtro não vê texto de mala direta.
const ASSUNTO_EMAIL = 'Nossa conversa de hoje — Babel OS'
function corpoEmail(ctx) {
  return [
    'Olá!',
    '',
    'Nos falamos agora por ligação. Preparei a nossa apresentação do',
    'Sistema Operacional Babel OS para você ver com calma:',
    '',
    linkProposta(ctx),
    '',
    'Tenho certeza que irá gostar — qualquer dúvida, é só responder',
    'este e-mail ou chamar no WhatsApp.',
    '',
    'Obrigado pelo retorno!',
    '',
    '—',
    ctx.vendedor || 'Equipe comercial',
    'Babel OS · babel-os.com',
  ].join('\n')
}
function corpoEmailHtml(ctx) {
  const url = linkProposta(ctx)
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111">
<p>Olá!</p>
<p>Nos falamos agora por ligação. Preparei a nossa apresentação do
<b>Sistema Operacional Babel OS</b> para você ver com calma:</p>
<p style="margin:22px 0">
  <a href="${url}" style="background:#3080ff;color:#fff;text-decoration:none;
     padding:13px 26px;border-radius:6px;font-weight:600;display:inline-block">Ver a apresentação</a>
</p>
<p>Tenho certeza que irá gostar — qualquer dúvida, é só responder este e-mail
ou chamar no WhatsApp.</p>
<p>Obrigado pelo retorno!</p>
<p style="color:#666;font-size:13px;margin-top:26px">
  ${ctx.vendedor || 'Equipe comercial'}<br>Babel&nbsp;OS · babel-os.com
</p></div>`
}

function linkEmail(para, ctx) {
  return `mailto:${encodeURIComponent(String(para || '').trim())}`
    + `?subject=${encodeURIComponent(ASSUNTO_EMAIL)}`
    + `&body=${encodeURIComponent(corpoEmail(ctx))}`
}

// Os desfechos do novo fluxo (spec 2026-08-06): 1 toque salva na ligação
// (calls.desfecho), aplica o efeito no lead e — em modo sessão — dispara o
// próximo contato em 5s (traz o lead; a discagem é do vendedor).
// É daqui que nasce o placar-funil.
const DESFECHOS = [
  { id: 'nao_atendeu', icone: 'perdida', rotulo: 'Não atendeu' },
  { id: 'caixa_postal', icone: 'voicemail', rotulo: 'Caixa postal' },
  { id: 'ocupado', icone: 'ocupado', rotulo: 'Ocupado / caiu' },
  { id: 'numero_errado', icone: 'errado', rotulo: 'Número errado' },
  // chave 'em_contato' no banco por compatibilidade (já tem registro de campo)
  { id: 'em_contato', icone: 'cartao', rotulo: 'Passou o contato', abre: 'contato' },
  { id: 'sem_interesse', icone: 'recusa', rotulo: 'Sem interesse' },
  { id: 'desligou', icone: 'desligada', rotulo: 'Desligou' },
  { id: 'retorno', icone: 'relogio', rotulo: 'Retorno…', abre: 'retorno' },
  { id: 'reuniao', icone: 'calcheck', rotulo: 'Reunião…', abre: 'mentoria', cheio: true },
]

export default function Desfecho({ lead, numero, dados = {}, perfil, aoFechar, aoProximo, aoRediscar,
  legendas = [] }) {
  const [obs, setObs] = useState('')
  const [desfecho, setDesfecho] = useState(null)   // id escolhido
  const [painel, setPainel] = useState(null)       // null | retorno | mentoria
  const [feitos, setFeitos] = useState([])
  const [erro, setErro] = useState('')
  const [dataRetorno, setDataRetorno] = useState('')
  const [retornoMarcado, setRetornoMarcado] = useState(false)
  const [proximoEm, setProximoEm] = useState(null) // segundos até o próximo | null
  const [indo, setIndo] = useState(false)
  // "Passou o contato": o atendente deu o contato do decisor
  const [contato, setContato] = useState({ nome: '', zap: '', email: '' })
  const [emailVendedor, setEmailVendedor] = useState('')
  const [puxando, setPuxando] = useState(false)
  const [msgPuxar, setMsgPuxar] = useState('')

  // o e-mail de quem está logado vira o "responder para" da proposta
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmailVendedor(data?.user?.email || ''))
  }, [])
  const [enviando, setEnviando] = useState(false)
  const [envio, setEnvio] = useState(null)   // {ok} | {erro}
  const obsRef = useRef('')
  obsRef.current = obs

  // Data escolhida mas não confirmada: sair salva junto — o retorno nunca se
  // perde (caso Adrian 04/08).
  const retornoPendente = painel === 'retorno' && dataRetorno && !retornoMarcado

  function registrou(msg) {
    setFeitos((f) => [...f, msg])
    setPainel(null); setErro('')
  }

  async function registrar(id) {
    const { error } = await supabase.rpc('registrar_desfecho', {
      _lead_id: lead?.id ?? null, _numero: numero || null, _desfecho: id, _nota: null,
    })
    if (error) { setErro(error.message); return false }
    return true
  }

  // Manda pelo próprio sistema. Se o envio não estiver disponível (chave
  // ausente, limite atingido), avisa e oferece o caminho antigo — nunca deixa
  // o vendedor sem saída com o lead esperando.
  async function enviarProposta() {
    if (!ehEmail(contato.email) || enviando) return
    setEnviando(true); setEnvio(null)
    salvarContato()
    const { data, error } = await supabase.functions.invoke('enviar-email', {
      body: {
        para: contato.email.trim(),
        assunto: ASSUNTO_EMAIL,
        html: corpoEmailHtml(ctxProposta),
        texto: corpoEmail(ctxProposta),
        lead_id: lead?.id ?? null,
        responder_para: ctxProposta.emailVendedor || null,
      },
    })
    const msg = data?.erro || (error ? await erroDaFuncao(error) : null)
    setEnvio(msg ? { erro: msg } : { ok: true })
    setEnviando(false)
  }

  function iniciarContagem() {
    if (aoProximo) setProximoEm(5)
  }

  // 1 toque: salva o desfecho e arma o próximo contato
  async function tocar(d) {
    setErro('')
    if (d.abre) {
      setDesfecho(d.id)
      setProximoEm(null)
      setPainel(painel === d.abre ? null : d.abre)
      return
    }
    setPainel(null)
    setDesfecho(d.id)
    if (!(await registrar(d.id))) { setDesfecho(null); return }
    iniciarContagem()
  }

  // contagem regressiva → próximo contato
  useEffect(() => {
    if (proximoEm == null) return
    if (proximoEm <= 0) { irProximo(); return }
    const t = setTimeout(() => setProximoEm((s) => (s == null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [proximoEm]) // eslint-disable-line react-hooks/exhaustive-deps

  // teclas 1–9 marcam o desfecho no desktop; espaço segura a contagem
  useEffect(() => {
    function aoTeclar(e) {
      if (painel || indo) return
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === ' ' && proximoEm != null) { e.preventDefault(); setProximoEm(null); return }
      const i = Number(e.key) - 1
      if (i >= 0 && i < DESFECHOS.length) tocar(DESFECHOS[i])
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [painel, proximoEm, indo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function marcarRetorno(quando) {
    setErro('')
    const { error } = await supabase.rpc('agendar_retorno', {
      _lead_id: lead.id, _quando: quando.toISOString(),
    })
    if (error) { setErro(error.message); return false }
    setRetornoMarcado(true)
    await registrar('retorno')
    registrou(`Retorno marcado para ${fmtQuando(quando)}`)
    iniciarContagem()
    return true
  }
  function retornoEmDias(dias) {
    const d = new Date(Date.now() + dias * 86400000)
    d.setHours(9, 0, 0, 0)
    marcarRetorno(d)
  }

  // nota da ligação: fica no histórico da chamada e no lead — é o contexto
  // que o próximo a ligar vê antes do alô
  async function salvarNota() {
    const texto = obsRef.current.trim()
    if (!texto) return
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('notas_chamada').insert({
      ramal: perfil.ramal, numero: numero || null, texto, autor: user.id,
    })
    if (lead?.id) {
      await supabase.from('lead_eventos').insert({
        lead_id: lead.id, tipo: 'nota',
        descricao: `Observação da ligação: ${texto}`, autor: user.id,
      })
    }
  }

  async function salvarPendencias() {
    if (retornoPendente) {
      const ok = await marcarRetorno(new Date(dataRetorno))
      if (!ok) return false
    }
    await salvarNota()
    return true
  }

  async function irProximo() {
    if (indo) return
    setIndo(true); setProximoEm(null)
    if (!(await salvarPendencias())) { setIndo(false); return }
    aoProximo?.()
  }

  async function encerrar() {
    if (indo) return
    setIndo(true); setProximoEm(null)
    if (!(await salvarPendencias())) { setIndo(false); return }
    aoFechar()
  }

  // WhatsApp: o link abre em outra aba (o href faz isso sozinho); aqui só
  // registramos no histórico do lead que a apresentação foi enviada.
  async function registrarWhatsapp() {
    setProximoEm(null)      // não deixa o contador levar a tela embora no meio
    registrou('Apresentação enviada no WhatsApp')
    if (!lead?.id) return
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('lead_eventos').insert({
      lead_id: lead.id, tipo: 'nota',
      descricao: 'Apresentação enviada no WhatsApp após a ligação', autor: user.id,
    })
  }

  // Guarda o contato que o atendente passou: nome vai para o lead, WhatsApp e
  // e-mail entram no dossiê (é de lá que o Diagnóstico e o levantamento leem).
  async function salvarContato() {
    if (!lead?.id) return true
    const novo = {}
    if (contato.zap.trim()) novo.telefone_contato = contato.zap.trim()
    if (contato.email.trim()) novo.email_contato = contato.email.trim()
    if (contato.nome.trim()) novo.nome_atendente = contato.nome.trim()
    if (!Object.keys(novo).length) return true
    const { error } = await supabase.rpc('consolidar_dossie', { _lead_id: lead.id, _novo: novo })
    if (error) { setErro(error.message); return false }
    if (contato.nome.trim()) {
      await supabase.from('leads').update({ contato_nome: contato.nome.trim() }).eq('id', lead.id)
    }
    return true
  }

  // Registra o desfecho "passou o contato" e guarda o que foi preenchido
  async function confirmarContato() {
    setErro('')
    if (!(await salvarContato())) return
    if (!(await registrar('em_contato'))) return
    setDesfecho('em_contato')
    const partes = [contato.nome.trim(), contato.zap.trim(), contato.email.trim()].filter(Boolean)
    registrou(`Contato salvo${partes.length ? `: ${partes.join(' · ')}` : ''}`)
    iniciarContagem()
  }

  // Puxa da própria ligação o que a pessoa ditou: quem atendeu, telefone e
  // e-mail. Usa o dossiê da transcrição; se a gravação ainda não virou texto,
  // manda as legendas que o navegador capturou ao vivo.
  async function puxarDaLigacao() {
    setPuxando(true); setMsgPuxar(''); setErro('')
    const { data, error } = await supabase.functions.invoke('extrair-contato', {
      body: { numero: numero || null, texto_ao_vivo: legendas.join('\n').slice(0, 12000) },
    })
    setPuxando(false)
    if (error || data?.erro) {
      setMsgPuxar(await erroDaFuncao(error, data) || 'Não consegui ler a ligação agora.')
      return
    }
    const achou = [data.nome_atendente, data.telefone_contato, data.email_contato].filter(Boolean)
    if (!achou.length) {
      setMsgPuxar(data.aviso || 'Nada de contato foi dito nesta ligação.')
      return
    }
    setContato({
      nome: data.nome_atendente || contato.nome,
      zap: data.telefone_contato || contato.zap,
      email: data.email_contato || contato.email,
    })
    setDesfecho('em_contato')
    setPainel('contato')
    setProximoEm(null)
    setMsgPuxar(data.fonte === 'ao_vivo'
      ? 'Puxado da conversa ao vivo — confira antes de salvar.'
      : 'Puxado da transcrição da ligação.')
  }

  // Ligar de novo para o mesmo número — a chamada caiu, ou ficou de retomar agora
  async function rediscar() {
    if (indo) return
    setIndo(true); setProximoEm(null)
    if (!(await salvarPendencias())) { setIndo(false); return }
    aoRediscar?.(numero)
  }

  // contexto que vai no link da proposta (nome da empresa e de quem ligou)
  const ctxProposta = {
    empresa: lead?.empresa || '',
    vendedor: perfil?.nome || '',
    emailVendedor: emailVendedor,
    zapVendedor: perfil?.whatsapp || '',
  }

  const desfechoSel = DESFECHOS.find((d) => d.id === desfecho)
  const prontoParaProximo = !!aoProximo && !!desfecho && (!desfechoSel?.abre || feitos.length > 0)

  return (
    <div className="flex flex-col gap-3 p-4 max-w-sm md:max-w-md mx-auto anim-in">
      <div className={`${caixa} p-4 space-y-2`}>
        <p className="font-semibold">Ligação encerrada</p>
        <p className="text-sm text-ink-2">{lead?.empresa || numero}</p>
        {Object.keys(dados).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(dados).map(([k, v]) => (
              <span key={k} className="text-xs bg-sinal/10 border border-sinal/30 text-sinal rounded-full px-2.5 py-1">
                {k}: <b>{v}</b>
              </span>
            ))}
          </div>
        )}
        {feitos.map((f, i) => (
          <p key={i} className="text-xs font-semibold text-sinal bg-sinal/10 border border-sinal/30 rounded-lg px-3 py-1.5">{f}</p>
        ))}

        {/* ações imediatas: mandar a apresentação no zap e ligar de novo */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {ehCelular(numero) && (
            <a href={linkWhatsappProposta(numero, ctxProposta)} target="_blank" rel="noopener noreferrer"
              onClick={registrarWhatsapp}
              className="flex-1 min-w-[8.5rem] inline-flex items-center justify-center gap-1.5 rounded-lg border border-sinal/50 text-sinal px-2 py-2 text-xs font-bold">
              <Icone nome="whatsapp" tam={13} className="shrink-0" />
              <span className="truncate">WhatsApp</span>
            </a>
          )}
          <button onClick={puxarDaLigacao} disabled={puxando || indo}
            className="flex-1 min-w-[8.5rem] inline-flex items-center justify-center gap-1.5 rounded-lg border border-sinal/50 text-sinal px-2 py-2 text-xs font-bold disabled:opacity-50">
            <Icone nome="busca" tam={13} className="shrink-0" />
            <span className="truncate">{puxando ? 'Lendo a ligação…' : 'Puxar dados da ligação'}</span>
          </button>
          {aoRediscar && (
            <button onClick={rediscar} disabled={indo}
              className="flex-1 min-w-[8.5rem] inline-flex items-center justify-center gap-1.5 rounded-lg border border-line text-ink-2 px-2 py-2 text-xs font-bold disabled:opacity-40">
              <Icone nome="rediscar" tam={13} className="shrink-0" />
              <span className="truncate">Ligar de novo</span>
            </button>
          )}
        </div>
        {msgPuxar && <p className="text-[11px] text-ink-2 leading-snug">{msgPuxar}</p>}
      </div>

      {/* desfecho em 1 toque — obrigatório antes do próximo */}
      <div className={`${caixa} p-3 space-y-2`}>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">O que aconteceu?</p>
          <span className="hidden md:inline text-[10px] text-ink-3 tnum">teclas 1–9</span>
        </div>
        {/* 2 colunas; o rótulo QUEBRA em vez de truncar — em aparelho estreito
            "Passou em contato" virava "Passou em con…". Reunião ocupa a linha
            inteira: é a ação mais importante e o total é ímpar. */}
        <div className="grid grid-cols-2 gap-1.5">
          {DESFECHOS.map((d) => {
            const ativo = desfecho === d.id
            const bloqueado = d.id === 'retorno' && !lead?.id
            return (
              <button key={d.id} onClick={() => tocar(d)} disabled={bloqueado || indo}
                title={bloqueado ? 'Ligação sem lead vinculado' : ''}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-2.5 text-[11px] leading-tight font-semibold transition disabled:opacity-30 text-left min-w-0 ${
                  d.cheio ? 'col-span-2 justify-center' : ''} ${
                  ativo ? 'border-sinal bg-sinal/15 text-sinal'
                    : d.cheio ? 'border-transparent bg-sinal text-white'
                    : d.abre ? 'border-sinal/50 text-sinal'
                    : 'border-line text-ink-2'}`}>
                <Icone nome={d.icone} tam={14} className="shrink-0" />
                <span className="min-w-0">{d.rotulo}</span>
              </button>
            )
          })}
        </div>

        {painel === 'retorno' && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {[['Amanhã 9h', 1], ['3 dias', 3], ['1 semana', 7], ['15 dias', 15], ['1 mês', 30]].map(([rotulo, dias]) => (
                <button key={rotulo} onClick={() => retornoEmDias(dias)}
                  className="text-xs border border-sinal/40 text-sinal rounded-full px-3 py-1.5">
                  {rotulo}
                </button>
              ))}
            </div>
            {/* calendário com a agenda real de quem está logado: dia com bolinha
                já tem compromisso, e o horário mostra o que está ocupado */}
            <CalendarioRetorno aoEscolher={(quando) => {
              const p = (n) => String(n).padStart(2, '0')
              setDataRetorno(`${quando.getFullYear()}-${p(quando.getMonth() + 1)}-${p(quando.getDate())}`
                + `T${p(quando.getHours())}:${p(quando.getMinutes())}`)
            }} />
            <input type="datetime-local" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} className={campo} />
            <button onClick={() => dataRetorno && marcarRetorno(new Date(dataRetorno))} disabled={!dataRetorno}
              className="w-full rounded-lg bg-sinal py-2 text-sm font-semibold text-white disabled:opacity-40">
              Marcar retorno{dataRetorno ? ` para ${fmtQuando(dataRetorno)}` : ''}
            </button>
          </div>
        )}

        {/* atendente passou o contato do decisor: anota e já fala com ele */}
        {painel === 'contato' && (
          <div className="space-y-2 pt-1">
            <input value={contato.nome} onChange={(e) => setContato({ ...contato, nome: e.target.value })}
              placeholder="Nome de quem decide" className={campo} />
            <input value={contato.zap} onChange={(e) => setContato({ ...contato, zap: e.target.value })}
              inputMode="tel" placeholder="WhatsApp (DDD + número)" className={campo} />
            <input value={contato.email} onChange={(e) => setContato({ ...contato, email: e.target.value })}
              inputMode="email" placeholder="E-mail" className={campo} />

            <div className="flex flex-wrap gap-1.5">
              <a href={ehCelular(contato.zap) ? linkWhatsappProposta(contato.zap, ctxProposta) : undefined}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => { if (!ehCelular(contato.zap)) { e.preventDefault(); return } salvarContato() }}
                aria-disabled={!ehCelular(contato.zap)}
                className={`flex-1 min-w-[8.5rem] inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold ${
                  ehCelular(contato.zap) ? 'border-sinal/50 text-sinal' : 'border-line text-ink-3 opacity-40 pointer-events-none'}`}>
                <Icone nome="whatsapp" tam={13} className="shrink-0" />
                <span className="truncate">Falar no WhatsApp</span>
              </a>
              <button type="button" onClick={enviarProposta}
                disabled={!ehEmail(contato.email) || enviando || envio?.ok}
                className={`flex-1 min-w-[8.5rem] inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold ${
                  envio?.ok ? 'border-sinal bg-sinal/15 text-sinal'
                    : ehEmail(contato.email) ? 'border-sinal/50 text-sinal'
                    : 'border-line text-ink-3 opacity-40'}`}>
                <Icone nome={envio?.ok ? 'check' : 'email'} tam={13} className="shrink-0" />
                <span className="truncate">
                  {envio?.ok ? 'Proposta enviada' : enviando ? 'Enviando…' : 'Enviar proposta'}
                </span>
              </button>
            </div>
            {envio?.erro && (
              <p className="text-[10px] text-amber leading-snug">
                {envio.erro}{' '}
                <a href={linkEmail(contato.email, ctxProposta)} className="underline text-ink-2">
                  abrir no meu programa de e-mail
                </a>
              </p>
            )}
            <p className="text-[10px] text-ink-3 leading-snug">
              {envio?.ok
                ? 'A proposta saiu de contato@babel-os.com. A resposta do lead volta para você.'
                : 'O sistema envia a proposta desenhada direto para o lead, com o assunto “Proposta Comercial — Babel OS”.'}
            </p>

            <button onClick={confirmarContato}
              disabled={!contato.nome.trim() && !contato.zap.trim() && !contato.email.trim()}
              className="w-full rounded-lg bg-sinal py-2 text-sm font-semibold text-white disabled:opacity-40">
              Salvar contato
            </button>
          </div>
        )}

        {painel === 'mentoria' && (
          <div className="pt-1">
            <AgendarMentoria lead={lead} numero={numero} aoAgendar={(msg) => {
              registrou(msg)
              registrar('reuniao')
              iniciarContagem()
            }} />
          </div>
        )}

        {erro && <p className="text-xs text-danger">{erro}</p>}
      </div>

      {/* nota livre + avanço da sessão */}
      <div className={`${caixa} p-4 space-y-3`}>
        <textarea
          rows={2} value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Nota rápida (opcional) — contexto para a próxima conversa"
          className={campo}
        />
        {retornoPendente && (
          <p className="text-[11px] text-sinal">
            O retorno de {fmtQuando(dataRetorno)} será salvo junto ao sair.
          </p>
        )}

        {proximoEm != null ? (
          <div className="rounded-xl border border-sinal/40 bg-sinal/10 p-3 text-center space-y-2">
            <p className="text-sm font-bold text-sinal tnum">Trazendo o próximo contato em {proximoEm}s</p>
            <p className="text-[11px] text-ink-2 -mt-1">o número entra na tela; ligar é com você</p>
            <div className="flex gap-2">
              <button onClick={() => setProximoEm(null)}
                className="flex-1 rounded-lg border border-line py-2 text-xs font-semibold text-ink-2">
                <Icone nome="pausa" tam={12} className="inline mr-1 -mt-0.5" />Segurar
              </button>
              <button onClick={encerrar}
                className="flex-1 rounded-lg border border-line py-2 text-xs font-semibold text-ink-2">
                <Icone nome="parar" tam={12} className="inline mr-1 -mt-0.5" />Encerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {prontoParaProximo && (
              <button onClick={irProximo} disabled={indo}
                className="flex-[2] rounded-lg bg-sinal py-2.5 font-semibold text-white disabled:opacity-50">
                <Icone nome="play" tam={13} className="inline mr-1.5 -mt-0.5" />
                {indo ? 'Indo…' : 'Próximo contato'}
              </button>
            )}
            <button onClick={encerrar} disabled={indo}
              className="flex-1 rounded-lg border border-line py-2.5 font-semibold text-ink-2 disabled:opacity-50">
              {desfecho || feitos.length > 0 ? 'Concluir' : 'Fechar sem desfecho'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
