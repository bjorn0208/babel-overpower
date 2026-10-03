/**
 * Estado dos Pacotes de Conhecimento para um agente: pacotes visíveis, blocos,
 * ON/OFF por pacote e instalações da Loja. Usado pelo card do mapa e pela tela.
 */

import { useCallback, useEffect, useState } from "react";
import {
  listarAtivacoes,
  listarBlocos,
  listarInstalacoes,
  listarPacotes,
  mensagemErro,
} from "./dados-pacotes";
import { situacaoPacote, type BlocoPacote, type Pacote } from "./logica-pacotes";

export type EstadoPacotesAgente = {
  pacotes: Pacote[];
  blocos: BlocoPacote[];
  ligados: Record<string, boolean>;
  instalados: Set<string>;
};

export function usePacotesAgente(tenantId: string, agenteId: string | null, nonce = 0) {
  const [estado, setEstado] = useState<EstadoPacotesAgente | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [pacotes, ligados, instalados] = await Promise.all([
        listarPacotes(),
        agenteId ? listarAtivacoes(agenteId) : Promise.resolve({}),
        listarInstalacoes(tenantId),
      ]);
      // Admin enxerga pacotes de todos os tenants; aqui só entram os da Babel e os deste tenant.
      const visiveis = pacotes.filter((p) => p.origem === "admin" || p.tenant_id === tenantId);
      const blocos = await listarBlocos(visiveis.map((p) => p.id));
      setEstado({ pacotes: visiveis, blocos, ligados, instalados });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [tenantId, agenteId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, nonce]);

  return { estado, erro, recarregar };
}

/** Quantos pacotes estão ligados e valendo para o agente (card do mapa). */
export function contarLigados(estado: EstadoPacotesAgente | null): number {
  if (!estado) return 0;
  return estado.pacotes.filter(
    (p) =>
      p.ativo &&
      situacaoPacote(p, {
        ligado: !!estado.ligados[p.id],
        instalado: !!p.loja_aplicativo_id && estado.instalados.has(p.loja_aplicativo_id),
      }) === "ligado",
  ).length;
}
