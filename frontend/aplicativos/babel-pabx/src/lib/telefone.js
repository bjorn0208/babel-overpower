import { Web } from 'sip.js'

const DOMINIO = import.meta.env.VITE_SIP_DOMINIO
const WSS = import.meta.env.VITE_SIP_WSS

// Caminhos de mídia, do melhor para o pior: UDP direto (STUN descobre o
// endereço público), TURN por UDP, TURN por TCP e TURN por TLS na 5349.
// O TURN é o que faz a ligação funcionar em operadora IPv6-only e em rede
// que bloqueia UDP — o navegador testa todos e fica com o mais rápido que
// completar. As URIs usam NOME (não IP): é o que permite ao NAT64 das
// operadoras traduzir o caminho para quem não tem IPv4 de verdade.
const TURN_URIS = (import.meta.env.VITE_TURN_URIS || '').split(',').filter(Boolean)
const TURN_USER = import.meta.env.VITE_TURN_USER || ''
const TURN_PASS = import.meta.env.VITE_TURN_PASS || ''

function servidoresIce() {
  const servidores = [{ urls: 'stun:stun.l.google.com:19302' }]
  if (TURN_URIS.length && TURN_USER && TURN_PASS) {
    servidores.push({ urls: TURN_URIS, username: TURN_USER, credential: TURN_PASS })
  }
  return servidores
}

// Normaliza para E.164 completo (55 + DDD + número) — a operadora BR-DID
// rejeita qualquer coisa fora disso com "484 Address Incomplete".
// Ramais internos (4 dígitos) e números já em E.164 (12-13) passam intactos.
export function limparNumero(numero) {
  let n = (numero || '').replace(/\D/g, '')
  n = n.replace(/^0+/, '')                              // remove 0(s) de operadora à esquerda
  if (n.length === 10 || n.length === 11) n = '55' + n // nacional -> E.164
  return n
}

// Pede a permissão de microfone uma única vez, antes da primeira chamada.
// As constraints são de telefonia: sem cancelamento de eco o celular no viva-voz
// devolve a própria voz do mentor para o lead.
export async function prepararMicrofone() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    s.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

// ───────────────────── reprodução no celular ─────────────────────
// Navegador de celular não toca áudio sem um gesto do usuário. O elemento é
// criado por código e recebe o som do lead por WebRTC, então o play automático
// é BLOQUEADO em silêncio: o lead ouve o mentor e o mentor não ouve nada.
// A saída é dar play uma vez dentro de um toque real na tela — a partir daí o
// elemento fica liberado para o resto da sessão.
let liberado = false

export function liberarAudio(el) {
  if (!el) return
  el.muted = false
  el.setAttribute('playsinline', '')   // iOS: não abre o player em tela cheia
  el.play?.().then(() => { liberado = true }).catch(() => { /* segue no próximo toque */ })
}

// Chamada quando o áudio do lead começa a chegar: se o play foi barrado antes,
// tenta de novo agora (aqui já houve o toque em "Ligar" ou "Atender").
export function tocarAudio(el) {
  if (!el) return false
  const p = el.play?.()
  if (p?.then) p.then(() => { liberado = true }).catch(() => {})
  return liberado
}

// Lista os destinos de som disponíveis (fone, viva-voz, bluetooth). Só o
// Chrome expõe isso, e em celular a lista costuma vir curta — por isso a
// interface só mostra o seletor quando há mais de uma opção real.
export async function saidasDeAudio() {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    const todos = await navigator.mediaDevices.enumerateDevices()
    return todos.filter((d) => d.kind === 'audiooutput' && d.deviceId)
  } catch {
    return []
  }
}

// Troca o destino do som. Devolve false quando o navegador não deixa (iOS, e
// Android fora do Chrome) — nesse caso quem manda é o sistema do aparelho.
export async function trocarSaida(el, deviceId) {
  if (!el?.setSinkId) return false
  try {
    await el.setSinkId(deviceId)
    return true
  } catch {
    return false
  }
}

