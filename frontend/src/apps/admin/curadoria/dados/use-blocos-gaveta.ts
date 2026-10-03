import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BlocoBase, EscopoCuradoria, GavetaBloco } from "./tipos";

// Campo de texto real de cada gaveta — o schema das 14 tabelas é heterogêneo
// (não existe coluna única "conteudo"). Usado na busca, na exibição (normalização)
// e na escrita (salvar/criar) para casar com a coluna correta de cada gaveta.
const CAMPO_TEXTO_GAVETA: Record<GavetaBloco, string> = {
  blocos_conhecimento: "content",
  blocos_comportamento: "instrucao",
  blocos_meta: "corpo",
  blocos_gatilho: "nome_trigger",
  blocos_procedurais: "nome_procedimento",
  blocos_humanizacao: "regra",
  blocos_variacao: "instrucao",
  diretriz_bolha_blocos: "contexto",
  regras_operacionais_blocos: "regra",
  anti_padroes: "situacao",
  emocao_blocos: "corpo",
  prova_social_blocos: "depoimento",
  manipulacao_blocos: "resposta_padrao",
  acao_pausa_blocos: "mensagem_retorno",
};

interface Estado {
  status: "carregando" | "ok" | "erro";
  blocos: BlocoBase[];
  total: number;
  erro: string | null;
}

/**
 * Contagem de blocos por gaveta (count head — não traz linhas). Alimenta a
 * sidebar da AbaBlocos: o admin vê onde tem conteúdo sem precisar clicar
 * gaveta por gaveta. 1 count por tabela, disparados juntos, 1× por montagem.
 */
