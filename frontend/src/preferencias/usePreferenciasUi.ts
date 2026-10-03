import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PreferenciasUi = {
  papel_parede_id: string;
  widgets_ativos: string[];
  widgets_posicoes: Record<string, { x: number; y: number }>;
  badges_zerados: Record<string, boolean>;
  /** Slugs de apps fixados no Dock (escolha do pino no Launchpad). Vazio = usa default hardcoded do bundle. */
  apps_fixados: string[];
};

const PADRAO: PreferenciasUi = {
  papel_parede_id: "aurora",
  widgets_ativos: ["relogio"],
  widgets_posicoes: {},
  badges_zerados: {},
  apps_fixados: [],
};

/**
 * Inclui timeout protetivo de 6s. Se a query não responder (RLS, rede),
 * usa o PADRAO pra não travar o Desktop em loading eterno.
 */
export function usePreferenciasUi(userId: string | null): PreferenciasUi | null {
  const [prefs, setPrefs] = useState<PreferenciasUi | null>(null);

  useEffect(() => {
    if (!userId) {
      setPrefs(PADRAO);
      return;
    }
    let cancelado = false;
    let timeoutId: number | null = null;

    const aplicarPadrao = (motivo: string): void => {
      if (cancelado) return;
      console.warn(`[preferencias-ui] fallback → PADRAO (motivo: ${motivo})`);
      setPrefs(PADRAO);
      (window as unknown as { RAGENTIC_PREFERENCIAS_UI?: PreferenciasUi }).RAGENTIC_PREFERENCIAS_UI = PADRAO;
    };

    timeoutId = window.setTimeout(() => aplicarPadrao("timeout 6s"), 6000);

    (async () => {
      try {
        // Cast: coluna `apps_fixados` é nova (migration prefs_ui_apps_fixados),
        // types gerados ainda não conhecem. Removível ao regenerar types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data, error } = await sb
          .from("preferencias_ui_usuario")
          .select("papel_parede_id, widgets_ativos, widgets_posicoes, badges_zerados, apps_fixados")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelado) return;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (error) {
          console.error("[preferencias-ui] carregar", error);
          setPrefs(PADRAO);
          return;
        }
        const d = (data ?? {}) as Partial<PreferenciasUi>;
        const p: PreferenciasUi = {
          papel_parede_id: d.papel_parede_id || PADRAO.papel_parede_id,
          widgets_ativos: d.widgets_ativos || PADRAO.widgets_ativos,
          widgets_posicoes: d.widgets_posicoes || {},
          badges_zerados: d.badges_zerados || {},
          apps_fixados: Array.isArray(d.apps_fixados) ? d.apps_fixados : [],
        };
        setPrefs(p);
        (window as unknown as { RAGENTIC_PREFERENCIAS_UI?: PreferenciasUi }).RAGENTIC_PREFERENCIAS_UI = p;
      } catch (e) {
        aplicarPadrao(`erro: ${(e as Error)?.message ?? "desconhecido"}`);
      }
    })();

    return () => {
      cancelado = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [userId]);

  return prefs;
}

export async function salvarPreferenciasUi(
  userId: string,
  patch: Partial<PreferenciasUi>,
): Promise<void> {
  // Cast: coluna `apps_fixados` foi adicionada via migration mas types gerados
  // não conhecem ainda. Cast deliberado até regenerar types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Relê a linha REAL do banco antes de escrever e mescla só os campos do patch.
  // Antes: usava o objeto do window global como base e dava upsert do objeto
  // INTEIRO. Se as prefs reais ainda não tinham carregado — ou se o timeout de
  // 6s já tinha gravado PADRAO no global — o save apagava papel de parede, pinos
  // e widgets (last-writer-wins do objeto todo). Reler-e-mesclar sobre o banco
  // preserva os campos que não estão no patch e mata o clobber; NÃO usa mais o
  // fallback PADRAO como base de escrita.
  const { data: atualBanco, error: erroLeitura } = await sb
    .from("preferencias_ui_usuario")
    .select("papel_parede_id, widgets_ativos, widgets_posicoes, badges_zerados, apps_fixados")
    .eq("user_id", userId)
    .maybeSingle();
  if (erroLeitura) {
    // Sem conseguir ler o estado atual, um upsert do objeto inteiro arriscaria
    // apagar campos existentes. Aborta o save em vez de gravar por cima às cegas.
    console.error("[preferencias-ui] salvar (releitura falhou, save abortado)", erroLeitura);
    return;
  }

  const base: PreferenciasUi = {
    papel_parede_id: atualBanco?.papel_parede_id || PADRAO.papel_parede_id,
    widgets_ativos: atualBanco?.widgets_ativos || PADRAO.widgets_ativos,
    widgets_posicoes: atualBanco?.widgets_posicoes || {},
    badges_zerados: atualBanco?.badges_zerados || {},
    apps_fixados: Array.isArray(atualBanco?.apps_fixados) ? atualBanco.apps_fixados : [],
  };
  const proximo: PreferenciasUi = { ...base, ...patch };

  const { error } = await sb
    .from("preferencias_ui_usuario")
    .upsert({ user_id: userId, ...proximo }, { onConflict: "user_id" });
  if (error) {
    console.error("[preferencias-ui] salvar", error);
    return;
  }
  // Atualiza o global só APÓS o save bem-sucedido, já com o objeto mesclado real.
  (window as unknown as { RAGENTIC_PREFERENCIAS_UI?: PreferenciasUi }).RAGENTIC_PREFERENCIAS_UI = proximo;
}
