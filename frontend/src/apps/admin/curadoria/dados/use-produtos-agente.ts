import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProdutoAgente {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  unidade: string;
  descricao?: string;
  ativo: boolean;
  estoque_agenda?: number | null;
}

export interface UseProdutosAgenteResultado {
  status: "ocioso" | "carregando" | "ok" | "erro";
  produtos: ProdutoAgente[];
  agenteId: string | null;
  erro: string | null;
  refetch: () => Promise<void>;
  salvar: (produto: ProdutoAgente) => Promise<void>;
  toggleAtivo: (id: string, ativo: boolean) => Promise<void>;
}

/**
 * Hook persistente pra AbaProdutos.
 * Lê `agentes_usuario.fluxo.produtos` (jsonb array) do tenant impersonado,
 * permite UPDATE granular (1 produto) ou toggle ativo.
 *
 * Estratégia: SELECT fluxo → modifica array em memória → UPDATE fluxo completo.
 * Last-write-wins (sem CAS — concorrência baixa nesse contexto admin).
 */
export function useProdutosAgente(tenantId: string | null | undefined): UseProdutosAgenteResultado {
  const [status, setStatus] = useState<"ocioso" | "carregando" | "ok" | "erro">("ocioso");
  const [produtos, setProdutos] = useState<ProdutoAgente[]>([]);
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [fluxoCompleto, setFluxoCompleto] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    if (!tenantId) {
      setProdutos([]);
      setStatus("ocioso");
      return;
    }
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("agentes_usuario")
      .select("id, fluxo")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!ativoRef.current) return;

    if (error) {
      console.error("[useProdutosAgente] erro:", error.message);
      setStatus("erro");
      setErro(error.message);
      return;
    }

    const fluxo = (data?.fluxo ?? {}) as Record<string, unknown>;
    const lista = Array.isArray(fluxo.produtos) ? fluxo.produtos : [];

    setAgenteId(data?.id ?? null);
    setFluxoCompleto(fluxo);
    setProdutos(
      lista.map((p: Record<string, unknown>, idx: number) => ({
        id: (p.id as string) ?? String(idx),
        nome: (p.nome as string) ?? "—",
        categoria: (p.categoria as string) ?? "geral",
        preco: Number(p.preco ?? 0),
        unidade: (p.unidade as string) ?? "un",
        descricao: (p.descricao as string) ?? "",
        ativo: p.ativo !== false,
        estoque_agenda: (p.estoque_agenda as number | null) ?? null,
      })),
    );
    setStatus("ok");
  }, [tenantId]);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => {
      ativoRef.current = false;
    };
  }, [carregar]);

  const persistirArray = useCallback(
    async (novaLista: ProdutoAgente[]): Promise<boolean> => {
      if (!agenteId) return false;
      const novoFluxo = { ...fluxoCompleto, produtos: novaLista };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("agentes_usuario")
        .update({ fluxo: novoFluxo })
        .eq("id", agenteId);
      if (error) {
        console.error("[useProdutosAgente] erro UPDATE fluxo:", error.message);
        setErro(error.message);
        return false;
      }
      setFluxoCompleto(novoFluxo);
      return true;
    },
    [agenteId, fluxoCompleto],
  );

  const salvar = useCallback(
    async (produto: ProdutoAgente) => {
      const novaLista = produtos.map((p) => (p.id === produto.id ? produto : p));
      setProdutos(novaLista);
      const ok = await persistirArray(novaLista);
      if (!ok) carregar();
    },
    [produtos, persistirArray, carregar],
  );

  const toggleAtivo = useCallback(
    async (id: string, ativo: boolean) => {
      const novaLista = produtos.map((p) => (p.id === id ? { ...p, ativo } : p));
      setProdutos(novaLista);
      const ok = await persistirArray(novaLista);
      if (!ok) {
        setProdutos((atual) => atual.map((p) => (p.id === id ? { ...p, ativo: !ativo } : p)));
      }
    },
    [produtos, persistirArray],
  );

  return { status, produtos, agenteId, erro, refetch: carregar, salvar, toggleAtivo };
}
