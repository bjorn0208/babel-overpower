import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MensagemSimulacao {
  de: "lead" | "agente";
  texto: string;
  t: string;
  telemetria?: {
    modelo?: string;
    latencia_total_ms?: number;
    custo_estimado_usd?: number;
    cargo?: string;
  };
}

export interface UseSimuladorResultado {
  mensagens: MensagemSimulacao[];
  enviando: boolean;
  erro: string | null;
  enviar: (texto: string) => Promise<void>;
  resetar: () => void;
}

/**
 * Garante a row em `mentor_conversas` (canal='curadoria') antes do 1º envio.
 * O motor (processarCanalInterno) faz lookup por id+owner e devolve 404 sem
 * ela — era o bug "[erro: Edge Function returned a non-2xx status code]"
 * do simulador (2026-07-10). Idempotente: 23505 = sessão retomada.
 */
async function garantirConversaSimulador(conversaIdLocal: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: sess } = await sb.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (!userId) return null;

    const { data, error } = await sb
      .from("mentor_conversas")
      .insert({
        id: conversaIdLocal,
        owner_id: userId,
        titulo: "Simulador — teste de conversa",
        canal: "curadoria",
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") return conversaIdLocal;
      return null;
    }
    return data?.id ?? conversaIdLocal;
  } catch {
    return null;
  }
}

/**
 * Hook do AbaSimulador: invoca ragentic-processar-inline com modo_teste=true
 * + canal=curadoria. Não persiste em buffer_mensagens, não dispara Z-API.
 */
export function useSimulador(tenantId: string | null, cargo: string): UseSimuladorResultado {
  const [mensagens, setMensagens] = useState<MensagemSimulacao[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const conversaIdRef = useRef<string>(crypto.randomUUID());
  const sessaoCriadaRef = useRef<boolean>(false);

  const enviar = useCallback(
    async (texto: string) => {
      if (!texto.trim()) return;
      setErro(null);

      const agora = new Date();
      const horaStr = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;

      setMensagens((m) => [...m, { de: "lead", texto, t: horaStr }]);
      setEnviando(true);

      const t0 = performance.now();
      try {
        // Sessão no banco antes do 1º envio — sem ela o motor devolve 404.
        if (!sessaoCriadaRef.current) {
          const id = await garantirConversaSimulador(conversaIdRef.current);
          if (!id) throw new Error("não foi possível abrir a sessão do simulador");
          sessaoCriadaRef.current = true;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data, error } = await sb.functions.invoke("ragentic-processar-inline", {
          body: {
            conversa_id: conversaIdRef.current,
            mensagem: texto,
            canal: "curadoria",
            modo_teste: true,
            contexto_curadoria: {
              aba_ativa: "simulador",
              tenant_id: tenantId,
              cargo_alvo: cargo,
            },
          },
        });

        if (error) throw error;
        const resp = data as { ok?: boolean; mensagem?: string; error?: string; modelo?: string };
        if (resp?.ok === false || resp?.error) throw new Error(resp.error ?? "erro no motor");

        const latencia = Math.round(performance.now() - t0);
        const horaResp = (() => {
          const d = new Date();
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        })();

        setMensagens((m) => [
          ...m,
          {
            de: "agente",
            texto: resp.mensagem ?? "(sem resposta)",
            t: horaResp,
            telemetria: {
              modelo: resp.modelo,
              latencia_total_ms: latencia,
              cargo,
            },
          },
        ]);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        setErro(msg);
        setMensagens((m) => [
          ...m,
          { de: "agente", texto: `[erro: ${msg}]`, t: horaStr },
        ]);
      } finally {
        setEnviando(false);
      }
    },
    [tenantId, cargo],
  );

  const resetar = useCallback(() => {
    setMensagens([]);
    conversaIdRef.current = crypto.randomUUID();
    sessaoCriadaRef.current = false; // próxima sessão cria row nova em mentor_conversas
    setErro(null);
  }, []);

  return { mensagens, enviando, erro, enviar, resetar };
}
