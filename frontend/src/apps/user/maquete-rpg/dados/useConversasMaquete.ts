/**
 * useConversasMaquete — versão LEAN do useConversasLive, só com o que a
 * maquete precisa: id da conversa, nome do lead, tipologia do cargo ativo.
 *
 * Realtime:
 *   - `conversas`: INSERT (nova conversa entra), UPDATE (troca de cargo,
 *     encerramento) → reload da lista.
 *   - `mensagens`: INSERT → callback `aoNovaMensagem` (vira balão).
 *
 * Filtros da maquete viva:
 *   - só conversas com mensagem recente do lead (evita carregar backlog velho)
 *   - channel != 'teste'
 *   - status = 'ativa' e agent_enabled = true
 *   - leads.location != 'base' (cliente arquivado)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ehContatoAtivo } from "@/apps/user/conversas/contatos-ativos";

export type CargoTipologia =
  | "atendimento"
  | "vendedor"
  | "financeiro"
  | "suporte"
  | "mentor";

export interface ConversaMaquete {
  id: string;
  leadNome: string;
  cargoTipologia: CargoTipologia;
  /** epoch ms da última mensagem recente (lead/user). */
  ultimaMensagemMs: number;
}

export interface EventoMensagem {
  conversaId: string;
  papel: "lead" | "agente";
  texto: string;
  ts: number;
}

function normalizarTipologia(t: string | null | undefined): CargoTipologia {
  switch (t) {
    case "vendedor":
    case "financeiro":
    case "suporte":
    case "mentor":
      return t;
    case "atendimento":
    case "admin":
    default:
      return "atendimento";
  }
}

function normalizarCargo(tipologia: string | null | undefined, nome: string | null | undefined): CargoTipologia {
  const base = `${tipologia ?? ""} ${nome ?? ""}`.toLowerCase();
  if (base.includes("vendedor") || base.includes("venda")) return "vendedor";
  if (base.includes("financeiro") || base.includes("cobran")) return "financeiro";
  if (base.includes("suporte")) return "suporte";
  if (base.includes("mentor")) return "mentor";
  return normalizarTipologia(tipologia);
}

function nomeDoLead(l: { nome_exibicao?: string | null; name?: string | null; phone?: string | null } | null): string {
  if (!l) return "Lead";
  return (l.nome_exibicao?.trim() || l.name?.trim() || l.phone || "Lead").slice(0, 18);
}

interface Raw {
  id: string;
  status: string | null;
  channel: string | null;
  agent_enabled: boolean | null;
  cargo_ativo_id: string | null;
  leads: { nome_exibicao: string | null; name: string | null; phone: string | null; location: string | null } | null;
  cargos: { nome: string | null; tipologia: string | null } | null;
}

interface RawMensagemRecente {
  conversation_id: string | null;
  role: string | null;
  created_at: string | null;
}

const JANELA_LEAD_RECENTE_MS = 30 * 60 * 1000;

export function useConversasMaquete() {
  const [conversas, setConversas] = useState<ConversaMaquete[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const eventoRef = useRef<((ev: EventoMensagem) => void) | null>(null);
  // ids das conversas já carregadas na maquete — usado pra detectar mensagem de
  // lead de uma conversa que ainda NÃO está na lista (lead frio que acabou de
  // responder) e forçar recarregar.
  const idsCarregadosRef = useRef<Set<string>>(new Set());

  const aoNovaMensagem = useCallback((cb: (ev: EventoMensagem) => void) => {
    eventoRef.current = cb;
  }, []);

  const recarregar = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const desde = new Date(Date.now() - JANELA_LEAD_RECENTE_MS).toISOString();
    const { data: msgs, error: errMsgs } = await sb
      .from("mensagens")
      .select("conversation_id, role, created_at")
      .in("role", ["user", "lead"])
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(250);
    if (errMsgs) {
      setErro(errMsgs.message);
      setCarregando(false);
      return;
    }
    const msgsTipadas = (msgs ?? []) as RawMensagemRecente[];
    const ultimaMsgPorConv = new Map<string, number>();
    for (const m of msgsTipadas) {
      if (!m.conversation_id || !m.created_at) continue;
      const ts = new Date(m.created_at).getTime();
      const prev = ultimaMsgPorConv.get(m.conversation_id) ?? 0;
      if (ts > prev) ultimaMsgPorConv.set(m.conversation_id, ts);
    }
    const idsRecentes = Array.from(ultimaMsgPorConv.keys());
    if (idsRecentes.length === 0) {
      idsCarregadosRef.current = new Set();
      setConversas([]);
      setCarregando(false);
      setErro(null);
      return;
    }
    const { data, error } = await sb
      .from("conversas")
      .select(`id, status, channel, agent_enabled, cargo_ativo_id,
        leads:lead_id ( nome_exibicao, name, phone, location ),
        cargos:cargo_ativo_id ( nome, tipologia )`)
      .in("id", idsRecentes)
      .neq("channel", "teste")
      .eq("status", "ativa")
      .eq("agent_enabled", true)
      .limit(200);
    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }
    const rows = (data ?? []) as Raw[];
    const ordem = new Map(idsRecentes.map((id, idx) => [id, idx]));
    const mapped: ConversaMaquete[] = rows
      .filter((r) => ehContatoAtivo(r.leads?.location ?? null))
      .map((r) => ({
        id: r.id,
        leadNome: nomeDoLead(r.leads),
        cargoTipologia: normalizarCargo(r.cargos?.tipologia, r.cargos?.nome),
        ultimaMensagemMs: ultimaMsgPorConv.get(r.id) ?? 0,
      }))
      .sort((a, b) => (ordem.get(a.id) ?? 9999) - (ordem.get(b.id) ?? 9999));
    idsCarregadosRef.current = new Set(mapped.map((m) => m.id));
    setConversas(mapped);
    setErro(null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    recarregar();
    // Nome de canal ÚNICO por instância: widget + janela (ou 2D + 3D) montam o
    // hook ao mesmo tempo. Com nome fixo o supabase-js devolve o canal já
    // inscrito e o `.on()` lança — o erro sobe pela árvore do Pixi, a cena
    // desmonta e a janela fica preta (pisca a cada clique ao re-renderizar).
    const sufixo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const chConv = supabase
      .channel(`maquete-conversas-${sufixo}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas" },
        () => recarregar(),
      )
      .subscribe();
    const chMsg = supabase
      .channel(`maquete-mensagens-${sufixo}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens" },
        (payload) => {
          const m = payload.new as {
            conversation_id?: string;
            role?: string;
            content?: string;
          };
          if (!m?.conversation_id || !m.content) return;
          const ehLead = m.role === "lead" || m.role === "user";
          // Lead frio respondendo pela 1ª vez: a conversa não estava na lista
          // (não tinha mensagem de lead recente) e agora passa a qualificar →
          // recarrega pra ela entrar na maquete. Sem isso o boneco nunca aparecia.
          if (ehLead && !idsCarregadosRef.current.has(m.conversation_id)) {
            void recarregar();
          }
          eventoRef.current?.({
            conversaId: m.conversation_id,
            papel: ehLead ? "lead" : "agente",
            texto: m.content,
            ts: Date.now(),
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(chConv);
      supabase.removeChannel(chMsg);
    };
  }, [recarregar]);

  return { conversas, carregando, erro, aoNovaMensagem };
}
