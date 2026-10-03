import { Routes, Route, Navigate } from "react-router-dom";
import Desktop from "@/pages/Desktop";
import Login from "@/pages/Login";
import Impersonar from "@/pages/Impersonar";
import ResetPassword from "@/pages/ResetPassword";
import ContratoPublico from "@/pages/public/Contrato";
import ConsultaPublica from "@/pages/public/Consulta";
import RifaPublica from "@/pages/public/Rifa";
import AcompanhamentoPublico from "@/pages/public/Acompanhamento";
import Cadastro from "@/pages/public/Cadastro";
import AppRifasStandalone from "@/pages/app-rifas/AppRifasStandalone";
import Reino from "@/pages/Reino";
import { AuthProvider } from "@/auth/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import MapaMotor from "@/mapa-motor/MapaMotor";
import SalaPublica from "@/pages/public/sala/Sala";
import Agendar from "@/pages/public/Agendar";
import { lazy, Suspense } from "react";

// Rota DEV-ONLY: abre a maquete 3D sem login pra smoke visual local.
// Nunca registrada em produção (import.meta.env.DEV).
const Maquete3DDev = lazy(() => import("@/apps/user/maquete-rpg/tresD/Maquete3D"));
const FiberSanidadeDev = lazy(() => import("@/apps/user/maquete-rpg/tresD/FiberSanidade"));

export default function App() {
  return (
    <AuthProvider>
      {/* Sonner nunca teve <Toaster/> montado — todo toast.success/error do app
          (18 arquivos) disparava pro vazio. Montado uma vez aqui, na raiz. */}
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="/" element={<Desktop />} />
        <Route path="/login" element={<Login />} />
        {(import.meta.env.DEV || import.meta.env.MODE === "smoke") && (
          <Route path="/dev/fiber" element={<Suspense fallback={null}><FiberSanidadeDev /></Suspense>} />
        )}
        {(import.meta.env.DEV || import.meta.env.MODE === "smoke") && (
          <Route
            path="/dev/maquete-3d"
            element={
              <div style={{ height: "100vh" }}>
                <Suspense fallback={null}>
                  <Maquete3DDev onSair={() => window.history.back()} />
                </Suspense>
              </div>
            }
          />
        )}
        <Route path="/impersonar" element={<Impersonar />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/contrato/:chave" element={<ContratoPublico />} />
        <Route path="/consulta/:chave" element={<ConsultaPublica />} />
        <Route path="/rifa/:chave" element={<RifaPublica />} />
        <Route path="/app/rifas" element={<AppRifasStandalone />} />
        <Route path="/reino" element={<Reino />} />
        <Route path="/acompanhamento/:token" element={<AcompanhamentoPublico />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/mapa-motor" element={<MapaMotor />} />
        <Route path="/sala/:chave" element={<SalaPublica />} />
        <Route path="/agendar/:chave" element={<Agendar />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
