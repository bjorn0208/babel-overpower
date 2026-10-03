/**
 * Ações de ciclo de vida do contato no app Conversas.
 *
 * Tocam o Supabase direto — RLS (`user_update_own_leads`, policies de `conversas`)
 * já garante que o tenant dono atualize só os próprios. Todos os caminhos
 * JÁ existem no banco; aqui só conectamos a UI. Zero DDL.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  escolherFluxoParaLead,
  normalizarListaFluxosPublico,
} from "@/pages/public/acompanhamento-logica";

// `responsavel_id` em conversas e algumas colunas de leads não estão no types
// gerado — mesmo padrão de cast usado em useConversasLive / use-acompanhamento.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

/**
 * Fase inicial do cliente = id do 1º estágio do fluxo configurado pro produto
 * (`agentes_usuario.product_flows`). Sem fluxo casado → null (o tenant configura
 * depois pelo botão "Configurar fluxo" da Aba Operação).
 */
export async function resolverFaseInicial(
  tenantId: string,
  produto: string | null | undefined,
): Promise<string | null> {
  try {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("agentes_usuario")
      .select("product_flows")
      .eq("user_id", tenantId)
      .maybeSingle();
    const flows = normalizarListaFluxosPublico(
      (data as { product_flows?: unknown } | null)?.product_flows,
    );
    const fluxo = escolherFluxoParaLead(flows, produto ?? null);
    return fluxo?.stages?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Lead → cliente: `location='cliente'`, `converted_at=now()`,
 * `fase_cliente` = 1º estágio do fluxo do produto (ou null se ainda sem fluxo).
 */
export async function tornarCliente(
  leadId: string,
  produto: string | null | undefined,
): Promise<{ fase_cliente: string | null }> {
  const { data: sessao } = await supabase.auth.getSession();
  const tenantId = sessao?.session?.user.id ?? null;
  const faseInicial = tenantId ? await resolverFaseInicial(tenantId, produto) : null;
  const sb = supabase as SupabaseBruto;
  const { error } = await sb
    .from("leads")
    .update({
      location: "cliente",
      converted_at: new Date().toISOString(),
      fase_cliente: faseInicial,
    })
    .eq("id", leadId);
  if (error) throw error;
  return { fase_cliente: faseInicial };
}

/**
 * Cliente → lead: desfaz a conversão explícita (pacote Marcos 2026-07-22).
 * Limpa os 3 sinais que `tornarCliente` grava — sem isso a UI re-derivava
 * "cliente" no reload. Contratos/pagamentos do histórico ficam intactos.
 */
export async function voltarParaLead(leadId: string): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb
    .from("leads")
    .update({
      location: "atendimento",
      converted_at: null,
      fase_cliente: null,
    })
    .eq("id", leadId);
  if (error) throw error;
}

/** Tira da fila de atendimento e manda pro CRM Base: `location='base'`. */
export async function enviarParaBase(leadId: string): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb
    .from("leads")
    .update({ location: "base" })
    .eq("id", leadId);
  if (error) throw error;
  // Conversa aberta à mão fica visível mesmo na Base; mandar pra Base tira a marca.
  const { error: errMarca } = await sb
    .from("conversas")
    .update({ aberta_manual_em: null })
    .eq("lead_id", leadId)
    .not("aberta_manual_em", "is", null);
  if (errMarca) throw errMarca;
}

/** Persiste o responsável (membro da equipe) da conversa. null = sem responsável. */
export async function persistirResponsavel(
  conversaId: string,
  membroId: string | null,
): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb
    .from("conversas")
    .update({ responsavel_id: membroId })
    .eq("id", conversaId);
  if (error) throw error;
}

/** Persiste o liga/pausa da IA da conversa (`conversas.agent_enabled`). */
export async function persistirAgenteLigado(
  conversaId: string,
  ligado: boolean,
): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb
    .from("conversas")
    .update({ agent_enabled: ligado })
    .eq("id", conversaId);
  if (error) throw error;
}


