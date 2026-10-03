/**
 * Dock lateral do Ragentic OS.
 *
 * Era em bundle.jsx:408-437.
 *
 * Refatorações (auditoria dock-2026-05-13.md):
 *  - P0: aria-label dinâmico ("Atendimento — 3 novo, pressionado")
 *  - P0: aria-pressed em ativo
 *  - P0: aria-live="polite" no badge (anuncia mudanças pro screen reader)
 *  - P1: motion tap press + stagger entrance sutil (~40ms entre items)
 *  - P1: tooltip próprio (.dock-tip) — sem `title` nativo pra não duplicar o nome
 *    no hover; nome completo (com badge) fica no aria-label
 *  - prefers-reduced-motion já coberto pelo @media global em bundle.css
 *
 * 2026-07-10 [TESTE]: hover no ícone abre até 3 "ramos" em leque (mapa mental)
 * com linha curva que se desenha suave — cada ramo abre um destino real.
 *
 * Compat: bundle.jsx envia props { apps, abertos, onLaunch, side, open,
 * pinned, badgesZerados }. Mantemos exatamente o mesmo shape.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import {
  duration,
  easing,
  stagger,
  staggerItem,
  tapPress,
} from "@/os/motion/presets";
import { irParaAba } from "./aba-alvo";

type Lado = "user" | "admin" | "ambos";

interface App {
  slug: string;
  titulo: string;
  icone: string;
  lado: Lado;
}

interface DockProps {
  apps: App[];
  abertos: string[];
  onLaunch: (slug: string) => void;
  side: "user" | "admin";
  open: boolean;
  pinned: Set<string>;
  badgesZerados?: Record<string, boolean>;
  /** Persistir nova ordem dos apps fixados (drag pra reordenar, 2026-08-19). */
  onReordenar?: (slugs: string[]) => void;
}

/** Ramo de mapa mental: um atalho que sai do ícone no hover.
 *  `destino` é slug real; `aba` (opcional) cai direto numa sub-tela do app. */
interface Ramo {
  rotulo: string;
  destino: string;
  icone: string;
  aba?: string;
}

/**
 * Até 3 ramos por app — atalhos pra as SUB-TELAS do PRÓPRIO app (nunca outro
 * app). `aba` é o valor interno de navegação do app; ao clicar, `irParaAba`
 * abre/foca o app e cai direto na aba. Curado à mão (2026-07-10). Apps sem
 * sub-navegação (base, clientes, produtos, notas, calc...) ficam de fora.
 */
