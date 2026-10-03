/**
 * Dados do app Base: contatos que saíram do Conversas (`leads.location='base'`,
 * concluído/arquivado) + pastas (grupos) + métricas (RPC `metricas_base`).
 * Membro de pasta aparece MESMO quando voltou pro Conversas (`em_conversa`) —
 * a pasta não perde o contato (decisão Theus 2026-07-05). O dado rico do
 * contato vem do Dossiê (motor RAGENTIC) ao abrir. Onda 3.1.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizarMetricasBase, type MetricasBase } from "./metricas-base";
import { listarPastas, type PastaBase } from "./pastas-base";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

export interface ContatoBase {
  id: string;
  nome: string;
  telefone: string;
  foto_url?: string;
  produto: string | null;
  tags: string[];
  fase_cliente: string | null;
  criado_em: string;
  conversa_id: string | null;
  /** Pasta onde o contato vive (null = solto na Base). */
  pasta_base_id: string | null;
  /** true = voltou pro app Conversas (location ≠ 'base') mas segue na pasta. */
  em_conversa: boolean;
}

const PAGE = 1000;
const MAX_LOTES = 12;

export function useBase() {
  const [contatos, setContatos] = useState<ContatoBase[]>([]);
  const [pastas, setPastas] = useState<PastaBase[]>([]);
  const [metricas, setMetricas] = useState<MetricasBase>(normalizarMetricasBase(null));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid) {
        setErro("sem-sessao");
        setCarregando(false);
        return;
      }
      // Membro de equipe: os leads são do dono da conta (tenant_id = dono). Sem
      // resolver o `parent_user_id` o filtro explícito por uid do membro devolve
      // Base vazia. Padrão do projeto (useConversasLive/acoes-cliente).
      const { data: perfil } = await sb
        .from("profiles")
        .select("parent_user_id")
        .eq("id", uid)
        .maybeSingle();
      const idTenant = (perfil?.parent_user_id as string | null) ?? uid;
      setTenantId(idTenant);

      // Pool da Base: soltos concluídos (location='base') + TODO mundo com pasta
      // (mesmo quem voltou pro Conversas — a pasta segura o vínculo).
      const lotes = await Promise.all(
        Array.from({ length: MAX_LOTES }, (_, i) =>
          sb.from("leads")
            .select("id, nome_exibicao, name, phone, url_foto_perfil, produto, tags, converted_at, created_at, fase_cliente, pasta_base_id, location")
            .eq("tenant_id", idTenant)
            .or("location.eq.base,pasta_base_id.not.is.null")
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .range(i * PAGE, i * PAGE + PAGE - 1)
            .then((r: { data: unknown[] | null }) => r.data ?? []),
        ),
      );
      const leads = lotes.flat() as Array<Record<string, unknown>>;

      const leadIds = leads.map((l) => String(l.id));
      const convPorLead = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: convs } = await sb.from("conversas")
          .select("id, lead_id, updated_at")
          .in("lead_id", leadIds.slice(0, 1000))
          .order("updated_at", { ascending: false });
        for (const c of (convs ?? []) as Array<{ id: string; lead_id: string }>) {
          if (!convPorLead.has(String(c.lead_id))) convPorLead.set(String(c.lead_id), String(c.id));
        }
      }

      const [listaPastas, { data: metRaw }] = await Promise.all([
        listarPastas(idTenant),
        sb.rpc("metricas_base", { p_tenant_id: idTenant }),
      ]);

      setContatos(
        leads.map((l) => ({
          id: String(l.id),
          nome: String(l.nome_exibicao || l.name || l.phone || "Sem nome"),
          telefone: String(l.phone ?? ""),
          foto_url: typeof l.url_foto_perfil === "string" && l.url_foto_perfil ? l.url_foto_perfil : undefined,
          produto: (l.produto as string | null) ?? null,
          tags: Array.isArray(l.tags) ? (l.tags as string[]) : [],
          fase_cliente: (l.fase_cliente as string | null) ?? null,
          criado_em: String(l.converted_at ?? l.created_at ?? new Date().toISOString()),
          conversa_id: convPorLead.get(String(l.id)) ?? null,
          pasta_base_id: (l.pasta_base_id as string | null) ?? null,
          em_conversa: String(l.location ?? "base") !== "base",
        })),
      );
      setPastas(listaPastas);
      setMetricas(normalizarMetricasBase(metRaw));
      setErro(null);
      setCarregando(false);
    } catch (e) {
      setErro((e as Error).message ?? "erro");
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    void recarregar().then(() => { if (!ativo) return; });
    return () => { ativo = false; };
  }, [recarregar]);

  return { contatos, pastas, metricas, carregando, erro, tenantId, recarregar };
}
