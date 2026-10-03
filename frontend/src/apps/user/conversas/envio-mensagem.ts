/**
 * Envio de mensagem pro lead — caminho único do painel.
 *
 * Grava em `mensagens` e chama a edge `enviar-mensagem` (que fala com a Z-API
 * / Instagram). Criado em 2026-08-09: a janela de conversa isolada só pintava
 * a mensagem na tela — nada ia pro banco nem pro WhatsApp. Agora as duas telas
 * usam esta função, então não dá mais pra uma evoluir e a outra ficar pra trás.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AutorHumano } from "./tipos";

/** Traduz os reasons fixos da edge enviar-mensagem em mensagem clara pro humano. */
export function mensagemErroEnvio(reason: string): string {
  switch (reason) {
    case "janela_24h":
      return "O Instagram só permite responder até 24h depois da última mensagem do lead";
    case "token_instagram_invalido":
      return "Token do Instagram expirou — reconecte no painel de Tenants";
    case "midia_instagram_fase2":
      return "Mídia pro Instagram entra na próxima fase — por enquanto só texto";
    case "canal instagram nao configurado":
      return "Canal Instagram não configurado pra este tenant";
    case "numero_sem_whatsapp":
      return "Esse número não tem WhatsApp — a mensagem não foi enviada. Confira o número com o cliente";
    case "unauthorized":
      return "Sua sessão expirou — recarregue a página (F5) e envie de novo";
    default:
      return reason;
  }
}

/**
 * Reenvia uma mensagem que JÁ está gravada (o texto ficou no painel mas o lead
 * não recebeu). Não insere linha nova — só dispara o envio de novo.
 */
export async function reenviarMensagem(opts: {
  mensagemId: string;
  leadId: string;
  texto: string;
  perfilAutor: AutorHumano | null;
}): Promise<void> {
  const { data: respEnv, error: erroEnv } = await supabase.functions.invoke("enviar-mensagem", {
    body: {
      lead_id: opts.leadId,
      message: opts.texto,
      message_id: opts.mensagemId,
      sender_name: opts.perfilAutor?.nome,
      sender_cargo: opts.perfilAutor?.cargo ?? undefined,
    },
  });
  if (erroEnv) {
    const status = (erroEnv as { context?: { status?: number } }).context?.status;
    const bruto = (erroEnv as Error).message ?? "";
    if (status === 401 || /401|unauthorized|jwt/i.test(bruto)) {
      throw new Error(mensagemErroEnvio("unauthorized"));
    }
    throw erroEnv;
  }
  const corpo = respEnv as { ok?: boolean; reason?: string } | null;
  if (corpo && corpo.ok === false) {
    throw new Error(mensagemErroEnvio(corpo.reason ?? "edge retornou ok:false sem motivo"));
  }
}

interface EnvioTexto {
  conversaId: string;
  leadId: string;
  texto: string;
  perfilAutor: AutorHumano | null;
}

/**
 * Grava a mensagem e dispara o envio. Devolve o id real da linha criada.
 * Lança erro (com texto pronto pro toast) se o envio não sair — a linha fica
 * no banco pra não perder o que foi escrito, mas o chamador deve avisar.
 */
export async function enviarTextoParaLead({
  conversaId,
  leadId,
  texto,
  perfilAutor,
}: EnvioTexto): Promise<{ id: string }> {
  const { data: msgReal, error: erroIns } = await supabase
    .from("mensagens")
    .insert({
      conversation_id: conversaId,
      role: "human",
      content: texto,
      sender_id: perfilAutor?.id ?? null,
      // carga.sender SEM `source` → exibição classifica como humano
      // identificado (o eco vindo do celular chega com source='whatsapp_app').
      carga: perfilAutor
        ? {
            sender: {
              name: perfilAutor.nome,
              cargo: perfilAutor.cargo ?? null,
              avatar_url: perfilAutor.foto_url ?? null,
            },
          }
        : null,
    })
    .select("id")
    .single();
  if (erroIns) throw erroIns;

  const { data: respEnv, error: erroEnv } = await supabase.functions.invoke("enviar-mensagem", {
    body: {
      lead_id: leadId,
      message: texto,
      message_id: msgReal.id,
      sender_name: perfilAutor?.nome,
      sender_cargo: perfilAutor?.cargo ?? undefined,
    },
  });
  if (erroEnv) {
    // O erro mais comum aqui é 401: a sessão do navegador venceu e a edge
    // recusa. Sem isso o atendente só vê "erro desconhecido" e acha que o
    // WhatsApp caiu — quando basta recarregar a página.
    const status = (erroEnv as { context?: { status?: number } }).context?.status;
    const bruto = (erroEnv as Error).message ?? "";
    if (status === 401 || /401|unauthorized|jwt/i.test(bruto)) {
      throw new Error(mensagemErroEnvio("unauthorized"));
    }
    throw erroEnv;
  }
  const corpo = respEnv as { ok?: boolean; reason?: string } | null;
  if (corpo && corpo.ok === false) {
    throw new Error(mensagemErroEnvio(corpo.reason ?? "edge retornou ok:false sem motivo"));
  }
  return { id: msgReal.id };
}
