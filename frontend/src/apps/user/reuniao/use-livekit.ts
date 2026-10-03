/**
 * use-livekit — motor de mídia da chamada via LiveKit (VPS da plataforma).
 *
 * Substitui a malha P2P (use-webrtc + webrtc-pares): cada participante sobe
 * câmera/mic/tela UMA vez pro servidor e ele distribui e adapta por assinante
 * — upload não multiplica mais pelo nº de pares e ninguém depende de relay
 * público. Receita validada no diagnóstico 2026-08-01: 360p simulcast na
 * câmera, tela 1080p com poucos quadros/s.
 *
 * O contrato é o mesmo do motor antigo (EstadoWebRTC/HandleWebRTC): a UI
 * (TelaChamada, CelulaVideo) não muda. Presença (nome, mão, mic mudo) e
 * comandos do anfitrião continuam no Supabase Realtime (use-sinalizacao);
 * só a MÍDIA trocou de cano.
 */

import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from "livekit-client";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { HandleSinalizacao, InfoPresence, MsgComando } from "./use-sinalizacao";

// ─── Tipos públicos (contrato preservado do motor antigo) ───────────────────

export type StreamRemoto = {
  peerId: string;
  nome: string;
  /** null quando o participante não publica câmera nem mic (tile placeholder). */
  stream: MediaStream | null;
  /** true quando este stream é uma tela compartilhada (tile próprio). */
  ehTela: boolean;
  /** true quando não há faixa de câmera — o tile mostra avatar/placeholder. */
  semVideo: boolean;
  maoLevantada: boolean;
  micMudo: boolean;
  /** Participante do time do tenant — tile ganha borda da marca. */
  doTime: boolean;
};

export type EstadoWebRTC = {
  streamLocal: MediaStream | null;
  /** Minha tela compartilhada (tile local extra quando ativo). */
  streamTelaLocal: MediaStream | null;
  streamRemotos: StreamRemoto[];
  compartilhandoTela: boolean;
  mutado: boolean;
  semVideo: boolean;
  minhaMaoLevantada: boolean;
  /** Modo "mesmo ambiente": este aparelho fica sem mic E sem som. */
  mesmoAmbiente: boolean;
};

export type ConfigWebRTC = {
  meuPeerId: string;
  /** chave_publica da sala — a edge sala-reuniao valida e emite o token. */
  chavePublica: string;
  /** Nome de exibição (logado usa o do perfil na edge; convidado usa este). */
  nome: string;
  onEstadoMudou: (estado: EstadoWebRTC) => void;
  onSilenciadoPeloAnfitriao?: () => void;
  onEncerradaPeloAnfitriao?: () => void;
  /** Anfitrião mandou abrir um recurso (ex.: contrato) na tela de todos. */
  onAbrirRecurso?: (url: string, titulo: string) => void;
};

export type HandleWebRTC = {
  iniciarMidia: () => Promise<void>;
  conectarSinalizacao: (sinalizacao: HandleSinalizacao) => void;
  onPeerEntrou: (peer: InfoPresence) => void;
  onPeerSaiu: (peerId: string) => void;
  onPeersSync: (peers: InfoPresence[]) => void;
  onComando: (msg: MsgComando) => void;
  alternarMicrofone: () => void;
  alternarCamera: () => void;
  alternarTela: () => Promise<void>;
  alternarMao: () => void;
  /** Liga/desliga o modo "mesmo ambiente" (mic + som deste aparelho). */
  alternarMesmoAmbiente: () => void;
  /** Anfitrião: pede que o peer silencie o próprio microfone. */
  silenciarPeer: (peerId: string) => void;
  destruir: () => void;
};

/**
 * Só deixa passar URL http(s) absoluta e bem formada. Bloqueia javascript:,
 * data:, blob: e afins — a URL vem de um comando de outro participante e seria
 * aberta num iframe na tela de todos.
 */
