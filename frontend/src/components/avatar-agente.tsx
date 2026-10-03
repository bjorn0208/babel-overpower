/**
 * AvatarAgente — foto de perfil do canal WhatsApp do agente.
 *
 * Lê de `canais.url_foto_perfil` do tenant atual. Se a URL não carregar
 * (offline, 404, sem canal), volta pro fallback estético: gradient aurora
 * + ícone bot SVG inline.
 *
 * Usado em 3 lugares:
 *  - App Agente (cabeçalho — substitui o emoji 🤖)
 *  - App Conversas (ficha / ChatAtivo — ao lado do label Cargo)
 *  - App Chat-Teste (header — ao lado do label Cargo)
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cache module-level pra foto do canal. 1 fetch por sessão (todos os apps
 * compartilham). Limpado em logout (não implementado aqui — vive até reload).
 */
let CACHE_FOTO_CANAL: { url: string | null; ts: number } | null = null;
const CACHE_FOTO_TTL = 10 * 60 * 1000; // 10min

/**
 * Hook que devolve a URL da foto de perfil do canal WhatsApp do tenant
 * atual. Reusa cache module-level pra evitar N queries (3 apps abrem juntos).
 *
 * Quando uma janela usa o hook pela primeira vez, dispara a query Supabase.
 * Subsequentes leem do cache. TTL 10min — depois revalida em background.
 */
export function useFotoCanal(): string | null {
  const [foto, setFoto] = useState<string | null>(() => {
    if (CACHE_FOTO_CANAL && Date.now() - CACHE_FOTO_CANAL.ts < CACHE_FOTO_TTL) {
      return CACHE_FOTO_CANAL.url;
    }
    return null;
  });

  useEffect(() => {
    if (CACHE_FOTO_CANAL && Date.now() - CACHE_FOTO_CANAL.ts < CACHE_FOTO_TTL) {
      return;
    }
    let ativo = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getSession();
        const uid = u?.session?.user?.id;
        if (!uid) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data, error } = await sb
          .from("canais")
          .select("url_foto_perfil")
          .eq("user_id", uid)
          .eq("type", "whatsapp")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!ativo) return;
        if (error) {
          console.warn("[useFotoCanal] erro:", error);
          return;
        }
        const url = (data as { url_foto_perfil?: string } | null)?.url_foto_perfil ?? null;
        CACHE_FOTO_CANAL = { url, ts: Date.now() };
        setFoto(url);
      } catch (e) {
        console.warn("[useFotoCanal] erro:", e);
      }
    })();
    return () => { ativo = false; };
  }, []);

  return foto;
}

/**
 * Cache module-level pro nome do agente do tenant (`agentes_usuario.nome_agente`).
 * Mesmo padrão de `useFotoCanal` — 1 fetch por sessão, compartilhado entre apps.
 */
let CACHE_NOME_AGENTE: { nome: string | null; ts: number } | null = null;
const CACHE_NOME_TTL = 10 * 60 * 1000; // 10min
/** Persiste o último nome conhecido entre reloads (mata o flash no hard-refresh). */
const LS_NOME_AGENTE = "pl:nome_agente";

/**
 * Hook que devolve o nome configurado do agente do tenant atual
 * (`agentes_usuario.nome_agente`). Reusa cache module-level. Retorna `null`
 * enquanto carrega ou se não houver agente — o consumidor decide o fallback.
 */
export function useNomeAgente(): string | null {
  const [nome, setNome] = useState<string | null>(() => {
    if (CACHE_NOME_AGENTE && Date.now() - CACHE_NOME_AGENTE.ts < CACHE_NOME_TTL) {
      return CACHE_NOME_AGENTE.nome;
    }
    // Seed síncrono pra matar o flash do fallback "Agente": (1) localStorage
    // — sobrevive a reload/hard-refresh (sem isso o cache module-level zera e
    // o nome pisca toda recarga); (2) bundle já hidratado em
    // window.RAGENTIC_DATA.AGENTE_USUARIO (path correto — antes lia
    // window.AGENTE_USUARIO, que nunca existia). A query do useEffect revalida.
    try {
      const salvo = localStorage.getItem(LS_NOME_AGENTE);
      if (salvo && salvo.trim()) return salvo.trim();
    } catch { /* localStorage indisponível */ }
    const doBundle = (window as unknown as {
      RAGENTIC_DATA?: { AGENTE_USUARIO?: { nome?: string } };
    }).RAGENTIC_DATA?.AGENTE_USUARIO?.nome;
    return typeof doBundle === "string" && doBundle.trim() ? doBundle.trim() : null;
  });

  useEffect(() => {
    if (CACHE_NOME_AGENTE && Date.now() - CACHE_NOME_AGENTE.ts < CACHE_NOME_TTL) {
      return;
    }
    let ativo = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getSession();
        const uid = u?.session?.user?.id;
        if (!uid) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data, error } = await sb
          .from("agentes_usuario")
          .select("nome_agente")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!ativo) return;
        if (error) {
          console.warn("[useNomeAgente] erro:", error);
          return;
        }
        const bruto = (data as { nome_agente?: string } | null)?.nome_agente;
        const nomeLimpo = typeof bruto === "string" && bruto.trim() ? bruto.trim() : null;
        CACHE_NOME_AGENTE = { nome: nomeLimpo, ts: Date.now() };
        try {
          if (nomeLimpo) localStorage.setItem(LS_NOME_AGENTE, nomeLimpo);
        } catch { /* localStorage indisponível */ }
        setNome(nomeLimpo);
      } catch (e) {
        console.warn("[useNomeAgente] erro:", e);
      }
    })();
    return () => { ativo = false; };
  }, []);

  return nome;
}

interface AvatarAgenteProps {
  fotoCanal: string | null;
  tamanho?: number;
  /** Quando true, esconde a borda — usado em badges pequenos inline. */
  semBorda?: boolean;
  /** Texto alternativo de acessibilidade. */
  alt?: string;
}

export function AvatarAgente({
  fotoCanal,
  tamanho = 36,
  semBorda = false,
  alt = "Foto do agente",
}: AvatarAgenteProps) {
  const [falhouImagem, setFalhouImagem] = useState(false);
  const mostrarImagem = fotoCanal != null && !falhouImagem;

  if (mostrarImagem) {
    return (
      <img
        src={fotoCanal as string}
        alt={alt}
        loading="lazy"
        onError={() => setFalhouImagem(true)}
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: "50%",
          objectFit: "cover",
          border: semBorda ? "none" : "1px solid oklch(0.7 0.18 220 / 0.40)",
          flexShrink: 0,
          background: "oklch(0.18 0.04 264 / 0.6)",
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: "50%",
        background:
          "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.25), oklch(0.65 0.22 280 / 0.25))",
        border: semBorda ? "none" : "1px solid oklch(0.7 0.18 220 / 0.40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "oklch(0.85 0.10 220)",
      }}
    >
      <svg
        width={Math.round(tamanho * 0.55)}
        height={Math.round(tamanho * 0.55)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
  );
}
