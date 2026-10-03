// @ts-nocheck
/**
 * use-carregar-lobby — boot de dados do lobby do app Reunião.
 * Carrega sessão do usuário, nome do perfil, salas vivas/agendadas,
 * membros da equipe e o teto global de participantes (config_plataforma).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SalaResumo, MembroEquipe } from "./reuniao-tipos";

export function useCarregarLobby() {
  const [userId, setUserId] = useState<string | null>(null);
  const [meuNome, setMeuNome] = useState("Eu");
  const [salas, setSalas] = useState<SalaResumo[]>([]);
  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [teto, setTeto] = useState(6);
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: ses } = await supabase.auth.getSession();
      const uid = ses?.session?.user?.id ?? null;
      if (!vivo) return;
      setUserId(uid);
      if (!uid) {
        setCarregando(false);
        return;
      }

      const [{ data: profile }, { data: salaData }, { data: membroData }, { data: configData }] =
        await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
          supabase
            .from("salas_reuniao")
            .select("id, titulo, status, chave_publica, agendada_para, duracao_min")
            .not("status", "in", '("encerrada","cancelada")')
            .is("deleted_at", null)
            .order("agendada_para", { ascending: true, nullsFirst: false }),
          supabase
            .from("profiles")
            .select("id, full_name")
            .eq("parent_user_id", uid)
            .is("deleted_at", null)
            .eq("is_active", true),
          supabase
            .from("config_plataforma")
            .select("id, reuniao_limite_participantes")
            .limit(1)
            .single(),
        ]);

      if (!vivo) return;
      if (profile?.full_name) setMeuNome(profile.full_name);
      setSalas((salaData ?? []) as SalaResumo[]);
      setMembros((membroData ?? []).map((m) => ({ id: m.id, nome: m.full_name ?? "Membro" })));
      if (configData) {
        setConfigId(configData.id ?? null);
        setTeto(configData.reuniao_limite_participantes ?? 6);
      }
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return { userId, meuNome, salas, setSalas, membros, carregando, teto, setTeto, configId };
}
