import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Dossie } from './Conversa'
import Prancheta from './Prancheta'
import Diagnostico from './Diagnostico'
import Icone from './Icone'
import { PERGUNTAS_PADRAO, carregarPerguntas } from '../lib/perguntas-call'

const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm'

function mmss(seg) {
  return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`
}

// Cockpit da mentoria — só o mentor vê. Cronômetro por fase do funil,
// material de apoio, ficha de abertura (alimenta o dossiê) e dossiê à mão.
export default function Cockpit({ sala, aoApresentar }) {
  const [aberto, setAberto] = useState(true)
  // Trilho da call: prancheta (dossiê aberto) → qualificação → apresentação
  const [estagio, setEstagio] = useState('prancheta')
  // Perguntas configuráveis (Gestão → Mentoria → Perguntas da call)
  const [perguntas, setPerguntas] = useState(PERGUNTAS_PADRAO)
  const [quali, setQuali] = useState({ email: '', nicho_id: '' })
  const [verDiag, setVerDiag] = useState(false)
  const [avancando, setAvancando] = useState(false)
  const [msgAvancar, setMsgAvancar] = useState('')
  const [erroAvancar, setErroAvancar] = useState('')
  const [lead, setLead] = useState(null)
  const [funil, setFunil] = useState(null)
  const [fases, setFases] = useState([])
  const [idx, setIdx] = useState(-1)              // -1 = não começou · fases.length = concluída
  const [inicioFase, setInicioFase] = useState(null)
  const [inicioTotal, setInicioTotal] = useState(null)
  const [seg, setSeg] = useState(0)
  const [verFicha, setVerFicha] = useState(false)
  const [verDossie, setVerDossie] = useState(false)
  const [ficha, setFicha] = useState({ nome_atendente: '', cargo_atendente: '', nome_dono: '', dor: '', desejo: '' })
  const [salvandoFicha, setSalvandoFicha] = useState(false)
  const [fichaOk, setFichaOk] = useState(false)
  const [verAtivar, setVerAtivar] = useState(false)
  const [dadosFicha, setDadosFicha] = useState(null)   // nichos/planos/templates da Babel OS
  const [ativacao, setAtivacao] = useState({ nome: '', email: '', phone: '', document: '', empresa: '', empresa_descricao: '', nicho_id: '', nome_agente: 'Bel' })
  const [criandoConta, setCriandoConta] = useState(false)
  const [contaCriada, setContaCriada] = useState(null) // {email, senha, url, user_id}
  const [erroAtivar, setErroAtivar] = useState('')
  const [verFechar, setVerFechar] = useState(false)
  const [templateSel, setTemplateSel] = useState('')
  const [gerandoContrato, setGerandoContrato] = useState(false)
  const [contrato, setContrato] = useState(null)       // {url, chave_publica}
  const [statusContrato, setStatusContrato] = useState(null)
  const [planoSel, setPlanoSel] = useState('')
  const [comImplantacao, setComImplantacao] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [vendaOk, setVendaOk] = useState(false)
  const [erroFechar, setErroFechar] = useState('')

  // contexto da sala: evento da agenda → lead (com dossiê de prospecção)
  useEffect(() => {
    supabase.from('agenda_eventos')
      .select('id, titulo, lead_id, leads(id, empresa, telefone, dossie, contato_nome, babel_user_id, babel_contrato_chave)')
      .eq('sala_reuniao', sala).limit(1).maybeSingle()
      .then(({ data }) => {
        const l = data?.leads || null
        setLead(l)
        // ficha nasce pré-preenchida com o que o dossiê já capturou — o mentor
        // só completa os buracos, não pergunta de novo o que já sabemos
        const d = l?.dossie
        if (d) {
          setFicha((f) => ({
            nome_atendente: f.nome_atendente || l.contato_nome || d.nome_atendente || '',
            cargo_atendente: f.cargo_atendente || d.cargo || '',
            nome_dono: f.nome_dono || d.nome_dono || '',
            dor: f.dor || d.dor || '',
            desejo: f.desejo || d.desejo || '',
          }))
        }
      })
  }, [sala])

  // funil ativo mais antigo (o padrão da casa) + fases em ordem
  useEffect(() => {
    supabase.from('funis').select('*, funil_fases(*)').eq('ativo', true)
      .order('criado_em').limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setFunil(data)
        setFases((data.funil_fases || []).sort((a, b) => a.ordem - b.ordem))
      })
  }, [])

  useEffect(() => {
    if (!inicioFase) return
    const t = setInterval(() => setSeg(Math.floor((Date.now() - inicioFase) / 1000)), 1000)
    return () => clearInterval(t)
  }, [inicioFase])

  // ao abrir "Ativar sistema": nichos e planos vivos da Babel OS + pré-preenche do lead
  useEffect(() => {
    if (!verAtivar || dadosFicha) return
    supabase.functions.invoke('babelos', { body: { acao: 'dados_ficha' } })
      .then(({ data }) => {
        if (data?.ok) setDadosFicha(data)
        // Sessão velha (senha trocada / token vencido) devolvia 401 MUDO e o
        // seletor de nicho ficava vazio — o erro agora aparece com a saída.
        else setErroAtivar('Sessão expirada — saia do app e entre de novo, aí o erro some.')
      })
    if (lead) {
      setAtivacao((a) => ({
        ...a,
        nome: a.nome || lead.contato_nome || lead.dossie?.nome_atendente || '',
        empresa: a.empresa || lead.empresa || '',
        phone: a.phone || lead.telefone || '',
        document: a.document || lead.dossie?.cnpj || '',
        empresa_descricao: a.empresa_descricao || lead.dossie?.presenca || '',
      }))
    }
  }, [verAtivar])

  // ao abrir "Fechar venda": dados vivos + retoma contrato já gerado nesta sala
  useEffect(() => {
    if (!verFechar) return
    if (!dadosFicha) {
      supabase.functions.invoke('babelos', { body: { acao: 'dados_ficha' } })
        .then(({ data }) => {
          if (data?.ok) setDadosFicha(data)
          else setErroFechar('Sessão expirada — saia do app e entre de novo, aí o erro some.')
        })
    }
    if (!contrato && lead?.babel_contrato_chave) {
      setContrato({ chave_publica: lead.babel_contrato_chave, url: null })
    }
  }, [verFechar])

  // status do contrato ao vivo (assinou? mandou comprovante?)
  useEffect(() => {
    if (!contrato?.chave_publica || vendaOk) return
    let vivo = true
    async function olhar() {
      const { data } = await supabase.functions.invoke('babelos', {
        body: { acao: 'status_contrato', chave_publica: contrato.chave_publica },
      })
      if (vivo && data?.ok) setStatusContrato(data)
    }
    olhar()
    const t = setInterval(olhar, 12000)
    return () => { vivo = false; clearInterval(t) }
  }, [contrato?.chave_publica, vendaOk])

  // perguntas configuradas: carrega uma vez ao abrir o cockpit
  useEffect(() => {
    carregarPerguntas(supabase).then(setPerguntas)
  }, [])

  // ao entrar na qualificação: pré-preenche do dossiê + carrega nichos vivos
  useEffect(() => {
    if (estagio !== 'qualificacao') return
    const d = lead?.dossie || {}
    setQuali((q) => {
      const novo = { ...q, email: q.email || d.email || '' }
      for (const p of perguntas) novo[p.chave] = q[p.chave] || d[p.chave] || ''
      return novo
    })
    if (!dadosFicha) {
      supabase.functions.invoke('babelos', { body: { acao: 'dados_ficha' } })
        .then(({ data }) => {
          if (data?.ok) {
            setDadosFicha(data)
            setQuali((q) => ({ ...q, nicho_id: q.nicho_id || data.nichos?.[0]?.id || '' }))
          } else setErroAvancar('Sessão expirada — saia do app e entre de novo.')
        })
    } else {
      setQuali((q) => ({ ...q, nicho_id: q.nicho_id || dadosFicha.nichos?.[0]?.id || '' }))
    }
  }, [estagio])

  // Avançar do trilho (nome distinto: `avancar` já existe para as fases do
  // funil). Sequência: dossiê → conta automática → biblioteca → apresentação.
  async function avancarTrilho() {
    if (!lead?.id) return
    setAvancando(true); setErroAvancar('')
    try {
      // 1) qualificação inteira vai para o dossiê (merge não-destrutivo)
      setMsgAvancar('Salvando qualificação…')
      const { nicho_id: _nicho, ...respostas } = quali
      const dados = Object.fromEntries(
        Object.entries(respostas).filter(([, v]) => v && String(v).trim()))
      let dossie = lead.dossie || {}
      if (Object.keys(dados).length) {
        const { data } = await supabase.rpc('consolidar_dossie',
          { _lead_id: lead.id, _novo: dados })
        if (data) dossie = data
      }

      // 2) conta de degustação — placeholder de email se faltar (o lead só
      //    loga sozinho depois de corrigir; decisão do Matheus 04/08)
      let userId = contaCriada?.user_id || lead.babel_user_id
      let urlBabel = contaCriada?.url || ''
      if (!userId) {
        setMsgAvancar('Criando a conta do lead…')
        const email = (quali.email || '').trim()
          || `lead-${String(lead.id).replaceAll('-', '').slice(0, 8)}@leads.babel-os.com`
        const { data, error } = await supabase.functions.invoke('babelos', {
          body: {
            acao: 'criar_conta_temporaria', lead_id: lead.id,
            nome: dossie.nome_atendente || lead.contato_nome || lead.empresa || 'Lead',
            email, phone: lead.telefone || '', document: dossie.cnpj || '',
            empresa: lead.empresa || '', empresa_descricao: dossie.presenca || '',
            nicho_id: quali.nicho_id || '', nome_agente: 'Bel',
            cnpj: dossie.cnpj || '',
          },
        })
        if (error || !data?.ok) {
          throw new Error(data?.erro === 'não autenticado'
            ? 'Sessão expirada — saia do app e entre de novo.'
            : (data?.erro || 'Falha ao criar a conta.'))
        }
        setContaCriada(data)
        userId = data.user_id
        urlBabel = data.url || ''
        setLead((l) => ({ ...l, babel_user_id: data.user_id, dossie }))
      }

      // 3) biblioteca: dossiê + qualificação viram conhecimento da conta
      setMsgAvancar('Semeando a biblioteca…')
      try {
        await semearDossie(userId, dossie)
      } catch {
        setErroAvancar('Biblioteca não semeada — toque em "Semear de novo".')
      }

      // 3b) diagnóstico digital: o retrato completo vai pro perfil da conta —
      // é a primeira tela que o lead vê ao logar na Babel OS (efeito uau)
      try {
        await supabase.functions.invoke('babelos', {
          body: {
            acao: 'enviar_diagnostico', user_id: userId, lead_id: lead.id,
            diagnostico: { ...dossie, empresa: lead.empresa || '', contato: lead.contato_nome || '' },
          },
        })
      } catch { /* sem diagnóstico a Babel deriva dos blocos semeados */ }

      // 4) modo apresentação na sala
      setEstagio('apresentacao')
      aoApresentar?.(urlBabel || 'https://www.babel-os.com')
    } catch (e) {
      setErroAvancar(e.message || 'Falha ao avançar — tente de novo.')
    } finally {
      setAvancando(false); setMsgAvancar('')
    }
  }

  // foto da meet: congela um quadro do primeiro vídeo da sala como evidência
  function capturarFotoMeet() {
    try {
      const video = document.querySelector('video')
      if (!video || !video.videoWidth) return null
      const canvas = document.createElement('canvas')
      const escala = Math.min(1, 640 / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * escala)
      canvas.height = Math.round(video.videoHeight * escala)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.6)
    } catch { return null }
  }

  async function gerarContrato() {
    if (!templateSel) { setErroFechar('Escolha o modelo de contrato.'); return }
    setGerandoContrato(true); setErroFechar('')
    const { data, error } = await supabase.functions.invoke('babelos', {
      body: {
        acao: 'gerar_contrato',
        lead_id: lead?.id ?? null,
        user_id: contaCriada?.user_id || lead?.babel_user_id || null,
        template_id: templateSel,
        foto_meet: capturarFotoMeet(),
        dados_cliente: {
          nome: ativacao.nome || lead?.contato_nome || '',
          documento: ativacao.document || '',
          email: ativacao.email || '',
          telefone: ativacao.phone || lead?.telefone || '',
          empresa: ativacao.empresa || lead?.empresa || '',
        },
      },
    })
    setGerandoContrato(false)
    if (error || !data?.ok) { setErroFechar(data?.erro || 'Falha ao gerar o contrato.'); return }
    setContrato(data)
  }

  async function confirmarPagamento() {
    const userId = contaCriada?.user_id || lead?.babel_user_id
    if (!userId) { setErroFechar('Ative o sistema primeiro (a conta do lead ainda não existe).'); return }
    if (!planoSel) { setErroFechar('Escolha o plano fechado.'); return }
    if (!confirm('Confirmar que o pagamento foi RECEBIDO e VALIDADO na call? A conta vira definitiva.')) return
    setConfirmando(true); setErroFechar('')
    const { data, error } = await supabase.functions.invoke('babelos', {
      body: {
        acao: 'confirmar_ativacao',
        lead_id: lead?.id ?? null,
        user_id: userId,
        plano_id: planoSel,
        com_implantacao: comImplantacao,
      },
    })
    setConfirmando(false)
    if (error || !data?.ok) { setErroFechar(data?.erro || 'Falha ao confirmar a ativação.'); return }
    setVendaOk(true)
  }

  async function ativarSistema() {
    if (!ativacao.nome || !ativacao.email || !ativacao.nicho_id) {
      setErroAtivar('Preencha nome, email e o nicho da empresa.'); return
    }
    setCriandoConta(true); setErroAtivar('')
    const { data, error } = await supabase.functions.invoke('babelos', {
      body: {
        acao: 'criar_conta_temporaria',
        lead_id: lead?.id ?? null,
        ...ativacao,
        cnpj: ativacao.document,
        empresa: ativacao.empresa,
      },
    })
    setCriandoConta(false)
    if (error || !data?.ok) {
      setErroAtivar(data?.erro === 'não autenticado'
        ? 'Sessão expirada — saia do app e entre de novo, aí funciona.'
        : (data?.erro || 'Falha ao ativar — tente de novo.'))
      return
    }
    setContaCriada(data)
    semearDossie(data.user_id)
  }

  // efeito uau da abertura: assim que a conta nasce, o dossiê vira blocos de
  // conhecimento na Babel do lead — ele loga e o sistema JÁ SABE da empresa.
  // Só entra o que pode ser mostrado ao lead (nada de gancho/objeções/temperatura).
  async function semearDossie(userId, dossieFresco) {
    // dossieFresco: dentro do avancarTrilho o estado `lead` ainda pode estar
    // defasado — a sequência passa o dossiê recém-consolidado explicitamente.
    const d = dossieFresco || lead?.dossie
    if (!userId || !d) return
    const txt = (v) => {
      if (v === null || v === undefined || v === '') return ''
      if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n')
      if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n')
      return String(v)
    }
    const linhas = (pares) => pares.filter(([, v]) => txt(v)).map(([r, v]) => `${r}: ${txt(v)}`).join('\n')
    const blocos = []
    const põe = (titulo, conteudo) => { if (conteudo && conteudo.trim()) blocos.push({ titulo, conteudo: conteudo.trim(), tipo: 'empresa' }) }
    põe(`Sobre a empresa ${lead.empresa || ''}`.trim(), txt(d.resumo))
    põe('Diagnóstico — onde a Babel ajuda', txt(d.diagnostico))
    põe('Dados cadastrais', linhas([['Razão social', d.razao_social], ['CNPJ', d.cnpj], ['Situação cadastral', d.situacao_cadastral], ['Abertura', d.data_abertura]]))
    põe('Presença digital', linhas([['Visão geral', d.presenca], ['Site', d.site], ['Google Meu Negócio', d.google_meu_negocio], ['Avaliação no Google', d.avaliacao_google], ['Reclame Aqui', d.reclame_aqui]]))
    põe('Instagram', linhas([['Perfil', d.instagram], ['Bio', d.instagram_bio], ['Seguidores', d.instagram_seguidores], ['Posts recentes', d.posts_recentes]]))
    põe('Quem atende e decide', linhas([['Contato', lead.contato_nome || d.nome_atendente], ['Cargo', d.cargo], ['Dono', d.nome_dono], ['Canal preferido', d.canal_contato]]))
    põe('Como atendem hoje', linhas([['Atendimento', d.como_atendem], ['Sistema atual', d.sistema_atual], ['Ferramentas', d.ferramentas_atuais]]))
    põe('Dor identificada nas conversas', txt(d.dor))
    põe('Desejo identificado nas conversas', txt(d.desejo))
    põe('O que os clientes dizem', linhas([['Elogios', d.elogios], ['Reclamações', d.reclamacoes], ['Melhores avaliações', d.melhores_avaliacoes]]))
    põe('Qualificação da call', linhas(perguntas.map((p) => [p.rotulo, d[p.chave]])))
    if (!blocos.length) return
    await supabase.functions.invoke('babelos', {
      body: { acao: 'semear_conhecimento', user_id: userId, lead_id: lead?.id ?? null, blocos },
    })
  }

  function comecar() {
    setIdx(0); setInicioFase(Date.now()); setInicioTotal(Date.now()); setSeg(0); setVerFicha(true)
  }
  function avancar() {
    if (idx < fases.length - 1) { setIdx(idx + 1); setInicioFase(Date.now()); setSeg(0) }
    else { setIdx(fases.length); setInicioFase(null) }
  }

  async function salvarFicha() {
    setSalvandoFicha(true)
    const dados = Object.fromEntries(Object.entries(ficha).filter(([, v]) => v && v.trim()))
    if (lead?.id && Object.keys(dados).length) {
      const { data } = await supabase.rpc('consolidar_dossie', { _lead_id: lead.id, _novo: dados })
      if (data) setLead({ ...lead, dossie: data })
      if (dados.nome_atendente) {
        await supabase.from('leads').update({ contato_nome: dados.nome_atendente }).eq('id', lead.id)
      }
    }
    setSalvandoFicha(false); setFichaOk(true)
    setTimeout(() => { setVerFicha(false); setFichaOk(false) }, 900)
  }

  if (!funil) return null

  // fechado: só o botão flutuante para reabrir
  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="fixed bottom-24 right-4 z-30 rounded-full bg-sinal text-white font-bold w-12 h-12 shadow-lg">
        <Icone nome="calcheck" tam={16} />
      </button>
    )
  }

  const fase = idx >= 0 && idx < fases.length ? fases[idx] : null
  const limite = (fase?.duracao_min || 0) * 60
  const estourou = fase && seg >= limite
  const quase = fase && !estourou && seg >= limite - 60
  const totalMin = fases.reduce((s, f) => s + (f.duracao_min || 0), 0)

  return (
    <aside className="fixed inset-0 z-30 bg-black/60 md:bg-transparent md:static md:z-auto md:w-80 lg:w-96 md:h-dvh shrink-0 flex md:block"
      onClick={(e) => { if (e.target === e.currentTarget) setAberto(false) }}>
      <div className="ml-auto w-[88%] max-w-sm md:w-full md:max-w-none h-full bg-surface border-l border-line flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line shrink-0">
          <Icone nome="calcheck" tam={18} className="text-sinal" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold truncate">{lead?.empresa || 'Mentoria'}</span>
            <span className="block text-[10px] text-ink-3 truncate">{funil.nome}</span>
          </span>
          <button onClick={() => setAberto(false)} className="text-ink-3 text-sm px-1">✕</button>
        </div>

        <div className="cockpit-rolagem flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
          {/* trilho da call — estágio 1: prancheta com tudo que foi levantado */}
          {estagio === 'prancheta' && (
            <>
              <Prancheta dossie={lead?.dossie} contatoNome={lead?.contato_nome}
                empresa={lead?.empresa}
                extras={perguntas.map((p) => [p.chave, p.rotulo])} />
              {lead?.dossie && Object.keys(lead.dossie).length > 0 && (
                <button onClick={() => setVerDiag(true)}
                  className="w-full rounded-lg border border-sky/40 text-sky py-2 text-sm font-semibold">
                  Diagnóstico completo
                </button>
              )}
              <button onClick={() => setEstagio('qualificacao')} disabled={!lead?.id}
                title={!lead?.id ? 'Sala sem lead vinculado (agende pela Agenda com o lead)' : ''}
                className="w-full rounded-xl bg-sinal py-3 font-bold text-white disabled:opacity-40">
                ▶ Iniciar qualificação
              </button>
            </>
          )}
          {verDiag && <Diagnostico lead={lead} aoFechar={() => setVerDiag(false)} />}

          {/* trilho — estágio 2: perguntas de qualificação */}
          {estagio === 'qualificacao' && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-2 px-1">
                Qualificação — pergunte e anote
              </p>
              {perguntas.map((p) => p.tipo === 'longa' ? (
                <textarea key={p.chave} rows={2} placeholder={p.rotulo}
                  value={quali[p.chave] || ''}
                  onChange={(e) => setQuali({ ...quali, [p.chave]: e.target.value })}
                  className={campo} />
              ) : (
                <input key={p.chave} placeholder={p.rotulo} value={quali[p.chave] || ''}
                  onChange={(e) => setQuali({ ...quali, [p.chave]: e.target.value })}
                  className={campo} />
              ))}
              <input type="email" placeholder="Email do lead (se conseguir)" value={quali.email}
                onChange={(e) => setQuali({ ...quali, email: e.target.value })} className={campo} />
              <select value={quali.nicho_id}
                onChange={(e) => setQuali({ ...quali, nicho_id: e.target.value })} className={campo}>
                <option value="">Nicho da empresa…</option>
                {(dadosFicha?.nichos || []).map((n) => (
                  <option key={n.id} value={n.id}>{n.nome_exibicao}</option>
                ))}
              </select>
              {erroAvancar && <p className="text-xs text-danger">{erroAvancar}</p>}
              <div className="flex gap-2">
                <button onClick={() => setEstagio('prancheta')}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-2">←</button>
                <button onClick={avancarTrilho} disabled={avancando}
                  className="flex-1 rounded-xl bg-sinal py-3 font-bold text-white disabled:opacity-50">
                  {avancando ? msgAvancar || 'Avançando…' : 'Avançar →'}
                </button>
              </div>
            </div>
          )}

          {/* trilho — estágio 3: apresentando a Babel OS (acesso da conta) */}
          {estagio === 'apresentacao' && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sinal px-1">
                Apresentando a Babel OS
              </p>
              {contaCriada ? (
                <div className="rounded-lg bg-surface-2 border border-line p-3 space-y-1 text-sm">
                  <p><span className="text-ink-3 text-xs">Acesso:</span> <b>{contaCriada.url}</b></p>
                  <p><span className="text-ink-3 text-xs">Login:</span> <b>{contaCriada.email}</b></p>
                  <p><span className="text-ink-3 text-xs">Senha:</span> <b className="tnum">{contaCriada.senha}</b></p>
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      `${contaCriada.url}\nLogin: ${contaCriada.email}\nSenha: ${contaCriada.senha}`)}
                    className="w-full rounded-lg border border-sinal/40 text-sinal py-1.5 text-xs font-semibold">
                    Copiar acesso
                  </button>
                </div>
              ) : (
                <p className="text-xs text-ink-3 px-1">
                  Conta já existia — use o acesso mostrado na criação (ou recupere a senha na Babel OS).
                </p>
              )}
              {erroAvancar && (
                <>
                  <p className="text-xs text-danger">{erroAvancar}</p>
                  <button onClick={avancarTrilho}
                    className="w-full rounded-lg border border-line py-2 text-sm">
                    Semear a biblioteca de novo
                  </button>
                </>
              )}
              <button onClick={() => { setEstagio('qualificacao'); aoApresentar?.(null) }}
                className="w-full rounded-lg border border-line py-2 text-sm text-ink-2">
                ← Voltar à qualificação
              </button>
            </div>
          )}

          {/* linha do tempo das fases */}
          <div className="flex gap-1">
            {fases.map((f, i) => (
              <span key={f.id} title={f.nome}
                className={`flex-1 h-1.5 rounded-full ${
                  i < idx ? 'bg-sinal' : i === idx ? (estourou ? 'bg-danger animate-pulse' : 'bg-sinal animate-pulse') : 'bg-line'}`} />
            ))}
          </div>

          {idx === -1 && (
            <button onClick={comecar}
              className="w-full rounded-xl bg-sinal py-3 font-bold text-white">
              ▶ Começar mentoria ({totalMin} min)
            </button>
          )}

          {fase && (
            <div className="rounded-xl bg-surface-2 border border-line p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-sinal">
                  {idx + 1}/{fases.length} · {fase.nome}
                </span>
                <span className={`text-sm font-bold tnum ${estourou ? 'text-danger' : quase ? 'text-amber' : 'text-ink'}`}>
                  {mmss(seg)} <span className="text-[10px] text-ink-3">/ {fase.duracao_min}min</span>
                </span>
              </div>
              {fase.objetivo && <p className="text-xs text-ink-2 italic">{fase.objetivo}</p>}
              {fase.material && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{fase.material}</p>
              )}
              <button onClick={avancar}
                className={`w-full rounded-lg py-2 font-semibold text-sm ${
                  estourou ? 'bg-danger text-white animate-pulse' : 'bg-sinal/15 border border-sinal/40 text-sinal'}`}>
                {idx < fases.length - 1
                  ? (estourou ? 'Hora de avançar!' : `Avançar para ${fases[idx + 1].nome} →`)
                  : 'Concluir mentoria ✓'}
              </button>
            </div>
          )}

          {idx >= fases.length && (
            <div className="rounded-xl bg-sinal/10 border border-sinal/40 p-4 text-center space-y-1">
              <p className="font-bold text-sinal">Mentoria concluída</p>
              <p className="text-xs text-ink-2 tnum">
                Tempo total: {inicioTotal ? mmss(Math.floor((Date.now() - inicioTotal) / 1000)) : '—'}
              </p>
            </div>
          )}

          {/* ficha de abertura — levantamento que alimenta o dossiê */}
          <div className="rounded-xl border border-line">
            <button onClick={() => setVerFicha(!verFicha)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold">
              Ficha da mentoria
              <span className="text-ink-3 text-xs">{verFicha ? '▲' : '▼'}</span>
            </button>
            {verFicha && (
              <div className="px-3 pb-3 space-y-2">
                <input placeholder="Quem está na call (nome)" value={ficha.nome_atendente}
                  onChange={(e) => setFicha({ ...ficha, nome_atendente: e.target.value })} className={campo} />
                <input placeholder="Cargo (dono, sócio, gerente…)" value={ficha.cargo_atendente}
                  onChange={(e) => setFicha({ ...ficha, cargo_atendente: e.target.value })} className={campo} />
                <input placeholder="Nome do dono (se for outro)" value={ficha.nome_dono}
                  onChange={(e) => setFicha({ ...ficha, nome_dono: e.target.value })} className={campo} />
                <textarea rows={2} placeholder="Dor da empresa" value={ficha.dor}
                  onChange={(e) => setFicha({ ...ficha, dor: e.target.value })} className={campo} />
                <textarea rows={2} placeholder="Desejo / meta traçada" value={ficha.desejo}
                  onChange={(e) => setFicha({ ...ficha, desejo: e.target.value })} className={campo} />
                <button onClick={salvarFicha} disabled={salvandoFicha || !lead?.id}
                  title={!lead?.id ? 'Sala sem lead vinculado (agende pela Agenda com o lead)' : ''}
                  className="w-full rounded-lg bg-sinal py-2 text-sm font-semibold text-white disabled:opacity-40">
                  {fichaOk ? '✓ Salvo no dossiê' : salvandoFicha ? 'Salvando…' : 'Salvar no dossiê'}
                </button>
              </div>
            )}
          </div>

          {/* ativar o sistema — o lead entra na Babel OS ao vivo, na call */}
          <div className="rounded-xl border border-amber/40">
            <button onClick={() => setVerAtivar(!verAtivar)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-amber">
              Ativar o sistema
              <span className="text-ink-3 text-xs">{verAtivar ? '▲' : '▼'}</span>
            </button>
            {verAtivar && !contaCriada && lead?.babel_user_id && (
              <p className="px-3 pb-3 text-xs text-sinal">
                ✓ Este lead já tem conta ativada na Babel OS (a senha foi mostrada na criação).
              </p>
            )}
            {verAtivar && !contaCriada && !lead?.babel_user_id && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-[11px] text-ink-3">
                  Cria a conta do lead na Babel OS em modo degustação (7 dias) — ele entra
                  agora e a negociação segue dentro do próprio sistema.
                </p>
                <input placeholder="Nome completo do lead" value={ativacao.nome}
                  onChange={(e) => setAtivacao({ ...ativacao, nome: e.target.value })} className={campo} />
                <input type="email" placeholder="Email (vira o login)" value={ativacao.email}
                  onChange={(e) => setAtivacao({ ...ativacao, email: e.target.value })} className={campo} />
                <div className="flex gap-2">
                  <input placeholder="Telefone" value={ativacao.phone}
                    onChange={(e) => setAtivacao({ ...ativacao, phone: e.target.value })} className={campo} />
                  <input placeholder="CPF/CNPJ" value={ativacao.document}
                    onChange={(e) => setAtivacao({ ...ativacao, document: e.target.value })} className={campo} />
                </div>
                <input placeholder="Nome da empresa" value={ativacao.empresa}
                  onChange={(e) => setAtivacao({ ...ativacao, empresa: e.target.value })} className={campo} />
                <select value={ativacao.nicho_id}
                  onChange={(e) => setAtivacao({ ...ativacao, nicho_id: e.target.value })} className={campo}>
                  <option value="">Nicho da empresa…</option>
                  {(dadosFicha?.nichos || []).map((n) => (
                    <option key={n.id} value={n.id}>{n.nome_exibicao}</option>
                  ))}
                </select>
                <input placeholder="Nome do agente de IA (ex.: Bel)" value={ativacao.nome_agente}
                  onChange={(e) => setAtivacao({ ...ativacao, nome_agente: e.target.value })} className={campo} />
                {erroAtivar && <p className="text-xs text-danger">{erroAtivar}</p>}
                <button onClick={ativarSistema} disabled={criandoConta}
                  className="w-full rounded-lg bg-amber py-2.5 font-bold text-[#1a1200] disabled:opacity-50">
                  {criandoConta ? 'Criando a conta…' : 'Criar conta e entrar no sistema'}
                </button>
              </div>
            )}
            {verAtivar && contaCriada && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-xs font-semibold text-sinal">✓ Conta criada — passe para o lead entrar AGORA:</p>
                <div className="rounded-lg bg-surface-2 border border-line p-3 space-y-1 text-sm">
                  <p><span className="text-ink-3 text-xs">Acesso:</span> <b>{contaCriada.url}</b></p>
                  <p><span className="text-ink-3 text-xs">Login:</span> <b>{contaCriada.email}</b></p>
                  <p><span className="text-ink-3 text-xs">Senha:</span> <b className="tnum">{contaCriada.senha}</b></p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(
                    `Acesso à Babel OS\n${contaCriada.url}\nLogin: ${contaCriada.email}\nSenha: ${contaCriada.senha}`)}
                  className="w-full rounded-lg border border-sinal/40 text-sinal py-2 text-sm font-semibold">
                  Copiar acesso para enviar ao lead
                </button>
                <p className="text-[11px] text-ink-3">
                  Degustação de 7 dias — vira definitiva quando o pagamento for validado na call.
                </p>
              </div>
            )}
          </div>

          {/* fechar venda — contrato + pagamento validado na call */}
          <div className="rounded-xl border border-sinal/40">
            <button onClick={() => setVerFechar(!verFechar)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-sinal">
              Fechar
              <span className="text-ink-3 text-xs">{verFechar ? '▲' : '▼'}</span>
            </button>
            {verFechar && (
              <div className="px-3 pb-3 space-y-2">
                {vendaOk ? (
                  <div className="rounded-lg bg-sinal/10 border border-sinal/40 p-3 text-center space-y-1">
                    <p className="font-bold text-sinal">Fechado — conta definitiva!</p>
                    <p className="text-[11px] text-ink-2">
                      Lead virou cliente e foi transferido para a implementação.
                      Peça já os materiais: conversas de WhatsApp, PDFs, site, tabela de preços.
                    </p>
                  </div>
                ) : (
                  <>
                    {!contrato && (
                      <>
                        {(dadosFicha?.templates_contrato || []).length === 0 ? (
                          <p className="text-[11px] text-amber">
                            Nenhum modelo de contrato ativo na Babel OS — crie o "Contrato Babel"
                            no app Contratos de lá (conta theus@admin.com) e ele aparece aqui.
                          </p>
                        ) : (
                          <select value={templateSel} onChange={(e) => setTemplateSel(e.target.value)} className={campo}>
                            <option value="">Modelo de contrato…</option>
                            {(dadosFicha?.templates_contrato || []).map((t) => (
                              <option key={t.id} value={t.id}>{t.nome}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={gerarContrato}
                          disabled={gerandoContrato || (dadosFicha?.templates_contrato || []).length === 0}
                          className="w-full rounded-lg bg-sinal py-2.5 font-bold text-white disabled:opacity-40">
                          {gerandoContrato ? 'Gerando…' : 'Gerar contrato (com foto da call)'}
                        </button>
                      </>
                    )}

                    {contrato && (
                      <div className="rounded-lg bg-surface-2 border border-line p-3 space-y-2">
                        {contrato.url && (
                          <>
                            <p className="text-[11px] text-ink-3">Link de assinatura (mande no WhatsApp do lead):</p>
                            <p className="text-xs break-all text-sinal">{contrato.url}</p>
                            <button onClick={() => navigator.clipboard.writeText(contrato.url)}
                              className="w-full rounded-lg border border-sinal/40 text-sinal py-1.5 text-xs font-semibold">
                              Copiar link do contrato
                            </button>
                          </>
                        )}
                        <div className="flex gap-2 text-xs">
                          <span className={`flex-1 rounded-lg border px-2 py-1.5 text-center font-semibold ${
                            statusContrato?.assinado ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-3'}`}>
                            {statusContrato?.assinado ? '✓ Assinado' : '… aguardando assinatura'}
                          </span>
                          <span className={`flex-1 rounded-lg border px-2 py-1.5 text-center font-semibold ${
                            statusContrato?.comprovante ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-3'}`}>
                            {statusContrato?.comprovante ? '✓ Comprovante' : '… sem comprovante'}
                          </span>
                        </div>
                      </div>
                    )}

                    {contrato && (
                      <>
                        <select value={planoSel} onChange={(e) => setPlanoSel(e.target.value)} className={campo}>
                          <option value="">Plano fechado…</option>
                          {(dadosFicha?.planos || []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome} · R$ {Number(p.preco_mensal).toLocaleString('pt-BR')}/mês
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs text-ink-2">
                          <input type="checkbox" checked={comImplantacao}
                            onChange={(e) => setComImplantacao(e.target.checked)} />
                          Cobrar implantação junto
                        </label>
                        <button onClick={confirmarPagamento} disabled={confirmando}
                          className="w-full rounded-lg bg-sinal py-2.5 font-bold text-white disabled:opacity-40">
                          {confirmando ? 'Ativando…' : 'Pagamento validado na call → ativar cliente'}
                        </button>
                      </>
                    )}
                    {erroFechar && <p className="text-xs text-danger">{erroFechar}</p>}
                  </>
                )}
              </div>
            )}
          </div>

          {/* dossiê completo do lead */}
          {lead?.dossie && Object.keys(lead.dossie).length > 0 && (
            <div className="rounded-xl border border-line">
              <button onClick={() => setVerDossie(!verDossie)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold">
                Dossiê do lead
                <span className="text-ink-3 text-xs">{verDossie ? '▲' : '▼'}</span>
              </button>
              {verDossie && (
                <div className="px-3 pb-3">
                  <Dossie dossie={lead.dossie} titulo="O que já sabemos" vazio={null} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
