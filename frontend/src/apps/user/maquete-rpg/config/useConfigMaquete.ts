/**
 * useConfigMaquete — assina o store da configuração da maquete-RPG.
 *
 * Re-renderiza o componente sempre que `salvarConfig` é chamado em
 * qualquer parte da app, garantindo que painel ↔ simulação ↔ mapa
 * fiquem em sincronia sem prop drill.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  escoparConfigPorUsuario,
  getConfigRuntime,
  inscrever,
  salvarConfig,
  type ConfigMaquete,
} from "./configMaquete";

export function useConfigMaquete() {
  const [config, setConfig] = useState<ConfigMaquete>(() => getConfigRuntime());

  useEffect(() => inscrever(setConfig), []);

  // Escopa o store por usuário no boot — sem isso a config vazava entre contas no
  // mesmo device (a chave de localStorage era global).
  useEffect(() => {
    let vivo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      escoparConfigPorUsuario(data?.session?.user?.id ?? null);
    });
    return () => { vivo = false; };
  }, []);

  return {
    config,
    setConfig: (novo: ConfigMaquete) => salvarConfig(novo),
  };
}
