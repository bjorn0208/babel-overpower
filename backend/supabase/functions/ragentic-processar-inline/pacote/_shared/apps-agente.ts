// _shared/apps-agente.ts
// Fonte única: quais recursos de app estão ATIVOS pro agente de um tenant.
//
// Catraca por app (em ordem):
//   1) app instalado  — só exige se o app está no catálogo da loja (loja_aplicativos)
//   2) toggle ligado  — o dono autorizou o agente a usar
//   3) saldo           — só apps com custo (hoje só Consulta)
// Faltou um portão → o recurso fica inativo pro agente (igual toggle desligado).
//
// - Consulta: app de catálogo + tem custo → os 3 portões, encapsulados na RPC
//   `consulta_pode_vender` (instalação + agente_pode_vender + saldo >= custo de 1 consulta).
// - Agenda: app de catálogo desde 2026-07-05 (decisão Theus: sistema × loja) → exige
//   instalação + toggle `agente_pode_agendar`. Sem custo.

export type RecursosAgente = {
  /** App Consulta liberado pro agente vender (instalado + toggle + saldo). */
  consulta: boolean;
  /** App Agenda liberado pro agente agendar (core: só o toggle). */
  agenda: boolean;
  /** App Rifas liberado pro agente VENDER números (instalado + toggle; sem custo). */
  rifas: boolean;
  /**
   * App Rifas liberado pro agente LER (instalado, sem depender do toggle de venda).
   *
   * Informar não é vender: o dono que desliga `agente_pode_vender` está dizendo que o agente
   * não reserva número — não que ele deva fingir não saber qual rifa existe. Sem esta
   * separação, o toggle desligado tirava as 15 tools de rifa da lista e o agente respondia
   * "vou checar com o dono" para "que rifa tem?". (achado 2026-09-07, caso Lucy)
   */
  rifasLeitura: boolean;
};

/**
 * Carrega o mapa de recursos de app ativos pro agente do tenant.
 * Falha de leitura degrada pra bloqueado (recurso fora) — nunca libera por erro.
 */
export async function carregarRecursosAgente(
  // deno-lint-ignore no-explicit-any
  sb: any,
  tenantId: string,
): Promise<RecursosAgente> {
  const [consultaRes, agendaRes, agendaInstaladaRes, rifasRes, rifasInstaladaRes] = await Promise.all([
    sb.rpc("consulta_pode_vender", { p_tenant_id: tenantId }),
    sb
      .from("agenda_config_tenant")
      .select("agente_pode_agendar")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    sb
      .from("aplicativos_instalados")
      .select("id")
      .eq("user_id", tenantId)
      .eq("aplicativo_slug", "agenda")
      .maybeSingle(),
    sb.rpc("rifa_pode_vender", { p_tenant_id: tenantId }),
    sb
      .from("aplicativos_instalados")
      .select("id")
      .eq("user_id", tenantId)
      .eq("aplicativo_slug", "rifas")
      .maybeSingle(),
  ]);

  return {
    consulta: consultaRes?.data === true,
    agenda:
      agendaRes?.data?.agente_pode_agendar === true &&
      Boolean(agendaInstaladaRes?.data?.id),
    rifas: rifasRes?.data === true,
    rifasLeitura: Boolean(rifasInstaladaRes?.data?.id),
  };
}