/**
 * Retomada manual do agente — dono do tenant clicou no botão "Retomar" do header.
 *
 * Conecta na NOVA estrutura (RAG-FIRST):
 *  - Religa a conversa (`status='ativa'`, `agent_enabled=true`) — sem isso o
 *    motor short-circuita devolvendo vazio.
 *  - Dispara `ragentic-processar-inline` com `message: '[RETOMADA_MANUAL]'`.
 *    O motor detecta token proativo (`MAPA_TOKENS["RETOMADA_MANUAL"]`),
 *    carrega contexto sozinho (últimos 20 turnos + ficha + memória + blocos
 *    do tenant via RAG-FIRST), pula o Porteiro, libera comercial, monta
 *    system prompt em MODO PROATIVO e gera bolha contextualizada na caixa
 *    de saída (process-followups manda pelo Z-API depois).
 *
 * Não inventa lógica de inferência — quem infere contexto é o próprio motor.
 */
export async function retomarConversa(
  conversaId: string,
  phone: string,
): Promise<void> {
  const sb = supabase as SupabaseBruto;

  // 1) Religar conversa — guard do motor (`runOperacionalEarly`) cancela
  //    resposta quando `agent_enabled=false`. Mesmo comportamento do botão
  //    Retomar antigo (`arquivo/frontend antigo/.../use-chat-actions.ts:118`).
  const { error: errReligar } = await sb
    .from("conversas")
    .update({ status: "ativa", agent_enabled: true })
    .eq("id", conversaId);
  if (errReligar) throw errReligar;

  // 2) Resolver `agente_id` (PK em agentes_usuario) do tenant logado.
  const { data: sessao } = await supabase.auth.getSession();
  const tenantId = sessao?.session?.user.id;
  if (!tenantId) throw new Error("sem sessão ativa");
  const { data: agente } = await sb
    .from("agentes_usuario")
    .select("id")
    .eq("user_id", tenantId)
    .maybeSingle();
  const agenteId = (agente as { id?: string } | null)?.id;
  if (!agenteId) throw new Error("agente do tenant não encontrado");

  // 3) Disparar o motor com marker RETOMADA_MANUAL.
  const { data: resp, error: errEdge } = await supabase.functions.invoke(
    "ragentic-processar-inline",
    {
      body: {
        message: "[RETOMADA_MANUAL]",
        agente_id: agenteId,
        phone,
        conversation_id: conversaId,
      },
    },
  );
  if (errEdge) throw errEdge;
  const corpo = resp as { error?: string } | null;
  if (corpo?.error) throw new Error(corpo.error);
}

/**
 * Inicia (ou reaproveita) uma conversa a partir de um número digitado — igual
 * "nova conversa" do WhatsApp. Usa a RPC `buscar_ou_criar_conversa` (a mesma
 * do webhook): idempotente, cria lead + conversa + ficha e reativa conversa
 * encerrada há menos de 30 dias. Retorna o id da conversa.
 */
/**
 * Completa o 9º dígito do celular quando falta (DDD + 8 dígitos locais
 * começando 6-9 = padrão antigo de celular sem o 9). Fixado 2026-08-27:
 * número digitado sem o 9 chegava intacto no Z-API e o WhatsApp não
 * reconhecia o contato (print do Fabricio: "+55 19 6170-9847 não está
 * no WhatsApp" — 10 dígitos locais em vez de 11).
 */
function completarNonoDigito(ddd: string, local: string): string {
  return local.length === 8 && /^[6-9]/.test(local) ? `9${local}` : local;
}

