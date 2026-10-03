/**
 * Gravação do histórico de atendimento (Lote H): as 3 funções que chamam o banco (`atualizar`), em cima da
 * lógica pura de `logica-atendimento.ts` (formato exato das colunas/`extras`, testado em
 * `TESTES-CALCULOS/TESTAR-ATENDIMENTO.ts`). Reexporta tudo de lá para quem já importava daqui.
 *
 * Separado de `logica-atendimento.ts` porque este arquivo importa `./dados`, que importa
 * `@/integrations/supabase/client` — inviável de compilar no harness de teste (roda com `node`, sem os
 * aliases nem as variáveis de ambiente do app). A lógica que decide O FORMATO fica no arquivo puro,
 * testável; aqui só orquestra a chamada.
 */

import { atualizar } from "./dados";
import {
  patchDia,
  patchNovaTentativa,
  patchSemTentativa,
  tabelaDoContexto,
  type Contexto,
  type RegistroComHistorico,
} from "./logica-atendimento";
import type { Tentativa } from "./tipos";

export * from "./logica-atendimento";

/** Salva um campo do dia (impl: `dias`; programador: `extras.diasProg` — ver logica-atendimento.ts). */
export async function salvarCampoDia(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "id" | "dias" | "extras">,
  dia: number,
  campo: string,
  valor: string,
): Promise<Record<string, unknown>> {
  return atualizar(tabelaDoContexto(ctx), registro.id, patchDia(ctx, registro, dia, campo, valor));
}

/** Registra uma tentativa (impl/suporte/indicação: array em `tentativas`; programador: `extras.tentativasProg`). */
export async function registrarTentativa(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "id" | "tentativas" | "extras">,
  dados: Omit<Tentativa, "id">,
): Promise<Record<string, unknown>> {
  const nova: Tentativa = { ...dados, id: crypto.randomUUID() };
  return atualizar(tabelaDoContexto(ctx), registro.id, patchNovaTentativa(ctx, registro, nova));
}

export async function removerTentativa(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "id" | "tentativas" | "extras">,
  tentativaId: string,
): Promise<Record<string, unknown>> {
  return atualizar(tabelaDoContexto(ctx), registro.id, patchSemTentativa(ctx, registro, tentativaId));
}