const RAMOS_POR_APP: Record<string, Ramo[]> = {
  // ── painel do tenant (user) ──────────────────────────────────────────
  conversas: [
    { rotulo: "Atendimento", destino: "conversas", aba: "atendimento", icone: "zap" },
    { rotulo: "Vendas", destino: "conversas", aba: "vendas", icone: "trending" },
    { rotulo: "Clientes", destino: "conversas", aba: "clientes", icone: "userCheck" },
  ],
  agente: [
    { rotulo: "Conhecimento", destino: "agente", aba: "conhecimento", icone: "book" },
    { rotulo: "Cargos", destino: "agente", aba: "cargos", icone: "layers" },
    { rotulo: "Perguntas", destino: "agente", aba: "perguntas", icone: "command" },
  ],
  configuracoes: [
    { rotulo: "Conta", destino: "configuracoes", aba: "conta", icone: "users" },
    { rotulo: "Notificações", destino: "configuracoes", aba: "notificacoes", icone: "bell" },
    { rotulo: "Aparência", destino: "configuracoes", aba: "aparencia", icone: "palette" },
  ],
  contratos: [
    { rotulo: "Gerador", destino: "contratos", aba: "gerador", icone: "fileSignature" },
    { rotulo: "Templates", destino: "contratos", aba: "templates", icone: "layers" },
    { rotulo: "Histórico", destino: "contratos", aba: "historico", icone: "book" },
  ],
  consulta: [
    { rotulo: "Consultar", destino: "consulta", aba: "consultar", icone: "search" },
    { rotulo: "Carteira", destino: "consulta", aba: "carteira", icone: "wallet" },
    { rotulo: "Histórico", destino: "consulta", aba: "historico", icone: "book" },
  ],
  "socio-comercial-user": [
    { rotulo: "Rede", destino: "socio-comercial-user", aba: "rede", icone: "users" },
    { rotulo: "Comissões", destino: "socio-comercial-user", aba: "comissoes", icone: "dollar" },
    { rotulo: "Saques", destino: "socio-comercial-user", aba: "saques", icone: "trending" },
  ],
  // ── painel da plataforma (admin) ─────────────────────────────────────
  tenants: [
    { rotulo: "Ativos", destino: "tenants", aba: "ativo", icone: "userCheck" },
    { rotulo: "Pendentes", destino: "tenants", aba: "pendente", icone: "bell" },
    { rotulo: "Inativos", destino: "tenants", aba: "inativo", icone: "eyeOff" },
  ],
  "consulta-admin": [
    { rotulo: "Tipos", destino: "consulta-admin", aba: "tipos", icone: "layers" },
    { rotulo: "Pacotes", destino: "consulta-admin", aba: "pacotes", icone: "package" },
    { rotulo: "Recargas", destino: "consulta-admin", aba: "recargas", icone: "dollar" },
  ],
  financeiro: [
    { rotulo: "Pedidos", destino: "financeiro", aba: "pedidos", icone: "dollar" },
    { rotulo: "Saques", destino: "financeiro", aba: "saques", icone: "trending" },
  ],
  aparencia: [
    { rotulo: "Geral", destino: "aparencia", aba: "geral", icone: "sliders" },
    { rotulo: "Cores", destino: "aparencia", aba: "cores", icone: "palette" },
    { rotulo: "Login", destino: "aparencia", aba: "login", icone: "command" },
  ],
  "cargos-admin": [
    { rotulo: "Globais", destino: "cargos-admin", aba: "global", icone: "users" },
    { rotulo: "Nichos", destino: "cargos-admin", aba: "nicho", icone: "layers" },
  ],
  curadoria: [
    { rotulo: "Simulador", destino: "curadoria", aba: "simulador", icone: "flaskConical" },
    { rotulo: "Blocos", destino: "curadoria", aba: "blocos", icone: "layers" },
    { rotulo: "Conversa", destino: "curadoria", aba: "conversa", icone: "message" },
  ],
  "socio-comercial": [
    { rotulo: "Comissões", destino: "socio-comercial", aba: "comissoes", icone: "dollar" },
    { rotulo: "Rede", destino: "socio-comercial", aba: "rede", icone: "users" },
  ],
};

/** Deslocamento vertical (px) de cada ramo em leque, por total de ramos. */
const LEQUE: Record<number, number[]> = {
  1: [0],
  2: [-30, 30],
  3: [-52, 0, 52],
};
const RAMO_X = 66; // x onde a linha encosta: borda esquerda da pílula (.dock-ramo left:66px)

const transBadge = { duration: duration.normal, ease: easing.outExpo };

