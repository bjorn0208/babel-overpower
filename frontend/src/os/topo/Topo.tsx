/**
 * Topo do Ragentic OS — pílulas flutuantes independentes.
 *
 * Filosofia (cravada por Theus 2026-05-13): minimalista, SEM look de barra
 * divisória contínua. Cada elemento é uma pílula glass independente flutuando
 * no topo. Não há fundo de barra, borda inferior, ou separador entre clusters.
 *
 * Era BarraSuperior em bundle.jsx:329-415.
 *
 * Refatorações aplicadas (auditoria barra-superior-2026-05-13.md):
 *  - P0: aria-label em todos os botões
 *  - P0: confirmação modal/feedback antes de logout (toast confirm pattern)
 *  - P0: CardPlano com role=dialog + focus trap + Escape (em CardPlano.tsx)
 *  - P1: motion presets (hover/tap nas pílulas)
 *  - P1: useRelogio hook próprio (em useRelogio.ts)
 *  - Renomeado de BarraSuperior → Topo (Theus quer "sem palavra barra")
 *
 * Compat: exportado como BarraSuperior em index.ts.
 */

import { motion } from "framer-motion";
import { duration, easing } from "@/os/motion/presets";
import { CardPlano, type PlanoUso } from "./CardPlano";
import { BotaoTelaCheia } from "./BotaoTelaCheia";
import { capitalizarPrimeira, useRelogio } from "./useRelogio";

type Side = "user" | "admin";

interface Brand {
  nome_so: string;
}

interface TopoProps {
  brand: Brand;
  planoUso?: PlanoUso | null;
  side: Side;
  onSwitchSide?: () => void;
  onAbrirLoja: () => void;
  onAbrirLaunchpad: () => void;
  onLogout: () => void;
  /** Slot pra NotificationCenter (drawer + badge) renderizado por fora */
  notif?: React.ReactNode;
}

/* Detecção de impersonação por sessionStorage / URL — mesma lógica do bundle. */
function detectarImpersonacao(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get("impersonacao") === "1") return true;
    if (params.get("impersonation") === "1") return true;
    return (
      window.sessionStorage.getItem("ragentic_impersonacao_ativa") === "1" ||
      window.sessionStorage.getItem("ragentic_impersonacao_isolada") === "1" ||
      !!window.sessionStorage.getItem("ragentic-impersonacao-auth")
    );
  } catch {
    return false;
  }
}

/**
 * Sai da impersonação fechando a aba.
 *
 * Como a aba foi aberta via `window.open` pelo admin, ela pode ser fechada
 * via `window.close()` — o admin continua intacto na aba original com sua
 * sessão localStorage própria (impersonado usa sessionStorage isolado).
 *
 * Limpamos sessionStorage isolado por segurança antes de fechar — se por
 * algum motivo a aba não fechar (ex: usuário entrou direto na URL), pelo
 * menos a sessão impersonada é destruída e cai no fluxo normal de auth.
 */
async function sairImpersonacao(): Promise<void> {
  // Mesma aba (2026-05-14): restaura session do admin do backup feito em hooksBundle.impersonar
  try {
    const backup = window.sessionStorage.getItem("ragentic_admin_backup");
    if (backup) {
      const { access_token, refresh_token } = JSON.parse(backup) as { access_token: string; refresh_token: string };
      const mod = await import("@/integrations/supabase/client");
      await mod.supabase.auth.setSession({ access_token, refresh_token });
    }
  } catch {
    // ignore — se falhar, vai cair em /login natural no Desktop
  }

  // Limpa todas as flags de impersonação
  try {
    window.sessionStorage.removeItem("ragentic_impersonacao_ativa");
    window.sessionStorage.removeItem("ragentic_admin_backup");
    window.sessionStorage.removeItem("ragentic_impersonacao_isolada");
    window.sessionStorage.removeItem("ragentic-impersonacao-auth");
  } catch { /* ignore */ }

  // Reload pra Desktop renderizar no contexto do admin restaurado
  window.location.href = "/";
}

/* Ícones minimalistas inline (em vez de depender de window.Icon do bundle) */
/* IconeGrip removido — não é mais usado após o brand virar BrandLauncher quadrado. */

const IconeShield = ({ size = 13 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconePower = ({ size = 14 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

const transHover = { duration: duration.fast, ease: easing.outExpo };

export function Topo({
  brand,
  planoUso,
  side,
  onAbrirLoja,
  onAbrirLaunchpad,
  onLogout,
  notif,
}: TopoProps) {
  const { diaSemana, diaMes, horaMin } = useRelogio();
  const impersonando = detectarImpersonacao();

  return (
    <header
      className="bar-flutuante"
      role="banner"
      aria-label="Itens do topo do sistema"
    >
      {impersonando && (
        <motion.button
          onClick={sairImpersonacao}
          aria-label="Você está impersonando outro usuário. Clique para sair."
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={transHover}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            background: "oklch(0.88 0.18 90 / 0.18)",
            border: "1px solid oklch(0.88 0.18 90 / 0.55)",
            color: "oklch(0.92 0.16 92)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
            cursor: "pointer",
            boxShadow:
              "0 0 0 1px oklch(0.88 0.18 90 / 0.15), 0 8px 24px oklch(0.88 0.18 90 / 0.12)",
          }}
        >
          <IconeShield size={13} />
          <span>Modo impersonação ativo · sair</span>
        </motion.button>
      )}

      <motion.button
        className="bar-cluster bar-logout"
        onClick={onLogout}
        aria-label="Sair da conta"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={transHover}
        style={{
          cursor: "pointer",
          padding: 0,
          width: 30,
          height: 30,
          justifyContent: "center",
        }}
      >
        <IconePower size={14} />
      </motion.button>

      {side === "user" && planoUso && (
        <CardPlano plano={planoUso} onAbrirLoja={onAbrirLoja} />
      )}

      <div style={{ flex: 1 }} />

      <div
        className="bar-cluster"
        aria-label={`Hoje é ${diaSemana} dia ${diaMes}, ${horaMin}`}
      >
        <span className="date" aria-hidden="true">
          {capitalizarPrimeira(diaSemana)}., {diaMes}
        </span>
        <span className="sep" aria-hidden="true" />
        <span className="clock" aria-hidden="true">
          {horaMin}
        </span>
      </div>

      <BotaoTelaCheia />

      {notif}
    </header>
  );
}

/** Alias pra compat com bundle.jsx legado que importa `BarraSuperior` */
export const BarraSuperior = Topo;