// ─────────────── retomar a mídia ao voltar para o app ───────────────
// No computador, sair para outra janela não mexe na chamada. No celular mexe:
// quando o navegador vai para trás o sistema toma o microfone, e voltar para o
// app não devolve nada — a ligação segue de pé e o lead deixa de ouvir.
//
// O Android é o caso difícil. No iPhone a trilha ao menos assume 'ended', então
// dá para perceber olhando `readyState`. O Android mantém a trilha 'live' e
// `muted: false` enquanto ela não manda um pacote sequer: pelas propriedades
// está tudo perfeito. Foi por isso que a primeira versão desta função
// funcionou no iPhone e não fez absolutamente nada no Android (07/08).
//
// A régua confiável é o contador de pacotes de saída do próprio WebRTC.
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

export async function pacotesEnviados(telefone) {
  try {
    const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
    if (!pc?.getStats) return null
    const relatorio = await pc.getStats()
    let n = null
    relatorio.forEach((v) => {
      if (v.type === 'outbound-rtp' && v.kind === 'audio') n = v.packetsSent ?? 0
    })
    return n
  } catch { return null }
}

// Por onde o áudio desta chamada está passando? 'direto' (UDP host→host),
// 'stun' (UDP com endereço descoberto) ou 'relay' (TURN). É a resposta para
// "a operadora de fulano funciona?" sem depender de relato de ninguém.
export async function caminhoDaMidia(telefone) {
  try {
    const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
    if (!pc?.getStats) return null
    const relatorio = await pc.getStats()
    let parId = null
    relatorio.forEach((v) => {
      if (v.type === 'transport' && v.selectedCandidatePairId) parId = v.selectedCandidatePairId
    })
    let par = parId ? relatorio.get(parId) : null
    if (!par) {
      relatorio.forEach((v) => {
        if (!par && v.type === 'candidate-pair' && v.state === 'succeeded' && (v.selected || v.nominated)) par = v
      })
    }
    const local = par && relatorio.get(par.localCandidateId)
    if (!local) return null
    const caminho = local.candidateType === 'relay' ? 'relay'
      : local.candidateType === 'host' ? 'direto' : 'stun'
    return { caminho, protocolo: local.relayProtocol || local.protocol || null }
  } catch { return null }
}

export async function pacotesRecebidos(telefone) {
  try {
    const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
    if (!pc?.getStats) return null
    const relatorio = await pc.getStats()
    let n = null
    relatorio.forEach((v) => {
      if (v.type === 'inbound-rtp' && v.kind === 'audio') n = v.packetsReceived ?? 0
    })
    return n
  } catch { return null }
}

