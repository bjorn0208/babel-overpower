/**
 * Hub Conhecimento — aba única do app Agente que funde Treinamento + Conhecimento.
 * O dono vê tudo que o agente sabe (9 gavetas de conteúdo), por escopo
 * (Universo/Nicho/Você), e mexe no que é dele: cria/edita/exclui o próprio
 * bloco e liga/desliga bloco de nicho herdado (Parte 1 do banco, 2026-06-03).
 *
 * Navegação: Mapa (grid de gavetas) → abre uma gaveta (lista + ações) → volta.
 */

import { useState } from "react";
import { toast } from "sonner";
import type { Gaveta } from "./gavetas";
import { useNichoId, useContagensMapa, type CtxHub } from "./use-hub-conhecimento";
import { MapaGavetas } from "./MapaGavetas";
import { GavetaAberta } from "./GavetaAberta";
import { CardPacotesExtras } from "../pacotes/CardPacotesExtras";
import { PacotesConhecimento } from "../pacotes/PacotesConhecimento";

const toastApi = {
  success: (m: string) => toast.success(m),
  error: (m: string) => toast.error(m),
};

export function HubConhecimento({ tenantId, agenteId }: { tenantId: string; agenteId: string | null }) {
  const ctx: CtxHub = { tenantId, agenteId };
  const nichoId = useNichoId(tenantId);
  const [nonce, setNonce] = useState(0);
  const { contagens, carregando } = useContagensMapa(ctx, nichoId, nonce);
  const [aberta, setAberta] = useState<Gaveta | null>(null);
  // Pacotes extras (upgrade ON/OFF de conhecimento) — tela própria, fora das gavetas.
  const [pacotesAberto, setPacotesAberto] = useState(false);

  const recarregarMapa = () => setNonce((n) => n + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pacotesAberto && (
        <PacotesConhecimento
          tenantId={tenantId}
          agenteId={agenteId}
          toast={toastApi}
          onVoltar={() => {
            setPacotesAberto(false);
            recarregarMapa();
          }}
        />
      )}

      {!aberta && !pacotesAberto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
            Conhecimento do agente
          </span>
          <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", lineHeight: 1.5 }}>
            Tudo que o agente sabe, em gavetas. O que vem do{" "}
            <strong style={{ color: "oklch(0.68 0.14 290)" }}>Universo</strong> é fixo; o do{" "}
            <strong style={{ color: "oklch(0.70 0.16 235)" }}>Nicho</strong> você pode desligar; o{" "}
            <strong style={{ color: "oklch(0.72 0.16 155)" }}>Você</strong> é seu pra criar e editar.
          </span>
        </div>
      )}

      {pacotesAberto ? null : aberta ? (
        <GavetaAberta
          gaveta={aberta}
          ctx={ctx}
          nichoId={nichoId}
          toast={toastApi}
          onVoltar={() => {
            setAberta(null);
            recarregarMapa();
          }}
          aoMudar={recarregarMapa}
        />
      ) : (
        <>
          <CardPacotesExtras tenantId={tenantId} agenteId={agenteId} nonce={nonce} onAbrir={() => setPacotesAberto(true)} />
          <MapaGavetas contagens={contagens} carregando={carregando} onAbrir={setAberta} />
        </>
      )}
    </div>
  );
}
