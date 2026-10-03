import { useEffect, useRef, useState } from 'react'
import { supabase, erroDaFuncao } from '../lib/supabase'
import { criarTelefone, conectar, ligarPara, limparNumero, motivoRecusa, prepararMicrofone, enviarDtmf, caminhoDaMidia,
  liberarAudio, tocarAudio, saidasDeAudio, trocarSaida, vigiarMicrofone, vigiarRecebimento,
  segurarTela, soltarTela, manterAbaViva, soltarAbaViva, vigiarTunel, pararVigia,
  revigorarMidia, vigiarEnvio, vigiarRede } from '../lib/telefone'
import { tocarChamando, pararChamando } from '../lib/ringback'
import { Botao, Cartao, Chip, Rotulo, Sinal, cn } from '../componentes/ui'
import Icone from '../componentes/Icone'
import Desfecho from '../componentes/Desfecho'
import HorariosDoDia from '../componentes/HorariosDoDia'
import { DossieBlocos } from '../componentes/Conversa'
import FichaEmpresa, { temFichaEmpresa } from '../componentes/FichaEmpresa'
import LigacoesRecentes from '../componentes/LigacoesRecentes'
import Diagnostico from '../componentes/Diagnostico'
import Roteiro from '../componentes/Roteiro'
import { ehCelular, linkWhatsappProposta } from '../lib/whatsapp'

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

// Telefone e computador mostram peças diferentes na ligação. Sem isto elas
// seriam montadas nos dois e disputariam a mesma referência (o teclado de tons
// já fazia isso), além de dobrar o que o navegador precisa desenhar.
function useEhDesktop() {
  const [ehDesktop, setEh] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const ouvir = (e) => setEh(e.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])
  return ehDesktop
}
const NOMES_DESF = {
  nao_atendeu: 'não atendeu', caixa_postal: 'caixa postal', ocupado: 'ocupado/caiu',
  numero_errado: 'nº errado', sem_interesse: 'sem interesse', desligou: 'desligou',
  em_contato: 'passou o contato',
  retorno: 'retorno', reuniao: 'reunião',
}
const caixa = 'rounded-2xl bg-surface border border-line'

