/**
 * use-sinalizacao — canal Realtime de presença + comandos da reunião.
 *
 * Presence com metadados vivos (nome, mão levantada, mic mudo, papel) e
 * comandos do anfitrião (ex.: silenciar participante) via Supabase Realtime.
 * SDP/ICE saíram daqui em 2026-08-01: a mídia agora é LiveKit (use-livekit),
 * que negocia direto com o servidor — sobrou só o social da sala.
 *
 * O chamador deve chamar `iniciar()` após montar e `destruir()` no unmount.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type InfoPresence = {
  peerId: string;
  nome: string;
  /** Mão levantada (pedir a palavra). */
  maoLevantada?: boolean;
  /** Microfone mudo (espelho pro badge dos outros). */
  micMudo?: boolean;
  /** id do MediaStream da tela compartilhada por este peer (null = sem tela). */
  telaStreamId?: string | null;
  /** Papel na sala — 'anfitriao' habilita controles remotos. */
  papel?: "anfitriao" | "participante";
  /** Participante do time do tenant (logado) — tile ganha borda da marca. */
  doTime?: boolean;
};

export type MsgComando = {
  de: string;
  /** peerId de destino ou `"*"` (todos na sala). */
  para: string;
  acao: "silenciar_mic" | "encerrar" | "abrir_recurso";
  /** abrir_recurso: link a abrir na tela dos participantes (ex.: contrato). */
  url?: string;
  titulo?: string;
};

export type ConfigSinalizacao = {
  salaId: string;
  peerId: string;
  nome: string;
  papel?: "anfitriao" | "participante";
  doTime?: boolean;
  onPeerEntrou: (peer: InfoPresence) => void;
  onPeerSaiu: (peerId: string) => void;
  onPeersSync: (peers: InfoPresence[]) => void;
  onComando?: (msg: MsgComando) => void;
};

export type HandleSinalizacao = {
  iniciar: () => Promise<void>;
  destruir: () => Promise<void>;
  enviarComando: (para: string, acao: MsgComando["acao"]) => Promise<void>;
  /** Atualiza os metadados do meu presence (re-track parcial). */
  atualizarPresence: (parcial: Partial<InfoPresence>) => Promise<void>;
};

// ─── Fábrica ─────────────────────────────────────────────────────────────────

/**
 * Cria o handle de sinalização (não é hook React — chamado dentro de useEffect).
 * Assim evitamos dependências reativas complexas; o ciclo de vida é controlado
 * manualmente pelo chamador.
 */
export function criarSinalizacao(cfg: ConfigSinalizacao): HandleSinalizacao {
  let canal: RealtimeChannel | null = null;
  let meuPresence: InfoPresence = {
    peerId: cfg.peerId,
    nome: cfg.nome,
    maoLevantada: false,
    micMudo: false,
    telaStreamId: null,
    papel: cfg.papel ?? "participante",
    doTime: cfg.doTime ?? false,
  };

  function lerPresence(p: unknown): InfoPresence {
    const info = p as InfoPresence & { presence_ref: string };
    return {
      peerId: info.peerId,
      nome: info.nome ?? "Anônimo",
      maoLevantada: info.maoLevantada ?? false,
      micMudo: info.micMudo ?? false,
      telaStreamId: info.telaStreamId ?? null,
      papel: info.papel ?? "participante",
      doTime: info.doTime ?? false,
    };
  }

  async function iniciar(): Promise<void> {
    // Topic PRÓPRIO da sinalização (presence + comando), separado do topic
    // `sala:<id>` que a VPS usa pra transcrição/dossiê. Antes os três consumidores
    // (sinalização + PainelTranscricao + PainelDossie) abriam channel no MESMO topic
    // `sala:<id>` — o socket só aceita 1 join por topic, então o `subscribe()` da
    // sinalização não resolvia (presence nunca publicava) e desmontar um painel ao
    // minimizar a janela derrubava o topic inteiro, matando a sinalização junto.
    // Presence e comando são client↔client (todo cliente roda o mesmo código), então
    // o rename é seguro — a VPS não lê presence nem comando.
    canal = supabase.channel(`sala-sinal:${cfg.salaId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: cfg.peerId },
      },
    });

    // ─ Presence ─
    canal
      .on("presence", { event: "sync" }, () => {
        if (!canal) return;
        const estado = canal.presenceState<InfoPresence>();
        const peers: InfoPresence[] = Object.values(estado)
          .flatMap((arr) => arr)
          .map(lerPresence)
          .filter((p) => p.peerId && p.peerId !== cfg.peerId);
        cfg.onPeersSync(peers);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        for (const p of newPresences) {
          const info = lerPresence(p);
          if (info.peerId && info.peerId !== cfg.peerId) {
            cfg.onPeerEntrou(info);
          }
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        for (const p of leftPresences) {
          const info = p as unknown as InfoPresence & { presence_ref: string };
          if (info.peerId) cfg.onPeerSaiu(info.peerId);
        }
      });

    // ─ Broadcast comandos do anfitrião (destino direto ou "*" = todos) ─
    canal.on("broadcast", { event: "comando" }, (envelope) => {
      const msg = (envelope as unknown as { payload: MsgComando }).payload;
      if (!msg || (msg.para !== cfg.peerId && msg.para !== "*")) return;
      cfg.onComando?.(msg);
    });

    await new Promise<void>((resolve) => {
      canal!.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          canal!.track(meuPresence);
          resolve();
        }
      });
    });
  }

  async function destruir(): Promise<void> {
    if (canal) {
      await canal.untrack();
      await supabase.removeChannel(canal);
      canal = null;
    }
  }

  async function enviarComando(
    para: string,
    acao: MsgComando["acao"],
    extras?: Pick<MsgComando, "url" | "titulo">,
  ): Promise<void> {
    if (!canal) return;
    await canal.send({
      type: "broadcast",
      event: "comando",
      payload: { de: cfg.peerId, para, acao, ...extras } satisfies MsgComando,
    });
  }

  async function atualizarPresence(parcial: Partial<InfoPresence>): Promise<void> {
    meuPresence = { ...meuPresence, ...parcial };
    if (canal) await canal.track(meuPresence);
  }

  return { iniciar, destruir, enviarComando, atualizarPresence };
}
