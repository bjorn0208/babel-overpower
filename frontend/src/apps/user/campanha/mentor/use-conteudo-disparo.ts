/**
 * Estado + upload de mídia compartilhados pelos composers de disparo fixo
 * (por lista salva e por números manuais) — mesmos campos, mesma esteira
 * de envio (`disparos_lead` + `processar-disparos-lead`), só muda como o
 * alvo é resolvido.
 */

import { useCallback, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { ToastApi } from "../re-exports";
import type { TipoConteudoDisparo } from "./tipos";

const BUCKET = "disparo-lead-midias";

export function useConteudoDisparo(ownerId: string, t: ToastApi) {
  const [tipoConteudo, setTipoConteudo] = useState<TipoConteudoDisparo>("texto");
  const [mensagem, setMensagem] = useState("");
  const [midiaUrl, setMidiaUrl] = useState<string | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [modoAgendamento, setModoAgendamento] = useState<"agora" | "recorrente">("agora");
  const [horario, setHorario] = useState("09:00");
  const [tempoDescanso, setTempoDescanso] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  const aoEscolherArquivo = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (e.target) e.target.value = "";
      if (!file) return;
      setEnviandoMidia(true);
      try {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${ownerId}/${Date.now()}.${ext}`;
        const { error: errUp } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false });
        if (errUp) throw errUp;
        const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        setMidiaUrl(url);
        t.success("Mídia enviada.");
      } catch (e2) {
        t.error(e2 instanceof Error ? e2.message : "Erro ao subir mídia");
      } finally {
        setEnviandoMidia(false);
      }
    },
    [ownerId, t],
  );

  const precisaMidia = tipoConteudo !== "texto";

  return {
    tipoConteudo,
    setTipoConteudo,
    mensagem,
    setMensagem,
    midiaUrl,
    enviandoMidia,
    aoEscolherArquivo,
    inputRef,
    modoAgendamento,
    setModoAgendamento,
    horario,
    setHorario,
    tempoDescanso,
    setTempoDescanso,
    precisaMidia,
  };
}

export type ConteudoDisparo = ReturnType<typeof useConteudoDisparo>;