// ─────────── vigia da DESCIDA: o cliente parou de chegar? ───────────
// O caso inverso do vigia de envio: o mentor fala, o cliente responde — e
// nada chega. Ele acha que a linha caiu; o cliente ouve tudo e acha que foi
// ignorado. Aqui medimos o contador de pacotes RECEBIDOS de 3 em 3 segundos:
// duas leituras paradas seguidas = o áudio do cliente não está chegando, e a
// tela avisa em vez de deixar o mentor falando com o silêncio.
// (Relógio em Worker, como nos outros vigias: aba atrás não pode congelá-lo.)
export function vigiarRecebimento(telefone, aoMudar) {
  let vivo = true
  let anterior = null
  let paradas = 0
  let ocupado = false
  let w = null

  const passo = async () => {
    if (!vivo || ocupado) return
    ocupado = true
    try {
      const agora = await pacotesRecebidos(telefone)
      if (agora === null) { anterior = null; return }
      if (anterior !== null && agora <= anterior) {
        paradas += 1
        if (paradas >= 2) aoMudar?.({ recebendo: false })
      } else {
        if (paradas >= 2) aoMudar?.({ recebendo: true })
        paradas = 0
      }
      anterior = agora
    } finally { ocupado = false }
  }

  try {
    const fonte = 'let t=null;onmessage=(e)=>{if(e.data==="on"){clearInterval(t);'
      + 't=setInterval(()=>postMessage("tic"),3000)}else{clearInterval(t);t=null}}'
    w = new Worker(URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' })))
    w.onmessage = passo
    w.postMessage('on')
  } catch {
    const t = setInterval(passo, 3000)
    return () => { vivo = false; clearInterval(t) }
  }

  return () => {
    vivo = false
    try { w.postMessage('off'); w.terminate() } catch { /* já encerrado */ }
  }
}

// Quanto do que ESTAMOS ENVIANDO se perde no caminho.
//
// O vendedor nunca percebe isto: ele ouve o cliente bem (a descida costuma ser
// boa) enquanto o cliente o ouve picotado, porque a SUBIDA da internet dele é
// que está falhando. Quem denuncia é o relatório que o servidor devolve —
// `remote-inbound-rtp` traz a fração perdida do que mandamos.
export async function perdaDeSubida(telefone) {
  try {
    const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
    if (!pc?.getStats) return null
    const relatorio = await pc.getStats()
    let fracao = null
    relatorio.forEach((v) => {
      if (v.type === 'remote-inbound-rtp' && v.kind === 'audio'
          && typeof v.fractionLost === 'number') {
        fracao = v.fractionLost
      }
    })
    return fracao === null ? null : Math.max(0, Math.min(1, fracao))
  } catch { return null }
}

// Vigia a qualidade da subida durante a chamada e avisa quando ela passa a
// atrapalhar. Só reclama depois de duas leituras ruins seguidas: um engasgo de
// 3 segundos não merece susto no meio de uma venda.
export function vigiarRede(telefone, aoMudar) {
  let vivo = true
  let ruins = 0
  const t = setInterval(async () => {
    if (!vivo) return
    const f = await perdaDeSubida(telefone)
    if (f === null) return
    if (f >= 0.03) {
      ruins += 1
      if (ruins >= 2) aoMudar?.({ ruim: true, perda: Math.round(f * 100) })
    } else {
      if (ruins >= 2) aoMudar?.({ ruim: false, perda: Math.round(f * 100) })
      ruins = 0
    }
  }, 4000)
  return () => { vivo = false; clearInterval(t) }
}

// Troca o microfone DENTRO da chamada em curso. replaceTrack não renegocia
// nada — do ponto de vista da ligação, nada aconteceu.
// `mudoDoMentor` é o estado do BOTÃO na tela — nunca o da trilha antiga.
// Copiar `velha.enabled` parecia certo ("preserva o mudo"), mas o Android
// desliga a trilha quando o app vai para trás: a trilha nova nascia muda e a
// ligação voltava sem áudio, com o outro lado avisando que o mudo estava
// ligado. Mudo só existe se o mentor apertou o botão.
async function trocarMicrofone(telefone, mudoDoMentor = false) {
  const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
  const emissor = pc?.getSenders?.().find((s) => s.track?.kind === 'audio')
    || pc?.getSenders?.().find((s) => s.dtmf)
  if (!emissor) return false

  const velha = emissor.track
  const fluxo = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const nova = fluxo.getAudioTracks()[0]
  if (!nova) return false
  nova.enabled = !mudoDoMentor
  await emissor.replaceTrack(nova)

  // o botão de mudo e o vigia do microfone leem este fluxo
  const local = telefone?.localMediaStream
  if (local) {
    local.getAudioTracks().forEach((t) => {
      try { t.stop() } catch { /* já parada */ }
      local.removeTrack(t)
    })
    local.addTrack(nova)
  }
  if (velha) { try { velha.stop() } catch { /* já parada */ } }
  return true
}

export async function revigorarMidia(telefone, audioEl, mudoDoMentor = false) {
  const estado = { somRetomado: false, micTrocado: false, micVivo: false, tentativas: 0 }

  try {
    if (audioEl && audioEl.paused) {
      await audioEl.play().catch(() => {})
      estado.somRetomado = !audioEl.paused
    }
  } catch { /* o navegador ainda pode exigir um toque; o botão de socorro cobre */ }

  const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
  if (!pc) return estado

  // A régua é o contador de pacotes, não o estado da trilha. O Android
  // devolve `readyState: 'live'` e `muted: false` numa trilha que não manda
  // nada — quem olha só a propriedade conclui que está tudo bem e não faz
  // nada. Pacote que não sai é a única prova de que o lead não está ouvindo.
  const parou = async () => {
    const a = await pacotesEnviados(telefone)
    if (a === null) return false
    await espera(700)
    const b = await pacotesEnviados(telefone)
    return b !== null && b <= a
  }

  // Voltar do segundo plano não devolve o microfone na hora: o Android leva
  // um tempo para liberar o aparelho, e o primeiro getUserMedia pode até
  // falhar. Por isso insiste por alguns segundos em vez de desistir na
  // primeira tentativa.
  for (let i = 0; i < 4; i++) {
    if (!(await parou())) { estado.micVivo = true; break }
    estado.tentativas = i + 1
    try {
      if (await trocarMicrofone(telefone, mudoDoMentor)) estado.micTrocado = true
    } catch { /* aparelho ainda ocupado — tenta de novo na volta do laço */ }
    await espera(900)
  }

  if (!estado.micVivo) estado.micVivo = !(await parou())
  return estado
}

// ─────────── vigia do ENVIO, o tempo todo da chamada ───────────
// Consertar só no 'visibilitychange' não bastou no Android: o evento chega
// antes de o sistema devolver o microfone, ou o mentor troca de tela sem que
// ele dispare, e a ligação segue muda. Aqui a checagem é CONTÍNUA — de três em
// três segundos, do começo ao fim da chamada, medindo o contador de pacotes de
// saída. Se ele parou de crescer, o lead não está ouvindo, e o microfone é
// trocado na hora, sem esperar evento nenhum do navegador.
//
// O relógio vem de um Web Worker porque o do documento é estrangulado quando o
// app fica atrás de outro; o do worker continua andando.
export function vigiarEnvio(telefone, aoMudar, mudoDoMentor = () => false) {
  let vivo = true
  let anterior = null
  let paradas = 0
  let ocupado = false
  let w = null

  // Só o botão de mudo pode calar o microfone. Se a trilha aparecer desligada
  // sem o mentor ter pedido, foi o sistema do aparelho que a desligou ao mandar
  // o app para trás — religa na hora.
  const desfazerMudoAlheio = () => {
    try {
      const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
      const t = pc?.getSenders?.().find((s) => s.track?.kind === 'audio')?.track
      if (t && !t.enabled && !mudoDoMentor()) {
        t.enabled = true
        aoMudar?.({ enviando: true, recuperando: false, recuperado: true })
        return true
      }
    } catch { /* sem chamada no momento */ }
    return false
  }

  const passo = async () => {
    if (!vivo || ocupado) return
    ocupado = true
    try {
      desfazerMudoAlheio()
      const agora = await pacotesEnviados(telefone)
      if (agora === null) { anterior = null; return }
      if (anterior !== null && agora <= anterior) {
        paradas += 1
        // duas leituras seguidas sem um pacote: não é engasgo de rede
        if (paradas >= 2) {
          aoMudar?.({ enviando: false, recuperando: true })
          try {
            if (await trocarMicrofone(telefone, mudoDoMentor())) {
              paradas = 0
              anterior = null
              aoMudar?.({ enviando: true, recuperando: false, recuperado: true })
              return
            }
          } catch { /* aparelho ainda preso — tenta no próximo passo */ }
          aoMudar?.({ enviando: false, recuperando: true })
        }
      } else {
        if (paradas > 0) aoMudar?.({ enviando: true, recuperando: false })
        paradas = 0
      }
      anterior = agora
    } finally { ocupado = false }
  }

  try {
    const fonte = 'let t=null;onmessage=(e)=>{if(e.data==="on"){clearInterval(t);'
      + 't=setInterval(()=>postMessage("tic"),3000)}else{clearInterval(t);t=null}}'
    w = new Worker(URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' })))
    w.onmessage = passo
    w.postMessage('on')
  } catch {
    // navegador sem Worker: relógio comum, que ao menos anda com a tela aberta
    const t = setInterval(passo, 3000)
    return () => { vivo = false; clearInterval(t) }
  }

  return () => {
    vivo = false
    try { w.postMessage('off'); w.terminate() } catch { /* já encerrado */ }
  }
}

// ───────────────────── vigia do microfone ─────────────────────
// Caso Clayane (03/08): a chamada conectava, o áudio do lead chegava ao
// aparelho, mas o navegador não transmitia UM pacote de mídia — a trilha do
// microfone existia porém sem captar nada (mic tomado por outro app ou
// silenciado pelo sistema). Do servidor isso é invisível; só o navegador sabe.
// Aqui escutamos os eventos da própria trilha e, como alguns aparelhos a
// entregam "viva" mas calada, também medimos o sinal: um microfone real sempre
// tem ruído de fundo — silêncio digital absoluto por 5s significa mic morto.
export function vigiarMicrofone(telefone, aoMudar) {
  const stream = telefone?.localMediaStream
  const trilha = stream?.getAudioTracks?.()[0]
  if (!trilha) { aoMudar(true); return () => {} }

  const avisa = () => aoMudar(trilha.muted || trilha.readyState === 'ended')
  trilha.addEventListener('mute', avisa)
  trilha.addEventListener('unmute', avisa)
  trilha.addEventListener('ended', avisa)
  avisa()

  let ctx = null
  let parou = false
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    ctx.resume?.().catch(() => {})
    const analisador = ctx.createAnalyser()
    analisador.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analisador)
    const amostra = new Uint8Array(analisador.fftSize)
    let ultimoSom = Date.now()
    const mede = () => {
      if (parou) return
      // Celular pode entregar o medidor SUSPENSO (exige gesto): aí toda
      // amostra vem zerada e o alarme dispararia à toa, sem como sumir
      // ("cadeado preso", caso Davi 04/08). Suspenso = não acusa silêncio,
      // e segue tentando acordar o medidor.
      if (ctx.state !== 'running') {
        ctx.resume?.().catch(() => {})
        ultimoSom = Date.now()
      } else {
        analisador.getByteTimeDomainData(amostra)
        // 128 é o zero da escala; ±2 separa ruído ambiente de silêncio digital
        if (amostra.some((v) => v > 130 || v < 126)) ultimoSom = Date.now()
      }
      aoMudar(trilha.muted || trilha.readyState === 'ended' || Date.now() - ultimoSom > 5000)
      setTimeout(mede, 500)
    }
    mede()
  } catch { /* sem WebAudio ficam só os eventos da trilha */ }

  return () => {
    parou = true
    trilha.removeEventListener('mute', avisa)
    trilha.removeEventListener('unmute', avisa)
    trilha.removeEventListener('ended', avisa)
    ctx?.close().catch(() => {})
  }
}

