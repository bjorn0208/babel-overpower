declare module "@/bundle/bundle-shared" {
  import * as React from "react";
  export const Icon: React.ComponentType<{
    name: string;
    size?: number;
    stroke?: string;
    style?: React.CSSProperties;
    className?: string;
  }>;
  export interface ToastApi {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  }
  export const useToast: () => ToastApi;
  export const Toaster: React.ComponentType<{ children?: React.ReactNode }>;
}

declare module "@/bundle/bundle" {
  import * as React from "react";
  export const App: React.ComponentType<{
    initialBrand?: any;
    onLogout?: () => void;
    initialSide?: "admin" | "user";
    onBrandSave?: (brand: any) => void | Promise<void>;
    tenants?: any[];
  }>;
  export const Login: React.ComponentType<{
    brand?: any;
    onEntrar?: () => void;
    onSubmit?: (email: string, senha: string) => Promise<{ erro?: string } | void>;
    onEsqueciSenha?: (email: string) => void;
  }>;
  const _default: React.ComponentType;
  export default _default;
}
