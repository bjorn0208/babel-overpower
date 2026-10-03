/**
 * Pessoas de suporte para o responsável do chamado e o rodízio (revisão final I3, 25/09): membros do app Equipe
 * (gestao_config.equipe.membros) + quem recebeu a função Suporte pela aba Acessos (função gestao_pessoas_suporte, só
 * nomes). Se a função ainda não existir no banco ou falhar, segue só com os membros — a tela nunca quebra por isso.
 */
import { useEffect, useState } from "react";
import { sb } from "./dados";
import { membrosSuporte } from "./calculos";

export function usePessoasSuporte(config: Record<string, unknown>): { equipe: string[]; deAcessos: string[] } {
  const [deAcessos, setDeAcessos] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(sb().rpc("gestao_pessoas_suporte"))
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (error) throw error;
        const nomes = Array.isArray(data) ? data.map((l) => (l as { nome?: unknown })?.nome).filter((n): n is string => typeof n === "string") : [];
        if (vivo) setDeAcessos(nomes);
      })
      .catch((e: unknown) => console.warn("[Gestão] pessoas de suporte (Acessos) indisponíveis; seguindo só com o app Equipe", e));
    return () => {
      vivo = false;
    };
  }, []);
  return { equipe: membrosSuporte(config, deAcessos), deAcessos };
}
