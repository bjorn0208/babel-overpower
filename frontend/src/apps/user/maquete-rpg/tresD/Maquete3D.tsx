/**
 * Maquete3D v2 — modo imersivo com FÍSICA e atendimento AO VIVO.
 *
 * Desktop: clique trava o mouse; WASD move um corpo físico (cápsula) que
 * PARA em paredes/móveis e EMPURRA objetos soltos. Quest: "Entrar em VR",
 * stick esquerdo anda (clamp nos limites), direito gira 45°.
 * Dados vivos: useConversasMaquete (mesmo realtime do 2D).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { Physics, RigidBody, CapsuleCollider, type RapierRigidBody } from "@react-three/rapier";
import { createXRStore, XR, XROrigin, useXRInputSourceState, useXR } from "@react-three/xr";
import { PORTA, COLUNAS, LINHAS } from "../canvas/MapaEmpresa";
import { useConversasMaquete } from "../dados/useConversasMaquete";
import { CenaEscritorio } from "./CenaEscritorio";

// emulate: false — em localhost o xr injeta um emulador de headset (@iwer)
// que está stubado no bundle (conflito protobuf com o livekit). VR real no
// Quest não passa pelo emulador.
const store = createXRStore({ emulate: false });

const ALTURA_OLHO = 1.55;
const VELOCIDADE = 3.0;
const POS_INICIAL: [number, number, number] = [PORTA.x + 2.5, 0, PORTA.y + 0.5];

/** Locomoção VR: stick esquerdo anda (com clamp no mapa), direito snap turn 45°. */
function LocomocaoVR({ origem }: { origem: React.RefObject<THREE.Group | null> }) {
  const esquerdo = useXRInputSourceState("controller", "left");
  const direito = useXRInputSourceState("controller", "right");
  const snapProntoRef = useRef(true);
  const camera = useThree((s) => s.camera);

  useFrame((_, dt) => {
    const grupo = origem.current;
    if (!grupo) return;
    const thumb = esquerdo?.gamepad?.["xr-standard-thumbstick"];
    const x = thumb?.xAxis ?? 0;
    const y = thumb?.yAxis ?? 0;
    if (Math.abs(x) > 0.12 || Math.abs(y) > 0.12) {
      const frente = new THREE.Vector3();
      camera.getWorldDirection(frente);
      frente.y = 0;
      frente.normalize();
      const lado = new THREE.Vector3().crossVectors(frente, new THREE.Vector3(0, 1, 0));
      grupo.position.addScaledVector(frente, -y * VELOCIDADE * dt);
      grupo.position.addScaledVector(lado, x * VELOCIDADE * dt);
      grupo.position.x = THREE.MathUtils.clamp(grupo.position.x, 0.6, COLUNAS - 0.6);
      grupo.position.z = THREE.MathUtils.clamp(grupo.position.z, 0.6, LINHAS - 0.6);
    }
    const giro = direito?.gamepad?.["xr-standard-thumbstick"]?.xAxis ?? 0;
    if (Math.abs(giro) > 0.6 && snapProntoRef.current) {
      grupo.rotation.y -= Math.sign(giro) * (Math.PI / 4);
      snapProntoRef.current = false;
    } else if (Math.abs(giro) < 0.3) {
      snapProntoRef.current = true;
    }
  });
  return null;
}

/**
 * Corpo físico do jogador (desktop): cápsula com rotação travada. WASD define
 * a velocidade horizontal; gravidade cuida do resto. A câmera cola no corpo.
 */
