/**
 * aba-templates.tsx — Aba Templates do app Contratos.
 *
 * Tijolo 2e (DEC-037): substitui o montador WYSIWYG legado pelo
 * ConstrutorTemplate v2 (TipTap + painéis + dados reais do banco).
 *
 * O montador/ legado permanece no repo mas não é mais referenciado aqui.
 * Props antigas (templates, produtos, t, onMudou) mantidas como opcionais
 * para compatibilidade com Contratos.tsx sem necessidade de alterar o shell.
 */

import type { ProdutoResumo, TemplateContrato, ToastApi } from "./re-exports";
import { ConstrutorTemplate } from "./construtor/construtor-template";

// ---------------------------------------------------------------------------
// Props — compatíveis com o caller Contratos.tsx
// ---------------------------------------------------------------------------

type AbaTemplatesProps = {
  ownerId: string | null;
  /** Mantidas por compatibilidade; não usadas (o construtor busca direto do banco). */
  templates?: TemplateContrato[];
  produtos?: ProdutoResumo[];
  t?: ToastApi;
  onMudou?: () => void;
};

// ---------------------------------------------------------------------------
// AbaTemplates
// ---------------------------------------------------------------------------

export function AbaTemplates({ ownerId }: AbaTemplatesProps) {
  return (
    <ConstrutorTemplate
      ownerId={ownerId}
    />
  );
}