export async function iniciarConversaPorNumero(telefone: string): Promise<string> {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) throw new Error("Número incompleto — use DDD + número");

  let phone: string;
  if (digitos.length <= 11) {
    // Sem DDI (10-11 dígitos) = Brasil: separa DDD + local, completa o 9º e prefixa 55.
    const ddd = digitos.slice(0, 2);
    const local = digitos.slice(2);
    phone = `55${ddd}${completarNonoDigito(ddd, local)}`;
  } else if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    // Com DDI 55 já digitado: mesma checagem do 9º dígito.
    const ddd = digitos.slice(2, 4);
    const local = digitos.slice(4);
    phone = `55${ddd}${completarNonoDigito(ddd, local)}`;
  } else {
    phone = digitos;
  }

  const sb = supabase as SupabaseBruto;
  const { data: ses } = await supabase.auth.getSession();
  const uid = ses?.session?.user?.id;
  if (!uid) throw new Error("sem sessão ativa");
  const { data: perfil } = await sb
    .from("profiles")
    .select("parent_user_id")
    .eq("id", uid)
    .maybeSingle();
  const tenantId = (perfil?.parent_user_id as string | null) ?? uid;
  const { data: agente } = await sb
    .from("agentes_usuario")
    .select("id")
    .eq("user_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (!agente?.id) throw new Error("nenhum agente configurado nesta conta");

  // Otmar 2026-09-17: o Z-API "aceita" envio pra número sem WhatsApp e nada sai.
  // Pergunta antes de criar lead/conversa; se a consulta falhar, segue (não bloqueia).
  const { data: verif } = await supabase.functions.invoke("enviar-mensagem", {
    body: { verificar_telefone: phone, tenant_id: tenantId },
  });
  if ((verif as { existe?: boolean | null } | null)?.existe === false) {
    throw new Error(`o número ${phone} não tem WhatsApp — confira com o cliente`);
  }

  const { data, error } = await sb.rpc("buscar_ou_criar_conversa", {
    p_phone: phone,
    p_tenant_id: tenantId,
    p_agent_id: agente.id,
    p_channel: "whatsapp",
  });
  if (error) throw error;
  const convId = data?.conversation?.id as string | undefined;
  if (!convId) throw new Error("a conversa não voltou da RPC");
  // Verifik 2026-09-15: número de planilha importada já existe como lead com
  // location='base', e a lista do Conversas esconde a Base — a conversa era
  // criada mas não aparecia, e a auto-seleção abria a 1ª da lista (um número
  // qualquer). O lead FICA na Base; a marca abaixo é a exceção que mostra a
  // conversa na lista (ver `montarConversas`).
  const { error: errMarca } = await sb
    .from("conversas")
    .update({ aberta_manual_em: new Date().toISOString() })
    .eq("id", convId);
  if (errMarca) throw errMarca;
  return convId;
}

/**
 * Abordagem pela agente a partir de um número digitado (pedido do Otmar,
 * 12/09/2026): cria/reaproveita a conversa como `iniciarConversaPorNumero` e
 * dispara o motor com o token `[ABORDAGEM_FRIA]` — primeiro contato ativo,
 * sem histórico (apresentação + produto), diferente do `[RETOMADA_MANUAL]`
 * do botão Retomar, que assume conversa anterior ("como não tivemos retorno…").
 * As bolhas saem pela caixa de saída no ritmo normal. Retorna o id da conversa.
 */
export async function abordarPorNumero(telefone: string): Promise<string> {
  const convId = await iniciarConversaPorNumero(telefone);
  const sb = supabase as SupabaseBruto;

  const { data: conv } = await sb
    .from("conversas")
    .select("phone, tenant_id")
    .eq("id", convId)
    .maybeSingle();
  const phone = (conv?.phone as string | undefined) ?? "";
  const tenantId = (conv?.tenant_id as string | undefined) ?? "";
  if (!phone || !tenantId) throw new Error("conversa sem telefone ou tenant");

  const { data: agente } = await sb
    .from("agentes_usuario")
    .select("id")
    .eq("user_id", tenantId)
    .limit(1)
    .maybeSingle();
  const agenteId = (agente as { id?: string } | null)?.id;
  if (!agenteId) throw new Error("agente do tenant não encontrado");

  // Garante a conversa ligada — o motor devolve vazio se `agent_enabled=false`.
  await sb.from("conversas").update({ status: "ativa", agent_enabled: true }).eq("id", convId);

  const { data: resp, error: errEdge } = await supabase.functions.invoke(
    "ragentic-processar-inline",
    {
      body: {
        message: "[ABORDAGEM_FRIA]",
        agente_id: agenteId,
        phone,
        conversation_id: convId,
      },
    },
  );
  if (errEdge) throw errEdge;
  const corpo = resp as { error?: string } | null;
  if (corpo?.error) throw new Error(corpo.error);
  return convId;
}
