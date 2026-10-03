/**
 * sessao-viva — a chamada mora AQUI, fora da árvore React.
 *
 * Antes o motor LiveKit + a sinalização eram criados dentro de um `useEffect`
 * do `Reuniao.tsx`. Como o OS desmonta a janela ao minimizar, ao trocar de
 * área de trabalho e ao fechar, o cleanup do effect derrubava a chamada —
 * bastava abrir outro app pra call cair sozinha.
 *
 * Agora a sessão é um singleton de módulo: vive enquanto a ABA viver. A
 * janela do app só assina o estado e manda comandos. Sair da reunião passou a
 * ser uma ação explícita (botão Sair / Encerrar) — nunca um efeito colateral
 * de navegar pelo sistema.
 */

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { criarSinalizacao } from "./use-sinalizacao";
import { criarWebRTC } from "./use-livekit";
import type { HandleSinalizacao } from "./use-sinalizacao";
import type { EstadoWebRTC, HandleWebRTC } from "./use-livekit";
import type { SessaoChamada } from "./reuniao-tipos";

export const ESTADO_RTC_VAZIO: EstadoWebRTC = {
  streamLocal: null,
  streamTelaLocal: null,
  streamRemotos: [],
  compartilhandoTela: false,
  mutado: false,
  semVideo: false,
  minhaMaoLevantada: false,
  mesmoAmbiente: false,
};

/** peerId único por aba — vive enquanto a aba viver, não enquanto a janela viver. */
export const peerId = crypto.randomUUID();

export type RecursoAberto = { url: string; titulo: string };

export type EstadoSessaoViva = {
  sessao: SessaoChamada | null;
  estadoRTC: EstadoWebRTC;
  aprovacaoAtiva: boolean;
  mostrarLinkPronto: boolean;
  recursoAberto: RecursoAberto | null;
};

const VAZIO: EstadoSessaoViva = {
  sessao: null,
  estadoRTC: ESTADO_RTC_VAZIO,
  aprovacaoAtiva: false,
  mostrarLinkPronto: false,
  recursoAberto: null,
};

let estado: EstadoSessaoViva = VAZIO;
let rtc: HandleWebRTC | null = null;
let sig: HandleSinalizacao | null = null;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function publicar(patch: Partial<EstadoSessaoViva>): void {
  estado = { ...estado, ...patch };
  avisar();
}

/** Assina mudanças. Devolve a função de desassinar (contrato do useSyncExternalStore). */
export function assinarSessaoViva(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
  };
}

/** Snapshot estável: só troca de referência quando algo muda de verdade. */
export function lerSessaoViva(): EstadoSessaoViva {
  return estado;
}

export function rtcVivo(): HandleWebRTC | null {
  return rtc;
}

export function sinalizacaoViva(): HandleSinalizacao | null {
  return sig;
}

/**
 * Encerra a sala direto pelo id (status + encerrada_em). Usada pelo botão
 * "Encerrar para todos" e pelo fecho automático de aba fechada.
 */
export async function encerrarSalaPorId(salaId: string): Promise<void> {
  await supabase
    .from("salas_reuniao")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("id", salaId);
}

// ─── Fecho anti-sala-zumbi ───────────────────────────────────────────────────
// O gatilho mudou de "desmontou a janela" para "fechou a aba": minimizar o app
// agora mantém a chamada viva, então só o abandono real encerra a sala.

let escutandoFechoDeAba = false;

function aoFecharAba(): void {
  const { sessao, estadoRTC } = estado;
  if (sessao?.ehAnfitriao && estadoRTC.streamRemotos.length === 0) {
    void encerrarSalaPorId(sessao.salaId);
  }
}

function fecharCanos(): void {
  rtc?.destruir();
  void sig?.destruir();
  rtc = null;
  sig = null;
}

type ParamsAbrir = {
  sessao: SessaoChamada;
  meuNome: string;
  aprovacaoAtiva?: boolean;
  mostrarLinkPronto?: boolean;
};

/** Entra na sala e liga os canos de mídia + presença. Idempotente por sala. */
export function abrirSessaoViva({
  sessao,
  meuNome,
  aprovacaoAtiva = false,
  mostrarLinkPronto = false,
}: ParamsAbrir): void {
  // Já estou nesta sala com os canos de pé: reentrar derrubaria a chamada.
  if (estado.sessao?.salaId === sessao.salaId && rtc) return;

  fecharCanos();

  const motor = criarWebRTC({
    meuPeerId: peerId,
    chavePublica: sessao.chavePublica,
    nome: meuNome,
    onEstadoMudou: (estadoRTC) => publicar({ estadoRTC }),
    onSilenciadoPeloAnfitriao: () => toast.info("O anfitrião silenciou seu microfone."),
    onEncerradaPeloAnfitriao: () => {
      toast.info("O anfitrião encerrou a reunião.");
      encerrarSessaoViva();
    },
    onAbrirRecurso: (url, titulo) => publicar({ recursoAberto: { url, titulo } }),
  });

  const sinal = criarSinalizacao({
    salaId: sessao.salaId,
    peerId,
    nome: meuNome,
    papel: sessao.ehAnfitriao ? "anfitriao" : "participante",
    doTime: true,
    onPeerEntrou: motor.onPeerEntrou,
    onPeerSaiu: motor.onPeerSaiu,
    onPeersSync: motor.onPeersSync,
    onComando: motor.onComando,
  });

  rtc = motor;
  sig = sinal;
  motor.conectarSinalizacao(sinal);
  void motor.iniciarMidia().then(() => sinal.iniciar());

  if (!escutandoFechoDeAba) {
    window.addEventListener("beforeunload", aoFecharAba);
    escutandoFechoDeAba = true;
  }

  publicar({
    sessao,
    aprovacaoAtiva,
    mostrarLinkPronto,
    estadoRTC: ESTADO_RTC_VAZIO,
    recursoAberto: null,
  });
}

/** Sai da chamada de verdade — só o usuário pede isso (Sair / Encerrar). */
export function encerrarSessaoViva(): void {
  fecharCanos();
  estado = VAZIO;
  avisar();
}

export function definirAprovacaoAtiva(ativa: boolean): void {
  publicar({ aprovacaoAtiva: ativa });
}

export function definirMostrarLinkPronto(mostrar: boolean): void {
  publicar({ mostrarLinkPronto: mostrar });
}

export function definirRecursoAberto(recurso: RecursoAberto | null): void {
  publicar({ recursoAberto: recurso });
}
