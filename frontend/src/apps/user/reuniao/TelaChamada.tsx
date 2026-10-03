/**
 * TelaChamada — UI da videochamada WebRTC, estilo Google Meet.
 *
 * Monta a lista de tiles (câmeras + telas compartilhadas como tile próprio),
 * com destaque fixável: clicar num tile fixa ele grande e os demais viram
 * faixa de miniaturas. Tela compartilhada entra em destaque automaticamente.
 * Barra inferior em BarraControles.
 */

import { useMemo, useState } from "react";
import type { EstadoWebRTC } from "./use-livekit";
import type { DadosTile } from "./CelulaVideo";
import { EstiloReuniao, cor } from "./reuniao-ui";
import CelulaVideo from "./CelulaVideo";
import BarraControles from "./BarraControles";
import { useBreakpoint } from "@/hooks/use-breakpoint";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Props = {
  estado: EstadoWebRTC;
  meuNome: string;
  ehAnfitriao: boolean;
  /** Eu sou do time do tenant (logado) — meu tile ganha borda da marca. */
  meuDoTime?: boolean;
  tituloSala?: string;
  alternarMicrofone: () => void;
  alternarCamera: () => void;
  alternarTela: () => Promise<void>;
  alternarMao: () => void;
  alternarMesmoAmbiente: () => void;
  aoSair: () => void;
  aoEncerrar?: () => void;
  aoCopiarLink?: () => void;
  aoSilenciarPeer?: (peerId: string) => void;
  /** Anfitrião: abre o menu de recursos da call (contrato etc.). */
  aoAbrirRecursos?: () => void;
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TelaChamada({
  estado,
  meuNome,
  ehAnfitriao,
  meuDoTime,
  tituloSala,
  alternarMicrofone,
  alternarCamera,
  alternarTela,
  alternarMao,
  alternarMesmoAmbiente,
  aoSair,
  aoEncerrar,
  aoCopiarLink,
  aoSilenciarPeer,
  aoAbrirRecursos,
}: Props) {
  const { isMobile: ehMobile } = useBreakpoint();
  const [fixadoManual, setFixadoManual] = useState<string | null>(null);

  // ─ Lista única de tiles (câmera local, minha tela, remotos) ─
  const tiles = useMemo<DadosTile[]>(() => {
    const lista: DadosTile[] = [
      {
        chave: "local",
        stream: estado.streamLocal,
        nome: `${meuNome} (você)`,
        ehLocal: true,
        ehTela: false,
        espelhado: true,
        semVideo: estado.semVideo,
        micMudo: estado.mutado,
        maoLevantada: estado.minhaMaoLevantada,
        doTime: meuDoTime ?? false,
      },
    ];
    if (estado.streamTelaLocal) {
      lista.push({
        chave: "local-tela",
        stream: estado.streamTelaLocal,
        nome: "Sua tela",
        ehLocal: true,
        ehTela: true,
        espelhado: false,
        semVideo: false,
        micMudo: false,
        maoLevantada: false,
      });
    }
    for (const r of estado.streamRemotos) {
      lista.push({
        chave: `${r.peerId}:${r.ehTela ? "tela" : "cam"}`,
        stream: r.stream,
        nome: r.ehTela ? `Tela de ${r.nome}` : r.nome,
        ehLocal: false,
        ehTela: r.ehTela,
        espelhado: false,
        semVideo: r.semVideo,
        micMudo: r.micMudo,
        maoLevantada: r.ehTela ? false : r.maoLevantada,
        doTime: r.doTime,
        peerId: r.peerId,
      });
    }
    return lista;
  }, [estado, meuNome]);

  // ─ Destaque: pin manual vence; senão tela compartilhada (remota primeiro) ─
  const chaveDestaque = useMemo(() => {
    if (fixadoManual && tiles.some((t) => t.chave === fixadoManual)) return fixadoManual;
    const telaRemota = tiles.find((t) => t.ehTela && !t.ehLocal);
    if (telaRemota) return telaRemota.chave;
    const telaLocal = tiles.find((t) => t.ehTela && t.ehLocal);
    if (telaLocal) return telaLocal.chave;
    return null;
  }, [fixadoManual, tiles]);

  function alternarFixado(chave: string) {
    setFixadoManual((atual) => (atual === chave ? null : chave));
  }

  const tileDestaque = tiles.find((t) => t.chave === chaveDestaque) ?? null;
  const miniaturas = tileDestaque ? tiles.filter((t) => t.chave !== tileDestaque.chave) : tiles;

  const colunas = ehMobile
    ? tiles.length <= 2
      ? 1
      : 2
    : tiles.length === 1
      ? 1
      : tiles.length === 2
        ? 2
        : Math.ceil(Math.sqrt(tiles.length));

  function silenciar(peerId: string) {
    aoSilenciarPeer?.(peerId);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: cor.fundoChamada,
        overflow: "hidden",
      }}
    >
      <EstiloReuniao />

      {tileDestaque ? (
        // ─ Layout destaque + faixa de miniaturas ─
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: ehMobile ? 8 : 16,
            minHeight: 0,
            boxSizing: "border-box",
          }}
        >
          <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
            <div style={{ width: "100%", maxWidth: 1280, display: "flex" }}>
              <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
                <CelulaVideo
                  tile={tileDestaque}
                  fixado={fixadoManual === tileDestaque.chave}
                  audioMudo={estado.mesmoAmbiente}
                  onFixar={alternarFixado}
                  onSilenciar={ehAnfitriao && aoSilenciarPeer ? silenciar : undefined}
                />
              </div>
            </div>
          </div>
          {miniaturas.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 2,
                flexShrink: 0,
              }}
            >
              {miniaturas.map((tile) => (
                <div key={tile.chave} style={{ width: ehMobile ? 128 : 176, flexShrink: 0 }}>
                  <CelulaVideo
                    tile={tile}
                    fixado={false}
                    compacto
                    audioMudo={estado.mesmoAmbiente}
                    onFixar={alternarFixado}
                    onSilenciar={ehAnfitriao && aoSilenciarPeer ? silenciar : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ─ Grade uniforme ─
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${colunas}, 1fr)`,
            gap: ehMobile ? 8 : 12,
            padding: ehMobile ? 8 : 16,
            overflowY: "auto",
            alignContent: tiles.length <= 2 ? "center" : "start",
            justifyContent: "center",
            maxWidth: tiles.length === 1 ? 960 : undefined,
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          {tiles.map((tile) => (
            <CelulaVideo
              key={tile.chave}
              tile={tile}
              fixado={false}
              audioMudo={estado.mesmoAmbiente}
              onFixar={alternarFixado}
              onSilenciar={ehAnfitriao && aoSilenciarPeer ? silenciar : undefined}
            />
          ))}
        </div>
      )}

      <BarraControles
        mutado={estado.mutado}
        semVideo={estado.semVideo}
        compartilhandoTela={estado.compartilhandoTela}
        maoLevantada={estado.minhaMaoLevantada}
        mesmoAmbiente={estado.mesmoAmbiente}
        ehMobile={ehMobile}
        tituloSala={tituloSala}
        totalParticipantes={1 + new Set(estado.streamRemotos.map((r) => r.peerId)).size}
        onMicrofone={alternarMicrofone}
        onCamera={alternarCamera}
        onTela={() => void alternarTela()}
        onMao={alternarMao}
        onMesmoAmbiente={alternarMesmoAmbiente}
        onSair={aoSair}
        onEncerrar={ehAnfitriao ? aoEncerrar : undefined}
        onCopiarLink={aoCopiarLink}
        onRecursos={ehAnfitriao ? aoAbrirRecursos : undefined}
      />
    </div>
  );
}
