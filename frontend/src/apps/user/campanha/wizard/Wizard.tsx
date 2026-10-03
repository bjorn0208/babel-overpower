/**
 * Wizard de criação de campanha — 3 passos.
 *
 * Passo 1 — Identidade (nome, tipo, objetivo, produto, descrição)
 * Passo 2 — Público (modo de seleção dos leads)
 * Passo 3 — Entrega (duração, janela, dias, throttle)
 *
 * Insert em `campanhas`. Trigger `campanhas_popular_fases` cria as fases
 * padrão automaticamente após o INSERT. Pra tipo=indicacao, faz INSERT extra
 * em `meta_indicacao_campanha` com cupom + dados do indicador (passo 1).
 */

import { useCallback, useMemo, useState } from "react";
import { CamposMensagemCampanha, estadoMensagemInicial, mensagemValida, type EstadoMensagem } from "./campos-mensagem";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";

import {
  botaoPrimarioStyle,
  botaoSecundarioStyle,
  COLUNAS_LISTAGEM,
  type Campanha as CampanhaT,
  type FiltrosCampanha,
  type ModoPublico,
  type StatusCampanha,
  type SupabaseBruto,
  type TipoCampanha,
  type ToastApi,
} from "../re-exports";
import { Step1Identidade, type EstadoStep1 } from "./Step1Identidade";
import { Step2Publico, type EstadoStep2 } from "./Step2Publico";
import { Step3Entrega, type EstadoStep3 } from "./Step3Entrega";

interface Props {
  ownerId: string;
  t: ToastApi;
  onCancelar: () => void;
  /** Recebe a campanha criada pra abrir a esteira dela (Δ 2026-09-17). */
  onCriado: (criada: CampanhaT) => void;
  /** Pré-preenche o passo 2 (Público) — usado pelo Mentor ao mandar uma lista pro agente. */
  estadoInicialPublico?: Partial<EstadoStep2>;
}

type Passo = 1 | 2 | 3;

const estadoInicial1: EstadoStep1 = {
  name: "",
  type: "divulgacao",
  objective: "",
  description: "",
  product_id: null,
  indicador_nome: "",
  indicador_email: "",
  indicador_telefone: "",
  cupom: "",
  comissao_tipo: "fixo",
  comissao_valor: 100,
};

const estadoInicial2: EstadoStep2 = {
  modo: "todos",
  operador_global: "AND",
  criterios: [],
  lead_ids: [],
  persona_descricao: "",
};

/**
 * Δ 2026-09-14: `datetime-local` espera hora LOCAL. Era `toISOString().slice(0, 16)`
 * — hora UTC — então às 21h20 de Brasília o campo abria "00:20 de amanhã". O dono
 * ajustava só os minutos e a campanha saía gravada 3h no futuro (caso Verifik,
 * "Venda as planilhas.": começa 00:11, termina 00:12).
 */
function agoraLocalParaInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const estadoInicial3: EstadoStep3 = {
  duration_mode: "vitalicia",
  starts_at: agoraLocalParaInput(),
  ends_at: null,
  window_start: "09:00",
  window_end: "20:00",
  weekdays: [1, 2, 3, 4, 5],
  skip_holidays: true,
  throttle_per_day: null,
  throttle_per_hour: null,
  desistance_silence_days: 7,
};