function calcularBadges(
  badgesZerados?: Record<string, boolean>,
): Record<string, number> {
  // Compat: lê do window.RAGENTIC_DATA injetado pelo bundle.
  // Quando migrarmos pro Supabase live, este helper sumirá em favor de hooks.
  // P1 fix (dock-impeccable-critique): runtime guards Array.isArray pra silenciar
  // falhas se bundle injetar shape inesperado.
  const data = (typeof window !== "undefined"
    ? window.RAGENTIC_DATA
    : undefined) as
    | {
        LEADS?: Array<{ hot?: boolean }>;
        PEDIDOS?: unknown[];
        TENANTS?: Array<{ status?: string }>;
      }
    | undefined;

  const leads = Array.isArray(data?.LEADS) ? data!.LEADS : [];
  const pedidos = Array.isArray(data?.PEDIDOS) ? data!.PEDIDOS : [];
  const tenants = Array.isArray(data?.TENANTS) ? data!.TENANTS : [];

  if (data && (data.LEADS !== undefined && !Array.isArray(data.LEADS))) {
    console.warn("[Dock] window.RAGENTIC_DATA.LEADS não é array · badges zeradas");
  }

  // mentor e curadoria vinham HARDCODED (1 e 7) — badge falso permanente, sempre
  // aceso mesmo sem nada pendente. Enquanto não há fonte real de contagem injetada
  // pro dock (como LEADS/PEDIDOS/TENANTS), fica 0: melhor nenhum badge do que um
  // número fixo mentindo. Ligar quando a fonte real existir (ex.: data.MENTOR_
  // PENDENTES / data.CURADORIA_PENDENTES).
  const mentorPend = Array.isArray((data as { MENTOR_PENDENTES?: unknown[] } | undefined)?.MENTOR_PENDENTES)
    ? (data as { MENTOR_PENDENTES: unknown[] }).MENTOR_PENDENTES.length
    : 0;
  const curadoriaPend = Array.isArray((data as { CURADORIA_PENDENTES?: unknown[] } | undefined)?.CURADORIA_PENDENTES)
    ? (data as { CURADORIA_PENDENTES: unknown[] }).CURADORIA_PENDENTES.length
    : 0;
  const base: Record<string, number> = {
    atendimento: leads.filter((l) => l.hot).length,
    mentor: mentorPend,
    curadoria: curadoriaPend,
    financeiro: pedidos.length,
    tenants: tenants.filter((t) => t.status === "pendente").length,
    loja: 0,
  };

  const zer = badgesZerados ?? {};
  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, zer[k] ? 0 : v]),
  );
}

