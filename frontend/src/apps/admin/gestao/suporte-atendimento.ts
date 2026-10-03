/**
 * Criar (ou recuperar) o atendimento de suporte de uma implementação concluída — artefato `novoAtendSuporte`
 * :1992-2001 e `garantirAtend` :2002-2005.
 *
 * Quando acontece (a mesma regra do artefato):
 *  - na conclusão ("Teste realizado, enviar ao suporte", modal-finalizar.tsx);
 *  - e, se faltar (A3 da auditoria: conclusão que falhou no meio, ou dado antigo), quando alguém ABRE ou INICIA o
 *    cliente na lista do Suporte (artefato :3200-3201). A lista do Suporte parte das implementações concluídas,
 *    então o cliente aparece lá mesmo sem atendimento e se conserta sozinho no primeiro clique.
 *
 * `id_origem = "sa-<id da implementação>"` (o id do artefato) é ÚNICO no banco, inclusive em linha apagada. Se já
 * existe uma linha apagada com essa origem (ex.: "Reabrir em validação" apagou o atendimento intocado), ela volta
 * zerada — como o artefato, que regrava o documento inteiro (`save(..., false)`). Quem pode inserir/alterar é a RLS
 * (`suporte_atend_ins/upd`: implementação, suporte e admin).
 */

import { ErroDados, atualizar, inserir, suporteAtendPorOrigem } from "./dados";
import { atendimentoDaImpl } from "./logica-atendimento";
import type { Implementacao, SuporteAtend } from "./tipos";

export async function garantirAtendimento(
  im: Implementacao,
  suporteAtend: SuporteAtend[],
  opcoes: { nomeCliente: string; responsavel?: string | null; enviadoEm?: string | null },
): Promise<SuporteAtend> {
  const existente = atendimentoDaImpl(suporteAtend, im.id);
  if (existente) return existente;
  const idOrigem = `sa-${im.id}`;
  const corpo = {
    cliente_id: im.cliente_id,
    cliente_nome: opcoes.nomeCliente,
    impl_id: im.id,
    enviado_em: opcoes.enviadoEm || im.concluido_em || new Date().toISOString(),
    status: "aguardando",
    // Sem `responsavel` informado (abrir/iniciar no Suporte), vale o do rodízio gravado na implementação (:2004).
    responsavel: (opcoes.responsavel !== undefined ? opcoes.responsavel : im.suporte_responsavel) || null,
    inicio: null,
    inicio_hora: null,
    tentativas: [],
    dias: {},
    concluido_em: null,
    obs_final: null,
    origem: "implementacao",
  };
  try {
    return (await inserir(
      "gestao_suporte_atend",
      { id_origem: idOrigem, ...corpo },
      "Não consegui abrir o atendimento no suporte.",
    )) as unknown as SuporteAtend;
  } catch (e) {
    if (!(e instanceof ErroDados) || e.codigo !== "23505") throw e;
    // Já existe uma linha com essa origem: apagada (volta zerada) ou criada agora por outra pessoa (usa ela).
    const achada = await suporteAtendPorOrigem(idOrigem);
    if (!achada) throw e;
    // Viva: só confirma o vínculo e devolve a linha. Apagada: volta zerada, com o corpo novo.
    const patch = achada.deleted_at ? { ...corpo, deleted_at: null } : { impl_id: im.id };
    return (await atualizar(
      "gestao_suporte_atend",
      achada.id,
      patch,
      "Não consegui abrir o atendimento no suporte.",
    )) as unknown as SuporteAtend;
  }
}
