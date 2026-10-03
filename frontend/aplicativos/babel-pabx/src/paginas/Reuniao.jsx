import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import Cockpit from '../componentes/Cockpit'
// A sala veste a identidade da Babel OS (aurora + vidro) — o lead precisa
// sentir que já está DENTRO do sistema desde o primeiro segundo da call.
import '../estilos/reuniao-babel.css'

// Sala de reunião (Meet próprio — LiveKit na VPS).
// Funciona logado (mentor) e sem login (cliente convidado via link ?sala=).
export default function Reuniao({ sala, logado }) {
  const [fase, setFase] = useState(logado ? 'conectando' : 'form') // form | conectando | na-sala | erro
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [tick, setTick] = useState(0) // força re-render quando tracks mudam
  const [micLigado, setMicLigado] = useState(true)
  const [camLigada, setCamLigada] = useState(true)
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [audioBloqueado, setAudioBloqueado] = useState(false)
  const [avisoMidia, setAvisoMidia] = useState('')
  // Modo apresentação: URL da Babel OS embutida na sala (vinda do Cockpit)
  const [apresentacaoUrl, setApresentacaoUrl] = useState(null)
  const roomRef = useRef(null)

  async function entrar(nomeConvidado) {
    setFase('conectando'); setErro('')
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json' }
      if (sessao?.session?.access_token) headers.Authorization = `Bearer ${sessao.session.access_token}`
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sala-reuniao`,
        {
          method: 'POST',
          headers: { ...headers, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ sala, nome: nomeConvidado }),
        },
      )
      const dados = await resp.json()
      if (!dados.token) throw new Error(dados.erro || 'sem token')

      // VPS de 2 vCPU divide CPU com o PABX: 360p em 2 camadas corta ~4-6× o custo
      // por pessoa no servidor — sem isso a reunião trava com 3 câmeras (visto 29/07).
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
          videoEncoding: VideoPresets.h360.encoding,
        },
      })
      roomRef.current = room
      const atualizar = () => setTick((t) => t + 1)
      room
        .on(RoomEvent.TrackSubscribed, atualizar)
        .on(RoomEvent.TrackUnsubscribed, atualizar)
        .on(RoomEvent.ParticipantConnected, atualizar)
        .on(RoomEvent.ParticipantDisconnected, atualizar)
        .on(RoomEvent.LocalTrackPublished, atualizar)
        .on(RoomEvent.Disconnected, () => setFase('form'))
        // O mentor entra pela URL direto, sem nenhum clique na página — o
        // Chrome bloqueia o autoplay do áudio remoto e o lead fica MUDO.
        // Quando isso acontece, mostramos um botão; o clique libera tudo.
        .on(RoomEvent.AudioPlaybackStatusChanged, () =>
          setAudioBloqueado(!room.canPlaybackAudio))
      await room.connect(dados.url, dados.token)
      // Mic e câmera pedidos SEPARADOS: num aparelho sem webcam o pedido
      // conjunto falhava inteiro e o microfone nunca era publicado — o outro
      // lado ficava sem som. E falha de mic agora aparece na tela, não some.
      await Promise.allSettled([
        room.localParticipant.setMicrophoneEnabled(true).catch(() => {
          setMicLigado(false)
          setAvisoMidia('Seu microfone está bloqueado — toque no cadeado do navegador, permita o microfone e recarregue.')
        }),
        room.localParticipant.setCameraEnabled(true).catch(() => setCamLigada(false)),
      ])
      setAudioBloqueado(!room.canPlaybackAudio)
      setFase('na-sala')
    } catch (e) {
      setErro('Não foi possível entrar na sala. Tente de novo.')
      setFase(logado ? 'erro' : 'form')
    }
  }

  useEffect(() => {
    if (logado) entrar('')
    return () => { roomRef.current?.disconnect() }
  }, [])

  async function alternarMic() {
    const novo = !micLigado
    await roomRef.current?.localParticipant.setMicrophoneEnabled(novo)
    setMicLigado(novo)
  }
  async function alternarCam() {
    const novo = !camLigada
    await roomRef.current?.localParticipant.setCameraEnabled(novo)
    setCamLigada(novo)
  }
  function sair() {
    roomRef.current?.disconnect()
    window.location.href = window.location.pathname // limpa ?sala=
  }
  function copiarLink() {
    navigator.clipboard.writeText(`${window.location.origin}/?sala=${sala}`)
    setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2000)
  }

  if (fase === 'form' || fase === 'erro') {
    return (
      <div className="sala-babel flex items-center justify-center p-6">
        <form
          onSubmit={(e) => { e.preventDefault(); entrar(nome) }}
          className="sb-vidro-forte w-full max-w-sm rounded-2xl p-6 space-y-4"
          style={{ borderRadius: 18 }}
        >
          <div className="flex justify-center">
            <span className="sb-pilula sb-vidro"><span className="sb-logo">B</span><b>BABEL OS</b></span>
          </div>
          <h1 className="text-lg font-bold text-center" style={{ color: 'var(--sb-txt-1)' }}>
            Mentoria ao vivo
          </h1>
          <p className="text-sm text-center" style={{ color: 'var(--sb-txt-3)' }}>Sala {sala}</p>
          <input
            required minLength={2} placeholder="Seu nome" value={nome}
            onChange={(e) => setNome(e.target.value)} className="sb-input"
          />
          {erro && <p className="text-sm" style={{ color: 'var(--sb-erro)' }}>{erro}</p>}
          <button className="sb-cta">Entrar na mentoria</button>
        </form>
      </div>
    )
  }

  if (fase === 'conectando') {
    return (
      <div className="sala-babel flex items-center justify-center">
        <span className="sb-pilula sb-vidro"><span className="sb-logo">B</span><b>BABEL OS</b> entrando na sala…</span>
      </div>
    )
  }

  const room = roomRef.current
  const participantes = [room.localParticipant, ...room.remoteParticipants.values()]
  const cols = participantes.length <= 1 ? 'grid-cols-1'
    : participantes.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'

  // h-dvh + overflow-hidden: sem altura travada o painel do Cockpit cresce
  // junto com o dossiê e o overflow-y-auto interno nunca ativa — a página
  // inteira rolava e esticava os vídeos (visto 10/08).
  return (
    <div className="sala-babel flex h-dvh overflow-hidden">
      {/* pílulas do topo — a marca do OS presente pro mentor E pro lead */}
      <div className="fixed top-3 left-0 right-0 z-30 flex items-center gap-2 px-4 pointer-events-none">
        <span className="sb-pilula sb-vidro"><span className="sb-logo">B</span><b>BABEL OS</b></span>
        <span className="sb-pilula sb-vidro" style={{ textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 10 }}>
          <i className="sb-vivo" /> Mentoria ao vivo
        </span>
      </div>
      {audioBloqueado && (
        <button
          onClick={() => roomRef.current?.startAudio()
            .then(() => setAudioBloqueado(false)).catch(() => {})}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-40 rounded-full bg-amber px-5 py-2.5 font-bold text-[#1a1200] shadow-lg animate-pulse"
        >
          Tocar o som da reunião
        </button>
      )}
      {avisoMidia && (
        <p className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-sm rounded-xl bg-danger/90 text-white text-sm px-4 py-2.5 text-center">
          {avisoMidia}
        </p>
      )}
      <div className="flex-1 flex flex-col min-w-0" style={{ paddingTop: 52 }}>
        {apresentacaoUrl ? (
          <>
            {/* apresentação: vídeos viram tira no topo, Babel OS ocupa o resto */}
            <div className="flex gap-2 px-2 overflow-x-auto shrink-0 h-24">
              {participantes.map((p) => (
                <div key={p.identity} className="w-32 shrink-0 h-full">
                  <Bloco participante={p} local={p === room.localParticipant} />
                </div>
              ))}
            </div>
            <div className="flex-1 relative min-h-0 p-2">
              {/* moldura de vidro: o sistema real aparece como janela do OS */}
              <iframe src={apresentacaoUrl} title="Babel OS"
                className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] border-0 rounded-2xl"
                style={{ background: 'oklch(0.15 0.04 264)', border: '1px solid var(--sb-vidro-borda-forte)', boxShadow: '0 30px 90px rgba(0,0,0,.5)' }} />
            </div>
            <div className="sb-vidro-forte flex justify-center gap-2 p-2 mx-auto mb-3 rounded-full">
              <Botao ativo={micLigado} aoClicar={alternarMic} rotuloOn="Mic" rotuloOff="Mudo" />
              <button onClick={() => setApresentacaoUrl(null)} className="sb-ctl">✕ Encerrar apresentação</button>
              <button onClick={sair} className="sb-ctl sair">Sair</button>
            </div>
          </>
        ) : (
          <>
            <div className={`flex-1 grid ${cols} gap-2 p-2 auto-rows-fr`} key={tick}>
              {participantes.map((p) => (
                <Bloco key={p.identity} participante={p} local={p === room.localParticipant} />
              ))}
            </div>
            <div className="sb-vidro-forte flex justify-center gap-2 p-2 mx-auto mb-5 rounded-full">
              <Botao ativo={micLigado} aoClicar={alternarMic} rotuloOn="Mic" rotuloOff="Mudo" />
              <Botao ativo={camLigada} aoClicar={alternarCam} rotuloOn="Cam" rotuloOff="Sem cam" />
              <button onClick={copiarLink} className="sb-ctl">{linkCopiado ? '✓ Copiado' : 'Link'}</button>
              <button onClick={sair} className="sb-ctl sair">Sair</button>
            </div>
          </>
        )}
      </div>
      {/* cockpit da mentoria — só o mentor logado vê; o convidado nunca */}
      {logado && <Cockpit sala={sala} aoApresentar={setApresentacaoUrl} />}
    </div>
  )
}

function Botao({ ativo, aoClicar, rotuloOn, rotuloOff }) {
  return (
    <button onClick={aoClicar} className={`sb-ctl ${ativo ? '' : 'off'}`}>
      {ativo ? rotuloOn : rotuloOff}
    </button>
  )
}

function Bloco({ participante, local }) {
  const videoTrack = participante.getTrackPublication(Track.Source.Camera)?.track
  const audioTrack = participante.getTrackPublication(Track.Source.Microphone)?.track
  return (
    <div className="sb-video min-h-[160px]">
      {videoTrack ? (
        <video
          className="w-full h-full object-cover"
          autoPlay playsInline muted={local}
          ref={(el) => { if (el) videoTrack.attach(el) }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--sb-txt-3)' }}>
          <Icone nome="equipe" tam={40} traco={1.4} />
        </div>
      )}
      {!local && audioTrack && (
        <audio autoPlay ref={(el) => { if (el) audioTrack.attach(el) }} />
      )}
      <span className="sb-nome">
        {participante.name || participante.identity}{local ? ' (você)' : ''}
      </span>
    </div>
  )
}
