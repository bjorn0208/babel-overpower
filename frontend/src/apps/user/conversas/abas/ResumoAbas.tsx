/**
 * Bloco-resumo da aba Quem: o essencial das outras 4 abas do Dossiê numa
 * grade 2×2 de mini-cards clicáveis (cada card pula pra aba completa).
 * Reusa o mesmo DossieEnriquecido que a AbaQuem já busca — zero query extra.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { urlContrato } from "@/lib/url-app";
import type { AbaDossie, Conversa } from "../tipos";
import { ROTULO_ACAO } from "../tipos";
import type { DossieEnriquecido } from "../hooks/useConversasLive";

interface ResumoAbasProps {
  conversa: Conversa;
  dossie: DossieEnriquecido | null;
  onIrParaAba?: (aba: AbaDossie) => void;
  /** UUID real da conversa — destino do INSERT de retorno em acoes_agendadas. */
  conversaIdReal?: string | null;
  /** Avisa o pai que um retorno foi criado (re-fetch do dossiê). */
  onCompromissoCriado?: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatarDataCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Cartao({
  aba,
  icone,
  rotulo,
  onIrParaAba,
  children,
}: {
  aba: AbaDossie;
  icone: string;
  rotulo: string;
  onIrParaAba?: (aba: AbaDossie) => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={tapPress}
      onClick={() => onIrParaAba?.(aba)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onIrParaAba?.(aba);
      }}
      aria-label={`Abrir aba ${rotulo}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        cursor: "pointer",
        textAlign: "left",
        color: "inherit",
        minWidth: 0,
      }}
    >
      <span className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
        {icone} {rotulo}
      </span>
      {children}
    </motion.div>
  );
}

export function ResumoAbas({ conversa, dossie, onIrParaAba, conversaIdReal, onCompromissoCriado }: ResumoAbasProps) {
  // Marcar retorno direto pelo card: INSERT em acoes_agendadas (agendamento_callback) —
  // o cron processar-acompanhamentos faz o agente retomar o lead na data marcada.
  const [marcandoRetorno, setMarcandoRetorno] = useState(false);
  const [dataRetorno, setDataRetorno] = useState("");
  const [salvandoRetorno, setSalvandoRetorno] = useState(false);
  const [erroRetorno, setErroRetorno] = useState<string | null>(null);
  const convIdInsert = conversaIdReal ?? conversa.id;
  const podeMarcar = UUID_RE.test(convIdInsert);

  const salvarRetorno = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dataRetorno || salvandoRetorno) return;
    const quando = new Date(dataRetorno);
    if (Number.isNaN(quando.getTime()) || quando.getTime() <= Date.now()) {
      setErroRetorno("Escolha uma data futura.");
      return;
    }
    setSalvandoRetorno(true);
    setErroRetorno(null);
    try {
      const leadId = conversa.lead?.id;
      const { error } = await supabase.from("acoes_agendadas").insert({
        conversation_id: convIdInsert,
        lead_id: leadId && UUID_RE.test(leadId) ? leadId : null,
        action_type: "agendamento_callback",
        scheduled_at: quando.toISOString(),
        status: "pendente",
        carga: { origem: "dossie_manual", titulo: "Retorno marcado pelo painel" },
      });
      if (error) {
        setErroRetorno("Não consegui marcar. Tenta de novo.");
        return;
      }
      setMarcandoRetorno(false);
      setDataRetorno("");
      onCompromissoCriado?.();
    } finally {
      setSalvandoRetorno(false);
    }
  };

  const produto = (conversa.lead.produto ?? "").trim();
  const compromissos = dossie?.compromissos_ativos ?? [];
  const futuros = compromissos
    .map((c) => ({ titulo: String(c.titulo ?? c.tipo ?? "Compromisso"), quando: String(c.executar_em ?? "") }))
    .filter((c) => c.quando && new Date(c.quando).getTime() >= Date.now())
    .sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime());
  const proximo = futuros[0] ?? null;
  const contratos = dossie?.contratos ?? [];
  const mente = conversa.mente;
  // Link público do contrato (mesmo da AbaFinanceiro): 1º contrato com chave_publica.
  const chaveContrato = contratos
    .map((c) => (typeof c.chave_publica === "string" ? c.chave_publica : null))
    .find(Boolean);
  const linkContrato = chaveContrato ? urlContrato(chaveContrato) : null;

  const copiarLinkContrato = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!linkContrato) return;
    try {
      await navigator.clipboard.writeText(linkContrato);
    } catch {
      /* clipboard pode não estar disponível */
    }
  };

  const abrirContrato = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!linkContrato) return;
    window.open(linkContrato, "_blank", "noopener,noreferrer");
  };

  const linha = (texto: string, apagado = false) => (
    <span className="small" style={{ color: apagado ? "var(--txt-3)" : "var(--txt-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {texto}
    </span>
  );

  return (
    <section aria-label="Resumo das outras abas">
      <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        Visão geral
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Cartao aba="operacao" icone="📝" rotulo="Contrato" onIrParaAba={onIrParaAba}>
          {produto ? linha(produto) : linha("Sem produto definido", true)}
          {conversa.lead.converted_at
            ? <span className="muted tiny">cliente desde {new Date(conversa.lead.converted_at).toLocaleDateString("pt-BR")}</span>
            : <span className="muted tiny">ainda não convertido</span>}
          {linkContrato && (
            <span style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 10 }}
                onClick={abrirContrato}
                aria-label="Abrir contrato em nova aba"
              >
                📄 Contrato
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 10 }}
                onClick={copiarLinkContrato}
                aria-label="Copiar link do contrato"
              >
                🔗 Copiar
              </button>
            </span>
          )}
        </Cartao>

        <Cartao aba="compromissos" icone="📅" rotulo="Compromissos" onIrParaAba={onIrParaAba}>
          {proximo ? linha(proximo.titulo) : linha("Nenhum agendado", true)}
          <span className="muted tiny">
            {proximo ? formatarDataCurta(proximo.quando) : "—"}
            {futuros.length > 1 ? ` · +${futuros.length - 1}` : ""}
          </span>
          {podeMarcar && !marcandoRetorno && (
            <span style={{ display: "flex", marginTop: 2 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 10 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMarcandoRetorno(true);
                }}
                aria-label="Marcar nova data de retorno"
              >
                ＋ Retorno
              </button>
            </span>
          )}
          {marcandoRetorno && (
            <span
              style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="datetime-local"
                className="input"
                value={dataRetorno}
                onChange={(e) => setDataRetorno(e.target.value)}
                style={{ fontSize: 11, padding: "3px 6px" }}
                aria-label="Data e hora do retorno"
              />
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ padding: "2px 10px", fontSize: 10 }}
                  onClick={salvarRetorno}
                  disabled={salvandoRetorno || !dataRetorno}
                >
                  {salvandoRetorno ? "Marcando…" : "Marcar"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 8px", fontSize: 10 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMarcandoRetorno(false);
                    setErroRetorno(null);
                  }}
                >
                  Cancelar
                </button>
              </span>
              {erroRetorno && (
                <span style={{ fontSize: 10, color: "oklch(0.72 0.17 25)" }}>{erroRetorno}</span>
              )}
            </span>
          )}
        </Cartao>

        <Cartao aba="financeiro" icone="💰" rotulo="Financeiro" onIrParaAba={onIrParaAba}>
          {contratos.length > 0
            ? linha(`${contratos.length} contrato${contratos.length > 1 ? "s" : ""}`)
            : linha("Sem contratos", true)}
          <span className="muted tiny">
            {contratos.length > 0 ? `último: ${String(contratos[0]?.status ?? "—")}` : "—"}
          </span>
        </Cartao>

        <Cartao aba="mente" icone="🧠" rotulo="Mente" onIrParaAba={onIrParaAba}>
          {linha(ROTULO_ACAO[mente.pensamento.acao_pretendida] ?? "—")}
          <span className="muted tiny">
            pontuação {mente.score_lead} · confiança {Math.round(mente.confianca_atual * 100)}%
          </span>
        </Cartao>
      </div>
    </section>
  );
}