export default function Telefone({ perfil, leadParaLigar, aoLimparLead, aoPuxarLead, aoMudarEstado,
  listaSessao, aoConsumirListaSessao, aoEditarRoteiro }) {
  const [estado, setEstado] = useState('conectando') // conectando | pronto | chamando | tocando | em-chamada | offline
  const [numero, setNumero] = useState('')
  const [quemChama, setQuemChama] = useState('')
  const [mudo, setMudo] = useState(false)
  const [scripts, setScripts] = useState([])
  const [scriptId, setScriptId] = useState(null)
  const [verScript, setVerScript] = useState(false)
  const [legendas, setLegendas] = useState([])
  const [dados, setDados] = useState({})           // nome/cargo/empresa captados ao vivo
  const [posChamada, setPosChamada] = useState(null) // {numero} → painel de observação
  const [segundos, setSegundos] = useState(0)
  const [nichos, setNichos] = useState([])
  const [nichoSel, setNichoSel] = useState('')
  const [lotes, setLotes] = useState([])           // planilhas importadas com contatos prontos
  const [loteSel, setLoteSel] = useState('')
  const [modoFila, setModoFila] = useState('nicho') // 'nicho' | 'importado'
  const [avisoFila, setAvisoFila] = useState('')
  const [avisoLinha, setAvisoLinha] = useState('')
  const [puxando, setPuxando] = useState(false)
  const [linhas, setLinhas] = useState(null)       // {ocupadas, maximo}
  const [semSom, setSemSom] = useState(false)      // navegador barrou a reprodução
  const [micMudo, setMicMudo] = useState(false)    // microfone sem captar (o lead não ouve)
  const [micAjuda, setMicAjuda] = useState(false)  // permissão de microfone negada — socorro guiado
  const [micTexto, setMicTexto] = useState('')
  const [saidas, setSaidas] = useState([])         // destinos de som disponíveis
  const [saidaSel, setSaidaSel] = useState('')
  // Modo sessão (spec 2026-08-06): puxou lead → sessão começa; cada desfecho
  // dispara o próximo contato sozinho. {inicio, ligacoes} ou null.
  const [sessao, setSessao] = useState(null)
  const [, setTicSessao] = useState(0)             // só para o cronômetro andar
  const [listaAtiva, setListaAtiva] = useState(null) // {id, nome} → puxa da lista, não da fila
  const [resumo, setResumo] = useState(null)       // números do sprint ao encerrar
  // Durante a chamada: teclado de tons (URA) e captura do contato do cliente
  const [verTeclado, setVerTeclado] = useState(false)
  const [tonsEnviados, setTonsEnviados] = useState('')
  const [captura, setCaptura] = useState({ nome: '', fone: '', email: '' })
  const [capturaSalva, setCapturaSalva] = useState('')
  const [copiado, setCopiado] = useState('')
  const [geracaoMic, setGeracaoMic] = useState(0)  // sobe quando a trilha do mic é trocada
  const [envioCaiu, setEnvioCaiu] = useState(false) // parou de sair áudio: o lead não está ouvindo
  const [redeRuim, setRedeRuim] = useState(null)   // % do que enviamos que se perde
  const [semDescida, setSemDescida] = useState(false) // o áudio do LEAD parou de chegar
  const semDescidaGravadaRef = useRef(false)       // um registro por chamada, não um por tique

  // UM único elemento de áudio, criado fora da árvore do React e preso ao
  // documento. Antes havia um <audio> em cada ramo da tela (discador, em
  // chamada, recebendo, desfecho): ao mudar de estado o React destruía o
  // elemento, mas a SIP.js seguia com a referência do antigo — o lead ouvia
  // o mentor e o mentor não ouvia o lead. Fora da árvore, ele também não é
  // afetado quando o telefone fica escondido em outra aba.
  const audioRef = useRef(null)
  if (!audioRef.current) {
    audioRef.current = document.createElement('audio')
    audioRef.current.autoplay = true
  }
  useEffect(() => {
    const el = audioRef.current
    el.setAttribute('playsinline', '')
    document.body.appendChild(el)
    // Celular só toca áudio depois de um toque real na tela. Um único toque
    // em qualquer lugar já libera o elemento para o resto da sessão.
    const soltar = () => liberarAudio(el)
    document.addEventListener('touchstart', soltar, { once: true, passive: true })
    document.addEventListener('click', soltar, { once: true })
    return () => {
      document.removeEventListener('touchstart', soltar)
      document.removeEventListener('click', soltar)
      el.remove()
    }
  }, [])

  // Quando a chamada conecta, insiste no play: se o navegador barrou antes,
  // agora já houve o toque em Ligar/Atender e ele deixa. Sem isto o mentor
  // fica sem ouvir o lead mesmo com a chamada de pé.
  useEffect(() => {
    if (estado !== 'em-chamada' && estado !== 'tocando') return
    const el = audioRef.current
    let tentativas = 0
    const t = setInterval(() => {
      if (el.srcObject && !el.paused) { clearInterval(t); setSemSom(false); return }
      tocarAudio(el)
      if (++tentativas >= 8) { clearInterval(t); if (el.paused) setSemSom(true) }
    }, 400)
    return () => clearInterval(t)
  }, [estado])

  const mudoRef = useRef(false)   // o vigia lê daqui: mudo só vale se veio do botão
  const telefoneRef = useRef(null)
  const ligacaoRef = useRef(null)
  const atendeuRef = useRef(false)      // a chamada chegou a ser atendida?
  const inicioDiscagemRef = useRef(0)   // p/ detectar falha instantânea (túnel/tronco)
  const tecladoRef = useRef(null)

  // Destinos de som do aparelho (fone, viva-voz, bluetooth). A lista só fica
  // completa depois da permissão de microfone, por isso relemos ao entrar em
  // chamada. Onde o navegador não deixa escolher, o seletor não aparece.
  useEffect(() => {
    let vivo = true
    saidasDeAudio().then((s) => { if (vivo) setSaidas(s) })
    return () => { vivo = false }
  }, [estado === 'em-chamada'])

  async function usarSaida(id) {
    const ok = await trocarSaida(audioRef.current, id)
    if (ok) setSaidaSel(id)
  }

  // Tenta liberar o microfone DENTRO de um toque do usuário — se o navegador
  // estiver só esperando permissão, o pedido nativo reabre aqui e resolve.
  async function liberarMicrofone() {
    setMicTexto('')
    if (await prepararMicrofone()) {
      setMicAjuda(false)
      setAvisoLinha('Microfone liberado — pode ligar!')
      return
    }
    setMicTexto('O sistema continua negando — siga os passos abaixo e recarregue a página.')
  }

  // Linhas ocupadas: o servidor publica a cada 5s. Quando as duas linhas
  // (2 canais cada) estão em uso, discar só devolveria "congestionado" —
  // então o botão trava e o mentor vê o motivo antes de tentar.
  useEffect(() => {
    let vivo = true
    async function ler() {
      const { data } = await supabase.rpc('linhas_status')
      const s = Array.isArray(data) ? data[0] : data
      if (vivo && s) setLinhas({ ocupadas: s.ocupadas ?? 0, maximo: s.maximo ?? 0 })
    }
    ler()
    const t = setInterval(ler, 5000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  // Scripts de ligação cadastrados na Gestão
  useEffect(() => {
    supabase.from('scripts').select('*').eq('ativo', true).order('ordem')
      .then(({ data }) => {
        setScripts(data || [])
        if (data?.length) setScriptId(data[0].id)
      })
  }, [])

  // Nichos com lead DISPONÍVEL para puxar (mesmo critério do puxar_proximo_lead).
  // Nicho que esvaziou some do seletor; relemos a cada 45s porque o telefone
  // fica montado o dia inteiro e a fila muda o tempo todo.
  async function lerNichos() {
    const { data } = await supabase.rpc('nichos_disponiveis')
    setNichos(data || [])
  }
  useEffect(() => {
    lerNichos()
    const t = setInterval(lerNichos, 45000)
    return () => clearInterval(t)
  }, [])
  // o nicho escolhido esvaziou no meio do caminho? volta para "todos"
  useEffect(() => {
    if (nichoSel && nichos.length && !nichos.some((n) => n.nicho === nichoSel)) setNichoSel('')
  }, [nichos])

  // Planilhas importadas com contato disponível (mesmo critério de nichos,
  // agrupado por leads.lote_importacao — o nome do arquivo enviado).
  async function lerLotes() {
    const { data } = await supabase.rpc('lotes_disponiveis')
    setLotes(data || [])
  }
  useEffect(() => {
    lerLotes()
    const t = setInterval(lerLotes, 45000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (loteSel && lotes.length && !lotes.some((l) => l.lote === loteSel)) setLoteSel('')
  }, [lotes])

  // Puxa o próximo contato — da LISTA ativa (hopper com cadência e trava) ou
  // da fila geral por nicho. A sessão começa no primeiro puxar.
  async function puxarLead(listaForcada, filtro, pularId) {
    const lista = listaForcada || listaAtiva
    // filtro explícito vence o state: quem troca de nicho e puxa no mesmo
    // clique não pode esperar o React atualizar nichoSel/loteSel
    const nicho = filtro?.nicho !== undefined ? filtro.nicho : nichoSel
    const lote = filtro?.lote !== undefined ? filtro.lote : loteSel
    const porLote = filtro?.lote !== undefined ? true : modoFila === 'importado'
    setPuxando(true); setAvisoFila('')
    const { data, error } = lista
      ? await supabase.rpc('lista_puxar_proximo', { _lista: lista.id })
      : porLote
        ? await supabase.rpc('puxar_proximo_lead',
            { _nicho: null, _lote: lote || null, _pular: pularId || null })
        : await supabase.rpc('puxar_proximo_lead',
            { _nicho: nicho || null, _lote: null, _pular: pularId || null })
    setPuxando(false)
    if (error) { setAvisoFila('Erro ao puxar lead.'); return null }
    if (!lista) { lerNichos(); lerLotes() }
    if (!data?.id) {
      setAvisoFila(lista
        ? `"${lista.nome}" sem contatos prontos agora — a cadência devolve os reciclados na hora certa.`
        : porLote
          ? (lote ? `Importado "${lote}" sem contatos prontos agora.` : 'Nenhum importado com contatos prontos agora.')
          : nicho ? `Fila de "${nicho}" vazia — prospecte mais na aba CRM.` : 'Fila vazia — prospecte na aba CRM.')
      return null
    }
    setSessao((s) => s || { inicio: Date.now(), ligacoes: 0 })
    aoPuxarLead?.(data)
    return data
  }

  // Chegou da página Listas com "Sessão da lista": arma a lista e já puxa o 1º
  useEffect(() => {
    if (!listaSessao?.id) return
    const lista = { id: listaSessao.id, nome: listaSessao.nome }
    setListaAtiva(lista)
    aoConsumirListaSessao?.()
    aoLimparLead?.()
    puxarLead(lista)
  }, [listaSessao]) // eslint-disable-line react-hooks/exhaustive-deps

  // encerra a sessão mostrando o resumo do sprint (números desde o início)
  async function encerrarSessao() {
    if (!sessao) return
    const { data } = await supabase.rpc('resumo_sessao', {
      _desde: new Date(sessao.inicio).toISOString(),
    })
    const r = Array.isArray(data) ? data[0] : data
    setResumo({ ...(r || {}), minutos: Math.max(1, Math.round((Date.now() - sessao.inicio) / 60000)) })
  }

  // Libera o lead que está na tela de volta para a fila da equipe (sem marcar
  // desfecho — ninguém ligou). Sem isso ele ficaria preso 30 min com quem puxou.
  async function soltarLead() {
    const id = leadParaLigar?.id
    aoLimparLead?.()
    setNumero('')
    if (id) await supabase.rpc('soltar_lead', { _lead_id: id })
  }

  // Passar para o próximo contato SEM ligar.
  //
  // Na FILA GERAL soltamos o atual antes (senão ele fica preso 30 min no nome
  // de quem puxou) e mandamos o `_pular` para ele não voltar na hora.
  //
  // Na LISTA é o contrário: `lista_puxar_proximo` escolhe por
  // (tentativas, proxima_tentativa_em/criado_em) e numa lista recém-criada
  // TODOS os contatos empatam nessas três colunas — foram inseridos no mesmo
  // instante e ninguém ligou ainda. Soltar o atual limpa a trava dele, o
  // empate devolve exatamente o mesmo contato e a tela não muda: era o
  // "botão não faz nada" de 09/08. Sem soltar, a trava de 10 minutos da
  // própria lista tira ele da roda e o próximo vem de verdade.
  async function passarContato() {
    if (listaAtiva) { aoLimparLead?.(); setNumero('') } else await soltarLead()
    return puxarLead()
  }

  async function puxarOutro() {
    await passarContato()
  }

  // Remove do discador uma planilha que É SUA (dono): os contatos nunca
  // trabalhados são apagados de verdade; os já trabalhados ficam descartados,
  // com o histórico. Planilha de colega e estoque da equipe não têm o botão.
  async function removerPlanilha() {
    const alvo = lotes.find((l) => l.lote === loteSel)
    if (!alvo?.meu) return
    if (!window.confirm(`Remover a planilha "${loteSel}" do seu discador?\n\n`
      + 'Contatos nunca trabalhados são apagados; os já trabalhados ficam '
      + 'descartados (o histórico de ligações permanece). Isso não tem volta.')) return
    const { data, error } = await supabase.rpc('lote_remover', { _lote: loteSel })
    if (error) { setAvisoFila(`Não deu para remover: ${error.message}`); return }
    setAvisoFila(`Planilha "${loteSel}" removida — ${data?.apagados ?? 0} apagado(s), `
      + `${data?.descartados ?? 0} descartado(s).`)
    setLoteSel('')
    lerLotes()
  }

  // "Próximo nicho": anda para o próximo da lista (em círculo) e já traz um
  // contato dele. No modo Importados, anda para a próxima planilha.
  async function proximoNicho() {
    const atualId = leadParaLigar?.id || null
    const porLote = modoFila === 'importado'
    const opcoes = porLote ? lotes.map((l) => l.lote) : nichos.map((n) => n.nicho)
    if (!opcoes.length) {
      setAvisoFila(porLote ? 'Nenhuma planilha com contatos agora.' : 'Nenhum nicho com contatos agora.')
      return
    }
    const atual = porLote ? loteSel : nichoSel
    const i = opcoes.indexOf(atual)
    const proximo = opcoes[(i + 1) % opcoes.length]   // do último volta ao primeiro
    if (porLote) setLoteSel(proximo); else setNichoSel(proximo)
    await soltarLead()
    const lead = await puxarLead(null, porLote ? { lote: proximo } : { nicho: proximo }, atualId)
    if (lead?.telefone) setNumero(lead.telefone)
  }

  // "Próximo contato": passa este e já traz outro, sem discar.
  async function proximoContato() {
    const atualId = leadParaLigar?.id || null
    if (listaAtiva) {
      aoLimparLead?.(); setNumero('')
      const lead = await puxarLead()          // a trava da lista faz o rodízio
      if (lead?.telefone) setNumero(lead.telefone)
      return
    }
    await soltarLead()
    // sem o "pular", o lead que acabou de ser solto volta como o primeiro da
    // fila (tentativas 0, nunca chamado) e a tela não muda
    const lead = await puxarLead(null, undefined, atualId)
    if (lead?.telefone) setNumero(lead.telefone)
  }

  // O loop da sessão: desfecho dado → fecha o painel, puxa o próximo da fila
  // e já disca. Fila vazia encerra a rodada com aviso, sem drama.
  // Depois do desfecho, o sistema TRAZ o próximo contato — mas não disca.
  // Discar sozinho tirava do vendedor o instante de ler quem é a empresa, o
  // dossiê e o roteiro antes do alô; quem quiser velocidade aperta Ligar, que
  // já está na tela com o número carregado.
  async function proximoDaSessao() {
    fecharDesfecho()
    aoLimparLead?.()
    await puxarLead()
  }

  // cronômetro da sessão (só precisa andar quando o discador está visível)
  useEffect(() => {
    if (!sessao) return
    const t = setInterval(() => setTicSessao((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [sessao])

  // Conversa ao vivo + dados capturados (publicados pelo servidor durante a chamada)
  useEffect(() => {
    if (!perfil?.ramal) return
    const canal = supabase
      .channel(`legendas:${perfil.ramal}`)
      .on('broadcast', { event: 'legenda' }, ({ payload }) => {
        setLegendas((l) => [...l.slice(-30), payload.texto])
      })
      .on('broadcast', { event: 'dados' }, ({ payload }) => {
        setDados((d) => ({ ...d, ...payload }))
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [perfil?.ramal])

  // Lead vindo da aba Leads: preenche o número automaticamente
  useEffect(() => {
    if (leadParaLigar?.telefone) setNumero(leadParaLigar.telefone)
  }, [leadParaLigar])

  // o App precisa saber para trazer o telefone à frente quando entra ligação
  useEffect(() => { aoMudarEstado?.(estado) }, [estado, aoMudarEstado])

  // cronômetro da chamada
  useEffect(() => {
    if (estado !== 'em-chamada') { setSegundos(0); return }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [estado])

  // Vigia do microfone: se a trilha parar de captar (mic tomado por outro
  // app, permissão do sistema, aparelho calado), o mentor vê o aviso na hora
  // em vez de falar 1 minuto no vácuo — caso Clayane, 03/08.
  useEffect(() => {
    if (estado !== 'em-chamada') { setMicMudo(false); return }
    return vigiarMicrofone(telefoneRef.current, setMicMudo)
    // geracaoMic: quando a trilha do microfone é trocada (volta do celular),
    // o vigia precisa passar a escutar a trilha NOVA, não a que morreu.
  }, [estado, geracaoMic])

  // Vigia do ENVIO: de 3 em 3 segundos confere se ainda saem pacotes de áudio.
  // É o que segura o caso do Android, onde a trilha continua "viva" e o lead
  // deixa de ouvir — e onde esperar pelo visibilitychange não resolveu.
  // Perda na SUBIDA: o vendedor ouve bem e é ouvido cortado, e não tem como
  // saber. Aqui ele vê — e sabe o que fazer a respeito.
  useEffect(() => {
    if (estado !== 'em-chamada') { setRedeRuim(null); return }
    const parar = vigiarRede(telefoneRef.current, ({ ruim, perda }) => {
      setRedeRuim(ruim ? perda : null)
    })
    return parar
  }, [estado])

  // Vigia da DESCIDA: se o áudio do lead parar de chegar no meio da chamada,
  // primeiro tenta religar a reprodução (caso de play barrado), avisa o
  // mentor na tela e grava UM episódio na telemetria — é o rastro que vai
  // cravar a causa do "não ouço o cliente, mas ele me ouve".
  useEffect(() => {
    if (estado !== 'em-chamada') { setSemDescida(false); semDescidaGravadaRef.current = false; return }
    return vigiarRecebimento(telefoneRef.current, async ({ recebendo }) => {
      setSemDescida(!recebendo)
      if (recebendo || semDescidaGravadaRef.current) return
      semDescidaGravadaRef.current = true
      tocarAudio(audioRef.current)   // se era só o navegador segurando o play, resolve aqui
      const c = await caminhoDaMidia(telefoneRef.current)
      supabase.from('rede_chamadas').insert({
        numero: ligacaoRef.current?.numero || numero,
        caminho: 'sem_descida',
        detalhe: {
          caminho_midia: c?.caminho || null,
          protocolo: c?.protocolo || null,
          rede: navigator.connection?.effectiveType || null,
          ua: navigator.userAgent.slice(0, 120),
        },
      }).then(() => {})
    })
  }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  // Telemetria: 4s depois de atender, grava por onde o áudio está passando
  // (direto, stun ou relay). Se em 12s nenhum caminho se firmou, grava
  // 'falhou' — é o rastro que denuncia a operadora/rede problemática sem
  // depender de relato de ninguém.
  useEffect(() => {
    if (estado !== 'em-chamada') return
    let vivo = true
    let t2 = null
    const numeroDaVez = ligacaoRef.current?.numero || numero
    const gravar = (caminho, extra) => {
      supabase.from('rede_chamadas').insert({
        numero: numeroDaVez,
        caminho,
        detalhe: {
          ...extra,
          rede: navigator.connection?.effectiveType || null,
          ua: navigator.userAgent.slice(0, 120),
        },
      }).then(() => {})
    }
    const t1 = setTimeout(async () => {
      const c = await caminhoDaMidia(telefoneRef.current)
      if (!vivo) return
      if (c) { gravar(c.caminho, { protocolo: c.protocolo }); return }
      t2 = setTimeout(async () => {
        const c2 = await caminhoDaMidia(telefoneRef.current)
        if (!vivo) return
        gravar(c2 ? c2.caminho : 'falhou', c2 ? { protocolo: c2.protocolo } : {})
      }, 8000)
    }, 4000)
    return () => { vivo = false; clearTimeout(t1); if (t2) clearTimeout(t2) }
  }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (estado !== 'em-chamada') { setEnvioCaiu(false); return }
    return vigiarEnvio(
      telefoneRef.current,
      (s) => {
        setEnvioCaiu(Boolean(s.recuperando))
        if (s.recuperado) setGeracaoMic((g) => g + 1)
      },
      () => mudoRef.current,   // mudo de verdade é só o do botão
    )
  }, [estado])

  // tom de "chamando" enquanto o número toca (padrão brasileiro)
  useEffect(() => {
    if (estado === 'chamando') tocarChamando()
    else pararChamando()
    return () => pararChamando()
  }, [estado])

  useEffect(() => {
    if (!perfil?.ramal || !perfil?.sip_password) return
    const tel = criarTelefone({
      ramal: perfil.ramal,
      senha: perfil.sip_password,
      audioRemoto: audioRef.current,
      eventos: {
        aoRegistrar: () => setEstado('pronto'),
        aoPerderRegistro: () => setEstado('offline'),
        aoReceber: (quem) => { setQuemChama(quem); setEstado('tocando') },
        aoAtender: () => { atendeuRef.current = true; setEstado('em-chamada') },
        aoDesligar: () => {
          setEstado('pronto'); setQuemChama(''); setMudo(false); mudoRef.current = false
          // Morreu em menos de 3s sem ninguém atender = falha de túnel/tronco,
          // não uma ligação de verdade: avisa em vez de abrir a tela de
          // encerramento/feedback na cara do mentor (Guilherme/Fabrício/Davi, 04/08).
          const relampago = !atendeuRef.current && inicioDiscagemRef.current > 0
            && Date.now() - inicioDiscagemRef.current < 3000
          atendeuRef.current = false
          inicioDiscagemRef.current = 0
          if (relampago) {
            ligacaoRef.current = null
            setAvisoLinha((a) => a || 'A ligação falhou antes de completar — tente de novo agora.')
          }
          if (ligacaoRef.current) { setPosChamada(ligacaoRef.current); ligacaoRef.current = null }
        },
      },
    })
    telefoneRef.current = tel
    prepararMicrofone()
    conectar(tel).catch(() => setEstado('offline'))
    vigiarTunel(tel)
    return () => {
      pararVigia()
      tel.unregister().catch(() => {}); tel.disconnect().catch(() => {})
    }
    // ATENÇÃO: dependa só das credenciais, NUNCA do objeto `perfil` inteiro.
    // O perfil é recarregado sempre que o Supabase revalida a sessão — e ele
    // revalida ao voltar de outra aba/janela. Com `[perfil]` aqui, voltar para
    // o PABX destruía o telefone (unregister + disconnect) e derrubava a
    // ligação em andamento — caso Diego, 07/08.
  }, [perfil?.ramal, perfil?.sip_password])

  const tel = () => telefoneRef.current

  // Tela ACESA enquanto durar a chamada. Celular com a tela apagada congela
  // a página e a ligação caía no meio do toque (caso Clayane/Pedro, 04/08).
  // O navegador solta a trava sozinho quando a aba se esconde — por isso
  // repega ao voltar. No fim da chamada, solta para não gastar bateria.
  useEffect(() => {
    const ativa = ['chamando', 'tocando', 'em-chamada'].includes(estado)
    if (!ativa) { soltarTela(); soltarAbaViva(); return }
    segurarTela()
    manterAbaViva(tel())    // trocar de janela/app não pode derrubar a chamada
    const repegar = async () => {
      if (document.hidden) return
      segurarTela()
      manterAbaViva(tel())  // voltou: reanima o áudio e confere o túnel na hora
      // No celular o sistema toma o microfone e pausa o som enquanto o app fica
      // atrás. Sem isto a ligação volta muda dos dois lados — o mentor acha que
      // caiu e desliga (relato de 07/08: no PC não acontece, no celular sim).
      const r = await revigorarMidia(tel(), audioRef.current, mudoRef.current)
      if (r.micTrocado) setGeracaoMic((g) => g + 1)   // o vigia precisa da trilha nova
    }
    document.addEventListener('visibilitychange', repegar)
    return () => {
      document.removeEventListener('visibilitychange', repegar)
      soltarTela(); soltarAbaViva()
    }
  }, [estado])

  // Reconexão automática: quando o túnel cai (Wi-Fi piscou, celular travou a
  // página), antes ficava "offline" até a pessoa recarregar. Agora tenta
  // voltar sozinho a cada 4s — e na hora, ao reabrir a tela.
  useEffect(() => {
    if (estado !== 'offline') return
    let vivo = true
    let tentando = false
    async function tentar() {
      if (!vivo || tentando || document.hidden || !tel()) return
      tentando = true
      try { await conectar(tel()) } catch { /* próxima rodada tenta de novo */ }
      tentando = false
    }
    tentar()
    const t = setInterval(tentar, 4000)
    document.addEventListener('visibilitychange', tentar)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', tentar) }
  }, [estado])

  async function ligar(numeroForcado) {
    // o auto-discar da sessão passa o número direto — o estado `numero` ainda
    // não teria sido re-renderizado a tempo
    const alvo = typeof numeroForcado === 'string' ? numeroForcado : numero
    if (typeof numeroForcado === 'string') setNumero(numeroForcado)
    if (!limparNumero(alvo)) return
    liberarAudio(audioRef.current)  // o clique é o gesto que o celular exige
    // segunda barreira: o botão já trava, mas o estado pode ter mudado nos
    // segundos entre a última leitura e o clique
    if (linhas && linhas.maximo > 0 && linhas.ocupadas >= linhas.maximo) {
      setAvisoLinha(`PABX ocupado — as ${linhas.maximo} linhas estão em uso. Aguarde alguém desligar.`)
      return
    }
    // Túnel morto por trás (Wi-Fi resetou, celular dormiu): reconecta ANTES de
    // discar, em vez de falhar na hora e cair na tela de encerramento.
    if (!tel()?.isConnected?.()) {
      setAvisoLinha('Reconectando ao PABX…')
      try { await conectar(tel()) } catch {
        setEstado('offline')
        setAvisoLinha('Sem conexão com o PABX — reconectando sozinho; tente de novo em alguns segundos.')
        return
      }
    }
    // Microfone bloqueado: abre o socorro guiado (a antiga mensagem mandava
    // "tocar no cadeado", mas vários celulares não mostram cadeado nenhum —
    // o Davi ficou preso nisso em 04/08).
    if (!(await prepararMicrofone())) {
      setMicAjuda(true)
      return
    }
    setEstado('chamando')
    setAvisoLinha('')
    setLegendas([]); setDados({}); setPosChamada(null)
    setCaptura({ nome: '', fone: '', email: '' }); setCapturaSalva('')
    setTonsEnviados(''); setVerTeclado(false)
    ligacaoRef.current = { numero: limparNumero(alvo) }
    atendeuRef.current = false
    inicioDiscagemRef.current = Date.now()
    setSessao((s) => (s ? { ...s, ligacoes: s.ligacoes + 1 } : s))
    try {
      await ligarPara(tel(), alvo, (codigo) => {
        const motivo = motivoRecusa(codigo)
        if (motivo) setAvisoLinha(motivo)
      })
    } catch { setEstado('pronto'); ligacaoRef.current = null; inicioDiscagemRef.current = 0 }
  }

  useEffect(() => {
    if (verTeclado) tecladoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [verTeclado])

  // tom do teclado: navega em URA sem sair da chamada
  async function tocarTom(t) {
    const ok = await enviarDtmf(tel(), t)
    if (ok) setTonsEnviados((x) => (x + t).slice(-20))
    else setAvisoLinha('Não consegui enviar o tom neste aparelho.')
  }

  // contato ditado pelo cliente na ligação: salva no dossiê do lead
  async function salvarCaptura() {
    const novo = {}
    if (captura.fone.trim()) novo.telefone_contato = captura.fone.trim()
    if (captura.email.trim()) novo.email_contato = captura.email.trim()
    if (captura.nome.trim()) novo.nome_atendente = captura.nome.trim()
    if (!Object.keys(novo).length) return
    if (!leadParaLigar?.id) { setCapturaSalva('Anotado (ligação sem lead — não dá para salvar na ficha)'); return }
    const { error } = await supabase.rpc('consolidar_dossie', { _lead_id: leadParaLigar.id, _novo: novo })
    if (error) { setCapturaSalva(`Erro ao salvar: ${error.message}`); return }
    if (captura.nome.trim()) {
      await supabase.from('leads').update({ contato_nome: captura.nome.trim() }).eq('id', leadParaLigar.id)
    }
    setCapturaSalva('Salvo na ficha do lead')
  }

  async function copiar(texto, marca) {
    if (!texto.trim()) return
    try { await navigator.clipboard.writeText(texto.trim()) } catch { return }
    setCopiado(marca)
    setTimeout(() => setCopiado(''), 1500)
  }

  async function desligar() { try { await tel().hangup() } catch { /* já encerrada */ } }
  async function atender() {
    liberarAudio(audioRef.current)  // idem: sem isto o celular não toca o lead
    setLegendas([]); setDados({}); setPosChamada(null)
    ligacaoRef.current = { numero: quemChama }
    try { await tel().answer() } catch { setEstado('pronto') }
  }
  async function recusar() {
    try { await tel().decline() } catch { /* já encerrada */ }
    setEstado('pronto')
  }
  async function alternarMudo() {
    if (mudo) { mudoRef.current = false; tel().unmute(); setMudo(false) }
    else { mudoRef.current = true; tel().mute(); setMudo(true) }
  }

  function fecharDesfecho() {
    setPosChamada(null); setLegendas([]); setDados({})
  }

  // Dossiê de prospecção direto do discador — mesmo botão da tela do lead
  const [levantando, setLevantando] = useState(false)
  const [msgLevantar, setMsgLevantar] = useState('')
  const [verDiagnostico, setVerDiagnostico] = useState(false)
  // Discador por cima do contato puxado: dá para digitar um número solto (ou
  // trocar de nicho) sem devolver o lead para a fila — ele fica esperando
  // logo ali, a um toque de "voltar ao contato".
  const [verDiscador, setVerDiscador] = useState(false)
  // Celular: os cartões de apoio (dossiê, contato, horários) abrem SOBRE o
  // roteiro em vez de empilhar embaixo — é o que mantém a tela de ligação
  // inteira visível, sem rolagem, com o cliente na linha.
  const [extra, setExtra] = useState(null)
  const ehDesktop = useEhDesktop()
  // contato novo na tela sempre reaparece como cartão, nunca atrás do teclado
  useEffect(() => { setVerDiscador(false) }, [leadParaLigar?.id])
  // ~1 min de levantamento. Se a resposta se perder, o servidor normalmente
  // concluiu — buscamos no banco em vez de acusar erro (caso Fabrício, 03/08).
  async function levantarDados() {
    if (!leadParaLigar?.id) return
    setLevantando(true); setMsgLevantar('')
    const { data, error } = await supabase.functions.invoke('enriquecer', {
      body: { lead_id: leadParaLigar.id },
    })
    if (!error && data?.ok) {
      setLevantando(false)
      aoPuxarLead?.({
        ...leadParaLigar,
        dossie: data.dossie,
        foto_url: data.foto_url || leadParaLigar.foto_url,
      })
      if (data.avisos?.length) setMsgLevantar(`Parcial: ${data.avisos.join(' · ')}`)
      return
    }
    const msgReal = await erroDaFuncao(error, data)
    if (msgReal) { setLevantando(false); setMsgLevantar(msgReal); return }

    setMsgLevantar('A resposta demorou — conferindo se concluiu…')
    const antes = leadParaLigar.dossie?.dados_levantados_em
    for (let i = 0; i < 10; i++) {
      await new Promise((ok) => setTimeout(ok, 6000))
      const { data: fresco } = await supabase.from('leads')
        .select('dossie, foto_url').eq('id', leadParaLigar.id).single()
      if (fresco?.dossie?.dados_levantados_em && fresco.dossie.dados_levantados_em !== antes) {
        setLevantando(false); setMsgLevantar('')
        aoPuxarLead?.({ ...leadParaLigar, dossie: fresco.dossie, foto_url: fresco.foto_url || leadParaLigar.foto_url })
        return
      }
    }
    setLevantando(false)
    setMsgLevantar('Não deu para concluir agora. Tente de novo em alguns minutos.')
  }

  const emLigacao = estado === 'chamando' || estado === 'em-chamada'
  // Todas as linhas em uso por outros mentores: não adianta discar.
  const semLinha = !!linhas && linhas.maximo > 0
    && linhas.ocupadas >= linhas.maximo && !emLigacao
  const script = scripts.find((s) => s.id === scriptId)
  const textoScript = script?.conteudo
    ?.replaceAll('{empresa}', leadParaLigar?.empresa || dados.empresa || 'a empresa')
    ?.replaceAll('{vendedor}', perfil?.nome || '')
    ?.replaceAll('{mentor}', perfil?.nome || '')
  const cores = {
    conectando: 'text-amber', pronto: 'text-ink-2', offline: 'text-danger',
    chamando: 'text-amber', tocando: 'text-sinal', 'em-chamada': 'text-sinal',
  }
  const cron = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`
  const segSessao = sessao ? Math.floor((Date.now() - sessao.inicio) / 1000) : 0
  const cronSessao = `${String(Math.floor(segSessao / 60)).padStart(2, '0')}:${String(segSessao % 60).padStart(2, '0')}`
  const rotulos = {
    conectando: 'Conectando…', pronto: `Ramal ${perfil?.ramal} pronto`, offline: 'Sem conexão com o PABX',
    chamando: 'Chamando…', tocando: `Recebendo de ${quemChama}`, 'em-chamada': `Em chamada · ${cron}`,
  }

  // ---------- chamada recebida ----------
  if (estado === 'tocando') {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto pt-16">
        <p className="text-sm text-ink-2">Ligação recebida</p>
        <div className="text-3xl font-bold">{quemChama}</div>
        <div className="flex justify-center gap-8 pt-6">
          <button onClick={atender} className="rounded-full bg-sinal text-white font-bold w-20 h-20">Atender</button>
          <button onClick={recusar} className="rounded-full bg-surface-2 border border-line text-ink-2 font-bold w-20 h-20">Recusar</button>
        </div>
      </div>
    )
  }

  // ---------- pós-chamada: desfecho (observação + próximo passo) ----------
  if (posChamada) {
    return (
      <>
        <Desfecho
          lead={leadParaLigar}
          numero={formatarFone(posChamada.numero)}
          dados={dados}
          perfil={perfil}
          aoFechar={fecharDesfecho}
          aoProximo={proximoDaSessao}
          aoRediscar={(n) => { fecharDesfecho(); ligar(n) }}
          legendas={legendas}
        />
      </>
    )
  }

  // ---------- em ligação: painel de acompanhamento ----------
  // Mobile: coluna única. Desktop: painel split (contexto | conversa ao vivo).
  if (emLigacao) {
    const cardLead = (
      <Cartao className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Sinal cor={estado === 'chamando' ? 'amber' : 'sinal'} pulsa />
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">
              {leadParaLigar?.empresa || dados.empresa || formatarFone(numero)}
            </p>
            <p className="text-xs text-ink-2 truncate">
              {leadParaLigar?.empresa ? formatarFone(numero) : ''}
              {leadParaLigar?.cidade ? ` · ${leadParaLigar.cidade}` : ''}
            </p>
          </div>
        </div>
        {Object.keys(dados).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3">
            {Object.entries(dados).map(([k, v]) => (
              <Chip key={k} cor="sinal">{k}: <b className="ml-0.5">{v}</b></Chip>
            ))}
          </div>
        )}
      </Cartao>
    )

    // dossiê à mão durante a ligação (rolável, sem tirar a conversa da tela)
    // Quem assina pela empresa + o essencial do Google, acima do dossiê inteiro:
    // é o que o mentor precisa nos primeiros trinta segundos da ligação.
    const cardEmpresa = temFichaEmpresa(leadParaLigar?.dossie) && (
      <Cartao className="p-3 space-y-2">
        <Rotulo className="mb-1.5">A empresa</Rotulo>
        <LigacoesRecentes leadId={leadParaLigar?.id} telefone={leadParaLigar?.telefone} />
        <FichaEmpresa dossie={leadParaLigar.dossie} />
      </Cartao>
    )

    const cardDossie = leadParaLigar?.dossie && Object.keys(leadParaLigar.dossie).length > 0 && (
      <Cartao className="p-3 max-h-64 md:max-h-80 overflow-y-auto">
        <Rotulo className="sticky top-0 bg-surface pb-1.5">Dossiê da empresa</Rotulo>
        <DossieBlocos dossie={leadParaLigar.dossie} compacto />
      </Cartao>
    )

    const cardScript = scripts.length > 0 && (
      <Cartao className="p-3">
        <div className="flex items-center justify-between gap-2">
          <select value={scriptId || ''} onChange={(e) => setScriptId(e.target.value)}
            className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-sm outline-none focus:border-sinal">
            {scripts.map((s) => <option key={s.id} value={s.id}>{s.titulo}</option>)}
          </select>
          <button onClick={() => setVerScript(!verScript)} className="text-xs text-sinal whitespace-nowrap">
            {verScript ? 'ocultar' : 'ver script'}
          </button>
        </div>
        {verScript && textoScript && (
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed max-h-40 md:max-h-none overflow-y-auto mt-2">
            {textoScript}
          </p>
        )}
      </Cartao>
    )

    // Contato ditado na ligação: anota, salva na ficha e deixa pronto para colar
    // na proposta. O botão de copiar existe para o vendedor não redigitar nada.
    const cardCaptura = (
      <Cartao className="p-3 space-y-2">
        <Rotulo>Contato do cliente</Rotulo>
        <input value={captura.nome} onChange={(e) => { setCaptura({ ...captura, nome: e.target.value }); setCapturaSalva('') }}
          placeholder="Nome de quem decide"
          className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
        <div className="flex gap-1.5">
          <input value={captura.fone} onChange={(e) => { setCaptura({ ...captura, fone: e.target.value }); setCapturaSalva('') }}
            inputMode="tel" placeholder="Telefone / WhatsApp"
            className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
          <button onClick={() => copiar(captura.fone, 'fone')} disabled={!captura.fone.trim()}
            title="Copiar telefone"
            className="shrink-0 rounded-lg border border-line px-2.5 text-[10px] font-bold text-ink-3 disabled:opacity-30">
            {copiado === 'fone' ? 'ok!' : <Icone nome="copiar" tam={13} />}
          </button>
        </div>
        <div className="flex gap-1.5">
          <input value={captura.email} onChange={(e) => { setCaptura({ ...captura, email: e.target.value }); setCapturaSalva('') }}
            inputMode="email" placeholder="E-mail"
            className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
          <button onClick={() => copiar(captura.email, 'email')} disabled={!captura.email.trim()}
            title="Copiar e-mail"
            className="shrink-0 rounded-lg border border-line px-2.5 text-[10px] font-bold text-ink-3 disabled:opacity-30">
            {copiado === 'email' ? 'ok!' : <Icone nome="copiar" tam={13} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={salvarCaptura}
            disabled={!captura.nome.trim() && !captura.fone.trim() && !captura.email.trim()}
            className="flex-1 rounded-lg bg-sinal py-2 text-xs font-bold text-white disabled:opacity-30">
            Salvar na ficha
          </button>
          {capturaSalva && <span className="text-[10px] text-sinal truncate">{capturaSalva}</span>}
        </div>
      </Cartao>
    )

    const cardTeclado = verTeclado && (
      <Cartao className="p-3 space-y-2" ref={tecladoRef}>
        <div className="flex items-baseline justify-between gap-2">
          <Rotulo>Teclado da ligação</Rotulo>
          {tonsEnviados && <span className="text-xs text-sinal font-bold tnum truncate">{tonsEnviados}</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TECLAS.map((t) => (
            <button key={t} onClick={() => tocarTom(t)}
              className="rounded-lg bg-surface-2 border border-line py-2.5 text-base font-bold active:bg-sinal active:text-white">
              {t}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-ink-3">
          Para menus automáticos: “digite 1 para vendas”. O tom vai direto na chamada.
        </p>
      </Cartao>
    )

    const controles = (
      <div className="space-y-2">
        {envioCaiu && (
          <div className="w-full rounded-xl border border-sinal/50 bg-sinal/10 px-3 py-2.5 text-center">
            <span className="block text-sm font-bold text-sinal">Religando seu microfone…</span>
            <span className="block text-[11px] text-ink-2 mt-0.5">
              O aparelho cortou o áudio ao sair do app. Fique nesta tela por um instante.
            </span>
          </div>
        )}
        {semDescida && (
          <div className="w-full rounded-xl border border-danger/50 bg-danger/10 px-3 py-2.5 text-center">
            <span className="block text-sm font-bold text-danger">
              O áudio do cliente parou de chegar
            </span>
            <span className="block text-[11px] text-ink-2 mt-0.5">
              Ele continua te ouvindo. Se não voltar em alguns segundos,
              avise que vai religar, desligue e ligue de novo.
            </span>
          </div>
        )}
        {redeRuim !== null && (
          <div className="w-full rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-center">
            <span className="block text-sm font-bold text-amber">
              Sua internet está falhando — o cliente está te ouvindo cortado
            </span>
            <span className="block text-[11px] text-ink-2 mt-0.5">
              {redeRuim}% do que você fala não chega. Chegue perto do roteador,
              use cabo, ou desligue o que estiver baixando.
            </span>
          </div>
        )}
        {micMudo && !mudo && (
          <div className="w-full rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-center">
            <span className="block text-sm font-bold text-amber">Seu microfone não está captando — o lead não te ouve</span>
            <span className="block text-[11px] text-ink-2 mt-0.5">
              Feche apps que usam o microfone (WhatsApp, gravador), confira a permissão do navegador e ligue de novo
            </span>
          </div>
        )}
        {semSom && (
          <button onClick={() => { liberarAudio(audioRef.current); tocarAudio(audioRef.current); setSemSom(false) }}
            className="w-full rounded-xl border border-danger/50 bg-danger/10 px-3 py-2.5 text-center">
            <span className="block text-sm font-bold text-danger">Sem áudio? Toque aqui</span>
            <span className="block text-[11px] text-ink-2 mt-0.5">
              O celular bloqueou o som da chamada — um toque libera
            </span>
          </button>
        )}
        {saidas.length > 1 && (
          <select value={saidaSel} onChange={(e) => usarSaida(e.target.value)}
            className="w-full rounded-lg bg-surface-2 border border-line px-2 py-2 text-xs outline-none">
            <option value="">Saída de som do aparelho</option>
            {saidas.map((s, i) => (
              <option key={s.deviceId} value={s.deviceId}>{s.label || `Saída ${i + 1}`}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <Botao variante={mudo ? 'principal' : 'contorno'} tam="lg" onClick={alternarMudo}
            className={cn('flex-1', mudo && '!bg-amber !text-[#101114]')}>
            {mudo ? 'Com som' : 'Mudo'}
          </Botao>
          <Botao variante={verTeclado ? 'principal' : 'contorno'} tam="lg"
            onClick={() => setVerTeclado(!verTeclado)} className="flex-1"
            aria-label="Teclado de tons" title="Teclado para menus automáticos (digite 1 para vendas)">
            <Icone nome="teclado" tam={17} />
          </Botao>
          <Botao variante="perigo" tam="lg" onClick={desligar} className="flex-[1.6]">Desligar</Botao>
        </div>
      </div>
    )

    return (
      <div className="p-4 md:p-6 h-[calc(100dvh-8.5rem)] md:h-[calc(100dvh-6.5rem)] anim-in flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <p className={cn('text-sm font-semibold tnum', cores[estado])}>● {rotulos[estado]}</p>
          {mudo && <Chip cor="amber">MUDO</Chip>}
        </div>

        {/* CELULAR (spec 2026-08-09): a tela da ligação cabe inteira, sem
            rolagem. Lead compacto no topo, roteiro ocupando o meio e os
            controles presos embaixo. Os cartões de apoio abrem POR CIMA do
            roteiro (painel `extra`), então nunca empurram nada para fora.
            COMPUTADOR: duas colunas — apoio à esquerda (rola por dentro),
            roteiro inteiro à direita, no lugar onde ficava a conversa ao vivo
            (que agora se lê no Histórico, com calma, depois da ligação). */}
        <div className="flex-1 min-h-0 flex flex-col gap-2.5
          md:grid md:gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] md:grid-rows-[minmax(0,1fr)_auto]">

          {/* apoio: no computador é a coluna que rola; no celular, o painel */}
          <div className="hidden md:flex md:flex-col md:min-h-0 md:overflow-y-auto md:space-y-3 md:pr-0.5
            md:col-start-1 md:row-start-1">
            {cardLead}
            {cardEmpresa}
            {ehDesktop && cardTeclado}
            {cardCaptura}
            <HorariosDoDia />
            {cardScript}
            {cardDossie}
          </div>

          {/* celular: cabeçalho enxuto do lead + atalhos para o apoio */}
          <div className="md:hidden shrink-0 space-y-2">
            {cardLead}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {[['empresa', 'Empresa', !!cardEmpresa], ['contato', 'Contato', true],
                ['horarios', 'Horários', true], ['dossie', 'Dossiê', !!cardDossie]]
                .filter(([, , tem]) => tem)
                .map(([id, rotulo]) => (
                  <button key={id} onClick={() => setExtra(extra === id ? null : id)}
                    className={cn('shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                      extra === id ? 'border-sinal bg-sinal/15 text-sinal' : 'border-line text-ink-3')}>
                    {rotulo}
                  </button>
                ))}
            </div>
          </div>

          {/* o roteiro é o centro da tela; o painel de apoio cobre ele quando aberto */}
          <div className="relative flex-1 min-h-0 md:col-start-2 md:row-start-1 md:row-span-2 md:flex">
            <Roteiro perfil={perfil} lead={leadParaLigar} dados={dados} className="h-full w-full"
              aoEditar={aoEditarRoteiro} />
            {!ehDesktop && (extra || verTeclado) && (
              <div className="absolute inset-0 z-10 rounded-2xl bg-bg/95 backdrop-blur
                border border-line p-3 overflow-y-auto anim-in">
                <button onClick={() => { setExtra(null); setVerTeclado(false) }}
                  className="sticky top-0 float-right text-ink-3 text-xs underline bg-bg/90 px-1">fechar</button>
                <div className="space-y-3">
                  {verTeclado && cardTeclado}
                  {!verTeclado && extra === 'empresa' && cardEmpresa}
                  {!verTeclado && extra === 'contato' && cardCaptura}
                  {!verTeclado && extra === 'horarios' && <HorariosDoDia />}
                  {!verTeclado && extra === 'dossie' && cardDossie}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 md:col-start-1 md:row-start-2">{controles}</div>
        </div>
      </div>
    )
  }

  // ---------- discador ----------
  // Enxuto de propósito: teclado, nichos/importados e puxar. Compromissos e
  // agenda vivem na própria aba, um toque de distância.
  return (
    <div className="p-4 md:p-6 max-w-sm mx-auto">
      {verDiagnostico && leadParaLigar && (
        <Diagnostico lead={leadParaLigar} perfil={perfil} aoFechar={() => setVerDiagnostico(false)} />
      )}
      <div className="flex flex-col items-center gap-3 md:gap-5 w-full min-w-0">
      <p className={`text-sm font-medium ${cores[estado]}`}>● {rotulos[estado]}</p>

      {sessao && !resumo && (
        <div className="w-full flex items-center justify-between rounded-xl border border-sinal/40 bg-sinal/10 px-3 py-2">
          <span className="text-xs font-bold text-sinal tnum flex items-center gap-1.5 min-w-0">
            <Icone nome="raio" tam={13} className="shrink-0" />
            <span className="truncate">
              Sessão · {sessao.ligacoes} lig · {cronSessao}{listaAtiva ? ` · ${listaAtiva.nome}` : ''}
            </span>
          </span>
          <button onClick={encerrarSessao} className="text-[11px] text-ink-3 underline shrink-0">encerrar</button>
        </div>
      )}

      {/* resumo do sprint — o fim de sessão com os números na cara */}
      {resumo && (
        <div className="w-full rounded-xl border border-sinal/40 bg-surface p-4 space-y-3 anim-in">
          <p className="text-sm font-bold uppercase tracking-wide">Sessão encerrada
            <span className="text-ink-3 font-normal normal-case tnum"> · {resumo.minutos} min</span></p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['discadas', resumo.discadas], ['atendidas', resumo.atendidas], ['conversas 1min+', resumo.conversas],
              ['retornos', resumo.retornos], ['reuniões', resumo.reunioes],
              ['lig/hora', Math.round((resumo.discadas || 0) * 60 / resumo.minutos)]].map(([r, v]) => (
              <div key={r} className={`rounded-lg border px-1 py-2 ${
                r === 'reuniões' && v > 0 ? 'border-sinal/50 bg-sinal/10' : 'border-line bg-surface-2'}`}>
                <p className={`tnum text-lg font-extrabold italic ${r === 'reuniões' && v > 0 ? 'text-sinal' : ''}`}>{v ?? 0}</p>
                <p className="text-[9px] uppercase tracking-wide text-ink-3 font-bold">{r}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setResumo(null); setSessao({ inicio: Date.now(), ligacoes: 0 }); puxarLead() }}
              className="flex-[2] rounded-lg bg-sinal py-2.5 text-sm font-bold text-white">
              <Icone nome="play" tam={12} className="inline mr-1.5 -mt-0.5" />Mais uma rodada
            </button>
            <button onClick={() => { setResumo(null); setSessao(null); setListaAtiva(null); aoLimparLead?.() }}
              className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-ink-2">Sair</button>
          </div>
        </div>
      )}

      {/* teclado por cima do contato: uma faixa lembra quem está esperando */}
      {leadParaLigar && verDiscador && (
        <button onClick={() => setVerDiscador(false)}
          className="w-full flex items-center gap-2 rounded-xl border border-sinal/40 bg-sinal/10 px-3 py-2 text-left">
          <Icone nome="seta" tam={13} className="shrink-0 text-sinal rotate-180" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wide text-ink-3 font-bold">Voltar ao contato</span>
            <span className="block text-xs font-semibold truncate">{leadParaLigar.empresa}</span>
          </span>
        </button>
      )}

      {leadParaLigar && !verDiscador ? (
        <div className="w-full rounded-xl bg-sinal/10 border border-sinal/30 px-4 py-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {leadParaLigar.foto_url && (
                <img src={leadParaLigar.foto_url} alt="" loading="lazy"
                  className="w-11 h-11 rounded-lg object-cover border border-line shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {leadParaLigar.empresa}
                  {/* contato com dono: a etiqueta lembra que esta lista é sua,
                      não do estoque da equipe (só o dono recebe ele aqui) */}
                  {leadParaLigar.dono === perfil?.user_id && (
                    <span className="ml-1.5 align-middle text-[9px] font-bold uppercase tracking-wide
                      border border-sky/40 text-sky rounded-full px-1.5 py-px whitespace-nowrap">
                      de {perfil?.nome?.split(' ')[0] || 'você'}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-2 truncate">
                  {leadParaLigar.cidade || ''}
                  {leadParaLigar.avaliacao ? ` · ★ ${leadParaLigar.avaliacao}` : ''}
                  {leadParaLigar.nicho ? ` · ${leadParaLigar.nicho}` : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={proximoContato} disabled={puxando || estado !== 'pronto'}
              className="flex-1 rounded-lg border border-sinal/50 text-sinal py-1.5 text-xs font-bold disabled:opacity-40">
              <Icone nome="pular" tam={11} className="inline mr-1 -mt-0.5" />
              {puxando ? 'Puxando…' : 'Próximo contato'}
            </button>
            {/* Numa sessão de lista o contato vem sempre da lista — trocar de
                nicho aqui não mudaria nada. O botão sai de cena e dá lugar ao
                atalho de sair da lista, que é a ação que faz sentido. */}
            {listaAtiva ? (
              <button onClick={() => { setListaAtiva(null); setAvisoFila('') }}
                className="flex-1 rounded-lg border border-line text-ink-2 py-1.5 text-xs font-bold"
                title={`Sai de "${listaAtiva.nome}" e volta para a fila por nicho`}>
                <Icone nome="x" tam={11} className="inline mr-1 -mt-0.5" />Sair da lista
              </button>
            ) : (
              <button onClick={proximoNicho} disabled={puxando || estado !== 'pronto'}
                className="flex-1 rounded-lg border border-line text-ink-2 py-1.5 text-xs font-bold disabled:opacity-40"
                title={modoFila === 'importado' ? 'Pula para a próxima planilha' : 'Pula para o próximo nicho da fila'}>
                <Icone nome="seta" tam={11} className="inline mr-1 -mt-0.5" />
                {modoFila === 'importado' ? 'Próxima planilha' : 'Próximo nicho'}
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setVerDiscador(true)}
              className="flex-1 rounded-lg border border-line text-ink-2 py-1.5 text-xs font-bold"
              title="Abre o teclado sem perder este contato — ele volta com um toque">
              <Icone nome="teclado" tam={11} className="inline mr-1 -mt-0.5" />Teclado
            </button>
            <button onClick={soltarLead}
              className="flex-1 rounded-lg border border-line text-ink-2 py-1.5 text-xs font-bold"
              title="Tira este contato da tela e devolve para a fila da equipe">
              <Icone nome="x" tam={11} className="inline mr-1 -mt-0.5" />Remover contato
            </button>
          </div>
          <div className="flex gap-1.5">
            <button onClick={levantarDados} disabled={levantando}
              className="flex-1 text-xs font-semibold border border-sky/40 text-sky rounded-lg py-1.5 disabled:opacity-50">
              {levantando ? 'Levantando… ~1 min' : (<><Icone nome="busca" tam={12} className="inline mr-1 -mt-0.5" />Levantar dados</>)}
            </button>
            {leadParaLigar.dossie?.dados_levantados_em && (
              <button onClick={() => setVerDiagnostico(true)}
                className="flex-1 text-xs font-semibold border border-sinal/50 text-sinal rounded-lg py-1.5">
                <Icone nome="doc" tam={12} className="inline mr-1 -mt-0.5" />Diagnóstico
              </button>
            )}
          </div>
          {msgLevantar && <p className="text-[11px] text-amber">{msgLevantar}</p>}
          <LigacoesRecentes leadId={leadParaLigar.id} telefone={leadParaLigar.telefone} />
          {leadParaLigar.tentativas > 0 && (
            <p className="text-[11px] text-ink-2">
              <Icone nome="hist" tam={11} className="inline mr-1 -mt-0.5" />
              {leadParaLigar.tentativas}ª tentativa · último:{' '}
              {NOMES_DESF[leadParaLigar.ultimo_desfecho] || leadParaLigar.ultimo_desfecho || '—'}
              {leadParaLigar.ultima_tentativa_em
                ? ` · ${new Date(leadParaLigar.ultima_tentativa_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          )}
          <button onClick={() => ligar()} disabled={estado !== 'pronto' || semLinha || !leadParaLigar.telefone}
            className="w-full rounded-xl bg-sinal py-3.5 font-bold text-white disabled:opacity-40">
            <Icone nome="fone" tam={15} className="inline mr-1.5 -mt-0.5" />
            {semLinha ? 'Linhas ocupadas'
              : leadParaLigar.telefone ? `Ligar · ${formatarFone(leadParaLigar.telefone)}` : 'Lead sem telefone'}
          </button>
          {/* Antes de discar: se o número é celular, dá para abrir a conversa.
              A mensagem já vai pronta com o link da proposta — a conversa em
              branco virou reclamação real em 19/08. */}
          {ehCelular(leadParaLigar.telefone) && (
            <a href={linkWhatsappProposta(leadParaLigar.telefone, {
                empresa: leadParaLigar.empresa || '',
                vendedor: perfil?.nome || '',
                zapVendedor: perfil?.whatsapp || '',
              })} target="_blank" rel="noopener noreferrer"
              title="Abrir a conversa no WhatsApp com a apresentação pronta"
              className="w-full rounded-xl border border-sinal/50 text-sinal py-2.5 font-bold text-sm
                flex items-center justify-center gap-2 transition hover:bg-sinal/10">
              <Icone nome="whatsapp" tam={15} />
              WhatsApp
            </a>
          )}
          {leadParaLigar.dossie && Object.keys(leadParaLigar.dossie).length > 0 && (
            <div className="max-h-[45vh] overflow-y-auto pr-0.5">
              <DossieBlocos dossie={leadParaLigar.dossie} compacto />
            </div>
          )}
        </div>
      ) : (
        <div className={`w-full ${caixa} p-3 space-y-2`}>
          {listaAtiva ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-xs font-semibold truncate">
                <Icone nome="lista" tam={12} className="inline mr-1 -mt-0.5 text-sinal" />{listaAtiva.nome}
              </span>
              <button onClick={puxarOutro} disabled={puxando || estado !== 'pronto'}
                className="rounded-lg bg-sinal px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                {puxando ? 'Puxando…' : 'Puxar da lista'}
              </button>
              <button onClick={() => setListaAtiva(null)} className="text-[11px] text-ink-3 underline shrink-0">sair</button>
            </div>
          ) : (
            <>
              {(lotes.length > 0 || modoFila === 'importado') && (
                <div className="flex rounded-lg border border-line p-0.5 text-xs font-semibold">
                  <button onClick={() => setModoFila('nicho')}
                    className={cn('flex-1 rounded-md py-1.5 transition',
                      modoFila === 'nicho' ? 'bg-sinal text-white' : 'text-ink-2')}>
                    Nichos
                  </button>
                  <button onClick={() => setModoFila('importado')}
                    className={cn('flex-1 rounded-md py-1.5 transition',
                      modoFila === 'importado' ? 'bg-sinal text-white' : 'text-ink-2')}>
                    Importados
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                {modoFila === 'importado' ? (
                  <select value={loteSel} onChange={(e) => setLoteSel(e.target.value)}
                    disabled={lotes.length === 0}
                    className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line pl-2 pr-7 py-2 text-sm outline-none truncate disabled:opacity-50">
                    <option value="">
                      {lotes.length ? 'Todas as planilhas' : 'Nenhuma planilha importada ainda'}
                    </option>
                    {lotes.map((l) => (
                      <option key={l.lote} value={l.lote}>
                        {l.lote} ({l.disponiveis}){l.meu ? ' · sua' : l.dono ? ` · de ${String(l.dono).split(' ')[0]}` : ''}
                      </option>
                    ))}
                  </select>
                ) : null}
                {modoFila === 'importado' && loteSel && lotes.find((l) => l.lote === loteSel)?.meu && (
                  <button onClick={removerPlanilha}
                    title={`Remover a planilha "${loteSel}" do seu discador`}
                    className="shrink-0 rounded-lg border border-line px-2.5 text-ink-3 hover:text-danger hover:border-danger/40">
                    <Icone nome="lixo" tam={13} />
                  </button>
                )}
                {modoFila !== 'importado' && (
                  <select value={nichoSel} onChange={(e) => setNichoSel(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line pl-2 pr-7 py-2 text-sm outline-none truncate">
                    <option value="">Todos os nichos</option>
                    {nichos.map((n) => (
                      <option key={n.nicho} value={n.nicho}>{n.nicho} ({n.disponiveis})</option>
                    ))}
                  </select>
                )}
                <button onClick={puxarOutro} disabled={puxando || estado !== 'pronto'}
                  className="shrink-0 rounded-lg bg-sinal px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                  {puxando ? 'Puxando…' : (<><Icone nome="alvo" tam={13} className="inline mr-1.5 -mt-0.5" />Puxar lead</>)}
                </button>
              </div>
            </>
          )}
          {avisoFila && <p className="text-xs text-amber">{avisoFila}</p>}
        </div>
      )}

      {linhas && linhas.maximo > 0 && (
        <p className="w-full text-center text-[11px] text-ink-3 tnum">
          <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 -mt-px align-middle',
            linhas.ocupadas >= linhas.maximo ? 'bg-danger' : 'bg-ink-3')} />
          {linhas.ocupadas >= linhas.maximo
            ? `${linhas.maximo} de ${linhas.maximo} linhas em uso`
            : `${linhas.maximo - linhas.ocupadas} de ${linhas.maximo} linhas livres`}
        </p>
      )}

      {(!leadParaLigar || verDiscador) && (<>
      <input
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        inputMode="tel"
        placeholder="DDD + número"
        className="w-full text-center text-2xl tracking-widest rounded-xl bg-surface border border-line px-4 py-2.5 md:py-3 outline-none focus:border-sinal"
      />
      <div className="grid grid-cols-3 gap-2 md:gap-3 w-full">
        {TECLAS.map((t) => (
          <button key={t} onClick={() => setNumero((n) => n + t)}
            className="rounded-xl bg-surface border border-line py-3 md:py-4 text-xl font-semibold active:bg-surface-2">
            {t}
          </button>
        ))}
      </div>
      </>)}
      {avisoLinha && (
        <p className="w-full text-center text-sm font-medium text-amber bg-amber/10 border border-amber/30 rounded-xl px-3 py-2">
          {avisoLinha}
        </p>
      )}
      {micAjuda && (
        <div className="w-full rounded-xl border border-amber/50 bg-amber/10 p-3 space-y-2 text-left">
          <p className="text-sm font-bold text-amber">O navegador está bloqueando seu microfone</p>
          <button onClick={liberarMicrofone}
            className="w-full rounded-lg bg-sinal py-2.5 text-sm font-bold text-white">
            Tentar liberar agora
          </button>
          {micTexto && <p className="text-[11px] text-amber font-semibold">{micTexto}</p>}
          <p className="text-[11px] text-ink-2 font-semibold">Se o pedido de permissão não abrir:</p>
          {/iphone|ipad/i.test(navigator.userAgent) ? (
            <ol className="text-[11px] text-ink-2 list-decimal ml-4 space-y-0.5">
              <li>abra <b>Ajustes</b> do iPhone → <b>Safari</b> (ou o navegador que usa)</li>
              <li><b>Microfone</b> → <b>Permitir</b></li>
              <li>volte aqui e recarregue a página</li>
            </ol>
          ) : (
            <ol className="text-[11px] text-ink-2 list-decimal ml-4 space-y-0.5">
              <li>toque nos <b>⋮ três pontinhos</b> no alto do navegador</li>
              <li><b>Configurações do site</b> (ou o ícone à esquerda do endereço)</li>
              <li><b>Microfone</b> → <b>Permitir</b></li>
              <li>volte, recarregue e toque em Ligar</li>
            </ol>
          )}
          <button onClick={() => setMicAjuda(false)} className="text-[11px] text-ink-3 underline">fechar</button>
        </div>
      )}
      {semLinha && (
        <div className="w-full rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-center">
          <p className="text-sm font-bold text-danger">PABX ocupado</p>
          <p className="text-xs text-ink-2 mt-0.5">
            As {linhas.maximo} linhas estão em uso agora. Assim que alguém desligar,
            o botão libera sozinho.
          </p>
        </div>
      )}
      {(!leadParaLigar || verDiscador) && (
      <div className="flex w-full gap-3">
        <button onClick={() => setNumero((n) => n.slice(0, -1))} className="flex-1 rounded-xl bg-surface border border-line py-3 md:py-4 font-semibold">⌫</button>
        <button onClick={() => ligar()} disabled={estado !== 'pronto' || semLinha}
          className="flex-[2] rounded-xl bg-sinal py-3 md:py-4 font-bold text-white disabled:opacity-40">
          {semLinha ? 'Linhas ocupadas' : 'Ligar'}
        </button>
      </div>
      )}
      </div>

    </div>
  )
}

function formatarFone(f) {
  const n = (f || '').replace(/\D/g, '').replace(/^55/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return f
}
