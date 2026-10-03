// Aba "Aprendizado" do dossiê — exibe as novidades das Ondas 6-16:
//   - Pilha de objetivos abertos (Onda 13)
//   - Perfil destilado da empresa (Onda 11 + 12 B3-V2 LLM Mentor)
// Lê banco direto. Atualiza a cada abertura da aba.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Conversa } from "../tipos";

interface PilhaObjetivo {
  id: string;
  objetivo: string;
  contexto: string | null;
  prioridade: number;
  criado_em: string;
}

interface PerfilEmpresa {
  segmento: string | null;
  ticket_medio_estimado: number | null;
  prazo_decisao_medio_dias: number | null;
  taxa_conversao_estimada: number | null;
  top_objecoes: string[] | null;
  top_pontos_dor: string[] | null;
  top_diferenciais: string[] | null;
  argumentos_ganhadores: string[] | null;
  argumentos_perdedores: string[] | null;
  perfil_lead_ideal: string | Record<string, unknown> | null;
  destilacao_ultima_em: string | null;
  versao: number;
}

interface AbaAprendizadoProps {
  conversa: Conversa;
  conversaIdOverride?: string | null;
}

export function AbaAprendizado({ conversa, conversaIdOverride }: AbaAprendizadoProps) {
  const convId = conversaIdOverride ?? conversa.id;
  const [pilha, setPilha] = useState<PilhaObjetivo[]>([]);
  const [perfil, setPerfil] = useState<PerfilEmpresa | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      setCarregando(true);
      // pilha objetivos abertos da conversa
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: objs } = await (supabase as any)
        .from("pilha_objetivos")
        .select("id, objetivo, contexto, prioridade, criado_em")
        .eq("conversa_id", convId)
        .eq("status", "aberto")
        .is("deleted_at", null)
        .order("prioridade", { ascending: true })
        .limit(10);

      // descobrir tenant_id da conversa
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: convRow } = await (supabase as any)
        .from("conversas")
        .select("tenant_id")
        .eq("id", convId)
        .maybeSingle();
      const tenantId = convRow?.tenant_id;
      // perfil empresa do tenant da conversa
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let pe: Record<string, unknown> | null = null;
      if (tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("perfil_empresa")
          .select("segmento, ticket_medio_estimado, prazo_decisao_medio_dias, taxa_conversao_estimada, top_objecoes, top_pontos_dor, top_diferenciais, argumentos_ganhadores, argumentos_perdedores, perfil_lead_ideal, destilacao_ultima_em, versao")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .maybeSingle();
        pe = data;
      }

      if (!ativo) return;
      setPilha(objs ?? []);
      setPerfil((pe as unknown as PerfilEmpresa | null) ?? null);
      setCarregando(false);
    }
    carregar();
    return () => { ativo = false; };
  }, [convId]);

  if (carregando) {
    return <div className="p-4 text-sm text-txt3">carregando aprendizado...</div>;
  }

  const renderLista = (titulo: string, itens: string[] | null | undefined, tom: "neutro" | "positivo" | "negativo" = "neutro") => {
    if (!itens || itens.length === 0) return null;
    const cor = tom === "positivo" ? "oklch(0.65 0.18 145)" : tom === "negativo" ? "oklch(0.55 0.22 25)" : "var(--txt-2)";
    return (
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: cor }}>{titulo}</div>
        <ul className="space-y-1">
          {itens.slice(0, 5).map((it, i) => (
            <li key={i} className="text-sm text-txt-1 pl-3 border-l border-borda">
              {typeof it === "string" ? it : JSON.stringify(it)}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-6 overflow-y-auto">
      {/* Pilha de Objetivos (Onda 13 — Goal Stack) */}
      <section>
        <h3 className="text-sm font-medium text-txt-1 mb-2">
          🎯 Pilha de objetivos abertos
          <span className="text-xs text-txt3 font-normal ml-2">(Goal Stack — agente lembra entre turnos)</span>
        </h3>
        {pilha.length === 0 ? (
          <div className="text-sm text-txt3 italic">Nenhum objetivo aberto agora.</div>
        ) : (
          <ul className="space-y-2">
            {pilha.map((obj) => (
              <li key={obj.id} className="border border-borda rounded p-2 bg-pano">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-txt-1">{obj.objetivo}</span>
                  <span className="text-xs text-txt3 shrink-0">prioridade {obj.prioridade}</span>
                </div>
                {obj.contexto && (
                  <div className="text-xs text-txt-2">{obj.contexto}</div>
                )}
                <div className="text-xs text-txt3 mt-1">
                  aberto em {new Date(obj.criado_em).toLocaleString("pt-BR")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Perfil da Empresa (Onda 11 + 12 B3-V2) */}
      <section>
        <h3 className="text-sm font-medium text-txt-1 mb-2">
          🏢 Perfil destilado da empresa
          <span className="text-xs text-txt3 font-normal ml-2">
            (B3-V2 — atualizado pela LLM Mentor)
          </span>
        </h3>
        {!perfil ? (
          <div className="text-sm text-txt3 italic">Perfil ainda não destilado pra este tenant.</div>
        ) : (
          <div>
            {/* Metadados */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
              {perfil.segmento && (
                <div className="border border-borda rounded p-2">
                  <div className="text-txt3">Segmento</div>
                  <div className="text-txt-1 font-medium">{perfil.segmento}</div>
                </div>
              )}
              {perfil.ticket_medio_estimado != null && (
                <div className="border border-borda rounded p-2">
                  <div className="text-txt3">Ticket médio</div>
                  <div className="text-txt-1 font-medium">R$ {perfil.ticket_medio_estimado}</div>
                </div>
              )}
              {perfil.taxa_conversao_estimada != null && (
                <div className="border border-borda rounded p-2">
                  <div className="text-txt3">Taxa conversão</div>
                  <div className="text-txt-1 font-medium">
                    {(perfil.taxa_conversao_estimada * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {/* Qualitativo */}
            {renderLista("Top objeções (vai aparecer)", perfil.top_objecoes, "negativo")}
            {renderLista("Top pontos de dor", perfil.top_pontos_dor, "negativo")}
            {renderLista("Top diferenciais", perfil.top_diferenciais, "positivo")}
            {renderLista("Argumentos que ganham", perfil.argumentos_ganhadores, "positivo")}
            {renderLista("Argumentos que perdem (evite)", perfil.argumentos_perdedores, "negativo")}

            {perfil.perfil_lead_ideal && (
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wide text-txt-2 mb-1">Perfil lead ideal</div>
                <div className="text-sm text-txt-1 pl-3 border-l border-borda">
                  {typeof perfil.perfil_lead_ideal === "string"
                    ? perfil.perfil_lead_ideal
                    : JSON.stringify(perfil.perfil_lead_ideal)}
                </div>
              </div>
            )}

            <div className="text-xs text-txt3 mt-3">
              versão {perfil.versao}
              {perfil.destilacao_ultima_em && (
                <span> • atualizado {new Date(perfil.destilacao_ultima_em).toLocaleString("pt-BR")}</span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