export function Dock({
  apps,
  abertos,
  onLaunch,
  side,
  open,
  pinned,
  badgesZerados,
  onReordenar,
}: DockProps) {
  // Filtragem original: apps que aparecem no painel atual
  // Ordem custom do usuário: `pinned` é um Set criado do array `apps_fixados`
  // das prefs — Set preserva a ordem de inserção, e o drag regrava essa ordem.
  const ordemPinned = Array.from(pinned);
  const sideApps = apps
    .filter((a) => (a.lado === side || a.lado === "ambos") && pinned.has(a.slug))
    .sort((a, b) => ordemPinned.indexOf(a.slug) - ordemPinned.indexOf(b.slug));
  const badges = calcularBadges(badgesZerados);

  // Reorder fluido (2026-08-19 v2): durante o arrasto a ordem vive no state
  // local (os irmãos deslizam via layout animation); persiste 1x no soltar.
  const [ordemDrag, setOrdemDrag] = useState<string[] | null>(null);
  useEffect(() => { setOrdemDrag(null); }, [side]);
  const ordemVisual = ordemDrag ?? sideApps.map((a) => a.slug);
  const appsOrdenados = ordemVisual
    .map((slug) => sideApps.find((a) => a.slug === slug))
    .filter((a): a is App => !!a);
  const persistirOrdem = () => {
    if (ordemDrag && onReordenar) onReordenar(ordemDrag);
    setOrdemDrag(null);
  };

  // Ramos abertos no hover (slug do app). Delay no leave permite mover o mouse
  // do ícone até o ramo sem que o leque recolha antes do clique.
  const [expandido, setExpandido] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Limpa o timer do leque ao desmontar — senão o setTimeout de fecharRamos podia
  // disparar setExpandido depois do Dock já ter saído.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  // Portal (2026-08-19): tooltip e leque renderizam no body pra escapar do
  // clip da pílula rolável. A âncora é o canto direito/centro do item.
  const [tipInfo, setTipInfo] = useState<{ slug: string; titulo: string; x: number; y: number } | null>(null);
  const ancorasRef = useRef<Record<string, { x: number; y: number }>>({});

  const abrirRamos = (slug: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (RAMOS_POR_APP[slug]?.length) setExpandido(slug);
  };
  const fecharRamos = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // 2s de inatividade (Theus 2026-07-28): tempo de levar o mouse do ícone até
    // a caixa do ramo sem o leque recolher; entrar de novo cancela o timer.
    timerRef.current = setTimeout(() => setExpandido(null), 2000);
  };

  const renderItem = (app: App) => {
    const ativo = abertos.includes(app.slug);
    const badge = badges[app.slug] ?? 0;
    const label = badge > 0
      ? `${app.titulo} — ${badge} novo${badge > 1 ? "s" : ""}`
      : app.titulo;
    const ramos = RAMOS_POR_APP[app.slug] ?? [];
    const aberto = expandido === app.slug && ramos.length > 0;
    const offsets = LEQUE[Math.min(ramos.length, 3)] ?? [];

    return (
      <Reorder.Item
        key={app.slug}
        value={app.slug}
        as="div"
        className="dock-drag"
        drag={onReordenar ? "y" : false}
        whileDrag={{ scale: 1.14, zIndex: 30 }}
        onDragEnd={persistirOrdem}
      >
      <motion.div
        className="dock-item"
        variants={staggerItem}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ancorasRef.current[app.slug] = { x: r.right, y: r.top + r.height / 2 };
          setTipInfo({ slug: app.slug, titulo: app.titulo, x: r.right, y: r.top + r.height / 2 });
          abrirRamos(app.slug);
        }}
        onMouseLeave={() => {
          setTipInfo((atual) => (atual?.slug === app.slug ? null : atual));
          fecharRamos();
        }}
      >
        <motion.button
          className={`dock-btn ${ativo ? "is-active" : ""}`}
          onClick={() => onLaunch(app.slug)}
          aria-label={label}
          aria-pressed={ativo}
          whileHover={{ scale: 1.08, transition: { duration: 0.12, ease: easing.outExpo } }}
          whileTap={tapPress}
        >
          <span className="borda-neon" aria-hidden="true">
            <span /><span /><span /><span />
          </span>
          <IconeDock nome={app.icone} />
          {badge > 0 && (
            <motion.span
              key={`badge-${badge}`}
              className="dock-badge"
              aria-live="polite"
              aria-atomic="true"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={transBadge}
            >
              {badge > 9 ? "9+" : badge}
            </motion.span>
          )}
        </motion.button>

        <AnimatePresence>
          {aberto && createPortal(
            <div
              className="dock-ramos dock-ramos--portal"
              role="menu"
              aria-label={`Atalhos de ${app.titulo}`}
              style={{
                left: ancorasRef.current[app.slug]?.x ?? 0,
                top: ancorasRef.current[app.slug]?.y ?? 0,
              }}
            >
              {/* Linhas curvas ligando o ícone a cada ramo (desenham suave). */}
              {/* viewBox 1:1 com o CSS (120×168) — sem esticar, a linha encosta
                  exatamente no MEIO DA LATERAL esquerda de cada pílula (x=66,
                  y = centro da pílula). Cores seguem o tema ativo. */}
              <svg className="dock-ramos-linhas" aria-hidden="true" viewBox="0 0 120 168">
                {ramos.slice(0, 3).map((r, i) => {
                  const y = 84 + offsets[i];
                  return (
                    <motion.path
                      key={r.destino}
                      d={`M 1 84 C ${RAMO_X * 0.4} 84, ${RAMO_X * 0.6} ${y}, ${RAMO_X} ${y}`}
                      fill="none"
                      stroke="url(#dockRamoGrad)"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.7 }}
                      exit={{ pathLength: 0, opacity: 0 }}
                      transition={{ duration: 0.34, delay: i * 0.05, ease: easing.outExpo }}
                    />
                  );
                })}
                <defs>
                  <linearGradient id="dockRamoGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" style={{ stopColor: "var(--os-acento-1)", stopOpacity: 0.2 }} />
                    <stop offset="100%" style={{ stopColor: "var(--os-acento-2)", stopOpacity: 0.7 }} />
                  </linearGradient>
                </defs>
              </svg>

              {ramos.slice(0, 3).map((r, i) => (
                <motion.button
                  key={r.destino}
                  role="menuitem"
                  className="dock-ramo"
                  style={{ top: `calc(50% + ${offsets[i]}px)` }}
                  onClick={() => {
                    if (r.aba) irParaAba(r.destino, r.aba, onLaunch);
                    else onLaunch(r.destino);
                    setExpandido(null);
                  }}
                  // y:"-50%" vive AQUI (não no CSS): o framer é dono do transform e
                  // sobrescreveria o translateY(-50%) — a pílula caía 14px abaixo do
                  // fio (bug visto na régua 2026-07-12). Centro cravado no meio da lateral.
                  initial={{ opacity: 0, x: -10, y: "-50%", scale: 0.85 }}
                  animate={{ opacity: 1, x: 0, y: "-50%", scale: 1 }}
                  exit={{ opacity: 0, x: -8, y: "-50%", scale: 0.85 }}
                  transition={{ duration: 0.28, delay: 0.06 + i * 0.05, ease: easing.outExpo }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={tapPress}
                >
                  <IconeDock nome={r.icone} />
                  <span>{r.rotulo}</span>
                </motion.button>
              ))}
            </div>,
            document.body,
          )}
        </AnimatePresence>
      </motion.div>
      </Reorder.Item>
    );
  };

  return (
    <motion.nav
      className={`dock ${open ? "is-open" : ""}`}
      role="toolbar"
      aria-label="Aplicativos fixados"
      aria-orientation="vertical"
      variants={stagger(0.05, 0.03)}
      initial="hidden"
      // Entrada amarrada ao `open` (2026-08-19): rodar o stagger no mount, com o
      // dock fechado, congelava os ícones em opacity 0 quando a aba perdia o
      // rAF — tubo "vazio". Abrindo é que anima: usuário olhando, animação viva.
      animate={open ? "visible" : "hidden"}
    >
      {/* Pílula visual dentro do container rolável — o .dock rola invisível
          quando os apps fixados excedem a altura da tela (2026-08-19). */}
      <Reorder.Group
        as="div"
        axis="y"
        values={ordemVisual}
        onReorder={(v) => setOrdemDrag(v as string[])}
        layoutScroll
        className="dock-pilula"
      >
        {appsOrdenados.map(renderItem)}
      </Reorder.Group>
      <AnimatePresence>
        {tipInfo && expandido !== tipInfo.slug && createPortal(
          <motion.span
            key={tipInfo.slug}
            className="dock-tip dock-tip--portal"
            aria-hidden="true"
            style={{ left: tipInfo.x + 14, top: tipInfo.y }}
            initial={{ opacity: 0, x: -6, y: "-50%", scale: 0.96 }}
            animate={{ opacity: 1, x: 0, y: "-50%", scale: 1 }}
            exit={{ opacity: 0, x: -6, y: "-50%", scale: 0.96 }}
            transition={{ duration: 0.18, ease: easing.outExpo }}
          >
            {tipInfo.titulo}
          </motion.span>,
          document.body,
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/**
 * Wrapper sobre window.Icon (do bundle) com fallback discreto.
 * Quando icons.jsx virar módulo próprio, substituir por import direto.
 */
function IconeDock({ nome }: { nome: string }) {
  const IconBundle =
    typeof window !== "undefined"
      ? (window as unknown as { Icon?: React.ComponentType<{ name: string; size: number; sw?: number }> })
          .Icon
      : undefined;
  // sw 2.25 = traço grosso arredondado do pack de referência (Theus 2026-08-11).
  if (IconBundle) return <IconBundle name={nome} size={20} sw={2.25} />;
  // Fallback minimal: símbolo geométrico até bundle injetar Icon
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