// Cria o telefone SIP do mentor (SimpleUser do SIP.js sobre WSS)
export function criarTelefone({ ramal, senha, audioRemoto, eventos }) {
  const telefone = new Web.SimpleUser(WSS, {
    aor: `sip:${ramal}@${DOMINIO}`,
    userAgentOptions: {
      authorizationUsername: ramal,
      authorizationPassword: senha,
      displayName: `Ramal ${ramal}`,
      // Ping no túnel a cada 15s. Roteador de Wi-Fi doméstico mata conexão
      // parada sem avisar — era o "connection reset" que derrubava as
      // chamadas dos celulares (Clayane/Pedro, 04/08) no meio do toque.
      // ATENÇÃO: informar transportOptions substitui o objeto INTEIRO que a
      // SIP.js montaria — sem o server aqui, o telefone nasce sem endereço
      // e o app quebrava na abertura (04/08).
      transportOptions: { server: WSS, keepAliveInterval: 15 },
      // Sem isto a SIP.js usa só o STUN do Google: em operadora IPv6-only ou
      // APN sem UDP a chamada "completava" muda. O timeout menor tira os 5s
      // de espera ao discar quando algum servidor ICE não responde.
      sessionDescriptionHandlerFactoryOptions: {
        iceGatheringTimeout: 2500,
        peerConnectionConfiguration: { iceServers: servidoresIce() },
      },
    },
    media: { remote: { audio: audioRemoto } },
  })

  telefone.delegate = {
    onCallReceived: () => {
      const quem = telefone.session?.remoteIdentity?.uri?.user || 'desconhecido'
      eventos.aoReceber?.(quem)
    },
    onCallAnswered: () => eventos.aoAtender?.(),
    onCallHangup: () => eventos.aoDesligar?.(),
    onCallCreated: () => eventos.aoCriarChamada?.(),
    onRegistered: () => eventos.aoRegistrar?.(),
    onUnregistered: () => eventos.aoPerderRegistro?.(),
    onServerDisconnect: () => eventos.aoPerderRegistro?.(),
  }
  return telefone
}

