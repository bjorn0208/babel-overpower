/** SANIDADE-DEV: Canvas r3f mínimo — diagnosticar loop de frames em dev. */
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";

function Cubo() {
  console.log("[fiber-san] Cubo montou");
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    (window as unknown as { __PROBE2?: number }).__PROBE2 = ((window as unknown as { __PROBE2?: number }).__PROBE2 ?? 0) + 1;
    if (ref.current) ref.current.rotation.y += dt;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="hotpink" />
    </mesh>
  );
}

export default function FiberSanidade() {
  return (
    <div style={{ height: "100vh", background: "#111" }}>
      <Canvas
        camera={{ position: [0, 0, 3] }}
        frameloop="always"
        onCreated={(st) => console.log("[fiber-san] created · gl ok:", !!st.gl, "· size:", st.size.width, "x", st.size.height)}
      >
        <Cubo />
      </Canvas>
    </div>
  );
}
