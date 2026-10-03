// @ts-nocheck
/**
 * Curadoria — App fullscreen do admin.
 *
 * Visual alinhado ao LLM-OS da Plataforma:
 *  - SEM shell próprio (ChromeMacOS/Header/Sidebar/StatusBar deletados)
 *  - Chrome da janela vem do Janela.tsx do OS (já tem pílula traffic-light no meio)
 *  - Layout: topbar interno (48px) + área principal (chat resizable + conteúdo)
 *
 * Atalhos:
 *   - ⌘K / "/"   abre command palette
 *   - ⌘1..⌘9    troca aba (operacao)
 *   - Esc        fecha palette
 */

import { useEffect, useState } from "react";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { ABAS, ABA_PADRAO } from "./dados/abas";
import { TENANT_UNIVERSO, type AbaId, type TenantImpersonado } from "./dados/tipos";
import { useTenantsImpersonaveis } from "./dados/use-tenants-impersonaveis";
import { useAvisos } from "./dados/use-avisos";
import { ResolverAba } from "./abas/registry";
import { ContextoCuradoria } from "./dados/contexto-curadoria";
import { ChatCuradoria } from "./chat/ChatCuradoria";
import { useLarguraChat, LARGURA_COLAPSADO } from "./chat/dados/use-largura-chat";
import { CommandPalette } from "./componentes/command-palette";
import { TopbarCuradoria, BannerImpersonacao } from "./componentes/topbar-curadoria";

// ─── hook de atalhos globais ──────────────────────────────────────────────────

function useAtalhosGlobais(opts: {
  onPaleta: () => void;
  onFechaPaleta: () => void;
  onAba: (n: number) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const ehInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement | null)?.tagName ?? "",
      );
      if (meta && e.key === "k") {
        e.preventDefault();
        opts.onPaleta();
        return;
      }
      if (meta && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        opts.onAba(parseInt(e.key, 10) - 1);
        return;
      }
      if (e.key === "/" && !ehInput) {
        e.preventDefault();
        opts.onPaleta();
        return;
      }
      if (e.key === "Escape") opts.onFechaPaleta();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts]);
}

// ─── App principal ────────────────────────────────────────────────────────────

interface CuradoriaAppProps {
  onFechar?: () => void;
  onMinimizar?: () => void;
}

function CuradoriaApp({ onFechar: _onFechar, onMinimizar: _onMinimizar }: CuradoriaAppProps) {
  // Persiste aba selecionada em localStorage
  const [abaId, setAbaIdState] = useState<AbaId>(() => {
    try {
      const salva = localStorage.getItem("curadoria.aba.atual") as AbaId | null;
      if (salva && ABAS.find((a) => a.id === salva)) return salva;
    } catch {
      // localStorage indisponível
    }
    return ABA_PADRAO;
  });

  function setAbaId(id: AbaId) {
    setAbaIdState(id);
    try {
      localStorage.setItem("curadoria.aba.atual", id);
    } catch {
      // ignora
    }
  }

  useAbaAlvo("curadoria", (v) => setAbaId(v as AbaId));

  const [tenantImpersonado, setTenantImpersonado] = useState<TenantImpersonado>(TENANT_UNIVERSO);
  const [paletaAberta, setPaletaAberta] = useState(false);

  const { largura, colapsado, setLargura, alternarColapsado } = useLarguraChat();
  const { tenants: tenantsLive } = useTenantsImpersonaveis();
  const { avisos } = useAvisos({ realtime: true });

  const tenants: TenantImpersonado[] = tenantsLive.map((t) => ({
    id: t.id,
    nome: t.nome,
    nicho: t.nicho_nome,
    nicho_id: t.nicho_id,
    leads: t.leads,
    ambiente: "prod" as const,
  }));

  useAtalhosGlobais({
    onPaleta: () => setPaletaAberta(true),
    onFechaPaleta: () => setPaletaAberta(false),
    onAba: (idx) => {
      const operacao = ABAS.filter((a) => a.secao === "operacao");
      const alvo = operacao[idx];
      if (alvo) setAbaId(alvo.id);
    },
  });

  const ehUniverso = tenantImpersonado.id === TENANT_UNIVERSO.id;
  const avisosNaoLidos = avisos.filter((a) => !a.lido_em && !a.arquivado_em).length;
  const larguraChat = colapsado ? LARGURA_COLAPSADO : largura;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "var(--os-fundo-1)",
        overflow: "hidden",
      }}
    >
      {/* Banner de impersonação (só quando impersonando) */}
      {!ehUniverso && (
        <BannerImpersonacao
          tenant={tenantImpersonado}
          onSair={() => setTenantImpersonado(TENANT_UNIVERSO)}
        />
      )}

      {/* Topbar interno */}
      <TopbarCuradoria
        abaId={abaId}
        onAba={setAbaId}
        onPaleta={() => setPaletaAberta(true)}
        tenantImpersonado={tenantImpersonado}
        onTenant={setTenantImpersonado}
        avisosNaoLidos={avisosNaoLidos}
        tenants={tenants}
      />

      {/* Área principal: chat + conteúdo */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Wrapper animado da largura do chat */}
        <div
          style={{
            width: larguraChat,
            height: "100%",
            flexShrink: 0,
            transition: "width 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <ChatCuradoria
            abaAtivaId={abaId}
            tenantImpersonado={tenantImpersonado}
            largura={largura}
            colapsado={colapsado}
            onLarguraChange={setLargura}
            onAlternarColapsado={alternarColapsado}
          />
        </div>

        {/* Conteúdo da aba */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <ContextoCuradoria.Provider value={{ tenantImpersonado }}>
            <ResolverAba abaId={abaId} />
          </ContextoCuradoria.Provider>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        aberto={paletaAberta}
        onClose={() => setPaletaAberta(false)}
        onAba={(id) => {
          setAbaId(id);
          setPaletaAberta(false);
        }}
      />
    </div>
  );
}

export function AppCuradoria(props: CuradoriaAppProps = {}) {
  return <CuradoriaApp {...props} />;
}

export default AppCuradoria;