export function Wizard({ ownerId, t, onCancelar, onCriado, estadoInicialPublico }: Props) {
  const [passo, setPasso] = useState<Passo>(1);
  const [salvando, setSalvando] = useState(false);
  const [s1, setS1] = useState<EstadoStep1>(estadoInicial1);
  const [s2, setS2] = useState<EstadoStep2>({ ...estadoInicial2, ...estadoInicialPublico });
  const [s3, setS3] = useState<EstadoStep3>(estadoInicial3);
  // Δ 2026-09-17: mensagem personalizada (texto/foto/vídeo) do 1º contato.
  const [sm, setSm] = useState<EstadoMensagem>(estadoMensagemInicial);

  const podeAvancar = useMemo(() => {
    if (passo === 1) {
      if (!s1.name.trim() || !s1.objective.trim()) return false;
      if (s1.type === "indicacao" && (!s1.indicador_nome.trim() || !s1.cupom.trim())) return false;
      return true;
    }
    if (passo === 2) {
      if (s2.modo === "persona" && !s2.persona_descricao.trim()) return false;
      if (s2.modo === "lead_ids" && (!s2.lead_ids || s2.lead_ids.length === 0)) return false;
      return true;
    }
    if (passo === 3) return mensagemValida(sm);
    return true;
  }, [passo, s1, s2, sm]);

  const salvar = useCallback(async () => {
    if (salvando) return;
    if (
      s3.duration_mode !== "vitalicia" &&
      s3.ends_at &&
      new Date(s3.ends_at).getTime() <= new Date(s3.starts_at).getTime()
    ) {
      t.error("“Termina em” precisa ser depois de “Começa em”.");
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const filtros: FiltrosCampanha = {
        modo: s2.modo,
        operador_global: s2.operador_global,
        criterios: s2.criterios,
        lead_ids: s2.modo === "lead_ids" ? s2.lead_ids : undefined,
        persona: s2.modo === "persona" ? { descricao: s2.persona_descricao } : undefined,
      };

      const inicialStatus: StatusCampanha = "rascunho";
      const { data: criada, error } = await sb
        .from("campanhas")
        .insert({
          tenant_id: ownerId,
          name: s1.name.trim(),
          description: s1.description.trim(),
          type: s1.type,
          objective: s1.objective.trim(),
          product_id: s1.product_id,
          status: inicialStatus,
          filters: filtros,
          duration_mode: s3.duration_mode,
          starts_at: new Date(s3.starts_at).toISOString(),
          ends_at: s3.ends_at ? new Date(s3.ends_at).toISOString() : null,
          window_start: s3.window_start,
          window_end: s3.window_end,
          weekdays: s3.weekdays,
          skip_holidays: s3.skip_holidays,
          throttle_per_day: s3.throttle_per_day,
          throttle_per_hour: s3.throttle_per_hour,
          desistance_silence_days: s3.desistance_silence_days,
          tipo_conteudo: sm.tipo_conteudo,
          mensagem_inicial: sm.mensagem_inicial.trim() || null,
          midia_url: sm.tipo_conteudo === "texto" ? null : sm.midia_url,
        })
        .select(COLUNAS_LISTAGEM)
        .single();
      if (error || !criada) throw error ?? new Error("Sem retorno");

      if (s1.type === "indicacao") {
        const { error: erroMeta } = await sb.from("meta_indicacao_campanha").insert({
          campaign_id: criada.id,
          tenant_id: ownerId,
          cupom: s1.cupom.trim().toUpperCase(),
          indicador_nome: s1.indicador_nome.trim(),
          indicador_email: s1.indicador_email.trim() || null,
          indicador_telefone: s1.indicador_telefone.trim() || null,
          comissao_tipo: s1.comissao_tipo,
          comissao_valor: s1.comissao_valor,
        });
        if (erroMeta) throw erroMeta;
      }

      // Δ 2026-09-17 (Theus): terminar a criação abre a ESTEIRA da campanha, em
      // vez de voltar pra lista. Nasce em rascunho de propósito — abrir a esteira
      // não pode disparar; quem solta é o botão Ativar, lá dentro.
      t.success("Campanha criada em rascunho. Confira a esteira e ative para começar.");
      onCriado(criada as unknown as CampanhaT);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      t.error(msg);
      setSalvando(false);
    }
  }, [salvando, ownerId, s1, s2, s3, t, onCriado]);

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}
    >
      {/* Cabeçalho com steps */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <PassoBolinha n={1} ativo={passo === 1} concluido={passo > 1} rotulo="Identidade" />
          <Conector />
          <PassoBolinha n={2} ativo={passo === 2} concluido={passo > 2} rotulo="Público" />
          <Conector />
          <PassoBolinha n={3} ativo={passo === 3} concluido={false} rotulo="Entrega" />
        </div>
        <button
          type="button"
          onClick={onCancelar}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 10px",
            fontSize: 11,
            color: "oklch(0.98 0 0 / 0.55)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={12} />
          Cancelar
        </button>
      </div>

      {/* Conteúdo do passo */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {passo === 1 && (
            <Step1Identidade key="s1" ownerId={ownerId} estado={s1} setEstado={setS1} />
          )}
          {passo === 2 && <Step2Publico key="s2" ownerId={ownerId} estado={s2} setEstado={setS2} />}
          {passo === 3 && (
            <div key="s3" style={{ display: "grid", gap: 16 }}>
              <Step3Entrega estado={s3} setEstado={setS3} />
              <CamposMensagemCampanha ownerId={ownerId} estado={sm} setEstado={setSm} />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Rodapé navegação — marginBottom afasta o "Voltar" do brand-launcher
          fixo (canto inferior esquerdo, bottom:24 + 56px de altura). */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 76 }}>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={() => passo > 1 && setPasso((p) => (p - 1) as Passo)}
          disabled={passo === 1}
          style={{
            ...botaoSecundarioStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            opacity: passo === 1 ? 0.3 : 1,
            cursor: passo === 1 ? "not-allowed" : "pointer",
            transition: `opacity ${duration.fast} ${easing.outExpo}`,
          }}
        >
          <ChevronLeft size={14} />
          Voltar
        </motion.button>

        {passo < 3 ? (
          <motion.button
            type="button"
            whileTap={tapPress}
            onClick={() => podeAvancar && setPasso((p) => (p + 1) as Passo)}
            disabled={!podeAvancar}
            style={{
              ...botaoPrimarioStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              opacity: podeAvancar ? 1 : 0.4,
              cursor: podeAvancar ? "pointer" : "not-allowed",
            }}
          >
            Avançar
            <ChevronRight size={14} />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            whileTap={tapPress}
            onClick={salvar}
            disabled={salvando}
            style={{
              ...botaoPrimarioStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              opacity: salvando ? 0.6 : 1,
              cursor: salvando ? "wait" : "pointer",
            }}
          >
            <Check size={14} />
            {salvando ? "Salvando…" : "Criar e abrir a esteira"}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PassoBolinha — indicador de step no header
// ---------------------------------------------------------------------------

function PassoBolinha({
  n,
  ativo,
  concluido,
  rotulo,
}: {
  n: number;
  ativo: boolean;
  concluido: boolean;
  rotulo: string;
}) {
  const cor = concluido
    ? "oklch(0.72 0.18 145)"
    : ativo
      ? "oklch(0.7 0.18 220)"
      : "oklch(0.98 0 0 / 0.2)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: ativo || concluido ? cor : "transparent",
          border: `1.5px solid ${cor}`,
          color: ativo || concluido ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.5)",
          fontSize: 10,
          fontWeight: 700,
          display: "grid",
          placeItems: "center",
        }}
      >
        {concluido ? <Check size={11} /> : n}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: ativo ? 600 : 500,
          color: ativo ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
        }}
      >
        {rotulo}
      </span>
    </div>
  );
}

function Conector() {
  return (
    <span
      style={{
        width: 24,
        height: 1,
        background: "oklch(0.98 0 0 / 0.12)",
        margin: "0 8px",
      }}
    />
  );
}

// Tipos auxiliares re-exportados
export type { TipoCampanha, ModoPublico };
