import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispararSopro } from "./sopro";

export type NotificacaoUI = {
  id: string;
  tipo: string;
  icone: string;
  titulo: string;
  msg: string | null;
  acao: string | null;
  acao_label: string | null;
  lido: boolean;
  t: string;
  /** Foto do WhatsApp do contato (leads.url_foto_perfil), quando houver. */
  foto_url: string | null;
  /** URL da mídia da mensagem (imagem/áudio/vídeo/documento), quando houver. */
  midia_url: string | null;
  /** Tipo normalizado da mídia: image | audio | video | document. */
  midia_tipo: string | null;
};

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function paraUI(row: any): NotificacaoUI {
  return {
    id: row.id,
    tipo: row.tipo || "info",
    icone: row.icone || "bell",
    titulo: row.titulo,
    msg: row.mensagem,
    acao: row.acao,
    acao_label: row.acao_label,
    lido: !!row.lida,
    t: tempoRelativo(row.created_at),
    foto_url: row.foto_url ?? null,
    midia_url: row.midia_url ?? null,
    midia_tipo: row.midia_tipo ?? null,
  };
}

export function useNotificacoes(userId: string | null) {
  const [items, setItems] = useState<NotificacaoUI[]>([]);
  const prefRef = useRef<any>(null);
  const sonsRef = useRef<any[]>([]);
  const vistosRef = useRef<Set<string>>(new Set());
  const primeiraRef = useRef(true);

  // tipo da notificação (vindo do trigger) → chave de módulo silenciável
  const MAPA_CHAVE: Record<string, string> = {
    conversa_mensagem: "conversas:mensagem",
    conversa_humana: "conversas:humano",
    handoff: "conversas:handoff",
  };

  function tocarSom(row: any) {
    const pref = prefRef.current;
    if (!pref) return;
    const chave = MAPA_CHAVE[row.tipo];
    if (chave && (pref.modulos_silenciados || []).includes(chave)) return;
    // prioritários (handoff e atendimento humano) usam o som de handoff
    const ehHandoff = row.tipo === "handoff" || row.tipo === "conversa_humana";
    const ligado = ehHandoff ? pref.som_handoff_ativo !== false : pref.som_ativo !== false;
    if (!ligado) return;
    const somId = ehHandoff ? (pref.som_handoff_id || "campainha") : (pref.som_id || "sino");
    const som = sonsRef.current.find((s) => s.id === somId);
    if (!som) return;
    try {
      const a = new Audio(`/sons-notificacao/${som.arquivo}`);
      a.volume = 0.6;
      void a.play();
    } catch {
      /* navegador pode bloquear autoplay até o 1º gesto do usuário */
    }
  }

  // notificação nova: efeito visual (Sopro) + som, respeitando o módulo
  // silenciado. Som ainda respeita som_ativo internamente.
  function alertarNova(row: any) {
    const pref = prefRef.current;
    const chave = MAPA_CHAVE[row.tipo];
    if (chave && (pref?.modulos_silenciados || []).includes(chave)) return;
    dispararSopro({ titulo: row.titulo, mensagem: row.mensagem, foto_url: row.foto_url, midia_tipo: row.midia_tipo });
    tocarSom(row);
  }

  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    primeiraRef.current = true;
    vistosRef.current = new Set();

    const carregarPrefs = async () => {
      const [{ data: cat }, { data: p }] = await Promise.all([
        supabase.from("sons_notificacao").select("id, arquivo").eq("ativo", true),
        supabase.from("preferencias_notificacao_usuario").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (!ativo) return;
      sonsRef.current = cat || [];
      prefRef.current = p || { som_ativo: true, som_handoff_ativo: true, som_id: "sino", som_handoff_id: "campainha", modulos_silenciados: [] };
    };

    const carregar = async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, tipo, icone, titulo, mensagem, acao, acao_label, lida, created_at, foto_url, midia_url, midia_tipo")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!ativo) return;
      if (error) { console.error("[notificacoes] carregar", error); return; }
      const rows = data || [];
      // som só para notificação nova não-lida (nunca no histórico do load inicial)
      if (!primeiraRef.current) {
        for (const row of rows) {
          if (!row.lida && !vistosRef.current.has(row.id)) { alertarNova(row); break; }
        }
      }
      rows.forEach((r) => vistosRef.current.add(r.id));
      primeiraRef.current = false;
      const ui = rows.map(paraUI);
      setItems(ui);
      (window as any).RAGENTIC_NOTIFICACOES = ui;
      window.dispatchEvent(new CustomEvent("ragentic-notificacoes-change", { detail: ui }));
    };

    void carregarPrefs().then(carregar);
    const canal = supabase
      .channel(`notificacoes:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` }, () => carregar())
      .subscribe();
    return () => { ativo = false; supabase.removeChannel(canal); };
  }, [userId]);

  return items;
}

export async function marcarNotificacaoLida(id: string) {
  const { error } = await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
  if (error) console.error("[notificacoes] lida", error);
}

export async function marcarNotificacoesAppLidas(userId: string, slug: string) {
  const { error } = await supabase.from("notificacoes").update({ lida: true }).eq("user_id", userId).eq("acao", slug).eq("lida", false);
  if (error) console.error("[notificacoes] lidas-app", error);
}

export async function removerNotificacao(id: string) {
  const { error } = await supabase.from("notificacoes").delete().eq("id", id);
  if (error) console.error("[notificacoes] remover", error);
}

export async function limparNotificacoes(userId: string) {
  const { error } = await supabase.from("notificacoes").delete().eq("user_id", userId);
  if (error) console.error("[notificacoes] limpar", error);
}