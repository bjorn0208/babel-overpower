import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App as BundleApp } from "@/bundle/bundle";
import TelaSaida from "@/pages/TelaSaida";
import { useAuth } from "@/auth/AuthContext";
import { useRole } from "@/auth/useRole";
import { useBranding, salvarBranding } from "@/branding/useBranding";
import { useTenants } from "@/tenants/useTenants";
import { useDadosBundle } from "@/data/useDadosBundle";
import { instalarHooksBundle } from "@/data/hooksBundle";
import { usePreferenciasUi } from "@/preferencias/usePreferenciasUi";
import { useNotificacoes } from "@/notificacoes/useNotificacoes";
import ApresentacaoMentoria from "@/mentoria/ApresentacaoMentoria";
import ResumoAusencia from "@/os/ResumoAusencia";

export default function Desktop() {
  const nav = useNavigate();
  const { session, carregando, sair } = useAuth();
  const { lado, carregando: carregandoRole } = useRole();
  // Saída em curso: trava o desktop e mostra a animação do CommandBar subindo.
  const [saindo, setSaindo] = useState(false);
  const { brand } = useBranding();
  const { tenants } = useTenants();
  const { pronto: dadosProntos } = useDadosBundle(session?.user?.id ?? null, lado === "admin");
  useEffect(() => { instalarHooksBundle(session?.user?.id ?? null); }, [session?.user?.id]);
  const prefsUi = usePreferenciasUi(session?.user?.id ?? null);
  useNotificacoes(session?.user?.id ?? null);

  // Quando prefsUi chega (async via Supabase), dispara evento global que o
  // bundle.jsx escuta pra reidratar estados que foram inicializados antes
  // do fetch resolver (pinned, widgets_ativos, widgets_posicoes). Sem isso,
  // pin/widget escolhidos pelo usuário some após F5 — o `useState` lazy init
  // do bundle pegava o `window.RAGENTIC_PREFERENCIAS_UI` ainda vazio.
  useEffect(() => {
    if (!prefsUi) return;
    window.dispatchEvent(new CustomEvent("ragentic:prefs-prontas", { detail: prefsUi }));
  }, [prefsUi]);

  useEffect(() => {
    if (!carregando && !session) nav("/login", { replace: true });
  }, [session, carregando, nav]);

  // Boot imediato (2026-05-14 02:08): sem tela de carregando entre login e desktop.
  // Se sessão ainda não chegou, o useEffect acima redireciona pra /login. Aqui só
  // protege contra render sem session pra não quebrar BundleApp. Role/dados/prefs
  // continuam carregando em background — apps mostram fallback próprio se precisarem.
  if (!session) return null;

  return (
    <>
      <BundleApp
        initialBrand={brand}
        initialSide={lado ?? "user"}
        tenants={lado === "admin" ? tenants : undefined}
        onBrandSave={async (b) => {
          if (lado !== "admin") return;
          const { erro } = await salvarBranding(b);
          if (erro) console.error("[branding] salvar", erro);
        }}
        // Não desloga na hora: dispara a animação de saída (CommandBar subindo).
        onLogout={() => setSaindo(true)}
      />
      {/* O que rolou enquanto o usuário esteve fora (1h+). Entra direto: a
          saudação "Olá, {nome}" que segurava a vez saiu de cena em 2026-08-10. */}
      <ResumoAusencia userId={session.user.id} pronto />
      {/* Conta de apresentação (mentoria): Diagnóstico Digital → oferta → virada. */}
      <ApresentacaoMentoria userId={session.user.id} />
      {/* Espelho invertido do login: fumaça sobe + CommandBar sobe pro centro,
          e só então desloga de fato + navega pra /login. */}
      {saindo && (
        <TelaSaida
          brand={brand}
          onConcluir={async () => {
            await sair();
            nav("/login", { replace: true });
          }}
        />
      )}
    </>
  );
}
