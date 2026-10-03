/**
 * Hooks de mídia do chat lateral Curadoria.
 *
 * - useUploadAnexo: faz UPLOAD pro bucket privado `curadoria-arquivos` (Onda 1).
 *   Path: {auth.uid()}/{yyyy_mm}/{uuid}-{nome}. Retorna URL assinada de 24h.
 *
 * - useGravarAudio: wrapper MediaRecorder (mesmo padrão do ChatAtivo.tsx do
 *   app `conversas`). Grava em audio/webm — formato compatível com Gemini STT.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MidiaPendenteCuradoria, TipoMidiaCuradoria } from "../../dados/tipos";

// ============================================================
// useUploadAnexo
// ============================================================

const BUCKET = "curadoria-arquivos";

interface ResultadoUpload {
  url_publica: string;
  caminho: string;
  tipo: TipoMidiaCuradoria;
}

export function useUploadAnexo() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = useCallback(
    async (arquivo: File): Promise<ResultadoUpload | null> => {
      setEnviando(true);
      setErro(null);
      try {
        const sb = supabase as unknown as {
          auth: { getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }> };
          storage: {
            from: (bucket: string) => {
              upload: (
                path: string,
                file: File,
                opts: { contentType: string; upsert: boolean },
              ) => Promise<{ data: { path: string } | null; error: unknown }>;
              createSignedUrl: (
                path: string,
                expiresIn: number,
              ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
            };
          };
        };
        const userRes = await sb.auth.getSession();
        const userId = userRes.data.session?.user?.id;
        if (!userId) throw new Error("não logado");

        const hoje = new Date();
        const yyyyMm = `${hoje.getFullYear()}_${String(hoje.getMonth() + 1).padStart(2, "0")}`;
        const uuid = crypto.randomUUID();
        const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const caminho = `${userId}/${yyyyMm}/${uuid}-${nomeSeguro}`;

        const up = await sb.storage.from(BUCKET).upload(caminho, arquivo, {
          contentType: arquivo.type || "application/octet-stream",
          upsert: false,
        });
        if (up.error) throw up.error;

        const sig = await sb.storage.from(BUCKET).createSignedUrl(caminho, 86400);
        if (sig.error || !sig.data) throw sig.error ?? new Error("signed url falhou");

        const tipo = detectarTipo(arquivo.type);
        return { url_publica: sig.data.signedUrl, caminho, tipo };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErro(msg);
        return null;
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviar, enviando, erro };
}

function detectarTipo(mime: string): TipoMidiaCuradoria {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

// ============================================================
// useGravarAudio (MediaRecorder)
// ============================================================

export function useGravarAudio() {
  const [gravando, setGravando] = useState(false);
  const [duracaoSegundos, setDuracaoSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inicioRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);

  const iniciar = useCallback(async (): Promise<boolean> => {
    try {
      setErro(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start(250);
      recorderRef.current = rec;
      inicioRef.current = Date.now();
      setGravando(true);
      setDuracaoSegundos(0);
      intervalRef.current = window.setInterval(() => {
        setDuracaoSegundos(Math.floor((Date.now() - inicioRef.current) / 1000));
      }, 250);
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  const parar = useCallback(async (): Promise<MidiaPendenteCuradoria | null> => {
    const rec = recorderRef.current;
    if (!rec) return null;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        const dur = Math.floor((Date.now() - inicioRef.current) / 1000);
        rec.stream.getTracks().forEach((t) => t.stop());
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        recorderRef.current = null;
        chunksRef.current = [];
        setGravando(false);
        setDuracaoSegundos(0);
        const arquivo = new File([blob], `audio-${Date.now()}.webm`, {
          type: rec.mimeType,
        });
        resolve({
          arquivo,
          blob,
          tipo: "audio",
          nome: arquivo.name,
          duracao_segundos: dur,
          mime: rec.mimeType,
        });
      };
      rec.stop();
    });
  }, []);

  // Se o componente desmontar no meio da gravação (sem parar/cancelar), o
  // MediaRecorder e o stream do microfone ficam abertos — a luz do mic continua
  // acesa e o áudio segue capturando. Para tracks + timer no unmount.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          /* recorder já parado */
        }
        rec.stream.getTracks().forEach((t) => t.stop());
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      recorderRef.current = null;
    };
  }, []);

  const cancelar = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      rec.onstop = null;
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setGravando(false);
    setDuracaoSegundos(0);
  }, []);

  return { gravando, duracaoSegundos, erro, iniciar, parar, cancelar };
}
