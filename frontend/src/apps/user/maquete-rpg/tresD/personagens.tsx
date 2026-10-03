/**
 * Personagens da maquete 3D — avatares CHIBI cartoon (referência do Theus
 * 2026-08-19: atendente 3D com toon shading, cabeça grande, vestido de
 * revolução, olhos com brilho, 3 cortes de cabelo).
 *
 * Adaptação r3f: MeshToonMaterial + gradientMap de 3 bandas (equivale ao
 * shader de 3 tons da referência, sem shader custom). Funcionário senta na
 * cadeira da mesa; lead senta na cadeira de visita ou espera no sofá.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import type { CargoTipologia, ConversaMaquete } from "../dados/useConversasMaquete";

export const COR_CARGO: Record<CargoTipologia, string> = {
  atendimento: "#2FA0E8",
  vendedor: "#F2C14E",
  financeiro: "#3BB273",
  suporte: "#7B61FF",
  mentor: "#E8567C",
};

const PELES = ["#F7D7BA", "#EBB98C", "#CC8E5F", "#96603C", "#5F3C28"];
const CABELOS = ["#2A221F", "#6C4327", "#B5762F", "#EBC96C", "#8E4B8B", "#3E5C8A"];
const CORTE_POR_CARGO: Record<CargoTipologia, 0 | 1 | 2> = {
  atendimento: 1, vendedor: 0, financeiro: 2, suporte: 1, mentor: 2,
};

/** Conversa "quente" = mensagem nos últimos 5 minutos. */
export const JANELA_ATENDIMENTO_MS = 5 * 60_000;

/** Gradiente de 3 bandas — o "toon 3 tons" da referência, via MeshToonMaterial. */
const gradiente3 = (() => {
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

function toon(cor: string): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: cor, gradientMap: gradiente3 });
}

/** Semente estável a partir de string (nome do lead) pra variar pele/cabelo. */
function semente(txt: string): number {
  let h = 0;
  for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) >>> 0;
  return h;
}

/** Perfil do vestido da referência (escalado ~0.75 pro chibi da maquete). */
const PERFIL_VESTIDO: Array<[number, number]> = [
  [0.001, 0.31], [0.19, 0.32], [0.2, 0.35], [0.18, 0.45],
  [0.155, 0.54], [0.162, 0.63], [0.177, 0.73], [0.181, 0.82],
  [0.17, 0.9], [0.132, 0.95], [0.087, 0.98], [0.057, 0.99],
];

interface AvatarChibiProps {
  corRoupa: string;
  corPele: string;
  corCabelo: string;
  corte: 0 | 1 | 2;
  sentado?: boolean;
  digitando?: boolean;
  falando?: boolean;
  /** Headset de call center (tiara + conchas + microfone). */
  headset?: boolean;
}

