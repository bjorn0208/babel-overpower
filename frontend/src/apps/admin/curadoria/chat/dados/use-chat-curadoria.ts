/**
 * Hook orquestrador do chat Curadoria.
 *
 * Cria UMA mentor_conversa por sessão (canal='curadoria') na 1ª mensagem e
 * reusa o uuid nas próximas chamadas. Envia turnos via edge
 * `ragentic-processar-inline` com:
 *
 *   conversa_id    = uuid da mentor_conversa criada
 *   mensagem       = texto do user
 *   canal          = 'curadoria'                 (Onda 2C.8 entrou)
 *   modo_teste     = true                        (não dispara Z-API)
 *   contexto_curadoria = { aba_ativa, tenant_id, tenant_nome }
 *   modelo_override = slug escolhido no SeletorLlm
 *
 * Motor detecta canal='curadoria' + ehAdmin server-side → resolve cargo
 * Curadoria global → carrega TOOLS_CURADORIA → loop LLM.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  AbaId,
  MensagemChatCuradoria,
  MidiaPendenteCuradoria,
  TenantImpersonado,
} from "../../dados/tipos";

const MODELO_PADRAO = "google/gemini-2.5-pro";
const TITULO_CONVERSA_DEFAULT = "Sessão Curadoria";

interface ContextoCuradoria {
  aba_ativa: AbaId;
  tenant: TenantImpersonado;
}

interface EstadoSessao {
  conversa_id: string | null;
  carregando: boolean;
  erro: string | null;
}

/**
 * Garante uma mentor_conversa com canal='curadoria' do usuário logado.
 * Idempotente: cria se ainda não existe (1 por sessão de UI), retorna o id.
 */
async function garantirMentorConversaCuradoria(
  conversaIdLocal: string,
): Promise<string | null> {
  try {
    const sb = supabase as unknown as {
      auth: { getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }> };
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string; ignoreDuplicates: boolean },
        ) => {
          select: (s: string) => {
            single: () => Promise<{ data: { id: string } | null; error: unknown }>;
          };
        };
        insert: (
          row: Record<string, unknown>,
        ) => {
          select: (s: string) => {
            single: () => Promise<{ data: { id: string } | null; error: unknown }>;
          };
        };
      };
    };
    const userRes = await sb.auth.getSession();
    const userId = userRes.data.session?.user?.id;
    if (!userId) return null;

    const { data, error } = await sb
      .from("mentor_conversas")
      .insert({
        id: conversaIdLocal,
        owner_id: userId,
        titulo: TITULO_CONVERSA_DEFAULT,
        canal: "curadoria",
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation (já existe — sessão retomada)
      const code = (error as { code?: string }).code;
      if (code === "23505") return conversaIdLocal;
      return null;
    }
    return data?.id ?? conversaIdLocal;
  } catch {
    return null;
  }
}

export function useChatCuradoria(contexto: ContextoCuradoria) {
  const [mensagens, setMensagens] = useState<MensagemChatCuradoria[]>([]);
  const [modelo, setModelo] = useState<string>(MODELO_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const conversaIdRef = useRef<string>(crypto.randomUUID());
  const sessaoCriadaRef = useRef<boolean>(false);
  const [sessao, setSessao] = useState<EstadoSessao>({
    conversa_id: null,
    carregando: false,
    erro: null,
  });

  // Cria mentor_conversa (canal='curadoria') uma vez por sessão de UI, lazy
  // — só na primeira mensagem (não no mount, pra não criar conversa órfã se
  // o admin abrir a Curadoria e nunca digitar).
  const garantirSessao = useCallback(async (): Promise<string | null> => {
    if (sessaoCriadaRef.current) return conversaIdRef.current;
    setSessao((s) => ({ ...s, carregando: true, erro: null }));
    const id = await garantirMentorConversaCuradoria(conversaIdRef.current);
    if (!id) {
      setSessao({ conversa_id: null, carregando: false, erro: "não foi possível criar conversa" });
      return null;
    }
    sessaoCriadaRef.current = true;
    setSessao({ conversa_id: id, carregando: false, erro: null });
    return id;
  }, []);

  const enviar = useCallback(
    async (
      texto: string,
      midia?: { url: string; tipo: MidiaPendenteCuradoria["tipo"] },
    ) => {
      if (!texto.trim() && !midia) return;
      setErro(null);

      const conversaId = await garantirSessao();
      if (!conversaId) {
        setErro(sessao.erro ?? "não foi possível abrir sessão");
        return;
      }

      // 1. push otimista da bolha do humano
      const idHumano = crypto.randomUUID();
      setMensagens((xs) => [
        ...xs,
        {
          id: idHumano,
          papel: "humano",
          conteudo: texto,
          midia_url: midia?.url ?? null,
          midia_tipo: midia?.tipo ?? null,
          criado_em: new Date().toISOString(),
        },
      ]);

      setEnviando(true);
      try {
        const sb = supabase as unknown as {
          functions: {
            invoke: (
              nome: string,
              opts: { body: Record<string, unknown> },
            ) => Promise<{ data: unknown; error: unknown }>;
          };
        };
        const { data, error } = await sb.functions.invoke("ragentic-processar-inline", {
          body: {
            conversa_id: conversaId,
            mensagem: texto,
            canal: "curadoria",
            modo_teste: true,
            modelo_override: modelo,
            contexto_curadoria: {
              aba_ativa: contexto.aba_ativa,
              tenant_id: contexto.tenant.id,
              tenant_nome: contexto.tenant.nome,
            },
            // referências de mídia anexa, se houver
            midia_url: midia?.url ?? null,
            midia_tipo: midia?.tipo ?? null,
          },
        });

        if (error) throw error;
        const resp = data as {
          ok?: boolean;
          mensagem?: string;
          error?: string;
        };
        if (resp?.ok === false || resp?.error) {
          throw new Error(resp.error ?? "erro no motor");
        }
        const conteudo = resp.mensagem ?? "(sem resposta)";

        setMensagens((xs) => [
          ...xs,
          {
            id: crypto.randomUUID(),
            papel: "agente",
            conteudo,
            modelo_usado: modelo,
            criado_em: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErro(msg);
        setMensagens((xs) => [
          ...xs,
          {
            id: crypto.randomUUID(),
            papel: "sistema",
            conteudo: `erro ao processar: ${msg}`,
            criado_em: new Date().toISOString(),
          },
        ]);
      } finally {
        setEnviando(false);
      }
    },
    [contexto, modelo, garantirSessao, sessao.erro],
  );

  const resetar = useCallback(() => {
    setMensagens([]);
    conversaIdRef.current = crypto.randomUUID();
    sessaoCriadaRef.current = false;
    setSessao({ conversa_id: null, carregando: false, erro: null });
    setErro(null);
  }, []);

  // Garante limpeza ao desmontar (atualmente só limpa erros)
  useEffect(() => {
    return () => setErro(null);
  }, []);

  return {
    mensagens,
    modelo,
    setModelo,
    enviar,
    enviando,
    erro,
    resetar,
    conversa_id: sessao.conversa_id,
    sessao_carregando: sessao.carregando,
  };
}
