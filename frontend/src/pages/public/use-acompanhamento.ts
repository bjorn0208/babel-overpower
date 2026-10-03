/**
 * Hook de dados da página pública de acompanhamento do cliente.
 * Portado do frontend antigo (`use-acompanhamento-publico.ts`) adaptado ao
 * cliente Supabase do novo. Lógica pura em `acompanhamento-logica.ts`.
 * Onda 2026-05-16 (pedaço 2/3). Token = `leads.chave_rastreamento`.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  calcularProgresso,
  calcularTimer,
  escolherFluxoParaLead,
  normalizarListaFluxosPublico,
  type FluxoProduto,
} from "./acompanhamento-logica";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

export type ContratoPublicoResumo = {
  chave_publica: string;
  titulo: string | null;
  status: string;
  assinado_em: string | null;
  nome_empresa: string | null;
};
export type DocumentoPublico = {
  id: string;
  file_name: string;
  label: string | null;
  file_path: string;
  file_type: string | null;
  created_at: string;
};
export type EmpresaPublica = {
  nome: string | null;
  cnpj: string | null;
  descricao: string | null;
  logo_url: string | null;
  banner_url: string | null;
  whatsapp: string | null;
  instagram: string | null;
  site: string | null;
  cidade: string | null;
  estado: string | null;
};

export function useAcompanhamento(token: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [produto, setProduto] = useState("");
  const [flow, setFlow] = useState<FluxoProduto | null>(null);
  const [checkpoints, setCheckpoints] = useState<Record<string, boolean>>({});
  const [contrato, setContrato] = useState<ContratoPublicoResumo | null>(null);
  const [convertedAt, setConvertedAt] = useState<string | null>(null);
  const [faseCliente, setFaseCliente] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaPublica | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoPublico[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }
    const sb = supabase as SupabaseBruto;
    try {
      // A tabela `leads` só libera SELECT pra `authenticated` (RLS). O visitante
      // anônimo do link público de acompanhamento caía sempre em erro na busca
      // direta. A RPC SECURITY DEFINER `get_lead_tracking_status` recebe a chave
      // de rastreamento e devolve o status do lead sem expor a tabela inteira.
      // TODO(acompanhamento): a RPC tem projeção mínima e NÃO retorna
      // nome_exibicao/name/phone/produto/converted_at. Com isso, no fluxo anônimo
      // o nome e o produto ficam vazios e o timer parte de "sem conversão".
      // Recuperar esses campos exige estender a RPC no banco (DDL — fora do
      // escopo deste fix de frontend). Os campos abaixo são lidos defensivamente
      // caso a RPC passe a expô-los.
      const { data: linhas } = await sb.rpc("get_lead_tracking_status", {
        _chave: token,
      });
      const lead = Array.isArray(linhas) ? linhas[0] : linhas;

      if (!lead) {
        setError(true);
        setLoading(false);
        return;
      }

      setLeadId(lead.id);
      setLeadName(lead.nome_exibicao || lead.name || lead.phone || "");
      setProduto(lead.produto || "");
      setCheckpoints(lead.client_checkpoints || {});
      if (lead.converted_at) setConvertedAt(lead.converted_at);
      if (lead.fase_cliente) setFaseCliente(lead.fase_cliente);

      const [contratoRes, empresaRes, docsRes, flowsRes] = await Promise.all([
        lead.id
          ? sb
              .from("contratos")
              .select("chave_publica, titulo, status, assinado_em, nome_empresa")
              .eq("lead_id", lead.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        sb.rpc("obter_dados_publicos_empresa", { p_token: token }),
        sb.rpc("obter_documentos_publicos_cliente", { p_token: token }),
        sb.rpc("obter_fluxo_publico_servico", { p_token: token }),
      ]);

      if (contratoRes.data) setContrato(contratoRes.data as ContratoPublicoResumo);
      if (empresaRes.data) setEmpresa(empresaRes.data as EmpresaPublica);
      if (Array.isArray(docsRes.data)) setDocumentos(docsRes.data as DocumentoPublico[]);

      const lista = normalizarListaFluxosPublico(flowsRes.data);
      const escolhido = escolherFluxoParaLead(lista, lead.produto);
      if (escolhido) setFlow(escolhido);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!token) return;
    // Fluxo anônimo (link público): o visitante NÃO é `authenticated`, então a
    // RLS filtra o realtime do mesmo jeito que filtra o SELECT — o canal
    // `postgres_changes` em `leads`/`contratos` nunca entregaria evento pra ele.
    // Em vez de realtime (inerte pro anon), faz polling periódico chamando a RPC
    // de status. Atualiza o acompanhamento sem depender de realtime.
    const id = window.setInterval(() => { void carregar(); }, 20000);
    return () => { window.clearInterval(id); };
  }, [token, carregar]);

  const alternarCheckpoint = useCallback(
    async (cpId: string) => {
      if (!token || toggling) return;
      setToggling(cpId);
      const novoValor = !checkpoints[cpId];
      setCheckpoints((prev) => ({ ...prev, [cpId]: novoValor }));
      try {
        const sb = supabase as SupabaseBruto;
        await sb.rpc("alternar_checkpoint_publico", {
          p_token: token,
          p_checkpoint_id: cpId,
          p_value: novoValor,
        });
      } catch {
        setCheckpoints((prev) => ({ ...prev, [cpId]: !novoValor }));
      }
      setToggling(null);
    },
    [token, toggling, checkpoints],
  );

  const attDays = flow?.timer_attention_days ?? 7;
  const lateDays = flow?.timer_late_days ?? 30;
  const timer = calcularTimer(convertedAt, attDays, lateDays);
  const progresso = calcularProgresso(flow, checkpoints);

  function urlDocumento(filePath: string): string {
    return supabase.storage.from("documentos-cliente").getPublicUrl(filePath).data.publicUrl;
  }

  return {
    loading, error, leadName, produto, flow, checkpoints, contrato, convertedAt,
    faseCliente, toggling, empresa, documentos,
    days: timer.days, isLate: timer.isLate, isAttention: timer.isAttention,
    timerColor: timer.timerColor, timerLabel: timer.timerLabel,
    progressPct: progresso.progressPct,
    alternarCheckpoint, urlDocumento,
  };
}