function JogadorFisico() {
  const emXR = useXR((s) => s.session != null);
  const corpo = useRef<RapierRigidBody>(null);
  const teclas = useRef<Record<string, boolean>>({});
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const baixo = (e: KeyboardEvent) => { teclas.current[e.code] = true; };
    const cima = (e: KeyboardEvent) => { teclas.current[e.code] = false; };
    window.addEventListener("keydown", baixo);
    window.addEventListener("keyup", cima);
    return () => {
      window.removeEventListener("keydown", baixo);
      window.removeEventListener("keyup", cima);
    };
  }, []);

  useFrame(() => {
    const rb = corpo.current;
    if (!rb || emXR) return;
    const t = teclas.current;
    const frente = new THREE.Vector3();
    camera.getWorldDirection(frente);
    frente.y = 0;
    frente.normalize();
    const lado = new THREE.Vector3().crossVectors(frente, new THREE.Vector3(0, 1, 0));
    const dir = new THREE.Vector3();
    if (t.KeyW || t.ArrowUp) dir.add(frente);
    if (t.KeyS || t.ArrowDown) dir.sub(frente);
    if (t.KeyD || t.ArrowRight) dir.add(lado);
    if (t.KeyA || t.ArrowLeft) dir.sub(lado);
    const vel = rb.linvel();
    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(VELOCIDADE * (t.ShiftLeft ? 1.8 : 1));
      rb.setLinvel({ x: dir.x, y: vel.y, z: dir.z }, true);
    } else {
      rb.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
    }
    const p = rb.translation();
    camera.position.set(p.x, p.y + ALTURA_OLHO - 0.9, p.z);
  });

  if (emXR) return null;
  return (
    <RigidBody
      ref={corpo}
      colliders={false}
      enabledRotations={[false, false, false]}
      position={[POS_INICIAL[0], 1.2, POS_INICIAL[2]]}
      friction={0.2}
    >
      <CapsuleCollider args={[0.45, 0.32]} />
    </RigidBody>
  );
}

function ControlesOlhar() {
  const emXR = useXR((s) => s.session != null);
  return emXR ? null : <PointerLockControls />;
}

export interface Maquete3DProps {
  onSair: () => void;
}

export default function Maquete3D({ onSair }: Maquete3DProps) {
  const origemRef = useRef<THREE.Group>(null);
  const [suportaVR, setSuportaVR] = useState(false);
  const { conversas } = useConversasMaquete();
  // "agora" atualiza a cada 30s pra janela de atendimento respirar sem re-render frenético.
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgoraMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const atendendoAgora = useMemo(
    () => conversas.filter((c) => agoraMs - c.ultimaMensagemMs < 5 * 60_000).length,
    [conversas, agoraMs],
  );

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    xr?.isSessionSupported("immersive-vr").then((ok) => setSuportaVR(ok)).catch(() => setSuportaVR(false));
  }, []);

  return (
    <div className="relative h-full w-full bg-zinc-950">
      <Canvas
        shadows
        camera={{ position: [POS_INICIAL[0], ALTURA_OLHO, POS_INICIAL[2]], fov: 70, rotation: [0, -Math.PI / 2, 0] }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#0b0a14"]} />
        <fog attach="fog" args={["#0b0a14", 30, 70]} />
        <XR store={store}>
          <XROrigin ref={origemRef} position={POS_INICIAL} />
          <LocomocaoVR origem={origemRef} />
          <ControlesOlhar />
          <Physics gravity={[0, -9.81, 0]}>
            <JogadorFisico />
            <CenaEscritorio conversas={conversas} agoraMs={agoraMs} />
          </Physics>
        </XR>
      </Canvas>

      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={onSair}
          className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur hover:bg-zinc-800"
        >
          ← Voltar pro 2D
        </button>
        {suportaVR && (
          <button
            type="button"
            onClick={() => void store.enterVR()}
            className="rounded-lg border border-indigo-500/60 bg-indigo-600/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-indigo-500"
          >
            🥽 Entrar em VR
          </button>
        )}
        <span className="rounded-lg bg-zinc-900/70 px-3 py-1.5 text-[11px] text-emerald-300 backdrop-blur">
          ● {atendendoAgora} em atendimento agora
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-zinc-900/70 px-3 py-1.5 text-[11px] text-zinc-300 backdrop-blur">
        Clique pra olhar · WASD anda (esbarra e empurra as coisas) · Quest: stick esquerdo anda, direito gira
      </div>
    </div>
  );
}
