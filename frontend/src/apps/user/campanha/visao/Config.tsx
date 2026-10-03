/**
 * Aba Configuração — editar metadados da campanha.
 *
 * Campos editáveis nesta entrega: nome, descrição, objetivo, início/fim, janela de
 * horário, dias da semana, throttle, dias de silêncio pra desistência.
 *
 * Público: só dá pra SOMAR contatos por planilha (ver `SecaoPlanilha`).
 *
 * NÃO editáveis aqui (ficam pro módulo expandido): tipo, filters/público,
 * duration_mode, A/B config. Mudança de tipo após criada
 * pode quebrar fases — exige migração estruturada.
 */

import { useCallback, useState } from "react";
import { CamposMensagemCampanha, mensagemValida, type EstadoMensagem } from "../wizard/campos-mensagem";
import { motion } from "framer-motion";
import { Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";

import {
  Campo,
  Linha,
  botaoPrimarioStyle,
  inputStyle,
  type Campanha as CampanhaT,
  type FiltrosCampanha,
  type SupabaseBruto,
  type ToastApi,
} from "../re-exports";
import { SubirLeadsPlanilha } from "../wizard/subir-leads-planilha";

interface Props {
  campanha: CampanhaT;
  t: ToastApi;
  onSalvou: (c: CampanhaT) => void;
}

interface EstadoForm {
  name: string;
  description: string;
  objective: string;
  window_start: string;
  window_end: string;
  weekdays: number[];
  skip_holidays: boolean;
  throttle_per_day: number | null;
  throttle_per_hour: number | null;
  desistance_silence_days: number;
  starts_at: string; // datetime-local
  ends_at: string; // datetime-local, "" = sem fim
}

/** ISO do banco → valor de `datetime-local` na hora local de quem está editando. */
function isoParaInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const DIAS = [
  { n: 0, rotulo: "Dom" },
  { n: 1, rotulo: "Seg" },
  { n: 2, rotulo: "Ter" },
  { n: 3, rotulo: "Qua" },
  { n: 4, rotulo: "Qui" },
  { n: 5, rotulo: "Sex" },
  { n: 6, rotulo: "Sáb" },
];

export function AbaConfig({ campanha, t, onSalvou }: Props) {
  const [form, setForm] = useState<EstadoForm>({
    name: campanha.name,
    description: campanha.description,
    objective: campanha.objective,
    window_start: campanha.window_start.slice(0, 5),
    window_end: campanha.window_end.slice(0, 5),
    weekdays: campanha.weekdays,
    skip_holidays: campanha.skip_holidays,
    throttle_per_day: campanha.throttle_per_day,
    throttle_per_hour: campanha.throttle_per_hour,
    desistance_silence_days: campanha.desistance_silence_days,
    starts_at: isoParaInput(campanha.starts_at),
    ends_at: isoParaInput(campanha.ends_at),
  });
  const [salvando, setSalvando] = useState(false);
  // Δ 2026-09-17: mensagem personalizada também editável depois de criada.
  const [msg, setMsg] = useState<EstadoMensagem>({
    tipo_conteudo: (campanha.tipo_conteudo ?? "texto") as EstadoMensagem["tipo_conteudo"],
    mensagem_inicial: campanha.mensagem_inicial ?? "",
    midia_url: campanha.midia_url ?? null,
  });

  const set = <K extends keyof EstadoForm>(k: K, v: EstadoForm[K]) =>
    setForm({ ...form, [k]: v });

  const alternarDia = (n: number) => {
    const novos = form.weekdays.includes(n)
      ? form.weekdays.filter((d) => d !== n)
      : [...form.weekdays, n].sort();
    set("weekdays", novos);
  };

  const salvar = useCallback(async () => {
    if (salvando) return;
    const temFim = campanha.duration_mode !== "vitalicia" && form.ends_at;
    if (temFim && new Date(form.ends_at).getTime() <= new Date(form.starts_at).getTime()) {
      t.error("“Termina em” precisa ser depois de “Começa em”.");
      return;
    }
    if (!mensagemValida(msg)) {
      t.error("Escolheu foto ou vídeo: anexe o arquivo (e o texto, no caso de vídeo).");
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("campanhas")
        .update({
          name: form.name.trim(),
          description: form.description.trim(),
          objective: form.objective.trim(),
          window_start: form.window_start,
          window_end: form.window_end,
          weekdays: form.weekdays,
          skip_holidays: form.skip_holidays,
          throttle_per_day: form.throttle_per_day,
          throttle_per_hour: form.throttle_per_hour,
          desistance_silence_days: form.desistance_silence_days,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: temFim ? new Date(form.ends_at).toISOString() : null,
          tipo_conteudo: msg.tipo_conteudo,
          mensagem_inicial: msg.mensagem_inicial.trim() || null,
          midia_url: msg.tipo_conteudo === "texto" ? null : msg.midia_url,
        })
        .eq("id", campanha.id)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("Sem retorno");
      t.success("Configuração salva");
      onSalvou(data as CampanhaT);
    } catch (e) {
      t.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }, [salvando, form, campanha.id, campanha.duration_mode, t, onSalvou]);

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}
    >
      {/* Metadados editáveis */}
      <Campo label="Nome">
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          style={inputStyle}
        />
      </Campo>

      <Campo label="Objetivo">
        <input
          type="text"
          value={form.objective}
          onChange={(e) => set("objective", e.target.value)}
          style={inputStyle}
        />
      </Campo>

      <Campo label="Descrição">
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Campo>

      {/* Período — Δ 2026-09-14: editável, senão data errada no wizard só se
          consertava apagando a campanha. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Começa em">
          <input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => set("starts_at", e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo
          label="Termina em"
          hint={campanha.duration_mode === "vitalicia" ? "Vitalícia — não usa" : "Vazio = sem fim"}
        >
          <input
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => set("ends_at", e.target.value)}
            disabled={campanha.duration_mode === "vitalicia"}
            style={{ ...inputStyle, opacity: campanha.duration_mode === "vitalicia" ? 0.4 : 1 }}
          />
        </Campo>
      </div>

      {/* Janela */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Janela início (BRT)" hint="Pode passar da meia-noite (ex.: 23:00 → 01:00).">
          <input
            type="time"
            value={form.window_start}
            onChange={(e) => set("window_start", e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo label="Janela fim (BRT)">
          <input
            type="time"
            value={form.window_end}
            onChange={(e) => set("window_end", e.target.value)}
            style={inputStyle}
          />
        </Campo>
      </div>

      {/* Dias */}
      <Campo label="Dias da semana">
        <div style={{ display: "flex", gap: 6 }}>
          {DIAS.map((d) => {
            const on = form.weekdays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => alternarDia(d.n)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: on
                    ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.35), oklch(0.65 0.22 280 / 0.25))"
                    : "oklch(0.98 0 0 / 0.04)",
                  color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.45)",
                  border: on
                    ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                    : "1px solid oklch(0.98 0 0 / 0.08)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {d.rotulo}
              </button>
            );
          })}
        </div>
      </Campo>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "oklch(0.98 0 0 / 0.75)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={form.skip_holidays}
          onChange={(e) => set("skip_holidays", e.target.checked)}
        />
        Pular feriados nacionais
      </label>

      {/* Throttle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Limite por hora" hint="Vazio = sem limite">
          <input
            type="number"
            min="1"
            value={form.throttle_per_hour ?? ""}
            onChange={(e) =>
              set("throttle_per_hour", e.target.value ? Number(e.target.value) : null)
            }
            style={inputStyle}
          />
        </Campo>
        <Campo label="Limite por dia" hint="Vazio = sem limite">
          <input
            type="number"
            min="1"
            value={form.throttle_per_day ?? ""}
            onChange={(e) =>
              set("throttle_per_day", e.target.value ? Number(e.target.value) : null)
            }
            style={inputStyle}
          />
        </Campo>
      </div>

      <Campo label="Dias sem resposta = desistência">
        <input
          type="number"
          min="1"
          max="180"
          value={form.desistance_silence_days}
          onChange={(e) => set("desistance_silence_days", Number(e.target.value))}
          style={inputStyle}
        />
      </Campo>

      <CamposMensagemCampanha ownerId={campanha.tenant_id} estado={msg} setEstado={setMsg} />

      <SecaoPlanilha campanha={campanha} t={t} onSalvou={onSalvou} />

      {/* Read-only — pra dar contexto sem permitir edição perigosa */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          padding: 14,
          background: "oklch(0.98 0 0 / 0.03)",
          border: "1px solid oklch(0.98 0 0 / 0.06)",
          borderRadius: 12,
        }}
      >
        <Linha k="Tipo" v={campanha.type} />
        <Linha k="Modo duração" v={campanha.duration_mode} />
        <Linha k="Criada em" v={formatarData(campanha.created_at)} />
      </div>

      <motion.button
        type="button"
        whileTap={tapPress}
        onClick={salvar}
        disabled={salvando}
        style={{
          ...botaoPrimarioStyle,
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          opacity: salvando ? 0.6 : 1,
          cursor: salvando ? "wait" : "pointer",
          // Afasta do brand-launcher fixo (canto inferior esquerdo) quando
          // o scroll da aba chega no fim.
          marginBottom: 76,
        }}
      >
        <Save size={14} />
        {salvando ? "Salvando…" : "Salvar"}
      </motion.button>
    </motion.div>
  );
}

