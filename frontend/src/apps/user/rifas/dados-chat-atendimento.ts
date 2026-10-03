/**
 * Camada de dados — chat enxuto do Kanban de atendimento (Theus 2026-09-02).
 * NÃO reaproveita o componente `ChatAtivo.tsx` do app Conversas (ele é
 * acoplado ao modelo de dados pesado de lá — cargo, mente do agente,
 * contratos, pagamentos — que não existem no domínio de Rifas). Reaproveita
 * sim a MESMA infraestrutura de envio: tabela `mensagens` + edge
 * `enviar-mensagem` (o mesmo caminho que o painel humano do Conversas usa).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

async function sbCliente(): Promise<Bruto> {
  return (
    (window as { supabaseClient?: Bruto }).supabaseClient ||
    (await import("@/integrations/supabase/client")).supabase
  );
}

export interface MensagemChat {
  id: string;
  role: "user" | "human" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export async function listarMensagens(conversaId: string): Promise<MensagemChat[]> {
  const sb = await sbCliente();
  const { data, error } = await sb
    .from("mensagens")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((m: any) => ({ id: m.id, role: m.role, content: m.content ?? "", createdAt: m.created_at }));
}

export function assinarMensagensNovas(conversaId: string, aoChegar: (m: MensagemChat) => void): () => void {
  let canal: Bruto = null;
  let cancelado = false;
  sbCliente().then((sb) => {
    if (cancelado) return;
    canal = sb
      .channel(`rifas-chat-${conversaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `conversation_id=eq.${conversaId}` },
        (payload: { new: Bruto }) => {
          const m = payload.new;
          aoChegar({ id: m.id, role: m.role, content: m.content ?? "", createdAt: m.created_at });
        },
      )
      .subscribe();
  });
  return () => {
    cancelado = true;
    if (canal) sbCliente().then((sb) => sb.removeChannel(canal));
  };
}

/** Envia texto como o dono/atendente (role=human) — insere + dispara pela edge enviar-mensagem. */
export async function enviarMensagemHumano(conversaId: string, leadId: string, texto: string): Promise<void> {
  const sb = await sbCliente();
  const { data: msgReal, error: erroIns } = await sb
    .from("mensagens")
    .insert({ conversation_id: conversaId, role: "human", content: texto })
    .select("id")
    .single();
  if (erroIns) throw erroIns;

  const { data: respEnv, error: erroEnv } = await sb.functions.invoke("enviar-mensagem", {
    body: { lead_id: leadId, message: texto, message_id: msgReal.id },
  });
  if (erroEnv) throw erroEnv;
  const corpo = respEnv as { ok?: boolean; reason?: string } | null;
  if (corpo && corpo.ok === false) throw new Error(corpo.reason ?? "falha ao enviar");
}

export async function alternarAgenteConversa(conversaId: string, ligado: boolean): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb.from("conversas").update({ agent_enabled: ligado }).eq("id", conversaId);
  if (error) throw error;
}

export async function buscarConversaResumo(conversaId: string): Promise<{ agentEnabled: boolean; leadId: string | null; phone: string | null } | null> {
  const sb = await sbCliente();
  const { data, error } = await sb
    .from("conversas")
    .select("agent_enabled, lead_id, phone")
    .eq("id", conversaId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { agentEnabled: data.agent_enabled !== false, leadId: data.lead_id, phone: data.phone };
}
