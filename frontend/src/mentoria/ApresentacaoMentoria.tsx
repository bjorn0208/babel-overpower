// Apresentação da mentoria — orquestrador da conta de apresentação.
// Substitui a antiga AberturaMentoria. Fluxo: lead loga na conta degustação
// (ponte Babel Central) → Diagnóstico Digital (dossiê enviado pelo BabelPhone)
// → salva dor/meta → desktop REAL do OS com o botão "Quero saber mais"
// (OfertaMentoria cuida da oferta, virada e agendamento da implementação).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import DiagnosticoDigital, { type RespostasDiagnostico } from "./DiagnosticoDigital";
import OfertaMentoria from "./OfertaMentoria";

type Estado = {
  nomeLead: string;
  empresaNome: string;
  agenteId: string | null;
  diagnostico: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export default function ApresentacaoMentoria({ userId }: { userId: string }) {
  const [fase, setFase] = useState<"oculta" | "diagnostico" | "sistema">("oculta");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const tentativasRef = useRef(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, account_status, metadata")
        .eq("id", userId)
        .maybeSingle();
      const meta = (p?.metadata ?? {}) as Record<string, unknown>;
      const ehApresentacao = meta.origem === "babel-central" && p?.account_status === "pendente";
      if (!vivo || !ehApresentacao) return;

      const [{ data: emp }, { data: ag }] = await Promise.all([
        supabase.from("empresas").select("nome").eq("user_id", userId).maybeSingle(),
        supabase.from("agentes").select("id").eq("user_id", userId)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (!vivo) return;
      setEstado({
        nomeLead: (p?.full_name ?? "").split(" ")[0] || "",
        empresaNome: emp?.nome || String((meta.diagnostico_digital as Record<string, unknown>)?.empresa ?? "") || "sua empresa",
        agenteId: ag?.id ?? null,
        diagnostico: (meta.diagnostico_digital ?? {}) as Record<string, unknown>,
        metadata: meta,
      });
      setFase(meta.abertura_concluida_em ? "sistema" : "diagnostico");
    })();
    return () => { vivo = false; };
  }, [userId]);

  // O mentor envia o diagnóstico logo após criar a conta — se o lead logar
  // antes, busca de novo por ~40s até o retrato chegar.
  useEffect(() => {
    if (fase !== "diagnostico" || !estado || Object.keys(estado.diagnostico).length > 0) return;
    const t = setInterval(async () => {
      tentativasRef.current += 1;
      if (tentativasRef.current > 8) { clearInterval(t); return; }
      const { data: p } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle();
      const meta = (p?.metadata ?? {}) as Record<string, unknown>;
      const diag = (meta.diagnostico_digital ?? {}) as Record<string, unknown>;
      if (Object.keys(diag).length > 0) {
        clearInterval(t);
        setEstado((e) => (e ? { ...e, diagnostico: diag, metadata: meta } : e));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [fase, estado, userId]);

  const concluirDiagnostico = async (r: RespostasDiagnostico) => {
    if (!estado) return;
    setSalvando(true);
    setErro("");
    try {
      // dor e meta viram conhecimento vivo do agente (RAG do tenant)
      const montarBloco = (titulo: string, conteudo: string) => ({
        agente_id: estado.agenteId,
        title: titulo,
        content: conteudo.slice(0, 4000),
        tipo: "empresa",
        escopo: "tenant",
        ativo: true,
      });
      const novos: ReturnType<typeof montarBloco>[] = [];
      if (r.dor) novos.push(montarBloco("Dor da empresa — contada na mentoria", r.dor));
      if (r.desejo) novos.push(montarBloco("Meta traçada — contada na mentoria", r.desejo));
      if (novos.length && estado.agenteId) {
        const { error } = await supabase.from("blocos_conhecimento").insert(novos);
        if (error) throw error;
      }
      // RELÊ metadata FRESH do banco IMEDIATAMENTE antes de escrever e faz MERGE do
      // JSONB. estado.metadata é um snapshot que pode estar velho: o poll de 8s e a
      // escrita do mentor (contrato_url / diagnostico_digital) mexem no mesmo campo
      // metadata em paralelo — gravar por cima do snapshot antigo apagaria as chaves
      // que esses processos cravaram no meio do caminho.
      const { data: pAtual } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle();
      const metaAtual = (pAtual?.metadata ?? {}) as Record<string, unknown>;
      const diagAtual = (metaAtual.diagnostico_digital ?? {}) as Record<string, unknown>;
      const metadata = {
        ...metaAtual,
        abertura_concluida_em: new Date().toISOString(),
        diagnostico_digital: { ...diagAtual, ...estado.diagnostico, dor: r.dor, desejo: r.desejo, observacoes: r.observacoes },
      };
      const { error: erroMeta } = await supabase.from("profiles").update({ metadata }).eq("id", userId);
      if (erroMeta) throw erroMeta;
      setEstado((e) => (e ? { ...e, metadata } : e));
      setFase("sistema");
    } catch (e) {
      setErro((e as Error).message || "não consegui salvar — tenta de novo");
    } finally {
      setSalvando(false);
    }
  };

  if (fase === "oculta" || !estado) return null;

  return (
    <>
      <AnimatePresence>
        {fase === "diagnostico" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}
            style={{ position: "fixed", inset: 0, zIndex: 9000, overflowY: "auto", padding: "48px 16px 64px" }}
          >
            {/* fundo = wallpaper REAL do OS (bundle.css) — sensação de nunca sair do sistema */}
            <div className="wallpaper" aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1 }} />
            <DiagnosticoDigital
              empresaNome={estado.empresaNome}
              nomeLead={estado.nomeLead}
              diagnostico={estado.diagnostico}
              salvando={salvando}
              erro={erro}
              aoConcluir={concluirDiagnostico}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {fase === "sistema" && <OfertaMentoria userId={userId} metadataInicial={estado.metadata} />}
    </>
  );
}
