import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    tailwindcss(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  // O import dinâmico do rapier (dentro do @react-three/rapier) não é
  // descoberto pelo optimizer — em dev a promise pendura e o <Physics>
  // suspende a cena inteira (canvas preto). Pré-otimizar resolve.
  optimizeDeps: {
    include: ["@dimforge/rapier3d-compat"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Emulador de headset do @pmndrs/xr (dev-only): o real puxa
      // @bufbuild/protobuf@2 e quebra o build por conflito com o v1 do
      // livekit. Stub inofensivo — VR real no Quest não passa por ele.
      "@iwer/sem": path.resolve(__dirname, "./src/lib/stub-iwer-sem.ts"),
    },
  },
}));