// Página principal — Mapa do Motor Vivo
// Rota: /mapa-motor (localhost, ferramenta interna de diagnóstico)
// C1: grafo navegável | C2: replay real de conversa | C3: lista ragentic-lab + gap

import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { GRAFO_MOTOR } from "./grafo-motor";
import { construirGrafoReactFlow, COR_CANAL } from "./layout";
import NoMotor from "./NoMotor";
import PainelNo from "./PainelNo";
import SeletorCanal from "./SeletorCanal";
import BarraReplay from "./BarraReplay";
import BarraTopo from "./BarraTopo";
import PainelPasso from "./PainelPasso";
import ListaPecasLab from "./ListaPecasLab";
import PainelLab from "./PainelLab";
import VisaoConstrucao from "./VisaoConstrucao";
import { usePlayReplay } from "./use-play-replay";
import type { FiltroCanal, ModoVista } from "./tipos";
import type { PecaLab } from "./tipos-lab";

// Registro de tipos de nó customizados (fora do componente para estabilidade de referência)
const TIPOS_NO = { noMotor: NoMotor };

function CanvasMotor() {
  const [filtro, setFiltro] = useState<FiltroCanal>("todos");
  const [noPainel, setNoPainel] = useState<string | null>(null);
  const [modoReplay, setModoReplay] = useState(false);
  const [modoVista, setModoVista] = useState<ModoVista>("grafo");
  const [pecaLabSelecionada, setPecaLabSelecionada] = useState<PecaLab | null>(null);

  const {
    replay,
    carregarConversa,
    play,
    pausar,
    passo,
    retroceder,
    reiniciar,
    mudarVelocidade,
    VELOCIDADES,
  } = usePlayReplay();

  // Reconstrói o grafo sempre que o filtro muda
  const { nodes: nosIniciais, edges: arestasIniciais } = useMemo(
    () => construirGrafoReactFlow(GRAFO_MOTOR.nodes, GRAFO_MOTOR.edges, filtro),
    [filtro]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(nosIniciais);
  const [edges, , onEdgesChange] = useEdgesState(arestasIniciais);

  // Quando filtro muda, recalcula e reseta os nós/edges
  const aoMudarFiltro = useCallback(
    (novoFiltro: FiltroCanal) => {
      setFiltro(novoFiltro);
      setNoPainel(null);
      const { nodes: novosNos } = construirGrafoReactFlow(
        GRAFO_MOTOR.nodes,
        GRAFO_MOTOR.edges,
        novoFiltro
      );
      setNodes(novosNos);
    },
    [setNodes]
  );

  // Seleciona vista (grafo · construção · lab) — reset de estado secundário
  const aoSelecionarVista = useCallback((proxima: ModoVista) => {
    setModoVista(proxima);
    setPecaLabSelecionada(null);
    setModoReplay(false);
    setNoPainel(null);
  }, []);

  // Clique em nó abre painel lateral (só fora do modo replay e no modo grafo)
  const aoClicarNo: NodeMouseHandler = useCallback(
    (_evt, node) => {
      if (!modoReplay && modoVista === "grafo") {
        setNoPainel((atual) => (atual === node.id ? null : node.id));
      }
    },
    [modoReplay, modoVista]
  );

  // Painel de detalhes do nó selecionado (modo exploração)
  const dadosPainel = useMemo(() => {
    if (!noPainel || modoReplay || modoVista !== "grafo") return null;
    const no = nodes.find((n) => n.id === noPainel);
    if (!no) return null;
    return no.data as {
      label: string;
      canal: "externo" | "interno" | "ambos";
      faz: string;
      ativa_proximo: string;
      fonte_dado_real: string;
      ref: string;
    };
  }, [noPainel, nodes, modoReplay, modoVista]);

  // Nós do passo ativo no replay
  const nosAtivosReplay = useMemo<Set<string>>(() => {
    if (!modoReplay) return new Set();
    const { passos, indiceAtual } = replay;
    if (indiceAtual < 0 || indiceAtual >= passos.length) return new Set();
    return new Set(passos[indiceAtual].nos_alvo);
  }, [modoReplay, replay]);

  // Passo ativo para o painel de passo
  const passoAtivo = useMemo(() => {
    if (!modoReplay) return null;
    const { passos, indiceAtual } = replay;
    if (indiceAtual < 0 || indiceAtual >= passos.length) return null;
    return passos[indiceAtual];
  }, [modoReplay, replay]);

  // Nós correspondentes da peça do lab selecionada (para destacar no grafo)
  const nosDestaqueLab = useMemo<Set<string>>(() => {
    if (modoVista !== "lab" || !pecaLabSelecionada) return new Set();
    return new Set(pecaLabSelecionada.nos_correspondentes);
  }, [modoVista, pecaLabSelecionada]);

  // Destaca nó: seleção manual (grafo), replay ativo, ou correspondente de peça do lab
  const nodesComSelecao = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: modoReplay
          ? nosAtivosReplay.has(n.id)
          : modoVista === "lab"
          ? nosDestaqueLab.has(n.id)
          : n.id === noPainel,
      })),
    [nodes, noPainel, modoReplay, nosAtivosReplay, modoVista, nosDestaqueLab]
  );

  // Edges com destaque no replay (percurso ativo)
  const edgesComDestaque = useMemo(() => {
    if (!modoReplay || nosAtivosReplay.size === 0) return edges;
    return edges.map((e) =>
      nosAtivosReplay.has(e.source) || nosAtivosReplay.has(e.target)
        ? {
            ...e,
            style: { ...e.style, stroke: "oklch(0.75 0.20 60)", strokeWidth: 2.5 },
            animated: true,
          }
        : e
    );
  }, [edges, modoReplay, nosAtivosReplay]);

  // Dimensões do painel lateral
  const painelGrafoAberto = modoVista === "grafo" && (modoReplay || noPainel !== null);
  const painelLabAberto = modoVista === "lab";
  const painelAberto = painelGrafoAberto || painelLabAberto;
  // Lab: lista (220) + detalhe (300) = 520; grafo: 300
  const larguraPainel = painelLabAberto ? 520 : 300;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "oklch(0.10 0.02 240)",
        color: "oklch(0.92 0.02 240)",
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Barra superior */}
      <BarraTopo
        geradoEm={GRAFO_MOTOR.meta.gerado_em}
        modoReplay={modoReplay}
        onToggleReplay={() => {
          setModoReplay((v) => !v);
          setNoPainel(null);
        }}
        modoVista={modoVista}
        onSelecionarVista={aoSelecionarVista}
      />

      {modoVista === "construcao" ? (
        <VisaoConstrucao />
      ) : (
        <>
      {/* Seletor de canal */}
      <SeletorCanal valor={filtro} aoMudar={aoMudarFiltro} totalNos={nodes.length} />

      {/* Painel de replay — só visível no modo replay + grafo */}
      {modoReplay && modoVista === "grafo" && (
        <BarraReplay
          replay={replay}
          velocidades={VELOCIDADES}
          onCarregar={carregarConversa}
          onPlay={play}
          onPausar={pausar}
          onPasso={passo}
          onRetroceder={retroceder}
          onReiniciar={reiniciar}
          onMudarVelocidade={mudarVelocidade}
        />
      )}

      {/* Área principal: canvas + painel */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Canvas ReactFlow — sempre renderizado */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            right: painelAberto ? larguraPainel : 0,
            // No modo lab sem correspondente selecionado, grafo fica opaco
            opacity: painelLabAberto && nosDestaqueLab.size === 0 ? 0.35 : 1,
            transition: "right 200ms ease-out, opacity 200ms ease-out",
          }}
        >
          <ReactFlow
            key={filtro}
            nodes={nodesComSelecao}
            edges={edgesComDestaque}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={aoClicarNo}
            nodeTypes={TIPOS_NO}
            defaultViewport={{ x: 60, y: 40, zoom: 0.65 }}
            minZoom={0.2}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
            style={{ background: "oklch(0.10 0.02 240)" }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="oklch(0.25 0.02 240)"
            />
            <Controls
              style={{
                background: "oklch(0.15 0.02 240)",
                border: "1px solid oklch(0.25 0.03 240)",
                borderRadius: 8,
              }}
            />
            <MiniMap
              style={{
                background: "oklch(0.15 0.02 240)",
                border: "1px solid oklch(0.25 0.03 240)",
                borderRadius: 8,
              }}
              nodeColor={(n) => {
                const canal = (n.data as { canal?: string })?.canal ?? "ambos";
                if (modoReplay && nosAtivosReplay.has(n.id)) {
                  return "oklch(0.75 0.20 60)";
                }
                if (modoVista === "lab" && nosDestaqueLab.has(n.id)) {
                  return "oklch(0.75 0.20 265)";
                }
                return COR_CANAL[canal] ?? "oklch(0.4 0.05 240)";
              }}
            />
          </ReactFlow>
        </div>

        {/* Painel lateral — modo GRAFO */}
        {modoVista === "grafo" && (
          modoReplay ? (
            <PainelPasso
              passo={passoAtivo}
              indice={replay.indiceAtual}
              total={replay.passos.length}
            />
          ) : (
            <PainelNo dados={dadosPainel} aoFechar={() => setNoPainel(null)} />
          )
        )}

        {/* Painel lateral — modo LAB */}
        {modoVista === "lab" && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: larguraPainel,
              display: "flex",
              borderLeft: "1px solid oklch(0.22 0.03 240)",
            }}
          >
            {/* Lista de peças (220px) */}
            <div
              style={{
                width: 220,
                borderRight: "1px solid oklch(0.20 0.03 240)",
                background: "oklch(0.12 0.02 240)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <ListaPecasLab
                pecaSelecionada={pecaLabSelecionada?.id ?? null}
                aoSelecionarPeca={setPecaLabSelecionada}
              />
            </div>

            {/* Detalhe da peça (300px) */}
            <div style={{ flex: 1, position: "relative" }}>
              <PainelLab
                peca={pecaLabSelecionada}
                aoFechar={() => setPecaLabSelecionada(null)}
              />
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

// Envolve em ReactFlowProvider (exigência da lib para hooks internos)
export default function MapaMotor() {
  return (
    <ReactFlowProvider>
      <CanvasMotor />
    </ReactFlowProvider>
  );
}
