/**
 * Freio de mão de campanhas e disparos, por tenant.
 *
 * Pedido do Theus (2026-09-17): "um botão de pausa que pausa tudo". A flag vive
 * em `profiles.campaign_settings.disparos_pausados` (jsonb que já existia, sem
 * migration) e é escrita pelo app Campanha (`dados-pausa.ts`).
 *
 * ESCOPO combinado: segura CAMPANHAS e DISPAROS do Mentor. NÃO cala a agente nas
 * conversas — lead que escreve continua sendo respondido.
 *
 * Quem lê: `processar-campanhas` (não inscreve nem agenda), `processar-acompanhamentos`
 * (ação de campanha já enfileirada é REAGENDADA, não morre) e `processar-disparos-lead`.
 */

/** true = tenant com envios pausados. Erro de leitura NÃO pausa (não trava a plataforma). */
// deno-lint-ignore no-explicit-any
export async function tenantPausado(supabase: any, tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("campaign_settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    console.error(`[pausa-tenant] não consegui ler a pausa de ${tenantId}: ${error.message}`);
    return false;
  }
  return (data?.campaign_settings as Record<string, unknown> | null)?.disparos_pausados === true;
}

/** Versão em lote: devolve o conjunto dos tenants pausados entre os informados. */
// deno-lint-ignore no-explicit-any
export async function tenantsPausados(supabase: any, tenantIds: string[]): Promise<Set<string>> {
  const unicos = [...new Set(tenantIds.filter(Boolean))];
  if (unicos.length === 0) return new Set();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, campaign_settings")
    .in("id", unicos);
  if (error) {
    console.error(`[pausa-tenant] leitura em lote falhou: ${error.message}`);
    return new Set();
  }
  const pausados = new Set<string>();
  for (const row of (data ?? []) as Array<{ id: string; campaign_settings: Record<string, unknown> | null }>) {
    if (row.campaign_settings?.disparos_pausados === true) pausados.add(row.id);
  }
  return pausados;
}