export async function conectar(telefone) {
  await telefone.connect()
  await telefone.register()
}

// Tom do teclado durante a chamada — é o que navega em URA ("digite 1 para
// vendas"). Vai pelo caminho nativo do WebRTC (RFC 4733, dentro do RTP), que
// é o que o Asterisk espera por padrão; se o navegador não expuser o emissor
// de tons, cai para SIP INFO (o endpoint está em dtmf_mode=auto_info).
export async function enviarDtmf(telefone, tom) {
  try {
    const pc = telefone?.session?.sessionDescriptionHandler?.peerConnection
    const emissor = pc?.getSenders?.().find((s) => s.dtmf && s.track?.kind === 'audio')
    if (emissor?.dtmf) {
      emissor.dtmf.insertDTMF(tom, 250, 100)
      return true
    }
  } catch { /* sem suporte no navegador — tenta o INFO abaixo */ }
  try {
    await telefone.sendDTMF(tom)
    return true
  } catch {
    return false
  }
}

// ───────── manter a aba viva quando o mentor troca de janela/app ─────────
// Aba em segundo plano é congelada pelo navegador: os temporizadores caem
// para ~1 por minuto e o keep-alive do SIP atrasa — o servidor derruba o
// túnel e a chamada cai (ou o áudio some). Duas defesas, que valem tanto no
// computador quanto no celular:
//
//   1. um som INAUDÍVEL tocando enquanto durar a chamada: aba que está
//      reproduzindo áudio é poupada do congelamento;
//   2. um temporizador rodando dentro de um Web Worker, que não sofre o
//      mesmo freio — ele cutuca o túnel de tempos em tempos.
let audioCtx = null
let noAudio = null
let worker = null