/** Headset preso ao pivô da cabeça (acompanha o balanço). `hy` = centro da esfera. */
function Headset({ hy }: { hy: number }) {
  const haste = useMemo(() => {
    const a = new THREE.Vector3(-0.2, hy - 0.04, 0.03);
    const b = new THREE.Vector3(-0.07, hy - 0.11, 0.17);
    const dir = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { meio: a.clone().add(b).multiplyScalar(0.5), q, comp: dir.length(), ponta: b };
  }, [hy]);
  return (
    <group>
      <mesh position={[0, hy, 0]}>
        <torusGeometry args={[0.228, 0.016, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#1b1c20" roughness={0.45} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[0.214 * s, hy, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.058, 0.058, 0.045, 16]} />
          <meshStandardMaterial color="#26282d" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={haste.meio} quaternion={haste.q}>
        <cylinderGeometry args={[0.008, 0.008, haste.comp, 6]} />
        <meshStandardMaterial color="#1b1c20" />
      </mesh>
      <mesh position={haste.ponta}>
        <sphereGeometry args={[0.02, 10, 8]} />
        <meshStandardMaterial color="#3a3d44" />
      </mesh>
    </group>
  );
}

/**
 * Avatar chibi: cabeça grande com olhos/íris/brilho/sobrancelhas/sorriso,
 * vestido de revolução, braços com mãos, perninhas com sapatos.
 * Pés sempre em y=0 do grupo local. Altura ~1.35 em pé, ~1.1 sentado.
 */
function AvatarChibi({ corRoupa, corPele, corCabelo, corte, sentado = false, digitando = false, falando = false, headset = false }: AvatarChibiProps) {
  const mats = useMemo(() => ({
    pele: toon(corPele),
    cabelo: toon(corCabelo),
    roupa: toon(corRoupa),
    sapato: toon("#2E3742"),
    branco: new THREE.MeshBasicMaterial({ color: "#FFFFFF" }),
    escuro: new THREE.MeshBasicMaterial({ color: "#221C1A" }),
    iris: new THREE.MeshBasicMaterial({ color: "#3A2C25" }),
  }), [corPele, corCabelo, corRoupa]);

  const vestidoGeo = useMemo(
    () => new THREE.LatheGeometry(PERFIL_VESTIDO.map(([x, y]) => new THREE.Vector2(x, y)), 32),
    [],
  );

  const corpo = useRef<THREE.Group>(null);
  const cabeca = useRef<THREE.Group>(null);
  const olhoE = useRef<THREE.Group>(null);
  const olhoD = useRef<THREE.Group>(null);
  const bracoE = useRef<THREE.Group>(null);
  const bracoD = useRef<THREE.Group>(null);
  const bocaAberta = useRef<THREE.Mesh>(null);
  const sorriso = useRef<THREE.Mesh>(null);
  const fase = useMemo(() => Math.random() * Math.PI * 2, []);
  const piscada = useRef({ proxima: 2 + Math.random() * 3, inicio: -9 });

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (corpo.current) corpo.current.position.y = Math.abs(Math.sin(t * 1.35 + fase)) * 0.012;
    if (cabeca.current) {
      cabeca.current.rotation.z = Math.sin(t * 0.9 + fase) * 0.03;
      cabeca.current.rotation.y = Math.sin(t * 0.5 + fase) * 0.08;
    }
    // piscada
    const p = piscada.current;
    if (t > p.proxima) { p.inicio = t; p.proxima = t + 2.2 + Math.random() * 4; }
    const bt = t - p.inicio;
    const palpebra = bt < 0.13 ? Math.max(0.07, 1 - Math.sin((bt / 0.13) * Math.PI)) : 1;
    if (olhoE.current) olhoE.current.scale.y = palpebra;
    if (olhoD.current) olhoD.current.scale.y = palpebra;
    // digitação: braços pra frente tremendo
    if (digitando) {
      if (bracoE.current) bracoE.current.rotation.x = -1.0 + Math.sin(t * 9 + fase) * 0.09;
      if (bracoD.current) bracoD.current.rotation.x = -1.0 + Math.cos(t * 8.3 + fase) * 0.09;
    } else {
      if (bracoE.current) bracoE.current.rotation.x = Math.sin(t * 0.85 + fase) * 0.05;
      if (bracoD.current) bracoD.current.rotation.x = Math.sin(t * 0.85 + fase + 1.7) * 0.05;
    }
    // boca falando
    const abre = falando ? 0.3 + 0.7 * Math.abs(Math.sin(t * 13.2)) : 0;
    if (bocaAberta.current) {
      bocaAberta.current.visible = abre > 0.12;
      bocaAberta.current.scale.set(1, 0.28 + abre * 1.2, 0.4);
    }
    if (sorriso.current) sorriso.current.visible = abre <= 0.12;
  });

  const yCabeca = sentado ? 0.98 : 1.06;
  const HY = 0.2; // offset da esfera da cabeça dentro do pivô

  return (
    <group>
      {/* perninhas + sapatos */}
      {([-1, 1] as const).map((s) =>
        sentado ? (
          <group key={s}>
            <mesh castShadow position={[0.08 * s, 0.34, 0.14]} rotation={[-1.4, 0, 0]}>
              <cylinderGeometry args={[0.05, 0.045, 0.24, 12]} />
              <primitive object={mats.pele} attach="material" />
            </mesh>
            <mesh castShadow position={[0.08 * s, 0.14, 0.24]}>
              <cylinderGeometry args={[0.048, 0.042, 0.26, 12]} />
              <primitive object={mats.pele} attach="material" />
            </mesh>
            <mesh castShadow position={[0.08 * s, 0.045, 0.3]} scale={[1, 0.64, 1.4]}>
              <sphereGeometry args={[0.065, 14, 10]} />
              <primitive object={mats.sapato} attach="material" />
            </mesh>
          </group>
        ) : (
          <group key={s}>
            <mesh castShadow position={[0.08 * s, 0.19, 0]}>
              <cylinderGeometry args={[0.05, 0.042, 0.3, 12]} />
              <primitive object={mats.pele} attach="material" />
            </mesh>
            <mesh castShadow position={[0.08 * s, 0.045, 0.026]} scale={[1, 0.64, 1.4]}>
              <sphereGeometry args={[0.065, 14, 10]} />
              <primitive object={mats.sapato} attach="material" />
            </mesh>
          </group>
        ),
      )}

      <group ref={corpo} position={[0, sentado ? -0.08 : 0, 0]}>
        {/* vestido/torso de revolução */}
        <mesh castShadow geometry={vestidoGeo} position={[0, sentado ? 0.12 : 0, 0]}>
          <primitive object={mats.roupa} attach="material" />
        </mesh>
        {/* pescoço */}
        <mesh position={[0, yCabeca - 0.06, 0]}>
          <cylinderGeometry args={[0.047, 0.053, 0.08, 12]} />
          <primitive object={mats.pele} attach="material" />
        </mesh>

        {/* braços com mãos (pivô no ombro) */}
        {([-1, 1] as const).map((s) => (
          <group key={s} ref={s < 0 ? bracoE : bracoD} position={[0.16 * s, yCabeca - 0.13, 0]} rotation={[0, 0, -0.14 * s]}>
            <mesh castShadow position={[0, -0.02, 0]}>
              <sphereGeometry args={[0.044, 12, 10]} />
              <primitive object={mats.roupa} attach="material" />
            </mesh>
            <mesh castShadow position={[0, -0.16, 0]}>
              <cylinderGeometry args={[0.042, 0.036, 0.3, 12]} />
              <primitive object={mats.pele} attach="material" />
            </mesh>
            <mesh castShadow position={[0, -0.33, 0]} scale={[1, 1.18, 0.82]}>
              <sphereGeometry args={[0.047, 12, 10]} />
              <primitive object={mats.pele} attach="material" />
            </mesh>
          </group>
        ))}

        {/* cabeça chibi */}
        <group ref={cabeca} position={[0, yCabeca, 0]}>
          {headset && <Headset hy={HY} />}
          <mesh castShadow position={[0, HY, 0]} scale={[1, 0.98, 0.94]}>
            <sphereGeometry args={[0.2, 28, 22]} />
            <primitive object={mats.pele} attach="material" />
          </mesh>
          {/* orelhas */}
          {([-1, 1] as const).map((s) => (
            <mesh key={s} position={[0.188 * s, HY, 0]} scale={[0.5, 1, 0.75]}>
              <sphereGeometry args={[0.038, 10, 8]} />
              <primitive object={mats.pele} attach="material" />
            </mesh>
          ))}
          {/* nariz */}
          <mesh position={[0, HY - 0.02, 0.18]} scale={[1, 0.85, 0.8]}>
            <sphereGeometry args={[0.02, 10, 8]} />
            <primitive object={mats.pele} attach="material" />
          </mesh>
          {/* olhos: esclera + íris + brilho */}
          {([-1, 1] as const).map((s) => (
            <group key={s} ref={s < 0 ? olhoE : olhoD} position={[0.075 * s, HY + 0.027, 0.166]}>
              <mesh scale={[0.92, 1.12, 0.5]}>
                <sphereGeometry args={[0.048, 16, 12]} />
                <primitive object={mats.branco} attach="material" />
              </mesh>
              <mesh position={[0, 0.003, 0.023]} scale={[1, 1, 0.5]}>
                <sphereGeometry args={[0.025, 12, 10]} />
                <primitive object={mats.iris} attach="material" />
              </mesh>
              <mesh position={[-0.011 * s, 0.015, 0.035]} scale={[1, 1, 0.4]}>
                <sphereGeometry args={[0.009, 8, 6]} />
                <primitive object={mats.branco} attach="material" />
              </mesh>
            </group>
          ))}
          {/* sobrancelhas */}
          {([-1, 1] as const).map((s) => (
            <mesh key={s} position={[0.075 * s, HY + 0.087, 0.158]} scale={[1.05, 0.24, 0.28]} rotation={[0, 0, 0.13 * s]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <primitive object={mats.cabelo} attach="material" />
            </mesh>
          ))}
          {/* sorriso + boca de fala */}
          <mesh ref={sorriso} position={[0, HY - 0.064, 0.171]} rotation={[0.14, 0, Math.PI * 1.1]}>
            <torusGeometry args={[0.052, 0.01, 8, 20, Math.PI * 0.8]} />
            <primitive object={mats.escuro} attach="material" />
          </mesh>
          <mesh ref={bocaAberta} position={[0, HY - 0.073, 0.171]} visible={false}>
            <sphereGeometry args={[0.042, 14, 10]} />
            <primitive object={mats.escuro} attach="material" />
          </mesh>
          {/* cabelo — 3 cortes da referência */}
          <group>
            <mesh castShadow position={[0, HY, -0.006]} rotation={[-0.72, 0, 0]} scale={[1.05, 1.05, 1.02]}>
              <sphereGeometry args={[0.209, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
              <primitive object={mats.cabelo} attach="material" />
            </mesh>
            {corte === 0 && (
              <mesh castShadow position={[0, HY - 0.015, -0.046]} scale={[1.02, 0.78, 0.9]}>
                <sphereGeometry args={[0.188, 22, 18]} />
                <primitive object={mats.cabelo} attach="material" />
              </mesh>
            )}
            {corte === 1 && (
              <group>
                {([-1, 1] as const).map((s) => (
                  <mesh key={s} castShadow position={[0.154 * s, HY - 0.088, -0.023]} scale={[0.72, 1.45, 0.95]}>
                    <sphereGeometry args={[0.1, 16, 12]} />
                    <primitive object={mats.cabelo} attach="material" />
                  </mesh>
                ))}
                <mesh castShadow position={[0, HY - 0.054, -0.054]} scale={[1.02, 1.0, 0.9]}>
                  <sphereGeometry args={[0.188, 22, 18]} />
                  <primitive object={mats.cabelo} attach="material" />
                </mesh>
              </group>
            )}
            {corte === 2 && (
              <group>
                <mesh castShadow position={[0, HY - 0.004, -0.004]} scale={[1.02, 0.7, 0.9]}>
                  <sphereGeometry args={[0.188, 22, 18]} />
                  <primitive object={mats.cabelo} attach="material" />
                </mesh>
                <mesh castShadow position={[0, HY + 0.142, -0.142]}>
                  <sphereGeometry args={[0.088, 16, 12]} />
                  <primitive object={mats.cabelo} attach="material" />
                </mesh>
              </group>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

/** Balão "atendendo" pulsante sobre a mesa. */
function BalaoAtendendo() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.1);
  });
  return (
    <Billboard position={[0, 1.72, 0]}>
      <group ref={ref}>
        <mesh>
          <circleGeometry args={[0.11, 20]} />
          <meshStandardMaterial color="#12351f" emissive="#2fdc76" emissiveIntensity={0.9} />
        </mesh>
        {[-0.045, 0, 0.045].map((x, i) => (
          <mesh key={i} position={[x, 0, 0.005]}>
            <circleGeometry args={[0.014, 10]} />
            <meshStandardMaterial color="#eafff2" emissive="#eafff2" emissiveIntensity={1} />
          </mesh>
        ))}
      </group>
    </Billboard>
  );
}

export interface FuncionarioProps {
  posicao: [number, number, number];
  cargo: CargoTipologia;
  rotulo: string;
  atendendo: boolean;
  quantidadeFila: number;
  /** Nome do lead na linha (conversa quente atribuída à cabine). */
  leadNaLinha?: string;
  rotacaoY?: number;
}

/**
 * Atendente chibi de headset, sentado na cabine OLHANDO PRO MONITOR.
 * O avatar nasce olhando pra +Z; a cabine põe o monitor em +Z, então
 * `rotacaoY` padrão = 0. Em ligação: digita, fala e mostra o lead na linha.
 */
export function Funcionario({ posicao, cargo, rotulo, atendendo, quantidadeFila, leadNaLinha, rotacaoY = 0 }: FuncionarioProps) {
  const seed = semente(cargo + rotulo);
  return (
    <group position={posicao} rotation={[0, rotacaoY, 0]}>
      <AvatarChibi
        corRoupa={COR_CARGO[cargo]}
        corPele={PELES[seed % PELES.length]}
        corCabelo={CABELOS[seed % CABELOS.length]}
        corte={CORTE_POR_CARGO[cargo]}
        sentado
        headset
        digitando={atendendo}
        falando={atendendo}
      />
      <Billboard position={[0, 1.52, 0]}>
        <Text fontSize={0.11} color="#ffe9c4" anchorX="center" outlineWidth={0.008} outlineColor="#000">
          {rotulo}{quantidadeFila > 1 ? ` · ${quantidadeFila} na fila` : ""}
        </Text>
      </Billboard>
      {atendendo && <BalaoAtendendo />}
      {atendendo && leadNaLinha && (
        <Billboard position={[0, 1.95, 0]}>
          <Text fontSize={0.1} color="#9dffc4" anchorX="center" outlineWidth={0.008} outlineColor="#000">
            {`em ligação · ${leadNaLinha}`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

export interface LeadVivoProps {
  posicao: [number, number, number];
  nome: string;
  sentado?: boolean;
  rotacaoY?: number;
}

/** Lead chibi ao vivo: pele/cabelo/corte variados pela semente do nome, roupa neutra. */
export function LeadVivo({ posicao, nome, sentado = false, rotacaoY = 0 }: LeadVivoProps) {
  const seed = semente(nome);
  return (
    <group position={posicao} rotation={[0, rotacaoY, 0]}>
      <AvatarChibi
        corRoupa={["#8b93a3", "#6f7d92", "#9a8f7f"][seed % 3]}
        corPele={PELES[(seed >> 2) % PELES.length]}
        corCabelo={CABELOS[(seed >> 4) % CABELOS.length]}
        corte={(seed % 3) as 0 | 1 | 2}
        sentado={sentado}
      />
      <Billboard position={[0, sentado ? 1.46 : 1.58, 0]}>
        <Text fontSize={0.1} color="#cfe3ff" anchorX="center" outlineWidth={0.008} outlineColor="#000">
          {nome}
        </Text>
      </Billboard>
    </group>
  );
}

/** Distribui as conversas quentes por cargo (1 lead por mesa; resto na espera). */
export function distribuirLeads(conversas: ConversaMaquete[], agoraMs: number): {
  porCargo: Record<CargoTipologia, ConversaMaquete[]>;
  quentes: ConversaMaquete[];
} {
  const quentes = conversas.filter((c) => agoraMs - c.ultimaMensagemMs < JANELA_ATENDIMENTO_MS);
  const porCargo: Record<CargoTipologia, ConversaMaquete[]> = {
    atendimento: [], vendedor: [], financeiro: [], suporte: [], mentor: [],
  };
  for (const c of quentes) porCargo[c.cargoTipologia].push(c);
  return { porCargo, quentes };
}
