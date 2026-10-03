/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type ConversaAmostra = {
  conversation_id: string;
  tenant_id: string;
  lead_id: string | null;
  num_messages: number;
  ultima_mensagem_em: string;
};

// Seleciona N conversas elegíveis pra consolidação (terminadas + sem memoria_episodica ainda)
export async function selecionarConversasParaConsolidar(
  supabase: SupabaseClient,
  limite: number = 50,
): Promise<ConversaAmostra[]> {
  const { data, error } = await supabase.rpc("selecionar_conversas_amostra", { p_limite: limite });
  if (error) {
    console.warn(`[amostra] selecionar_conversas_amostra erro: ${error.message}`);
    return [];
  }
  return (data ?? []) as ConversaAmostra[];
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