export function manterAbaViva(telefone) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx && !audioCtx) {
      audioCtx = new Ctx()
      const osc = audioCtx.createOscillator()
      const vol = audioCtx.createGain()
      vol.gain.value = 0.0001          // presente para o navegador, mudo para o ouvido
      osc.connect(vol); vol.connect(audioCtx.destination)
      osc.start()
      noAudio = { osc, vol }
    }
    audioCtx?.resume?.().catch(() => {})
  } catch { /* sem Web Audio: seguimos só com o worker */ }

  try {
    if (!worker) {
      // o worker vive num blob para não precisar de arquivo separado no build
      const fonte = 'let t=null;onmessage=(e)=>{if(e.data==="on"){clearInterval(t);'
        + 't=setInterval(()=>postMessage("tic"),5000)}else{clearInterval(t);t=null}}'
      worker = new Worker(URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' })))
    }
    worker.onmessage = () => {
      // reanima o áudio e confere o túnel a cada tique, mesmo com a aba oculta
      audioCtx?.resume?.().catch(() => {})
      if (telefone && !telefone.isConnected?.()) {
        conectar(telefone).catch(() => {})
      }
    }
    worker.postMessage('on')
  } catch { /* navegador sem Worker: o som inaudível já ajuda */ }

  // diz ao sistema que há uma CHAMADA em andamento — o Android e o iOS
  // tratam a aba com mais cuidado quando ela declara mídia ativa
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: 'Ligação em andamento', artist: 'BabelPhone',
      })
      navigator.mediaSession.playbackState = 'playing'
    }
  } catch { /* sem MediaSession: tudo bem */ }
}