function sanitizarUrlRecurso(bruta: string): string | null {
  try {
    const u = new URL(bruta);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ─── Fábrica ─────────────────────────────────────────────────────────────────

export function criarWebRTC(cfg: ConfigWebRTC): HandleWebRTC {
  let sinalizacao: HandleSinalizacao | null = null;
  let mutado = false;
  let semVideo = false;
  let maoLevantada = false;
  let mesmoAmbiente = false;
  let destruido = false;
  const meta = new Map<string, InfoPresence>();
  // MediaStreams estáveis por participante+tipo — trocar o objeto a cada
  // atualização faria o <video> re-anexar e piscar.
  const streamsCache = new Map<string, MediaStream>();

  // VPS de 2 vCPU divide CPU com o PABX: 360p em 2 camadas + servidor
  // adaptando por assinante é o que faz 10 pessoas + tela caberem nela.
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      videoEncoding: VideoPresets.h360.encoding,
    },
  });

  // ─ Estado ─

  function streamEstavel(chave: string, tracks: MediaStreamTrack[]): MediaStream {
    let stream = streamsCache.get(chave);
    if (!stream) {
      stream = new MediaStream();
      streamsCache.set(chave, stream);
    }
    const atuais = new Set(stream.getTracks());
    for (const track of tracks) {
      if (!atuais.has(track)) stream.addTrack(track);
      atuais.delete(track);
    }
    for (const sobra of atuais) stream.removeTrack(sobra);
    return stream;
  }

  function emitirEstado(): void {
    if (destruido) return;
    const local = room.localParticipant;

    const tracksLocais = [
      local.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack,
      local.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack,
    ].filter((t): t is MediaStreamTrack => !!t);
    const streamLocal = tracksLocais.length ? streamEstavel("local:cam", tracksLocais) : null;

    const trackTela = local.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack;
    const streamTelaLocal = trackTela ? streamEstavel("local:tela", [trackTela]) : null;

    const streamRemotos: StreamRemoto[] = [];
    for (const p of room.remoteParticipants.values()) {
      const info = meta.get(p.identity);
      const nome = info?.nome ?? p.name ?? "Participante";
      const trackCam = p.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack ?? null;
      const trackMic = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
      const tracksMedia = [trackCam, trackMic].filter((t): t is MediaStreamTrack => !!t);
      // Tile principal SEMPRE existe pra cada participante conectado — mesmo sem
      // câmera nem mic (placeholder). Antes, quem entrava com câmera/mic desligados
      // (ou antes dos tracks chegarem) simplesmente não aparecia na call.
      streamRemotos.push({
        peerId: p.identity,
        nome,
        stream: tracksMedia.length ? streamEstavel(`${p.identity}:cam`, tracksMedia) : null,
        ehTela: false,
        semVideo: !trackCam,
        maoLevantada: info?.maoLevantada ?? false,
        micMudo: info?.micMudo ?? false,
        doTime: info?.doTime ?? false,
      });
      const telaRemota = p.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack;
      if (telaRemota) {
        streamRemotos.push({
          peerId: p.identity,
          nome,
          stream: streamEstavel(`${p.identity}:tela`, [telaRemota]),
          ehTela: true,
          semVideo: false,
          maoLevantada: false,
          micMudo: false,
          doTime: false,
        });
      }
    }

    cfg.onEstadoMudou({
      streamLocal,
      streamTelaLocal,
      streamRemotos,
      compartilhandoTela: streamTelaLocal !== null,
      mutado,
      semVideo,
      minhaMaoLevantada: maoLevantada,
      mesmoAmbiente,
    });
  }

  room
    .on(RoomEvent.TrackSubscribed, emitirEstado)
    .on(RoomEvent.TrackUnsubscribed, emitirEstado)
    .on(RoomEvent.TrackMuted, emitirEstado)
    .on(RoomEvent.TrackUnmuted, emitirEstado)
    .on(RoomEvent.LocalTrackPublished, emitirEstado)
    .on(RoomEvent.LocalTrackUnpublished, emitirEstado)
    .on(RoomEvent.ParticipantConnected, emitirEstado)
    .on(RoomEvent.ParticipantDisconnected, emitirEstado)
    .on(RoomEvent.Disconnected, emitirEstado);

  // ─ Entrada: token na edge → conecta → liga mídia ─

  async function iniciarMidia(): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke("sala-reuniao", {
        body: { chave: cfg.chavePublica, nome: cfg.nome, peerId: cfg.meuPeerId },
      });
      if (error || !data?.token) {
        throw new Error(data?.erro ?? error?.message ?? "sem token");
      }

      if (data.aviso) {
        toast.warning(
          `A plataforma está cheia agora (${data.aviso.total} pessoas em reunião) — a qualidade pode cair.`,
        );
      }

      await room.connect(data.url, data.token);
    } catch (err) {
      console.error("[Reunião] conexão com o servidor de mídia falhou", err);
      toast.error("Não foi possível conectar à sala. Tente de novo em instantes.");
      return;
    }

    try {
      await room.localParticipant.enableCameraAndMicrophone();
    } catch (err) {
      console.warn("[Reunião] câmera+mic negados, tentando só áudio", err);
      // Câmera negada/ausente não pode matar a chamada — tenta só áudio.
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        semVideo = true;
        toast.warning("Sem acesso à câmera — você entrou só com áudio.");
      } catch (errAudio) {
        console.error("[Reunião] microfone também falhou", errAudio);
        toast.error(
          "Não foi possível acessar câmera/microfone. Verifique as permissões do navegador.",
        );
      }
    }
    emitirEstado();
  }

  // ─ Sinalização / presence (inalterado: Realtime cuida de quem é quem) ─

  function conectarSinalizacao(s: HandleSinalizacao): void {
    sinalizacao = s;
  }

  function onPeerEntrou(peer: InfoPresence): void {
    meta.set(peer.peerId, peer);
    emitirEstado();
  }

  function onPeerSaiu(peerId: string): void {
    meta.delete(peerId);
    emitirEstado();
  }

  function onPeersSync(peers: InfoPresence[]): void {
    for (const peer of peers) meta.set(peer.peerId, peer);
    emitirEstado();
  }

  function onComando(msg: MsgComando): void {
    // SEGURANÇA: comandos privilegiados (silenciar o mic dos outros, encerrar a
    // sala pra todos, abrir link na tela de todos) só valem se vierem de quem é
    // anfitrião. Antes, silenciar_mic e encerrar não checavam papel nenhum — QUALQUER
    // participante do canal Realtime público mandava "encerrar" e derrubava a call
    // de todo mundo.
    //
    // ATENÇÃO — ENFORCEMENT VERDADEIRO É SERVER-SIDE: o `papel` daqui vem do presence
    // do canal Realtime, que é AUTO-DECLARADO pelo próprio remetente (ver
    // abrirSessaoViva → criarSinalizacao: papel = ehAnfitriao ? "anfitriao" : ...).
    // Um participante malicioso pode forjar papel="anfitriao" no track do presence e
    // furar este guard. O único enforcement real precisa acontecer no servidor: a edge
    // `sala-reuniao` / o servidor LiveKit têm que validar que o remetente é o DONO da
    // sala (salas_reuniao.tenant_id, fonte confiável no banco) antes de propagar o
    // comando — presence de canal público nunca é fonte de verdade de autoridade.
    // Este guard cliente é defesa-em-profundidade, não a trava final.
    const remetenteEhAnfitriao = meta.get(msg.de)?.papel === "anfitriao";
    if (!remetenteEhAnfitriao) return;

    if (msg.acao === "silenciar_mic" && !mutado) {
      alternarMicrofone();
      cfg.onSilenciadoPeloAnfitriao?.();
    }
    if (msg.acao === "encerrar") {
      cfg.onEncerradaPeloAnfitriao?.();
    }
    if (msg.acao === "abrir_recurso" && msg.url) {
      // O link vem de um comando de outro participante e será aberto num iframe na
      // tela de todos — nunca confiar na URL crua. Só passa http(s) absoluta e bem
      // formada (bloqueia javascript:, data:, blob:, etc.).
      const urlSegura = sanitizarUrlRecurso(msg.url);
      if (urlSegura) cfg.onAbrirRecurso?.(urlSegura, msg.titulo ?? "Documento");
    }
  }

  // ─ Controles ─

  function alternarMicrofone(): void {
    mutado = !mutado;
    void room.localParticipant.setMicrophoneEnabled(!mutado).catch(() => {});
    void sinalizacao?.atualizarPresence({ micMudo: mutado });
    emitirEstado();
  }

  function alternarCamera(): void {
    semVideo = !semVideo;
    void room.localParticipant.setCameraEnabled(!semVideo).catch(() => {});
    emitirEstado();
  }

  async function alternarTela(): Promise<void> {
    const compartilhando = !!room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    try {
      if (compartilhando) {
        await room.localParticipant.setScreenShareEnabled(false);
      } else {
        // Teto 1080p + poucos quadros/s + banda limitada: tela prioriza texto
        // legível sem afogar o servidor (mesma régua do motor antigo).
        await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution: { width: 1920, height: 1080, frameRate: 8 },
            contentHint: "detail",
          },
          {
            simulcast: false,
            videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 8 },
          },
        );
      }
    } catch (err) {
      // Cancelar o seletor não é erro; negação de permissão é — e precisa de
      // aviso claro (macOS exige liberar "Gravação de Tela" pro navegador).
      const nome = (err as DOMException)?.name;
      if (nome === "NotAllowedError" || nome === "NotFoundError") {
        toast.error(
          "O sistema bloqueou o compartilhamento de tela. No macOS: Ajustes > Privacidade e Segurança > Gravação de Tela > libere o navegador e reabra ele.",
        );
      }
      console.warn("[Reunião] compartilhamento de tela cancelado ou negado", err);
    }
    emitirEstado();
  }

  function alternarMao(): void {
    maoLevantada = !maoLevantada;
    void sinalizacao?.atualizarPresence({ maoLevantada });
    emitirEstado();
  }

  function silenciarPeer(peerId: string): void {
    void sinalizacao?.enviarComando(peerId, "silenciar_mic");
  }

  function alternarMesmoAmbiente(): void {
    mesmoAmbiente = !mesmoAmbiente;
    if (mesmoAmbiente && !mutado) {
      // Liga o modo → derruba o mic deste aparelho (o áudio do ambiente é de
      // responsabilidade de UM aparelho só). O mute do som remoto é na UI.
      mutado = true;
      void room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      void sinalizacao?.atualizarPresence({ micMudo: true });
    }
    // Desligar o modo NÃO religa o mic sozinho — o usuário reativa quando quiser.
    emitirEstado();
  }

  // ─ Limpeza ─

  function destruir(): void {
    destruido = true;
    streamsCache.clear();
    meta.clear();
    void room.disconnect();
  }

  return {
    iniciarMidia,
    conectarSinalizacao,
    onPeerEntrou,
    onPeerSaiu,
    onPeersSync,
    onComando,
    alternarMicrofone,
    alternarCamera,
    alternarTela,
    alternarMao,
    alternarMesmoAmbiente,
    silenciarPeer,
    destruir,
  };
}
