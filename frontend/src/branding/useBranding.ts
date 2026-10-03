import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Branding ativo do sistema (tabela branding_sistema, linha com ativo = true).
 * Compatível com o formato esperado pelo bundle (window.RAGENTIC_DATA.BRANDING_INICIAL).
 */
export type Branding = {
  nome_produto: string;
  nome_curto: string;
  nome_so: string;
  logo_url: string | null;
  favicon_url: string | null;
  cor_fundo: string;
  cor_acento_1: string;
  cor_acento_2: string;
  mensagem_login_titulo: string;
  mensagem_login_sub: string;
  login_form_titulo: string;
  login_form_subtitulo: string;
  login_copyright: string;
  login_features: Array<{ icone: string; titulo: string; subtitulo: string }>;
};

const FALLBACK: Branding = {
  nome_produto: "Ragentic",
  nome_curto: "RG",
  nome_so: "Ragentic OS",
  logo_url: null,
  favicon_url: null,
  cor_fundo: "#0b0f1a",
  cor_acento_1: "#6366f1",
  cor_acento_2: "#a855f7",
  mensagem_login_titulo: "O sistema operacional do seu atendimento.",
  mensagem_login_sub: "Agentes IA, curadoria viva e governança — em uma única superfície.",
  login_form_titulo: "Entre na sua conta",
  login_form_subtitulo: "",
  login_copyright: "© 2026 · todos os direitos reservados",
  login_features: [
    { icone: "bot",   titulo: "Agentes IA 24/7", subtitulo: "Atendem WhatsApp, qualificam e fecham." },
    { icone: "brain", titulo: "LLM-OS curado",   subtitulo: "Você cura o cérebro em tempo real." },
    { icone: "spark", titulo: "Gen UI nativo",   subtitulo: "A interface se gera com seus dados." },
  ],
};

function aplicarCssVars(b: Branding) {
  const r = document.documentElement.style;
  r.setProperty("--os-fundo", b.cor_fundo);
  r.setProperty("--os-acento-1", b.cor_acento_1);
  r.setProperty("--os-acento-2", b.cor_acento_2);
}

function mapear(row: any): Branding {
  return {
    nome_produto: row?.nome_produto ?? FALLBACK.nome_produto,
    nome_curto: row?.nome_curto ?? FALLBACK.nome_curto,
    nome_so: row?.nome_produto ?? FALLBACK.nome_so,
    logo_url: row?.logo_url ?? null,
    favicon_url: row?.favicon_url ?? null,
    cor_fundo: row?.cor_fundo ?? FALLBACK.cor_fundo,
    cor_acento_1: row?.cor_acento ?? FALLBACK.cor_acento_1,
    cor_acento_2: row?.cor_acento_secundaria ?? FALLBACK.cor_acento_2,
    mensagem_login_titulo: row?.mensagem_login_titulo ?? FALLBACK.mensagem_login_titulo,
    mensagem_login_sub: row?.mensagem_login_sub ?? FALLBACK.mensagem_login_sub,
    login_form_titulo: row?.login_form_titulo ?? FALLBACK.login_form_titulo,
    login_form_subtitulo: row?.login_form_subtitulo ?? FALLBACK.login_form_subtitulo,
    login_copyright: row?.login_copyright ?? FALLBACK.login_copyright,
    login_features: Array.isArray(row?.login_features) && row.login_features.length
      ? row.login_features
      : FALLBACK.login_features,
  };
}

export function useBranding(): { brand: Branding; carregando: boolean } {
  const [brand, setBrand] = useState<Branding>(FALLBACK);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    const carregar = async () => {
      const { data } = await supabase
        .from("branding_sistema")
        .select("*")
        .eq("ativo", true)
        .maybeSingle();
      if (!vivo) return;
      const b = mapear(data);
      setBrand(b);
      aplicarCssVars(b);
      // Título global da aba = nome do produto. Páginas com título próprio
      // (Login, TelaSaida) sobrescrevem depois nos seus próprios effects.
      document.title = b.nome_produto;
      if (b.favicon_url) {
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = b.favicon_url;
      }
      setCarregando(false);
    };
    carregar();

    const canal = supabase
      .channel("branding_sistema_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branding_sistema" },
        () => carregar(),
      )
      .subscribe();

    return () => {
      vivo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  return { brand, carregando };
}

/**
 * Persiste alterações do branding na linha ativa (admin only — RLS controla).
 * Aceita o formato Branding do bundle e mapeia para colunas da tabela.
 */
export async function salvarBranding(b: Branding): Promise<{ erro?: string }> {
  const payload = {
    nome_produto: b.nome_produto,
    nome_curto: b.nome_curto,
    logo_url: b.logo_url,
    favicon_url: b.favicon_url,
    cor_fundo: b.cor_fundo,
    cor_acento: b.cor_acento_1,
    cor_acento_secundaria: b.cor_acento_2,
    mensagem_login_titulo: b.mensagem_login_titulo,
    mensagem_login_sub: b.mensagem_login_sub,
    login_form_titulo: b.login_form_titulo,
    login_form_subtitulo: b.login_form_subtitulo,
    login_copyright: b.login_copyright,
    login_features: b.login_features as any,
    atualizado_em: new Date().toISOString(),
  };
  const { data: ativa } = await supabase
    .from("branding_sistema")
    .select("id")
    .eq("ativo", true)
    .maybeSingle();
  if (ativa?.id) {
    const { error } = await supabase
      .from("branding_sistema")
      .update(payload)
      .eq("id", ativa.id);
    return { erro: error?.message };
  }
  const { error } = await supabase
    .from("branding_sistema")
    .insert({ ...payload, ativo: true });
  return { erro: error?.message };
}
