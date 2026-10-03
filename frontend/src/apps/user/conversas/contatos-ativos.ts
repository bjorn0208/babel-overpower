/**
 * Regra de roteamento do contato (cravada do banco): `leads.location`.
 *  - 'atendimento' / 'cliente' → ATIVO, aparece no app Conversas
 *  - 'base' → saiu (serviço concluído / arquivado) → app Base (sub-projeto 3)
 *
 * RPC oficial que move pra Base: `enviar_para_base` (seta `location='base'`
 * + encerra a conversa). Onda 2026-05-16.
 *
 * Conservador: location nulo/vazio/desconhecido = ATIVO — não esconde
 * contato por dado faltante (some na Base só quem foi explicitamente pra lá).
 */
export const LOCATION_BASE = "base" as const;

export function ehContatoAtivo(location: string | null | undefined): boolean {
  return location !== LOCATION_BASE;
}