/**
 * Δ 2026-09-14: subir planilha depois da campanha criada.
 *
 * Só mexe no público em dois modos, e sem trocar o modo:
 *   - `lead_ids`: os ids novos SOMAM a `filters.lead_ids` (nunca substituem);
 *   - `todos`: os contatos entram na Base, que já é o público — nada a gravar na campanha.
 * Segmento e persona ficam de fora: lead de planilha não tem as tags do
 * segmento, e subir ali daria a impressão de que eles vão receber.
 */
function SecaoPlanilha({ campanha, t, onSalvou }: Props) {
  const filtros = campanha.filters as Partial<FiltrosCampanha> & { mode?: string };
  const modo = filtros.modo ?? filtros.mode;
  const qtdLista = Array.isArray(filtros.lead_ids) ? filtros.lead_ids.length : 0;

  if (campanha.type === "cobranca" || campanha.type === "indicacao") return null;

  const somarNaLista = async (ids: string[]) => {
    if (modo !== "lead_ids") {
      t.success(`${ids.length} contatos na Base — já fazem parte do público desta campanha.`);
      return;
    }
    try {
      const sb = supabase as SupabaseBruto;
      // Relê os filtros do banco: a campanha aberta na tela pode estar velha, e
      // somar em cima dela apagaria uma planilha subida em outra aba.
      const { data: atual, error: erroLeitura } = await sb
        .from("campanhas")
        .select("filters")
        .eq("id", campanha.id)
        .single();
      if (erroLeitura || !atual) throw erroLeitura ?? new Error("Campanha não encontrada");
      const filtrosAtuais = (atual.filters ?? {}) as Partial<FiltrosCampanha>;
      const antes = filtrosAtuais.lead_ids ?? [];
      const lead_ids = Array.from(new Set([...antes, ...ids]));

      const { data, error } = await sb
        .from("campanhas")
        .update({ filters: { ...filtrosAtuais, lead_ids } })
        .eq("id", campanha.id)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("Sem retorno");
      t.success(
        `${lead_ids.length - antes.length} contatos somados à campanha (total ${lead_ids.length}).`,
      );
      onSalvou(data as CampanhaT);
    } catch (e) {
      t.error(e instanceof Error ? e.message : "Erro ao somar contatos");
    }
  };

  return (
    <Campo
      label="Contatos por planilha"
      hint={
        modo === "lead_ids"
          ? `Esta campanha tem ${qtdLista.toLocaleString("pt-BR")} contatos. A planilha soma à lista.`
          : modo === "todos"
            ? "O público é a Base inteira: os contatos da planilha entram na Base e já recebem."
            : undefined
      }
    >
      {modo === "lead_ids" || modo === "todos" ? (
        <SubirLeadsPlanilha
          ownerId={campanha.tenant_id}
          aoConcluir={(ids) => void somarNaLista(ids)}
        />
      ) : (
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
          Esta campanha usa {modo === "persona" ? "persona" : "segmento"} como público. Para
          disparar para uma planilha, crie uma campanha com o público "Planilha".
        </div>
      )}
    </Campo>
  );
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "—";
  }
}
