/**
 * Quem é a pessoa logada DENTRO DO TIME — artefato `minhaPessoa` :3269 (`S.acessos[eu].pessoa`), que no app é
 * `gestao_acessos.pessoa` ("No time como", aba Acessos). É o nome que os responsáveis, a carga por pessoa e os
 * filtros comparam; o nome do PERFIL (`meuNome`) só assina registros (`por`).
 *
 * A4 da auditoria (2026-09-24): "Assumir" gravava o nome do perfil como responsável. Agora grava esta pessoa.
 * Mesma leitura da aba Tarefas (aba-tarefas.tsx:206-213): a RLS deixa cada um ler a própria linha
 * (`acessos_le`). Sem linha, sem pessoa ou com erro: `""` — como o artefato, que então não usa pessoa nenhuma.
 */

import { useEffect, useState } from "react";
import { lerTabela } from "./dados";
import type { Acesso } from "./tipos";

export function useMinhaPessoa(uid: string | null): string {
  const [pessoa, setPessoa] = useState("");
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    lerTabela<Acesso>("gestao_acessos", "criado_em")
      .then((linhas) => {
        const p = (linhas.find((a) => a.id === uid)?.pessoa ?? "").trim();
        if (vivo) setPessoa(p);
      })
      .catch(() => {
        if (vivo) setPessoa("");
      });
    return () => {
      vivo = false;
    };
  }, [uid]);
  return pessoa;
}
