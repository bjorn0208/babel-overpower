import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export type Lado = "admin" | "user";

/**
 * Resolve o "lado" do OS a partir do papel real no banco.
 * Admin exige profiles.system_role = 'platform_admin', como na RLS.
 * Fallback: 'user'.
 *
 * Inclui timeout protetivo de 8s. Se as queries não responderem (RLS lento,
 * sessão impersonada com bloqueio, rede flaky), libera com lado="user" pra
 * não travar o Desktop em loading eterno.
 */
export function useRole(): { lado: Lado; carregando: boolean; isAdmin: boolean } {
  const { user, carregando: authCarregando } = useAuth();
  const userId = user?.id;
  const [lado, setLado] = useState<Lado>("user");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (authCarregando) return;
    if (!userId) {
      setLado("user");
      setCarregando(false);
      return;
    }

    setLado("user");
    setCarregando(true);

    let vivo = true;
    let timeoutId: number | null = null;

    const fallback = (motivo: string): void => {
      if (!vivo) return;
      // Marca a rodada como finalizada: sem isto, uma resposta tardia da query
      // podia chegar DEPOIS do fallback por timeout e "trocar de lado" (sobrescrever
      // o estado já resolvido). vivo=false fecha a janela pra qualquer chegada tardia.
      vivo = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      console.warn(`[useRole] fallback → "user" (motivo: ${motivo})`);
      setLado("user");
      setCarregando(false);
    };

    timeoutId = window.setTimeout(() => fallback("timeout 8s"), 8000);

    (async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("system_role")
          .eq("id", userId)
          .maybeSingle();
        if (!vivo) return;
        if (error) {
          // Erro da query NÃO pode ser tratado como "sem admin silencioso" nem
          // conceder admin: cai no fallback seguro "user" e encerra a rodada.
          fallback(`erro consulta: ${error.message}`);
          return;
        }
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Critério alinhado à RLS: admin de plataforma é system_role='platform_admin'
        // (mesmo predicado de public.eh_admin_plataforma()). O regex /admin/i sobre
        // user_roles.role OU system_role dava desktop admin a quem a RLS bloqueava.
        const isAdmin = profile?.system_role === "platform_admin";
        vivo = false; // decisão tomada — encerra a janela pra respostas tardias
        setLado(isAdmin ? "admin" : "user");
        setCarregando(false);
      } catch (e) {
        fallback(`erro: ${(e as Error)?.message ?? "desconhecido"}`);
      }
    })();

    return () => {
      vivo = false;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [userId, authCarregando]);

  return { lado, carregando, isAdmin: lado === "admin" };
}
