/**
 * CenaEscritorio v2 — planta 2D extrudada com FÍSICA (rapier), mobiliário
 * detalhado e atendimento AO VIVO (funcionários digitando + leads reais).
 *
 * Colisão: piso/paredes/mesas/sofás/estantes são corpos FIXOS; lixeiras,
 * caixas e cadeiras avulsas são DINÂMICOS — o jogador esbarra e elas reagem.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { COLUNAS, LINHAS, ESTACOES, DECORACOES, PORTA, corDoChao } from "../canvas/MapaEmpresa";
import { ROTULO_CARGO } from "../config/configMaquete";
import type { ConversaMaquete } from "../dados/useConversasMaquete";
import {
  CabineCallCenter, CadeiraGiratoria, SofaDetalhado, PlantaDetalhada,
  EstanteLivros, Luminaria, RelogioParede, COR_MADEIRA_ESCURA,
} from "./mobiliario";
import { Funcionario, LeadVivo, distribuirLeads } from "./personagens";

const ALTURA_PAREDE = 3;

/** Tecido das divisórias por cargo — mesmos tons das cabines do 2D. */
const COR_TECIDO_CABINE: Record<ConversaMaquete["cargoTipologia"], string> = {
  atendimento: "#4f86ad",
  vendedor: "#b39247",
  financeiro: "#559a70",
  suporte: "#7a6bb8",
  mentor: "#ab5a72",
};
const ESPESSURA = 0.25;

