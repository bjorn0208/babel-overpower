/**
 * Chaves PIX cadastradas de um tenant — fonte única pro guard de chave PIX
 * (`guards-pix.ts`) e pra ferramenta de contrato quando o produto não usa contrato.
 *
 * Lê de onde o dono cadastra chave hoje: perfil (profiles.chave_pix), moldes de
 * contrato ativos (contratos_template.chave_pix), consultas (consultas_config_tenant)
 * e rifas (rifas_config_tenant). Cada leitura é best-effort: tabela sem linha ou sem
 * permissão não derruba o turno.
 */

export interface ChavesPixTenant {
  /** Todas as chaves encontradas, como estão no banco (sem normalizar). */
  chaves: string[];
  /** A chave "bonita" pra mostrar ao lead: prefere a do molde de contrato (formatada), senão a do perfil. */
  exibicao: string | null;
  /** Nome do titular pra acompanhar a chave (razão social ou nome do perfil). */
  titular: string | null;
}

// deno-lint-ignore no-explicit-any
export async function carregarChavesPixTenant(sb: any, tenantId: string): Promise<ChavesPixTenant> {
  const chaves: string[] = [];
  let exibicao: string | null = null;
  let titular: string | null = null;

  const limpa = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length >= 6 ? s : null;
  };

  try {
    const { data: perfil } = await sb
      .from("profiles").select("chave_pix, razao_social, full_name").eq("id", tenantId).maybeSingle();
    const c = limpa(perfil?.chave_pix);
    if (c) chaves.push(c);
    titular = (perfil?.razao_social as string | null) || (perfil?.full_name as string | null) || null;
  } catch { /* best-effort */ }

  try {
    const { data: moldes } = await sb
      .from("contratos_template").select("chave_pix").eq("user_id", tenantId).eq("ativo", true);
    for (const m of (moldes ?? []) as { chave_pix: unknown }[]) {
      const c = limpa(m.chave_pix);
      if (c) { chaves.push(c); if (!exibicao) exibicao = c; }
    }
  } catch { /* best-effort */ }

  for (const tabela of ["consultas_config_tenant", "rifas_config_tenant"]) {
    try {
      const { data: cfg } = await sb.from(tabela).select("chave_pix").eq("tenant_id", tenantId).maybeSingle();
      const c = limpa(cfg?.chave_pix);
      if (c) chaves.push(c);
    } catch { /* tabela pode não ter linha pro tenant */ }
  }

  if (!exibicao) exibicao = chaves[0] ?? null;
  return { chaves: Array.from(new Set(chaves)), exibicao, titular };
}
