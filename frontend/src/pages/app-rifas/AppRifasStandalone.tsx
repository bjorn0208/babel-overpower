/**
 * Rifas fora do OS — rota própria (/app/rifas), sem dock/janela/outros apps.
 * Abre direto no app Rifas em tela cheia, com manifest + service worker
 * PRÓPRIOS (escopo /app/rifas) pra dar pra instalar como app do celular
 * só com a Rifa dentro — pedido do Theus 2026-09-01.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { AppRifas } from "@/apps/user/rifas/Rifas";
import { Toaster } from "@/bundle/bundle-shared";

const MANIFEST_HREF = "/manifest-rifas.webmanifest";
const SW_PATH = "/sw-rifas.js";
const SW_SCOPE = "/app/rifas/";
const TEMA_COR = "#0b0b10";

function estaStandalone() {
  if (typeof window === "undefined") return false;
  const porMediaQuery = window.matchMedia?.("(display-mode: standalone)").matches;
  const porIosSafari = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!(porMediaQuery || porIosSafari);
}

// Injeta as tags de PWA (manifest/theme-color/apple-touch-icon) só enquanto
// esta página está montada — o resto da plataforma usa o manifest/ícone
// padrão do index.html, não pode herdar o da Rifa.
function usePwaTagsRifas() {
  useEffect(() => {
    const tags: HTMLElement[] = [];
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = MANIFEST_HREF;
    document.head.appendChild(manifest);
    tags.push(manifest);

    const themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = TEMA_COR;
    document.head.appendChild(themeColor);
    tags.push(themeColor);

    const appleTouchIcon = document.createElement("link");
    appleTouchIcon.rel = "apple-touch-icon";
    appleTouchIcon.href = "/icones-apps/rifas-192.png";
    document.head.appendChild(appleTouchIcon);
    tags.push(appleTouchIcon);

    const appleCapable = document.createElement("meta");
    appleCapable.name = "apple-mobile-web-app-capable";
    appleCapable.content = "yes";
    document.head.appendChild(appleCapable);
    tags.push(appleCapable);

    return () => tags.forEach((tag) => tag.remove());
  }, []);
}

function useServiceWorkerRifas() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE }).catch((erro) => {
      console.warn("[app-rifas] falha ao registrar service worker", erro);
    });
  }, []);
}

function useInstalarComoApp() {
  const [podeInstalar, setPodeInstalar] = useState(false);
  const [instalado, setInstalado] = useState(estaStandalone);
  const [promptEvento, setPromptEvento] = useState<Event | null>(null);

  useEffect(() => {
    const aoFicarInstalavel = (ev: Event) => {
      ev.preventDefault();
      setPromptEvento(ev);
      setPodeInstalar(true);
    };
    const aoInstalar = () => {
      setInstalado(true);
      setPodeInstalar(false);
    };
    window.addEventListener("beforeinstallprompt", aoFicarInstalavel);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoFicarInstalavel);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const instalar = useCallback(async () => {
    const ev = promptEvento as (Event & { prompt?: () => void; userChoice?: Promise<{ outcome: string }> }) | null;
    if (!ev?.prompt || !ev.userChoice) return false;
    ev.prompt();
    const resultado = await ev.userChoice;
    setPromptEvento(null);
    setPodeInstalar(false);
    return resultado.outcome === "accepted";
  }, [promptEvento]);

  return { podeInstalar, instalado, instalar };
}

function BarraInstalar() {
  const { podeInstalar, instalado, instalar } = useInstalarComoApp();
  const ehIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (instalado) return null;

  if (podeInstalar) {
    return (
      <button
        onClick={instalar}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", minHeight: 32,
          borderRadius: 999, border: "none", background: "#7c5cff", color: "#fff",
          fontSize: 13, fontWeight: 500, cursor: "pointer", boxShadow: "0 4px 14px rgba(124,92,255,0.35)",
        }}
      >
        ⬇️ Instalar app
      </button>
    );
  }

  if (ehIos) {
    return (
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
        Compartilhar → Adicionar à Tela de Início
      </span>
    );
  }

  return null;
}

export default function AppRifasStandalone() {
  const nav = useNavigate();
  const { session, carregando, sair } = useAuth();

  usePwaTagsRifas();
  useServiceWorkerRifas();

  useEffect(() => {
    if (!carregando && !session) nav("/login", { replace: true });
  }, [session, carregando, nav]);

  if (!session) return null;

  return (
    <Toaster>
      <div style={{ height: "100dvh", width: "100vw", display: "flex", flexDirection: "column", overflow: "hidden", background: TEMA_COR }}>
        {/* Faixa fina do PWA (Arena): mesma cor do fundo do app, só instalar + sair. */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 12px", background: TEMA_COR, flexShrink: 0,
            paddingTop: "max(4px, env(safe-area-inset-top))",
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Rifas</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BarraInstalar />
            <button
              onClick={() => sair().then(() => nav("/login", { replace: true }))}
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 12, cursor: "pointer", minHeight: 32, padding: "0 6px" }}
            >
              Sair
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AppRifas />
        </div>
      </div>
    </Toaster>
  );
}