export function useContagensGavetas(tabelas: readonly GavetaBloco[]): Record<string, number> {
  const [contagens, setContagens] = useState<Record<string, number>>({});
  useEffect(() => {
    let vivo = true;
    (async () => {
      const pares = await Promise.all(
        tabelas.map(async (t) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count } = await (supabase as any)
            .from(t)
            .select("id", { count: "exact", head: true });
          return [t, count ?? 0] as const;
        }),
      );
      if (vivo) setContagens(Object.fromEntries(pares));
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return contagens;
}

export function useBlocosGaveta(
  gaveta: GavetaBloco,
  escopo: EscopoCuradoria | "todos" = "todos",
  busca = "",
): Estado & {
  refetch: () => void;
  setBlocos: (updater: (bs: BlocoBase[]) => BlocoBase[]) => void;
  toggleAtivo: (id: string, ativo: boolean) => Promise<void>;
  salvar: (id: string, patch: Partial<BlocoBase>) => Promise<void>;
  criar: (carga: { conteudo: string; escopo: EscopoCuradoria; nicho_id?: string; tenant_id?: string }) => Promise<void>;
  excluir: (id: string) => Promise<void>;
} {
  const [estado, setEstado] = useState<Estado>({
    status: "carregando",
    blocos: [],
    total: 0,
    erro: null,
  });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        // supabase.from aceita string dinâmica mas os tipos gerados são por tabela literal —
        // usamos any justificado para tabelas da família blocos (14 gavetas com schema variado)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (supabase as any)
          .from(gaveta)
          .select("*", { count: "exact" })
          .is("deleted_at", null)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(50);

        if (escopo !== "todos") q = (q as any).eq("escopo", escopo);
        if (busca.trim()) {
          q = (q as any).ilike(CAMPO_TEXTO_GAVETA[gaveta], `%${busca.trim()}%`);
        }

        const { data, error, count } = await (q as any);

        if (!ativo) return;

        if (error) {
          console.warn("[useBlocosGaveta] erro:", error.message);
          setEstado({ status: "erro", blocos: [], total: 0, erro: error.message });
          return;
        }

        // Normaliza shape entre tabelas (blocos_conhecimento.content, blocos_gatilho.nome_trigger, etc → conteudo)
        const normalizados: BlocoBase[] = (data ?? []).map((r: Record<string, unknown>) => ({
          ...(r as unknown as BlocoBase),
          conteudo:
            (r[CAMPO_TEXTO_GAVETA[gaveta]] as string) ??
            (r.conteudo as string) ??
            (r.content as string) ??
            "(sem texto)",
          atualizado_em: (r.atualizado_em as string) ?? (r.updated_at as string) ?? (r.created_at as string) ?? "",
          criado_em: (r.criado_em as string) ?? (r.created_at as string) ?? "",
          ativo: r.ativo !== false,
          escopo: (r.escopo as EscopoCuradoria) ?? "global",
          embedding_status: (r.embedding_status as BlocoBase["embedding_status"]) ?? "pendente",
        }));
        setEstado({ status: "ok", blocos: normalizados, total: count ?? 0, erro: null });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        console.warn("[useBlocosGaveta] exceção:", msg);
        setEstado({ status: "erro", blocos: [], total: 0, erro: msg });
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [gaveta, escopo, busca, rev]);

  const setBlocos = (updater: (bs: BlocoBase[]) => BlocoBase[]) =>
    setEstado((e) => ({ ...e, blocos: updater(e.blocos) }));

  const toggleAtivo = async (id: string, ativo: boolean) => {
    setBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, ativo } : b)));
    const { error } = await (supabase as any).from(gaveta).update({ ativo }).eq("id", id);
    if (error) {
      console.error(`[useBlocosGaveta:${gaveta}] erro toggle ativo:`, error.message);
      setBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, ativo: !ativo } : b)));
    }
  };

  /**
   * Mapeia o patch normalizado (campos BlocoBase) de volta aos campos reais da tabela,
   * pois cada gaveta tem schema ligeiramente diferente (content vs conteudo, etc.).
   */
  function mapearPatchParaTabela(patch: Partial<BlocoBase>): Record<string, unknown> {
    const resultado: Record<string, unknown> = {};

    if (patch.escopo !== undefined) resultado.escopo = patch.escopo;
    if (patch.ativo !== undefined) resultado.ativo = patch.ativo;
    if (patch.tags !== undefined) resultado.tags = patch.tags;
    if (patch.nicho_id !== undefined) resultado.nicho_id = patch.nicho_id;
    if (patch.tenant_id !== undefined) resultado.tenant_id = patch.tenant_id;

    if (patch.conteudo !== undefined) {
      resultado[CAMPO_TEXTO_GAVETA[gaveta]] = patch.conteudo;
    }

    return resultado;
  }

  const salvar = async (id: string, patch: Partial<BlocoBase>) => {
    const campos = mapearPatchParaTabela(patch);
    // otimista
    setBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const { error } = await (supabase as any).from(gaveta).update(campos).eq("id", id);
    if (error) {
      console.error(`[useBlocosGaveta:${gaveta}] erro ao salvar:`, error.message);
      toast.error(`Erro ao salvar: ${error.message}`);
      setRev((r) => r + 1);
    } else {
      toast.success("Bloco salvo com sucesso");
    }
  };

  const criar = async (carga: { conteudo: string; escopo: EscopoCuradoria; nicho_id?: string; tenant_id?: string }) => {
    const campos = mapearPatchParaTabela({ conteudo: carga.conteudo, escopo: carga.escopo });
    const inserir: Record<string, unknown> = {
      ...campos,
      ativo: true,
      embedding_status: "pendente",
    };
    if (carga.nicho_id) inserir.nicho_id = carga.nicho_id;
    if (carga.tenant_id) inserir.tenant_id = carga.tenant_id;

    const { error } = await (supabase as any).from(gaveta).insert(inserir);
    if (error) {
      console.error(`[useBlocosGaveta:${gaveta}] erro ao criar:`, error.message);
      toast.error(`Erro ao criar bloco: ${error.message}`);
    } else {
      toast.success("Bloco criado com sucesso");
      setRev((r) => r + 1);
    }
  };

  const excluir = async (id: string) => {
    // soft delete via deleted_at
    setBlocos((bs) => bs.filter((b) => b.id !== id));
    const { error } = await (supabase as any)
      .from(gaveta)
      .update({ deleted_at: new Date().toISOString(), ativo: false })
      .eq("id", id);
    if (error) {
      console.error(`[useBlocosGaveta:${gaveta}] erro ao excluir:`, error.message);
      toast.error(`Erro ao excluir: ${error.message}`);
      setRev((r) => r + 1);
    } else {
      toast.success("Bloco excluído");
    }
  };

  return {
    ...estado,
    refetch: () => setRev((r) => r + 1),
    setBlocos,
    toggleAtivo,
    salvar,
    criar,
    excluir,
  };
}
