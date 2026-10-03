// @ts-nocheck
/**
 * Contexto compartilhado do app Curadoria.
 * Expõe o tenant impersonado para todas as abas sem prop drilling.
 */
import { createContext, useContext } from "react";
import type { TenantImpersonado } from "./tipos";
import { TENANT_UNIVERSO } from "./tipos";

export interface ContextoCuradoriaValor {
  tenantImpersonado: TenantImpersonado;
}

export const ContextoCuradoria = createContext<ContextoCuradoriaValor>({
  tenantImpersonado: TENANT_UNIVERSO,
});

export function useTenantImpersonado(): TenantImpersonado {
  return useContext(ContextoCuradoria).tenantImpersonado;
}
