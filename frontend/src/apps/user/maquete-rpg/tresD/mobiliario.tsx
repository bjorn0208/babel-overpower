/**
 * Mobiliário detalhado da maquete 3D — primitivas compostas, zero textura
 * externa (tudo material + emissive). Unidade: 1 tile = 1 m.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export const COR_MADEIRA_ESCURA = "#4c3a28";
export const COR_MADEIRA = "#8a6f4d";
export const COR_METAL = "#3a3f47";

/** Notebook aberto: base + teclado + tela acesa com "conteúdo". */
export function Notebook({ posicao = [0, 0, 0] as [number, number, number], rotacaoY = 0 }) {
  return (
    <group position={posicao} rotation={[0, rotacaoY, 0]}>
      <mesh castShadow position={[0, 0.012, 0]}>
        <boxGeometry args={[0.34, 0.024, 0.24]} />
        <meshStandardMaterial color="#2b2f36" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* teclado (teclas sugeridas por faixas) */}
      <mesh position={[0, 0.026, 0.02]}>
        <boxGeometry args={[0.3, 0.004, 0.14]} />
        <meshStandardMaterial color="#1c1f24" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.028, 0.095]}>
        <boxGeometry args={[0.16, 0.003, 0.05]} />
        <meshStandardMaterial color="#15181c" roughness={0.5} />
      </mesh>
      {/* tela na dobradiça traseira: nasce vertical, reclinada ~16° pra trás */}
      <group position={[0, 0.02, -0.12]} rotation={[0.28, 0, 0]}>
        <mesh castShadow position={[0, 0.14, 0]}>
          <boxGeometry args={[0.34, 0.28, 0.012]} />
          <meshStandardMaterial color="#22262c" roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.14, 0.008]}>
          <planeGeometry args={[0.31, 0.24]} />
          <meshStandardMaterial color="#0d1524" emissive="#2a5b9e" emissiveIntensity={1.4} roughness={0.2} />
        </mesh>
        {/* "janela de chat" na tela */}
        <mesh position={[-0.06, 0.17, 0.009]}>
          <planeGeometry args={[0.12, 0.03]} />
          <meshStandardMaterial color="#dfe9f5" emissive="#dfe9f5" emissiveIntensity={0.9} />
        </mesh>
        <mesh position={[0.05, 0.11, 0.009]}>
          <planeGeometry args={[0.14, 0.03]} />
          <meshStandardMaterial color="#67e08f" emissive="#67e08f" emissiveIntensity={0.7} />
        </mesh>
      </group>
    </group>
  );
}

/** Mesa de trabalho: tampo com borda, 4 pernas metálicas, gaveteiro, caneca e papéis. */
export function MesaDetalhada() {
  return (
    <group>
      <mesh castShadow position={[0, 0.74, 0]}>
        <boxGeometry args={[1.6, 0.05, 0.8]} />
        <meshStandardMaterial color={COR_MADEIRA} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.705, 0]}>
        <boxGeometry args={[1.64, 0.02, 0.84]} />
        <meshStandardMaterial color={COR_MADEIRA_ESCURA} roughness={0.7} />
      </mesh>
      {([[-0.74, -0.34], [0.74, -0.34], [-0.74, 0.34], [0.74, 0.34]] as const).map(([px, pz], i) => (
        <mesh key={i} castShadow position={[px, 0.35, pz]}>
          <cylinderGeometry args={[0.025, 0.025, 0.7, 8]} />
          <meshStandardMaterial color={COR_METAL} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* gaveteiro */}
      <mesh castShadow position={[0.55, 0.4, 0.1]}>
        <boxGeometry args={[0.4, 0.55, 0.5]} />
        <meshStandardMaterial color={COR_MADEIRA_ESCURA} roughness={0.7} />
      </mesh>
      {[0.55, 0.4, 0.25].map((y, i) => (
        <mesh key={i} position={[0.55, y - 0.03, 0.36]}>
          <boxGeometry args={[0.34, 0.1, 0.01]} />
          <meshStandardMaterial color={COR_MADEIRA} roughness={0.6} />
        </mesh>
      ))}
      <Notebook posicao={[-0.15, 0.765, -0.05]} rotacaoY={0.15} />
      {/* caneca */}
      <mesh castShadow position={[0.28, 0.8, -0.15]}>
        <cylinderGeometry args={[0.04, 0.035, 0.09, 12]} />
        <meshStandardMaterial color="#c9432f" roughness={0.5} />
      </mesh>
      {/* papéis */}
      <mesh position={[-0.55, 0.77, 0.18]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.21, 0.006, 0.29]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Cadeira giratória: assento, encosto, pistão e base de 5 raios com rodinhas. */
export function CadeiraGiratoria({ rotacaoY = 0 }: { rotacaoY?: number }) {
  return (
    <group rotation={[0, rotacaoY, 0]}>
      <mesh castShadow position={[0, 0.46, 0]}>
        <boxGeometry args={[0.46, 0.07, 0.44]} />
        <meshStandardMaterial color="#23262c" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.75, 0.2]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[0.44, 0.55, 0.07]} />
        <meshStandardMaterial color="#2b2f36" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <meshStandardMaterial color={COR_METAL} metalness={0.7} roughness={0.3} />
      </mesh>
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0.16, 0.09, 0]} rotation={[0, 0, 1.35]}>
              <boxGeometry args={[0.05, 0.3, 0.04]} />
              <meshStandardMaterial color={COR_METAL} metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0.3, 0.035, 0]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshStandardMaterial color="#111318" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Sofá com braços e almofadas. */