function Piso() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    const cor = new THREE.Color();
    let i = 0;
    for (let col = 0; col < COLUNAS; col++) {
      for (let lin = 0; lin < LINHAS; lin++) {
        mat.setPosition(col + 0.5, 0, lin + 0.5);
        m.setMatrixAt(i, mat);
        m.setColorAt(i, cor.setHex(corDoChao(col, lin)));
        i++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[COLUNAS / 2, 0.05, LINHAS / 2]} position={[COLUNAS / 2, -0.01, LINHAS / 2]} />
      <instancedMesh ref={ref} args={[undefined, undefined, COLUNAS * LINHAS]} receiveShadow>
        <boxGeometry args={[1, 0.08, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </RigidBody>
  );
}

function Parede({ x, z, largura, profundidade }: { x: number; z: number; largura: number; profundidade: number }) {
  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position={[x, ALTURA_PAREDE / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[largura, ALTURA_PAREDE, profundidade]} />
        <meshStandardMaterial color="#8a7b68" roughness={0.85} />
      </mesh>
    </RigidBody>
  );
}

function Paredes() {
  const vaoIni = PORTA.y - 1;
  const vaoFim = PORTA.y + 2;
  return (
    <group>
      <Parede x={COLUNAS / 2} z={-ESPESSURA / 2} largura={COLUNAS + ESPESSURA * 2} profundidade={ESPESSURA} />
      <Parede x={COLUNAS / 2} z={LINHAS + ESPESSURA / 2} largura={COLUNAS + ESPESSURA * 2} profundidade={ESPESSURA} />
      <Parede x={COLUNAS + ESPESSURA / 2} z={LINHAS / 2} largura={ESPESSURA} profundidade={LINHAS} />
      <Parede x={-ESPESSURA / 2} z={vaoIni / 2} largura={ESPESSURA} profundidade={vaoIni} />
      <Parede x={-ESPESSURA / 2} z={(vaoFim + LINHAS) / 2} largura={ESPESSURA} profundidade={LINHAS - vaoFim} />
    </group>
  );
}

function Teto() {
  const luminarias: Array<[number, number, number]> = [
    [7, 3, 4.5], [20, 3, 4.5], [33, 3, 4.5],
    [7, 3, 12.5], [17, 3, 13], [27, 3, 12],
    [7, 3, 19], [20, 3, 19], [33, 3, 19],
  ];
  return (
    <group>
      <mesh position={[COLUNAS / 2, ALTURA_PAREDE + 0.04, LINHAS / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[COLUNAS, LINHAS]} />
        <meshStandardMaterial color="#332c40" roughness={0.95} />
      </mesh>
      {luminarias.map((p, i) => <Luminaria key={i} posicao={p} />)}
    </group>
  );
}

function ParedeNorteDecorada() {
  return (
    <group>
      {/* whiteboard com rabiscos */}
      <group position={[11.5, 1.7, 0.16]}>
        <mesh><boxGeometry args={[1.8, 1.1, 0.05]} /><meshStandardMaterial color="#f2efe8" roughness={0.4} /></mesh>
        {[[-0.5, 0.25, 0.9], [-0.2, 0.05, 0.6], [0.3, -0.15, 1.0]].map(([x, y, w], i) => (
          <mesh key={i} position={[x, y, 0.03]}>
            <planeGeometry args={[w, 0.03]} />
            <meshStandardMaterial color={i === 1 ? "#b8503c" : "#2b4a8a"} />
          </mesh>
        ))}
      </group>
      <RelogioParede posicao={[17.5, 2.1, 0.14]} />
      {/* quadros */}
      {([[24.8, "#3c6bb8"], [26.2, "#b8863c"], [31.5, "#5c8a4a"]] as const).map(([x, cor], i) => (
        <group key={i} position={[x, 1.8, 0.15]}>
          <mesh><boxGeometry args={[0.86, 1.06, 0.04]} /><meshStandardMaterial color={COR_MADEIRA_ESCURA} /></mesh>
          <mesh position={[0, 0, 0.025]}><planeGeometry args={[0.7, 0.9]} /><meshStandardMaterial color={cor} roughness={0.7} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Objetos soltos com física DINÂMICA — dá pra chutar/empurrar. */
function ObjetosDinamicos() {
  const caixas: Array<[number, number]> = [[24.5, 8.5], [25.2, 8.9], [5.5, 20.5]];
  const lixeiras: Array<[number, number]> = [[7, 13.5], [12.5, 5.2], [30.5, 19.5]];
  const cadeirasSoltas: Array<[number, number]> = [[23, 14.5], [11, 15.5]];
  // Spawn sempre ACIMA do chão (intersecção no nascimento = rapier expulsa com
  // impulso e o objeto voa — era o "escritório explodido" do print) + damping
  // pra parar de deslizar rápido.
  return (
    <group>
      {caixas.map(([x, z], i) => (
        <RigidBody key={`cx-${i}`} colliders="cuboid" position={[x, 0.35, z]} mass={2} linearDamping={0.6} angularDamping={0.8}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.4, 0.45]} />
            <meshStandardMaterial color="#a3814f" roughness={0.9} />
          </mesh>
        </RigidBody>
      ))}
      {lixeiras.map(([x, z], i) => (
        <RigidBody key={`lx-${i}`} colliders={false} position={[x, 0.36, z]} mass={1} linearDamping={0.6} angularDamping={0.8}>
          <CuboidCollider args={[0.17, 0.25, 0.17]} />
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.15, 0.5, 12]} />
            <meshStandardMaterial color="#4a4f57" roughness={0.6} metalness={0.3} />
          </mesh>
        </RigidBody>
      ))}
      {cadeirasSoltas.map(([x, z], i) => (
        <RigidBody key={`cd-${i}`} colliders={false} position={[x, 0.06, z]} mass={4} linearDamping={0.7} angularDamping={0.9}>
          {/* collider só do volume assento+encosto — hull do grupo inteiro girava torto */}
          <CuboidCollider args={[0.25, 0.42, 0.25]} position={[0, 0.44, 0]} />
          <CadeiraGiratoria rotacaoY={i * 1.4} />
        </RigidBody>
      ))}
    </group>
  );
}

/** Sofás e mobília da planta 2D, agora detalhados e com colisão fixa. */
function Mobilia() {
  return (
    <group>
      {DECORACOES.map((d, i) => {
        const w = d.w ?? 1;
        const x = d.x + w / 2;
        const z = d.y + (d.h ?? 1) / 2;
        switch (d.textura) {
          case "sofaFront":
            return (
              <RigidBody key={i} type="fixed" colliders={false} position={[x, 0, z]}>
                <CuboidCollider args={[w, 0.45, 0.5]} position={[0, 0.45, 0]} />
                <SofaDetalhado largura={w} />
              </RigidBody>
            );
          case "largePlant":
          case "hangingPlant":
            return (
              <RigidBody key={i} type="fixed" colliders={false} position={[x, 0, z]}>
                <CuboidCollider args={[0.24, 0.6, 0.24]} position={[0, 0.6, 0]} />
                <PlantaDetalhada />
              </RigidBody>
            );
          case "doubleBookshelf":
            return (
              <RigidBody key={i} type="fixed" colliders={false} position={[x + 0.3, 0, z]}>
                <CuboidCollider args={[w * 0.8, 1.05, 0.2]} position={[0, 1.05, 0]} />
                <EstanteLivros largura={w * 1.6} />
              </RigidBody>
            );
          case "coffeeTable":
            return (
              <RigidBody key={i} type="fixed" colliders={false} position={[x, 0, z]}>
                <CuboidCollider args={[0.45, 0.25, 0.45]} position={[0, 0.25, 0]} />
                <mesh castShadow position={[0, 0.22, 0]}>
                  <cylinderGeometry args={[0.42, 0.46, 0.44, 10]} />
                  <meshStandardMaterial color="#6e5237" roughness={0.8} />
                </mesh>
              </RigidBody>
            );
          default:
            return null;
        }
      })}
      {/* tapete da espera */}
      <mesh position={[17, 0.045, 13.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.2, 28]} />
        <meshStandardMaterial color="#5f4a3a" roughness={1} />
      </mesh>
    </group>
  );
}

/** Assentos da espera pros leads excedentes (em cima dos sofás centrais). */
const ASSENTOS_ESPERA: Array<[number, number, number]> = [
  [15, 0, 12.55], [17, 0, 12.55], [19, 0, 12.55],
  [14.4, 0, 15.4], [19.6, 0, 15.4],
];
/** Os 3 primeiros assentos são sofá (sentado); os 2 últimos, em pé na espera. */
const ASSENTO_SENTADO = [true, true, true, false, false];

export interface CenaEscritorioProps {
  conversas: ConversaMaquete[];
  agoraMs: number;
}

export function CenaEscritorio({ conversas, agoraMs }: CenaEscritorioProps) {
  const { porCargo } = useMemo(() => distribuirLeads(conversas, agoraMs), [conversas, agoraMs]);
  // Índice da estação DENTRO do cargo (2ª mesa de atendimento = índice 1 etc.)
  const indicePorEstacao = useMemo(() => {
    const cont: Record<string, number> = {};
    return ESTACOES.map((e) => {
      const idx = cont[e.cargo] ?? 0;
      cont[e.cargo] = idx + 1;
      return idx;
    });
  }, []);
  const excedentes = useMemo(() => {
    const capacidade: Record<string, number> = {};
    for (const [i, e] of ESTACOES.entries()) {
      void i;
      capacidade[e.cargo] = (capacidade[e.cargo] ?? 0) + 1;
    }
    const fora: ConversaMaquete[] = [];
    (Object.keys(porCargo) as Array<keyof typeof porCargo>).forEach((cargo) => {
      fora.push(...porCargo[cargo].slice(capacidade[cargo] ?? 0));
    });
    return fora.slice(0, ASSENTOS_ESPERA.length);
  }, [porCargo]);

  return (
    <group>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#cbd8ff", "#3a2f22", 0.5]} />
      <directionalLight position={[18, 22, 8]} intensity={0.75} castShadow shadow-mapSize={[1024, 1024]} />
      <Piso />
      <Paredes />
      <Teto />
      <ParedeNorteDecorada />
      {ESTACOES.map((e, i) => {
        // Cabine = mesma pegada do 2D: X e.x..e.x+3, Z e.y-1..e.y+1.
        // Atendente em (e.x+1.5, e.y-0.45) olhando pra +Z (monitor/bancada).
        const ox = e.x;
        const oz = e.y - 1;
        const fila = porCargo[e.cargo];
        const leadDaMesa = fila[indicePorEstacao[i]];
        return (
          <group key={e.id}>
            <RigidBody type="fixed" colliders={false} position={[ox, 0, oz]}>
              {/* bancada + divisórias (frente e laterais); fundo aberto */}
              <CuboidCollider args={[1.45, 0.4, 0.47]} position={[1.5, 0.4, 1.47]} />
              <CuboidCollider args={[1.5, 0.63, 0.04]} position={[1.5, 0.63, 1.97]} />
              <CuboidCollider args={[0.04, 0.63, 1]} position={[0.03, 0.63, 1]} />
              <CuboidCollider args={[0.04, 0.63, 1]} position={[2.97, 0.63, 1]} />
              <CabineCallCenter corTecido={COR_TECIDO_CABINE[e.cargo]} emLigacao={!!leadDaMesa} />
            </RigidBody>
            <group position={[ox + 1.5, 0, oz + 0.5]}>
              <CadeiraGiratoria rotacaoY={Math.PI} />
            </group>
            <Funcionario
              posicao={[ox + 1.5, 0, oz + 0.58]}
              cargo={e.cargo}
              rotulo={ROTULO_CARGO[e.cargo]}
              atendendo={!!leadDaMesa}
              leadNaLinha={leadDaMesa?.leadNome}
              quantidadeFila={fila.length}
            />
          </group>
        );
      })}
      {excedentes.map((c, i) => (
        <LeadVivo key={c.id} posicao={ASSENTOS_ESPERA[i]} nome={c.leadNome} sentado={ASSENTO_SENTADO[i]} rotacaoY={ASSENTO_SENTADO[i] ? 0 : 0.6 * (i - 3)} />
      ))}
      <Mobilia />
      <ObjetosDinamicos />
    </group>
  );
}