// ─────────────────── vigia do túnel, o dia inteiro ───────────────────
// O de cima só roda DURANTE a chamada. Mas a aba passa a maior parte do dia
// oculta atrás de outra janela, e aí o navegador estrangula o keep-alive do
// SIP: o WebSocket morre calado, o ramal sai do ar e a pessoa só descobre
// quando tenta ligar (ou quando param de chegar chamadas para ela). Este
// vigia é o mínimo para isso não acontecer: um worker — que o navegador não
// congela — conferindo o túnel de 15 em 15 segundos, sem áudio nenhum.
let vigia = null
let reconectando = false

export function vigiarTunel(telefone) {
  try {
    if (!vigia) {
      const fonte = 'let t=null;onmessage=(e)=>{if(e.data==="on"){clearInterval(t);'
        + 't=setInterval(()=>postMessage("tic"),15000)}else{clearInterval(t);t=null}}'
      vigia = new Worker(URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' })))
    }
    vigia.onmessage = async () => {
      if (reconectando || !telefone || telefone.isConnected?.()) return
      reconectando = true
      try { await conectar(telefone) } catch { /* na próxima rodada tenta de novo */ }
      reconectando = false
    }
    vigia.postMessage('on')
  } catch { /* navegador sem Worker: sobra a reconexão da própria tela */ }
}

export function pararVigia() {
  try { vigia?.postMessage('off') } catch { /* já parado */ }
}

export function soltarAbaViva() {
  try { worker?.postMessage('off') } catch { /* já parado */ }
  try { noAudio?.osc.stop() } catch { /* já parado */ }
  noAudio = null
  try { audioCtx?.close() } catch { /* já fechado */ }
  audioCtx = null
  try {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
  } catch { /* nada a fazer */ }
}

// ───────────────────── tela acesa durante a chamada ─────────────────────
// Celular com a tela apagada congela o JavaScript da página — o telefone
// morre no meio do toque. O Wake Lock segura a tela acesa enquanto durar a
// chamada (e é solto no fim, para não comer a bateria de ninguém).
let travaTela = null

export async function segurarTela() {
  try {
    if (!navigator.wakeLock || travaTela) return
    travaTela = await navigator.wakeLock.request('screen')
    travaTela.addEventListener('release', () => { travaTela = null })
  } catch { /* navegador sem suporte ou aba em segundo plano — segue o jogo */ }
}

export function soltarTela() {
  travaTela?.release().catch(() => {})
  travaTela = null
}

// Motivo legível para as recusas que o PABX/operadora devolvem.
// 503 = todas as nossas linhas ocupadas (dialplan, Congestion)
// 486/600/603 = quem foi chamado está ocupado ou recusou
export function motivoRecusa(codigo) {
  if (codigo === 503 || codigo === 480) return 'Nenhuma linha disponível agora (todas ocupadas ou operadora instável) — tente de novo em instantes.'
  if (codigo === 486 || codigo === 600 || codigo === 603) return 'A pessoa está ocupada ou recusou.'
  if (codigo === 484 || codigo === 404) return 'Número inválido.'
  return null
}

export async function ligarPara(telefone, numero, aoRecusar) {
  await telefone.call(
    `sip:${limparNumero(numero)}@${DOMINIO}`,
    {
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        },
      },
    },
    {
      requestDelegate: {
        onReject: (resposta) => aoRecusar?.(resposta?.message?.statusCode),
      },
    },
  )
}
