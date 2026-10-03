/**
 * canal-sala — assinante ÚNICO do topic `sala:<id>` (broadcasts da VPS).
 *
 * Vários painéis do lado logado precisam do MESMO topic porque o transcritor da
 * VPS publica `turno` (PainelTranscricao) e `dossie` (PainelDossie) nele. Se cada
 * painel abrir seu próprio `supabase.channel("sala:<id>")`, o socket estoura o
 * limite de 1 join por topic — só o primeiro recebe, e desmontar um painel derruba
 * o canal que o outro ainda usa.
 *
 * Aqui há UM canal por sala, contado por referência: os painéis registram um
 * callback por evento; o canal só sobe uma vez e só cai quando o último ouvinte
 * sai. Um único `.on()` por evento faz fan-out pro conjunto de callbacks, então
 * remontar um painel não duplica evento.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Ouvinte = (payload: unknown) => void;

type Entrada = {
  canal: RealtimeChannel;
  /** evento → callbacks registrados. */
  ouvintes: Map<string, Set<Ouvinte>>;
};

const canais = new Map<string, Entrada>();

/**
 * Assina um evento de broadcast do topic `sala:<id>`. Devolve a função de
 * desassinar — chame no cleanup do effect.
 */
export function assinarBroadcastSala(
  salaId: string,
  evento: string,
  aoReceber: Ouvinte,
): () => void {
  const topic = `sala:${salaId}`;
  let entrada = canais.get(topic);
  if (!entrada) {
    const canal = supabase.channel(topic);
    entrada = { canal, ouvintes: new Map() };
    canais.set(topic, entrada);
    canal.subscribe();
  }
  const atual = entrada;

  let set = atual.ouvintes.get(evento);
  if (!set) {
    set = new Set();
    atual.ouvintes.set(evento, set);
    // Broadcast permite registrar binding depois do subscribe (matching é
    // client-side); um único dispatcher por evento evita handlers duplicados.
    atual.canal.on("broadcast", { event: evento }, (envelope: unknown) => {
      const payload = (envelope as { payload: unknown }).payload;
      for (const cb of atual.ouvintes.get(evento) ?? []) cb(payload);
    });
  }
  set.add(aoReceber);

  return () => {
    set!.delete(aoReceber);
    const semOuvintes = [...atual.ouvintes.values()].every((s) => s.size === 0);
    if (semOuvintes) {
      void supabase.removeChannel(atual.canal);
      canais.delete(topic);
    }
  };
}