export function SofaDetalhado({ largura = 2 }: { largura?: number }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[largura, 0.34, 0.9]} />
        <meshStandardMaterial color="#6d4033" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.62, -0.36]}>
        <boxGeometry args={[largura, 0.62, 0.2]} />
        <meshStandardMaterial color="#63392d" roughness={0.95} />
      </mesh>
      {([-1, 1] as const).map((lado) => (
        <mesh key={lado} castShadow position={[(largura / 2 - 0.08) * lado, 0.42, 0]}>
          <boxGeometry args={[0.16, 0.36, 0.9]} />
          <meshStandardMaterial color="#5c352a" roughness={0.95} />
        </mesh>
      ))}
      {Array.from({ length: Math.max(1, Math.round(largura / 0.7)) }).map((_, i, arr) => (
        <mesh key={i} castShadow position={[-largura / 2 + ((i + 0.5) * largura) / arr.length, 0.47, 0.05]} rotation={[0.15, 0, 0]}>
          <boxGeometry args={[largura / arr.length - 0.12, 0.34, 0.12]} />
          <meshStandardMaterial color="#8a5a44" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Planta: vaso, terra, tronco e copa em camadas de cones. */
export function PlantaDetalhada() {
  return (
    <group>
      <mesh castShadow position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.17, 0.22, 0.38, 10]} />
        <meshStandardMaterial color="#8a4b32" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.03, 10]} />
        <meshStandardMaterial color="#3a2a1c" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.4, 6]} />
        <meshStandardMaterial color="#5a4028" roughness={0.9} />
      </mesh>
      {[0.62, 0.82, 1.0].map((y, i) => (
        <mesh key={i} castShadow position={[0, y, 0]}>
          <coneGeometry args={[0.34 - i * 0.08, 0.34, 8]} />
          <meshStandardMaterial color={i % 2 ? "#3f7d44" : "#356e3b"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Estante com prateleiras e livros coloridos. */
export function EstanteLivros({ largura = 1.6 }: { largura?: number }) {
  const cores = ["#b8503c", "#3c6bb8", "#3cb87a", "#c9a13c", "#7a4ab8", "#b83c8a"];
  return (
    <group>
      <mesh castShadow position={[0, 1.05, 0]}>
        <boxGeometry args={[largura, 2.1, 0.36]} />
        <meshStandardMaterial color={COR_MADEIRA_ESCURA} roughness={0.75} />
      </mesh>
      {[0.4, 0.9, 1.4, 1.9].map((y) => (
        <group key={y}>
          <mesh position={[0, y - 0.14, 0.02]}>
            <boxGeometry args={[largura - 0.1, 0.03, 0.3]} />
            <meshStandardMaterial color={COR_MADEIRA} roughness={0.7} />
          </mesh>
          {Array.from({ length: 9 }).map((_, i) => {
            const semente = (y * 37 + i * 11) % 100;
            if (semente > 78) return null;
            const alt = 0.2 + (semente % 4) * 0.02;
            return (
              <mesh key={i} position={[-largura / 2 + 0.14 + i * ((largura - 0.28) / 8), y + alt / 2 - 0.12, 0.02]}>
                <boxGeometry args={[0.05, alt, 0.2]} />
                <meshStandardMaterial color={cores[(semente + i) % cores.length]} roughness={0.8} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

/** Luminária pendente de teto com luz quente. */
export function Luminaria({ posicao }: { posicao: [number, number, number] }) {
  return (
    <group position={posicao}>
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
        <meshStandardMaterial color="#22252b" />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <coneGeometry args={[0.22, 0.18, 16, 1, true]} />
        <meshStandardMaterial color="#2b2f36" side={THREE.DoubleSide} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, -0.4, 0]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#ffe9c4" emissive="#ffd89a" emissiveIntensity={2.2} />
      </mesh>
      <pointLight position={[0, -0.45, 0]} intensity={7} distance={12} decay={1.5} color="#ffe2b0" />
    </group>
  );
}

/** Relógio de parede que marca a hora REAL (ao vivo). */
export function RelogioParede({ posicao }: { posicao: [number, number, number] }) {
  const refMin = useRef<THREE.Mesh>(null);
  const refHora = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const agora = new Date();
    const min = agora.getMinutes() + agora.getSeconds() / 60;
    const hora = (agora.getHours() % 12) + min / 60;
    if (refMin.current) refMin.current.rotation.z = -(min / 60) * Math.PI * 2;
    if (refHora.current) refHora.current.rotation.z = -(hora / 12) * Math.PI * 2;
  });
  return (
    <group position={posicao}>
      <mesh>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 24]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.6} />
      </mesh>
      <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <mesh ref={refHora} position={[0, 0, 0.001]}>
          <boxGeometry args={[0.02, 0.1, 0.005]} />
          <meshStandardMaterial color="#22252b" />
        </mesh>
        <mesh ref={refMin} position={[0, 0, 0.002]}>
          <boxGeometry args={[0.012, 0.16, 0.005]} />
          <meshStandardMaterial color="#22252b" />
        </mesh>
      </group>
    </group>
  );
}

/** Cadeira de visita simples: 4 pernas, assento 0.45 e encosto — pro lead sentar. */
export function CadeiraVisita({ rotacaoY = 0 }: { rotacaoY?: number }) {
  return (
    <group rotation={[0, rotacaoY, 0]}>
      <mesh castShadow position={[0, 0.44, 0]}>
        <boxGeometry args={[0.46, 0.06, 0.44]} />
        <meshStandardMaterial color="#5b4632" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.72, -0.19]}>
        <boxGeometry args={[0.46, 0.52, 0.06]} />
        <meshStandardMaterial color="#5b4632" roughness={0.8} />
      </mesh>
      {([[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]] as const).map(([px, pz], i) => (
        <mesh key={i} castShadow position={[px, 0.21, pz]}>
          <cylinderGeometry args={[0.022, 0.022, 0.42, 8]} />
          <meshStandardMaterial color="#3a3f47" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Monitor de tela plana: pé + base + tela acesa com "CRM" na face -Z (virada pro atendente). */
function MonitorCallCenter({ posicao }: { posicao: [number, number, number] }) {
  return (
    <group position={posicao}>
      <mesh castShadow position={[0, 0.01, 0]}>
        <boxGeometry args={[0.22, 0.02, 0.16]} />
        <meshStandardMaterial color="#1f2126" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.12, 0.02]}>
        <boxGeometry args={[0.04, 0.22, 0.03]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.34, 0.02]}>
        <boxGeometry args={[0.62, 0.36, 0.03]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* tela (face -Z) */}
      <mesh position={[0, 0.34, -0.003]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.58, 0.32]} />
        <meshStandardMaterial color="#0d1524" emissive="#2a5b9e" emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
      {/* barra lateral e cartões de chamada do "CRM" */}
      <mesh position={[0.2, 0.34, -0.005]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.1, 0.28]} />
        <meshStandardMaterial color="#1e3d6b" emissive="#1e3d6b" emissiveIntensity={0.9} />
      </mesh>
      {[0.42, 0.35, 0.28].map((y, i) => (
        <mesh key={i} position={[-0.05, y, -0.005]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.3, 0.045]} />
          <meshStandardMaterial
            color={i === 0 ? "#67e08f" : "#dfe9f5"}
            emissive={i === 0 ? "#67e08f" : "#dfe9f5"}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Telefone IP de mesa com LED de linha. */
function TelefoneIP({ posicao, emLigacao }: { posicao: [number, number, number]; emLigacao: boolean }) {
  return (
    <group position={posicao} rotation={[0, Math.PI + 0.25, 0]}>
      <mesh castShadow position={[0, 0.03, 0]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.2, 0.05, 0.18]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.5} />
      </mesh>
      <mesh position={[-0.06, 0.07, -0.01]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.05, 0.03, 0.17]} />
        <meshStandardMaterial color="#1c1e22" roughness={0.5} />
      </mesh>
      <mesh position={[0.05, 0.066, 0.02]} rotation={[-0.35 - Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.07, 0.04]} />
        <meshStandardMaterial color="#5a8fb8" emissive="#5a8fb8" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0.07, 0.07, -0.06]}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshStandardMaterial
          color={emLigacao ? "#2fdc76" : "#555"}
          emissive={emLigacao ? "#2fdc76" : "#000"}
          emissiveIntensity={emLigacao ? 2 : 0}
        />
      </mesh>
    </group>
  );
}

/**
 * Cabine de call center (3 m × 2 m): bancada encostada na divisória da
 * frente (+Z), divisórias laterais de tecido na cor do cargo com faixa de
 * vidro fosco e trilho de alumínio, monitor + telefone + headset no gancho.
 * Origem = canto noroeste (x, z) da cabine; o atendente senta em
 * (1.5, 0.55) olhando pra +Z (monitor). Fundo (-Z) aberto = entrada.
 */
export function CabineCallCenter({ corTecido, emLigacao }: { corTecido: string; emLigacao: boolean }) {
  const ALT = 1.25;
  const ESP = 0.06;
  const painel = (px: number, pz: number, lx: number, lz: number, key: string) => (
    <group key={key} position={[px, 0, pz]}>
      <mesh castShadow receiveShadow position={[0, (ALT - 0.3) / 2, 0]}>
        <boxGeometry args={[lx, ALT - 0.3, lz]} />
        <meshStandardMaterial color={corTecido} roughness={0.95} />
      </mesh>
      <mesh position={[0, ALT - 0.15, 0]}>
        <boxGeometry args={[lx * 0.98, 0.28, lz * 0.6]} />
        <meshStandardMaterial color="#cfe3ec" roughness={0.15} metalness={0.1} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, ALT + 0.005, 0]}>
        <boxGeometry args={[lx + 0.01, 0.03, lz + 0.02]} />
        <meshStandardMaterial color="#c4c8ce" roughness={0.35} metalness={0.7} />
      </mesh>
    </group>
  );
  return (
    <group>
      {/* carpete da cabine */}
      <mesh position={[1.5, 0.043, 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial color={corTecido} roughness={1} transparent opacity={0.28} />
      </mesh>
      {painel(ESP / 2, 1, ESP, 2, "o")}
      {painel(3 - ESP / 2, 1, ESP, 2, "l")}
      {painel(1.5, 2 - ESP / 2, 3, ESP, "f")}
      {/* bancada */}
      <mesh castShadow receiveShadow position={[1.5, 0.74, 1.47]}>
        <boxGeometry args={[2.86, 0.04, 0.9]} />
        <meshStandardMaterial color="#d9d4c8" roughness={0.6} />
      </mesh>
      <mesh position={[1.5, 0.715, 1.47]}>
        <boxGeometry args={[2.88, 0.015, 0.92]} />
        <meshStandardMaterial color="#8b8577" roughness={0.7} />
      </mesh>
      {/* pés/painel de modéstia */}
      <mesh position={[1.5, 0.36, 1.88]}>
        <boxGeometry args={[2.8, 0.7, 0.03]} />
        <meshStandardMaterial color="#6f6a61" roughness={0.8} />
      </mesh>
      {/* gaveteiro */}
      <mesh castShadow position={[2.55, 0.33, 1.45]}>
        <boxGeometry args={[0.45, 0.62, 0.6]} />
        <meshStandardMaterial color={COR_METAL} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* teclado + mouse */}
      <mesh position={[1.5, 0.772, 1.2]}>
        <boxGeometry args={[0.46, 0.018, 0.15]} />
        <meshStandardMaterial color="#202226" roughness={0.6} />
      </mesh>
      <mesh position={[1.88, 0.772, 1.2]}>
        <boxGeometry args={[0.06, 0.02, 0.1]} />
        <meshStandardMaterial color="#202226" roughness={0.5} />
      </mesh>
      <MonitorCallCenter posicao={[1.5, 0.76, 1.62]} />
      <TelefoneIP posicao={[0.55, 0.76, 1.35]} emLigacao={emLigacao} />
      {/* suporte de headset com o headset pendurado */}
      <group position={[2.35, 0.76, 1.6]}>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.32, 8]} />
          <meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.005, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.01, 12]} />
          <meshStandardMaterial color="#2b2e33" />
        </mesh>
        {!emLigacao && (
          <mesh position={[0, 0.3, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.08, 0.012, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#1b1c20" roughness={0.5} />
          </mesh>
        )}
      </group>
      {/* caneca + post-its na divisória */}
      <mesh castShadow position={[0.4, 0.8, 1.7]}>
        <cylinderGeometry args={[0.04, 0.035, 0.09, 12]} />
        <meshStandardMaterial color="#c9432f" roughness={0.5} />
      </mesh>
      {([["#ffe56b", 0.5, 0.95], ["#ff9ec7", 0.66, 1.02], ["#9ee6ff", 2.2, 0.98]] as const).map(([cor, x, y], i) => (
        <mesh key={i} position={[x, y, 2 - ESP - 0.002]} rotation={[0, Math.PI, 0.08 * (i - 1)]}>
          <planeGeometry args={[0.1, 0.1]} />
          <meshStandardMaterial color={cor} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
